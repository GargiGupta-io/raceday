"""
insights.py — F1 Insights Engine

Reads indexed race data and produces structured, fan-facing analysis.
All functions read from the index via indexer.load_race_index() —
never from FastF1 directly.
"""

import logging

from backend.core import indexer, loader

logger = logging.getLogger(__name__)


def get_season_races(year: int) -> list[dict] | None:
    """
    Return all races in a season with their indexed status.

    Each entry contains:
        round    — round number (int)
        name     — event name (e.g. 'British Grand Prix')
        location — city/circuit location
        country  — country name
        date     — ISO date string (YYYY-MM-DD)
        format   — 'conventional', 'sprint', etc.
        indexed  — True if race data is available on disk

    Returns None if the season schedule cannot be fetched.
    """
    schedule = loader.get_season_schedule(year)
    if schedule is None:
        logger.warning("get_season_races: no schedule for %s", year)
        return None

    return [
        {**event, "indexed": indexer.is_indexed(year, event["name"])}
        for event in schedule
    ]


def get_race_summary(year: int, track: str) -> dict | None:
    """
    Return a top-level summary of a race.

    Returns a dict with:
        winner      — driver abbreviation (str)
        podium      — list of 3 driver abbreviations [P1, P2, P3]
        retirements — list of driver abbreviations who did not finish
        weather     — condition string: 'dry', 'damp', or 'wet'
        avg_air_temp    — float, degrees C
        avg_track_temp  — float, degrees C

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        logger.warning("get_race_summary: no data for %s %s", year, track)
        return None

    results = data["results"]
    weather = data["weather"]

    finished = [r for r in results if r["finish_position"] is not None]
    finished_sorted = sorted(finished, key=lambda r: r["finish_position"])

    podium = [r["driver"] for r in finished_sorted[:3]]
    winner = podium[0] if podium else None

    retirements = [r["driver"] for r in results if r["status"] not in ("Finished",) and
                   not r["status"].startswith("+")]

    return {
        "winner": winner,
        "podium": podium,
        "retirements": retirements,
        "weather": weather.get("condition"),
        "avg_air_temp": weather.get("avg_air_temp"),
        "avg_track_temp": weather.get("avg_track_temp"),
    }


def get_driver_standings_snapshot(year: int, track: str) -> list[dict] | None:
    """
    Return every driver sorted by finish position with positions gained/lost.

    Each entry contains:
        position        — final finishing position (int), or None if retired
        driver          — three-letter abbreviation
        team            — constructor name
        grid            — starting grid position (int), or None
        positions_delta — grid minus finish (positive = gained, negative = lost)
        status          — 'Finished', '+1 Lap', 'Retired', etc.

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        logger.warning("get_driver_standings_snapshot: no data for %s %s", year, track)
        return None

    results = data["results"]

    # Sort: finishers by position first, then retirements at the end
    finishers = [r for r in results if r["finish_position"] is not None]
    retired   = [r for r in results if r["finish_position"] is None]

    finishers_sorted = sorted(finishers, key=lambda r: r["finish_position"])
    snapshot = []

    for r in finishers_sorted + retired:
        finish = r["finish_position"]
        grid   = r["grid_position"]

        if finish is not None and grid is not None:
            delta = grid - finish   # positive = moved forward, negative = moved back
        else:
            delta = None

        # Normalise status: lapped cars show "+X Laps", retired show "Retired"
        status = r["status"]
        if status not in ("Finished",) and not status.startswith("+"):
            status = "Retired"

        snapshot.append({
            "position": finish,
            "driver": r["driver"],
            "team": r["team"],
            "grid": grid,
            "positions_delta": delta,
            "status": status,
        })

    return snapshot


# Compound display names for readable labels
_COMPOUND_LABELS = {
    "SOFT": "Soft",
    "MEDIUM": "Medium",
    "HARD": "Hard",
    "INTERMEDIATE": "Intermediate",
    "WET": "Wet",
}


def get_strategy_breakdown(year: int, track: str) -> list[dict] | None:
    """
    Return per-driver tyre strategy information.

    Each entry contains:
        driver    — three-letter abbreviation
        team      — constructor name
        stops     — number of pit stops (int), or None if stint data unavailable
        compounds — ordered list of compound strings used e.g. ['MEDIUM', 'HARD']
        label     — human-readable label e.g. '1-stop: Medium → Hard'
        status    — 'Finished', '+1 Lap', 'Retired', etc.

    Uses lap-level stint sequences when available (stints.json in index).
    Falls back to dominant compound label if stints data is absent.

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        logger.warning("get_strategy_breakdown: no data for %s %s", year, track)
        return None

    results = data["results"]
    stints_by_driver = data.get("stints")  # None if stints.json absent

    finishers = sorted(
        [r for r in results if r["finish_position"] is not None],
        key=lambda r: r["finish_position"],
    )
    retired = [r for r in results if r["finish_position"] is None]

    breakdown = []
    for r in finishers + retired:
        driver = r["driver"]
        status = r["status"]
        if status not in ("Finished",) and not status.startswith("+"):
            status = "Retired"

        if stints_by_driver and driver in stints_by_driver:
            driver_stints = stints_by_driver[driver]
            compounds = [s["compound"] for s in driver_stints]
            stops = len(driver_stints) - 1
            compound_seq = " → ".join(
                _COMPOUND_LABELS.get(c, c.title()) for c in compounds
            )
            label = f"{stops}-stop: {compound_seq}"
        else:
            # Fallback: dominant compound only
            compound = r.get("compound") or "Unknown"
            compounds = [compound]
            stops = None
            label = f"{_COMPOUND_LABELS.get(compound, compound.title())} primary"

        breakdown.append({
            "driver": driver,
            "team": r["team"],
            "stops": stops,
            "compounds": compounds,
            "label": label,
            "status": status,
        })

    return breakdown


# F1 points awarded per finishing position (standard system, no fastest lap)
_POINTS_TABLE = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}


def get_championship_standings(year: int) -> list[dict] | None:
    """
    Return driver championship standings built from all indexed races in a season.

    Iterates every race indexed for the given year, sums F1 points per driver,
    and returns a sorted standings table.

    Each entry contains:
        position — championship position (1-based)
        driver   — three-letter abbreviation
        team     — constructor name (from most recent indexed race)
        points   — total championship points
        wins     — number of race wins
        races    — number of indexed races counted

    Note: only indexed races contribute to the totals. Races not yet indexed
    are excluded — points coverage may be partial for recent seasons.

    Returns None if no races are indexed for the given year.
    """
    indexed = [r for r in indexer.list_indexed() if r["year"] == year]
    if not indexed:
        logger.warning("get_championship_standings: no indexed races for %s", year)
        return None

    # driver → {points, wins, races, team}
    tally: dict[str, dict] = {}

    for entry in indexed:
        data = indexer.load_race_index(year, entry["track"])
        if data is None:
            continue

        for r in data["results"]:
            driver = r["driver"]
            pos = r["finish_position"]
            pts = _POINTS_TABLE.get(pos, 0)

            if driver not in tally:
                tally[driver] = {"points": 0, "wins": 0, "races": 0, "team": r["team"]}

            tally[driver]["points"] += pts
            tally[driver]["wins"]   += 1 if pos == 1 else 0
            tally[driver]["races"]  += 1
            tally[driver]["team"]    = r["team"]  # keep most recent

    if not tally:
        return None

    sorted_drivers = sorted(
        tally.items(),
        key=lambda x: (-x[1]["points"], -x[1]["wins"]),
    )

    return [
        {
            "position": i + 1,
            "driver": driver,
            "team": info["team"],
            "points": info["points"],
            "wins": info["wins"],
            "races": info["races"],
        }
        for i, (driver, info) in enumerate(sorted_drivers)
    ]


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Run as: python3 -m backend.core.insights  (from the raceday/ root)
    import logging
    logging.basicConfig(level=logging.WARNING)

    year, track = 2023, "British Grand Prix"
    print(f"Insights — {year} {track}\n")

    # --- Race summary ---
    summary = get_race_summary(year, track)
    print("RACE SUMMARY")
    print(f"  Winner      : {summary['winner']}")
    print(f"  Podium      : {' / '.join(summary['podium'])}")
    print(f"  Retirements : {', '.join(summary['retirements'])}")
    print(f"  Weather     : {summary['weather']}, {summary['avg_air_temp']}C air, {summary['avg_track_temp']}C track")

    # --- Standings snapshot ---
    print("\nSTANDINGS SNAPSHOT")
    print(f"  {'POS':<5} {'DRIVER':<8} {'GRID':<6} {'DELTA':<8} STATUS")
    print(f"  {'-'*42}")
    for r in get_driver_standings_snapshot(year, track):
        pos   = str(r['position']) if r['position'] else 'DNF'
        delta = ('+' if r['positions_delta'] > 0 else '') + str(r['positions_delta']) if r['positions_delta'] is not None else '-'
        print(f"  {pos:<5} {r['driver']:<8} {str(r['grid']):<6} {delta:<8} {r['status']}")

    # --- Strategy breakdown ---
    print("\nSTRATEGY BREAKDOWN")
    print(f"  {'DRIVER':<8} {'COMPOUND':<14} LABEL")
    print(f"  {'-'*38}")
    for r in get_strategy_breakdown(year, track):
        print(f"  {r['driver']:<8} {r['compound']:<14} {r['label']}")
