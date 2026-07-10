"""
live_feed.py — Live Race Data Feed

Connects to the OpenF1 real-time API during race weekends and broadcasts
position, tyre, and timing data to connected WebSocket clients.

Architecture:
    OpenF1 API (polling) → LiveFeed (processing) → WebSocket clients

The feed runs as a FastAPI-owned async task. Connected clients receive JSON
updates every ~10 seconds during a live session.
"""

import asyncio
import hashlib
import json
import logging
import threading
from contextlib import suppress
from datetime import datetime, timezone

from backend.core import cache, http_client, indexer

logger = logging.getLogger(__name__)

OPENF1_BASE = "https://api.openf1.org/v1"
OPENF1_TIMEOUT_SECONDS = int(
    http_client.SOURCE_POLICIES["openf1"].read_timeout_seconds
)
OPENF1_RESPONSE_CACHE_TTL_SECONDS = 8
LIVE_STATE_CACHE_KEY = "raceday:live:latest:v1"
LIVE_STATE_CACHE_TTL_SECONDS = 30

# Connected WebSocket clients
_clients: set = set()
_clients_lock = threading.Lock()

# Current live state
_live_state: dict | None = None
_last_update_at: datetime | None = None
_last_error: str | None = None
_last_source_status = "idle"
_feed_running = False
_feed_task: asyncio.Task[None] | None = None


def add_client(ws):
    """Register a WebSocket client for live updates."""
    with _clients_lock:
        _clients.add(ws)
    logger.info("Live client connected (%d total)", len(_clients))


def remove_client(ws):
    """Unregister a WebSocket client."""
    with _clients_lock:
        _clients.discard(ws)
    logger.info("Live client disconnected (%d remaining)", len(_clients))


def get_live_state() -> dict | None:
    """Return the current live race state, or None if no session is active."""
    return _live_state


def get_live_status() -> dict:
    """Return health metadata for the live feed without fetching new data."""
    with _clients_lock:
        client_count = len(_clients)

    if _live_state:
        status = "degraded" if _last_error else "live"
        session = _live_state.get("session")
    elif _last_error:
        status = "error"
        session = None
    else:
        status = _last_source_status
        session = None

    return {
        "status": status,
        "active": _live_state is not None,
        "session": session,
        "clients": client_count,
        "last_update": _last_update_at.isoformat() if _last_update_at else None,
        "last_error": _last_error,
        "source": "OpenF1",
    }


# ---------------------------------------------------------------------------
# OpenF1 data fetching
# ---------------------------------------------------------------------------


async def _openf1_get(endpoint: str, params: dict | None = None) -> list | None:
    """Fetch data from OpenF1 API."""
    global _last_error, _last_source_status

    cache_key = _openf1_cache_key(endpoint, params)
    try:
        cached = await cache.runtime_cache.get_json(
            cache_key,
            memory_ttl_seconds=OPENF1_RESPONSE_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        cached = None
        logger.warning(
            "openf1_cache_read_failed",
            extra={"endpoint": endpoint, "error_type": type(exc).__name__},
        )
    if isinstance(cached, list):
        if _last_source_status != "error":
            _last_source_status = "cached"
        return cached

    url = f"{OPENF1_BASE}/{endpoint}"
    try:
        data = await http_client.upstream_client.request_json(
            "GET",
            url,
            source="openf1",
            operation=endpoint,
            params=params,
        )
    except http_client.UpstreamRequestError as exc:
        _last_error = exc.reason
        _last_source_status = "error"
        logger.warning(
            "openf1_request_failed",
            extra={
                "endpoint": endpoint,
                "reason": exc.reason,
                "attempts": exc.attempts,
                "status_code": exc.status_code,
            },
        )
        return None

    if isinstance(data, list):
        _last_error = None
        _last_source_status = "available"
        await _cache_openf1_response(cache_key, endpoint, data)
        return data
    if isinstance(data, dict) and "detail" in data:
        _last_error = None
        _last_source_status = "available"
        await _cache_openf1_response(cache_key, endpoint, [])
        return []

    _last_error = "invalid OpenF1 payload"
    _last_source_status = "error"
    logger.warning("openf1_invalid_payload", extra={"endpoint": endpoint})
    return None


def _openf1_cache_key(endpoint: str, params: dict | None) -> str:
    payload = json.dumps(params or {}, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]
    return f"raceday:openf1:{endpoint}:{digest}"


async def _cache_openf1_response(key: str, endpoint: str, data: list) -> None:
    try:
        await cache.runtime_cache.set_json(
            key,
            data,
            OPENF1_RESPONSE_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning(
            "openf1_cache_write_failed",
            extra={"endpoint": endpoint, "error_type": type(exc).__name__},
        )


async def _find_active_session() -> dict | None:
    """
    Check if there's a live F1 session happening right now.
    Returns session info dict or None.
    """
    sessions = await _openf1_get("sessions", {
        "year": datetime.now().year,
        "session_name": "Race",
    })
    if not sessions:
        return None

    now = datetime.now(timezone.utc)
    for session in reversed(sessions):  # most recent first
        date_start = session.get("date_start")
        date_end = session.get("date_end")
        if not date_start:
            continue

        try:
            start = datetime.fromisoformat(date_start)
            # Session is "active" if it started less than 3 hours ago
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            elapsed = (now - start).total_seconds()
            if 0 < elapsed < 3 * 3600:
                return session
        except (ValueError, TypeError):
            continue

    return None


async def _fetch_positions(session_key: int) -> list[dict]:
    """Fetch current driver positions from OpenF1."""
    data = await _openf1_get("position", {"session_key": session_key})
    if not data:
        return []

    # Get the latest position for each driver
    latest: dict[int, dict] = {}
    for entry in data:
        driver_num = entry.get("driver_number")
        if driver_num is not None:
            latest[driver_num] = entry

    return sorted(latest.values(), key=lambda x: x.get("position", 99))


async def _fetch_stints(session_key: int) -> dict[int, dict]:
    """Fetch current stint info (compound, stint number, age) per driver."""
    data = await _openf1_get("stints", {"session_key": session_key})
    if not data:
        return {}

    # Latest stint per driver
    latest: dict[int, dict] = {}
    for entry in data:
        driver_num = entry.get("driver_number")
        if driver_num is not None:
            existing = latest.get(driver_num)
            if not existing or entry.get("stint_number", 0) >= existing.get("stint_number", 0):
                latest[driver_num] = entry

    return latest


async def _fetch_drivers(session_key: int) -> dict[int, dict]:
    """Fetch driver info (name, team, etc.) keyed by driver number."""
    data = await _openf1_get("drivers", {"session_key": session_key})
    if not data:
        return {}

    drivers = {}
    for d in data:
        num = d.get("driver_number")
        if num is not None:
            drivers[num] = {
                "code": d.get("name_acronym", "???"),
                "name": d.get("full_name", "Unknown"),
                "team": d.get("team_name", "Unknown"),
                "team_colour": d.get("team_colour", "666666"),
            }
    return drivers


async def _fetch_lap_count(session_key: int) -> dict:
    """Fetch current lap and total laps."""
    data = await _openf1_get("lap_count", {"session_key": session_key})
    if not data:
        return {"current": 0, "total": 0}

    latest = data[-1] if data else {}
    return {
        "current": latest.get("current_lap", 0),
        "total": latest.get("total_laps", 0),
    }


# ---------------------------------------------------------------------------
# Live feed processing
# ---------------------------------------------------------------------------


def _generate_pit_predictions(
    drivers: list[dict],
    current_lap: int,
    total_laps: int,
) -> tuple[list[dict], dict[str, str]]:
    """
    Generate pit stop predictions for each driver based on current stint.

    Uses compound-specific expected stint lengths and the remaining race
    distance to predict when each driver will likely pit.

    Returns:
        predictions — list of {driver, prediction, confidence} for top drivers
        pit_windows — dict of {driver_code: "Lap X-Y"} for the driver list
    """
    # Expected stint lengths per compound (laps before performance cliff)
    COMPOUND_MAX_STINT: dict[str, int] = {
        "SOFT": 18,
        "MEDIUM": 28,
        "HARD": 40,
        "INTERMEDIATE": 25,
        "WET": 30,
        "UNKNOWN": 25,
    }

    # Target compound for next stop (typical strategy)
    NEXT_COMPOUND: dict[str, str] = {
        "SOFT": "Hard",
        "MEDIUM": "Hard",
        "HARD": "Medium",      # already on hard = unlikely to stop, but if forced
        "INTERMEDIATE": "Soft",  # drying track
        "WET": "Intermediate",
    }

    predictions = []
    pit_windows: dict[str, str] = {}

    for d in drivers:
        compound = d.get("compound", "UNKNOWN")
        stint_age = d.get("stintAge", 0)
        position = d.get("position", 99)
        code = d.get("code", "???")

        max_stint = COMPOUND_MAX_STINT.get(compound, 25)
        remaining_race = total_laps - current_lap

        # How many laps left in this stint before the cliff?
        laps_to_cliff = max(0, max_stint - stint_age)

        # Can they make it to the end without stopping?
        can_finish = stint_age + remaining_race <= max_stint + 5  # 5 lap buffer

        if can_finish or compound == "HARD" and remaining_race < 15:
            # No stop predicted
            pit_windows[code] = None
            if position <= 5:
                predictions.append({
                    "driver": code,
                    "prediction": "No more stops expected",
                    "confidence": "medium" if remaining_race < 10 else "low",
                })
        else:
            # Predict pit window
            earliest_pit = current_lap + max(1, laps_to_cliff - 3)
            latest_pit = current_lap + laps_to_cliff + 3

            # Clamp to race distance
            earliest_pit = min(earliest_pit, total_laps - 2)
            latest_pit = min(latest_pit, total_laps - 1)

            window_str = f"Lap {earliest_pit}-{latest_pit}"
            pit_windows[code] = window_str

            next_compound = NEXT_COMPOUND.get(compound, "Hard")

            # Confidence based on how close to the cliff
            if laps_to_cliff <= 3:
                confidence = "high"
            elif laps_to_cliff <= 8:
                confidence = "medium"
            else:
                confidence = "low"

            if position <= 8:
                predictions.append({
                    "driver": code,
                    "prediction": f"Pit L{earliest_pit}-{latest_pit} for {next_compound}",
                    "confidence": confidence,
                })

    # Sort predictions: high confidence first, then by position
    conf_order = {"high": 0, "medium": 1, "low": 2}
    predictions.sort(key=lambda p: (conf_order.get(p["confidence"], 3), p["driver"]))

    return predictions[:6], pit_windows


def _generate_what_if(
    drivers: list[dict],
    current_lap: int,
    total_laps: int,
) -> list[dict]:
    """
    Generate "What If X pits NOW" scenarios for the top 5 drivers.

    Estimates the position a driver would rejoin at after a pit stop,
    based on the typical time lost (~22 seconds) and the gaps between
    drivers. Also estimates what happens if they stay out to the end.

    Returns a list of what-if dicts for the extension UI.
    """
    PIT_LOSS_SECONDS = 22.0
    remaining_laps = total_laps - current_lap

    if remaining_laps < 3:
        return []  # too late to pit, no what-if needed

    what_ifs = []

    # Only top 5 drivers
    top_drivers = [d for d in drivers if d.get("position", 99) <= 5]
    top_drivers.sort(key=lambda d: d.get("position", 99))

    # Gap between positions increases further down the field
    # P1-P5: ~2-4s between each, P5-P10: ~3-6s, P10+: ~5-10s
    def gap_for_positions(pos: int, num_places: int) -> float:
        """Estimate total time gap for dropping num_places from position pos."""
        total = 0.0
        for i in range(num_places):
            p = pos + i
            if p <= 3:
                total += 2.5
            elif p <= 8:
                total += 4.0
            else:
                total += 6.0
        return total

    for d in top_drivers:
        code = d.get("code", "???")
        position = d.get("position", 99)
        compound = d.get("compound", "UNKNOWN")
        stint_age = d.get("stintAge", 0)

        # How many positions lost from pit stop?
        # Find how many positions 22 seconds covers from current position
        positions_lost = 0
        gap_sum = 0.0
        while gap_sum < PIT_LOSS_SECONDS and positions_lost < len(drivers) - position:
            positions_lost += 1
            p = position + positions_lost
            gap_sum += 2.5 if p <= 3 else 4.0 if p <= 8 else 6.0

        pit_now_position = min(len(drivers), position + positions_lost)

        # Recovery on fresh tyres: ~0.4s/lap advantage, but only ~50% converts to overtakes
        # (dirty air, DRS dependency, track position advantage)
        effective_recovery_per_lap = 0.2  # seconds/lap that actually converts to positions
        recovery_total = effective_recovery_per_lap * remaining_laps
        positions_recovered = 0
        recover_sum = 0.0
        check_pos = pit_now_position
        while recover_sum < recovery_total and check_pos > position:
            recover_sum += 2.5 if check_pos <= 3 else 4.0 if check_pos <= 8 else 6.0
            if recover_sum <= recovery_total:
                positions_recovered += 1
                check_pos -= 1

        final_if_pit = max(1, pit_now_position - positions_recovered)

        # What if they stay out?
        COMPOUND_MAX = {"SOFT": 18, "MEDIUM": 28, "HARD": 40, "INTERMEDIATE": 25, "WET": 30}
        max_stint = COMPOUND_MAX.get(compound, 25)
        laps_past_cliff = max(0, (stint_age + remaining_laps) - max_stint)

        if laps_past_cliff > 0:
            # Cliff penalty: 0.4s/lap once past optimal stint, converts to position loss
            cliff_total = laps_past_cliff * 0.4
            positions_lost_staying = 0
            cliff_sum = 0.0
            for i in range(20):
                p = position + i + 1
                cliff_sum += 2.5 if p <= 3 else 4.0 if p <= 8 else 6.0
                if cliff_sum <= cliff_total:
                    positions_lost_staying += 1
                else:
                    break
            final_if_stay = min(len(drivers), position + positions_lost_staying)
        else:
            final_if_stay = position

        # Build what-if text
        if final_if_pit < final_if_stay:
            recommendation = "pit"
            pit_text = f"Pit NOW -> P{final_if_pit}"
            stay_text = f"Stay out -> P{final_if_stay}"
        elif final_if_pit > final_if_stay:
            recommendation = "stay"
            pit_text = f"Pit NOW -> P{final_if_pit}"
            stay_text = f"Stay out -> P{final_if_stay}"
        else:
            recommendation = "neutral"
            pit_text = f"Pit NOW -> P{final_if_pit}"
            stay_text = f"Stay out -> P{final_if_stay}"

        what_ifs.append({
            "driver": code,
            "position": position,
            "pitNow": f"P{final_if_pit}",
            "stayOut": f"P{final_if_stay}",
            "recommendation": recommendation,
            "summary": f"{code}: {pit_text} | {stay_text}",
        })

    return what_ifs


def _generate_pattern_alerts(
    session: dict,
    current_lap: int,
    total_laps: int,
    drivers: list[dict],
) -> list[dict]:
    """
    Generate historical pattern alerts relevant to the current race.

    Queries the pattern matcher with the circuit and conditions to surface
    facts like "Last 3 times it rained here, the leader changed after lap 30."

    Returns a list of {text, type} alert dicts.
    """
    alerts: list[dict] = []

    location = session.get("location", "")
    country = session.get("country_name", "")
    circuit_name = location or country

    if not circuit_name:
        return alerts

    # Map OpenF1 location names to Raceday GP name keywords
    LOCATION_TO_KEYWORD = {
        "silverstone": "british", "melbourne": "australian", "monaco": "monaco",
        "sakhir": "bahrain", "jeddah": "saudi", "baku": "azerbaijan",
        "miami": "miami", "imola": "emilia", "barcelona": "spanish",
        "spielberg": "austrian", "budapest": "hungarian", "spa-francorchamps": "belgian",
        "zandvoort": "dutch", "monza": "italian", "marina bay": "singapore",
        "suzuka": "japanese", "lusail": "qatar", "austin": "united states",
        "mexico city": "mexico", "interlagos": "paulo", "las vegas": "las vegas",
        "yas island": "abu dhabi", "shanghai": "chinese", "montreal": "canadian",
    }
    search_keyword = LOCATION_TO_KEYWORD.get(circuit_name.lower(), circuit_name.lower())

    try:
        # Find historical races at this circuit
        all_indexed = indexer.list_indexed()
        circuit_races = []
        for race in all_indexed:
            track_lower = race.get("track", "").lower()
            if search_keyword in track_lower:
                circuit_races.append(race)

        if len(circuit_races) < 3:
            return alerts

        # Analyze patterns from historical races at this circuit
        leader_code = None
        for d in drivers:
            if d.get("position") == 1:
                leader_code = d.get("code")
                break

        # Pattern: How often does the leader at this point win?
        winners_from_lead = 0
        total_checked = 0
        for race in circuit_races[-6:]:  # last 6 races at this circuit
            data = indexer.load_race_index(race["year"], race["track"])
            if data is None:
                continue
            results = data["results"]
            winner = None
            for r in results:
                if r.get("finish_position") == 1:
                    winner = r["driver"]
                    break
            if winner:
                total_checked += 1
                # Approximate: if the winner also had the best grid, they likely led mid-race
                for r in results:
                    if r["driver"] == winner and r.get("grid_position") == 1:
                        winners_from_lead += 1
                        break

        if total_checked >= 3 and winners_from_lead >= total_checked * 0.6:
            pct = round(100 * winners_from_lead / total_checked)
            alerts.append({
                "text": f"At {circuit_name}, the pole sitter won {winners_from_lead} of the last {total_checked} races ({pct}%).",
                "type": "info",
            })

        # Pattern: How often are there many retirements here?
        high_dnf_count = 0
        for race in circuit_races[-6:]:
            data = indexer.load_race_index(race["year"], race["track"])
            if data is None:
                continue
            results = data["results"]
            dnfs = sum(1 for r in results if r.get("finish_position") is None)
            if dnfs >= 4:
                high_dnf_count += 1

        if high_dnf_count >= 2:
            alerts.append({
                "text": f"{circuit_name} is tough on cars — {high_dnf_count} of the last {min(6, len(circuit_races))} races had 4+ retirements.",
                "type": "warning",
            })

        # Pattern: Tyre cliff alert for current leader
        if leader_code and current_lap > total_laps * 0.5:
            for d in drivers:
                if d.get("code") == leader_code:
                    compound = d.get("compound", "")
                    stint_age = d.get("stintAge", 0)
                    COMPOUND_MAX = {"SOFT": 18, "MEDIUM": 28, "HARD": 40}
                    max_life = COMPOUND_MAX.get(compound, 25)
                    laps_left = max_life - stint_age
                    if 0 < laps_left <= 8:
                        alerts.append({
                            "text": f"{leader_code}'s {compound} tyres at {d.get('tyreLife', '?')}% life — cliff expected in ~{laps_left} laps.",
                            "type": "warning",
                        })
                    break

    except Exception as exc:
        logger.warning("Pattern alert generation failed: %s", exc)

    return alerts[:4]  # max 4 alerts


async def _build_live_state(session: dict) -> dict | None:
    """Build a complete live state snapshot from OpenF1 data."""
    global _last_error, _last_source_status

    session_key = session.get("session_key")
    if not session_key:
        return None

    # Fetch independent OpenF1 resources concurrently.
    drivers_info, positions, stints, lap_count = await asyncio.gather(
        _fetch_drivers(session_key),
        _fetch_positions(session_key),
        _fetch_stints(session_key),
        _fetch_lap_count(session_key),
    )

    if not positions:
        _last_error = "OpenF1 position data unavailable"
        _last_source_status = "error"
        return None

    missing_resources = []
    if not drivers_info:
        missing_resources.append("drivers")
    if not stints:
        missing_resources.append("stints")
    if not lap_count.get("current"):
        missing_resources.append("lap count")

    if missing_resources:
        _last_error = f"Partial OpenF1 data: {', '.join(missing_resources)}"
        _last_source_status = "degraded"
    else:
        _last_error = None
        _last_source_status = "available"

    # Build driver list
    drivers = []
    leader_num = None
    for pos_entry in positions[:20]:  # top 20
        driver_num = pos_entry.get("driver_number")
        info = drivers_info.get(driver_num, {})
        stint = stints.get(driver_num, {})

        compound = stint.get("compound", "UNKNOWN")
        stint_age = stint.get("lap_end", 0) - stint.get("lap_start", 0) + 1 if stint.get("lap_start") else 0

        # Estimate tyre life (rough: 100% at age 0, decreasing)
        max_stint = {"SOFT": 20, "MEDIUM": 30, "HARD": 40, "INTERMEDIATE": 25, "WET": 30}
        expected_life = max_stint.get(compound, 30)
        tyre_life = max(0, min(100, int(100 * (1 - stint_age / expected_life))))

        position = pos_entry.get("position", 99)
        if position == 1:
            leader_num = driver_num

        drivers.append({
            "code": info.get("code", f"#{driver_num}"),
            "name": info.get("name", "Unknown"),
            "team": info.get("team", "Unknown"),
            "teamColour": f"#{info.get('team_colour', '666666')}",
            "position": position,
            "gap": "LEADER" if position == 1 else "",
            "compound": compound,
            "stintAge": stint_age,
            "pitWindow": None,  # filled by prediction engine (Step 34)
            "tyreLife": tyre_life,
        })

    # Session name
    location = session.get("location", "")
    country = session.get("country_name", "")
    year = session.get("year", datetime.now().year)
    session_name = f"{year} {location or country} Grand Prix"

    # Generate pit predictions, what-if scenarios, and pattern alerts
    current_lap = lap_count["current"]
    total_laps = lap_count["total"]
    predictions, pit_windows = _generate_pit_predictions(drivers, current_lap, total_laps)
    what_ifs = _generate_what_if(drivers, current_lap, total_laps)
    alerts = _generate_pattern_alerts(session, current_lap, total_laps, drivers)

    # Apply pit windows to driver list
    for d in drivers:
        d["pitWindow"] = pit_windows.get(d["code"])

    return {
        "lap": current_lap,
        "totalLaps": total_laps,
        "session": session_name,
        "sessionKey": session_key,
        "drivers": drivers,
        "predictions": predictions,
        "whatIf": what_ifs,
        "alerts": alerts,
    }


# ---------------------------------------------------------------------------
# Feed loop
# ---------------------------------------------------------------------------


async def _feed_loop():
    """Main polling loop — checks for active session, fetches data, broadcasts."""
    global _live_state, _feed_running, _last_error, _last_source_status, _last_update_at

    logger.info("Live feed started — polling for active sessions")

    try:
        while _feed_running:
            try:
                session = await _find_active_session()

                if session:
                    state = await _build_live_state(session)
                    if state:
                        await _publish_live_state(state)
                        await asyncio.sleep(10)
                        continue

                source_available = await _handle_missing_session()
                await asyncio.sleep(60 if source_available else 30)

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                _last_error = str(exc)
                _last_source_status = "error"
                logger.exception("live_feed_loop_failed")
                await asyncio.sleep(30)
    finally:
        _feed_running = False


async def _publish_live_state(state: dict) -> None:
    """Timestamp, cache, and broadcast one fresh live snapshot."""
    global _live_state, _last_update_at, _last_source_status

    captured_at = datetime.now(timezone.utc)
    published_state = {**state, "capturedAt": captured_at.isoformat()}
    _live_state = published_state
    _last_update_at = captured_at
    _last_source_status = "degraded" if _last_error else "live"
    try:
        await cache.runtime_cache.set_json(
            LIVE_STATE_CACHE_KEY,
            {"active": True, **published_state},
            LIVE_STATE_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning(
            "live_state_cache_write_failed",
            extra={"error_type": type(exc).__name__},
        )
    await _broadcast(published_state)


async def _restore_cached_live_state() -> None:
    """Restore a very recent live snapshot after a process restart."""
    global _live_state, _last_update_at, _last_error, _last_source_status

    if _live_state is not None:
        return
    try:
        cached = await cache.runtime_cache.get_json(
            LIVE_STATE_CACHE_KEY,
            memory_ttl_seconds=LIVE_STATE_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning(
            "live_state_cache_read_failed",
            extra={"error_type": type(exc).__name__},
        )
        return
    if not isinstance(cached, dict) or cached.get("active") is not True:
        return

    restored = {key: value for key, value in cached.items() if key != "active"}
    captured_at = restored.get("capturedAt")
    try:
        parsed_at = datetime.fromisoformat(str(captured_at))
    except (TypeError, ValueError):
        return
    if parsed_at.tzinfo is None:
        parsed_at = parsed_at.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - parsed_at).total_seconds()
    if age_seconds < -5 or age_seconds > LIVE_STATE_CACHE_TTL_SECONDS:
        return

    _live_state = restored
    _last_update_at = parsed_at
    _last_error = "Using a recent cached live snapshot while OpenF1 reconnects"
    _last_source_status = "cached"


async def _publish_no_live_session():
    """Clear a finished session and notify clients without masking source errors."""
    global _live_state
    was_active = _live_state is not None
    _live_state = None
    try:
        await cache.runtime_cache.delete(LIVE_STATE_CACHE_KEY)
    except Exception as exc:
        logger.warning(
            "live_state_cache_delete_failed",
            extra={"error_type": type(exc).__name__},
        )
    if was_active:
        await _broadcast({"active": False, "session": None})


async def _handle_missing_session() -> bool:
    """Distinguish a real idle period from an upstream outage."""
    global _last_source_status
    if _last_source_status == "error":
        return False

    await _publish_no_live_session()
    _last_source_status = "idle"
    return True


async def _broadcast(state: dict):
    """Send state to all connected WebSocket clients."""
    with _clients_lock:
        clients = list(_clients)

    if not clients:
        return

    results = await asyncio.gather(
        *(client.send_json(state) for client in clients),
        return_exceptions=True,
    )
    dead_clients = [
        client
        for client, result in zip(clients, results)
        if isinstance(result, BaseException)
    ]

    if dead_clients:
        with _clients_lock:
            for client in dead_clients:
                _clients.discard(client)


async def start_feed():
    """Start the live feed as one FastAPI-owned task."""
    global _feed_running, _feed_task
    if _feed_task is not None and not _feed_task.done():
        return

    await _restore_cached_live_state()
    _feed_running = True
    _feed_task = asyncio.create_task(_feed_loop(), name="live-feed")
    logger.info("Live feed task launched")


async def stop_feed():
    """Cancel and await the live feed task."""
    global _feed_running, _feed_task
    _feed_running = False
    task = _feed_task
    _feed_task = None
    if task is None:
        return

    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
