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


# Driver code → full name mapping (2010–2024)
_DRIVER_NAMES: dict[str, str] = {
    "AIT": "Jack Aitken", "ALB": "Alexander Albon", "ALG": "Jaime Alguersuari",
    "ALO": "Fernando Alonso", "ANT": "Kimi Antonelli", "BAR": "Rubens Barrichello",
    "BEA": "Oliver Bearman", "BIA": "Jules Bianchi", "BOT": "Valtteri Bottas",
    "BUE": "Sebastien Buemi", "BUT": "Jenson Button", "CHA": "Karun Chandhok",
    "CHI": "Max Chilton", "COL": "Franco Colapinto", "DEV": "Nyck de Vries",
    "DIR": "Paul di Resta", "DOO": "Jack Doohan", "ERI": "Marcus Ericsson",
    "FIT": "Pietro Fittipaldi", "GAS": "Pierre Gasly", "GIO": "Antonio Giovinazzi",
    "GLO": "Timo Glock", "GRO": "Romain Grosjean", "GUT": "Esteban Gutierrez",
    "HAM": "Lewis Hamilton", "HAR": "Brendon Hartley", "HEI": "Nick Heidfeld",
    "HUL": "Nico Hulkenberg", "KAR": "Narain Karthikeyan", "KOB": "Kamui Kobayashi",
    "KOV": "Heikki Kovalainen", "KUB": "Robert Kubica", "KVY": "Daniil Kvyat",
    "LAT": "Nicholas Latifi", "LAW": "Liam Lawson", "LEC": "Charles Leclerc",
    "MAG": "Kevin Magnussen", "MAL": "Pastor Maldonado", "MAS": "Felipe Massa",
    "MAZ": "Nikita Mazepin", "MER": "Roberto Merhi", "MSC": "Mick Schumacher",
    "NAS": "Felipe Nasr", "NOR": "Lando Norris", "OCO": "Esteban Ocon",
    "PAL": "Jolyon Palmer", "PER": "Sergio Perez", "PET": "Vitaly Petrov",
    "PIA": "Oscar Piastri", "PIC": "Charles Pic", "RAI": "Kimi Raikkonen",
    "RIC": "Daniel Ricciardo", "ROS": "Nico Rosberg", "RUS": "George Russell",
    "SAI": "Carlos Sainz", "SAR": "Logan Sargeant", "SEN": "Bruno Senna",
    "SIR": "Sergey Sirotkin", "STE": "Will Stevens", "STR": "Lance Stroll",
    "SUT": "Adrian Sutil", "TRU": "Jarno Trulli", "TSU": "Yuki Tsunoda",
    "VAN": "Stoffel Vandoorne", "VER": "Max Verstappen", "VET": "Sebastian Vettel",
    "WEB": "Mark Webber", "WEH": "Pascal Wehrlein", "ZHO": "Guanyu Zhou",
}


def _dn(code: str) -> str:
    """Return 'Full Name (CODE)' for a driver code."""
    name = _DRIVER_NAMES.get(code, code)
    return f"{name} ({code})" if name != code else code


def get_strategy_narrative(year: int, track: str) -> list[dict] | None:
    """
    Auto-generate a structured race strategy narrative from stint data.

    Returns a list of section dicts, each with:
        heading  — section title (e.g. "The Opening Gambit")
        body     — prose paragraph with full driver names

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    stints_by_driver = data.get("stints") or {}
    weather = data.get("weather", {})

    if not stints_by_driver:
        return [{"heading": "Strategy", "body": "No detailed stint data available for this race."}]

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
    sections = []

    # --- Section 1: Race Conditions ---
    condition = weather.get("condition", "dry")
    temp = weather.get("avg_air_temp")
    if condition == "wet":
        body = "Rain played a defining role in this race, forcing strategic gambles from the pit wall."
    elif condition == "damp":
        body = "Mixed conditions kept teams guessing, with the threat of rain hanging over every strategy call."
    else:
        body = "Under clear skies, this race came down to tyre management and pit stop timing."
    if temp:
        body += f" Air temperatures sat around {temp}°C."
    sections.append({"heading": "Race Conditions", "body": body})

    # --- Section 2: The Opening Gambit ---
    if first_stops:
        first_driver, first_lap = first_stops[0]
        first_info = driver_info.get(first_driver, {})
        first_team = first_info.get("team", "")
        first_finish = first_info.get("finish")

        last_driver, last_lap = first_stops[-1]
        last_info = driver_info.get(last_driver, {})

        body = f"{_dn(first_driver)} was the first to pit, diving in on lap {first_lap}."
        if first_finish and first_finish <= 3:
            body += f" The early call was a masterstroke — {_DRIVER_NAMES.get(first_driver, first_driver)} came home in P{first_finish}."
        elif first_finish and first_finish > 10:
            body += f" It was a gamble that didn't pay off — {_DRIVER_NAMES.get(first_driver, first_driver)} ended up in P{first_finish}."

        if last_lap - first_lap >= 8:
            body += (
                f" At the other end of the spectrum, {_dn(last_driver)} stretched their first stint all the way to lap {last_lap} "
                f"— {last_lap - first_lap} laps longer on the same rubber."
            )

        sections.append({"heading": "The Opening Gambit", "body": body})

    # --- Section 3: The Key Move (undercut detection) ---
    undercuts = []
    for i, (d1, lap1) in enumerate(first_stops):
        for d2, lap2 in first_stops[i+1:]:
            info1 = driver_info.get(d1, {})
            info2 = driver_info.get(d2, {})
            grid1 = info1.get("grid")
            grid2 = info2.get("grid")
            fin1 = info1.get("finish")
            fin2 = info2.get("finish")
            if (grid1 and grid2 and fin1 and fin2
                    and grid1 > grid2 and fin1 < fin2 and lap1 < lap2):
                undercuts.append((d1, d2, lap1, lap2, fin1))

    if undercuts:
        best = min(undercuts, key=lambda x: x[4])
        d1, d2, lap1, lap2, fin1 = best
        body = (
            f"{_dn(d1)} pulled off a textbook undercut on {_dn(d2)}. "
            f"{_DRIVER_NAMES.get(d1, d1)} pitted on lap {lap1} while "
            f"{_DRIVER_NAMES.get(d2, d2)} stayed out until lap {lap2}. "
            f"The fresh rubber gave {_DRIVER_NAMES.get(d1, d1)} the edge — "
            f"emerging ahead and holding the position to finish P{fin1}."
        )
        sections.append({"heading": "The Key Move", "body": body})

    # --- Section 4: Strategy Split ---
    stop_counts: dict[int, list[str]] = {}
    for driver, stints in stints_by_driver.items():
        stops = len(stints) - 1
        stop_counts.setdefault(stops, []).append(driver)

    if len(stop_counts) >= 2:
        sorted_strategies = sorted(stop_counts.items())
        fewest_stops, fewest_drivers = sorted_strategies[0]
        most_stops, most_drivers = sorted_strategies[-1]

        if most_stops - fewest_stops >= 1:
            few_example = fewest_drivers[0]
            many_example = most_drivers[0]
            few_info = driver_info.get(few_example, {})
            many_info = driver_info.get(many_example, {})

            body = (
                f"The field split on strategy. "
                f"{_dn(few_example)} took the conservative route with a {fewest_stops}-stop, "
                f"while {_dn(many_example)} went aggressive on {most_stops} stops."
            )

            few_finish = few_info.get("finish")
            many_finish = many_info.get("finish")
            if few_finish and many_finish:
                if few_finish < many_finish:
                    body += (
                        f" The patience paid off — {_DRIVER_NAMES.get(few_example, few_example)} finished P{few_finish}, "
                        f"ahead of {_DRIVER_NAMES.get(many_example, many_example)} in P{many_finish}."
                    )
                elif many_finish < few_finish:
                    body += (
                        f" The aggression paid off — {_DRIVER_NAMES.get(many_example, many_example)} finished P{many_finish}, "
                        f"ahead of {_DRIVER_NAMES.get(few_example, few_example)} in P{few_finish}."
                    )

            # Add breakdown of how many drivers per strategy
            breakdown = ", ".join(f"{count} on a {stops}-stop" for stops, count in sorted(
                [(s, len(d)) for s, d in stop_counts.items()]
            ))
            body += f" Across the grid: {breakdown}."

            sections.append({"heading": "Strategy Split", "body": body})

    # --- Section 5: The Winning Formula ---
    winner = next((r for r in results if r.get("finish_position") == 1), None)
    if winner:
        w_driver = winner["driver"]
        w_stints = stints_by_driver.get(w_driver, [])
        if w_stints:
            compounds = [_COMPOUND_LABELS.get(s["compound"], s["compound"]) for s in w_stints]
            stops = len(w_stints) - 1
            compound_seq = " followed by ".join(compounds)
            grid = winner.get("grid_position")
            body = f"{_dn(w_driver)} took the chequered flag on a {stops}-stop strategy: {compound_seq}."
            if grid and grid <= 2:
                body += f" Starting from P{grid}, track position was never in doubt."
            elif grid and grid <= 5:
                body += f" Starting from P{grid}, a clean strategy kept {_DRIVER_NAMES.get(w_driver, w_driver)} in the fight."
            elif grid and grid > 5:
                body += f" Starting from P{grid}, the strategy was instrumental in climbing through the field."
            sections.append({"heading": "The Winning Formula", "body": body})

    return sections


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

    # Strategy breakdown: "1-stop: 13, 2-stop: 5, 0-stop: 1, 3-stop: 1"
    strategy_breakdown = [
        {"strategy": f"{stops}-stop", "count": count}
        for stops, count in sorted(stop_counts.items())
    ]

    return {
        "most_common": f"{most_common_stops}-stop ({most_common_count} drivers)",
        "strategy_breakdown": strategy_breakdown,
        "first_to_pit": first_pit,
        "last_to_pit": last_pit,
        "longest_stint": longest,
        "shortest_stint": shortest,
        "compounds_used": compounds_used,
    }


def get_key_moments(year: int, track: str) -> list[dict] | None:
    """
    Auto-detect interesting race moments from results, standings, and stint data.

    Returns a list of moment dicts, each with:
        type     — moment category (e.g. 'biggest_gainer', 'undercut', 'close_battle')
        headline — short summary (e.g. 'Hamilton gained 4 places')
        detail   — longer explanation
        driver   — primary driver code involved

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    stints_by_driver = data.get("stints") or {}

    # Build lookups
    driver_info: dict[str, dict] = {}
    for r in results:
        driver_info[r["driver"]] = {
            "team": r["team"],
            "finish": r.get("finish_position"),
            "grid": r.get("grid_position"),
            "status": r["status"],
        }

    finishers = sorted(
        [r for r in results if r["finish_position"] is not None],
        key=lambda r: r["finish_position"],
    )
    retired = [r for r in results
               if r["status"] not in ("Finished",) and not r["status"].startswith("+")]

    moments = []

    # --- Biggest gainer ---
    best_gain = None
    for r in finishers:
        grid = r.get("grid_position")
        finish = r["finish_position"]
        if grid is not None and finish is not None:
            delta = grid - finish
            if delta >= 3 and (best_gain is None or delta > best_gain[1]):
                best_gain = (r, delta)

    if best_gain:
        r, delta = best_gain
        moments.append({
            "type": "biggest_gainer",
            "headline": f"{_dn(r['driver'])} gained {delta} places",
            "detail": (
                f"Started P{r['grid_position']}, finished P{r['finish_position']}. "
                f"The biggest forward charge of the race for {r['team']}."
            ),
            "driver": r["driver"],
        })

    # --- Biggest loser (excl. retirements) ---
    worst_loss = None
    for r in finishers:
        grid = r.get("grid_position")
        finish = r["finish_position"]
        status = r["status"]
        if (grid is not None and finish is not None
                and status in ("Finished",) or status.startswith("+")):
            delta = grid - finish  # negative = lost places
            if delta <= -3 and (worst_loss is None or delta < worst_loss[1]):
                worst_loss = (r, delta)

    if worst_loss:
        r, delta = worst_loss
        moments.append({
            "type": "biggest_loser",
            "headline": f"{_dn(r['driver'])} dropped {abs(delta)} places",
            "detail": (
                f"Started P{r['grid_position']} but fell to P{r['finish_position']}. "
                f"A tough afternoon for {r['team']}."
            ),
            "driver": r["driver"],
        })

    # --- Comeback drive (started outside top 10, finished top 5) ---
    for r in finishers[:5]:
        grid = r.get("grid_position")
        finish = r["finish_position"]
        if grid and grid > 10 and finish and finish <= 5:
            moments.append({
                "type": "comeback",
                "headline": f"{_dn(r['driver'])} stormed from P{grid} to P{finish}",
                "detail": (
                    f"Starting outside the top 10, {_DRIVER_NAMES.get(r['driver'], r['driver'])} "
                    f"carved through the field to finish in the top 5 for {r['team']}."
                ),
                "driver": r["driver"],
            })

    # --- Dominant win (pole to victory, no position lost) ---
    if finishers:
        winner = finishers[0]
        grid = winner.get("grid_position")
        if grid == 1:
            moments.append({
                "type": "dominant_win",
                "headline": f"{_dn(winner['driver'])} converted pole to victory",
                "detail": (
                    f"Led from lights out to chequered flag. "
                    f"A commanding performance by {winner['team']}."
                ),
                "driver": winner["driver"],
            })

    # --- Undercut detection (reusing logic from strategy narrative) ---
    first_stops: list[tuple[str, int]] = []
    for driver, stints in stints_by_driver.items():
        if len(stints) >= 2:
            first_pit_lap = stints[0].get("lap_end", 0)
            first_stops.append((driver, first_pit_lap))
    first_stops.sort(key=lambda x: x[1])

    undercuts = []
    for i, (d1, lap1) in enumerate(first_stops):
        for d2, lap2 in first_stops[i + 1:]:
            info1 = driver_info.get(d1, {})
            info2 = driver_info.get(d2, {})
            grid1, grid2 = info1.get("grid"), info2.get("grid")
            fin1, fin2 = info1.get("finish"), info2.get("finish")
            if (grid1 and grid2 and fin1 and fin2
                    and grid1 > grid2 and fin1 < fin2 and lap1 < lap2):
                undercuts.append((d1, d2, lap1, lap2, fin1))

    if undercuts:
        best = min(undercuts, key=lambda x: x[4])  # best finishing position
        d1, d2, lap1, lap2, fin1 = best
        moments.append({
            "type": "undercut",
            "headline": f"{_dn(d1)} undercut {_dn(d2)}",
            "detail": (
                f"{_DRIVER_NAMES.get(d1, d1)} pitted on lap {lap1}, "
                f"{_DRIVER_NAMES.get(d2, d2)} waited until lap {lap2}. "
                f"The early stop worked — {_DRIVER_NAMES.get(d1, d1)} finished P{fin1}."
            ),
            "driver": d1,
        })

    # --- Close battle (consecutive finishers, different teams) ---
    for i in range(len(finishers) - 1):
        r1 = finishers[i]
        r2 = finishers[i + 1]
        if r1["team"] != r2["team"] and r1["finish_position"] <= 10:
            grid1 = r1.get("grid_position")
            grid2 = r2.get("grid_position")
            # Detect when a driver from behind on the grid fought past
            if grid1 and grid2 and grid1 > grid2:
                moments.append({
                    "type": "close_battle",
                    "headline": f"{_dn(r1['driver'])} beat {_dn(r2['driver'])} in a grid-defying fight",
                    "detail": (
                        f"{_DRIVER_NAMES.get(r1['driver'], r1['driver'])} started P{grid1} behind "
                        f"{_DRIVER_NAMES.get(r2['driver'], r2['driver'])} (P{grid2}) but finished ahead — "
                        f"P{r1['finish_position']} vs P{r2['finish_position']}."
                    ),
                    "driver": r1["driver"],
                })
                break  # only show the best one

    # --- High retirement count ---
    if len(retired) >= 5:
        moments.append({
            "type": "attrition",
            "headline": f"{len(retired)} drivers retired",
            "detail": (
                f"A race of attrition — {len(retired)} out of {len(results)} starters "
                f"failed to see the chequered flag."
            ),
            "driver": retired[0]["driver"] if retired else None,
        })

    return moments


# F1 points awarded per finishing position (standard system, no fastest lap)
_POINTS_TABLE = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}


def get_season_story(year: int, track: str) -> dict | None:
    """
    Return season-level story context for a specific race.

    Calculates everything relative to the given race's position in the calendar:
    only races up to and including this one contribute to the numbers.

    Returns a dict:
        momentum        — top 5 drivers by points in the last 5 races
        turning_points  — races where the championship lead changed or gap swung big
        constructor_battle — team standings at this point in the season
        race_round      — which round this race is (e.g. 10 of 22)
        total_rounds    — total races in the season

    Returns None if the race is not indexed or season schedule unavailable.
    """
    if not indexer.is_indexed(year, track):
        return None

    schedule = loader.get_season_schedule(year)
    if not schedule:
        return None

    # Find this race's round number and build chronological list up to this race
    race_names_in_order = [s["name"] for s in schedule]
    if track not in race_names_in_order:
        return None

    race_index = race_names_in_order.index(track)
    total_rounds = len(race_names_in_order)
    races_so_far = race_names_in_order[: race_index + 1]

    # Collect results for all indexed races up to this point
    race_results: list[tuple[str, dict]] = []  # (track_name, {driver: finish_pos})
    for t in races_so_far:
        if not indexer.is_indexed(year, t):
            continue
        data = indexer.load_race_index(year, t)
        if data is None:
            continue
        race_results.append((t, data["results"]))

    if not race_results:
        return None

    # --- Momentum: points in the last 5 races ---
    recent = race_results[-5:]
    momentum_tally: dict[str, dict] = {}  # driver -> {points, team, results}
    for race_name, results in recent:
        for r in results:
            drv = r["driver"]
            pos = r.get("finish_position")
            pts = _POINTS_TABLE.get(pos, 0) if pos else 0
            if drv not in momentum_tally:
                momentum_tally[drv] = {"points": 0, "team": r["team"], "results": []}
            momentum_tally[drv]["points"] += pts
            momentum_tally[drv]["team"] = r["team"]
            momentum_tally[drv]["results"].append({"race": race_name, "position": pos, "points": pts})

    momentum = sorted(
        [
            {"driver": drv, "full_name": _DRIVER_NAMES.get(drv, drv), "team": info["team"],
             "points": info["points"], "results": info["results"]}
            for drv, info in momentum_tally.items()
        ],
        key=lambda x: -x["points"],
    )[:5]

    # --- Championship standings at this point ---
    season_tally: dict[str, dict] = {}
    for race_name, results in race_results:
        for r in results:
            drv = r["driver"]
            pos = r.get("finish_position")
            pts = _POINTS_TABLE.get(pos, 0) if pos else 0
            if drv not in season_tally:
                season_tally[drv] = {"points": 0, "wins": 0, "team": r["team"]}
            season_tally[drv]["points"] += pts
            season_tally[drv]["wins"] += 1 if pos == 1 else 0
            season_tally[drv]["team"] = r["team"]

    # --- Turning points: detect lead changes and big swings ---
    turning_points = []
    prev_leader = None
    prev_gap = 0
    running_tally: dict[str, int] = {}

    for race_name, results in race_results:
        for r in results:
            drv = r["driver"]
            pos = r.get("finish_position")
            pts = _POINTS_TABLE.get(pos, 0) if pos else 0
            running_tally[drv] = running_tally.get(drv, 0) + pts

        if not running_tally:
            continue

        sorted_drivers = sorted(running_tally.items(), key=lambda x: -x[1])
        leader = sorted_drivers[0][0]
        leader_pts = sorted_drivers[0][1]
        second_pts = sorted_drivers[1][1] if len(sorted_drivers) > 1 else 0
        gap = leader_pts - second_pts

        # Lead change
        if prev_leader and leader != prev_leader:
            turning_points.append({
                "race": race_name,
                "type": "lead_change",
                "headline": f"{_dn(leader)} takes the championship lead",
                "detail": f"{_DRIVER_NAMES.get(leader, leader)} overtook "
                          f"{_DRIVER_NAMES.get(prev_leader, prev_leader)} in the standings "
                          f"after the {race_name}. Gap: {gap} points.",
            })

        # Big swing (gap changed by 15+ points in one race)
        elif prev_leader and leader == prev_leader and abs(gap - prev_gap) >= 15:
            if gap > prev_gap:
                turning_points.append({
                    "race": race_name,
                    "type": "gap_extension",
                    "headline": f"{_dn(leader)} extends lead to {gap} points",
                    "detail": f"The gap grew by {gap - prev_gap} points after the {race_name}.",
                })
            else:
                second = sorted_drivers[1][0] if len(sorted_drivers) > 1 else None
                if second:
                    turning_points.append({
                        "race": race_name,
                        "type": "gap_closing",
                        "headline": f"{_dn(second)} closes to {gap} points",
                        "detail": f"The gap shrank by {prev_gap - gap} points after the {race_name}.",
                    })

        prev_leader = leader
        prev_gap = gap

    # --- Constructor battle: team standings at this point ---
    team_tally: dict[str, int] = {}
    for race_name, results in race_results:
        for r in results:
            team = r["team"]
            pos = r.get("finish_position")
            pts = _POINTS_TABLE.get(pos, 0) if pos else 0
            team_tally[team] = team_tally.get(team, 0) + pts

    constructor_battle = sorted(
        [{"team": team, "points": pts} for team, pts in team_tally.items()],
        key=lambda x: -x["points"],
    )[:5]

    return {
        "momentum": momentum,
        "turning_points": turning_points[-5:],  # last 5 most relevant
        "constructor_battle": constructor_battle,
        "race_round": race_index + 1,
        "total_rounds": total_rounds,
    }


def get_season_insights(year: int) -> dict | None:
    """
    Auto-generate end-of-season awards and teammate head-to-head records.

    Scans all indexed races for the given year and computes:
        awards     — list of auto-detected awards (best gainer, most consistent, etc.)
        h2h        — teammate head-to-head finishing records per team

    Returns None if fewer than 3 races are indexed.
    """
    indexed = [r for r in indexer.list_indexed() if r["year"] == year]
    if len(indexed) < 3:
        return None

    # Get chronological order from schedule
    schedule = loader.get_season_schedule(year)
    if not schedule:
        return None
    race_names_in_order = [s["name"] for s in schedule]

    # Load all indexed race results in calendar order
    all_results: list[tuple[str, list[dict]]] = []
    for track_name in race_names_in_order:
        if not indexer.is_indexed(year, track_name):
            continue
        data = indexer.load_race_index(year, track_name)
        if data:
            all_results.append((track_name, data["results"]))

    if not all_results:
        return None

    num_races = len(all_results)

    # --- Per-driver stats across the season ---
    driver_stats: dict[str, dict] = {}
    for race_name, results in all_results:
        for r in results:
            drv = r["driver"]
            if drv not in driver_stats:
                driver_stats[drv] = {
                    "team": r["team"],
                    "finishes": [],
                    "grids": [],
                    "gains": [],
                    "top3": 0,
                    "top10": 0,
                    "wins": 0,
                    "dnfs": 0,
                    "races": 0,
                }
            s = driver_stats[drv]
            s["team"] = r["team"]
            s["races"] += 1
            pos = r.get("finish_position")
            grid = r.get("grid_position")
            status = r["status"]

            is_retired = status not in ("Finished",) and not status.startswith("+")

            if is_retired:
                s["dnfs"] += 1
                s["finishes"].append(None)
            else:
                s["finishes"].append(pos)
                if pos and pos <= 3:
                    s["top3"] += 1
                if pos and pos <= 10:
                    s["top10"] += 1
                if pos == 1:
                    s["wins"] += 1

            if grid is not None:
                s["grids"].append(grid)

            if pos is not None and grid is not None and not is_retired:
                s["gains"].append(grid - pos)

    awards = []

    # --- Best Starter: most total positions gained ---
    best_gainer = None
    best_gain_total = 0
    for drv, s in driver_stats.items():
        if s["races"] >= 3 and s["gains"]:
            total_gain = sum(g for g in s["gains"] if g > 0)
            if total_gain > best_gain_total:
                best_gain_total = total_gain
                best_gainer = drv

    if best_gainer:
        s = driver_stats[best_gainer]
        avg = round(best_gain_total / len(s["gains"]), 1)
        awards.append({
            "title": "Best Starter",
            "driver": best_gainer,
            "full_name": _DRIVER_NAMES.get(best_gainer, best_gainer),
            "team": s["team"],
            "stat": f"+{best_gain_total} positions gained",
            "detail": f"Gained positions in {len([g for g in s['gains'] if g > 0])} races, avg +{avg} per race",
        })

    # --- Most Consistent: most top-3 finishes ---
    most_consistent = max(driver_stats.items(), key=lambda x: x[1]["top3"], default=None)
    if most_consistent and most_consistent[1]["top3"] >= 2:
        drv, s = most_consistent
        awards.append({
            "title": "Most Consistent",
            "driver": drv,
            "full_name": _DRIVER_NAMES.get(drv, drv),
            "team": s["team"],
            "stat": f"{s['top3']}/{s['races']} races in top 3",
            "detail": f"{s['wins']} wins, {s['top3']} podiums from {s['races']} starts",
        })

    # --- Worst Luck: most DNFs ---
    worst_luck = max(driver_stats.items(), key=lambda x: x[1]["dnfs"], default=None)
    if worst_luck and worst_luck[1]["dnfs"] >= 2:
        drv, s = worst_luck
        awards.append({
            "title": "Worst Luck",
            "driver": drv,
            "full_name": _DRIVER_NAMES.get(drv, drv),
            "team": s["team"],
            "stat": f"{s['dnfs']} DNFs",
            "detail": f"Failed to finish {s['dnfs']} out of {s['races']} races",
        })

    # --- Points Machine: most points-scoring finishes (top 10) ---
    points_machine = max(driver_stats.items(), key=lambda x: x[1]["top10"], default=None)
    if points_machine:
        drv, s = points_machine
        # Only show if different from most consistent
        if drv != (most_consistent[0] if most_consistent else None):
            awards.append({
                "title": "Points Machine",
                "driver": drv,
                "full_name": _DRIVER_NAMES.get(drv, drv),
                "team": s["team"],
                "stat": f"{s['top10']}/{s['races']} races in the points",
                "detail": f"Scored points in {round(s['top10'] / s['races'] * 100)}% of starts",
            })

    # --- Best Qualifier: lowest average grid position ---
    best_qualifier = None
    best_avg_grid = 99.0
    for drv, s in driver_stats.items():
        if len(s["grids"]) >= 3:
            avg_grid = sum(s["grids"]) / len(s["grids"])
            if avg_grid < best_avg_grid:
                best_avg_grid = avg_grid
                best_qualifier = drv

    if best_qualifier:
        s = driver_stats[best_qualifier]
        poles = sum(1 for g in s["grids"] if g == 1)
        awards.append({
            "title": "Best Qualifier",
            "driver": best_qualifier,
            "full_name": _DRIVER_NAMES.get(best_qualifier, best_qualifier),
            "team": s["team"],
            "stat": f"Avg grid P{best_avg_grid:.1f}",
            "detail": f"{poles} pole{'s' if poles != 1 else ''} from {len(s['grids'])} qualifying sessions",
        })

    # --- Teammate Head-to-Head ---
    # Group drivers by team, only teams with exactly 2 drivers
    from collections import defaultdict
    team_drivers: dict[str, list[str]] = defaultdict(list)
    for drv, s in driver_stats.items():
        if s["races"] >= 3:
            team_drivers[s["team"]].append(drv)

    h2h = []
    for team, drivers in sorted(team_drivers.items()):
        if len(drivers) != 2:
            continue
        d1, d2 = sorted(drivers)

        d1_ahead = 0
        d2_ahead = 0
        for race_name, results in all_results:
            pos1 = None
            pos2 = None
            for r in results:
                if r["driver"] == d1:
                    status1 = r["status"]
                    if status1 in ("Finished",) or status1.startswith("+"):
                        pos1 = r.get("finish_position")
                elif r["driver"] == d2:
                    status2 = r["status"]
                    if status2 in ("Finished",) or status2.startswith("+"):
                        pos2 = r.get("finish_position")

            if pos1 is not None and pos2 is not None:
                if pos1 < pos2:
                    d1_ahead += 1
                elif pos2 < pos1:
                    d2_ahead += 1

        if d1_ahead + d2_ahead > 0:
            # Put the winner first
            if d2_ahead > d1_ahead:
                d1, d2 = d2, d1
                d1_ahead, d2_ahead = d2_ahead, d1_ahead

            h2h.append({
                "team": team,
                "driver1": d1,
                "name1": _DRIVER_NAMES.get(d1, d1),
                "score1": d1_ahead,
                "driver2": d2,
                "name2": _DRIVER_NAMES.get(d2, d2),
                "score2": d2_ahead,
            })

    return {
        "awards": awards,
        "h2h": h2h,
        "races_counted": num_races,
    }


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
    from datetime import datetime
    for year in range(datetime.now().year, 2009, -1):
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
    Return sidebar content: did-you-know facts.

    Returns a dict:
        did_you_know — list of fact strings

    Returns None if the race is not indexed.
    """
    if not indexer.is_indexed(year, track):
        return None

    did_you_know = get_did_you_know(year, track)

    return {
        "did_you_know": did_you_know,
    }


# ---------------------------------------------------------------------------
# Race tagline + story
# ---------------------------------------------------------------------------

def generate_race_tagline(year: int, track: str) -> str | None:
    """
    Generate a one-line tagline for a race — a film-poster hook.

    Rules (checked in priority order):
    - 5+ retirements  → chaos tagline
    - Wet conditions   → rain tagline
    - Winner from P6+  → comeback tagline
    - Winner from pole with few retirements → dominance tagline
    - Close P1/P2 battle (same team)        → team battle tagline
    - Team 1-2 finish  → team dominance tagline
    - Fallback         → generic winner tagline
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data.get("weather", {})
    condition = weather.get("condition", "dry")

    finished = [r for r in results if r.get("finish_position") is not None]
    finished_sorted = sorted(finished, key=lambda r: r["finish_position"])
    dnf = [r for r in results
           if r["status"] not in ("Finished", "Lapped")
           and not r["status"].startswith("+")]

    if not finished_sorted:
        return None

    winner = finished_sorted[0]
    w_name = _DRIVER_NAMES.get(winner["driver"], winner["driver"])
    w_grid = winner.get("grid_position")
    w_team = winner["team"]

    # Check for team 1-2
    team_12 = (
        len(finished_sorted) >= 2
        and finished_sorted[0]["team"] == finished_sorted[1]["team"]
    )

    # Chaos race
    if len(dnf) >= 5:
        return "The race nobody finished unscathed"

    # Wet race
    if condition == "wet":
        return f"Rain rewrote the script at {track.replace(' Grand Prix', '')}"

    # Big comeback win
    if w_grid and w_grid >= 6:
        return f"The day {w_name} defied a P{w_grid} start"

    # Dominant pole-to-win
    if w_grid and w_grid == 1 and len(dnf) <= 2:
        return "A masterclass from lights to flag"

    # Team 1-2
    if team_12:
        return f"{w_team}'s day — and everyone else was racing for third"

    # Damp / mixed conditions
    if condition == "damp":
        return f"Changeable skies shook up the order at {track.replace(' Grand Prix', '')}"

    # Winner from P2-P5 (overtook for the lead)
    if w_grid and 2 <= w_grid <= 5:
        return f"{w_name} made the decisive move from P{w_grid}"

    # Fallback
    return f"{w_name} took the victory"


# ---------------------------------------------------------------------------
# Pattern Matcher — find similar historical races
# ---------------------------------------------------------------------------

def _extract_race_profile(year: int, track: str) -> dict | None:
    """Extract a compact profile of a race for similarity matching."""
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data.get("weather", {})
    stints = data.get("stints") or {}

    finished = [r for r in results if r.get("finish_position") is not None]
    finished_sorted = sorted(finished, key=lambda r: r["finish_position"])
    dnf = [r for r in results
           if r["status"] not in ("Finished", "Lapped")
           and not r["status"].startswith("+")]

    if not finished_sorted:
        return None

    winner = finished_sorted[0]
    w_grid = winner.get("grid_position") or 1

    # Biggest position gain
    max_gain = 0
    for r in finished_sorted:
        g = r.get("grid_position")
        f = r["finish_position"]
        if g and f:
            max_gain = max(max_gain, g - f)

    # Dominant strategy (most common stop count)
    stop_counts: dict[int, int] = {}
    for d, sts in stints.items():
        sc = len(sts) - 1
        stop_counts[sc] = stop_counts.get(sc, 0) + 1
    dominant_stops = max(stop_counts, key=stop_counts.get) if stop_counts else 1

    # Circuit name (strip "Grand Prix" variants to get base circuit)
    circuit = track.replace(" Grand Prix", "")

    return {
        "year": year,
        "track": track,
        "circuit": circuit,
        "condition": weather.get("condition", "dry"),
        "winner": winner["driver"],
        "winner_team": winner["team"],
        "winner_grid": w_grid,
        "dnf_count": len(dnf),
        "max_gain": max_gain,
        "dominant_stops": dominant_stops,
        "pole_won": w_grid == 1,
        "team_12": (
            len(finished_sorted) >= 2
            and finished_sorted[0]["team"] == finished_sorted[1]["team"]
        ),
    }


def find_similar_races(year: int, track: str, max_results: int = 5) -> list[dict] | None:
    """
    Find historically similar races based on shared characteristics.

    Scoring: each shared trait adds points. Races with higher scores are more similar.
    Excludes the input race itself.

    Returns a list of dicts with:
        year, track, score, reasons (list of why it matched)
    """
    target = _extract_race_profile(year, track)
    if target is None:
        return None

    all_races = indexer.list_indexed()
    candidates = []

    for race in all_races:
        ry, rt = race["year"], race["track"]
        if ry == year and rt == track:
            continue  # skip self

        profile = _extract_race_profile(ry, rt)
        if profile is None:
            continue

        score = 0
        reasons = []

        # Same circuit (strongest signal)
        if profile["circuit"] == target["circuit"]:
            score += 5
            reasons.append(f"Same circuit ({profile['circuit']})")

        # Same weather conditions
        if profile["condition"] == target["condition"]:
            score += 2
            if profile["condition"] != "dry":
                reasons.append(f"Also {profile['condition']} conditions")
        elif profile["condition"] != "dry" and target["condition"] != "dry":
            score += 1
            reasons.append("Also ran in mixed/wet conditions")

        # Similar winner grid position (comeback vs dominance)
        grid_diff = abs(profile["winner_grid"] - target["winner_grid"])
        if grid_diff <= 1:
            score += 3
            if target["winner_grid"] >= 6:
                reasons.append(f"Winner also started P{profile['winner_grid']}")
            elif target["winner_grid"] == 1:
                reasons.append("Also a pole-to-win")
        elif grid_diff <= 3:
            score += 1

        # Same winner
        if profile["winner"] == target["winner"]:
            score += 2
            reasons.append(f"{_DRIVER_NAMES.get(target['winner'], target['winner'])} also won")

        # Same winning team
        if profile["winner_team"] == target["winner_team"]:
            score += 1

        # Similar chaos level (DNFs)
        dnf_diff = abs(profile["dnf_count"] - target["dnf_count"])
        if target["dnf_count"] >= 5 and profile["dnf_count"] >= 5:
            score += 3
            reasons.append(f"Also high attrition ({profile['dnf_count']} DNFs)")
        elif dnf_diff <= 1:
            score += 1

        # Both team 1-2 finishes
        if profile["team_12"] and target["team_12"]:
            score += 2
            reasons.append(f"{profile['winner_team']} also finished 1-2")

        # Similar biggest mover
        gain_diff = abs(profile["max_gain"] - target["max_gain"])
        if target["max_gain"] >= 6 and profile["max_gain"] >= 6 and gain_diff <= 2:
            score += 2
            reasons.append(f"Also had a big comeback ({profile['max_gain']}+ places)")

        # Similar strategy
        if profile["dominant_stops"] == target["dominant_stops"]:
            score += 1

        # Only include meaningful matches
        if score >= 4 and reasons:
            candidates.append({
                "year": ry,
                "track": rt,
                "score": score,
                "reasons": reasons,
                "winner": profile["winner"],
                "winner_name": _DRIVER_NAMES.get(profile["winner"], profile["winner"]),
                "condition": profile["condition"],
            })

    # Sort by score descending, then by year descending (most recent first)
    candidates.sort(key=lambda c: (-c["score"], -c["year"]))
    return candidates[:max_results]


def get_auto_precedents(year: int, track: str) -> dict | None:
    """
    Generate a "What History Tells Us" section for a race page.

    Analyzes similar races to produce 2-3 short insight sentences
    and a list of matching races as references.

    Returns a dict with:
        insights  — list of plain-English insight strings
        matches   — list of {year, track, winner_name, reasons}
    """
    similar = find_similar_races(year, track, max_results=6)
    if not similar:
        return None

    target = _extract_race_profile(year, track)
    if target is None:
        return None

    insights = []

    # --- Insight 1: Same circuit history ---
    circuit = target["circuit"]
    same_circuit = [m for m in similar if circuit in " ".join(m["reasons"]) and "Same circuit" in " ".join(m["reasons"])]
    if same_circuit:
        pole_wins = sum(1 for m in same_circuit if _extract_race_profile(m["year"], m["track"]) and (_extract_race_profile(m["year"], m["track"]) or {}).get("pole_won", False))
        total = len(same_circuit)
        if pole_wins > 0:
            insights.append(
                f"In {total} previous {'race' if total == 1 else 'races'} at {circuit}, "
                f"pole sitters won {pole_wins} {'time' if pole_wins == 1 else 'times'}."
            )

    # --- Insight 2: Weather pattern ---
    cond = target["condition"]
    if cond != "dry":
        wet_matches = [m for m in similar if m["condition"] == cond or (m["condition"] != "dry" and cond != "dry")]
        if wet_matches:
            comeback_count = sum(1 for m in wet_matches
                                if (_extract_race_profile(m["year"], m["track"]) or {}).get("max_gain", 0) >= 5)
            if comeback_count > 0:
                insights.append(
                    f"In similar {cond} conditions, {comeback_count} of {len(wet_matches)} races "
                    f"saw major position gains of 5+ places."
                )
    else:
        # Dry race — talk about strategy
        same_strat = [m for m in similar
                      if (_extract_race_profile(m["year"], m["track"]) or {}).get("dominant_stops") == target["dominant_stops"]]
        if len(same_strat) >= 2:
            insights.append(
                f"A {target['dominant_stops']}-stop strategy was dominant in "
                f"{len(same_strat)} of the {len(similar)} closest comparisons."
            )

    # --- Insight 3: Winner pattern ---
    if target["winner_grid"] == 1:
        pole_total = sum(1 for m in similar
                         if (_extract_race_profile(m["year"], m["track"]) or {}).get("pole_won", False))
        if pole_total >= 2:
            insights.append(
                f"Pole sitters converted in {pole_total} of {len(similar)} similar races — "
                f"front row starts carry a clear advantage here."
            )
    elif target["winner_grid"] >= 6:
        comeback_total = sum(1 for m in similar
                             if (_extract_race_profile(m["year"], m["track"]) or {}).get("winner_grid", 1) >= 5)
        if comeback_total >= 1:
            insights.append(
                f"Comeback wins aren't unheard of — "
                f"{comeback_total} similar {'race' if comeback_total == 1 else 'races'} also saw winners from P5 or further back."
            )

    # --- Insight 4: Chaos pattern ---
    if target["dnf_count"] >= 5:
        chaos_total = sum(1 for m in similar
                          if (_extract_race_profile(m["year"], m["track"]) or {}).get("dnf_count", 0) >= 4)
        if chaos_total >= 1:
            insights.append(
                f"High-attrition races like this one aren't rare — "
                f"{chaos_total} similar races also had 4+ retirements."
            )

    if not insights:
        # Fallback: generic comparison
        insights.append(
            f"The closest historical comparison is the "
            f"{similar[0]['year']} {similar[0]['track']}, "
            f"won by {similar[0]['winner_name']}."
        )

    # Build match list for display
    matches = [
        {
            "year": m["year"],
            "track": m["track"],
            "winner_name": m["winner_name"],
            "reasons": m["reasons"][:2],  # top 2 reasons only
        }
        for m in similar[:3]  # top 3 matches
    ]

    return {
        "insights": insights,
        "matches": matches,
    }


def get_race_story(year: int, track: str) -> dict | None:
    """
    Build a unified race narrative merging weather, results, strategy, and key moments.

    Returns a dict with:
        narrative   — list of paragraphs (strings) telling the race story
        weather     — condition string
        retirements — count of retirements
        laps        — total laps

    Returns None if race data cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data.get("weather", {})
    stints_by_driver = data.get("stints") or {}

    condition = weather.get("condition", "dry")
    temp = weather.get("avg_air_temp")

    finished = [r for r in results if r.get("finish_position") is not None]
    finished_sorted = sorted(finished, key=lambda r: r["finish_position"])
    retirements = [r for r in results if r["status"] not in ("Finished",) and not r["status"].startswith("+")]

    if not finished_sorted:
        return None

    winner = finished_sorted[0]
    podium = finished_sorted[:3]

    paragraphs = []

    # --- Paragraph 1: The headline — who won and how ---
    w_name = _dn(winner["driver"])
    w_grid = winner.get("grid_position")
    w_team = winner["team"]

    if w_grid and w_grid == 1:
        opener = f"{w_name} converted pole position into victory"
    elif w_grid and w_grid <= 3:
        opener = f"{w_name} took the win from P{w_grid} on the grid"
    elif w_grid and w_grid > 5:
        opener = f"{w_name} stormed from P{w_grid} to win"
    else:
        opener = f"{w_name} claimed victory"

    opener += f" for {w_team}."

    # Add podium context
    if len(podium) >= 3:
        p2 = _dn(podium[1]["driver"])
        p3 = _dn(podium[2]["driver"])
        opener += f" {p2} finished second with {p3} completing the podium."

    paragraphs.append(opener)

    # --- Paragraph 2: Weather and conditions ---
    if condition == "wet":
        weather_line = "Rain was the story of the day, reshaping strategies and punishing mistakes."
    elif condition == "damp":
        weather_line = "Changeable conditions kept everyone guessing throughout the race."
    else:
        weather_line = "Under dry conditions, tyre management was the name of the game."

    if temp:
        weather_line += f" Track temperatures hovered around {temp:.0f}°C."

    if len(retirements) >= 5:
        weather_line += f" It was a brutal day for reliability — {len(retirements)} drivers failed to reach the finish."
    elif len(retirements) >= 2:
        ret_names = " and ".join(_dn(r["driver"]) for r in retirements[:2])
        weather_line += f" {ret_names} were among {len(retirements)} retirements."

    paragraphs.append(weather_line)

    # --- Paragraph 3: The biggest mover ---
    biggest_gain = None
    biggest_gain_delta = 0
    for r in finished_sorted:
        grid = r.get("grid_position")
        pos = r["finish_position"]
        if grid and pos:
            delta = grid - pos
            if delta > biggest_gain_delta:
                biggest_gain = r
                biggest_gain_delta = delta

    if biggest_gain and biggest_gain_delta >= 4:
        bg_name = _dn(biggest_gain["driver"])
        bg_grid = biggest_gain["grid_position"]
        bg_fin = biggest_gain["finish_position"]
        paragraphs.append(
            f"The drive of the day belonged to {bg_name}, who climbed from "
            f"P{bg_grid} to P{bg_fin} — gaining {biggest_gain_delta} places through the field."
        )

    # --- Paragraph 4: Strategy story (if stint data exists) ---
    if stints_by_driver:
        # Winner's strategy
        w_stints = stints_by_driver.get(winner["driver"], [])
        if w_stints:
            stops = len(w_stints) - 1
            compounds = [_COMPOUND_LABELS.get(s.get("compound", ""), s.get("compound", "")) for s in w_stints]
            compound_seq = " then ".join(compounds)

            strat_line = f"{_DRIVER_NAMES.get(winner['driver'], winner['driver'])} ran a {stops}-stop strategy on {compound_seq}."

            # Did anyone use a notably different strategy?
            stop_counts: dict[int, int] = {}
            for d, sts in stints_by_driver.items():
                sc = len(sts) - 1
                stop_counts[sc] = stop_counts.get(sc, 0) + 1

            if len(stop_counts) >= 2:
                strategies = sorted(stop_counts.keys())
                if strategies[-1] - strategies[0] >= 1:
                    strat_line += f" The grid split between {strategies[0]}-stop and {strategies[-1]}-stop strategies."

            paragraphs.append(strat_line)

    # --- Paragraph 5: Close battle or dominant win ---
    if len(finished_sorted) >= 2:
        p1_driver = finished_sorted[0]["driver"]
        p2_driver = finished_sorted[1]["driver"]
        # Check if it was a dominant season moment (win streak, etc.)
        p2_grid = finished_sorted[1].get("grid_position")
        p1_grid = winner.get("grid_position")

        if p1_grid and p1_grid == 1 and len(retirements) <= 1:
            paragraphs.append(
                f"It was a controlled race from the front for {_DRIVER_NAMES.get(p1_driver, p1_driver)}, "
                f"managing the gap to {_dn(p2_driver)} throughout."
            )

    # Calculate total laps
    total_laps = 0
    for r in results:
        tl = r.get("total_laps", 0)
        if tl and tl > total_laps:
            total_laps = tl

    return {
        "narrative": paragraphs,
        "weather": condition,
        "retirements": len(retirements),
        "laps": total_laps if total_laps > 0 else None,
    }


# ---------------------------------------------------------------------------
# Radio moments (2023+ only)
# ---------------------------------------------------------------------------


def get_radio_moments(year: int, track: str, top_n: int = 5) -> dict | None:
    """
    Return the top N most interesting team radio clips for a race.

    Fetches clips from OpenF1, optionally transcribes them, scores by
    sentiment + timing proximity to key moments, and returns the best ones.

    Returns a dict:
        available     — True if radio data exists for this race
        has_transcripts — True if transcription backend is configured
        clips         — list of top N clips, each with:
            driver_code, driver_name, team, team_colour,
            lap, recording_url, transcript, score, sentiment, tags

    Returns None if the race doesn't exist or year < 2023.
    """
    if year < 2023:
        return {"available": False, "has_transcripts": False, "clips": [],
                "reason": "Team radio data is only available for 2023 onwards."}

    # Check race exists in index
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    # Check for cached radio moments on disk
    cache_path = indexer._race_dir(year, track) / "radio_moments.json"
    if cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            logger.info("Loaded cached radio moments for %s %s", year, track)
            return cached
        except (json.JSONDecodeError, OSError):
            pass

    # Fetch clips from OpenF1
    from backend.core import openf1_radio, radio_transcriber, radio_sentiment

    clips = openf1_radio.get_team_radio(year, track)
    if clips is None or len(clips) == 0:
        result = {"available": False, "has_transcripts": False, "clips": [],
                  "reason": "No team radio recordings found for this race."}
        # Cache the empty result
        try:
            cache_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass
        return result

    # Transcribe (if backend available)
    clips = radio_transcriber.transcribe_clips(clips)
    backend_status = radio_transcriber.get_backend_status()

    # Get key moments for timing-based scoring
    moments = get_key_moments(year, track)

    # Score and select top N
    top_clips = radio_sentiment.score_clips(clips, moments, top_n=top_n)

    # Clean up output — remove internal fields, keep what the frontend needs
    clean_clips = []
    for c in top_clips:
        clean_clips.append({
            "driver_code": c.get("driver_code", "???"),
            "driver_name": c.get("driver_name", "Unknown"),
            "team": c.get("team", "Unknown"),
            "team_colour": c.get("team_colour", "666666"),
            "lap": c.get("lap"),
            "recording_url": c.get("recording_url", ""),
            "transcript": c.get("transcript"),
            "score": c.get("score", 0),
            "sentiment": c.get("sentiment", "neutral"),
            "tags": c.get("tags", []),
        })

    result = {
        "available": True,
        "has_transcripts": backend_status.get("has_transcription", False),
        "total_clips": len(clips),
        "clips": clean_clips,
    }

    # Cache to disk
    try:
        cache_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("Cached radio moments for %s %s (%d clips)", year, track, len(clean_clips))
    except OSError as exc:
        logger.warning("Failed to cache radio moments: %s", exc)

    return result


# ---------------------------------------------------------------------------
# Race quiz (Test Your Knowledge)
# ---------------------------------------------------------------------------

import random as _random


def generate_race_quiz(year: int, track: str) -> dict | None:
    """
    Generate a set of multiple-choice quiz questions from race data.

    Returns a dict:
        race     — "{year} {track}"
        questions — list of question dicts, each with:
            id       — question number (1-based)
            question — the question text
            options  — list of 4 answer strings
            answer   — index of the correct option (0-based)
            category — 'result', 'strategy', 'grid', 'weather', 'drama'

    Returns None if the race cannot be loaded.
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data["weather"]
    stints = data.get("stints") or {}

    finished = sorted(
        [r for r in results if r["finish_position"] is not None],
        key=lambda r: r["finish_position"],
    )
    retired = [r for r in results
               if r["status"] not in ("Finished",) and not r["status"].startswith("+")]

    if len(finished) < 3:
        return None

    winner = finished[0]
    p2 = finished[1]
    p3 = finished[2]
    all_drivers = [r["driver"] for r in finished]

    questions = []

    # --- Q: Who won? ---
    wrong = _random.sample([d for d in all_drivers if d != winner["driver"]], min(3, len(all_drivers) - 1))
    options = [_DRIVER_NAMES.get(winner["driver"], winner["driver"])] + \
              [_DRIVER_NAMES.get(d, d) for d in wrong]
    _random.shuffle(options)
    questions.append({
        "question": f"Who won the {year} {track}?",
        "options": options,
        "answer": options.index(_DRIVER_NAMES.get(winner["driver"], winner["driver"])),
        "category": "result",
    })

    # --- Q: Who finished on the podium? ---
    podium_set = {winner["driver"], p2["driver"], p3["driver"]}
    non_podium = [d for d in all_drivers if d not in podium_set]
    if len(non_podium) >= 1:
        intruder = _random.choice(non_podium)
        q_text = "Which of these drivers was NOT on the podium?"
        opts = [_DRIVER_NAMES.get(intruder, intruder)]
        podium_sample = _random.sample(list(podium_set), min(3, len(podium_set)))
        opts += [_DRIVER_NAMES.get(d, d) for d in podium_sample]
        _random.shuffle(opts)
        questions.append({
            "question": q_text,
            "options": opts,
            "answer": opts.index(_DRIVER_NAMES.get(intruder, intruder)),
            "category": "result",
        })

    # --- Q: What grid position did the winner start from? ---
    winner_grid = winner.get("grid_position")
    if winner_grid is not None:
        wrong_grids = [g for g in [1, 2, 3, 5, 7, 10] if g != winner_grid]
        wrong_grids = _random.sample(wrong_grids, min(3, len(wrong_grids)))
        opts = [f"P{winner_grid}"] + [f"P{g}" for g in wrong_grids]
        _random.shuffle(opts)
        questions.append({
            "question": f"What grid position did {_DRIVER_NAMES.get(winner['driver'], winner['driver'])} start from?",
            "options": opts,
            "answer": opts.index(f"P{winner_grid}"),
            "category": "grid",
        })

    # --- Q: Weather ---
    condition = weather.get("condition", "dry") if weather else "dry"
    cond_label = {"dry": "Dry", "damp": "Damp", "wet": "Wet"}.get(condition, "Dry")
    opts = ["Dry", "Damp", "Wet", "Mixed conditions"]
    if cond_label not in opts:
        opts[3] = cond_label
    _random.shuffle(opts)
    questions.append({
        "question": "What were the weather conditions during the race?",
        "options": opts,
        "answer": opts.index(cond_label),
        "category": "weather",
    })

    # --- Q: How many drivers retired? ---
    dnf_count = len(retired)
    wrong_counts = [c for c in [0, 1, 2, 3, 5, 7, 8, 10] if c != dnf_count]
    wrong_counts = _random.sample(wrong_counts, min(3, len(wrong_counts)))
    opts = [str(dnf_count)] + [str(c) for c in wrong_counts]
    _random.shuffle(opts)
    questions.append({
        "question": "How many drivers retired from the race?",
        "options": opts,
        "answer": opts.index(str(dnf_count)),
        "category": "drama",
    })

    # --- Q: Strategy (if stint data available) ---
    winner_stints = stints.get(winner["driver"])
    if winner_stints and len(winner_stints) > 0:
        stops = len(winner_stints) - 1
        opts = ["0-stop", "1-stop", "2-stop", "3-stop"]
        correct = f"{stops}-stop"
        if correct in opts:
            _random.shuffle(opts)
            questions.append({
                "question": f"How many pit stops did the race winner make?",
                "options": opts,
                "answer": opts.index(correct),
                "category": "strategy",
            })

    # --- Q: Biggest mover ---
    best_gain = None
    for r in finished:
        grid = r.get("grid_position")
        fin = r["finish_position"]
        if grid is not None and fin is not None:
            delta = grid - fin
            if delta >= 3 and (best_gain is None or delta > best_gain[1]):
                best_gain = (r, delta)

    if best_gain:
        r, delta = best_gain
        wrong_drivers = _random.sample([d for d in all_drivers if d != r["driver"]], min(3, len(all_drivers) - 1))
        opts = [_DRIVER_NAMES.get(r["driver"], r["driver"])] + \
               [_DRIVER_NAMES.get(d, d) for d in wrong_drivers]
        _random.shuffle(opts)
        questions.append({
            "question": f"Which driver gained the most positions during the race?",
            "options": opts,
            "answer": opts.index(_DRIVER_NAMES.get(r["driver"], r["driver"])),
            "category": "drama",
        })

    # Number them
    for i, q in enumerate(questions):
        q["id"] = i + 1

    return {
        "race": f"{year} {track}",
        "total_questions": len(questions),
        "questions": questions,
    }


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
