# loader.py — Implementation Patterns & Design Decisions

> A deep look at how Raceday's data loader is actually written: the Python patterns, pandas operations, error handling philosophy, and decisions made — with the real code, not toy examples.

---

## In Plain English

When you build a data pipeline, the first layer — the one that actually fetches raw information — has a deceptively big job. It doesn't just "go get the data." It has to find it (from cache or the internet), handle things going wrong gracefully, clean up the mess before handing it on, and do all this without leaking details about *how* it works into the rest of the codebase.

Raceday's `loader.py` does all of that for F1 data. It's the only file in the project that talks directly to FastF1. Everything else — the indexer, the insights engine, the API — receives clean, predictable Python objects from the loader and never has to worry about the details of FastF1's API, what columns DataFrames use, or what happens when a session doesn't exist.

This document goes through the actual code decisions: why the cache is set up at import time, how `pandas` is used to find each driver's dominant tyre compound, why functions return `None` instead of raising exceptions, and a few sharp edges to watch out for.

---

## Module-Level Side Effects: Cache Setup on Import

Plain English: When Python loads this file — even just to import a function from it — it immediately sets up the FastF1 cache. You don't have to call a setup function first; it just happens.

```python
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_cache_dir = Path(os.getenv("CACHE_DIR", "./data/cache"))
_cache_dir.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(_cache_dir))
```

Technical detail: This code runs at the module level — outside any function — so Python executes it the moment `loader` is imported anywhere. Three things happen in sequence:

1. `load_dotenv(...)` reads the `.env` file and injects its key-value pairs into `os.environ`
2. `Path(os.getenv("CACHE_DIR", "./data/cache"))` reads `CACHE_DIR` from the environment (falling back to a sensible default if it's missing)
3. `fastf1.Cache.enable_cache(str(_cache_dir))` tells FastF1 where to write its cache files

**Why on import, not in a function?** Because if the cache isn't configured before any session is loaded, FastF1 silently falls back to a tiny temp directory (you saw the warning: `DEFAULT CACHE ENABLED! (24.0 KB)`). Any function that loads a session needs the cache already set up. Doing it at import time makes it impossible to forget.

**The `_` prefix on `_cache_dir`** signals that this is a module-private variable — internal plumbing, not part of the public API. Same convention as `_int_or_none`.

---

## Path Resolution: Finding .env from Anywhere

Plain English: The `.env` file sits at the root of the raceday project. `loader.py` is buried two folders deep inside it. This code navigates up two levels to find the `.env` regardless of where Python is run from.

```python
Path(__file__).resolve().parents[2] / ".env"
```

Technical detail, step by step:

| Expression | What it produces |
|------------|-----------------|
| `__file__` | `backend/core/loader.py` (relative) |
| `Path(__file__).resolve()` | `C:\Users\HP\...\raceday\backend\core\loader.py` (absolute) |
| `.parents[0]` | `C:\Users\HP\...\raceday\backend\core\` |
| `.parents[1]` | `C:\Users\HP\...\raceday\backend\` |
| `.parents[2]` | `C:\Users\HP\...\raceday\` |
| `/ ".env"` | `C:\Users\HP\...\raceday\.env` |

`Path` objects support `/` for joining paths — it's syntactic sugar for `Path.joinpath()`. Much cleaner than string concatenation.

**Why `.resolve()` first?** Because `__file__` can be relative to the current working directory. If someone runs `python3 loader.py` from a different directory, `parents[2]` could point somewhere unexpected. `.resolve()` converts it to an absolute path anchored to the filesystem, making navigation reliable regardless of where Python was started.

**Why not `load_dotenv()` with no arguments?** The default behaviour searches upward from the current working directory. That works when you run from the project root, but breaks if you run from somewhere else. Explicit is better than relying on search heuristics.

---

## get_session: The Core Fetch Function

Plain English: This function asks FastF1 for one session of F1 data — a race, a qualifying session, a practice — and returns it fully loaded. If anything goes wrong, it logs a warning and returns `None` instead of crashing.

```python
def get_session(year: int, track: str, session_type: str):
    try:
        session = fastf1.get_session(year, track, session_type)
        session.load(laps=True, telemetry=False, weather=True, messages=False)
        return session
    except Exception as exc:
        logger.warning(
            "Could not load session: %s %s %s — %s", year, track, session_type, exc
        )
        return None
```

Technical detail:

**`telemetry=False`** — this is intentional. Telemetry is high-frequency car data: speed, throttle, brake, gear, DRS sampled at ~4Hz for every car, every lap. For a full race that's millions of rows. It's the slowest part of the load by far, and the loader's current consumers (race results, weather summary) don't need it. When telemetry is eventually needed (lap charts, speed traces), a separate function will request it explicitly.

**`messages=False`** — race control messages (safety car, VSC, flags) aren't needed for the current output either. Skipping it keeps load time down.

**`except Exception as exc`** — catching the base `Exception` class is intentionally broad here. FastF1 can throw many different exception types for session-not-found, network errors, parsing failures, and more. The loader's contract with its callers is simple: either you get a session, or you get `None`. Callers shouldn't need to know which specific error occurred; they just check for `None`. The warning log preserves the original error message for debugging.

**`logger.warning(...)`** — using `%s` placeholders (not f-strings) in logging calls is a Python best practice. The logging framework only formats the string if the message will actually be displayed, so using `%s` avoids string formatting overhead when the log level is set to ERROR or above.

---

## get_race_results: Pandas in Action

Plain English: This function takes a loaded race session and produces a clean list of dicts — one per driver — with their grid position, finish position, team, dominant tyre compound, and race status.

```python
def get_race_results(year: int, track: str) -> list[dict] | None:
    session = get_session(year, track, "R")
    if session is None:
        return None

    results = session.results
    laps = session.laps

    compound_by_driver = (
        laps.groupby("Driver")["Compound"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else None)
        .to_dict()
    )

    rows = []
    for _, row in results.iterrows():
        abbr = row.get("Abbreviation", "")
        rows.append({
            "driver": abbr,
            "grid_position": _int_or_none(row.get("GridPosition")),
            "finish_position": _int_or_none(row.get("Position")),
            "team": row.get("TeamName", ""),
            "compound": compound_by_driver.get(abbr),
            "status": row.get("Status", ""),
        })

    return rows
```

### The Compound Aggregation (the interesting bit)

Plain English: Each driver drives many laps on different tyres. This code figures out which tyre compound each driver used the most during the race, and uses that as their "compound" for the results table.

```python
compound_by_driver = (
    laps.groupby("Driver")["Compound"]
    .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else None)
    .to_dict()
)
```

Step by step:

| Step | What happens | Example |
|------|-------------|---------|
| `laps.groupby("Driver")` | Split the laps DataFrame into groups, one per driver | All VER laps, all HAM laps, etc. |
| `["Compound"]` | For each group, take only the Compound column | `['SOFT', 'SOFT', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'HARD']` |
| `.agg(lambda s: ...)` | Apply a function to each group's series | Returns one value per driver |
| `s.mode()` | Find the most frequent value(s) in the series | `['MEDIUM']` (appeared most) |
| `.iloc[0]` | Take the first mode (in case of ties) | `'MEDIUM'` |
| `if not s.mode().empty else None` | Guard: if all values are NaN, mode() returns empty Series | Returns `None` instead of crashing |
| `.to_dict()` | Convert Series result to `{'VER': 'MEDIUM', 'HAM': 'MEDIUM', ...}` | Python dict for O(1) lookup |

**Why mode and not `value_counts().index[0]`?** Both work. `.mode()` is the idiomatic pandas way to get the most frequent value and handles ties more gracefully. `value_counts().index[0]` is slightly more common in the wild but is equivalent for this use case.

**Why `.to_dict()` and then dict lookup, instead of merging DataFrames?** The results DataFrame is only 20 rows. A merge would work but is overkill. Converting to a dict and doing `.get(abbr)` is simpler, more readable, and handles missing drivers cleanly (`.get()` returns `None` if the key isn't found, instead of raising `KeyError`).

### Iterating Results

Plain English: We walk through each driver's result row and pull out the fields we want, converting tricky types along the way.

```python
for _, row in results.iterrows():
    abbr = row.get("Abbreviation", "")
    rows.append({
        "driver": abbr,
        "grid_position": _int_or_none(row.get("GridPosition")),
        ...
    })
```

Technical detail: `results.iterrows()` yields `(index, Series)` tuples. The `_` discards the index (we don't need the row number). `row.get("ColumnName", default)` is pandas Series' `.get()` method — it returns the default if the column doesn't exist, rather than raising `KeyError`. This makes the function tolerant of sessions where FastF1 returns slightly different column sets.

---

## _int_or_none: Handling NaN in F1 Data

Plain English: F1 data often has missing values for things like grid position (if a driver didn't start) or finish position (if they retired). Python can't store `NaN` in an integer, so this helper converts safely.

```python
def _int_or_none(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
```

Technical detail: pandas uses `float('nan')` (NaN) to represent missing numeric values because Python's `int` type has no NaN concept. When you try `int(float('nan'))`, Python raises `ValueError`. When you try `int(None)`, it raises `TypeError`. This helper catches both and returns `None` — a clean Python sentinel that JSON serialises as `null` and is unambiguous in downstream code.

**Why a try/except instead of `pd.isna(value)` check?** Both work. The try/except is shorter and handles any unexpected type (e.g. an empty string) without needing to enumerate every edge case. This pattern — "attempt the operation, handle failure" — is called EAFP (Easier to Ask Forgiveness than Permission) and is idiomatic Python.

**The `_` prefix** — signals this is a private helper. It won't appear in IDE autocomplete when someone types `loader.` and it communicates "internal plumbing, not public API".

---

## get_weather_summary: Classifying Rain

Plain English: This function reads the weather data recorded during a race and decides whether it was dry, damp, or wet — plus the average temperatures.

```python
def get_weather_summary(year: int, track: str) -> dict | None:
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
```

### The Rainfall Classification

Plain English: FastF1's `Rainfall` column is a boolean — `True` means it was raining at that moment, `False` means it wasn't. By averaging all those True/False values, we get a fraction of the session that had rain.

```python
rainfall = weather["Rainfall"].astype(bool)
wet_fraction = rainfall.mean()
```

Technical detail: FastF1's `Rainfall` column can come through as integers (0/1) or booleans depending on the session. `.astype(bool)` normalises it. `True` becomes `1.0`, `False` becomes `0.0`. `.mean()` gives the proportion of time steps where it was raining. So `wet_fraction = 0.35` means it rained for 35% of the session.

The thresholds (`> 0.2` = wet, `> 0` = damp) are intentionally simple placeholders. Real conditions are more nuanced — you'd want to look at rain intensity, lap times changes, and pit stop timing — but for an MVP this classification is good enough and easy to refine later.

**`.astype(bool)` before `.mean()`** — important because if the column contains strings like `"True"` or `"1"`, averaging would fail. Explicit type coercion prevents silent bugs.

### Double Loading Problem

Plain English: If you call `get_race_results` and `get_weather_summary` for the same race in the same request, the session is loaded twice — once per function. The second load hits the cache, so it's fast, but it's still wasted work.

Technical cause: Both functions call `get_session()` internally. There's no shared session state between calls.

Current impact: Low, since cache hits take milliseconds. But as the codebase grows, this pattern won't scale. The fix (for when it matters) is to either pass a session object into these functions, or add a module-level session cache that memoises loaded sessions by `(year, track, session_type)`.

---

## Type Hints: The `X | None` Union Syntax

Plain English: Python 3.10 introduced a cleaner way to say "this function might return a list, or it might return nothing" — using `|` instead of the older `Optional[X]` from the `typing` module.

```python
def get_race_results(year: int, track: str) -> list[dict] | None:
def get_weather_summary(year: int, track: str) -> dict | None:
def _int_or_none(value) -> int | None:
```

Technical detail: Before Python 3.10, you'd write `from typing import Optional, List` and use `Optional[List[dict]]`. The `X | None` syntax is cleaner, built into the language, and requires no imports. It works for both type checkers (mypy, pyright) and runtime reflection.

The Raceday project runs on Python 3.12, so `X | None` is fine. If you ever need to support Python 3.9 or earlier, you'd need `from __future__ import annotations` at the top of the file to enable it.

---

## Error Handling Philosophy: Return None, Log Warning

Plain English: When something goes wrong loading a session, the loader doesn't crash the whole app — it just returns `None` and writes a note in the logs. This is a deliberate choice.

The two main approaches to error handling are:

**Option A: Raise an exception**
```python
# Callers must catch it or crash
session = get_session(2023, 'British Grand Prix', 'R')  # might raise
```

**Option B: Return None (what we do)**
```python
# Callers check None and decide what to do
session = get_session(2023, 'British Grand Prix', 'R')
if session is None:
    return None  # or return a default, or show an error message
```

**Why Option B for Raceday?**

- **API context**: The insights engine calls the loader to respond to HTTP requests. If the loader raises, the exception propagates up through FastAPI and becomes a 500 error. If it returns `None`, the caller can return a 404 or a helpful message instead.
- **Predictability**: Every function in loader.py has the same contract — it either returns data or `None`. Callers only need to handle one failure case, not multiple exception types.
- **Session availability**: Missing sessions are not truly "errors" — a user might ask for a 1990 race that FastF1 doesn't have data for. That's an expected edge case, not a bug. `None` communicates "not found" better than an exception.

The tradeoff: callers must check for `None` at every call site. If they don't, they'll get `TypeError: 'NoneType' is not iterable` downstream — which is harder to debug than a clear exception from the loader. This is mitigated by consistent `if session is None: return None` patterns throughout the codebase.

---

## The `if __name__ == "__main__"` Block

Plain English: This block at the bottom of the file lets you run the loader directly as a test script, without it running when the file is imported by other modules.

```python
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
```

Technical detail: `__name__` is a special Python variable. When a file is run directly (`python3 loader.py`), `__name__` is `"__main__"`. When it's imported by another module (`from loader import get_session`), `__name__` is the module name (`"loader"`). This check means the test code only runs in the first case.

**The f-string formatting** — `f"{'POS':<4}"` means: render the string `'POS'` left-aligned in a field 4 characters wide. This is Python's format spec mini-language. `<` = left-align, `>` = right-align, `4` = field width. Used here to create a tabular output without a third-party table library.

**`logging.basicConfig(level=logging.INFO)`** — without this, FastF1's INFO logs (the "Loading data..." messages) are suppressed. Adding it to the main block lets you see exactly what FastF1 is doing during the test run, without polluting production use where the caller configures logging.

---

## What the Test Output Told Us

Running against the 2023 British Grand Prix confirmed:

1. **Cache works**: First run fetched from the internet; all subsequent loads used cache (you saw "Using cached data for..." on the second load in `get_weather_summary`)
2. **Results are correct**: Verstappen P1 from P1 on the grid — correct. Norris P2 from P2 — correct for that race. GAS, MAG, OCO all "Retired" — correct (there were retirements)
3. **Compound field works**: Most drivers on MEDIUM as their dominant compound — consistent with a dry British GP where mediums are the primary race tyre
4. **Weather summary works**: Dry, 21.5°C air, 30.9°C track — correct for Silverstone 2023

The `°C` symbol displayed as `?` in the terminal — this is a Windows console encoding issue (code page 1252 vs UTF-8), not a code bug. The string is correct in memory; only the terminal display is wrong.

---

## Edge Cases & Gotchas

**1. Session loads twice in the same request**
In plain English: If you call `get_race_results` and `get_weather_summary` back-to-back, the session is fetched from cache twice instead of once.
Technical cause: No shared session state between function calls.
How to avoid: For now, it's fine (cache hits are fast). Future fix: memoize `get_session` with `functools.lru_cache` or pass session objects explicitly.

**2. Missing Compound data**
In plain English: Some laps may have no tyre compound recorded — particularly the first lap or laps after a safety car.
Technical cause: FastF1 infers compound from timing app data, which isn't always published for every lap.
How to avoid: The `if not s.mode().empty else None` guard handles this. Callers receiving `None` for compound should display "Unknown" rather than crashing.

**3. `GridPosition` for drivers who didn't start**
In plain English: A driver who qualified but had a mechanical issue before the race starts from pit lane or doesn't start at all. Their grid position might be `NaN` or `0`.
Technical cause: FastF1 uses NaN for genuinely missing data, and `0` for pit lane starts.
How to avoid: `_int_or_none` converts NaN to `None`. Frontend should handle `null` grid positions with a "PL" (pit lane) or "-" display.

**4. Track name matching**
In plain English: FastF1 is flexible about track names but not unlimited. "British Grand Prix", "Silverstone", and "Great Britain" all work for the 2023 race — but misspellings or unofficial names will fail.
Technical cause: FastF1 does fuzzy matching against its internal event list using `rapidfuzz`.
How to avoid: Use canonical names (the `Event` column from `fastf1.get_event_schedule(year)`) or round numbers (`fastf1.get_session(2023, 9, 'R')`) for reliability.

**5. `DEFAULT CACHE ENABLED` warning**
In plain English: If the cache isn't configured before any session is loaded, FastF1 uses a tiny temp folder and prints a warning.
Technical cause: Some FastF1 internals (like `get_event_schedule`) can trigger session lookups before explicit cache setup.
How to avoid: Always `import loader` before any other FastF1 use in the project — the module-level cache setup runs immediately on import.

---

## How It Connects to Other Concepts

- **indexer.py** — will call `get_session()`, `get_race_results()`, and `get_weather_summary()`, then persist their outputs to `INDEX_DIR`. The loader is the only FastF1 dependency; the indexer stays clean.
- **insights.py** — reads from the index (not from the loader directly). If the index is cold (session not yet indexed), it'll trigger the indexer, which triggers the loader.
- **api.py** — calls insights functions; never touches the loader. The layering is strict.
- **pandas** — used for `session.laps` (all lap data as a DataFrame) and `session.results` (classification as a DataFrame). The `groupby → agg → to_dict` pattern for compounds is the core pandas idiom used here.
- **python-dotenv** — loads `.env` into `os.environ` at import time, enabling environment-based configuration without hardcoded paths.
- **Python's `Path`** — used for cross-platform path handling. On Windows, `Path` uses backslashes internally but accepts forward slashes. Always prefer `Path` over string concatenation for file paths.

---

## Going Deeper

### `functools.lru_cache` for Session Memoisation
When the double-load issue becomes a bottleneck: wrap `get_session` with `@lru_cache(maxsize=32)`. The cache stores return values keyed by arguments — `(2023, 'British Grand Prix', 'R')` → session object. Repeated calls return the cached object instantly. Caveat: `lru_cache` requires hashable arguments, so if you ever pass a list or dict as an argument, you'd need a different approach.

### Async Session Loading
`session.load()` is synchronous and blocks for several seconds on a cache miss. In a FastAPI async context, this blocks the event loop, preventing other requests from being handled. The fix is `await asyncio.to_thread(session.load, ...)` which runs the blocking call in a thread pool, keeping the event loop free.

### pandas `Categorical` for Compounds
If you're doing a lot of compound analysis, converting the Compound column to `pd.Categorical(['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'])` enables more efficient grouping and ordering. Categoricals also sort in a user-defined order rather than alphabetically, which matters for compound display (Soft < Medium < Hard is the natural order).

### Parquet for Indexed Results
The indexer will need to persist these dicts to disk. Instead of JSON, consider `pandas.DataFrame(results).to_parquet(path)` — binary format, 5-10x smaller than JSON, exact dtype preservation, and reads back instantly with `pd.read_parquet()`.

---

## Quick Reference

### Key Terms

| Term | Plain English | Technical meaning |
|------|---------------|-------------------|
| Module-level side effect | Code that runs when the file is imported | `fastf1.Cache.enable_cache()` runs on import |
| `__file__` | The path to the current Python file | Used to find `.env` relative to `loader.py` |
| `.parents[n]` | Walk N levels up the directory tree | `Path(__file__).resolve().parents[2]` = project root |
| `groupby` | Split a table into groups by a column | Split laps by Driver to process each driver separately |
| `mode()` | The most frequently occurring value | Used to find each driver's dominant tyre compound |
| `agg()` | Apply a function to each group | Used to reduce each group to one compound value |
| `iterrows()` | Walk through a DataFrame row by row | Used to convert results DataFrame to list of dicts |
| `_int_or_none` | Convert to int safely, return None on failure | Handles NaN grid/finish positions from FastF1 |
| EAFP | "Easier to Ask Forgiveness than Permission" | Python idiom: try the operation, handle the error |

### Essential Patterns

```python
# Load a session (laps + weather, no telemetry)
session = get_session(2023, 'British Grand Prix', 'R')
if session is None:
    return None  # always check

# Get cleaned race results
results = get_race_results(2023, 'British Grand Prix')
# results: [{'driver': 'VER', 'finish_position': 1, ...}, ...]

# Get weather summary
weather = get_weather_summary(2023, 'British Grand Prix')
# weather: {'condition': 'dry', 'avg_air_temp': 21.5, 'avg_track_temp': 30.9}

# Find dominant compound per driver (the core pandas pattern)
compound_by_driver = (
    laps.groupby("Driver")["Compound"]
    .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else None)
    .to_dict()
)

# Safe int conversion (handles NaN from pandas)
def _int_or_none(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
```

### Run the test

```bash
cd raceday
python3 backend/core/loader.py
```

---

*Generated: 2026-03-14 | Project: Raceday | Files: backend/core/loader.py*
