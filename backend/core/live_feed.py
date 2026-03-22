"""
live_feed.py — Live Race Data Feed

Connects to the OpenF1 real-time API during race weekends and broadcasts
position, tyre, and timing data to connected WebSocket clients.

Architecture:
    OpenF1 API (polling) → LiveFeed (processing) → WebSocket clients

The feed runs in its own thread. Connected clients receive JSON updates
every ~10 seconds during a live session.
"""

import asyncio
import json
import logging
import threading
import time
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

OPENF1_BASE = "https://api.openf1.org/v1"

# Connected WebSocket clients
_clients: set = set()
_clients_lock = threading.Lock()

# Current live state
_live_state: dict | None = None
_feed_running = False


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


# ---------------------------------------------------------------------------
# OpenF1 data fetching
# ---------------------------------------------------------------------------


def _openf1_get(endpoint: str, params: dict | None = None) -> list | None:
    """Fetch data from OpenF1 API."""
    try:
        resp = requests.get(
            f"{OPENF1_BASE}/{endpoint}",
            params=params,
            timeout=10,
            headers={"User-Agent": "Raceday/1.0"},
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "detail" in data:
                return []
        return None
    except requests.RequestException as exc:
        logger.warning("OpenF1 request failed: %s", exc)
        return None


def _find_active_session() -> dict | None:
    """
    Check if there's a live F1 session happening right now.
    Returns session info dict or None.
    """
    sessions = _openf1_get("sessions", {
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


def _fetch_positions(session_key: int) -> list[dict]:
    """Fetch current driver positions from OpenF1."""
    data = _openf1_get("position", {"session_key": session_key})
    if not data:
        return []

    # Get the latest position for each driver
    latest: dict[int, dict] = {}
    for entry in data:
        driver_num = entry.get("driver_number")
        if driver_num is not None:
            latest[driver_num] = entry

    return sorted(latest.values(), key=lambda x: x.get("position", 99))


def _fetch_stints(session_key: int) -> dict[int, dict]:
    """Fetch current stint info (compound, stint number, age) per driver."""
    data = _openf1_get("stints", {"session_key": session_key})
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


def _fetch_drivers(session_key: int) -> dict[int, dict]:
    """Fetch driver info (name, team, etc.) keyed by driver number."""
    data = _openf1_get("drivers", {"session_key": session_key})
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


def _fetch_lap_count(session_key: int) -> dict:
    """Fetch current lap and total laps."""
    data = _openf1_get("lap_count", {"session_key": session_key})
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


def _build_live_state(session: dict) -> dict | None:
    """Build a complete live state snapshot from OpenF1 data."""
    session_key = session.get("session_key")
    if not session_key:
        return None

    # Fetch all data
    drivers_info = _fetch_drivers(session_key)
    positions = _fetch_positions(session_key)
    stints = _fetch_stints(session_key)
    lap_count = _fetch_lap_count(session_key)

    if not positions:
        return None

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

    # Generate pit predictions and tyre alerts
    current_lap = lap_count["current"]
    total_laps = lap_count["total"]
    predictions, pit_windows = _generate_pit_predictions(drivers, current_lap, total_laps)

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
        "alerts": [],  # filled by pattern matcher (Step 36)
    }


# ---------------------------------------------------------------------------
# Feed loop
# ---------------------------------------------------------------------------


def _feed_loop():
    """Main polling loop — checks for active session, fetches data, broadcasts."""
    global _live_state, _feed_running
    _feed_running = True

    logger.info("Live feed started — polling for active sessions")

    while _feed_running:
        try:
            session = _find_active_session()

            if session:
                state = _build_live_state(session)
                if state:
                    _live_state = state
                    _broadcast(state)
                    time.sleep(10)  # Update every 10 seconds during live session
                    continue

            # No active session
            _live_state = None
            time.sleep(60)  # Check every minute when idle

        except Exception as exc:
            logger.error("Live feed error: %s", exc)
            time.sleep(30)


def _broadcast(state: dict):
    """Send state to all connected WebSocket clients."""
    message = json.dumps(state)
    with _clients_lock:
        dead_clients = []
        for client in _clients:
            try:
                # asyncio.run_coroutine_threadsafe for async ws.send
                asyncio.run(client.send_text(message))
            except Exception:
                dead_clients.append(client)

        for client in dead_clients:
            _clients.discard(client)


def start_feed():
    """Start the live feed in a background thread."""
    thread = threading.Thread(target=_feed_loop, daemon=True, name="live-feed")
    thread.start()
    logger.info("Live feed thread launched")


def stop_feed():
    """Stop the live feed."""
    global _feed_running
    _feed_running = False
