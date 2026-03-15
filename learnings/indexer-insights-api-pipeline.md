# Raceday: Indexer, Insights & API — The Complete Pipeline

> How Raceday goes from raw F1 data on disk to a working web API — a walkthrough of the three modules built in Phase 1-3, the patterns used, and why each decision was made.

---

## In Plain English

Imagine a library. Someone has already gone out and collected all the F1 race books (that's the loader — done in the previous phase). But if every time someone walked in and asked "what happened at the 2023 British GP?", the librarian had to drive to the warehouse and retrieve the book from scratch — that would be painfully slow.

The **indexer** is the filing system. It takes those books, organises them on shelves by year and race name, and keeps a list of what's already filed. Next time someone asks for the 2023 British GP, the librarian checks the shelf — it's already there, just pick it up.

The **insights engine** is the librarian who actually reads the book and gives you a useful answer. Not the whole book — just the highlights: who won, who crashed out, who made the smartest tyre strategy. It turns raw data into something a fan actually wants to know.

The **API** is the front desk. It's the place you walk up to and ask your question. The front desk takes your request, passes it to the librarian (insights), and hands back the answer in a consistent, clean format — the same way every time, no matter who's asking.

---

## The Problem Each Layer Solves

**Without the indexer:** every API request re-downloads data from FastF1 — slow, hits rate limits, useless offline.

**Without insights:** the API would return raw DataFrames or messy dicts. The frontend would have to figure out who won, calculate position deltas, sort the standings — logic that belongs in the backend.

**Without the API:** insights only works when you run Python directly. No frontend, no mobile app, no external consumer can use it.

Together they form a clean pipeline with a strict rule: **each layer only talks to the one above it.**

```
[FastF1 / Internet]
       ↓
[loader.py]     ← fetches, normalises
       ↓
[indexer.py]    ← persists to disk, retrieves from disk
       ↓
[insights.py]   ← reads index, produces analysis
       ↓
[api.py]        ← receives HTTP, calls insights, returns JSON
       ↓
[Frontend / curl / browser]
```

---

## Part 1: indexer.py — The Filing System

### What It Does

Plain English: The indexer saves race data to your hard drive and remembers what it has saved. Ask for a race it already has and it reads it from disk in milliseconds. Ask for one it doesn't have and it fetches it first, saves it, then returns it.

### File Structure on Disk

```
data/index/
└── 2023/
    └── British Grand Prix/
        ├── race_results.json    ← list of 20 driver dicts
        └── weather.json         ← {condition, avg_air_temp, avg_track_temp}
```

Simple, human-readable, inspectable with any text editor. Each race gets its own folder, nested by year. If you ever need to wipe one race and re-index it, just delete its folder.

### The Four Public Functions

**`index_race(year, track)`** — the writer.

Plain English: Calls the loader for results and weather, then saves both as JSON files to disk. Returns True on success, False if the loader couldn't get data.

```python
def index_race(year: int, track: str) -> bool:
    race_dir = _race_dir(year, track)
    results = loader.get_race_results(year, track)
    if results is None:
        logger.warning("index_race: no results returned for %s %s — skipping", year, track)
        return False

    weather = loader.get_weather_summary(year, track)
    if weather is None:
        weather = {}

    race_dir.mkdir(parents=True, exist_ok=True)

    with open(race_dir / "race_results.json", "w") as f:
        json.dump(results, f, indent=2)

    with open(race_dir / "weather.json", "w") as f:
        json.dump(weather, f, indent=2)

    return True
```

Technical detail: `race_dir.mkdir(parents=True, exist_ok=True)` creates all necessary parent directories in one call and doesn't complain if they already exist. The `indent=2` makes the JSON human-readable when you open it in a text editor — a small touch that pays off when debugging.

---

**`is_indexed(year, track)`** — the checker.

Plain English: Two-line function that checks whether both JSON files exist for a given race.

```python
def is_indexed(year: int, track: str) -> bool:
    race_dir = _race_dir(year, track)
    return (race_dir / "race_results.json").exists() and (race_dir / "weather.json").exists()
```

Technical detail: `Path.exists()` is a fast OS-level file stat call — no file reading, essentially zero cost. Checking both files (not just the directory) ensures a partial index (e.g. only results, no weather) is treated as not indexed. This prevents silent data gaps.

---

**`load_race_index(year, track)`** — the reader with auto-fetch.

Plain English: The key function everything downstream calls. If the race is already indexed, read it from disk and return it. If not, index it first, then return it. Callers never have to think about whether something is indexed.

```python
def load_race_index(year: int, track: str) -> dict | None:
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

    return {"results": results, "weather": weather}
```

Technical detail: This pattern — "check if cached, fetch if not, always return data" — is called **cache-aside** (or lazy loading). The application code doesn't pre-load everything at startup; it fetches on first use and caches for subsequent calls. Works well when you don't know in advance which races will be requested.

---

**`list_indexed()`** — the catalogue.

Plain English: Walks the index directory and returns every race that's been fully saved.

```python
def list_indexed() -> list[dict]:
    indexed = []
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
```

Technical detail: `try: year = int(year_dir.name) except ValueError: continue` skips any non-year folders (like `.DS_Store` on Mac or temp files). Calling `is_indexed()` inside the loop means only fully complete races are listed — no partial entries.

---

### The _race_dir Helper

Plain English: One function that knows where any race's folder lives. Every other function calls this instead of building the path themselves.

```python
def _race_dir(year: int, track: str) -> Path:
    return _index_dir / str(year) / track
```

Technical detail: The `_` prefix signals this is private to the module. Path objects support `/` for joining — `_index_dir / "2023" / "British Grand Prix"` is equivalent to `os.path.join(index_dir, "2023", "British Grand Prix")` but more readable and cross-platform. Centralising path logic in one place means if the folder structure ever changes, you update one line.

---

## Part 2: insights.py — The Analysis Layer

### What It Does

Plain English: Takes the raw dicts from the indexer — 20 rows of driver data — and turns them into actual answers fans want. Who won? Who gained the most places? What tyres did people run?

The insights module never touches FastF1 or the loader directly. It only calls `indexer.load_race_index()`. This is the strict layering rule at work.

### get_race_summary

Plain English: Returns the headline story of a race: winner, podium, retirements, weather.

```python
def get_race_summary(year: int, track: str) -> dict | None:
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data["weather"]

    finished = [r for r in results if r["finish_position"] is not None]
    finished_sorted = sorted(finished, key=lambda r: r["finish_position"])

    podium = [r["driver"] for r in finished_sorted[:3]]
    winner = podium[0] if podium else None

    retirements = [r["driver"] for r in results if r["status"] not in ("Finished",)
                   and not r["status"].startswith("+")]

    return {
        "winner": winner,
        "podium": podium,
        "retirements": retirements,
        "weather": weather.get("condition"),
        "avg_air_temp": weather.get("avg_air_temp"),
        "avg_track_temp": weather.get("avg_track_temp"),
    }
```

Technical detail:

- `[r for r in results if r["finish_position"] is not None]` — list comprehension filtering out drivers with no finish position (retirements)
- `sorted(..., key=lambda r: r["finish_position"])` — sorts by finish position ascending; `lambda` creates an anonymous function that extracts the sort key
- `not r["status"].startswith("+")` — lapped cars have status like "+1 Lap", "+2 Laps"; these are classified finishers, not retirements
- `weather.get("condition")` — using `.get()` instead of `["condition"]` returns `None` if the key is missing, rather than raising `KeyError`. Defensive for races with no weather data.

---

### get_driver_standings_snapshot

Plain English: Returns every driver sorted by finish position, with a number showing how many places they gained or lost from their starting grid slot.

```python
for r in finishers_sorted + retired:
    finish = r["finish_position"]
    grid   = r["grid_position"]

    if finish is not None and grid is not None:
        delta = grid - finish   # positive = moved forward
    else:
        delta = None
```

Technical detail: `delta = grid - finish` — if you started P15 and finished P6, that's 15 - 6 = +9 (gained 9 places). If you started P4 and finished P9, that's 4 - 9 = -5 (lost 5 places). The formula is `grid minus finish`, not `finish minus grid` — easy to get backwards.

Why `finishers_sorted + retired`? List concatenation puts all finishers first (sorted by position) then retirements at the end — a natural display order for any leaderboard.

---

### get_strategy_breakdown

Plain English: Returns each driver's primary tyre compound and a human-readable label.

```python
_COMPOUND_LABELS = {
    "SOFT": "Soft",
    "MEDIUM": "Medium",
    "HARD": "Hard",
    "INTERMEDIATE": "Intermediate",
    "WET": "Wet",
}

compound = r.get("compound") or "Unknown"
compound_name = _COMPOUND_LABELS.get(compound, compound.title())
label = f"{compound_name} primary"
```

Technical detail: `_COMPOUND_LABELS` is a module-level dict — defined once, reused on every call. `compound.title()` is a fallback that converts e.g. `"HYPERSOFT"` to `"Hypersoft"` if an unexpected compound appears. The `or "Unknown"` guard handles `None` compound values without a separate if-statement.

Note on limitations: the index currently stores only the dominant compound per driver (most laps on that tyre). Full stint-by-stint data and stop counts require indexing lap-level tyre data — a natural next extension.

---

## Part 3: api.py — The Front Desk

### What It Does

Plain English: Turns Python functions into URLs. When someone hits `/races/2023/British Grand Prix/results` in a browser or app, FastAPI calls `insights.get_race_summary(2023, "British Grand Prix")` and sends back the result as JSON.

### The Full api.py

```python
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.core import insights

logger = logging.getLogger(__name__)

app = FastAPI(title="Raceday", description="F1 Fan Intelligence Platform")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/races/{year}/{track}/results")
def race_results(year: int, track: str):
    data = insights.get_race_summary(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/standings")
def race_standings(year: int, track: str):
    data = insights.get_driver_standings_snapshot(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/strategy")
def race_strategy(year: int, track: str):
    data = insights.get_strategy_breakdown(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data
```

### Path Parameters

Plain English: `{year}` and `{track}` in the URL are variables — FastAPI extracts them automatically and passes them to your function.

```python
@app.get("/races/{year}/{track}/results")
def race_results(year: int, track: str):
```

Technical detail: FastAPI reads the type hint (`year: int`) and automatically converts the URL string to an integer. If someone passes `year=abc`, FastAPI returns a 422 Unprocessable Entity before your function even runs. `track` stays as a string — URL-encoded spaces become `%20` in the URL (`British%20Grand%20Prix`) and FastAPI decodes them back to spaces before passing to your function.

### HTTPException — The 404 Pattern

Plain English: When insights returns `None` (race not found), we raise an HTTPException telling FastAPI to send back a 404 response with a message.

```python
if data is None:
    raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
```

Technical detail: `HTTPException` is FastAPI's built-in way to abort a request with a specific HTTP status code. `raise` (not `return`) immediately stops function execution. FastAPI catches it and sends `{"detail": "No data found for 2099 Fake GP"}` with status 404. The `detail` key is FastAPI's convention for error messages.

### Global Exception Handler — The 500 Safety Net

Plain English: If something unexpected blows up inside any route — a bug we didn't anticipate — this handler catches it and returns a clean JSON error instead of crashing with a raw Python traceback.

```python
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )
```

Technical detail: `@app.exception_handler(Exception)` registers this function as a catch-all for any unhandled exception. `logger.exception(...)` logs the full stack trace (unlike `logger.error` which only logs the message) — important for debugging. `JSONResponse` is used instead of returning a plain dict because we need explicit control over the status code (500).

Note: `async def` is used here because FastAPI's exception handlers must be async. The route handlers (`def`, not `async def`) are synchronous — FastAPI runs them in a thread pool automatically.

---

## How the Complete Pipeline Connects

Plain English: Here's the full story of what happens when someone hits `/races/2023/British Grand Prix/results`:

```
1. Browser/curl sends:
   GET /races/2023/British%20Grand%20Prix/results

2. FastAPI receives it, extracts year=2023, track="British Grand Prix"
   calls race_results(2023, "British Grand Prix")

3. race_results() calls:
   insights.get_race_summary(2023, "British Grand Prix")

4. get_race_summary() calls:
   indexer.load_race_index(2023, "British Grand Prix")

5a. If already indexed:
    → reads data/index/2023/British Grand Prix/race_results.json
    → reads data/index/2023/British Grand Prix/weather.json
    → returns dict immediately

5b. If NOT indexed:
    → calls index_race(2023, "British Grand Prix")
    → index_race calls loader.get_race_results() and loader.get_weather_summary()
    → loader calls fastf1.get_session().load() (cache hit or internet)
    → saves to disk
    → load_race_index reads back from disk and returns

6. get_race_summary() processes the dicts:
   filters, sorts, extracts winner/podium/retirements/weather

7. race_results() checks if data is None → it isn't → returns dict

8. FastAPI serialises dict to JSON, sends:
   HTTP 200
   {"winner":"VER","podium":["VER","NOR","HAM"],...}
```

---

## Common Patterns

### Pattern 1: Cache-Aside (Lazy Indexing)

What it's for: Fetch data on first request, serve from cache on all subsequent ones.

```python
def load_race_index(year, track):
    if not is_indexed(year, track):      # check first
        success = index_race(year, track) # fetch and save if missing
        if not success:
            return None
    # always read from disk
    with open(_race_dir(year, track) / "race_results.json") as f:
        return json.load(f)
```

Use this when: you don't know which items will be requested, fetching is expensive, and you want the first request to "warm" the cache automatically.

### Pattern 2: Thin Route Handlers

What it's for: Keep API routes as simple as possible — one call to the insight function, one None check, return the data.

```python
@app.get("/races/{year}/{track}/results")
def race_results(year: int, track: str):
    data = insights.get_race_summary(year, track)   # delegate everything
    if data is None:
        raise HTTPException(status_code=404, ...)
    return data
```

No business logic in the route. No data transformation. If you need to change how results are calculated, you change `get_race_summary()` — not the route. Routes only know about HTTP; core modules only know about data.

### Pattern 3: None as a Clean Failure Signal

What it's for: Functions that might not have data return `None` instead of raising exceptions, letting callers decide how to handle it.

```python
# insights.py — returns None cleanly
def get_race_summary(year, track):
    data = indexer.load_race_index(year, track)
    if data is None:
        return None
    ...

# api.py — converts None to 404
if data is None:
    raise HTTPException(status_code=404, ...)
```

The None propagates up the chain cleanly. Each layer decides what to do with it: the insights layer passes it up, the API layer converts it to an HTTP response. No exceptions crossing layer boundaries.

---

## Edge Cases & Gotchas

**1. Track names with spaces in URLs**
In plain English: "British Grand Prix" becomes "British%20Grand%20Prix" in a URL — the browser/curl encodes spaces as `%20`.
Technical cause: URLs can't contain raw spaces; `%20` is the percent-encoded form.
How to avoid: FastAPI decodes it automatically. Test with: `curl "http://localhost:8001/races/2023/British%20Grand%20Prix/results"`

**2. Running modules as scripts vs packages**
In plain English: Running `python3 backend/core/indexer.py` fails because Python can't find the `backend` package. `python3 -m backend.core.indexer` works.
Technical cause: When you run a file directly, Python sets `__name__ = "__main__"` but doesn't add the parent directory to `sys.path`. The `-m` flag tells Python to find the module in the package system, so imports like `from backend.core import loader` work.
How to avoid: Always use `python3 -m backend.core.<module>` from the `raceday/` root.

**3. Port conflicts**
In plain English: Port 8000 was already in use on this machine (likely another server). Had to use 8001, 8002 etc.
Technical cause: Only one process can bind to a port at a time.
How to avoid: Use `--port 8001 --reload` for dev. Check what's on 8000 with `netstat -ano | findstr 8000` on Windows.

**4. Partial index**
In plain English: If `index_race()` crashes midway, you might have `race_results.json` but no `weather.json`. `is_indexed()` catches this — it checks both files.
Technical cause: File writes aren't atomic. A crash between the two `json.dump()` calls leaves a partial index.
How to avoid: `is_indexed()` requires both files. To force a re-index, delete the race's folder and run `index_race()` again.

**5. lapped cars ≠ retirements**
In plain English: A driver who finishes the race but a lap down has status "+1 Lap" — they finished, just behind. Don't mistake them for retirements.
Technical cause: FastF1's `status` field uses "+X Laps" for classified finishers who didn't complete all laps, and "Retired"/"Accident" etc. for actual DNFs.
How to avoid: `not r["status"].startswith("+")` correctly excludes lapped finishers from the retirements list.

---

## How It Connects to Other Concepts

- **loader.py** — the layer below indexer. Indexer calls loader; loader calls FastF1. If loader returns None, indexer returns False, insights returns None, API returns 404. The None chain is the error propagation mechanism.
- **FastF1 cache (CACHE_DIR)** — different from the indexer (INDEX_DIR). FastF1's cache stores raw HTTP responses. The indexer stores processed, normalised Python dicts. Two separate caching layers, two separate purposes.
- **pandas** — used in loader.py to process raw FastF1 data. By the time data reaches the indexer, it's already plain Python dicts — no pandas dependency in indexer, insights, or api.
- **python-dotenv** — both loader.py and indexer.py call `load_dotenv()` on import to read `CACHE_DIR` and `INDEX_DIR`. Each module is independently configurable.
- **REST conventions** — the URL pattern `/races/{year}/{track}/{resource}` follows REST resource naming: the resource is the noun (results, standings, strategy), the HTTP method (GET) is the verb.

---

## Going Deeper

### Async Route Handlers
All three routes are synchronous (`def`, not `async def`). FastAPI runs them in a thread pool, which works fine but limits concurrency. When the indexer adds heavy I/O operations (loading many races at once), converting to `async def` with `await asyncio.to_thread()` for blocking calls would handle more simultaneous requests.

### Response Models (Pydantic)
Right now routes return plain dicts — FastAPI serialises them to JSON automatically. Adding Pydantic response models (`response_model=RaceSummary`) gives you auto-validation, auto-documentation in `/docs`, and type safety. Useful when the API goes public.

### Adding More Races to the Index
Right now only the 2023 British GP is indexed. To build the full index: write a script that loops `fastf1.get_event_schedule(year)` for each year and calls `index_race()` on each. The cache-aside pattern in `load_race_index()` means this can be done lazily (index on first request) or eagerly (pre-index at startup).

### CORS
If a frontend app on a different domain hits this API (e.g. a React app on localhost:3000), the browser will block it by default (CORS policy). Fix: `from fastapi.middleware.cors import CORSMiddleware` + `app.add_middleware(CORSMiddleware, allow_origins=["*"])`.

### Parquet Instead of JSON
JSON is readable but slow for large datasets. When the index grows to thousands of races, replacing `json.dump/load` with `pandas.DataFrame.to_parquet/read_parquet` shrinks files 5-10x and speeds up reads dramatically. The interface of `load_race_index()` stays the same — only the internals change.

---

## Quick Reference

### Key Terms

| Term | Plain English | Technical meaning |
|------|---------------|-------------------|
| Cache-aside | Check first, fetch if missing, always serve from cache | Lazy loading pattern: on-demand population of a local store |
| Path parameter | Variable in a URL like `{year}` | FastAPI extracts and type-converts automatically |
| HTTPException | Tell FastAPI to return an error response | Raises an HTTP error code (404, 500) with a JSON body |
| 404 | "Not found" | HTTP status code returned when requested data doesn't exist |
| 500 | "Server error" | HTTP status code returned for unexpected internal failures |
| Route handler | The Python function that runs when a URL is hit | FastAPI function decorated with `@app.get(...)` |
| Thin handler | Route with no business logic — just calls core and returns | Good practice: routes only know about HTTP |
| positions_delta | How many places a driver gained or lost | `grid_position - finish_position` (positive = gained) |

### Run Commands

```bash
# From raceday/ root

# Test indexer
python3 -m backend.core.indexer

# Test insights
python3 -m backend.core.insights

# Start API server
python3 -m uvicorn backend.api:app --port 8001 --reload

# Hit the API
curl "http://localhost:8001/health"
curl "http://localhost:8001/races/2023/British%20Grand%20Prix/results"
curl "http://localhost:8001/races/2023/British%20Grand%20Prix/standings"
curl "http://localhost:8001/races/2023/British%20Grand%20Prix/strategy"

# Interactive API docs (in browser)
http://localhost:8001/docs
```

### The None Chain

```
FastF1 fails
    → loader returns None
        → indexer.index_race returns False
            → indexer.load_race_index returns None
                → insights.get_race_summary returns None
                    → api raises HTTPException(404)
                        → client receives {"detail": "No data found..."}
```

---

*Generated: 2026-03-15 | Project: Raceday | Files: backend/core/indexer.py, backend/core/insights.py, backend/api.py*
