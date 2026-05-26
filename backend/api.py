"""
api.py — Raceday FastAPI Application

Entry point for the Raceday backend REST API.
Routes are thin — all business logic lives in backend/core/.

On startup, a background thread indexes all seasons (2010–current year)
so that every page has data ready when a user visits. The current season
is re-checked periodically to pick up new races as they happen.
"""

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.core import indexer, insights, storage
from backend.core import live_feed

logger = logging.getLogger(__name__)
_request_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="api-worker")

# ---------------------------------------------------------------------------
# Background indexer
# ---------------------------------------------------------------------------

CURRENT_YEAR = datetime.now().year
SEASONS_TO_INDEX = list(range(2010, CURRENT_YEAR + 1))

_indexing_status = {
    "running": False,
    "current_year": None,
    "completed_years": [],
    "total_indexed": 0,
    "total_skipped": 0,
    "total_failed": 0,
}


def _cors_origins() -> list[str]:
    configured = os.environ.get("FRONTEND_URLS") or os.environ.get("FRONTEND_URL", "")
    configured_origins = [origin.strip() for origin in configured.split(",") if origin.strip()]

    return [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "https://raceday-khaki.vercel.app",
        *configured_origins,
    ]


class HealthResponse(BaseModel):
    status: str
    service: str
    current_year: int
    indexing_running: bool


class DataSourceHealth(BaseModel):
    name: str
    status: str
    purpose: str
    timeout_seconds: int | None = None
    note: str | None = None


class IndexingStatusResponse(BaseModel):
    running: bool
    current_year: int | None
    completed_years: list[int]
    total_indexed: int
    total_skipped: int
    total_failed: int


class LiveStatusResponse(BaseModel):
    status: str
    active: bool
    session: str | None = None
    clients: int
    last_update: str | None = None
    last_error: str | None = None
    source: str


class StorageStatusResponse(BaseModel):
    backend: str
    json_index_dir: str
    database_url_configured: bool
    postgres_ready: bool
    active_store: str


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

    # After full index, periodically re-check current season for new races
    _periodic_current_season_check()


def _periodic_current_season_check():
    """Re-index the current season every 6 hours to pick up new races."""
    while True:
        time.sleep(6 * 3600)  # 6 hours
        logger.info("Periodic re-check: indexing %d season for new races...", CURRENT_YEAR)
        try:
            result = indexer.index_season(CURRENT_YEAR)
            if result["indexed"] > 0:
                logger.info("  Found %d new races for %d!", result["indexed"], CURRENT_YEAR)
            else:
                logger.info("  No new races for %d.", CURRENT_YEAR)
        except Exception as exc:
            logger.error("  Periodic check failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch background indexer thread + live feed
    thread = threading.Thread(target=_background_index_all, daemon=True)
    thread.start()
    live_feed.start_feed()
    yield
    # Shutdown
    live_feed.stop_feed()


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
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST"],
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


@app.get("/health", response_model=HealthResponse)
def health():
    return {
        "status": "ok",
        "service": "raceday-backend",
        "current_year": CURRENT_YEAR,
        "indexing_running": bool(_indexing_status["running"]),
    }


@app.get("/health/data-sources", response_model=list[DataSourceHealth])
def data_source_health():
    live_status = live_feed.get_live_status()
    openf1_status = "degraded" if live_status.get("status") == "error" else "configured"
    return [
        {
            "name": "FastF1",
            "status": "configured",
            "purpose": "Historical timing, lap, session, tyre, and race data",
            "note": "Loaded through local cache/indexing jobs",
        },
        {
            "name": "Jolpica",
            "status": "configured",
            "purpose": "Historical schedules and results fallback",
            "timeout_seconds": 15,
        },
        {
            "name": "OpenMeteo",
            "status": "configured",
            "purpose": "Weather context for race conditions",
            "timeout_seconds": 15,
        },
        {
            "name": "OpenF1",
            "status": openf1_status,
            "purpose": "Live session, timing, stint, and driver data",
            "timeout_seconds": live_feed.OPENF1_TIMEOUT_SECONDS,
            "note": live_status.get("last_error"),
        },
    ]


@app.post("/refresh/{year}")
def refresh_season(year: int):
    """Manually trigger re-indexing for a specific season. Useful after a race weekend."""
    try:
        result = indexer.index_season(year)
        return {
            "year": year,
            "indexed": result["indexed"],
            "skipped": result["skipped"],
            "failed": result["failed"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Refresh failed: {exc}")


@app.get("/live")
def live_snapshot():
    """Get current live race state (same data as WebSocket, but via REST)."""
    state = live_feed.get_live_state()
    if state is None:
        return {"active": False, "session": None}
    return {"active": True, **state}


@app.get("/live/status", response_model=LiveStatusResponse)
def live_feed_status():
    return live_feed.get_live_status()


@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    """WebSocket endpoint for live race data. Clients receive updates every ~10s during a live session."""
    await ws.accept()
    live_feed.add_client(ws)

    # Send current state immediately if available
    state = live_feed.get_live_state()
    if state:
        await ws.send_json(state)

    try:
        # Keep connection alive — wait for client messages (pings/disconnect)
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        live_feed.remove_client(ws)


@app.get("/indexing/status", response_model=IndexingStatusResponse)
def indexing_status():
    return _indexing_status


@app.get("/storage/status", response_model=StorageStatusResponse)
def storage_status():
    return storage.storage_status()


@app.get("/seasons/summary")
def all_season_summaries():
    return insights.get_all_season_summaries()


@app.get("/races/{year}")
def season_races(year: int):
    indexed = insights.get_indexed_season_races(year)
    if indexed:
        return indexed

    future = _request_executor.submit(insights.get_season_races, year)
    try:
        data = future.result(timeout=6)
    except TimeoutError:
        logger.warning("season_races timed out for %s; returning indexed fallback", year)
        data = indexed
    if data is None:
        data = indexed
    if data is None:
        data = []
    return data


@app.get("/races/{year}/{track}/results")
def race_results(year: int, track: str):
    data = insights.get_race_summary(year, track)
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


@app.get("/debug/transcription")
def debug_transcription():
    import os
    from backend.core import radio_transcriber
    groq_raw = os.environ.get("GROQ_API_KEY", "")
    return {
        **radio_transcriber.get_backend_status(),
        "groq_key_present": bool(groq_raw),
        "groq_key_length": len(groq_raw),
        "groq_key_prefix": groq_raw[:6] + "..." if groq_raw else "empty",
        "env_keys_with_groq": [k for k in os.environ if "GROQ" in k.upper()],
    }


@app.get("/races/{year}/{track}/radio")
def race_radio(year: int, track: str, refresh: bool = False):
    if refresh:
        # Clear cached radio moments to re-transcribe
        cache_path = indexer._race_dir(year, track) / "radio_moments.json"
        if cache_path.exists():
            cache_path.unlink()
    data = insights.get_radio_moments(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.get("/races/{year}/{track}/sim-context")
def sim_context(year: int, track: str):
    from backend.core import strategy_sim
    data = strategy_sim.get_simulation_context(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.post("/races/{year}/{track}/simulate")
def simulate(year: int, track: str, payload: dict):
    from backend.core import strategy_sim
    driver = payload.get("driver", "")
    pit_stops = payload.get("pit_stop_laps", [])
    compounds = payload.get("compounds", [])
    if not driver or not compounds:
        raise HTTPException(status_code=400, detail="Missing driver or compounds")
    data = strategy_sim.simulate_strategy(year, track, driver, pit_stops, compounds)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track} / {driver}")
    return data


@app.get("/races/{year}/{track}/swap-context")
def swap_context(year: int, track: str):
    from backend.core import strategy_sim
    data = strategy_sim.get_swap_context(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.post("/races/{year}/{track}/simulate-swap")
def simulate_swap(year: int, track: str, payload: dict):
    from backend.core import strategy_sim
    driver = payload.get("driver", "")
    target_team = payload.get("target_team", "")
    if not driver or not target_team:
        raise HTTPException(status_code=400, detail="Missing driver or target_team")
    data = strategy_sim.simulate_swap(year, track, driver, target_team)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track} / {driver}")
    return data


@app.get("/races/{year}/{track}/precedents")
def race_precedents(year: int, track: str):
    data = insights.get_auto_precedents(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data


@app.post("/patterns/search")
def pattern_search(filters: dict):
    """
    Search for races matching user-defined criteria.

    Accepted filter keys (all optional):
        circuit   — circuit name substring (e.g. "British", "Monza")
        condition — "dry", "wet", or "damp"
        winner    — driver code (e.g. "VER") or full name substring
        team      — team name substring (e.g. "Red Bull")
        min_grid  — minimum winner grid position (e.g. 5 = P5 or worse)
        max_dnf   — minimum DNF count (e.g. 5 = chaotic races)
        year_from — earliest year (inclusive)
        year_to   — latest year (inclusive)

    Returns list of matching races sorted by year descending.
    """
    all_races = indexer.list_indexed()
    results = []

    circuit_q = (filters.get("circuit") or "").lower()
    condition_q = (filters.get("condition") or "").lower()
    winner_q = (filters.get("winner") or "").upper()
    team_q = (filters.get("team") or "").lower()
    min_grid = filters.get("min_grid")
    max_dnf = filters.get("max_dnf")
    year_from = filters.get("year_from", 2010)
    year_to = filters.get("year_to", 2025)

    for race in all_races:
        ry, rt = race["year"], race["track"]

        if ry < year_from or ry > year_to:
            continue

        profile = insights._extract_race_profile(ry, rt)
        if profile is None:
            continue

        # Apply filters
        if circuit_q and circuit_q not in profile["circuit"].lower():
            continue
        if condition_q and profile["condition"] != condition_q:
            continue
        if winner_q:
            name_match = winner_q in profile["winner"]
            full_name = insights._DRIVER_NAMES.get(profile["winner"], "").upper()
            if not name_match and winner_q not in full_name:
                continue
        if team_q and team_q not in profile["winner_team"].lower():
            continue
        if min_grid and profile["winner_grid"] < min_grid:
            continue
        if max_dnf and profile["dnf_count"] < max_dnf:
            continue

        results.append({
            "year": ry,
            "track": rt,
            "winner": profile["winner"],
            "winner_name": insights._DRIVER_NAMES.get(profile["winner"], profile["winner"]),
            "winner_team": profile["winner_team"],
            "winner_grid": profile["winner_grid"],
            "condition": profile["condition"],
            "dnf_count": profile["dnf_count"],
            "max_gain": profile["max_gain"],
        })

    results.sort(key=lambda r: (-r["year"], r["track"]))
    return {"count": len(results), "races": results}


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


@app.get("/championship/{year}/progression")
def championship_progression(year: int):
    data = insights.get_championship_progression(year)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No progression data for {year}")
    return data
