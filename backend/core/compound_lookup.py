"""
compound_lookup.py — Pirelli Tyre Compound Data (2011–2017)

Provides the race-level compound nominations and a heuristic for
per-driver stint assignment for years where FastF1 isn't available.

From 2011 to 2017, Pirelli nominated two dry compounds per race:
a softer "option" and a harder "prime". This data is stable and
well-documented — it doesn't change or need scraping.

For per-stint assignment, a heuristic is used:
- Top 10 qualifiers must start on their Q2 tyre (2014+ rules),
  typically the softer compound.
- Most strategies start on the option (soft) and switch to the
  prime (hard) for the longer final stint.
- Drivers outside Q2 choose freely, but statistically favour
  the harder compound first for a longer first stint.

Where the heuristic can't determine a compound, "UNKNOWN" is used.
"""

import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Compound hierarchy (softest to hardest)
# ---------------------------------------------------------------------------

_COMPOUND_RANK = {
    "SUPERSOFT": 0,
    "SOFT": 1,
    "MEDIUM": 2,
    "HARD": 3,
    "SUPERHARD": 4,
}


# ---------------------------------------------------------------------------
# Pirelli race-level nominations 2011–2017
#
# Format: {year: {round_num: (option, prime)}}
# option = softer compound, prime = harder compound
#
# Sources: Pirelli press releases, Wikipedia season articles
# 2010: Bridgestone — different naming; not covered here
# ---------------------------------------------------------------------------

_NOMINATIONS: dict[int, dict[int, tuple[str, str]]] = {
    2011: {
        1: ("SOFT", "HARD"),        # Australia
        2: ("SOFT", "HARD"),        # Malaysia
        3: ("SOFT", "MEDIUM"),      # China
        4: ("SOFT", "MEDIUM"),      # Turkey
        5: ("SUPERSOFT", "MEDIUM"), # Spain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        7: ("SUPERSOFT", "MEDIUM"), # Canada
        8: ("SOFT", "HARD"),        # Europe (Valencia)
        9: ("SOFT", "HARD"),        # Britain
        10: ("SOFT", "HARD"),       # Germany
        11: ("SOFT", "MEDIUM"),     # Hungary
        12: ("SOFT", "MEDIUM"),     # Belgium
        13: ("SUPERSOFT", "SOFT"),  # Italy
        14: ("SUPERSOFT", "SOFT"),  # Singapore
        15: ("SOFT", "MEDIUM"),     # Japan
        16: ("SOFT", "HARD"),       # Korea
        17: ("SOFT", "HARD"),       # India
        18: ("SOFT", "MEDIUM"),     # Abu Dhabi
        19: ("SOFT", "MEDIUM"),     # Brazil
    },
    2012: {
        1: ("SOFT", "MEDIUM"),      # Australia
        2: ("SOFT", "HARD"),        # Malaysia
        3: ("SOFT", "MEDIUM"),      # China
        4: ("SUPERSOFT", "SOFT"),   # Bahrain
        5: ("SOFT", "MEDIUM"),      # Spain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        7: ("SUPERSOFT", "MEDIUM"), # Canada
        8: ("SOFT", "HARD"),        # Europe (Valencia)
        9: ("SOFT", "HARD"),        # Britain
        10: ("SOFT", "MEDIUM"),     # Germany
        11: ("SOFT", "MEDIUM"),     # Hungary
        12: ("SOFT", "MEDIUM"),     # Belgium
        13: ("SOFT", "MEDIUM"),     # Italy
        14: ("SUPERSOFT", "SOFT"),  # Singapore
        15: ("SOFT", "MEDIUM"),     # Japan
        16: ("SOFT", "MEDIUM"),     # Korea
        17: ("SOFT", "MEDIUM"),     # India
        18: ("SUPERSOFT", "MEDIUM"),# Abu Dhabi
        19: ("SOFT", "HARD"),       # USA
        20: ("SOFT", "MEDIUM"),     # Brazil
    },
    2013: {
        1: ("SOFT", "MEDIUM"),      # Australia
        2: ("SOFT", "HARD"),        # Malaysia
        3: ("SOFT", "MEDIUM"),      # China
        4: ("SOFT", "MEDIUM"),      # Bahrain
        5: ("SOFT", "MEDIUM"),      # Spain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        7: ("SUPERSOFT", "MEDIUM"), # Canada
        8: ("SOFT", "HARD"),        # Britain
        9: ("SOFT", "MEDIUM"),      # Germany
        10: ("SOFT", "MEDIUM"),     # Hungary
        11: ("SOFT", "MEDIUM"),     # Belgium
        12: ("SOFT", "MEDIUM"),     # Italy
        13: ("SUPERSOFT", "SOFT"),  # Singapore
        14: ("SOFT", "MEDIUM"),     # Korea
        15: ("SOFT", "MEDIUM"),     # Japan
        16: ("SOFT", "MEDIUM"),     # India
        17: ("SUPERSOFT", "SOFT"),  # Abu Dhabi
        18: ("SOFT", "HARD"),       # USA
        19: ("SOFT", "MEDIUM"),     # Brazil
    },
    2014: {
        1: ("SOFT", "MEDIUM"),      # Australia
        2: ("SOFT", "MEDIUM"),      # Malaysia
        3: ("SOFT", "MEDIUM"),      # Bahrain
        4: ("SOFT", "MEDIUM"),      # China
        5: ("SOFT", "MEDIUM"),      # Spain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        7: ("SUPERSOFT", "SOFT"),   # Canada
        8: ("SOFT", "MEDIUM"),      # Austria
        9: ("SOFT", "MEDIUM"),      # Britain
        10: ("SOFT", "MEDIUM"),     # Germany
        11: ("SOFT", "SOFT"),       # Hungary — both soft variants
        12: ("SOFT", "MEDIUM"),     # Belgium
        13: ("SOFT", "MEDIUM"),     # Italy
        14: ("SUPERSOFT", "SOFT"),  # Singapore
        15: ("SOFT", "MEDIUM"),     # Japan
        16: ("SOFT", "MEDIUM"),     # Russia
        17: ("SOFT", "MEDIUM"),     # USA
        18: ("SOFT", "MEDIUM"),     # Brazil
        19: ("SUPERSOFT", "SOFT"),  # Abu Dhabi
    },
    2015: {
        1: ("SOFT", "MEDIUM"),      # Australia
        2: ("SOFT", "MEDIUM"),      # Malaysia
        3: ("SOFT", "MEDIUM"),      # China
        4: ("SOFT", "MEDIUM"),      # Bahrain
        5: ("SOFT", "MEDIUM"),      # Spain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        7: ("SUPERSOFT", "SOFT"),   # Canada
        8: ("SOFT", "MEDIUM"),      # Austria
        9: ("SOFT", "MEDIUM"),      # Britain
        10: ("SOFT", "MEDIUM"),     # Hungary
        11: ("SOFT", "MEDIUM"),     # Belgium
        12: ("SOFT", "MEDIUM"),     # Italy
        13: ("SUPERSOFT", "SOFT"),  # Singapore
        14: ("SOFT", "MEDIUM"),     # Japan
        15: ("SOFT", "MEDIUM"),     # Russia
        16: ("SOFT", "MEDIUM"),     # USA
        17: ("SOFT", "MEDIUM"),     # Mexico
        18: ("SOFT", "MEDIUM"),     # Brazil
        19: ("SUPERSOFT", "SOFT"),  # Abu Dhabi
    },
    2016: {
        1: ("SOFT", "MEDIUM"),      # Australia
        2: ("SOFT", "MEDIUM"),      # Bahrain
        3: ("SOFT", "MEDIUM"),      # China
        4: ("SUPERSOFT", "SOFT"),   # Russia
        5: ("SOFT", "MEDIUM"),      # Spain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        7: ("SUPERSOFT", "SOFT"),   # Canada
        8: ("SUPERSOFT", "SOFT"),   # Europe (Baku)
        9: ("SOFT", "MEDIUM"),      # Austria
        10: ("SOFT", "MEDIUM"),     # Britain
        11: ("SOFT", "MEDIUM"),     # Hungary
        12: ("SOFT", "MEDIUM"),     # Germany
        13: ("SUPERSOFT", "SOFT"),  # Belgium
        14: ("SOFT", "MEDIUM"),     # Italy
        15: ("SUPERSOFT", "SOFT"),  # Singapore
        16: ("SOFT", "MEDIUM"),     # Malaysia
        17: ("SOFT", "MEDIUM"),     # Japan
        18: ("SUPERSOFT", "SOFT"),  # USA
        19: ("SUPERSOFT", "SOFT"),  # Mexico
        20: ("SOFT", "MEDIUM"),     # Brazil
        21: ("SUPERSOFT", "SOFT"),  # Abu Dhabi
    },
    2017: {
        1: ("SOFT", "MEDIUM"),      # Australia
        2: ("SUPERSOFT", "SOFT"),   # China
        3: ("SUPERSOFT", "SOFT"),   # Bahrain
        4: ("SUPERSOFT", "SOFT"),   # Russia
        5: ("SOFT", "MEDIUM"),      # Spain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        7: ("SUPERSOFT", "SOFT"),   # Canada
        8: ("SUPERSOFT", "SOFT"),   # Azerbaijan
        9: ("SOFT", "MEDIUM"),      # Austria
        10: ("SOFT", "MEDIUM"),     # Britain
        11: ("SUPERSOFT", "SOFT"),  # Hungary
        12: ("SUPERSOFT", "SOFT"),  # Belgium
        13: ("SOFT", "MEDIUM"),     # Italy
        14: ("SUPERSOFT", "SOFT"),  # Singapore
        15: ("SOFT", "MEDIUM"),     # Malaysia
        16: ("SUPERSOFT", "SOFT"),  # Japan
        17: ("SUPERSOFT", "SOFT"),  # USA
        18: ("SUPERSOFT", "SOFT"),  # Mexico
        19: ("SOFT", "MEDIUM"),     # Brazil
        20: ("SUPERSOFT", "SOFT"),  # Abu Dhabi
    },
}


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def get_race_compounds(year: int, round_num: int) -> tuple[str, str] | None:
    """
    Return the (option, prime) compound pair for a given race.

    option = softer compound, prime = harder compound.
    Returns None if the year/round is not in the lookup table.
    """
    season = _NOMINATIONS.get(year)
    if season is None:
        return None
    return season.get(round_num)


def assign_stint_compounds(
    pit_stop_laps: list[int],
    total_laps: int,
    grid_position: int | None,
    year: int,
    round_num: int,
) -> list[str]:
    """
    Assign tyre compounds to each stint using a heuristic.

    Rules:
    1. If race compounds aren't known, return ["UNKNOWN"] * num_stints.
    2. For a 1-stop: option first, prime second (most common strategy).
    3. For 2+ stops: alternate starting with the softer compound.
    4. Drivers qualifying outside Q2 (P11+) may start on the harder
       compound — but we default to option-first for simplicity.

    Returns a list of compound strings, one per stint.
    """
    num_stints = len(pit_stop_laps) + 1
    compounds = get_race_compounds(year, round_num)

    if compounds is None:
        return ["UNKNOWN"] * num_stints

    option, prime = compounds

    if num_stints == 1:
        # No pit stop — used one compound the whole race (unusual, maybe rain)
        return [option]

    if num_stints == 2:
        # 1-stop: softer first, harder second (standard)
        return [option, prime]

    # 2+ stops: alternate option/prime, starting with option
    result = []
    for i in range(num_stints):
        result.append(option if i % 2 == 0 else prime)
    return result


def build_stints(
    pit_stop_laps: list[int],
    compounds: list[str],
    total_laps: int,
) -> list[dict]:
    """
    Build stint dicts from pit stop laps and compound assignments.

    Merges pit stop boundary laps with compound names to produce
    stint sequences matching the stints.json format used by insights.py.

    Args:
        pit_stop_laps — sorted list of laps where pit stops occurred
        compounds     — list of compound strings, one per stint
        total_laps    — total race laps

    Returns a list of stint dicts:
        stint      — stint number (int, 1-based)
        compound   — tyre compound name
        lap_start  — first lap of the stint
        lap_end    — last lap of the stint
        lap_count  — number of laps on that compound
    """
    if not compounds:
        return []

    # Boundaries: [1, pit1+1, pit2+1, ..., total_laps+1]
    starts = [1] + [lap + 1 for lap in pit_stop_laps]
    ends = pit_stop_laps + [total_laps]

    stints = []
    for i, compound in enumerate(compounds):
        if i >= len(starts) or i >= len(ends):
            break
        lap_start = starts[i]
        lap_end = ends[i]
        stints.append({
            "stint": i + 1,
            "compound": compound,
            "lap_start": lap_start,
            "lap_end": lap_end,
            "lap_count": max(0, lap_end - lap_start + 1),
        })

    return stints


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    year, rd = 2014, 1
    print(f"=== {year} Round {rd} Compound Nomination ===\n")
    pair = get_race_compounds(year, rd)
    if pair:
        print(f"  Option (softer): {pair[0]}")
        print(f"  Prime (harder):  {pair[1]}")
    else:
        print("  No data available.")

    # Simulate Rosberg's 2-stop: pit on lap 12 and 38, total 57 laps
    print(f"\n=== Simulated stint assignment (ROS, 2-stop, grid P3) ===\n")
    pit_laps = [12, 38]
    compounds = assign_stint_compounds(pit_laps, 57, 3, year, rd)
    stints = build_stints(pit_laps, compounds, 57)
    for s in stints:
        print(f"  Stint {s['stint']}: {s['compound']:<12} laps {s['lap_start']}–{s['lap_end']} ({s['lap_count']} laps)")
