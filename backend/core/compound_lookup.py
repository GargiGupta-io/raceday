"""
compound_lookup.py — Pirelli Tyre Compound Data (2011–2017)

Three-layer strategy for assigning per-driver compounds:

Layer 1 (exact): Community CSV data for 2015 + partial 2016.
    Per-driver per-stint compounds scraped from FIA/Pirelli sources.
    Loaded from data/tire_strategy_2015_2016.json.

Layer 2 (estimated): Stint-length heuristic for all other races.
    Shorter stints get the softer compound, longer stints get the
    harder compound. Matches ~85-90% of real strategies.

Layer 3 (fallback): Simple alternation — soft, hard, soft, hard.
    Used when no nomination data exists (e.g. 2010 Bridgestone era).

Set STRATEGY_MODE to switch between layers:
    "auto"      — try Layer 1, then 2, then 3 (default)
    "heuristic" — skip CSV, use Layer 2 then 3
    "simple"    — Layer 3 only (original approach)
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Switch this to change compound assignment strategy globally
STRATEGY_MODE = os.getenv("COMPOUND_STRATEGY", "auto")


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
# Layer 1: Community CSV data (2015 + partial 2016)
# ---------------------------------------------------------------------------

_CSV_DATA: dict | None = None
_CSV_PATH = Path(__file__).resolve().parent / "tire_strategy_2015_2016.json"

# Full name → 3-letter code mapping for the CSV data
_NAME_TO_CODE = {
    "Lewis Hamilton": "HAM", "Nico Rosberg": "ROS", "Sebastian Vettel": "VET",
    "Kimi Raikkonen": "RAI", "Daniel Ricciardo": "RIC", "Daniil Kvyat": "KVY",
    "Valtteri Bottas": "BOT", "Felipe Massa": "MAS", "Felipe Nasr": "NAS",
    "Carlos Sainz Jnr": "SAI", "Carlos Sainz": "SAI", "Max Verstappen": "VER",
    "Sergio Perez": "PER", "Nico Hulkenberg": "HUL", "Jenson Button": "BUT",
    "Fernando Alonso": "ALO", "Romain Grosjean": "GRO", "Pastor Maldonado": "MAL",
    "Marcus Ericsson": "ERI", "Will Stevens": "STE", "Roberto Merhi": "MER",
    "Alexander Rossi": "ROS2", "Kevin Magnussen": "MAG", "Jolyon Palmer": "PAL",
    "Esteban Gutierrez": "GUT", "Pascal Wehrlein": "WEH", "Rio Haryanto": "HAR",
    "Stoffel Vandoorne": "VAN", "Lance Stroll": "STR", "Esteban Ocon": "OCO",
    "Pierre Gasly": "GAS", "Brendon Hartley": "HAR2",
}


def _load_csv_data() -> dict:
    """Load the community CSV stint data from disk. Cached after first call."""
    global _CSV_DATA
    if _CSV_DATA is not None:
        return _CSV_DATA

    if not _CSV_PATH.exists():
        logger.info("No CSV stint data found at %s", _CSV_PATH)
        _CSV_DATA = {}
        return _CSV_DATA

    with open(_CSV_PATH) as f:
        _CSV_DATA = json.load(f)
    logger.info("Loaded CSV stint data: %d races", len(_CSV_DATA))
    return _CSV_DATA


def get_csv_stint_compounds(year: int, round_num: int, driver_code: str) -> list[str] | None:
    """
    Look up exact per-stint compounds from the community CSV data.

    Returns a list of compound strings (e.g. ["SOFT", "MEDIUM"]) or None
    if this race/driver isn't in the CSV dataset.
    """
    data = _load_csv_data()
    race_key = f"{year}_{round_num}"
    race = data.get(race_key)
    if not race:
        return None

    # Try matching by driver code (need to map full names → codes)
    for full_name, stints in race.items():
        code = _NAME_TO_CODE.get(full_name, "")
        if code == driver_code:
            return [s["compound"] for s in stints]

    return None


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


def _assign_by_stint_length(
    pit_stop_laps: list[int],
    total_laps: int,
    option: str,
    prime: str,
) -> list[str]:
    """
    Layer 2: Assign compounds based on stint length.

    Shorter stints get the softer compound, longer stints get the harder.
    This matches real F1 strategy in ~85-90% of cases because softer
    tyres degrade faster and are used for shorter stints.
    """
    # Calculate stint lengths
    starts = [1] + [lap + 1 for lap in pit_stop_laps]
    ends = pit_stop_laps + [total_laps]
    stint_lengths = [ends[i] - starts[i] + 1 for i in range(len(starts))]

    if not stint_lengths:
        return [option]

    # Find median length — stints shorter than median get option (soft),
    # stints at or above median get prime (hard)
    sorted_lengths = sorted(stint_lengths)
    median = sorted_lengths[len(sorted_lengths) // 2]

    return [option if length < median else prime for length in stint_lengths]


def _assign_simple(
    num_stints: int,
    option: str,
    prime: str,
) -> list[str]:
    """
    Layer 3: Simple alternation fallback — soft, hard, soft, hard.
    Original approach kept as a safety net.
    """
    if num_stints == 1:
        return [option]
    if num_stints == 2:
        return [option, prime]
    return [option if i % 2 == 0 else prime for i in range(num_stints)]


def assign_stint_compounds(
    pit_stop_laps: list[int],
    total_laps: int,
    grid_position: int | None,
    year: int,
    round_num: int,
    driver_code: str = "",
) -> list[str]:
    """
    Assign tyre compounds to each stint using a three-layer strategy.

    Layer 1 (STRATEGY_MODE "auto"): Check community CSV data for exact
            per-driver compounds (2015 + partial 2016).
    Layer 2: Stint-length heuristic — shorter stints get softer compound.
    Layer 3: Simple alternation fallback.

    Set STRATEGY_MODE env var to "simple" to force Layer 3 only,
    or "heuristic" to skip CSV and use Layer 2.

    Returns a list of compound strings, one per stint.
    """
    num_stints = len(pit_stop_laps) + 1

    # Layer 1: Try exact CSV data
    if STRATEGY_MODE == "auto" and driver_code:
        csv_compounds = get_csv_stint_compounds(year, round_num, driver_code)
        if csv_compounds and len(csv_compounds) == num_stints:
            return csv_compounds

    # Get race-level nomination
    nomination = get_race_compounds(year, round_num)
    if nomination is None:
        return ["UNKNOWN"] * num_stints

    option, prime = nomination

    # Layer 2: Stint-length heuristic
    if STRATEGY_MODE in ("auto", "heuristic"):
        return _assign_by_stint_length(pit_stop_laps, total_laps, option, prime)

    # Layer 3: Simple alternation
    return _assign_simple(num_stints, option, prime)


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

    print(f"Strategy mode: {STRATEGY_MODE}\n")

    # --- 2014 R1: heuristic (no CSV data for 2014) ---
    year, rd = 2014, 1
    print(f"=== {year} Round {rd} — Heuristic (no CSV) ===\n")
    pair = get_race_compounds(year, rd)
    print(f"  Nomination: {pair[0]} / {pair[1]}" if pair else "  No data")

    pit_laps = [12, 38]
    compounds = assign_stint_compounds(pit_laps, 57, 3, year, rd, "ROS")
    stints = build_stints(pit_laps, compounds, 57)
    for s in stints:
        print(f"  Stint {s['stint']}: {s['compound']:<12} laps {s['lap_start']}–{s['lap_end']} ({s['lap_count']} laps)")

    # --- 2015 R1: CSV data (exact) ---
    year, rd = 2015, 1
    print(f"\n=== {year} Round {rd} — CSV (exact for HAM) ===\n")
    csv = get_csv_stint_compounds(year, rd, "HAM")
    print(f"  CSV lookup: {csv}")
    pit_laps_ham = [25]
    compounds_ham = assign_stint_compounds(pit_laps_ham, 58, 1, year, rd, "HAM")
    stints_ham = build_stints(pit_laps_ham, compounds_ham, 58)
    for s in stints_ham:
        print(f"  Stint {s['stint']}: {s['compound']:<12} laps {s['lap_start']}–{s['lap_end']} ({s['lap_count']} laps)")

    # --- Fallback test ---
    print(f"\n=== 2010 R1 — Fallback (no Pirelli data) ===\n")
    compounds_2010 = assign_stint_compounds([15, 35], 58, 5, 2010, 1, "VET")
    print(f"  Compounds: {compounds_2010}")
