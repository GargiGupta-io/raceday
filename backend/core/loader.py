"""
loader.py — FastF1 Data Loader

Fetches and caches F1 session data using the FastF1 library.
Normalises raw FastF1 DataFrames into consistent dicts for downstream use.

Cache is configured on import from CACHE_DIR in .env.
"""

import logging
import os
from pathlib import Path

import fastf1
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache setup (runs on import)
# ---------------------------------------------------------------------------

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_cache_dir = Path(os.getenv("CACHE_DIR", "./data/cache"))
_cache_dir.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(_cache_dir))

# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def get_session(year: int, track: str, session_type: str):
    """
    Return a loaded FastF1 Session for the given year, track, and session type.

    session_type examples: 'R' (Race), 'Q' (Qualifying), 'FP1', 'FP2', 'FP3', 'S' (Sprint)

    Loads laps and weather only — telemetry is skipped for performance.
    Returns None and logs a warning if the session cannot be found or loaded.
    """
    try:
        session = fastf1.get_session(year, track, session_type)
        session.load(laps=True, telemetry=False, weather=True, messages=False)
        return session
    except Exception as exc:
        logger.warning(
            "Could not load session: %s %s %s — %s", year, track, session_type, exc
        )
        return None


def get_race_results(year: int, track: str) -> list[dict] | None:
    """
    Return a list of per-driver result dicts for the given race.

    Each dict contains:
        driver          — three-letter abbreviation (e.g. 'VER')
        grid_position   — starting grid position (int, NaN → None)
        finish_position — classified finish position (int, NaN → None)
        team            — constructor name
        compound        — most-used tyre compound during the race
        status          — 'Finished', '+1 Lap', 'DNF', etc.

    Returns None if the session cannot be loaded.
    """
    session = get_session(year, track, "R")
    if session is None:
        return None

    results = session.results
    laps = session.laps

    # Most-used compound per driver across all laps
    compound_by_driver = (
        laps.groupby("Driver")["Compound"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else None)
        .to_dict()
    )

    rows = []
    for _, row in results.iterrows():
        abbr = row.get("Abbreviation", "")
        rows.append(
            {
                "driver": abbr,
                "grid_position": _int_or_none(row.get("GridPosition")),
                "finish_position": _int_or_none(row.get("Position")),
                "team": row.get("TeamName", ""),
                "compound": compound_by_driver.get(abbr),
                "status": row.get("Status", ""),
            }
        )

    return rows


def get_weather_summary(year: int, track: str) -> dict | None:
    """
    Return a high-level weather summary for the given race.

    Returns a dict with:
        condition   — 'dry', 'damp', or 'wet'
        avg_air_temp    — mean air temperature in °C (rounded to 1dp)
        avg_track_temp  — mean track temperature in °C (rounded to 1dp)

    'damp'  = any rainfall recorded during the session
    'wet'   = rainfall recorded for more than 20% of data points

    Returns None if the session cannot be loaded.
    """
    session = get_session(year, track, "R")
    if session is None:
        return None

    weather = session.weather_data
    if weather is None or weather.empty:
        logger.warning("No weather data available for %s %s", year, track)
        return None

    rainfall = weather["Rainfall"].astype(bool)
    wet_fraction = rainfall.mean()

    if wet_fraction == 0:
        condition = "dry"
    elif wet_fraction > 0.2:
        condition = "wet"
    else:
        condition = "damp"

    return {
        "condition": condition,
        "avg_air_temp": round(float(weather["AirTemp"].mean()), 1),
        "avg_track_temp": round(float(weather["TrackTemp"].mean()), 1),
    }


def get_season_schedule(year: int) -> list[dict] | None:
    """
    Return the list of race events for a given F1 season.

    Year-aware routing:
        2018+ → FastF1 (rich data, sprint detection)
        ≤2017 → Jolpica API (basic schedule with GPS coords)

    Each dict contains:
        round       — round number (int, 1-based)
        name        — event name (e.g. 'British Grand Prix')
        location    — city/circuit location
        country     — country name
        date        — event date as ISO string (YYYY-MM-DD)
        format      — 'conventional', 'sprint', etc.

    Jolpica responses also include: circuit_id, lat, lon (used by indexer).
    Excludes pre-season testing (round 0).
    Returns None if the schedule cannot be fetched.
    """
    if year <= 2017:
        from backend.core import jolpica_loader
        return jolpica_loader.get_season_schedule(year)

    try:
        schedule = fastf1.get_event_schedule(year, include_testing=False)
    except Exception as exc:
        logger.warning("Could not fetch season schedule for %s — %s", year, exc)
        return None

    events = []
    for _, row in schedule.iterrows():
        round_num = _int_or_none(row.get("RoundNumber"))
        if round_num is None or round_num < 1:
            continue
        date = row.get("EventDate")
        events.append({
            "round": round_num,
            "name": row.get("EventName", ""),
            "location": row.get("Location", ""),
            "country": row.get("Country", ""),
            "date": date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date),
            "format": row.get("EventFormat", "conventional"),
        })

    return events


def get_stint_data(year: int, track: str) -> dict | None:
    """
    Return per-driver stint sequences for the given race.

    Returns a dict keyed by driver abbreviation, each value being an
    ordered list of stint dicts:
        stint      — stint number (int, 1-based)
        compound   — tyre compound used ('SOFT', 'MEDIUM', 'HARD', etc.)
        lap_start  — first lap of the stint (int)
        lap_end    — last lap of the stint (int)
        lap_count  — number of laps on that tyre (int)

    Returns None if the session cannot be loaded.
    """
    session = get_session(year, track, "R")
    if session is None:
        return None

    laps = session.laps

    # Drop rows missing Stint or LapNumber — can't build sequences without them
    laps = laps.dropna(subset=["Stint", "LapNumber"])
    if laps.empty:
        logger.warning("get_stint_data: no usable lap data for %s %s", year, track)
        return None

    grouped = (
        laps.groupby(["Driver", "Stint"])
        .agg(
            compound=("Compound", lambda s: s.mode().iloc[0] if not s.mode().empty else "UNKNOWN"),
            lap_start=("LapNumber", "min"),
            lap_end=("LapNumber", "max"),
            lap_count=("LapNumber", "count"),
        )
        .reset_index()
    )

    stints_by_driver: dict = {}
    for _, row in grouped.iterrows():
        driver = row["Driver"]
        stints_by_driver.setdefault(driver, []).append({
            "stint": int(row["Stint"]),
            "compound": str(row["compound"]),
            "lap_start": int(row["lap_start"]),
            "lap_end": int(row["lap_end"]),
            "lap_count": int(row["lap_count"]),
        })

    # Ensure stints are in order for each driver
    for driver in stints_by_driver:
        stints_by_driver[driver].sort(key=lambda s: s["stint"])

    return stints_by_driver


def get_lap_times(year: int, track: str) -> dict | None:
    """
    Return per-driver lap-by-lap timing data for strategy simulation.

    Returns a dict keyed by driver abbreviation, each value being a list
    of lap dicts sorted by lap number:
        lap        — lap number (int)
        time       — lap time in seconds (float)
        compound   — tyre compound used
        stint      — stint number (int)
        pit_stop   — True if this lap included a pit stop

    Also returns aggregate data:
        _meta:
            pit_stop_durations — list of actual pit stop durations (seconds)
            total_laps — race distance

    Returns None if the session cannot be loaded.
    Only available for 2018+ (FastF1 data).
    """
    if year < 2018:
        return None

    session = get_session(year, track, "R")
    if session is None:
        return None

    laps = session.laps
    laps = laps.dropna(subset=["LapNumber"])
    if laps.empty:
        return None

    result: dict = {}
    pit_durations: list[float] = []

    for _, row in laps.iterrows():
        driver = str(row.get("Driver", "???"))
        lap_num = int(row["LapNumber"])

        # Extract lap time in seconds
        import pandas as pd
        lap_time = row.get("LapTime")
        if lap_time is not None and pd.notna(lap_time) and hasattr(lap_time, "total_seconds"):
            time_sec = lap_time.total_seconds()
            if time_sec != time_sec:  # NaN check
                continue
        else:
            continue  # skip laps without timing

        # Skip outlier laps (pit in/out, safety cars) — over 150% of a normal lap
        # We'll filter these when building the model, not here

        compound = str(row.get("Compound", "UNKNOWN"))
        stint = int(row.get("Stint", 1)) if row.get("Stint") is not None else 1

        # Detect pit stops — PitInTime is NaT for non-pit laps in pandas
        import pandas as pd
        pit_in_val = row.get("PitInTime")
        pit_out_val = row.get("PitOutTime")
        is_pit = pd.notna(pit_in_val)

        # Extract pit stop duration
        if is_pit and pd.notna(pit_out_val):
            try:
                if hasattr(pit_out_val, "total_seconds") and hasattr(pit_in_val, "total_seconds"):
                    dur = pit_out_val.total_seconds() - pit_in_val.total_seconds()
                    if 15 < dur < 60:  # reasonable pit stop range
                        pit_durations.append(round(dur, 2))
            except (TypeError, ValueError):
                pass

        result.setdefault(driver, []).append({
            "lap": lap_num,
            "time": round(time_sec, 3),
            "compound": compound,
            "stint": stint,
            "pit_stop": is_pit,
        })

    # Sort each driver's laps
    for driver in result:
        result[driver].sort(key=lambda x: x["lap"])

    # Add metadata
    result["_meta"] = {
        "pit_stop_durations": pit_durations,
        "total_laps": max((lap["lap"] for d in result.values() if isinstance(d, list) for lap in d), default=0),
        "drivers": len([k for k in result if k != "_meta"]),
    }

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _int_or_none(value) -> int | None:
    """Convert a value to int, returning None for NaN/None."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    print("Fetching 2023 British Grand Prix race results...\n")
    results = get_race_results(2023, "British Grand Prix")

    if results is None:
        print("Failed to load session.")
    else:
        header = f"{'POS':<4} {'GRID':<5} {'DRIVER':<8} {'TEAM':<30} {'COMPOUND':<10} STATUS"
        print(header)
        print("-" * len(header))
        for r in results:
            print(
                f"{str(r['finish_position']):<4} "
                f"{str(r['grid_position']):<5} "
                f"{r['driver']:<8} "
                f"{r['team']:<30} "
                f"{str(r['compound']):<10} "
                f"{r['status']}"
            )

    print("\nWeather summary:")
    weather = get_weather_summary(2023, "British Grand Prix")
    if weather:
        print(f"  Condition:       {weather['condition']}")
        print(f"  Avg air temp:    {weather['avg_air_temp']}°C")
        print(f"  Avg track temp:  {weather['avg_track_temp']}°C")
