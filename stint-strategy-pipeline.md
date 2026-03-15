# Raceday Phase 2 — Stint & Strategy Pipeline

> How Raceday grew from "they mostly used Mediums" to "1-stop: Medium → Soft" — building the full tyre stint data pipeline from raw FastF1 laps to a rewritten strategy endpoint.

---

## In Plain English

Formula 1 tyre strategy is one of the most exciting tactical elements of the sport. When did Verstappen pit? Did he go soft for the final sprint or nurse his mediums to the end? Before Phase 2, Raceday could only answer this with a rough approximation — it found the compound a driver used the most laps on and labelled it their "primary tyre."

That's like describing a meal by only mentioning the ingredient you ate the most of. You'd miss that the appetiser was soft, the main was medium, and they swapped at lap 33.

Phase 2 adds the full picture. It reads every lap from FastF1, groups laps into stints (continuous runs on one set of tyres), and saves the result to disk. The strategy endpoint now returns "1-stop: Medium → Soft" — the actual compound sequence, with the actual number of pit stops.

This document covers every piece of that pipeline, every pandas technique used, every design decision made, and every sharp edge worth knowing about.

---

## What Is It? (The Technical View)

A **stint** in F1 is a continuous run on one set of tyres. Every time a driver pits for new tyres, their stint number increments. FastF1's laps DataFrame has a `Stint` column (integer, 1-based) that tracks this.

The pipeline added in Phase 2 has five parts:

1. **`get_stint_data()`** in `loader.py` — groups raw laps by `(Driver, Stint)`, extracts compound and lap range, returns a dict keyed by driver abbreviation.
2. **`index_race()` extended** in `indexer.py` — calls `get_stint_data()` and saves `stints.json` alongside existing race files.
3. **`load_race_index()` extended** in `indexer.py` — reads `stints.json` when loading a race; returns `None` for stints if the file is absent (backwards compatible).
4. **`get_strategy_breakdown()` rewritten** in `insights.py` — uses per-driver stint sequences to produce real stop counts and compound sequences.
5. **`_COMPOUND_LABELS`** constant in `insights.py` — maps internal strings (`"MEDIUM"`) to display names (`"Medium"`).

---

## The Problem It Solves

The old `get_strategy_breakdown()` used the dominant compound per driver — the compound they drove the most laps on, computed by `mode()` across all their laps. This had two problems:

**Problem 1 — No stop count.** You couldn't tell if a driver did one stop or two. "Medium primary" tells you nothing about whether they pitted once and went to Hard, or twice and went Medium → Hard → Soft.

**Problem 2 — Wrong for certain strategies.** A driver who does a short opening stint on Softs (10 laps) and then a long run on Mediums (42 laps) would be labelled "Medium primary" — but the strategic choice was the Soft at the start.

The solution: read the actual stint structure from FastF1's laps data.

---

## How It Works

### FastF1 Laps DataFrame and the Stint Column

Plain English: FastF1 gives us a table of every lap driven by every driver in the race, with a column that tells us which stint number that lap belongs to.

The laps DataFrame has many columns. The ones we care about:

| Column | Type | Example |
|--------|------|---------|
| `Driver` | str | `"VER"` |
| `LapNumber` | float | `33.0` |
| `Stint` | float | `1.0` |
| `Compound` | str | `"MEDIUM"` |

Note they're floats, not ints — FastF1 uses float columns because pandas represents missing values (NaN) as float. We need to handle that.

For the 2023 British GP, VER's laps look like:

```
Driver  LapNumber  Stint  Compound
VER     1          1      MEDIUM
VER     2          1      MEDIUM
...
VER     33         1      MEDIUM
VER     34         2      SOFT
...
VER     52         2      SOFT
```

Stint 1 runs laps 1-33 on Medium. Stint 2 runs laps 34-52 on Soft. One pit stop = two stints.

### Dropping NaN Rows

Plain English: Some laps in FastF1's data have missing values for Stint or LapNumber. We remove those before doing any calculations.

```python
laps = laps.dropna(subset=["Stint", "LapNumber"])
```

Technical detail: `dropna(subset=["Stint", "LapNumber"])` removes any row where either `Stint` or `LapNumber` is NaN. If we didn't do this, NaN would appear as a group key in the groupby, polluting the output with a fake "NaN stint."

### pandas groupby on Multiple Columns

Plain English: We split the laps table into groups — one group per (driver, stint) pair — and then summarise each group.

```python
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
```

Technical detail, step by step:

**`laps.groupby(["Driver", "Stint"])`** — splits the DataFrame into sub-DataFrames. For our example: (VER, 1), (VER, 2), (NOR, 1), (NOR, 2), etc. One group per (driver, stint) combination.

**`.agg(...)`** — the named aggregation syntax. Each argument is `output_name=("input_column", aggregation_function)`:
- `compound=("Compound", lambda s: s.mode()...)` — for the Compound column, find the most common value
- `lap_start=("LapNumber", "min")` — first lap of the stint
- `lap_end=("LapNumber", "max")` — last lap of the stint
- `lap_count=("LapNumber", "count")` — how many laps in the stint

**Why `mode()` for compound?** Within a single stint a driver should be on one compound — but FastF1 occasionally logs one or two laps with null or incorrect compound data. `mode()` returns the most frequently occurring value, so even if 2 of 33 laps have bad data, the correct compound wins. `.iloc[0]` takes the first result (handles the rare tie case). The `if not s.mode().empty` guard prevents IndexError on an all-NaN group.

**`.reset_index()`** — after `groupby().agg()`, the group keys (`Driver`, `Stint`) become the DataFrame index. `reset_index()` turns them back into regular columns so we can iterate with `iterrows()`.

### Building the Per-Driver Dict

Plain English: After summarising each stint, we reorganise the results into a dict where each driver maps to their ordered list of stints.

```python
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

for driver in stints_by_driver:
    stints_by_driver[driver].sort(key=lambda s: s["stint"])
```

Technical detail: `setdefault(driver, [])` is a dict method that returns the existing list for `driver` if it exists, or creates an empty list and returns it if it doesn't. So `stints_by_driver.setdefault(driver, []).append(...)` means "get or create the list for this driver, then append to it."

The explicit `.sort(key=lambda s: s["stint"])` ensures stints are in order (1, 2, 3...) regardless of the order `iterrows()` yields them.

The `int()` and `str()` casts are necessary because pandas values are numpy types (`numpy.float64`, `numpy.object_`). `json.dump()` can't serialise numpy types — only Python native types. Casting to `int`/`str` is the fix.

### The Strategy Label

Plain English: From the ordered list of compounds, we compute how many stops there were and build the readable label.

```python
compounds = [s["compound"] for s in driver_stints]
stops = len(driver_stints) - 1
compound_seq = " → ".join(
    _COMPOUND_LABELS.get(c, c.title()) for c in compounds
)
label = f"{stops}-stop: {compound_seq}"
```

Technical detail:
- `len(driver_stints) - 1` converts stint count to stop count: 2 stints = 1 stop, 3 stints = 2 stops.
- `" → ".join(...)` creates "Medium → Soft" from ["MEDIUM", "SOFT"]. The `→` character is Unicode U+2192; it serialises correctly in JSON even if Windows terminal can't display it.
- `_COMPOUND_LABELS.get(c, c.title())` maps known compounds to display names and falls back to `.title()` (capitalises first letter) for unknown ones.

---

## What We Built

### File: `backend/core/loader.py` — get_stint_data()

Plain English: Load the race session, pull the laps table, group by driver and stint, return the result as a nested dict.

```python
def get_stint_data(year: int, track: str) -> dict | None:
    session = get_session(year, track, "R")
    if session is None:
        return None

    laps = session.laps
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

    for driver in stints_by_driver:
        stints_by_driver[driver].sort(key=lambda s: s["stint"])

    return stints_by_driver
```

Technical detail: `get_session()` is shared with `get_race_results()` — if that session was already loaded for indexing, FastF1's in-memory cache means the second call is near-instant. No extra network request.

**Verified output for 2023 British GP:**
```
VER: [{stint:1, compound:MEDIUM, lap_start:1, lap_end:33, lap_count:33},
      {stint:2, compound:SOFT, lap_start:34, lap_end:52, lap_count:19}]
NOR: [{stint:1, compound:MEDIUM, ...}, {stint:2, compound:HARD, ...}]
HAM: [{stint:1, compound:MEDIUM, ...}, {stint:2, compound:SOFT, ...}]
```

---

### File: `backend/core/indexer.py` — index_race() extended

Plain English: After saving results and weather, also save stints. If stints fail, save an empty dict so the file always exists.

```python
stints = loader.get_stint_data(year, track)
if stints is None:
    logger.warning("index_race: no stint data for %s %s — storing empty dict", year, track)
    stints = {}

with open(stints_path, "w") as f:
    json.dump(stints, f, indent=2)
```

Technical detail: Storing `{}` rather than skipping the file entirely means `stints_path.exists()` is always True after indexing. This simplifies `load_race_index()` — it doesn't need to distinguish "file missing" from "file empty." The only time stints is `None` in the returned index is for races indexed before this code existed.

---

### File: `backend/core/indexer.py` — load_race_index() extended

Plain English: When loading a race, also load its stints file if it exists. Return None for stints if the file isn't there.

```python
stints_path = race_dir / "stints.json"
stints = None
if stints_path.exists():
    with open(stints_path) as f:
        stints = json.load(f)

return {"results": results, "weather": weather, "stints": stints}
```

Technical detail: `stints = None` as the default (rather than `{}`) is intentional. It lets callers distinguish "stints data was not available" from "stints data was available but empty." The strategy breakdown checks `if stints_by_driver and driver in stints_by_driver` — both conditions handle None (falsy) and missing driver correctly.

---

### File: `backend/core/insights.py` — get_strategy_breakdown() rewritten

Plain English: For each driver, use their stint list to build the real strategy label. Fall back to dominant compound if stints aren't available.

```python
stints_by_driver = data.get("stints")

for r in finishers + retired:
    driver = r["driver"]

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
```

Technical detail: `data.get("stints")` uses `.get()` rather than `data["stints"]` to avoid KeyError if an older code path returns a dict without the stints key. `stints_by_driver and driver in stints_by_driver` — the `and` short-circuits: if stints_by_driver is None or `{}` (falsy), the `driver in` check never runs.

**Old output:** `{"compound": "MEDIUM", "label": "Medium primary"}`

**New output:** `{"stops": 1, "compounds": ["MEDIUM", "SOFT"], "label": "1-stop: Medium → Soft"}`

---

### How the Pieces Connect

```
index_race(2023, "British Grand Prix")
    |
    +-- loader.get_race_results()    → race_results.json
    +-- loader.get_weather_summary() → weather.json
    +-- loader.get_stint_data()      → stints.json
              |
              v
         session.laps
              |
         dropna(["Stint", "LapNumber"])
              |
         groupby(["Driver", "Stint"]).agg(...)
              |
         {VER: [{stint:1,...}, {stint:2,...}], NOR: [...], ...}
              |
         json.dump → stints.json (6KB for 20 drivers)


GET /races/2023/British%20Grand%20Prix/strategy
    |
    v
insights.get_strategy_breakdown(2023, "British Grand Prix")
    |
    v
indexer.load_race_index()
    |
    +-- race_results.json → results list
    +-- weather.json      → weather dict
    +-- stints.json       → stints dict (or None)
    |
    v
For each driver:
    stints available? → "1-stop: Medium → Soft"
    stints missing?   → "Medium primary" (fallback)
    |
    v
[{driver:"VER", stops:1, compounds:["MEDIUM","SOFT"],
  label:"1-stop: Medium → Soft", status:"Finished"}, ...]
```

---

## Common Patterns

### Pattern 1: setdefault for Accumulating Into Groups

What it's for: building a dict of lists without checking for key existence every time.

```python
stints_by_driver.setdefault(driver, []).append(stint_dict)
```

Equivalent to:
```python
if driver not in stints_by_driver:
    stints_by_driver[driver] = []
stints_by_driver[driver].append(stint_dict)
```

### Pattern 2: Named Aggregation in pandas

What it's for: applying different aggregation functions to different columns in one call.

```python
df.groupby("key").agg(
    output_col=("input_col", "aggregation"),
    output_col2=("input_col2", lambda s: ...),
)
```

### Pattern 3: Numpy Type Casting for JSON

What it's for: making pandas output serialisable.

```python
"stint": int(row["Stint"]),      # numpy.float64 → int
"compound": str(row["compound"]), # numpy.object_ → str
```

Always cast when building dicts that will be passed to `json.dump()`.

### Pattern 4: Graceful Fallback

What it's for: keeping old indexed races working even after the data model changes.

```python
stints_by_driver = data.get("stints")  # None for old races

if stints_by_driver and driver in stints_by_driver:
    # new path: real stint data
else:
    # old path: dominant compound fallback
```

---

## Edge Cases & Gotchas

1. **All-NaN compound group**
   In plain English: If every lap in a stint has null compound data, `s.mode()` returns an empty Series and `.iloc[0]` would crash.
   Technical cause: `if not s.mode().empty else "UNKNOWN"` guards against this.
   Result: affected stints show compound "UNKNOWN".

2. **Stint numbers not always starting at 1**
   In plain English: For some races, FastF1 may start stint numbering at a value other than 1, especially for drivers who take a grid penalty and swap cars.
   Technical cause: Raceday doesn't assume stint=1 is the first stint — it sorts by stint number and uses the sequence as-is.
   How to avoid: The `.sort(key=lambda s: s["stint"])` handles this correctly.

3. **Windows console encoding**
   In plain English: The `→` arrow character in labels can't be displayed in Windows cmd/PowerShell with cp1252 encoding — you'll see `?` instead.
   Technical cause: Unicode U+2192 isn't in Windows-1252.
   How to avoid: This is a display-only issue. The JSON API returns `\u2192` which browsers and terminals with UTF-8 encoding handle correctly.

4. **Double session load**
   In plain English: `index_race()` calls `get_race_results()` and then `get_stint_data()`, both of which call `get_session()`. That's two session loads.
   Technical cause: No shared session cache between loader functions.
   How to avoid: FastF1's in-memory cache makes the second load fast (no network). For a production fix, add `@lru_cache` to `get_session()`.

5. **Stints.json for races indexed before Phase 2**
   In plain English: Races indexed before stints.json existed won't have the file. load_race_index() returns stints=None for them.
   Technical cause: The stints file is optional — `if stints_path.exists()` guards the load.
   How to avoid: Re-index older races by deleting their directories and calling `index_race()` again.

---

## How It Connects to Other Concepts

- **`get_race_results()`**: Uses the same `get_session()` call and the same session's laps — `get_stint_data()` reads `session.laps` and uses the same groupby/mode pattern as the compound extraction in `get_race_results()`.

- **`is_indexed()`**: Unchanged — still only checks for `race_results.json` and `weather.json`. Adding `stints.json` to the check would break backwards compatibility with existing indexed races.

- **`_COMPOUND_LABELS` dict**: Shared between the strategy breakdown and any future compound-related display. Centralising it means changing "Intermediate" to "Inters" only needs one edit.

- **Frontend StrategyPanel**: The `compounds` list and `label` string are designed to be directly rendeable — map `compounds` to colour chips (red=SOFT, yellow=MEDIUM, grey=HARD, green=INTERMEDIATE, blue=WET) and display `label` as the summary text.

---

## Going Deeper

### Multi-Stint Strategies

A three-stop race produces four stints. The label becomes "3-stop: Soft → Medium → Hard → Soft". The code handles this automatically — no upper limit on stint count.

### Tracking Pit Stop Laps

The current implementation records `lap_start` and `lap_end` per stint. The pit stop lap is always `lap_end + 1` of the previous stint (or equivalently, `lap_start - 1` of the next stint). You could compute `pit_laps: [33, ...]` from this if needed.

### Tyre Age (Laps on Set)

FastF1 also has a `TyreLife` column — the age of the tyre in laps at the start of the stint (for used tyres brought to a race). Phase 2 doesn't capture this. Adding `tyre_age_at_start=("TyreLife", "min")` to the aggregation would give you this.

### Constructor Strategy Comparison

Using `stints_by_driver` from the index, you can compare teammates' strategies directly — VER did Medium→Soft while PER did Medium→Soft too. You could surface this as "RBR: both 1-stop Medium→Soft" in a team strategy view.

---

## Quick Reference

### Return Shape

```python
# get_stint_data()
{
    "VER": [
        {"stint": 1, "compound": "MEDIUM", "lap_start": 1, "lap_end": 33, "lap_count": 33},
        {"stint": 2, "compound": "SOFT",   "lap_start": 34, "lap_end": 52, "lap_count": 19}
    ],
    "NOR": [...],
    ...
}

# get_strategy_breakdown() entry
{
    "driver": "VER",
    "team": "Red Bull Racing",
    "stops": 1,
    "compounds": ["MEDIUM", "SOFT"],
    "label": "1-stop: Medium → Soft",
    "status": "Finished"
}
```

### Compound Colours (for frontend)

| Compound | Colour | Hex |
|----------|--------|-----|
| SOFT | Red | `#E8002D` |
| MEDIUM | Yellow | `#FFF200` |
| HARD | White/Grey | `#EBEBEB` |
| INTERMEDIATE | Green | `#39B54A` |
| WET | Blue | `#0067FF` |

### Files Written per Race

```
INDEX_DIR/{year}/{track}/
├── race_results.json   # per-driver results (was already here)
├── weather.json        # weather summary (was already here)
└── stints.json         # NEW: per-driver stint sequences
```

---

*Generated: 2026-03-16 | Project: raceday | Phase: 2 Stint Strategy*
*Files: backend/core/loader.py, backend/core/indexer.py, backend/core/insights.py*
