"""
api.py — Raceday FastAPI Application

Entry point for the Raceday backend REST API.
Routes are thin — all business logic lives in backend/core/.

On startup, a background thread indexes all seasons (2010–2024)
so that every page has data ready when a user visits.
"""

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.core import indexer, insights

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Background indexer
# ---------------------------------------------------------------------------

SEASONS_TO_INDEX = list(range(2010, 2025))  # 2010–2024

_indexing_status = {
    "running": False,
    "current_year": None,
    "completed_years": [],
    "total_indexed": 0,
    "total_skipped": 0,
    "total_failed": 0,
}


def _background_index_all():
    """Index all seasons in a background thread. Skips already-indexed races."""
    _indexing_status["running"] = True
    logger.info("Background indexer started — seasons %d to %d",
                SEASONS_TO_INDEX[0], SEASONS_TO_INDEX[-1])

    for year in SEASONS_TO_INDEX:
        _indexing_status["current_year"] = year
        logger.info("Indexing %d...", year)
        try:
            result = indexer.index_season(year)
            _indexing_status["total_indexed"] += result["indexed"]
            _indexing_status["total_skipped"] += result["skipped"]
            _indexing_status["total_failed"] += result["failed"]
            _indexing_status["completed_years"].append(year)
            logger.info(
                "  %d done: %d indexed, %d skipped, %d failed",
                year, result["indexed"], result["skipped"], result["failed"],
            )
        except Exception as exc:
            logger.error("  %d error: %s", year, exc)
            _indexing_status["completed_years"].append(year)

    _indexing_status["running"] = False
    _indexing_status["current_year"] = None
    logger.info(
        "Background indexer complete — %d indexed, %d skipped, %d failed",
        _indexing_status["total_indexed"],
        _indexing_status["total_skipped"],
        _indexing_status["total_failed"],
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch background indexer thread
    thread = threading.Thread(target=_background_index_all, daemon=True)
    thread.start()
    yield
    # Shutdown: nothing to clean up (daemon thread dies with process)


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Raceday",
    description="F1 Fan Intelligence Platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/indexing/status")
def indexing_status():
    return _indexing_status


@app.get("/seasons/summary")
def all_season_summaries():
    return insights.get_all_season_summaries()


@app.get("/races/{year}")
def season_races(year: int):
    data = insights.get_season_races(year)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No schedule found for {year}")
    return data


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


@app.get("/races/{year}/{track}/strategy/narrative")
def strategy_narrative(year: int, track: str):
    data = insights.get_strategy_narrative(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/strategy/stats")
def strategy_stats(year: int, track: str):
    data = insights.get_strategy_stats(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/moments")
def race_moments(year: int, track: str):
    data = insights.get_key_moments(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/season-story")
def season_story(year: int, track: str):
    data = insights.get_season_story(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/sidebar")
def race_sidebar(year: int, track: str):
    data = insights.get_sidebar_content(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/story")
def race_story(year: int, track: str):
    tagline = insights.generate_race_tagline(year, track)
    story = insights.get_race_story(year, track)
    if story is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return {"tagline": tagline, **story}


@app.get("/races/{year}/{track}/precedents")
def race_precedents(year: int, track: str):
    data = insights.get_auto_precedents(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/seasons/{year}/insights")
def season_insights(year: int):
    data = insights.get_season_insights(year)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Not enough indexed races for {year}")
    return data


@app.get("/championship/{year}/drivers")
def championship_standings(year: int):
    data = insights.get_championship_standings(year)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No indexed races found for {year}")
    return data
