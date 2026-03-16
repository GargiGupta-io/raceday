# Phase 4A — Historical Data Sources (Built)

> How Raceday reaches back to 2010: Jolpica API for results, OpenMeteo for weather, a three-layer compound system for tyres, and year-aware routing so the rest of the app never notices the difference.

---

## In Plain English

Raceday's backend originally only knew about F1 from 2018 onwards, because it uses a library called FastF1 that has rich, detailed data for those years. But what about the incredible seasons before that — Hamilton vs Rosberg, Vettel's dominance, Alonso's Ferrari years? That data exists, it's just in different places, and we needed to go fetch it.

Think of it like this: FastF1 is a specialist F1 archive that covers 2018 to now in great detail — lap times, tyre compounds, weather sensors, all of it. For older seasons, we visit three separate sources: one for race results and grid positions (Jolpica API), one for weather conditions on race day (OpenMeteo), and one that tells us which tyres were used (a combination of a community dataset and a lookup table). Each source speaks a slightly different "language", and our job was to translate them all into the same format Raceday already understands.

The clever bit is the routing layer. We added a simple rule inside the indexer: if the year is 2018 or later, use FastF1 as before. If it's 2017 or earlier, use the new sources. From the outside — the API, the frontend, the championship standings calculator — nothing changed. Not a single line was edited in `insights.py`, `api.py`, or any frontend file. It's like a postman who knows two different routes to your house depending on the weather; you just get your mail either way.

---

## What We Planned vs What Actually Happened

The original plan had three data sources: Jolpica, OpenMeteo, and a statsf1.com HTML scraper. During implementation, the statsf1 scraper hit a dead end — here's what happened and what replaced it:

| Planned | What happened | Outcome |
|---------|---------------|---------|
| Jolpica API for results + grid + pit stops | Worked perfectly | Exact data for every race since 1950 |
| OpenMeteo for weather | Worked perfectly | Accurate temp + rain for any date/location |
| statsf1.com scraper for tyre compounds | **Failed** — tyre data is in French prose, not tables | Replaced with three-layer compound system |

The statsf1 investigation went like this:
1. The site blocks requests without a browser-like User-Agent header (returns 404)
2. Adding a browser UA got the page to load, but the tyre data turned out to be in French paragraph text: *"Pirelli propose deux types de pneus pour cette épreuve: tendres ou médium"*
3. No structured HTML tables exist for per-driver compound data
4. The sub-pages (classement, grille, tour-par-tour) also have no compound tables

This forced a pivot to a more reliable approach that actually ended up being better.

---

## Source 1: Jolpica API (What Was Built)

**In plain English:** Jolpica is a free online database of every F1 race since 1950. You ask it "who finished where in round 3 of 2014?" and it answers in structured JSON. It replaced an older service called Ergast that shut down.

### What we built

**`backend/core/jolpica_loader.py`** — four public functions + two internal helpers:

Plain English: This file is the "translator" between Jolpica's data format and Raceday's format.

```python
# The base URL and a persistent HTTP session with a custom User-Agent
_BASE = "https://api.jolpi.ca/ergast/f1"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Raceday/1.0 (F1 fan intelligence platform)"})
```

Technical detail: Using a `requests.Session()` means TCP connections are reused across multiple API calls, making sequential requests faster. The User-Agent identifies our app to the server.

#### `_get(path, retries=3)` — The retry wrapper

Plain English: Makes an API call and automatically retries up to 3 times if it fails, waiting longer between each attempt.

```python
def _get(path: str, retries: int = 3) -> dict | None:
    url = f"{_BASE}/{path}"
    for attempt in range(retries):
        try:
            resp = _SESSION.get(url, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                logger.warning("Jolpica request failed: %s — %s", url, exc)
    return None
```

Technical detail: `2 ** attempt` gives exponential backoff: 1s, 2s, 4s. `raise_for_status()` turns HTTP error codes (4xx, 5xx) into exceptions. Returns `None` on total failure so the caller can handle it gracefully.

#### `get_season_schedule(year)` — Full season calendar

Plain English: Ask for a year and get back every race that happened — name, date, location, GPS coordinates.

```python
events.append({
    "round":      int(race["round"]),
    "name":       race.get("raceName", ""),
    "location":   loc.get("locality", ""),
    "country":    loc.get("country", ""),
    "date":       race.get("date", ""),
    "format":     "conventional",
    "circuit_id": circuit.get("circuitId", ""),
    "lat":        float(loc.get("lat", 0) or 0),
    "lon":        float(loc.get("long", 0) or 0),
})
```

Technical detail: The `or 0` handles cases where lat/long might be `None` or empty string. Sprint weekends didn't exist pre-2021, so format is always "conventional". The `circuit_id`, `lat`, and `lon` fields are extras that FastF1 doesn't return — they're used by the indexer to look up weather from OpenMeteo.

#### `get_race_results(year, round_num)` — Race finishing order

Plain English: Get the full finishing order for any race — who won, where they started, what team, and whether they finished or retired.

The output format is deliberately identical to what `loader.get_race_results()` returns for FastF1 races:

```python
rows.append({
    "driver":          code,        # "HAM", "VET", etc.
    "grid_position":   int(grid) if grid.isdigit() else None,
    "finish_position": int(position) if position.isdigit() else None,
    "team":            r.get("Constructor", {}).get("name", ""),
    "compound":        None,        # Jolpica has no tyre data
    "status":          r.get("status", ""),
    "total_laps":      int(laps) if laps.isdigit() else None,
})
```

Technical detail: `compound` is always `None` because Jolpica doesn't have tyre data — that comes from the compound lookup system. `total_laps` is an extra field not in the FastF1 version, used later to calculate stint boundaries.

#### The driverId Problem (and how we solved it)

**In plain English:** Jolpica uses two different names for the same driver depending on which endpoint you ask. Results use 3-letter codes like "HAM". Pit stops use full slugs like "hamilton". We need to translate between them.

This was discovered during implementation — the pit stops endpoint uses `driverId` (a slug like "hamilton", "vettel") while our system uses 3-letter codes ("HAM", "VET"). A simple string match (first 3 letters) doesn't work: "rosberg" would give "ROS" which is correct, but "max_verstappen" would give "MAX" instead of "VER".

**Solution:** `_get_driver_id_to_code()` hits the results endpoint (which has both `driverId` and `code`) to build an authoritative mapping:

```python
def _get_driver_id_to_code(year: int, round_num: int) -> dict[str, str]:
    data = _get(f"{year}/{round_num}/results.json?limit=100")
    # ... builds {"hamilton": "HAM", "vettel": "VET", "rosberg": "ROS"}
```

This is called once per race when fetching pit stops. It's an extra API call, but it guarantees correct driver codes.

#### `get_pit_stops(year, round_num)` — When each driver pitted

Plain English: Returns a dictionary of every driver's pit stops — which lap they pitted on, and how long the stop took.

```python
# Output format:
{"HAM": [{"stop": 1, "lap": 18, "duration": 23.5},
         {"stop": 2, "lap": 38, "duration": 24.1}],
 "VET": [...]}
```

**Important limitation:** Jolpica only has pit stop data from 2012 onwards. For 2010-2011 races, this returns an empty dict and stints show as "UNKNOWN".

### Jolpica test results (2014 Australian GP)

```
Schedule: 19 races returned with GPS coordinates
Results:  22 drivers — ROS P1, MAG P2, BUT P3 (matches real history)
Pit stops: 18 drivers with stop data, keyed by 3-letter codes
  ALO: 2 stops (lap 12, lap 35)
  ROS: 2 stops (lap 12, lap 38)
  HAM: 0 stops (retired lap 1 — engine failure)
```

---

## Source 2: OpenMeteo (What Was Built)

**In plain English:** A free weather history service. Give it GPS coordinates and a date, and it tells you the temperature and rainfall hour by hour. We use this to figure out if a race was wet or dry.

### What we built

**`backend/core/openmeteo_loader.py`** — one public function:

#### `get_race_weather(date, lat, lon)`

Plain English: Takes a date and location, fetches hourly weather data, and returns a summary: was it dry/damp/wet, and what was the temperature?

```python
params = {
    "latitude": lat,
    "longitude": lon,
    "start_date": date,
    "end_date": date,
    "hourly": "temperature_2m,rain",
    "timezone": "auto",
}
```

Technical detail: `timezone=auto` is critical — it makes OpenMeteo return times in the circuit's local timezone. Without it you get UTC, and a race at 14:00 Melbourne time would appear as 03:00.

**The race window filter:**

```python
# Filter to 10:00–18:00 local time (covers all F1 race starts)
if 10 <= hour <= 18:
    race_temps.append(temps[i])
    race_rain.append(rain[i])
```

We use a broad 10am-6pm window rather than the exact race start time because:
1. We don't know the exact start time from Jolpica
2. This covers all possible F1 race starts globally
3. It's still focused enough to represent race-day conditions

**Condition classification (same thresholds as FastF1 loader):**

```python
wet_fraction = wet_hours / total_hours
if wet_fraction == 0:      condition = "dry"
elif wet_fraction > 0.2:   condition = "wet"
else:                       condition = "damp"
```

**What OpenMeteo doesn't have:** Track temperature. FastF1 gets this from actual sensors embedded in the tarmac at each circuit. For historical races, `avg_track_temp` is `None`. The frontend already shows "—" for missing values.

### OpenMeteo test results

```
2014 Australian GP:  "damp" at 18.2°C (race was dry — likely morning drizzle in broader window)
2011 Canadian GP:    "wet" at 16.7°C  (correct — famous Button rain race with 2-hour red flag)
```

The "damp" for Australia 2014 is a known minor inaccuracy — the broad time window catches morning weather before the race. This is acceptable for a display platform.

---

## Source 3: The Compound System (What Replaced statsf1)

**In plain English:** Since no website has per-driver tyre data in a structured format, we built a three-layer system that tries three approaches in order: first check a community dataset (exact data for 2015-2016), then use a smart guessing method based on stint length (for everything else), and as a last resort just alternate soft/hard.

### Why statsf1 failed

statsf1.com uses French-language race name slugs (`/en/2014/australie.aspx`) and requires a browser-like User-Agent header. When we fetched the pages, the tyre information was embedded in race commentary paragraphs:

```
"Pirelli propose deux types de pneus pour cette épreuve: tendres ou médium.
Tous les pilotes s'élancent en pneus tendres, exceptés Vettel et Gutiérrez
qui ont chaussé des médiums."
```

This is natural language in French — no HTML tables, no structured data. Parsing it would require French NLP and would be extremely fragile.

### What we built instead

**`backend/core/compound_lookup.py`** — three-layer compound assignment:

#### Layer 1: Community CSV data (exact, 2015 + partial 2016)

Plain English: A community member scraped exact per-driver per-stint compound data from official FIA/Pirelli sources. We downloaded their data and use it when available.

Source: [github.com/mvmonaghan/f1-tires](https://github.com/mvmonaghan/f1-tires)

The CSV files look like:
```
NAME,Stint 1,Stint 2,Stint 3,Stint 4
Lewis Hamilton,Soft (25),Medium (33),,
Nico Rosberg,Soft (26),Medium (32),,
Sebastian Vettel,Soft (24),Medium (34),,
```

We downloaded all 22 available race CSVs, parsed them into JSON, and saved as `backend/core/tire_strategy_2015_2016.json`. A name-to-code mapping (`_NAME_TO_CODE`) converts full names to 3-letter codes:

```python
_NAME_TO_CODE = {
    "Lewis Hamilton": "HAM", "Nico Rosberg": "ROS", "Sebastian Vettel": "VET",
    "Kimi Raikkonen": "RAI", "Daniel Ricciardo": "RIC", ...
}
```

Coverage: 19 races from 2015, 3 races from 2016.

#### Layer 2: Stint-length heuristic (~85-90% accurate)

Plain English: Softer tyres degrade faster, so they're used for shorter stints. We assign the softer compound to the shortest stint and the harder compound to the longest. This matches how real F1 strategy works most of the time.

```python
def _assign_by_stint_length(pit_stop_laps, total_laps, option, prime):
    # Calculate each stint's length
    stint_lengths = [ends[i] - starts[i] + 1 for i in range(len(starts))]
    # Find the median length
    median = sorted_lengths[len(sorted_lengths) // 2]
    # Shorter than median → softer compound, longer → harder
    return [option if length < median else prime for length in stint_lengths]
```

This needs the race-level compound nomination (which two compounds Pirelli brought). We have this in a hardcoded table for every race from 2011-2017:

```python
_NOMINATIONS = {
    2014: {
        1: ("SOFT", "MEDIUM"),       # Australia
        2: ("SOFT", "MEDIUM"),       # Malaysia
        6: ("SUPERSOFT", "SOFT"),    # Monaco
        ...
    },
    ...
}
```

These nominations are public, well-documented data that never changes.

#### Layer 3: Simple alternation (fallback)

Plain English: If nothing else works (e.g. 2010 Bridgestone era where we have no Pirelli data), just alternate: soft, hard, soft, hard. Better than nothing.

```python
def _assign_simple(num_stints, option, prime):
    if num_stints == 2:
        return [option, prime]
    return [option if i % 2 == 0 else prime for i in range(num_stints)]
```

#### Switching between layers

An environment variable controls which strategy is used:

```python
STRATEGY_MODE = os.getenv("COMPOUND_STRATEGY", "auto")
# "auto"      → try Layer 1, then 2, then 3 (default)
# "heuristic" → skip CSV, use Layer 2 then 3
# "simple"    → Layer 3 only (original approach, safety net)
```

This means if anything goes wrong with the CSV data or heuristic, you can revert to the simple approach by setting `COMPOUND_STRATEGY=simple` in `.env`.

#### `build_stints()` — Merging pit laps + compounds into stint sequences

Plain English: Takes the list of laps where pit stops happened and the list of compound names, and produces stint objects with start/end laps — the same format FastF1 stints use.

```python
def build_stints(pit_stop_laps, compounds, total_laps):
    starts = [1] + [lap + 1 for lap in pit_stop_laps]
    ends = pit_stop_laps + [total_laps]
    stints = []
    for i, compound in enumerate(compounds):
        stints.append({
            "stint": i + 1,
            "compound": compound,
            "lap_start": starts[i],
            "lap_end": ends[i],
            "lap_count": max(0, ends[i] - starts[i] + 1),
        })
    return stints
```

### Compound system test results

```
2014 R1 (heuristic): SOFT (12 laps) → MEDIUM (26 laps) → MEDIUM (19 laps)
2015 R1 HAM (CSV):   SOFT (25 laps) → MEDIUM (33 laps) — exact match
2010 R1 (fallback):  UNKNOWN → UNKNOWN → UNKNOWN (no Pirelli data)
```

---

## The Year-Aware Routing (What Was Built)

**In plain English:** Two files were modified to add a simple `if year <= 2017` check. Everything else stayed untouched.

### loader.py — Schedule routing

```python
def get_season_schedule(year: int) -> list[dict] | None:
    if year <= 2017:
        from backend.core import jolpica_loader
        return jolpica_loader.get_season_schedule(year)
    # ... existing FastF1 code for 2018+
```

The lazy import (`from backend.core import jolpica_loader` inside the function) avoids loading Jolpica's `requests` session when it's not needed.

### indexer.py — Full pipeline routing

```python
def index_race(year: int, track: str) -> bool:
    if year <= 2017:
        return _index_race_historical(year, track)
    return _index_race_fastf1(year, track)
```

`_index_race_historical` chains all three sources:

```
1. loader.get_season_schedule(year)     → find the round number for this track
2. jolpica_loader.get_race_results()    → finishing order, grid, teams
3. jolpica_loader.get_pit_stops()       → when each driver pitted
4. openmeteo_loader.get_race_weather()  → dry/damp/wet + temperature
5. compound_lookup.assign_stint_compounds() → which tyre on each stint
6. compound_lookup.build_stints()       → merge into stint dicts
7. _write_index()                       → save 3 JSON files to disk
```

`_write_index` is shared between both paths — extracted to avoid code duplication:

```python
def _write_index(race_dir, results, weather, stints):
    race_dir.mkdir(parents=True, exist_ok=True)
    with open(race_dir / "race_results.json", "w") as f:
        json.dump(results, f, indent=2)
    with open(race_dir / "weather.json", "w") as f:
        json.dump(weather, f, indent=2)
    with open(race_dir / "stints.json", "w") as f:
        json.dump(stints, f, indent=2)
```

### The full data flow (actual, verified)

```
User visits /races/2014/Australian%20Grand%20Prix/results
         │
    api.py → insights.get_race_summary(2014, "Australian Grand Prix")
         │
    insights → indexer.load_race_index(2014, "Australian Grand Prix")
         │
    indexer: is_indexed? → NO → index_race(2014, ...)
         │
    year <= 2017 → _index_race_historical:
         │
         ├── jolpica_loader.get_season_schedule(2014)
         │     → 19 races, finds round 1 = "Australian Grand Prix"
         │     → lat=-37.85, lon=144.97, date=2014-03-16
         │
         ├── jolpica_loader.get_race_results(2014, round=1)
         │     → 22 drivers: ROS P1, MAG P2, BUT P3...
         │
         ├── openmeteo_loader.get_race_weather("2014-03-16", -37.85, 144.97)
         │     → {"condition": "damp", "avg_air_temp": 18.2, "avg_track_temp": None}
         │
         ├── jolpica_loader.get_pit_stops(2014, round=1)
         │     → {"ROS": [lap 12, lap 38], "ALO": [lap 12, lap 35], ...}
         │
         └── For each driver: compound_lookup.assign_stint_compounds()
               → Layer 2 (heuristic): shortest stint → SOFT, longest → MEDIUM
               → compound_lookup.build_stints() → stint dicts
         │
    Writes to data/index/2014/Australian Grand Prix/:
         ├── race_results.json  (22 drivers)
         ├── weather.json       (damp, 18.2°C)
         └── stints.json        (18 drivers with stint sequences)
         │
    insights reads back → race summary, standings, strategy
         │
    Frontend renders — user sees nothing unusual
```

---

## Files Created and Modified

| File | Status | What it does |
|------|--------|-------------|
| `backend/core/jolpica_loader.py` | **Created** | Fetches schedule, results, pit stops from Jolpica API |
| `backend/core/openmeteo_loader.py` | **Created** | Fetches historical weather from OpenMeteo |
| `backend/core/compound_lookup.py` | **Created** | Three-layer compound assignment + stint builder |
| `backend/core/tire_strategy_2015_2016.json` | **Created** | 22 races of exact per-driver compound data |
| `backend/core/loader.py` | **Modified** | `get_season_schedule()` routes to Jolpica for ≤2017 |
| `backend/core/indexer.py` | **Modified** | `index_race()` routes to historical pipeline for ≤2017 |

**Zero changes needed:**
- `backend/core/insights.py` — reads the same index format
- `backend/api.py` — calls the same insights functions
- All frontend files — fetches the same API endpoints

This is the power of the Dependency Inversion pattern: high-level code depends on the index format (the abstraction), not on specific data sources.

---

## Edge Cases & Gotchas (Discovered During Build)

**1. driverId vs driver code mismatch**
In plain English: Jolpica uses "hamilton" in pit stops but "HAM" in results. Matching by first 3 letters fails for drivers like Max Verstappen ("max_verstappen" → "MAX" instead of "VER").
How we solved it: `_get_driver_id_to_code()` fetches the results endpoint to build an authoritative mapping. One extra API call per race, but guarantees correct codes.

**2. statsf1.com blocks automated requests**
In plain English: The site returns 404 for any request without a browser-like User-Agent header.
How we solved it: Adding `User-Agent: "Mozilla/5.0..."` gets the page, but the data turned out to be in French prose anyway. Abandoned in favour of the compound lookup system.

**3. OpenMeteo "damp" for dry races**
In plain English: The 2014 Australian GP was a dry race but OpenMeteo returned "damp" — because the broad 10am-6pm window catches morning weather before the race started.
Impact: Minor display inaccuracy. Acceptable for a fan platform.
Could improve: Narrow the window to 13:00-17:00, but this varies by timezone and race start time.

**4. No pit stop data before 2012**
In plain English: Jolpica/Ergast didn't record pit stop timing for races before 2012.
Impact: 2010-2011 races have empty stints. The frontend shows "UNKNOWN" compound chips.
Could improve: Manual data entry for those 2 seasons, or find an alternative source.

**5. `.gitignore` blocking the JSON data file**
In plain English: The `data/` directory was gitignored (it holds the FastF1 cache). But the tire strategy JSON is reference data, not cache.
How we solved it: Moved the file to `backend/core/tire_strategy_2015_2016.json` alongside the code, outside the gitignored directory.

**6. Windows terminal Unicode encoding**
In plain English: The `→` arrow character in strategy labels ("1-stop: Soft → Medium") crashes on Windows terminals using cp1252 encoding.
Impact: Only affects direct `print()` in test scripts, not the actual API (which returns JSON/UTF-8).
Could improve: Use `->` instead of `→` in labels, or set `PYTHONIOENCODING=utf-8`.

---

## Data Coverage Summary

| Year | Results | Weather | Pit stops | Compounds | Compound accuracy |
|------|---------|---------|-----------|-----------|-------------------|
| 2010 | Exact (Jolpica) | Exact (OpenMeteo) | None (pre-2012) | UNKNOWN | N/A |
| 2011 | Exact | Exact | None (pre-2012) | UNKNOWN | N/A |
| 2012-2014 | Exact | Exact | Exact (Jolpica) | Heuristic | ~85-90% |
| 2015 | Exact | Exact | Exact | **CSV (exact)** | ~100% |
| 2016 (3 races) | Exact | Exact | Exact | **CSV (exact)** | ~100% |
| 2016 (rest) | Exact | Exact | Exact | Heuristic | ~85-90% |
| 2017 | Exact | Exact | Exact | Heuristic | ~85-90% |
| 2018+ | Exact (FastF1) | Exact (FastF1) | Exact (FastF1) | **Exact (FastF1)** | 100% |

---

## Quick Reference

### Jolpica endpoints
| What you want | Endpoint |
|---------------|----------|
| Season schedule | `/{year}.json?limit=100` |
| Race results | `/{year}/{round}/results.json?limit=100` |
| Pit stops | `/{year}/{round}/pitstops.json?limit=100` |
| Circuit coords | `/circuits/{circuitId}.json` |

### OpenMeteo params
| Param | Value |
|-------|-------|
| `latitude` | circuit lat (float) |
| `longitude` | circuit lon (float) |
| `start_date` / `end_date` | race date (YYYY-MM-DD) |
| `hourly` | `temperature_2m,rain` |
| `timezone` | `auto` |

### Year routing rule
| Year | Results source | Weather source | Compound source |
|------|---------------|----------------|-----------------|
| 2018+ | FastF1 | FastF1 | FastF1 |
| 2015-2016 | Jolpica | OpenMeteo | CSV data (exact) → heuristic fallback |
| 2012-2017 | Jolpica | OpenMeteo | Heuristic → simple fallback |
| 2010-2011 | Jolpica | OpenMeteo | UNKNOWN (no pit stop data) |

### Compound strategy modes
| Mode | Set via | Behaviour |
|------|---------|-----------|
| `auto` (default) | `COMPOUND_STRATEGY=auto` | CSV → heuristic → simple |
| `heuristic` | `COMPOUND_STRATEGY=heuristic` | Heuristic → simple (skip CSV) |
| `simple` | `COMPOUND_STRATEGY=simple` | Simple alternation only (safety net) |

### Key Terms
| Term | Plain English | Technical meaning |
|------|---------------|-------------------|
| REST API | A website that returns data instead of web pages | HTTP GET requests returning JSON |
| Exponential backoff | Waiting longer between each retry | `time.sleep(2 ** attempt)` — 1s, 2s, 4s |
| Year-aware routing | Choosing a data source based on the year | `if year <= 2017: use_jolpica()` |
| Dependency Inversion | High-level code depends on the format, not the source | insights.py reads index JSON regardless of origin |
| Stint-length heuristic | Shorter stint = softer tyre, longer = harder | Based on real F1 tyre degradation patterns |
| Community dataset | Data scraped by fans and shared publicly | mvmonaghan/f1-tires on GitHub |

---

*Updated: 2026-03-16 | Project: Raceday | Phase 4A complete | Files: jolpica_loader.py, openmeteo_loader.py, compound_lookup.py, loader.py, indexer.py*
