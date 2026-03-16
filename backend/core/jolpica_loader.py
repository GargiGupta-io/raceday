"""
jolpica_loader.py — Jolpica Historical Data Loader

Fetches F1 data from the Jolpica API (open Ergast replacement) for seasons
where FastF1 doesn't have reliable data (2017 and earlier).

API base: https://api.jolpi.ca/ergast/f1/
No authentication required. Free tier, ~600 req/min.
"""

import logging
import time

import requests

logger = logging.getLogger(__name__)

_BASE = "https://api.jolpi.ca/ergast/f1"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Raceday/1.0 (F1 fan intelligence platform)"})


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------


def _get(path: str, retries: int = 3) -> dict | None:
    """
    GET a Jolpica endpoint and return parsed JSON, or None on failure.
    Retries up to `retries` times with exponential backoff (1 s, 2 s).
    """
    url = f"{_BASE}/{path}"
    for attempt in range(retries):
        try:
            resp = _SESSION.get(url, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                logger.warning("Jolpica request failed: %s — %s", url, exc)
    return None


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def get_season_schedule(year: int) -> list[dict] | None:
    """
    Return the race event list for a given F1 season.

    Each dict contains:
        round      — round number (int, 1-based)
        name       — event name (e.g. 'Australian Grand Prix')
        location   — city name
        country    — country name
        date       — ISO date string (YYYY-MM-DD)
        format     — always 'conventional' (sprint weekends not tracked pre-2021)
        circuit_id — Jolpica circuit identifier (e.g. 'albert_park')
        lat        — circuit latitude (float)
        lon        — circuit longitude (float)

    Returns None if the API call fails or returns no races.
    """
    data = _get(f"{year}.json?limit=100")
    if data is None:
        return None

    races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    if not races:
        logger.warning("get_season_schedule: no races for %s", year)
        return None

    events = []
    for race in races:
        circuit = race.get("Circuit", {})
        loc = circuit.get("Location", {})
        events.append({
            "round":      int(race["round"]),
            "name":       race.get("raceName", ""),
            "location":   loc.get("locality", ""),
            "country":    loc.get("country", ""),
            "date":       race.get("date", ""),
            "format":     "conventional",
            "circuit_id": circuit.get("circuitId", ""),
            "lat":        float(loc.get("lat", 0) or 0),
            "lon":        float(loc.get("long", 0) or 0),
        })

    return events


def get_circuit_coords(circuit_id: str) -> tuple[float, float] | None:
    """
    Return (latitude, longitude) for a circuit ID (e.g. 'albert_park').
    Returns None if the circuit cannot be found.
    """
    data = _get(f"circuits/{circuit_id}.json")
    if data is None:
        return None

    circuits = data.get("MRData", {}).get("CircuitTable", {}).get("Circuits", [])
    if not circuits:
        return None

    loc = circuits[0].get("Location", {})
    try:
        return float(loc["lat"]), float(loc["long"])
    except (KeyError, ValueError, TypeError):
        return None


def get_race_results(year: int, round_num: int) -> list[dict] | None:
    """
    Return per-driver race results for the given round from Jolpica.

    Each dict contains:
        driver          — three-letter code (e.g. 'HAM')
        grid_position   — starting grid position (int or None)
        finish_position — classified finishing position (int or None)
        team            — constructor name
        compound        — None (Jolpica has no tyre data; filled by scraper later)
        status          — 'Finished', '+1 Lap', 'DNF', etc.
        total_laps      — number of laps completed (int or None)

    Returns None if the API call fails or returns no data.
    """
    data = _get(f"{year}/{round_num}/results.json?limit=100")
    if data is None:
        return None

    races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    if not races:
        logger.warning("get_race_results: no data for %s round %s", year, round_num)
        return None

    rows = []
    for r in races[0].get("Results", []):
        # Some pre-2003 entries lack a 3-letter code; fall back to truncated driverId
        code = (
            r.get("Driver", {}).get("code")
            or r.get("Driver", {}).get("driverId", "")[:3].upper()
        )
        grid     = str(r.get("grid", ""))
        position = str(r.get("position", ""))
        laps     = str(r.get("laps", ""))

        rows.append({
            "driver":          code,
            "grid_position":   int(grid)     if grid.isdigit()     else None,
            "finish_position": int(position) if position.isdigit() else None,
            "team":            r.get("Constructor", {}).get("name", ""),
            "compound":        None,
            "status":          r.get("status", ""),
            "total_laps":      int(laps)     if laps.isdigit()     else None,
        })

    return rows if rows else None


def _get_driver_id_to_code(year: int, round_num: int) -> dict[str, str]:
    """
    Fetch the driverId → 3-letter code mapping for a given race from Jolpica.

    Jolpica pit stops use slugs ('hamilton') while results use codes ('HAM').
    This hits the results endpoint to build an authoritative lookup.

    Returns e.g. {"hamilton": "HAM", "vettel": "VET", "rosberg": "ROS"}
    Returns empty dict on failure.
    """
    data = _get(f"{year}/{round_num}/results.json?limit=100")
    if data is None:
        return {}

    races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    if not races:
        return {}

    mapping = {}
    for r in races[0].get("Results", []):
        driver = r.get("Driver", {})
        driver_id = driver.get("driverId", "")
        code = driver.get("code") or driver_id[:3].upper()
        if driver_id:
            mapping[driver_id] = code

    return mapping


def get_pit_stops(year: int, round_num: int) -> dict | None:
    """
    Return per-driver pit stop data for the given round from Jolpica.

    Returns a dict keyed by 3-letter driver code, each value being a sorted
    list of pit stop dicts:
        stop     — stop number (int, 1-based)
        lap      — lap the pit stop occurred (int)
        duration — pit stop duration in seconds (float or None)

    Example:
        {"HAM": [{"stop": 1, "lap": 18, "duration": 23.5},
                 {"stop": 2, "lap": 38, "duration": 24.1}],
         "VET": [...]}

    Returns None if the API call fails.
    Returns an empty dict if the API returns no pit stop data (pre-2012 races
    don't have pit stop timing in the Ergast/Jolpica database).
    """
    data = _get(f"{year}/{round_num}/pitstops.json?limit=100")
    if data is None:
        return None

    races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    if not races:
        logger.info("get_pit_stops: no pit stop data for %s round %s", year, round_num)
        return {}

    pit_stops_raw = races[0].get("PitStops", [])
    if not pit_stops_raw:
        return {}

    # Build driverId → code mapping from the results endpoint
    id_to_code = _get_driver_id_to_code(year, round_num)

    stops_by_driver: dict[str, list[dict]] = {}
    for ps in pit_stops_raw:
        driver_id = ps.get("driverId", "")
        code = id_to_code.get(driver_id, driver_id[:3].upper())

        lap = ps.get("lap", "")
        stop = ps.get("stop", "")
        duration = ps.get("duration", "")

        try:
            dur_float = float(duration) if duration else None
        except (ValueError, TypeError):
            dur_float = None

        stops_by_driver.setdefault(code, []).append({
            "stop":     int(stop) if str(stop).isdigit() else 0,
            "lap":      int(lap) if str(lap).isdigit() else 0,
            "duration": dur_float,
        })

    # Sort each driver's stops by stop number
    for driver in stops_by_driver:
        stops_by_driver[driver].sort(key=lambda s: s["stop"])

    return stops_by_driver


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    year = 2014
    print(f"=== {year} Season Schedule ===\n")
    schedule = get_season_schedule(year)
    if schedule:
        for e in schedule[:5]:
            print(f"  R{e['round']:02d}  {e['name']:<35}  {e['date']}  ({e['lat']:.3f}, {e['lon']:.3f})")
        print(f"  ... {len(schedule)} total events\n")
    else:
        print("  Failed to load schedule.\n")

    print(f"=== R01 Race Results ===\n")
    results = get_race_results(year, 1)
    if results:
        print(f"  {'POS':<5} {'GRID':<6} {'DRIVER':<8} {'TEAM':<25} STATUS")
        print(f"  {'-' * 60}")
        for r in results:
            print(
                f"  {str(r['finish_position']):<5} "
                f"{str(r['grid_position']):<6} "
                f"{r['driver']:<8} "
                f"{r['team']:<25} "
                f"{r['status']}"
            )
    else:
        print("  Failed to load results.")

    print(f"\n=== R01 Pit Stops ===\n")
    pit_stops = get_pit_stops(year, 1)
    if pit_stops:
        for code, stops in sorted(pit_stops.items()):
            laps = ", ".join(f"lap {s['lap']}" for s in stops)
            print(f"  {code:<5} {len(stops)} stop(s): {laps}")
    elif pit_stops is not None:
        print("  No pit stop data available for this race.")
    else:
        print("  Failed to load pit stops.")
