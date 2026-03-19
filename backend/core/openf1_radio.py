"""
openf1_radio.py — OpenF1 Team Radio Fetcher

Fetches team radio audio clips from the OpenF1 API for races 2023+.
Maps Raceday track names to OpenF1 session keys, retrieves radio
recordings, and resolves driver numbers to names/codes.

API base: https://api.openf1.org/v1/
No authentication required.
"""

import logging
import time
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

_BASE = "https://api.openf1.org/v1"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Raceday/1.0 (F1 fan intelligence platform)"})


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------


def _get(endpoint: str, params: dict | None = None, retries: int = 3) -> list | None:
    """
    GET an OpenF1 endpoint and return parsed JSON list, or None on failure.
    Retries up to `retries` times with increasing backoff.
    """
    url = f"{_BASE}/{endpoint}"
    for attempt in range(retries):
        try:
            resp = _SESSION.get(url, params=params, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                # OpenF1 returns {"detail": "..."} on no results
                if isinstance(data, dict) and "detail" in data:
                    return []
                return data
            logger.warning("OpenF1 %s returned %s", url, resp.status_code)
        except requests.RequestException as exc:
            logger.warning("OpenF1 request failed (%s): %s", attempt + 1, exc)
        if attempt < retries - 1:
            time.sleep(1 * (attempt + 1))
    return None


# ---------------------------------------------------------------------------
# GP name → OpenF1 location mapping
# ---------------------------------------------------------------------------

# Maps keywords from Raceday GP names to OpenF1 location or circuit_short_name.
# OpenF1 uses location/circuit_short_name, not the full GP title.
_GP_TO_LOCATION = {
    "bahrain": "Sakhir",
    "saudi arabian": "Jeddah",
    "saudi arabia": "Jeddah",
    "australian": "Melbourne",
    "azerbaijan": "Baku",
    "miami": "Miami",
    "emilia romagna": "Imola",
    "monaco": "Monaco",
    "spanish": "Barcelona",
    "canadian": "Montréal",
    "austrian": "Spielberg",
    "british": "Silverstone",
    "hungarian": "Budapest",
    "belgian": "Spa-Francorchamps",
    "dutch": "Zandvoort",
    "italian": "Monza",
    "singapore": "Marina Bay",
    "japanese": "Suzuka",
    "qatar": "Lusail",
    "united states": "Austin",
    "mexico city": "Mexico City",
    "mexican": "Mexico City",
    "são paulo": "São Paulo",
    "sao paulo": "São Paulo",
    "brazilian": "São Paulo",
    "las vegas": "Las Vegas",
    "abu dhabi": "Yas Island",
    "chinese": "Shanghai",
    "portugal": "Portimão",
    "portuguese": "Portimão",
    "turkish": "Istanbul",
    "styrian": "Spielberg",
    "eifel": "Nürburg",
    "tuscan": "Mugello",
    "sakhir": "Sakhir",
    "70th anniversary": "Silverstone",
}


def _match_gp_to_session(track: str, sessions: list[dict]) -> dict | None:
    """
    Match a Raceday GP name (e.g. "British Grand Prix") to an OpenF1 session
    from the sessions list.
    """
    track_lower = track.lower().replace(" grand prix", "").strip()

    # Try location mapping first
    location = _GP_TO_LOCATION.get(track_lower)
    if location:
        for s in sessions:
            if s.get("location", "").lower() == location.lower():
                return s
            if s.get("circuit_short_name", "").lower() == location.lower():
                return s

    # Fallback: fuzzy match on country_name or location
    for s in sessions:
        country = s.get("country_name", "").lower()
        loc = s.get("location", "").lower()
        circuit = s.get("circuit_short_name", "").lower()
        if track_lower in country or track_lower in loc or track_lower in circuit:
            return s
        # Try the other direction
        if country in track_lower or loc in track_lower:
            return s

    logger.warning("Could not match '%s' to any OpenF1 session", track)
    return None


# ---------------------------------------------------------------------------
# Session key lookup
# ---------------------------------------------------------------------------

# Cache: (year,) → list of race sessions
_session_cache: dict[int, list[dict]] = {}


def _get_race_sessions(year: int) -> list[dict]:
    """Fetch all Race sessions for a given year, with caching."""
    if year in _session_cache:
        return _session_cache[year]

    data = _get("sessions", {"year": year, "session_name": "Race"})
    if data is None:
        return []
    _session_cache[year] = data
    return data


def get_session_key(year: int, track: str) -> int | None:
    """
    Resolve (year, track) to an OpenF1 session_key.
    Returns None if the race can't be found or year < 2023.
    """
    if year < 2023:
        return None

    sessions = _get_race_sessions(year)
    if not sessions:
        return None

    match = _match_gp_to_session(track, sessions)
    if match:
        return match["session_key"]
    return None


# ---------------------------------------------------------------------------
# Driver mapping
# ---------------------------------------------------------------------------

# Cache: session_key → {driver_number: {name_acronym, full_name, team_name, ...}}
_driver_cache: dict[int, dict[int, dict]] = {}


def _get_drivers(session_key: int) -> dict[int, dict]:
    """Fetch driver info for a session, keyed by driver_number."""
    if session_key in _driver_cache:
        return _driver_cache[session_key]

    data = _get("drivers", {"session_key": session_key})
    if data is None:
        return {}

    drivers = {}
    for d in data:
        num = d.get("driver_number")
        if num is not None:
            drivers[num] = {
                "code": d.get("name_acronym", "???"),
                "full_name": d.get("full_name", "Unknown"),
                "first_name": d.get("first_name", ""),
                "last_name": d.get("last_name", ""),
                "team": d.get("team_name", "Unknown"),
                "team_colour": d.get("team_colour", "666666"),
                "number": num,
            }

    _driver_cache[session_key] = drivers
    return drivers


# ---------------------------------------------------------------------------
# Team radio fetcher
# ---------------------------------------------------------------------------


def get_team_radio(year: int, track: str) -> list[dict] | None:
    """
    Fetch all team radio clips for a race.

    Returns a list of dicts:
        driver_code   — "VER", "HAM", etc.
        driver_name   — "Max Verstappen"
        team          — "Red Bull Racing"
        date          — ISO datetime string
        recording_url — direct MP3 link
        lap           — estimated lap number (from race start time)

    Returns None if the race isn't found or year < 2023.
    """
    session_key = get_session_key(year, track)
    if session_key is None:
        return None

    # Get the session info for race start time
    sessions = _get_race_sessions(year)
    session_info = None
    for s in sessions:
        if s["session_key"] == session_key:
            session_info = s
            break

    race_start = None
    if session_info and session_info.get("date_start"):
        try:
            race_start = datetime.fromisoformat(session_info["date_start"])
        except (ValueError, TypeError):
            pass

    # Fetch radio clips
    radio_data = _get("team_radio", {"session_key": session_key})
    if radio_data is None:
        return None

    # Fetch driver mapping
    drivers = _get_drivers(session_key)

    clips = []
    for r in radio_data:
        driver_num = r.get("driver_number")
        driver_info = drivers.get(driver_num, {})

        clip_date = r.get("date", "")

        # Estimate lap from time elapsed (rough: ~90s per lap avg)
        lap = None
        if race_start and clip_date:
            try:
                clip_time = datetime.fromisoformat(clip_date)
                elapsed = (clip_time - race_start).total_seconds()
                if elapsed > 0:
                    lap = max(1, int(elapsed / 90) + 1)
            except (ValueError, TypeError):
                pass

        clips.append({
            "driver_code": driver_info.get("code", "???"),
            "driver_name": driver_info.get("full_name", "Unknown"),
            "team": driver_info.get("team", "Unknown"),
            "team_colour": driver_info.get("team_colour", "666666"),
            "date": clip_date,
            "recording_url": r.get("recording_url", ""),
            "lap": lap,
        })

    # Sort by date
    clips.sort(key=lambda c: c["date"])

    logger.info(
        "Fetched %d radio clips for %s %s (session_key=%s)",
        len(clips), year, track, session_key,
    )
    return clips


# ---------------------------------------------------------------------------
# __main__ test block
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("=== 2023 British Grand Prix Radio ===")
    clips = get_team_radio(2023, "British Grand Prix")
    if clips:
        print(f"Total clips: {len(clips)}")
        print(f"\nFirst 5 clips:")
        for c in clips[:5]:
            lap = f"~{c['lap']:>2}" if c['lap'] else "pre"
            print(f"  {lap}: {c['driver_code']} ({c['driver_name']}) — {c['recording_url'][-40:]}")
        print(f"\nLast 3 clips:")
        for c in clips[-3:]:
            lap = f"~{c['lap']:>2}" if c['lap'] else "pre"
            print(f"  {lap}: {c['driver_code']} ({c['driver_name']}) — {c['recording_url'][-40:]}")

        # Count per driver
        from collections import Counter
        counts = Counter(c["driver_code"] for c in clips)
        print(f"\nClips per driver: {dict(counts.most_common(5))}")
    else:
        print("No clips found!")

    print("\n=== 2022 (pre-2023, should be None) ===")
    old = get_team_radio(2022, "British Grand Prix")
    print(f"Result: {old}")

    print("\n=== Session key lookup ===")
    print(f"2024 Abu Dhabi GP: {get_session_key(2024, 'Abu Dhabi Grand Prix')}")
    print(f"2023 Monaco GP: {get_session_key(2023, 'Monaco Grand Prix')}")
