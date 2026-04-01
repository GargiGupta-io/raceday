# RaceDay

A full-stack Formula 1 analytics platform that combines historical race data, real-time monitoring, and interactive strategy simulation. Explore every F1 season from 2010 to the present with detailed race breakdowns, championship progression charts, pattern discovery, and live race telemetry.

## Features

- **Race Analysis** - Results, pit strategies, key moments, radio clips with transcription, and AI-generated race narratives for every Grand Prix
- **Strategy Simulator** - Interactive tool to explore alternate pit strategies and compare outcomes
- **Championship Tracker** - Standings tables and points progression charts across full seasons
- **Pattern Finder** - Search historical races by circuit, weather, driver, grid position, and more with preset filters like "Wet race upsets" and "Won from P10+"
- **Live Race Monitor** - Real-time driver positions, tyre data, pit window predictions, and what-if strategy comparisons via WebSocket
- **Chrome Extension** - Browser popup displaying live race data during sessions

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, GSAP, Recharts |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Data Sources | FastF1 (2018+), Jolpica (2015-2017), OpenF1 (live), OpenMeteo (weather) |
| Transcription | Groq / OpenAI / local Whisper (optional) |
| Deployment | Vercel (frontend), Railway (backend), Docker |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+

### Environment Setup

```bash
cp .env.example .env
```

Edit `.env` as needed. Defaults work for local development. Groq/OpenAI keys are optional (only needed for radio transcription).

### Backend

```bash
cd backend
pip install -r requirements.txt
python -c "import uvicorn; uvicorn.run('backend.api:app', host='0.0.0.0', port=8888)"
```

The backend starts on `http://localhost:8888` and begins indexing seasons in the background.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:3000` and connects to the backend API.

### Chrome Extension

```bash
cd extension
npm install
npm run build
```

Load the `extension/dist` folder as an unpacked extension in Chrome.

## Project Structure

```
raceday/
├── backend/
│   ├── api.py                 # FastAPI routes
│   ├── core/
│   │   ├── loader.py          # FastF1 data fetcher
│   │   ├── indexer.py         # JSON file indexer
│   │   ├── insights.py        # Race analysis & narratives
│   │   ├── strategy_sim.py    # Pit strategy simulator
│   │   ├── live_feed.py       # Real-time OpenF1 polling
│   │   ├── radio_transcriber.py
│   │   ├── jolpica_loader.py  # Historical data (pre-2018)
│   │   └── openmeteo_loader.py
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Home - season selector
│   │   ├── races/[year]/[track]/  # Race detail page
│   │   ├── championship/[year]/   # Championship standings
│   │   ├── patterns/          # Pattern finder
│   │   ├── live/              # Live race monitor
│   │   └── components/        # ~25 reusable components
│   └── package.json
├── extension/                 # Chrome extension (React + Vite)
├── data/
│   ├── cache/                 # FastF1 session cache
│   └── index/                 # Indexed race JSON files
├── Dockerfile
├── Procfile
└── .env.example
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/seasons/summary` | All seasons with champions |
| GET | `/races/{year}` | Races in a season |
| GET | `/races/{year}/{track}/results` | Race results |
| GET | `/races/{year}/{track}/strategy` | Pit stop strategies |
| GET | `/races/{year}/{track}/story` | Race narrative |
| GET | `/races/{year}/{track}/radio` | Radio clips + transcripts |
| POST | `/races/{year}/{track}/simulate` | Simulate pit strategy |
| GET | `/championship/{year}/drivers` | Driver standings |
| GET | `/championship/{year}/progression` | Points over rounds |
| POST | `/patterns/search` | Find matching historical races |
| GET | `/live` | Current live race status |
| WS | `/ws/live` | Live race WebSocket |

## Deployment

**Frontend** - Deploy to Vercel. Set `NEXT_PUBLIC_API_URL` to your backend URL.

**Backend** - Deploy to Railway or any Docker host. Set `PORT` and optional API keys as environment variables.

## License

Private project.
