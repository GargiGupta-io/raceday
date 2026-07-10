"""
api.py — Raceday FastAPI Application

Entry point for the Raceday backend REST API.
Routes are thin — all business logic lives in backend/core/.

On startup, a background thread indexes all seasons (2010–current year)
so that every page has data ready when a user visits. The current season
is re-checked periodically to pick up new races as they happen.
"""

import asyncio
import hashlib
import logging
import os
import secrets
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.core import cache, companion, http_client, indexer, insights, storage
from backend.core import live_demo, live_feed

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

PREBUILT_INDEX_MIN_RACES = int(os.getenv("PREBUILT_INDEX_MIN_RACES", "100"))
SEASON_SUMMARY_CACHE_KEY = "raceday:season-summary:v1"
SEASON_SUMMARY_CACHE_TTL_SECONDS = 600


def _positive_env_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


_RATE_LIMIT_POLICIES = {
    "companion-note": (
        _positive_env_int("RATE_LIMIT_COMPANION_PER_MINUTE", 120),
        60,
    ),
    "companion-analysis": (
        _positive_env_int("RATE_LIMIT_ANALYSIS_PER_MINUTE", 30),
        60,
    ),
    "simulation": (
        _positive_env_int("RATE_LIMIT_SIMULATION_PER_MINUTE", 60),
        60,
    ),
    "refresh": (
        _positive_env_int("RATE_LIMIT_REFRESH_PER_HOUR", 6),
        3600,
    ),
}
_RATE_LIMIT_SALT = (
    os.getenv("RATE_LIMIT_SALT")
    or os.getenv("REDIS_URL")
    or secrets.token_hex(32)
)


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


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
    build_commit: str | None = None


class DataSourceHealth(BaseModel):
    name: str
    status: str
    purpose: str
    timeout_seconds: int | None = None
    note: str | None = None
    circuit: str | None = None
    circuit_failures: int | None = None
    circuit_retry_after_seconds: float | None = None


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


class CacheStatusResponse(BaseModel):
    status: str
    backend: str
    redis_configured: bool
    redis_available: bool
    fallback_backend: str
    last_error: str | None = None
    retry_after_seconds: float


class CompanionVideoRequest(BaseModel):
    url: str | None = None
    title: str | None = None
    year: int | str | None = None
    raceName: str | None = None
    track: str | None = None
    currentTime: float | None = None
    duration: float | None = None
    chapter: str | None = None
    mode: str | None = None


class CompanionNoteRequest(CompanionVideoRequest):
    analysis: dict[str, Any] | None = None
    liveState: dict[str, Any] | None = None


def _payload_dict(payload: BaseModel) -> dict[str, Any]:
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_none=True)
    return payload.dict(exclude_none=True)


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


def _use_prebuilt_index_if_available() -> bool:
    """Skip full startup indexing when the deployed image already ships race data."""
    if _env_flag("FORCE_STARTUP_INDEX"):
        return False

    indexed = indexer.list_indexed()
    if len(indexed) < PREBUILT_INDEX_MIN_RACES:
        return False

    years = sorted({race["year"] for race in indexed})
    _indexing_status["running"] = False
    _indexing_status["current_year"] = None
    _indexing_status["completed_years"] = years
    _indexing_status["total_indexed"] = 0
    _indexing_status["total_skipped"] = len(indexed)
    _indexing_status["total_failed"] = 0

    counts = Counter(race["year"] for race in indexed)
    logger.info(
        "Using prebuilt race index: %d races across %d seasons (%s)",
        len(indexed),
        len(years),
        ", ".join(f"{year}:{counts[year]}" for year in years[-5:]),
    )
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    await cache.start_runtime_cache()
    try:
        await http_client.start_upstream_client()
        # Startup: use the shipped index when available, otherwise build it in the background.
        if _use_prebuilt_index_if_available():
            thread = threading.Thread(target=_periodic_current_season_check, daemon=True)
        else:
            thread = threading.Thread(target=_background_index_all, daemon=True)
        thread.start()
        await live_feed.start_feed()
        yield
    finally:
        await live_feed.stop_feed()
        await http_client.stop_upstream_client()
        await cache.stop_runtime_cache()


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


def _rate_limit_policy(method: str, path: str) -> tuple[str, int, int] | None:
    if method.upper() != "POST":
        return None
    if path == "/companion/note":
        limit, window = _RATE_LIMIT_POLICIES["companion-note"]
        return "companion-note", limit, window
    if path == "/companion/analyze-video":
        limit, window = _RATE_LIMIT_POLICIES["companion-analysis"]
        return "companion-analysis", limit, window
    if path.startswith("/refresh/"):
        limit, window = _RATE_LIMIT_POLICIES["refresh"]
        return "refresh", limit, window
    if path.endswith("/simulate") or path.endswith("/simulate-swap"):
        limit, window = _RATE_LIMIT_POLICIES["simulation"]
        return "simulation", limit, window
    return None


def _rate_limit_identifier(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").rsplit(",", 1)[-1].strip()
    address = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-real-ip")
        or forwarded
        or (request.client.host if request.client else "unknown")
    )
    digest = hashlib.sha256(f"{_RATE_LIMIT_SALT}:{address[:256]}".encode("utf-8"))
    return digest.hexdigest()[:24]


@app.middleware("http")
async def targeted_rate_limit(request: Request, call_next):
    policy = _rate_limit_policy(request.method, request.url.path)
    if policy is None:
        return await call_next(request)

    scope, limit, window_seconds = policy
    try:
        decision = await cache.rate_limiter.check(
            scope,
            _rate_limit_identifier(request),
            limit=limit,
            window_seconds=window_seconds,
        )
    except Exception as exc:
        logger.warning(
            "rate_limiter_failed_open",
            extra={"scope": scope, "error_type": type(exc).__name__},
        )
        return await call_next(request)

    headers = {
        "X-RateLimit-Limit": str(decision.limit),
        "X-RateLimit-Remaining": str(decision.remaining),
    }
    if not decision.allowed:
        headers["Retry-After"] = str(decision.retry_after_seconds)
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again shortly."},
            headers=headers,
        )

    response = await call_next(request)
    response.headers.update(headers)
    return response


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
        "build_commit": os.getenv("RENDER_GIT_COMMIT"),
    }


@app.get("/health/data-sources", response_model=list[DataSourceHealth])
def data_source_health():
    live_status = live_feed.get_live_status()
    circuit_status = http_client.circuit_breakers.snapshot()

    def breaker_fields(source: str) -> dict:
        snapshot = circuit_status.get(source, {})
        if not snapshot:
            return {}
        return {
            "circuit": snapshot["state"],
            "circuit_failures": snapshot["failure_count"],
            "circuit_retry_after_seconds": snapshot["retry_after_seconds"],
        }

    def source_status(source: str, default: str = "configured") -> str:
        snapshot = circuit_status.get(source, {})
        if snapshot.get("state") in {"open", "half_open"}:
            return "degraded"
        return default

    openf1_status = source_status("openf1")
    if live_status.get("status") in {"error", "degraded"}:
        openf1_status = "degraded"

    ai_configured = bool(os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY"))
    return [
        {
            "name": "FastF1",
            "status": "configured",
            "purpose": "Historical timing, lap, session, tyre, and race data",
            "note": "Loaded through local cache/indexing jobs",
        },
        {
            "name": "Jolpica",
            "status": source_status("jolpica"),
            "purpose": "Historical schedules and results fallback",
            "timeout_seconds": 15,
            **breaker_fields("jolpica"),
        },
        {
            "name": "OpenMeteo",
            "status": source_status("openmeteo"),
            "purpose": "Weather context for race conditions",
            "timeout_seconds": 15,
            **breaker_fields("openmeteo"),
        },
        {
            "name": "OpenF1",
            "status": openf1_status,
            "purpose": "Live session, timing, stint, and driver data",
            "timeout_seconds": live_feed.OPENF1_TIMEOUT_SECONDS,
            "note": live_status.get("last_error"),
            **breaker_fields("openf1"),
        },
        {
            "name": "Companion AI",
            "status": source_status("ai", "configured" if ai_configured else "optional"),
            "purpose": "Optional beginner-language refinement for companion notes",
            "timeout_seconds": 10,
            "note": None if ai_configured else "Deterministic companion notes remain available",
            **breaker_fields("ai"),
        },
    ]


@app.get("/health/cache", response_model=CacheStatusResponse)
def cache_health():
    return cache.runtime_cache.status()


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


@app.get("/live/demo")
def live_demo_snapshot(index: int = 0):
    """Get a saved live snapshot so demos work outside race weekends."""
    return live_demo.get_demo_snapshot(index)


@app.get("/live/status", response_model=LiveStatusResponse)
def live_feed_status():
    return live_feed.get_live_status()


@app.post("/companion/analyze-video")
def companion_analyze_video(payload: CompanionVideoRequest):
    """
    Identify a replay/live video and prepare a reusable RaceDay companion timeline.
    """
    try:
        return companion.analyze_video_context(_payload_dict(payload))
    except Exception as exc:
        logger.exception("companion_analyze_video_failed")
        raise HTTPException(status_code=500, detail=f"Companion analysis failed: {exc}")


@app.post("/companion/note")
async def companion_note(payload: CompanionNoteRequest):
    """
    Return the current short RaceDay companion note for a replay or live session.
    """
    try:
        data = _payload_dict(payload)
        analysis = data.get("analysis")
        live_state = data.get("liveState")
        if data.get("mode") == "live" and live_state is None:
            live_state = live_feed.get_live_state()
        return await companion.build_companion_note_with_ai(
            data,
            analysis=analysis,
            live_state=live_state,
        )
    except Exception as exc:
        logger.exception("companion_note_failed")
        raise HTTPException(status_code=500, detail=f"Companion note failed: {exc}")


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


@app.websocket("/ws/live/demo")
async def websocket_live_demo(ws: WebSocket):
    """Replay saved live snapshots over WebSocket for demo mode."""
    await ws.accept()

    index = 0
    try:
        while True:
            await ws.send_json(live_demo.get_demo_snapshot(index))
            index += 1
            await asyncio.sleep(3.5)
    except WebSocketDisconnect:
        pass


@app.get("/indexing/status", response_model=IndexingStatusResponse)
def indexing_status():
    return _indexing_status


@app.get("/storage/status", response_model=StorageStatusResponse)
def storage_status():
    return storage.storage_status()


@app.get("/seasons/summary")
async def all_season_summaries():
    try:
        cached = await cache.runtime_cache.get_json(
            SEASON_SUMMARY_CACHE_KEY,
            memory_ttl_seconds=SEASON_SUMMARY_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        cached = None
        logger.warning(
            "season_summary_cache_read_failed",
            extra={"error_type": type(exc).__name__},
        )
    if isinstance(cached, list):
        return cached

    summaries = await asyncio.to_thread(insights.get_all_season_summaries)
    try:
        await cache.runtime_cache.set_json(
            SEASON_SUMMARY_CACHE_KEY,
            summaries,
            SEASON_SUMMARY_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning(
            "season_summary_cache_write_failed",
            extra={"error_type": type(exc).__name__},
        )
    return summaries


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
