# Raceday — F1 Fan Intelligence Platform

## What it does
Backend platform that ingests F1 session data via FastF1, indexes it locally, and serves fan-facing insights and analytics through a REST API.

## Tech Stack
- **FastF1** — F1 telemetry and session data
- **FastAPI + uvicorn** — REST API server
- **pandas + numpy** — data processing
- **python-dotenv** — environment config

## Structure
```
raceday/
├── backend/
│   ├── api.py              # FastAPI app entry point, route definitions
│   ├── requirements.txt
│   └── core/
│       ├── loader.py       # Fetches & caches F1 data via FastF1
│       ├── indexer.py      # Builds/maintains on-disk session index
│       └── insights.py     # Generates fan-facing analytics & storylines
├── data/
│   ├── cache/              # FastF1 cache (CACHE_DIR)
│   └── index/              # Indexed session data (INDEX_DIR)
└── .env
```

## GitHub
https://github.com/GargiGupta-io/raceday

## Tech Stack (updated)
- **FastF1** — F1 telemetry and session data
- **FastAPI + uvicorn** — REST API server
- **pandas + numpy** — data processing
- **python-dotenv** — environment config
- **Next.js (planned)** — frontend (Phase 2)

## Status — Phase 2 in progress
### Backend MVP (Phase 1) — COMPLETE
- `loader.py` — fully implemented (get_session, get_race_results, get_weather_summary, get_season_schedule)
- `indexer.py` — fully implemented (index_race, is_indexed, load_race_index, list_indexed)
- `insights.py` — fully implemented (get_race_summary, get_driver_standings_snapshot, get_strategy_breakdown)
- `api.py` — 4 live routes: /health, /results, /standings, /strategy

### Phase 2 — Backend Extensions + Frontend (in progress)
- [ ] Season endpoint — GET /races/{year}
- [ ] Full stint sequences — real stop counts + compound sequences
- [ ] Driver championship standings — GET /championship/{year}/drivers
- [ ] CORS middleware + Next.js scaffold
- [ ] Frontend: race browser, results, standings, strategy, championship

## Run locally
```
cd raceday
python3 -m uvicorn backend.api:app --port 8001 --reload
```

## API Routes
| Route | Returns |
|-------|---------|
| GET /health | {status: ok} |
| GET /races/{year}/{track}/results | winner, podium, retirements, weather |
| GET /races/{year}/{track}/standings | full finish order with position deltas |
| GET /races/{year}/{track}/strategy | tyre compound per driver |
| GET /races/{year} | all GPs in a season (coming) |
| GET /championship/{year}/drivers | points table (coming) |

## GitHub
https://github.com/GargiGupta-io/raceday
