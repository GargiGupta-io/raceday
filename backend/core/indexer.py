"""
indexer.py — F1 Data Indexer

Persists loader output to disk as JSON files and tracks which races
have already been indexed, so insights never re-fetches from FastF1.

Index structure on disk:
    INDEX_DIR/
    └── {year}/
        └── {track}/
            ├── race_results.json
            └── weather.json
"""

import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from backend.core import loader, jolpica_loader, openmeteo_loader, compound_lookup

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Index directory setup (runs on import)
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_index_dir = Path(os.getenv("INDEX_DIR", "./data/index"))
_index_dir.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _race_dir(year: int, track: str) -> Path:
    """Return the directory path for a given race, without creating it."""
    return _index_dir / str(year) / track


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def index_race(year: int, track: str) -> bool:
    """
    Fetch race results, weather, and stint data and persist to disk as JSON.

    Year-aware routing:
        2018+ → FastF1 (existing loader.py path)
        ≤2017 → Jolpica + OpenMeteo + compound_lookup (historical path)

    Saves to:
        INDEX_DIR/{year}/{track}/race_results.json
        INDEX_DIR/{year}/{track}/weather.json
        INDEX_DIR/{year}/{track}/stints.json

    Returns True if indexing succeeded, False if no data available.
    Stint data is optional — if unavailable, stints.json is written as {}.
    """
    if year <= 2017:
        return _index_race_historical(year, track)
    return _index_race_fastf1(year, track)


def _index_race_fastf1(year: int, track: str) -> bool:
    """Index a race using FastF1 (2018+ path). Original logic."""
    race_dir = _race_dir(year, track)

    results = loader.get_race_results(year, track)
    if results is None:
        logger.warning("index_race: no results returned for %s %s — skipping", year, track)
        return False

    weather = loader.get_weather_summary(year, track)
    if weather is None:
        logger.warning("index_race: no weather for %s %s — storing empty dict", year, track)
        weather = {}

    stints = loader.get_stint_data(year, track)
    if stints is None:
        logger.warning("index_race: no stint data for %s %s — storing empty dict", year, track)
        stints = {}

    _write_index(race_dir, results, weather, stints)
    return True


def _index_race_historical(year: int, track: str) -> bool:
    """Index a race using Jolpica + OpenMeteo + compound_lookup (≤2017 path)."""
    race_dir = _race_dir(year, track)

    # Step 1: Find the round number for this track name
    schedule = loader.get_season_schedule(year)
    if schedule is None:
        logger.warning("index_race_historical: no schedule for %s", year)
        return False

    race_info = None
    for event in schedule:
        if event["name"] == track:
            race_info = event
            break

    if race_info is None:
        logger.warning("index_race_historical: '%s' not found in %s schedule", track, year)
        return False

    round_num = race_info["round"]

    # Step 2: Results from Jolpica
    results = jolpica_loader.get_race_results(year, round_num)
    if results is None:
        logger.warning("index_race_historical: no results for %s %s — skipping", year, track)
        return False

    # Step 3: Weather from OpenMeteo (using circuit GPS from schedule)
    lat = race_info.get("lat", 0)
    lon = race_info.get("lon", 0)
    date = race_info.get("date", "")
    if lat and lon and date:
        weather = openmeteo_loader.get_race_weather(date, lat, lon)
        if weather is None:
            logger.warning("index_race_historical: no weather for %s %s — storing empty dict", year, track)
            weather = {}
    else:
        logger.warning("index_race_historical: missing GPS/date for %s %s — skipping weather", year, track)
        weather = {}

    # Step 4: Build stints from Jolpica pit stops + compound lookup
    pit_stops = jolpica_loader.get_pit_stops(year, round_num)
    stints: dict = {}

    if pit_stops:
        for driver_code, stops in pit_stops.items():
            # Find total laps for this driver from results
            driver_result = next((r for r in results if r["driver"] == driver_code), None)
            total_laps = (driver_result or {}).get("total_laps") or 0

            pit_laps = [s["lap"] for s in stops]
            grid = (driver_result or {}).get("grid_position")

            compounds = compound_lookup.assign_stint_compounds(
                pit_laps, total_laps, grid, year, round_num, driver_code
            )
            driver_stints = compound_lookup.build_stints(pit_laps, compounds, total_laps)
            if driver_stints:
                stints[driver_code] = driver_stints
    elif compound_lookup.get_race_compounds(year, round_num) is not None:
        # No pit stop data from API but we have compound nominations (e.g. 2010).
        # Estimate pit stops assuming 2-stop strategy with evenly-spaced stints.
        logger.info("No pit stop data for %s R%d — estimating 2-stop strategy", year, round_num)
        for r in results:
            driver_code = r["driver"]
            total_laps = r.get("total_laps") or 0
            if total_laps < 10:
                continue  # retired too early
            grid = r.get("grid_position")
            pit_laps = compound_lookup.estimate_pit_stop_laps(total_laps, num_stops=2)
            compounds = compound_lookup.assign_stint_compounds(
                pit_laps, total_laps, grid, year, round_num, driver_code
            )
            driver_stints = compound_lookup.build_stints(pit_laps, compounds, total_laps)
            if driver_stints:
                stints[driver_code] = driver_stints

    _write_index(race_dir, results, weather, stints)
    return True


def _write_index(race_dir: Path, results: list, weather: dict, stints: dict):
    """Write the three JSON files to the race index directory."""
    race_dir.mkdir(parents=True, exist_ok=True)

    with open(race_dir / "race_results.json", "w") as f:
        json.dump(results, f, indent=2)

    with open(race_dir / "weather.json", "w") as f:
        json.dump(weather, f, indent=2)

    with open(race_dir / "stints.json", "w") as f:
        json.dump(stints, f, indent=2)

    logger.info("Indexed → %s", race_dir)


def is_indexed(year: int, track: str) -> bool:
    """
    Return True if both race_results.json and weather.json exist for this race.
    """
    race_dir = _race_dir(year, track)
    return (race_dir / "race_results.json").exists() and (race_dir / "weather.json").exists()


def load_race_index(year: int, track: str) -> dict | None:
    """
    Read and return the indexed data for a race from disk.

    Returns a dict with keys:
        results  — list of per-driver result dicts
        weather  — weather summary dict
        stints   — per-driver stint sequences, or None if stints.json absent

    Returns None if the race has not been indexed yet.
    Auto-indexes on demand if not found, then loads.
    """
    if not is_indexed(year, track):
        logger.info("load_race_index: %s %s not indexed — indexing now", year, track)
        success = index_race(year, track)
        if not success:
            return None

    race_dir = _race_dir(year, track)

    with open(race_dir / "race_results.json") as f:
        results = json.load(f)

    with open(race_dir / "weather.json") as f:
        weather = json.load(f)

    stints_path = race_dir / "stints.json"
    stints = None
    if stints_path.exists():
        with open(stints_path) as f:
            stints = json.load(f)

    return {"results": results, "weather": weather, "stints": stints}


def list_indexed() -> list[dict]:
    """
    Scan INDEX_DIR and return all races that have been fully indexed.

    Returns a list of dicts, each with:
        year   — int
        track  — str

    Sorted by year ascending, then track name alphabetically.
    Only includes races where both JSON files are present.
    """
    indexed = []

    if not _index_dir.exists():
        return indexed

    for year_dir in sorted(_index_dir.iterdir()):
        if not year_dir.is_dir():
            continue
        try:
            year = int(year_dir.name)
        except ValueError:
            continue

        for track_dir in sorted(year_dir.iterdir()):
            if not track_dir.is_dir():
                continue
            if is_indexed(year, track_dir.name):
                indexed.append({"year": year, "track": track_dir.name})

    return indexed


def index_season(year: int) -> dict:
    """
    Index all races in a season that have not yet been indexed.

    Fetches the season schedule via the loader, then calls index_race()
    for each event that is not already on disk. Skips races that are
    already indexed.

    Returns a summary dict:
        total    — total races in the schedule
        indexed  — races newly indexed this call
        skipped  — races already on disk (not re-fetched)
        failed   — races where indexing returned False
    """
    schedule = loader.get_season_schedule(year)
    if schedule is None:
        logger.warning("index_season: could not fetch schedule for %s", year)
        return {"total": 0, "indexed": 0, "skipped": 0, "failed": 0}

    total = len(schedule)
    newly_indexed = 0
    skipped = 0
    failed = 0

    for event in schedule:
        track = event["name"]
        if is_indexed(year, track):
            logger.info("index_season: %s %s already indexed — skipping", year, track)
            skipped += 1
            continue

        logger.info("index_season: indexing %s %s", year, track)
        success = index_race(year, track)
        if success:
            newly_indexed += 1
        else:
            logger.warning("index_season: failed to index %s %s", year, track)
            failed += 1

    return {"total": total, "indexed": newly_indexed, "skipped": skipped, "failed": failed}


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Run as: python3 -m backend.core.indexer  (from the raceday/ root)
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    logging.getLogger("fastf1").setLevel(logging.ERROR)
    logging.getLogger("req").setLevel(logging.ERROR)
    logging.getLogger("core").setLevel(logging.ERROR)

    year, track = 2023, "British Grand Prix"

    print(f"Indexing {year} {track}...")
    success = index_race(year, track)
    print(f"Success: {success}")

    race_dir = _race_dir(year, track)
    print(f"\nFiles written:")
    print(f"  {race_dir / 'race_results.json'}")
    print(f"  {race_dir / 'weather.json'}")

    print(f"\nAll indexed races:")
    for r in list_indexed():
        print(f"  {r['year']} — {r['track']}")

    print(f"\nSample load:")
    data = load_race_index(year, track)
    print(f"  Drivers : {len(data['results'])}")
    print(f"  Weather : {data['weather']}")
    print(f"  P1      : {data['results'][0]}")
