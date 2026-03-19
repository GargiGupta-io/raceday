# Raceday — F1 Fan Intelligence Platform

## What it does
A story-first F1 platform where beginners learn about races through narratives and interactive features, while hardcore fans dig into strategy data and historical patterns. Covers every race from 2010-2024 across 15 seasons and 300+ races.

## Tech Stack

### Backend (Python)
- **FastF1** — F1 telemetry and session data (2018+)
- **Jolpica API** — historical F1 data (2010-2017)
- **OpenMeteo** — historical weather data
- **OpenF1 API** — team radio audio (2023+)
- **FastAPI + uvicorn** — REST API server
- **numpy** — polynomial regression for strategy simulation ML model
- **pandas** — data processing
- **python-dotenv** — environment config

### Frontend (TypeScript)
- **Next.js 16** (App Router, Turbopack)
- **React 19** with client components
- **Tailwind CSS** — dark zinc theme
- **HTML5 Audio** — team radio playback

### External Services
- **Supabase** — auth + database (currently unused, Discussion removed)
- **Groq/OpenAI** — optional Whisper transcription for radio clips

## Structure
```
raceday/
├── backend/
│   ├── api.py                    # FastAPI app, 15+ endpoints
│   ├── requirements.txt
│   └── core/
│       ├── loader.py             # FastF1 data + lap timing extraction
│       ├── indexer.py            # On-disk index (results, weather, stints, laps)
│       ├── insights.py           # Fan-facing analytics, stories, key moments
│       ├── jolpica_loader.py     # Historical data API (2010-2017)
│       ├── openmeteo_loader.py   # Historical weather
│       ├── compound_lookup.py    # Tyre compound nominations (2010-2017)
│       ├── openf1_radio.py       # Team radio fetcher (2023+)
│       ├── radio_transcriber.py  # Whisper transcription pipeline
│       ├── radio_sentiment.py    # Sentiment scoring for radio clips
│       ├── strategy_sim.py       # ML strategy simulator (polynomial regression)
│       ├── rss_fetcher.py        # RSS news feeds
│       └── reddit_fetcher.py     # Reddit discussion fetcher
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Home page (year selector + race cards)
│   │   ├── layout.tsx            # Root layout with Navbar
│   │   ├── races/[year]/[track]/page.tsx  # Race page (story-first scroll)
│   │   ├── patterns/page.tsx     # Pattern Finder page
│   │   ├── championship/[year]/page.tsx   # Championship standings
│   │   └── components/
│   │       ├── ResultsCard.tsx         # Compact podium
│   │       ├── KeyMoments.tsx          # Auto-detected highlights
│   │       ├── RaceStory.tsx           # Unified race narrative + tagline
│   │       ├── PatternPrecedents.tsx   # "What History Tells Us"
│   │       ├── RadioMoments.tsx        # Team radio with audio player
│   │       ├── StrategySimulator.tsx   # ML-powered "what if" sandbox
│   │       ├── StrategyPanel.tsx       # Compound grid (Go Deeper)
│   │       ├── StrategyStory.tsx       # Strategy narrative
│   │       ├── StrategyKey.tsx         # Compound legend
│   │       ├── SeasonStory.tsx         # Championship turning points
│   │       ├── SeasonInsights.tsx      # Season awards + H2H
│   │       ├── FactsSidebar.tsx        # "Race Intelligence" facts
│   │       ├── GoDeeper.tsx            # Expandable accordion sections
│   │       ├── Navbar.tsx              # Top nav with year selector
│   │       └── AuthButton.tsx          # (unused — auth removed)
│   ├── lib/
│   │   └── supabase.ts           # Supabase client (unused)
│   └── public/
│       └── circuits/             # 34 circuit outline SVGs
├── data/
│   ├── cache/                    # FastF1 cache
│   └── index/                    # Indexed race data (2010-2024)
│       └── {year}/{track}/
│           ├── race_results.json
│           ├── weather.json
│           ├── stints.json
│           ├── laps.json         # Lap-by-lap timing (2018+ only)
│           └── radio_moments.json # Cached radio clips (2023+ only)
├── learnings/                    # Deep learning docs + steps log
└── .env                          # CACHE_DIR, INDEX_DIR, optional API keys
```

## Race Page Layout (story-first scroll)
```
Podium (compact 3-row)
Key Moments (auto-detected)
Race Story (unified narrative + tagline)
What History Tells Us (pattern matcher)
Team Radio (2023+, audio playback)
─── GO DEEPER (expandable) ───
  Strategy breakdown (story/data toggle)
  Season standings at this point
  Season awards & teammate battles
─────────────────────────────
Strategy Simulator (ML-powered, full-width)
Race Intelligence sidebar (Did You Know facts)
```

## Key API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Server status |
| GET | /races/{year} | Season race list |
| GET | /races/{year}/{track}/results | Race summary |
| GET | /races/{year}/{track}/standings | Finishing order |
| GET | /races/{year}/{track}/strategy | Tyre strategy data |
| GET | /races/{year}/{track}/moments | Key moments |
| GET | /races/{year}/{track}/story | Race narrative + tagline |
| GET | /races/{year}/{track}/precedents | Historical pattern matches |
| GET | /races/{year}/{track}/radio | Top 5 radio clips |
| GET | /races/{year}/{track}/sim-context | Simulator setup data |
| POST | /races/{year}/{track}/simulate | Run strategy prediction |
| GET | /races/{year}/{track}/sidebar | Race Intelligence facts |
| POST | /patterns/search | Custom pattern queries |

## Phase History
| Phase | What | Status |
|-------|------|--------|
| 1 | Backend MVP (indexer + insights + API) | Done |
| 2 | Backend extensions + frontend scaffold | Done |
| 4A | Historical data (2010-2017 via Jolpica) | Done |
| 4B | Facts & theories sidebar | Done |
| 4C | Supabase accounts & discussion | Done (later removed) |
| 4D | Polish & bug fixes | Done |
| 5A | Home page redesign | Done |
| 5B | Strategy storytelling | Done |
| 5C | Results tab redesign | Done |
| 5D | Season story | Done |
| 5E | Season insights | Done |
| 6A | Race page redesign (story-first) | Done |
| 6B | Landing page + year bar | Done |
| 6C | Circuit outlines | Done |
| 6D | Unified race story + tagline | Done |
| 6E | Pattern matcher | Done |
| 6G | Strategy tab cleanup | Done |
| 6H | Radio sentiment + audio playback | Done |
| 6I | Strategy simulator (ML-powered) | Done |
| 6F | 2010 data gap fix | Done |

## GitHub
https://github.com/GargiGupta-io/raceday
