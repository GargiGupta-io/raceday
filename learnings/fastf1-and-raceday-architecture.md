# FastF1 & the Raceday Backend Architecture

> FastF1 is a Python library that gives you access to real Formula 1 race data — lap times, tyre strategies, telemetry, pit stops — and the Raceday backend is designed to fetch, store, and turn that data into fan-facing intelligence.

---

## In Plain English

Imagine you want to answer questions like: "How much faster was Verstappen on fresh tyres compared to Hamilton on a 20-lap stint?" or "Which driver lost the most time in the pit lane at Monaco?" To answer those, you need the raw numbers — every lap time, every sector split, every tyre change, every throttle press. Formula 1 actually records all of this. The problem is getting your hands on it in a form you can work with.

FastF1 is the library that solves that. It knows how to fetch the official F1 data from the internet — the same data feeds that TV broadcasters use — and gives it to you as clean tables you can query and analyse. Think of it like a translator between F1's data feeds and Python.

The Raceday backend takes FastF1 as its raw ingredient. It wraps it in three layers: a **loader** that fetches and saves data locally, an **indexer** that organises that data for fast lookup, and an **insights engine** that reads the organised data and produces the actual analysis. A FastAPI web server then sits in front of all that and lets any frontend — a phone app, a website, a dashboard — ask for information over the internet.

---

## What Is FastF1? (The Technical View)

FastF1 is an open-source Python library (maintained by the community, not by Formula 1 officially) that interfaces with two data sources: the official F1 timing data feed and the Ergast API, a historical F1 database. It abstracts away the messy HTTP requests, authentication, and data normalisation involved in pulling that data, and exposes everything as pandas DataFrames.

Its two most important features are:
1. **Session loading** — you ask for a specific race, qualifying, or practice session by year, round number, and session type, and FastF1 fetches everything: lap times, driver info, car telemetry, weather data, tyre compounds, pit stop windows.
2. **Local caching** — after the first fetch, FastF1 stores the data on disk. Every subsequent request reads from the cache instead of hitting the network, which makes repeated analysis fast and tolerant of being offline.

FastF1 version 3.x (which Raceday uses, specifically 3.8.1) introduced a cleaner session API and improved caching via `requests-cache`, a library that intercepts HTTP requests and transparently serves them from a local SQLite database.

---

## The Problem It Solves

Before FastF1 (and libraries like it), getting F1 telemetry data meant either paying for a commercial feed, screen-scraping websites, or hand-copying numbers from broadcast graphics. The raw data exists — F1 streams live timing data publicly — but parsing that stream requires understanding a proprietary binary format and a real-time subscription model that changes frequently.

FastF1 absorbs all of that complexity. You write:

```python
import fastf1
session = fastf1.get_session(2024, 'Bahrain', 'R')
session.load()
laps = session.laps
```

And you get a DataFrame with every lap driven by every driver in the 2024 Bahrain Grand Prix. Without FastF1, getting to that same point would involve weeks of reverse-engineering work.

---

## How FastF1 Works

### Sessions

Plain English: A "session" in FastF1 is one block of on-track activity — a race, a qualifying hour, or a practice session. You identify it by year, event name or round number, and type.

FastF1's main object is the `Session`. You get one by calling `fastf1.get_session()` and then calling `.load()` on it. The `.load()` call is where the network request (or cache hit) actually happens. Before `.load()`, the session object is just a lightweight shell.

```python
import fastf1

# Get the 2024 British Grand Prix race session
session = fastf1.get_session(2024, 'Great Britain', 'R')
session.load()  # This is where data is actually fetched/read from cache
```

After `.load()`, the session exposes:
- `session.laps` — a DataFrame, one row per lap per driver
- `session.results` — final classification
- `session.weather_data` — temperature, humidity, rain flag, etc.
- `session.car_data` — high-frequency telemetry (speed, throttle, brake, gear, RPM, DRS)
- `session.pos_data` — GPS-like positional data for each car

### Caching

Plain English: Caching means "save a copy locally so we don't have to download it again". FastF1's cache lives in a folder on disk, and it checks that folder before going to the internet.

You enable caching with one line before loading any session:

```python
fastf1.Cache.enable_cache('./data/cache')
```

Under the hood, FastF1 uses `requests-cache` to intercept every HTTP call it would make. Instead of making the request, it checks a local SQLite file for a saved response. If the response is there and still valid, it uses that. If not, it makes the real request and saves the result.

This is critical for a platform like Raceday. Without caching:
- Every API call re-downloads megabytes of telemetry
- You hit rate limits quickly
- The app is useless offline or on a slow connection

With caching, after the first load of a session, subsequent loads take milliseconds.

### DataFrames

Plain English: DataFrames are tables — like spreadsheets — that Python's pandas library knows how to slice, filter, sort, and calculate on very efficiently.

FastF1 returns everything as pandas DataFrames. This is the right choice because F1 data is inherently tabular: rows are laps or time-stamped telemetry points, columns are properties (driver, compound, lap time, sector 1 time, etc.).

```python
laps = session.laps

# All laps by Verstappen
max_laps = laps[laps['Driver'] == 'VER']

# Fastest lap overall
fastest = laps.pick_fastest()

# Average lap time per driver
avg_times = laps.groupby('Driver')['LapTime'].mean()
```

---

## The Raceday Architecture

### Overview

Plain English: Raceday's backend is a pipeline. Raw F1 data comes in through the loader, gets organised by the indexer, gets analysed by the insights engine, and gets served to users by the API. Each step has one job.

```
[FastF1 / Internet]
        |
        v
[loader.py]  ← fetches sessions, normalises data, manages FastF1 cache
        |
        v
[indexer.py] ← persists organised data to disk, tracks what's been indexed
        |
        v
[insights.py] ← reads indexed data, runs analysis, produces insight objects
        |
        v
[api.py]     ← FastAPI routes, receives HTTP requests, calls insights, returns JSON
        |
        v
[Frontend / Client]
```

### loader.py — The Data Fetcher

Plain English: The loader's job is to get F1 data from FastF1 and hand it to the rest of the system in a clean, consistent form. It shields the rest of the code from the details of how FastF1 works.

The loader will:
1. Configure FastF1's cache to point at `CACHE_DIR` (from `.env`)
2. Accept requests like "give me the 2024 Bahrain race" or "give me Hamilton's laps from Monaco qualifying"
3. Call `session.load()` and get the raw DataFrames
4. Normalise those DataFrames — standardise column names, handle missing values, convert times to consistent units
5. Return clean data structures the indexer and insights engine can rely on

Why a separate loader? Because FastF1's API changes between versions, and data from different sessions comes in slightly different shapes. The loader is the single place where those inconsistencies are handled. Everything downstream can assume clean, consistent data.

**File:** `backend/core/loader.py`

```python
"""
loader.py — FastF1 Data Loader

Responsible for fetching and caching F1 session data using the FastF1 library.

Planned responsibilities:
- Load race, qualifying, sprint, and practice session data for a given year/round/event
- Configure and manage the FastF1 local disk cache (pointed at CACHE_DIR from .env)
- Expose a clean interface for fetching laps, telemetry, weather, and session results
- Handle cache misses and re-fetch gracefully
- Normalize raw FastF1 DataFrames into consistent internal schemas for downstream use
"""
```

### indexer.py — The Organiser

Plain English: The indexer takes the clean data from the loader and files it away on disk in a structured way so that the insights engine can find it quickly without having to go back to FastF1 every time.

The indexer answers the question: "have we processed this session before?" If yes, load from the index. If no, ask the loader for the data, then save it to the index.

This is important because generating insights is computationally expensive — you might be calculating tire degradation curves or sector delta matrices across an entire season. You don't want to recompute those from scratch on every API request. The index is a pre-processed, ready-to-query store.

The `INDEX_DIR` environment variable (from `.env`) points to where on disk the index lives. Likely this'll be structured as directories per year/event/session type.

**File:** `backend/core/indexer.py`

```python
"""
indexer.py — F1 Data Indexer

Responsible for building and maintaining a searchable index of F1 data on disk.

Planned responsibilities:
- Accept normalized DataFrames from loader.py and persist them to INDEX_DIR
- Build per-session and per-driver indexes for fast lookup at query time
- Track which sessions have been indexed to avoid redundant reprocessing
- Provide utilities to list available indexed sessions and drivers
- Support incremental updates as new race weekends complete
"""
```

### insights.py — The Brain

Plain English: The insights engine reads organised data and produces the actual answers — "Leclerc was 1.2 seconds faster per lap on mediums than softs at this circuit", or "the safety car cost Norris a podium". It's the analytical core of the platform.

This is where the interesting work happens: statistics, comparisons, trend detection, anomaly flagging. It'll take structured queries from the API layer and return structured insight objects — not raw DataFrames, but clean Python dicts or Pydantic models that describe a finding in a form the frontend can display.

**File:** `backend/core/insights.py`

### api.py — The Front Door

Plain English: The API is the part of the system that listens on the internet for requests and knows how to answer them. It's like a receptionist — it takes a call, figures out what's being asked for, hands it to the right person (insights engine), and returns the answer.

FastAPI handles all the HTTP machinery: parsing URLs, reading query parameters, serialising Python objects to JSON, returning the right status codes. The API routes in `api.py` should stay thin — they receive a request, call into `core/`, and return the result. No business logic lives in the route handlers.

**File:** `backend/api.py`

```python
from fastapi import FastAPI

app = FastAPI(title="Raceday", description="F1 Fan Intelligence Platform")
```

The `app` object is what uvicorn runs. Every route is registered on it.

---

## What Is FastAPI? (And Why Not Flask?)

Plain English: FastAPI is a modern Python web framework. It's the thing that turns your Python functions into endpoints that a browser or app can call over the internet. It was chosen over older alternatives like Flask because it's faster, safer, and less boilerplate.

FastAPI's key advantages for Raceday:
- **Automatic documentation** — go to `/docs` when the server is running and you get a full interactive API explorer, generated automatically from your code
- **Type safety** — FastAPI uses Python type hints to validate inputs and serialise outputs, catching bugs before they reach users
- **Async support** — FastAPI is built on async Python, meaning it can handle many simultaneous requests without blocking (important when multiple users hit the insights engine at once)
- **Pydantic** — FastAPI uses Pydantic for data models, which means you define what your request/response data looks like in Python classes and FastAPI enforces it automatically

---

## What Is uvicorn?

Plain English: FastAPI is the recipe; uvicorn is the chef that actually runs it. uvicorn is the server that listens for incoming internet connections and passes them to your FastAPI app.

```bash
python3 -m uvicorn backend.api:app --reload
```

- `backend.api` — the Python module path to `api.py`
- `app` — the FastAPI instance inside that module
- `--reload` — restart automatically when you change code (development only)

uvicorn is an ASGI server (Asynchronous Server Gateway Interface), which is the modern Python web server standard. The older standard was WSGI (used by Flask and Django). ASGI supports async/await natively, which is why FastAPI requires it.

---

## The .env File and Environment Variables

Plain English: The `.env` file stores configuration that might be different depending on where the code runs — on your laptop vs. a server. Instead of hardcoding paths in your code, you read them from this file, so you only have to change one place.

```
CACHE_DIR=./data/cache
INDEX_DIR=./data/index
```

`python-dotenv` loads this file into `os.environ` at startup:

```python
from dotenv import load_dotenv
import os

load_dotenv()

cache_dir = os.getenv('CACHE_DIR')  # './data/cache'
index_dir = os.getenv('INDEX_DIR')  # './data/index'
```

Why this matters: if Raceday ever runs on a server (say, a cloud VM), the cache and index might live in `/var/data/raceday/cache` instead of `./data/cache`. You change the `.env` file, not the code. The `.env` file is also kept out of git (it goes in `.gitignore`) so secrets like API keys never end up in source control.

---

## The Data Flow, Step by Step

Here's what happens when a user asks "show me the race insights for the 2024 Monaco Grand Prix":

```
1. User opens the Raceday app → frontend sends:
   GET /insights/2024/Monaco

2. api.py receives the request, extracts year=2024, event='Monaco'

3. api.py calls insights.get_race_insights(year=2024, event='Monaco')

4. insights.py asks indexer: "do we have Monaco 2024 indexed?"

5a. If YES → indexer returns pre-processed data from INDEX_DIR
5b. If NO  → indexer asks loader to fetch it
              loader calls fastf1.get_session(2024, 'Monaco', 'R').load()
              FastF1 checks CACHE_DIR → cache hit or fetches from internet
              loader normalises DataFrames
              indexer saves to INDEX_DIR

6. insights.py runs analysis on the data:
   - calculates lap deltas between drivers
   - detects undercuts and safety car impacts
   - identifies fastest sectors, pit stop durations
   - produces structured Insight objects

7. api.py serialises Insight objects to JSON → returns to frontend

8. Frontend renders the insights to the user
```

---

## Edge Cases & Gotchas

**1. FastF1 data is only available after a session ends**
In plain English: you can't get telemetry for a race that hasn't happened yet, and for very recent races the data may not be published immediately.
Technical cause: FastF1 pulls from official F1 data feeds that are published post-session.
How to avoid: check session date before attempting a load; handle `fastf1.core.DataNotLoadedError` gracefully.

**2. Cache invalidation**
In plain English: occasionally FastF1 updates or corrects historical data. Your cached copy won't update automatically.
Technical cause: `requests-cache` stores responses indefinitely by default.
How to avoid: implement a manual cache-bust mechanism in the loader; allow force-reload via a flag.

**3. Not all sessions have all data**
In plain English: early-season races or sprint formats may not have all the usual data fields.
Technical cause: F1 changed its data publishing format multiple times; some older sessions lack telemetry.
How to avoid: always check if a DataFrame is empty or missing expected columns before passing it downstream; the loader's normalisation step should fill defaults or raise clear errors.

**4. The Anaconda/PATH warning for uvicorn**
In plain English: uvicorn was installed, but your terminal won't find it if you just type `uvicorn`.
Technical cause: Anaconda's Scripts folder isn't on your PATH.
How to avoid: always run `python3 -m uvicorn ...` instead of `uvicorn ...` directly. This bypasses the PATH issue entirely.

**5. Streamlit/packaging conflict**
In plain English: installing Raceday's dependencies upgraded `packaging` to version 26, which Streamlit 1.32 doesn't accept.
Technical cause: pip resolved the newest compatible version of `packaging`, which exceeds Streamlit's upper bound.
How to avoid: if you need Streamlit elsewhere, create a virtual environment per project (`python3 -m venv .venv`) to keep dependencies isolated.

---

## How It Connects to Other Concepts

- **pandas** — all FastF1 data comes back as DataFrames; understanding pandas filtering, groupby, and time-series operations is essential for the insights engine
- **Pydantic** — FastAPI uses Pydantic to define request/response schemas; the Insight objects from `insights.py` will likely be Pydantic models
- **async/await** — FastAPI supports async route handlers; if the insights engine does slow I/O (disk reads from the index), making it async prevents blocking other requests
- **REST API design** — the routes planned in `api.py` (`/sessions`, `/drivers`, `/insights`) follow REST conventions; understanding resource-oriented design helps in planning the URL structure
- **Virtual environments** — the Anaconda environment currently used is global; a project-local `.venv` would keep Raceday's dependencies isolated and prevent conflicts like the Streamlit issue

---

## Going Deeper

### Virtual Environments
Instead of installing into Anaconda globally, create a `.venv` inside the raceday directory: `python3 -m venv .venv && source .venv/Scripts/activate`. Then pip install goes into the project only. Eliminates version conflicts between projects.

### FastAPI Routers
As `api.py` grows, you'll split routes into separate files (e.g. `routers/sessions.py`, `routers/insights.py`) and use `app.include_router()`. Keeps the API layer organised.

### Pydantic Response Models
Define Pydantic classes for what insights look like (`class RaceInsight(BaseModel): ...`). FastAPI uses these to validate and document responses automatically.

### Async FastF1 Loading
FastF1's `.load()` is synchronous and can take several seconds. Wrapping it in `asyncio.to_thread()` lets FastAPI handle other requests while the data loads instead of blocking.

### pandas Parquet Files
For the indexer, storing DataFrames as `.parquet` files (via `df.to_parquet()`) is far more efficient than CSV — smaller files, faster reads, and data types are preserved exactly.

---

## Quick Reference

### Key Terms

| Term | Plain English | Technical meaning |
|------|---------------|-------------------|
| Session | One block of on-track time | `fastf1.Session` object for a race/quali/practice |
| Cache | Local saved copy of data | SQLite DB managed by `requests-cache` in `CACHE_DIR` |
| DataFrame | A table of data | `pandas.DataFrame` — rows × columns |
| Loader | Data fetcher | `backend/core/loader.py` — wraps FastF1 |
| Index | Organised data store | `backend/core/indexer.py` — pre-processed data in `INDEX_DIR` |
| Insights | Analysis results | `backend/core/insights.py` — computed findings |
| ASGI | Async web server standard | What uvicorn implements; required by FastAPI |
| Uvicorn | The web server | Runs the FastAPI app and handles HTTP connections |

### Essential FastF1 Patterns

```python
import fastf1

# Always enable cache first
fastf1.Cache.enable_cache('./data/cache')

# Load a session
session = fastf1.get_session(2024, 'Bahrain', 'R')  # R=Race, Q=Qualifying, FP1/FP2/FP3
session.load()

# Work with laps
laps = session.laps
driver_laps = laps[laps['Driver'] == 'VER']
fastest = laps.pick_fastest()

# Work with telemetry (high-frequency car data)
tel = fastest.get_telemetry()  # speed, throttle, brake, gear per 4hz sample
```

### Run the Dev Server

```bash
cd raceday
python3 -m uvicorn backend.api:app --reload --port 8000
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

---

*Generated: 2026-03-14 | Project: Raceday | Files: backend/api.py, backend/core/loader.py, backend/core/indexer.py, backend/core/insights.py, backend/requirements.txt, .env*
