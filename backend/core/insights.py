"""
insights.py — F1 Insights Engine

Reads indexed race data and produces structured, fan-facing analysis.
All functions read from the index via indexer.load_race_index() —
never from FastF1 directly.
"""

import json
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

    races = []
    for event in schedule:
        track = event["name"]
        entry = {**event, "indexed": indexer.is_indexed(year, track)}

        # Add race details for indexed races
        if entry["indexed"]:
            data = indexer.load_race_index(year, track)
            if data:
                results = data["results"]
                weather = data["weather"]
                finished = sorted(
                    [r for r in results if r["finish_position"] is not None],
                    key=lambda r: r["finish_position"],
                )
                if finished:
                    entry["winner"] = finished[0]["driver"]
                    entry["winner_team"] = finished[0]["team"]
                # Get total laps: try total_laps field (Jolpica), then stint data
                total_laps = 0
                for r in results:
                    tl = r.get("total_laps")
                    if tl and tl > total_laps:
                        total_laps = tl
                if total_laps == 0 and data.get("stints"):
                    for driver_stints in data["stints"].values():
                        if driver_stints:
                            last = driver_stints[-1]
                            total_laps = max(total_laps, last.get("lap_end", 0))
                entry["total_laps"] = total_laps if total_laps > 0 else None
                entry["weather"] = weather.get("condition")

        races.append(entry)

    return races


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

    podium = [
        {"position": r["finish_position"], "driver": r["driver"], "team": r["team"]}
        for r in finished_sorted[:3]
    ]
    winner = podium[0]["driver"] if podium else None
    winner_team = podium[0]["team"] if podium else None

    retirements = [
        {"driver": r["driver"], "team": r["team"]}
        for r in results
        if r["status"] not in ("Finished",) and not r["status"].startswith("+")
    ]

    return {
        "winner": winner,
        "winner_team": winner_team,
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


def get_strategy_narrative(year: int, track: str) -> list[str] | None:
    """
    Auto-generate a race strategy narrative from stint data.

    Returns a list of prose paragraphs describing the strategy story:
    who pitted first, undercuts, overcuts, contrasting strategies,
    and how strategy affected the result.

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    stints_by_driver = data.get("stints") or {}
    weather = data.get("weather", {})

    if not stints_by_driver:
        return ["No detailed stint data available for this race."]

    # Build a lookup: driver → finish position, team, grid
    driver_info: dict[str, dict] = {}
    for r in results:
        driver_info[r["driver"]] = {
            "team": r["team"],
            "finish": r.get("finish_position"),
            "grid": r.get("grid_position"),
            "status": r["status"],
        }

    # Find first pit stop per driver (lap number)
    first_stops: list[tuple[str, int]] = []
    for driver, stints in stints_by_driver.items():
        if len(stints) >= 2:
            first_pit_lap = stints[0].get("lap_end", 0)
            first_stops.append((driver, first_pit_lap))

    first_stops.sort(key=lambda x: x[1])
    paragraphs = []

    # --- Opening: race conditions ---
    condition = weather.get("condition", "dry")
    temp = weather.get("avg_air_temp")
    if condition == "wet":
        opener = "Rain played a defining role in this race, forcing strategic gambles from the pit wall."
    elif condition == "damp":
        opener = "Mixed conditions kept teams guessing, with the threat of rain hanging over strategy calls."
    else:
        opener = "In dry conditions, tyre management and pit stop timing were everything."
    if temp:
        opener += f" Track temperatures hovered around {temp}°C."
    paragraphs.append(opener)

    # --- Who pitted first and why it mattered ---
    if first_stops:
        first_driver, first_lap = first_stops[0]
        first_info = driver_info.get(first_driver, {})
        first_team = first_info.get("team", "")
        first_finish = first_info.get("finish")

        last_driver, last_lap = first_stops[-1]
        last_info = driver_info.get(last_driver, {})

        p = f"{first_driver} ({first_team}) was the first to blink, pitting on lap {first_lap}."
        if first_finish and first_finish <= 3:
            p += f" The early stop paid off — {first_driver} finished P{first_finish}."
        elif first_finish and first_finish > 10:
            p += f" It didn't work out — {first_driver} ended up P{first_finish}."

        if last_lap - first_lap >= 8:
            p += f" {last_driver} ({last_info.get('team', '')}) stayed out until lap {last_lap}, stretching the first stint {last_lap - first_lap} laps longer."

        paragraphs.append(p)

    # --- Detect undercuts (pitted earlier, finished ahead of someone who started behind) ---
    undercuts = []
    for i, (d1, lap1) in enumerate(first_stops):
        for d2, lap2 in first_stops[i+1:]:
            info1 = driver_info.get(d1, {})
            info2 = driver_info.get(d2, {})
            grid1 = info1.get("grid")
            grid2 = info2.get("grid")
            fin1 = info1.get("finish")
            fin2 = info2.get("finish")
            # d1 pitted before d2. If d1 started behind d2 but finished ahead = undercut
            if (grid1 and grid2 and fin1 and fin2
                    and grid1 > grid2 and fin1 < fin2 and lap1 < lap2):
                undercuts.append((d1, d2, lap1, lap2, fin1))

    if undercuts:
        # Show the most impactful undercut (highest position gained)
        best = min(undercuts, key=lambda x: x[4])
        d1, d2, lap1, lap2, fin1 = best
        info1 = driver_info.get(d1, {})
        paragraphs.append(
            f"{d1} ({info1.get('team', '')}) pulled off a textbook undercut on {d2}, "
            f"pitting on lap {lap1} while {d2} waited until lap {lap2}. "
            f"{d1} emerged ahead and held the position to finish P{fin1}."
        )

    # --- Contrasting strategies ---
    stop_counts: dict[int, list[str]] = {}
    for driver, stints in stints_by_driver.items():
        stops = len(stints) - 1
        stop_counts.setdefault(stops, []).append(driver)

    if len(stop_counts) >= 2:
        sorted_strategies = sorted(stop_counts.items())
        fewest_stops, fewest_drivers = sorted_strategies[0]
        most_stops, most_drivers = sorted_strategies[-1]

        if most_stops - fewest_stops >= 1:
            # Find a notable example from each group
            few_example = fewest_drivers[0]
            many_example = most_drivers[0]
            few_info = driver_info.get(few_example, {})
            many_info = driver_info.get(many_example, {})

            p = (
                f"Strategy variety split the field. "
                f"{few_example} ({few_info.get('team', '')}) committed to a {fewest_stops}-stop, "
                f"while {many_example} ({many_info.get('team', '')}) went aggressive with {most_stops} stops."
            )

            few_finish = few_info.get("finish")
            many_finish = many_info.get("finish")
            if few_finish and many_finish:
                if few_finish < many_finish:
                    p += f" The conservative call worked — {few_example} finished P{few_finish} ahead of {many_example} in P{many_finish}."
                elif many_finish < few_finish:
                    p += f" The aggressive approach won out — {many_example} finished P{many_finish}, ahead of {few_example} in P{few_finish}."

            paragraphs.append(p)

    # --- Winner's strategy summary ---
    winner = next((r for r in results if r.get("finish_position") == 1), None)
    if winner:
        w_driver = winner["driver"]
        w_stints = stints_by_driver.get(w_driver, [])
        if w_stints:
            compounds = [_COMPOUND_LABELS.get(s["compound"], s["compound"]) for s in w_stints]
            stops = len(w_stints) - 1
            compound_seq = " then ".join(compounds)
            grid = winner.get("grid_position")
            p = f"{w_driver} ({winner['team']}) took the win on a {stops}-stop strategy: {compound_seq}."
            if grid and grid > 3:
                p += f" Starting from P{grid}, the strategy was key to climbing through the field."
            paragraphs.append(p)

    return paragraphs


def get_strategy_stats(year: int, track: str) -> dict | None:
    """
    Return race-level strategy statistics for the Data mode side panel.

    Returns a dict:
        most_common   — most popular stop count and how many drivers used it
        strategies    — number of distinct stop strategies used
        first_to_pit  — {driver, team, lap}
        last_to_pit   — {driver, team, lap}
        longest_stint — {driver, team, compound, laps}
        shortest_stint — {driver, team, compound, laps}
        compounds_used — list of unique compounds used in the race

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    stints_by_driver = data.get("stints") or {}

    if not stints_by_driver:
        return None

    # Driver info lookup
    driver_info: dict[str, dict] = {}
    for r in results:
        driver_info[r["driver"]] = {"team": r["team"]}

    # Stop counts
    stop_counts: dict[int, int] = {}
    for driver, stints in stints_by_driver.items():
        stops = len(stints) - 1
        stop_counts[stops] = stop_counts.get(stops, 0) + 1

    most_common_stops = max(stop_counts, key=stop_counts.get) if stop_counts else 1
    most_common_count = stop_counts.get(most_common_stops, 0)

    # First and last to pit
    first_pit = None
    last_pit = None
    for driver, stints in stints_by_driver.items():
        if len(stints) >= 2:
            pit_lap = stints[0].get("lap_end", 0)
            info = driver_info.get(driver, {})
            entry = {"driver": driver, "team": info.get("team", ""), "lap": pit_lap}
            if first_pit is None or pit_lap < first_pit["lap"]:
                first_pit = entry
            if last_pit is None or pit_lap > last_pit["lap"]:
                last_pit = entry

    # Longest and shortest stint
    longest = None
    shortest = None
    for driver, stints in stints_by_driver.items():
        info = driver_info.get(driver, {})
        for s in stints:
            lap_count = s.get("lap_count", 0)
            compound = _COMPOUND_LABELS.get(s.get("compound", ""), s.get("compound", ""))
            entry = {"driver": driver, "team": info.get("team", ""), "compound": compound, "laps": lap_count}
            if lap_count > 0:
                if longest is None or lap_count > longest["laps"]:
                    longest = entry
                if shortest is None or lap_count < shortest["laps"]:
                    shortest = entry

    # Unique compounds
    compounds_used = sorted(set(
        _COMPOUND_LABELS.get(s.get("compound", ""), s.get("compound", ""))
        for stints in stints_by_driver.values()
        for s in stints
        if s.get("compound") and s["compound"] != "UNKNOWN"
    ))

    return {
        "most_common": f"{most_common_stops}-stop ({most_common_count} drivers)",
        "strategies": len(stop_counts),
        "first_to_pit": first_pit,
        "last_to_pit": last_pit,
        "longest_stint": longest,
        "shortest_stint": shortest,
        "compounds_used": compounds_used,
    }


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


def get_season_summary(year: int) -> dict | None:
    """
    Return a high-level summary of a season for the home page year cards.

    Returns a dict:
        year     — the season year
        champion — driver code of the champion (or leader)
        team     — champion's team name
        wins     — number of wins
        races    — number of indexed races
        tagline  — auto-generated one-liner about the season
    """
    standings = get_championship_standings(year)
    if not standings:
        return None

    leader = standings[0]
    wins = leader["wins"]
    races = leader["races"]
    driver = leader["driver"]
    team = leader["team"]

    # Auto-generate a tagline based on dominance
    if wins >= races * 0.8:
        tagline = "dominant season"
    elif wins >= races * 0.6:
        tagline = f"{wins} wins"
    elif wins >= 10:
        tagline = f"{wins} wins"
    elif wins >= 1:
        tagline = f"{wins} win{'s' if wins > 1 else ''}"
    else:
        tagline = f"led with {leader['points']} pts"

    # Check if it was a close fight
    if len(standings) >= 2:
        gap = leader["points"] - standings[1]["points"]
        if gap <= 10 and races >= 10:
            tagline = "title decided last race"
        elif gap <= 25 and races >= 10:
            tagline = "tight championship battle"

    return {
        "year": year,
        "champion": driver,
        "team": team,
        "wins": wins,
        "races": races,
        "tagline": tagline,
    }


def get_all_season_summaries() -> list[dict]:
    """Return season summaries for all years 2010–2024."""
    summaries = []
    for year in range(2024, 2009, -1):
        s = get_season_summary(year)
        if s:
            summaries.append(s)
    return summaries


def get_did_you_know(year: int, track: str) -> list[str]:
    """
    Generate interesting facts about a race from indexed data.

    Scans results, standings, weather, and strategy for notable observations
    and returns a list of plain-English fact strings.

    Returns an empty list if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return []

    results = data["results"]
    weather = data["weather"]
    stints = data.get("stints") or {}

    facts = []

    # --- Finishers and retirements ---
    # Use status-based check (not finish_position) because Jolpica assigns
    # positions even to retired drivers
    finished = [r for r in results if r["finish_position"] is not None]
    retired = [r for r in results if r["status"] not in ("Finished",)
               and not r["status"].startswith("+")]

    if len(retired) >= 5:
        facts.append(f"{len(retired)} drivers retired — an unusually chaotic race.")
    elif len(retired) == 0 and len(finished) > 15:
        facts.append("Every driver finished the race — a clean day.")

    # --- Biggest mover ---
    deltas = []
    for r in finished:
        grid = r.get("grid_position")
        finish = r["finish_position"]
        if grid is not None and finish is not None:
            deltas.append((r["driver"], r["team"], grid - finish))

    if deltas:
        best_gain = max(deltas, key=lambda x: x[2])
        if best_gain[2] >= 5:
            facts.append(
                f"{best_gain[0]} ({best_gain[1]}) gained {best_gain[2]} positions "
                f"— the biggest climb of the race."
            )

        worst_loss = min(deltas, key=lambda x: x[2])
        if worst_loss[2] <= -5:
            facts.append(
                f"{worst_loss[0]} ({worst_loss[1]}) lost {abs(worst_loss[2])} positions "
                f"from the grid."
            )

    # --- Winner from far back ---
    winner = next((r for r in results if r["finish_position"] == 1), None)
    if winner and winner.get("grid_position") and winner["grid_position"] >= 5:
        facts.append(
            f"{winner['driver']} won from P{winner['grid_position']} on the grid "
            f"— a proper fightback victory."
        )

    # --- Strategy variety ---
    if stints:
        stop_counts = set()
        for driver_stints in stints.values():
            if driver_stints:
                stop_counts.add(len(driver_stints) - 1)
        if len(stop_counts) >= 3:
            facts.append(
                f"Drivers used {len(stop_counts)} different pit stop strategies "
                f"— from {min(stop_counts)}-stop to {max(stop_counts)}-stop."
            )

    # --- Weather ---
    condition = weather.get("condition", "")
    if condition == "wet":
        facts.append("A wet race — rain played a major role in the outcome.")
    elif condition == "damp":
        facts.append("Mixed conditions — some rain during the race weekend.")

    temp = weather.get("avg_air_temp")
    if temp is not None:
        if temp >= 35:
            facts.append(f"Scorching {temp}°C air temperature — one of the hottest races of the season.")
        elif temp <= 12:
            facts.append(f"Just {temp}°C air temperature — a cold race by F1 standards.")

    # --- Podium from outside top 10 ---
    for r in finished[:3]:
        grid = r.get("grid_position")
        if grid and grid > 10:
            facts.append(
                f"{r['driver']} made the podium from P{grid} — starting outside the top 10."
            )

    return facts


def get_sidebar_content(year: int, track: str) -> dict | None:
    """
    Return combined sidebar content: articles, Reddit posts, and did-you-know facts.

    Caches RSS and Reddit results to disk on first fetch so subsequent
    loads are instant. Did-you-know is computed from indexed data (always fast).

    Returns a dict:
        articles    — list of article dicts from RSS feeds
        reddit      — dict with race_thread and posts
        did_you_know — list of fact strings

    Returns None if the race is not indexed.
    """
    from backend.core import rss_fetcher, reddit_fetcher

    if not indexer.is_indexed(year, track):
        return None

    race_dir = indexer._race_dir(year, track)

    # --- RSS articles (cached) ---
    rss_cache = race_dir / "sidebar_rss.json"
    if rss_cache.exists():
        with open(rss_cache) as f:
            articles = json.load(f)
    else:
        articles = rss_fetcher.get_race_articles(track, year)
        race_dir.mkdir(parents=True, exist_ok=True)
        with open(rss_cache, "w") as f:
            json.dump(articles, f, indent=2)
        logger.info("Cached %d RSS articles for %s %s", len(articles), year, track)

    # --- Reddit posts (cached) ---
    reddit_cache = race_dir / "sidebar_reddit.json"
    if reddit_cache.exists():
        with open(reddit_cache) as f:
            reddit = json.load(f)
    else:
        reddit = reddit_fetcher.get_race_posts(track, year)
        with open(reddit_cache, "w") as f:
            json.dump(reddit, f, indent=2)
        logger.info("Cached Reddit data for %s %s", year, track)

    # --- Did you know (computed, no cache needed) ---
    did_you_know = get_did_you_know(year, track)

    return {
        "articles": articles,
        "reddit": reddit,
        "did_you_know": did_you_know,
    }


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
