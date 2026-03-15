# Raceday Phase 2 — Season Endpoint Pipeline

> How the backend learned to answer "what races happened this year?" — building the four-layer pipeline from FastF1's event schedule all the way to a live REST endpoint.

---

## In Plain English

Up until Phase 1, Raceday could only answer questions about a single race if you already knew its exact name. You had to ask "give me the 2023 British Grand Prix" — you couldn't ask "what races happened in 2023?" or "which ones do I have data for?"

Phase 1 of the backend extension fixes that. It adds a season-level view: hit one endpoint with a year, and you get back a full calendar — every Grand Prix, its date, location, country, format, and whether Raceday has data for it yet. The races you've indexed are ready to explore; the ones you haven't are listed but flagged as unavailable, so the frontend can show them greyed out.

Four pieces were added across the three existing layers plus the API:
1. **`get_season_schedule()`** — asks FastF1 for the full race calendar
2. **`index_season()`** — walks that calendar and indexes every race that isn't already saved
3. **`get_season_races()`** — merges the calendar with the local index to produce a "what have we got?" list
4. **`GET /races/{year}`** — serves that list over HTTP

---

## What Is It? (The Technical View)

FastF1 exposes the full Formula 1 event schedule through a function called `get_event_schedule()`. It returns a pandas DataFrame — a table of rows, one per event, with columns for round number, event name, location, country, date, and event format (conventional weekend vs sprint weekend).

Raceday's loader fetches that DataFrame, normalises it into plain Python dicts, and returns a list. The indexer can then use that list to batch-index an entire season. The insights layer merges the live schedule with the local disk index to answer "which of these have data?". The API turns that answer into a JSON endpoint.

---

## The Problem It Solves

Without season-level data, you can't build a useful UI. If a user opens the Raceday frontend and you can't tell them what races exist, they have to already know the exact track name to type it in — which defeats the purpose of a fan platform.

More practically: without `index_season()`, indexing a full year means calling `index_race()` 22 times manually, once per track. That's tedious and error-prone. One batch function handles it.

And without the `indexed` flag on each race, the frontend can't distinguish "data available" from "data missing" — it would have to make 22 separate API calls to find out, or just show everything and let 404s happen.

---

## How It Works

### The FastF1 Schedule API

Plain English: FastF1 has a built-in function that returns the official F1 race calendar for any year, as a table.

```python
schedule = fastf1.get_event_schedule(year, include_testing=False)
```

`include_testing=False` excludes pre-season testing sessions. Without this flag, you'd get entries for testing weeks which have `RoundNumber = 0` — not actual races. The returned `schedule` is a pandas DataFrame.

Key columns in the DataFrame:

| Column | Type | Example |
|--------|------|---------|
| `RoundNumber` | int | 10 (0 = testing) |
| `EventName` | str | "British Grand Prix" |
| `Location` | str | "Silverstone" |
| `Country` | str | "United Kingdom" |
| `EventDate` | datetime | 2023-07-09 |
| `EventFormat` | str | "conventional" |

Technical detail: `EventFormat` can be `"conventional"` (standard FP1/FP2/FP3/Quali/Race), `"sprint"` (older sprint format), or `"sprint_shootout"` (newer format with Sprint Shootout replacing Quali on Saturday). The frontend can use this to display a sprint badge on relevant rounds.

### DataFrame Iteration and Normalisation

Plain English: The loader converts the table from FastF1's format into simple Python dicts that the rest of the code can use.

```python
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
```

Technical detail: `iterrows()` yields `(index, Series)` pairs. The `_` discards the index — we don't need it. `row.get("ColumnName", default)` is used instead of `row["ColumnName"]` to avoid KeyError if a column is missing in older FastF1 versions.

The date handling `date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)` is a defensive guard: pandas usually returns a `Timestamp` object (which has `strftime`), but if FastF1 changes the type, the fallback `str(date)` keeps it working. The result is always an ISO date string.

### The Skip-and-Count Batch Pattern

Plain English: `index_season()` goes through every race one by one — skipping ones already saved, downloading ones that aren't — and reports back a summary of what it did.

```python
def index_season(year: int) -> dict:
    schedule = loader.get_season_schedule(year)
    if schedule is None:
        return {"total": 0, "indexed": 0, "skipped": 0, "failed": 0}

    total = len(schedule)
    newly_indexed = 0
    skipped = 0
    failed = 0

    for event in schedule:
        track = event["name"]
        if is_indexed(year, track):
            skipped += 1
            continue
        success = index_race(year, track)
        if success:
            newly_indexed += 1
        else:
            failed += 1

    return {"total": total, "indexed": newly_indexed, "skipped": skipped, "failed": failed}
```

Technical detail: The summary dict `{total, indexed, skipped, failed}` follows the pattern of batch operation responses in APIs and CLIs — you always want to know how many succeeded, how many were already done, and how many failed. This is useful for an admin endpoint or a background task later.

The guard at the top — returning early with zero counts if `schedule is None` — means the function never crashes even if FastF1 is unavailable. The caller always gets a dict.

### Dict Unpacking Merge

Plain English: `get_season_races()` combines two things — the FastF1 schedule and the local index status — into a single list with one extra field per race.

```python
return [
    {**event, "indexed": indexer.is_indexed(year, event["name"])}
    for event in schedule
]
```

Technical detail: `{**event, "indexed": ...}` is Python's dict unpacking syntax. `**event` "spreads" all key-value pairs from the `event` dict into the new dict, then `"indexed": ...` adds the extra field. This creates a copy of each event dict with one additional key, without mutating the original. Equivalent to:

```python
new_dict = dict(event)
new_dict["indexed"] = indexer.is_indexed(year, event["name"])
```

The list comprehension makes this terse and readable.

### FastAPI Route Matching

Plain English: The route `/races/{year}` sits alongside `/races/{year}/{track}/results` without conflict, because they have different numbers of path segments.

```python
@app.get("/races/{year}")
def season_races(year: int):
    data = insights.get_season_races(year)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No schedule found for {year}")
    return data
```

Technical detail: FastAPI matches routes top-to-bottom by specificity. `/races/2023` has two path segments — `races` and `2023`. `/races/2023/British%20Grand%20Prix/results` has four segments. They can never conflict because the segment count differs. If two routes had the same segment count and pattern, the first one registered would win — ordering matters in that case, but not here.

---

## What We Built

### Code Walkthrough

**`backend/core/loader.py` — get_season_schedule()**

Plain English: Ask FastF1 for the year's race calendar; convert it to a clean list of dicts; skip testing entries; handle date formatting defensively.

```python
def get_season_schedule(year: int) -> list[dict] | None:
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
```

Technical detail: The broad `except Exception` catch matches the pattern used throughout Raceday's loader — missing data or unavailable data is an expected edge case, not a bug. Returning `None` lets the caller decide how to handle it (log and skip, return 404, etc.) rather than crashing the whole server.

---

**`backend/core/indexer.py` — index_season()**

Plain English: Fetch the schedule, walk it, skip already-indexed races, index the rest, return a tally.

```python
def index_season(year: int) -> dict:
    schedule = loader.get_season_schedule(year)
    if schedule is None:
        return {"total": 0, "indexed": 0, "skipped": 0, "failed": 0}

    total = len(schedule)
    newly_indexed = 0
    skipped = 0
    failed = 0

    for event in schedule:
        track = event["name"]
        if is_indexed(year, track):
            skipped += 1
            continue
        success = index_race(year, track)
        if success:
            newly_indexed += 1
        else:
            failed += 1

    return {"total": total, "indexed": newly_indexed, "skipped": skipped, "failed": failed}
```

Technical detail: `is_indexed()` is a cheap disk check (just checks if two files exist). Running it before `index_race()` avoids re-downloading sessions that are already saved. This makes the function idempotent — you can call it multiple times and it only does work that hasn't been done yet.

---

**`backend/core/insights.py` — get_season_races()**

Plain English: Get the schedule from FastF1, check each race against the local index, tag each one with `indexed: true/false`.

```python
def get_season_races(year: int) -> list[dict] | None:
    schedule = loader.get_season_schedule(year)
    if schedule is None:
        logger.warning("get_season_races: no schedule for %s", year)
        return None

    return [
        {**event, "indexed": indexer.is_indexed(year, event["name"])}
        for event in schedule
    ]
```

Technical detail: This function calls both `loader` and `indexer` directly. Insights normally only reads from the indexer, but the schedule isn't indexed data — it comes fresh from FastF1's schedule API. Having insights call loader here is justified because the schedule is not something we persist to disk; it's always fetched live.

---

**`backend/api.py` — GET /races/{year}**

Plain English: Accept a year in the URL, call get_season_races, return the list or a 404.

```python
@app.get("/races/{year}")
def season_races(year: int):
    data = insights.get_season_races(year)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No schedule found for {year}")
    return data
```

Technical detail: FastAPI automatically converts the path parameter `{year}` to `int` because of the type annotation `year: int`. If someone requests `/races/abc`, FastAPI returns a 422 Unprocessable Entity automatically — you don't need to validate it yourself.

---

### How the Pieces Connect

```
GET /races/2023
      |
      v
api.py — season_races(2023)
      |
      v
insights.get_season_races(2023)
      |
      +---> loader.get_season_schedule(2023)
      |           |
      |           v
      |     fastf1.get_event_schedule(2023)
      |     [network/cache → DataFrame → list of dicts]
      |
      +---> indexer.is_indexed(2023, "British Grand Prix")
            indexer.is_indexed(2023, "Bahrain Grand Prix")
            ... (one check per race)
            [disk checks — very fast]
      |
      v
[{round:1, name:"Bahrain GP", ..., indexed:false},
 {round:10, name:"British GP", ..., indexed:true},
 ...]
      |
      v
JSON response
```

---

## Common Patterns

### Pattern 1: Return None, Not Raise

What it's for: signalling "data unavailable" without crashing the caller.

Every loader function wraps its FastF1 call in a try/except and returns None on failure. Every insights function checks for None before proceeding. The API layer is the only place that converts None into an HTTP error. This keeps business logic clean and testable.

```python
# Loader: catch and return None
try:
    schedule = fastf1.get_event_schedule(year, include_testing=False)
except Exception as exc:
    logger.warning("...")
    return None

# Insights: check and propagate None
if schedule is None:
    return None

# API: convert None to 404
if data is None:
    raise HTTPException(status_code=404, ...)
```

### Pattern 2: Defensive Column Access with `.get()`

What it's for: avoiding KeyError when FastF1 changes its DataFrame columns.

```python
row.get("EventName", "")  # "" if column missing
row.get("EventFormat", "conventional")  # sensible default
```

### Pattern 3: Idempotent Batch Operations

What it's for: safe re-runs — calling `index_season()` twice doesn't duplicate work.

Check before doing. `is_indexed()` is cheap; `index_race()` is expensive. Always check first.

```python
if is_indexed(year, track):
    skipped += 1
    continue
```

### Pattern 4: Summary Dicts for Batch Returns

What it's for: giving callers a clear picture of what happened.

```python
return {"total": 22, "indexed": 5, "skipped": 17, "failed": 0}
```

---

## Edge Cases & Gotchas

1. **Round number filtering**
   In plain English: Testing events sneak in with round number 0, and we filter them out.
   Technical cause: `get_event_schedule(include_testing=False)` should exclude them, but the extra check `if round_num < 1: continue` provides a second layer of defence.
   How to avoid: Keep both — `include_testing=False` as the primary filter, the `< 1` guard as a safety net.

2. **EventName as the track identifier**
   In plain English: Races are identified by their full event name (e.g. "British Grand Prix"), which must match exactly between the schedule and the index directory on disk.
   Technical cause: The index stores data in `INDEX_DIR/{year}/{track}/` where `track` is the EventName. If FastF1 ever changes the name (e.g. "British Grand Prix" → "UK Grand Prix"), the existing index directory won't be found.
   How to avoid: Use event names as-is; don't transform or normalise them.

3. **Sprint weekends in the schedule**
   In plain English: Some rounds are sprint weekends and show `format: "sprint_shootout"`. The indexer currently only indexes the Race session — sprint race data isn't included.
   Technical cause: `index_race()` calls `get_session(year, track, "R")` — always the main race.
   How to avoid: Note this in the frontend — "Sprint race data not available" for sprint rounds.

4. **Schedule fetch on every request**
   In plain English: Every call to `/races/{year}` fetches the schedule from FastF1 (or FastF1's cache). This is fast when cached but slower on first call.
   Technical cause: No in-memory caching of the schedule in Raceday.
   How to avoid: For production, add `functools.lru_cache` to `get_season_schedule()`.

5. **Name mismatch risk between seasons**
   In plain English: Occasionally, race names change between years (new sponsors, country name changes). This won't cause bugs — it just means a fresh download for a race that has a different name.
   Technical cause: is_indexed() checks the exact directory name, which comes from EventName.
   How to avoid: Acceptable — just be aware that renaming a track means re-indexing it.

---

## How It Connects to Other Concepts

- **Existing loader pattern**: `get_season_schedule()` follows the same catch-and-return-None pattern as `get_race_results()` and `get_weather_summary()`. All loader functions are thin, defensive wrappers around FastF1.

- **`is_indexed()` and `list_indexed()`**: The season pipeline uses `is_indexed()` (per-race check) rather than `list_indexed()` (scan all indexed races) because `is_indexed()` is more direct — we already know which tracks to check (from the schedule), so we don't need to scan the disk.

- **Championship endpoint**: `get_championship_standings()` uses `list_indexed()` instead of the schedule — it only cares about races we have data for, not all races that existed. Two different access patterns for two different questions.

- **Frontend race picker**: The `indexed` boolean on each race in the response is the signal the frontend uses to decide which races are clickable and which are greyed out.

---

## Going Deeper

### In-memory Schedule Caching

The schedule doesn't change mid-season (much). Adding `@functools.lru_cache(maxsize=8)` to `get_season_schedule()` would mean the FastF1 call only happens once per year per process lifetime:

```python
import functools

@functools.lru_cache(maxsize=8)
def get_season_schedule(year: int) -> list[dict] | None:
    ...
```

Caveat: `lru_cache` can't cache mutable return values safely — if the caller mutates the list, the cached copy changes too. Since we use dict unpacking `{**event, ...}` in `get_season_races()` we're already creating copies, so this is safe.

### Persisting the Schedule to Disk

For fully offline operation, `index_season()` could save the schedule itself as `schedule.json` in the year's index directory. Then `get_season_races()` could read from disk instead of calling FastF1. Useful if FastF1's schedule API becomes unreliable.

### Sprint Race Indexing

To index sprint races, add a `get_sprint_results(year, track)` function to loader, call it in `index_race()`, and save `sprint_results.json`. The season endpoint could then flag `sprint_indexed: true/false` per round.

### Paginating the Season List

22 races is small and returns fast. For future expansions (historical seasons, multiple years), consider adding `?page=` and `?limit=` query parameters to `/races/{year}`.

---

## Quick Reference

### Function Signatures

```python
# loader.py
get_season_schedule(year: int) -> list[dict] | None

# indexer.py
index_season(year: int) -> dict  # {total, indexed, skipped, failed}

# insights.py
get_season_races(year: int) -> list[dict] | None

# api.py
GET /races/{year}  →  list[dict] | 404
```

### Return Shapes

```python
# get_season_schedule / get_season_races item
{
    "round": 10,
    "name": "British Grand Prix",
    "location": "Silverstone",
    "country": "United Kingdom",
    "date": "2023-07-09",
    "format": "conventional",
    # get_season_races adds:
    "indexed": True
}

# index_season return
{
    "total": 22,
    "indexed": 5,
    "skipped": 17,
    "failed": 0
}
```

### FastF1 Column Mapping

| FastF1 column | Raceday field | Notes |
|--------------|---------------|-------|
| `RoundNumber` | `round` | int; 0 = testing (filtered) |
| `EventName` | `name` | used as directory key in index |
| `Location` | `location` | city/circuit |
| `Country` | `country` | country name |
| `EventDate` | `date` | ISO string YYYY-MM-DD |
| `EventFormat` | `format` | conventional / sprint / sprint_shootout |

### HTTP Behaviour

| Request | Conditions | Response |
|---------|-----------|----------|
| `GET /races/2023` | FastF1 available | 200 + list of 22 races |
| `GET /races/2023` | FastF1 unavailable | 404 + error detail |
| `GET /races/1800` | No such season | 404 + error detail |
| `GET /races/abc` | Non-integer year | 422 Unprocessable Entity (FastAPI auto) |

---

*Generated: 2026-03-16 | Project: raceday | Phase: 2 Season Endpoint*
*Files: backend/core/loader.py, backend/core/indexer.py, backend/core/insights.py, backend/api.py*
