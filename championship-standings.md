# Raceday Phase 3 — Driver Championship Standings

> How Raceday learned to add up points across a season — building the accumulator that turns per-race finishing positions into a live championship table.

---

## In Plain English

The F1 World Championship is decided by points accumulated across an entire season — 25 for a win, 18 for second, down to 1 point for tenth. After each race, the points table shifts. The driver with the most at the end of the year wins the title.

Before Phase 3, Raceday could tell you everything about a single race in detail — who won, what tyres they used, how many positions they gained. But it couldn't answer the bigger question: who's leading the championship?

Phase 3 adds that. It introduces a points table, a function that iterates every indexed race and accumulates points per driver, and an API endpoint that serves the result. The standings are automatically based on however many races you've indexed — index one race and you get a one-race snapshot; index the full season and you get the complete picture.

---

## What Is It? (The Technical View)

Championship standings in F1 are a running total. For every race, each driver is awarded points based on their finishing position. Those points accumulate across all races in the season. The standings table is sorted by total points, with wins as the tiebreaker.

Raceday implements this with:

1. **`_POINTS_TABLE`** — a Python dict mapping finishing position to points value.
2. **`get_championship_standings(year)`** — iterates all indexed races for the year, accumulates points per driver, sorts the result.
3. **`GET /championship/{year}/drivers`** — the API endpoint.

The function only counts races that are indexed. If only 5 of 22 races are on disk, it returns standings based on those 5 — accurate to what's available, never fabricated.

---

## The Problem It Solves

Without championship standings, a fan intelligence platform is just a single-race lookup tool. The championship is the narrative arc of the season — who's gaining, who's falling back, who's still in contention. That's what fans track between races.

More practically: points need to come from somewhere. They can't be invented, and they can't come from an external API without rate limits and auth complexity. Raceday already indexes the data needed to compute them — the finishing positions are right there in `race_results.json`. The points system is just maths on top of existing data.

---

## How It Works

### The Points Table

Plain English: A simple lookup dictionary that maps "finished P1" to "gets 25 points."

```python
_POINTS_TABLE = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}
```

Technical detail: This is the current F1 points system, in use since 2010. P11 and below score 0 — they're absent from the dict, and `dict.get(pos, 0)` returns the default of 0 for any position not in the table.

What's deliberately excluded: the bonus point for fastest lap (awarded to the driver who sets the fastest lap, if they finish in the top 10). Raceday doesn't currently index lap time data, so this is a known limitation noted in the docstring.

### The Accumulator Pattern

Plain English: Go through every indexed race, look at each driver's finish, add their points to a running total, end up with a complete season tally.

```python
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
        tally[driver]["team"]    = r["team"]
```

Technical detail: This is a classic "accumulate" or "fold" pattern — you start with an empty container (`tally = {}`), iterate a collection, and build up state incrementally. It's the same pattern used in computing word counts, bank balances, or any running total.

`if driver not in tally: tally[driver] = {...}` initialises the driver's entry with zero values on first encounter. From then on, we just `+=`.

`tally[driver]["team"] = r["team"]` overwrites on every race. This keeps the most recent team name — important for mid-season driver transfers (a driver who switched teams partway through the season shows their current team).

### Sorting with Multiple Keys

Plain English: Sort drivers by total points (most first). If two drivers have the same points, the one with more wins goes higher — exactly as real F1 does.

```python
sorted_drivers = sorted(
    tally.items(),
    key=lambda x: (-x[1]["points"], -x[1]["wins"]),
)
```

Technical detail: `tally.items()` yields `(driver_str, stats_dict)` pairs. The sort key is a tuple `(-points, -wins)`. Python sorts tuples lexicographically — first element first, second element only if first elements are equal.

Negating both values (`-points`, `-wins`) tricks ascending sort into working as descending sort. `-25 < -18` is True, so `sorted()` puts the 25-point driver first. This avoids the `reverse=True` parameter which would apply to all keys simultaneously and can't do "sort by X descending, then Y descending" cleanly.

### Position Assignment with enumerate()

Plain English: After sorting, number the positions 1, 2, 3... using Python's built-in position counter.

```python
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
```

Technical detail: `enumerate(sorted_drivers)` yields `(0, first_item)`, `(1, second_item)`, etc. `i + 1` converts the 0-based index to a 1-based championship position. The unpacking `(driver, info)` in the loop variable pulls apart the `(str, dict)` pairs from `tally.items()`.

---

## What We Built

### `backend/core/insights.py` — _POINTS_TABLE + get_championship_standings()

Plain English: A lookup table for points, and a function that walks every indexed race, tallies points per driver, and returns a sorted championship table.

```python
_POINTS_TABLE = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}


def get_championship_standings(year: int) -> list[dict] | None:
    indexed = [r for r in indexer.list_indexed() if r["year"] == year]
    if not indexed:
        logger.warning("get_championship_standings: no indexed races for %s", year)
        return None

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
            tally[driver]["team"]    = r["team"]

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
```

**Verified output (1 race indexed — 2023 British GP):**
```
P1  VER  Red Bull Racing  25pts  1win  1race
P2  NOR  McLaren          18pts  0wins 1race
P3  HAM  Mercedes         15pts  0wins 1race
P4  PIA  McLaren          12pts  0wins 1race
P5  RUS  Mercedes         10pts  0wins 1race
...
P11 SAR  Williams          0pts  0wins 1race
```

---

### `backend/api.py` — GET /championship/{year}/drivers

Plain English: Accept a year, call the standings function, return the sorted table or a 404.

```python
@app.get("/championship/{year}/drivers")
def championship_standings(year: int):
    data = insights.get_championship_standings(year)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No indexed races found for {year}")
    return data
```

Technical detail: Returns 404 when `get_championship_standings()` returns None — which happens when no races are indexed for the given year. A year with races indexed but zero points awarded (all retirements) would still return 200 with 0-point entries.

---

### How the Pieces Connect

```
GET /championship/2023/drivers
        |
        v
insights.get_championship_standings(2023)
        |
        v
indexer.list_indexed()
  → [{year:2023, track:"British Grand Prix"}]
        |
        v
For each indexed race:
    indexer.load_race_index(2023, "British Grand Prix")
    → {results: [{driver:"VER", finish_position:1, ...}, ...], ...}
        |
        v
For each driver result:
    pts = _POINTS_TABLE.get(finish_position, 0)
    tally[driver]["points"] += pts
    tally[driver]["wins"] += (1 if pos == 1 else 0)
    tally[driver]["races"] += 1
        |
        v
tally = {
    "VER": {points:25, wins:1, races:1, team:"Red Bull Racing"},
    "NOR": {points:18, wins:0, races:1, team:"McLaren"},
    ...
}
        |
        v
sorted by (-points, -wins)
        |
        v
[{position:1, driver:"VER", points:25, wins:1, ...}, ...]
        |
        v
JSON response
```

---

## Common Patterns

### Pattern 1: dict.get() with Default

What it's for: safely looking up values in a dict when a key might be absent.

```python
pts = _POINTS_TABLE.get(pos, 0)
```

`pos` might be None (retired driver) or 11+ (outside points). `.get(key, default)` returns 0 for any case not in the table — no if-else needed.

### Pattern 2: Initialise-Then-Accumulate

What it's for: building up a running total across iterations without special-casing the first occurrence.

```python
if driver not in tally:
    tally[driver] = {"points": 0, "wins": 0, "races": 0, "team": r["team"]}
tally[driver]["points"] += pts
```

Initialise with zeros on first encounter. Every subsequent race just adds. No tracking of "have I seen this driver before."

### Pattern 3: Negative Keys for Descending Sort

What it's for: sorting by multiple fields, all descending, using Python's default ascending sort.

```python
sorted(..., key=lambda x: (-x[1]["points"], -x[1]["wins"]))
```

Negate each value to flip the sort direction. Primary sort: most points first. Tiebreaker: most wins first.

### Pattern 4: List Comprehension with Filtering

What it's for: filtering a list in one readable line.

```python
indexed = [r for r in indexer.list_indexed() if r["year"] == year]
```

`list_indexed()` returns all indexed races across all years. The `if r["year"] == year` filter keeps only the relevant season.

---

## Edge Cases & Gotchas

1. **Retired drivers score 0 points**
   In plain English: A driver who retired from the race has `finish_position = None`. `_POINTS_TABLE.get(None, 0)` returns 0. They still appear in the standings with their 0 from that race.
   Technical cause: None is not a valid dict key in `_POINTS_TABLE`, so `.get()` returns the default.
   Result: correct — retired drivers score 0.

2. **Partial season coverage**
   In plain English: If only 5 races are indexed, the standings only reflect those 5. VER might show 125 points when the real total is 350.
   Technical cause: `list_indexed()` only returns what's on disk.
   How to communicate: The `races` field in each entry tells consumers how many races contributed. The frontend should show "Based on X races" prominently.

3. **Fastest lap bonus point not included**
   In plain English: Real F1 awards a bonus point for the driver who sets the fastest lap (if they finish in the top 10). Raceday doesn't track lap time data, so this isn't counted.
   Technical cause: `_POINTS_TABLE` doesn't include the bonus; lap time data isn't indexed.
   Result: standings are slightly off for any race where the fastest lap driver was in the top 10. Noted in the docstring.

4. **Mid-season team changes**
   In plain English: If a driver switches teams mid-season, their `team` field shows the most recent team (from the last indexed race they appeared in).
   Technical cause: `tally[driver]["team"] = r["team"]` overwrites on every race.
   Result: acceptable for now — the team shown is their current affiliation.

5. **Double-counting if called during indexing**
   In plain English: If a race is being indexed and `get_championship_standings()` is called simultaneously, you could get partial data.
   Technical cause: No locking or transactional guarantees on file reads.
   How to avoid: Single-user local server — not a real concern. For production, index in a background job before serving the endpoint.

6. **No constructor standings**
   In plain English: F1 also has a Constructors' Championship (team points). This function only computes driver standings.
   Technical cause: Constructor standings require summing across both drivers per team. Not yet implemented.
   How to extend: Add `get_constructor_standings(year)` that groups `tally` by team and sums points.

---

## How It Connects to Other Concepts

- **`list_indexed()`**: The entry point for the championship function. This is the disk-scan that tells us which races exist. The season-level `get_season_races()` uses `is_indexed()` instead (checking per-race), because it already has the schedule to work from. Championship needs to discover what's available — hence `list_indexed()`.

- **`load_race_index()`**: Called once per indexed race. Returns results, weather, and stints. Championship only uses `results` — the stints and weather are ignored. This is fine: functions are free to use only the data they need.

- **`_POINTS_TABLE` constant**: Lives at module level in `insights.py` (prefixed `_` = internal, not exported). If the points system changes, only this dict needs updating.

- **Frontend championship page**: The `position`, `driver`, `team`, `points`, and `wins` fields map directly to table columns. `races` lets the UI show coverage. No transformation needed client-side.

- **Season endpoint** (`get_season_races()`): Tells you what races exist. Championship endpoint tells you the standings from those races. Together they answer "what happened this season?"

---

## Going Deeper

### Constructor Standings

Team points are each driver's points summed per team. With the current `tally` structure, you could compute this in one pass:

```python
teams: dict[str, int] = {}
for driver, info in tally.items():
    team = info["team"]
    teams[team] = teams.get(team, 0) + info["points"]
```

### Points Systems Over the Years

F1 has changed its points system several times:
- Pre-2003: 10-6-4-3-2-1 (top 6 only)
- 2003-2009: 10-8-6-5-4-3-2-1 (top 8)
- 2010-present: 25-18-15-12-10-8-6-4-2-1 (top 10)

To support historical seasons, `_POINTS_TABLE` could become a function `_get_points_table(year)` that returns the appropriate system for that era.

### Fastest Lap Bonus

To add the fastest lap bonus point, the indexer would need to store the fastest lap driver per race. In FastF1:

```python
# In loader.py
fl_driver = session.laps.pick_fastest()["Driver"]
```

Then in insights, if the fastest lap driver is in the top 10:

```python
if fastest_lap_driver == driver and pos <= 10:
    pts += 1
```

### Streaming Updates

As races are indexed live during a season, the championship standings auto-update — no code changes needed. This is the clean architecture paying off: the function reads from the index at call time, not from a cached snapshot.

---

## Quick Reference

### Function Signature

```python
get_championship_standings(year: int) -> list[dict] | None
```

Returns `None` if no races are indexed for the year.

### Return Shape

```python
[
    {
        "position": 1,
        "driver": "VER",
        "team": "Red Bull Racing",
        "points": 25,
        "wins": 1,
        "races": 1
    },
    {
        "position": 2,
        "driver": "NOR",
        "team": "McLaren",
        "points": 18,
        "wins": 0,
        "races": 1
    },
    ...
]
```

### Points Table

| Position | Points |
|----------|--------|
| P1 | 25 |
| P2 | 18 |
| P3 | 15 |
| P4 | 12 |
| P5 | 10 |
| P6 | 8 |
| P7 | 6 |
| P8 | 4 |
| P9 | 2 |
| P10 | 1 |
| P11+ / DNF | 0 |

### HTTP Behaviour

| Request | Conditions | Response |
|---------|-----------|----------|
| `GET /championship/2023/drivers` | ≥1 race indexed | 200 + sorted standings |
| `GET /championship/2023/drivers` | 0 races indexed | 404 + error detail |
| `GET /championship/1800/drivers` | No such season | 404 + error detail |
| `GET /championship/abc/drivers` | Non-integer year | 422 Unprocessable Entity |

---

*Generated: 2026-03-16 | Project: raceday | Phase: 3 Championship*
*Files: backend/core/insights.py, backend/api.py*
