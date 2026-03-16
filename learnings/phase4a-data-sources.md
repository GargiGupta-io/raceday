# Phase 4A — Historical Data Sources

> How Raceday reaches back to 2010: Jolpica API, OpenMeteo weather, HTML scraping for tyre compounds, and year-aware routing so the rest of the app never notices the difference.

---

## In Plain English

Raceday's backend currently knows everything about F1 from 2018 onwards, because it uses a library called FastF1 that has rich, detailed data for those years. But what about the incredible seasons before that — Hamilton vs Rosberg, Vettel's dominance, Alonso's Ferrari years? That data exists, it's just in different places, and we need to go fetch it.

Think of it like this: FastF1 is like a specialist F1 archive that covers 2018 to now in great detail — lap times, tyre compounds, weather sensors, all of it. For older seasons, we need to visit three separate sources: one for race results and grid positions (Jolpica), one for weather conditions on race day (OpenMeteo), and one for which tyres each driver used (statsf1.com). Each source speaks a slightly different "language", and our job is to translate them all into the same format Raceday already understands — so the rest of the app, the frontend, and the user never see the join.

The clever bit is the routing layer. We're going to add a simple rule inside the indexer: if the year is 2018 or later, use FastF1 as before. If it's 2017 or earlier, use the three new sources. From the outside — the API, the frontend, the championship standings calculator — nothing changes. It's like a postman who knows two different routes to your house depending on the weather; you just get your mail either way.

---

## The Sources We're Adding

### Source 1: Jolpica API

**In plain English:** Jolpica is a free online database of every F1 race since 1950. You ask it questions like "who finished where in round 3 of 2014?" and it answers in a structured, machine-readable format. It's the replacement for an older service called Ergast that was shut down.

**Technical view:** Jolpica is a REST API — you make HTTP GET requests to URLs, and it returns JSON. No authentication required. The base URL is `https://api.jolpi.ca/ergast/f1/` and it follows the exact same URL structure as the old Ergast API, making migration straightforward.

Key endpoints we'll use:

```
GET /ergast/f1/{year}.json
→ Full season schedule: round numbers, race names, circuit names, dates, GPS coords

GET /ergast/f1/{year}/{round}/results.json
→ Race results: finishing order, grid positions, driver codes, constructor names, status

GET /ergast/f1/{year}/{round}/pitstops.json
→ Pit stop data: which lap each driver pitted, stop number, duration

GET /ergast/f1/circuits/{circuitId}.json
→ Circuit details: GPS coordinates, location name
```

**Response structure:** Every Jolpica response wraps its data in the same envelope:

```json
{
  "MRData": {
    "xmlns": "...",
    "series": "f1",
    "total": "19",
    "RaceTable": {
      "season": "2014",
      "Races": [
        {
          "round": "1",
          "raceName": "Australian Grand Prix",
          "Circuit": {
            "circuitId": "albert_park",
            "Location": {
              "lat": "-37.8497",
              "long": "144.968",
              "locality": "Melbourne",
              "country": "Australia"
            }
          },
          "date": "2014-03-16",
          "Results": [
            {
              "number": "44",
              "position": "1",
              "positionText": "1",
              "grid": "1",
              "laps": "57",
              "status": "Finished",
              "Driver": {
                "driverId": "hamilton",
                "code": "HAM",
                "givenName": "Lewis",
                "familyName": "Hamilton"
              },
              "Constructor": {
                "constructorId": "mercedes",
                "name": "Mercedes"
              }
            }
          ]
        }
      ]
    }
  }
}
```

**Pagination:** Jolpica paginates results using `?limit=X&offset=Y`. For seasons (max 24 rounds) and results (max 20 drivers), a single request with `?limit=100` always fits everything. Pit stops can occasionally need multiple pages in theory but never do in practice for a single race.

**Reliability:** Jolpica is community-maintained and generally reliable. We add a 3-attempt retry with exponential backoff (wait 1s, then 2s) to handle occasional blips. If all retries fail, we return `None` and the indexer logs a warning — same pattern as FastF1.

**What Jolpica does NOT have:**
- Tyre compounds (which tyre each driver used on each stint)
- Lap-level telemetry
- Sector times
- Weather conditions

This is why we need the other two sources.

---

### Source 2: OpenMeteo

**In plain English:** OpenMeteo is a free weather history service. You give it a GPS coordinate and a date, and it tells you the temperature and rainfall every hour of that day. We use this to figure out whether a race was wet or dry — and what the temperature was.

**Technical view:** OpenMeteo is also a REST API, also free, also no authentication. The archive endpoint is:

```
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude=-37.8497
  &longitude=144.968
  &start_date=2014-03-16
  &end_date=2014-03-16
  &hourly=temperature_2m,rain
  &timezone=auto
```

**Response structure:**

```json
{
  "latitude": -37.8497,
  "longitude": 144.968,
  "timezone": "Australia/Melbourne",
  "hourly": {
    "time": ["2014-03-16T00:00", "2014-03-16T01:00", ...],
    "temperature_2m": [18.2, 17.9, 18.1, ...],
    "rain": [0.0, 0.0, 0.1, ...]
  }
}
```

**How we process it:** We request hourly data for the race day, then:
1. Find the race's local start time (roughly 14:00–16:00 for most GPs)
2. Take the 3–4 hours covering the race window
3. Average the temperature across those hours → `avg_air_temp`
4. Check for any rainfall → if any rain recorded: "wet" / "damp" / "dry"

In practice we use a simpler approach: average all daylight hours (6am–8pm local time) and check if any hour had rain > 0.1mm. This is slightly less precise than FastF1's in-car weather sensors but good enough for display purposes.

**Important note:** OpenMeteo doesn't have track temperature — only air temperature. FastF1 reads actual track sensors installed at the circuit. For 2010–2017 data we'll show air temp only, and set `avg_track_temp` to `None`. The frontend already handles missing values gracefully.

**Coverage:** OpenMeteo's archive goes back to 1940 globally. Every F1 circuit from 2010 onwards is covered.

**Rate limits:** Free tier allows ~600 requests/minute with no API key. Since we only index each race once and cache the result, we'll never come close to this limit.

---

### Source 3: statsf1.com (HTML Scraping)

**In plain English:** statsf1.com is a fan website that has carefully catalogued tyre strategy data for every F1 race. Unlike the other two sources, it doesn't have a public API — it's just a normal website. To get the data, we have to pretend to be a web browser, download the page, and then carefully read through the HTML to find the table containing tyre information. This is called "web scraping."

**Technical view:** Web scraping works by:
1. Sending an HTTP GET request (using the `requests` library) to a URL
2. Receiving the raw HTML of the page
3. Parsing the HTML into a navigable structure (using `BeautifulSoup`)
4. Finding the specific table or element you want using CSS selectors or tag names
5. Extracting the text values you need

#### What is HTML?

HTML is the language web pages are written in. Every element on a page — a heading, a table row, a button — is described by "tags" that wrap around content:

```html
<table>
  <tr>
    <td>VET</td>
    <td>Soft</td>
    <td>Medium</td>
  </tr>
</table>
```

BeautifulSoup lets you find these elements programmatically:

```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html_content, "html.parser")
rows = soup.find_all("tr")  # find every table row
```

#### The statsf1 URL Pattern

statsf1.com uses URLs like:

```
https://www.statsf1.com/en/{year}/{race-slug}/depart.aspx
```

Where `race-slug` is a lowercase version of the race name — `australia`, `bahrain`, `monaco`, etc. We maintain a mapping from Jolpica's full race names to these slugs.

#### Fragility — The Real Risk

Web scraping is inherently fragile. Unlike an API (which has a contract to keep the format stable), a website can change its layout at any time. The developer might:
- Rename CSS classes
- Restructure the table layout
- Move data to a different page
- Add JavaScript rendering (which `requests` can't handle)

**How we handle this:**
1. **Scrape once, cache forever.** After successfully scraping a race, we save the raw HTML alongside the JSON data. If the scraper breaks in the future, we can re-parse our cached HTML without hitting the site again.
2. **Graceful fallback.** If scraping fails or returns no data, we write `"UNKNOWN"` as the compound for every driver. The stints.json still gets written, the page still loads — it just shows "Unknown" in the tyre chips instead of "Soft/Medium/Hard".
3. **Content-based selectors.** Where possible, we find tables by their content (e.g. "find the table that has 'Compound' in the header") rather than by fragile class names.

---

## The Year-Aware Routing Pattern

**In plain English:** The cleverest part of Phase 4A isn't any of the individual data sources — it's the routing logic that decides which source to use. We want the rest of the app (insights.py, api.py, the frontend) to be completely unaware that there are two different data pipelines. They just ask for "2014 Australian GP data" and get it, whether it came from FastF1 or from Jolpica+OpenMeteo+statsf1.

This is achieved by putting the routing decision in exactly two places:
1. `loader.py` — `get_season_schedule(year)` now delegates to `jolpica_loader` for year ≤ 2017
2. `indexer.py` — `index_race(year, track)` now has a historical path for year ≤ 2017

Everything downstream remains identical.

**The routing logic:**

```
                    get_season_schedule(2023)
                           │
                    loader.py decides:
                    year >= 2018?
                    ┌─── YES ────────── NO ──────────┐
                    │                                 │
              FastF1                          jolpica_loader
         (existing code)                   get_season_schedule(2014)
                    │                                 │
                    └─────────── same format ─────────┘
                                     │
                              insights.py
                         (never knows the difference)
```

```
                    index_race(2014, "Australian Grand Prix")
                           │
                    indexer.py decides:
                    year >= 2018?
                    ┌─── YES ────────── NO ──────────────────┐
                    │                                         │
              FastF1 path                           Historical path:
         (existing code)                           jolpica → results
                    │                              openmeteo → weather
                    │                              statsf1 → compounds
                    │                              build_stints() → stints
                    │                                         │
                    └────── writes race_results.json ─────────┘
                            writes weather.json
                            writes stints.json
                    │
               load_race_index()
                    │
               insights.py
          (no change needed)
```

**Why this is powerful:** We're using the same index format as a "universal language." Regardless of the source, the output on disk always looks the same. This means:
- The insights engine doesn't need to know about Jolpica
- The API doesn't need to know about statsf1
- The frontend doesn't need to know any of this exists
- We could add a fourth data source in the future (say, a different scraper) and still nothing downstream changes

This pattern is called **Dependency Inversion** — the high-level code (insights, API) depends on an abstraction (the index format), not on the concrete data sources.

---

## How the Pieces Connect

Here's the full data flow for a 2014 race being indexed for the first time:

```
User visits /races/2014/Australian%20Grand%20Prix/results
         │
    api.py calls insights.get_race_summary(2014, "Australian Grand Prix")
         │
    insights calls indexer.load_race_index(2014, "Australian Grand Prix")
         │
    indexer checks: is_indexed? → NO
         │
    indexer calls index_race(2014, "Australian Grand Prix")
         │
    indexer sees year <= 2017 → historical path:
         │
         ├── jolpica_loader.get_season_schedule(2014)
         │     → finds round 1 = "Australian Grand Prix"
         │
         ├── jolpica_loader.get_race_results(2014, round=1)
         │     → [{"driver": "HAM", "finish_position": 1, ...}, ...]
         │
         ├── jolpica_loader.get_pit_stops(2014, round=1)
         │     → {"HAM": [{"lap": 18, "stop": 1}, {"lap": 38, "stop": 2}], ...}
         │
         ├── openmeteo_loader.get_race_weather("2014-03-16", -37.8497, 144.968)
         │     → {"condition": "dry", "avg_air_temp": 22.3, "avg_track_temp": None}
         │
         ├── statsf1_scraper.get_tyre_compounds(2014, "australia")
         │     → {"HAM": ["MEDIUM", "HARD", "MEDIUM"], ...}
         │
         └── jolpica_loader.build_stints(pit_stops, compounds, total_laps=57)
               → {"HAM": [
                    {"stint": 1, "compound": "MEDIUM", "lap_start": 1, "lap_end": 17, "lap_count": 17},
                    {"stint": 2, "compound": "HARD",   "lap_start": 18, "lap_end": 37, "lap_count": 20},
                    {"stint": 3, "compound": "MEDIUM", "lap_start": 38, "lap_end": 57, "lap_count": 20}
                  ], ...}
         │
    indexer writes:
         ├── data/index/2014/Australian Grand Prix/race_results.json
         ├── data/index/2014/Australian Grand Prix/weather.json
         └── data/index/2014/Australian Grand Prix/stints.json
         │
    indexer returns {"results": [...], "weather": {...}, "stints": {...}}
         │
    insights builds race summary → {"winner": "HAM", "podium": [...], ...}
         │
    api.py returns JSON to frontend
         │
    Frontend shows race results page — user sees nothing unusual
```

---

## Key Files in Phase 4A

| File | What it does |
|------|-------------|
| `backend/core/jolpica_loader.py` | Fetches schedule, results, and pit stops from Jolpica API |
| `backend/core/openmeteo_loader.py` | Fetches historical weather from OpenMeteo |
| `backend/core/statsf1_scraper.py` | Scrapes tyre compound tables from statsf1.com |
| `backend/core/loader.py` | Modified: `get_season_schedule()` routes by year |
| `backend/core/indexer.py` | Modified: `index_race()` routes to historical path for ≤2017 |

Files that are **not changed at all:**
- `backend/core/insights.py`
- `backend/api.py`
- All frontend files

---

## Edge Cases & Gotchas

**1. Driver codes in old races**
In plain English: Before 2003, drivers didn't have official three-letter codes (like HAM or VET). Some entries in Jolpica use the full driverId instead (e.g. "michael_schumacher").
Technical cause: The `code` field in the Jolpica Driver object is absent for pre-2003 drivers.
How to avoid: Fall back to `driverId[:3].upper()` when `code` is missing. Since we're targeting 2010+, this is rarely an issue, but the code handles it defensively.

**2. Grid position 0 in Jolpica**
In plain English: Jolpica sometimes uses "0" as the grid position for drivers who started from the pit lane, rather than a real grid slot.
Technical cause: Ergast convention. A grid value of "0" means pit lane start.
How to avoid: Treat grid == 0 as `None` in our normalisation, or store it as-is and let the frontend handle it gracefully (delta calculation will show `None`).

**3. statsf1 JavaScript-rendered pages**
In plain English: Some versions of statsf1.com load their data via JavaScript after the page loads, which means a simple `requests.get()` call gets an empty shell.
Technical cause: Client-side rendering — the server sends a blank page and JavaScript fills it in. `requests` can't run JavaScript.
How to avoid: Test first. If the straightforward approach gets empty tables, use `selenium` or `playwright` as a fallback. Cache raw HTML of successful scrapes.

**4. OpenMeteo returns local time**
In plain English: OpenMeteo gives you hourly data in the circuit's local timezone. A race at 14:00 local time in Melbourne is at 03:00 UTC — easy to confuse.
Technical cause: When you pass `timezone=auto`, OpenMeteo converts times to local. Without it, you get UTC.
How to avoid: Always pass `timezone=auto` and slice the window from 12:00 to 18:00 local time, which covers any F1 race start.

**5. Round number ≠ race name**
In plain English: Jolpica identifies races by round number (1, 2, 3...) but our indexer uses the full race name as the folder key ("Australian Grand Prix"). We need to convert between them.
Technical cause: FastF1 and our index both use race names; Jolpica results endpoints need a round number.
How to avoid: When doing historical indexing, call `get_season_schedule(year)` first to build a name→round lookup, then use the round number for the results/pitstops calls.

---

## Common Patterns

### Pattern 1: Retry wrapper

What it's for: Making network calls reliable when the server occasionally blips.

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
                time.sleep(2 ** attempt)   # 1s then 2s
            else:
                logger.warning("Failed: %s — %s", url, exc)
    return None
```

The key idea: `2 ** attempt` gives 1, 2, 4 seconds of wait between attempts. This exponential backoff avoids hammering a struggling server.

### Pattern 2: Graceful None propagation

What it's for: Making sure a single failed data source doesn't crash everything else.

```python
def index_race_historical(year, track, round_num):
    results = jolpica_loader.get_race_results(year, round_num)
    if results is None:
        return False   # can't proceed without results

    weather = openmeteo_loader.get_race_weather(...)
    if weather is None:
        weather = {}   # weather is optional — store empty dict

    compounds = statsf1_scraper.get_tyre_compounds(...)
    if compounds is None:
        compounds = {}  # compounds optional — fallback to UNKNOWN
```

Results are mandatory (return `False` if missing). Weather and compounds are optional — we write empty dicts and the frontend handles it gracefully.

### Pattern 3: Caching raw HTML

What it's for: Protecting scraped data from future website changes.

```python
html_cache_path = race_dir / "statsf1_raw.html"

if html_cache_path.exists():
    html = html_cache_path.read_text(encoding="utf-8")
else:
    resp = requests.get(url, timeout=15)
    html = resp.text
    html_cache_path.write_text(html, encoding="utf-8")

soup = BeautifulSoup(html, "html.parser")
```

Once we have the HTML saved, even if statsf1.com changes or goes offline, we can always re-parse our cached copy.

### Pattern 4: Build stints from pit stops + compounds

What it's for: Reconstructing stint sequences (compound + lap range) from separate pit stop laps and compound lists.

```python
def build_stints(pit_laps: list[int], compounds: list[str], total_laps: int) -> list[dict]:
    # pit_laps = [18, 38] means the driver pitted entering lap 18 and lap 38
    # Stint 1: laps 1–17 on compounds[0]
    # Stint 2: laps 18–37 on compounds[1]
    # Stint 3: laps 38–total on compounds[2]
    boundaries = [1] + pit_laps + [total_laps + 1]
    stints = []
    for i, compound in enumerate(compounds):
        lap_start = boundaries[i]
        lap_end   = boundaries[i + 1] - 1
        stints.append({
            "stint": i + 1,
            "compound": compound,
            "lap_start": lap_start,
            "lap_end": lap_end,
            "lap_count": lap_end - lap_start + 1,
        })
    return stints
```

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
| Year | Source |
|------|--------|
| 2018+ | FastF1 (existing `loader.py`) |
| 2010–2017 | Jolpica + OpenMeteo + statsf1 |

### Key Terms
| Term | Plain English | Technical meaning |
|------|---------------|-------------------|
| REST API | A website that returns data instead of web pages | HTTP GET requests returning JSON |
| Pagination | Getting data in batches | `?limit=100&offset=0` query params |
| Web scraping | Reading a website like a robot | `requests.get()` + `BeautifulSoup` parse |
| CSS selector | A way to describe which element to find | e.g. `soup.select("table.compound-table td")` |
| Exponential backoff | Waiting longer between each retry | `time.sleep(2 ** attempt)` |
| Year-aware routing | Choosing a data source based on the year | `if year <= 2017: use_jolpica()` |

---

*Generated: 2026-03-16 | Project: Raceday | Covers: Phase 4A pre-build — Jolpica API, OpenMeteo, statsf1 scraping, year-aware routing*
