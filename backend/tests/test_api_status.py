import httpx
import pytest

from backend import api


def test_health_response_reports_backend_status():
    response = api.health()

    assert response["status"] == "ok"
    assert response["service"] == "raceday-backend"
    assert isinstance(response["current_year"], int)
    assert response["indexing_running"] in (True, False)


def test_cors_origins_include_production_frontend(monkeypatch):
    monkeypatch.setenv("FRONTEND_URLS", "https://portfolio.example, https://raceday.example")

    origins = api._cors_origins()

    assert "https://raceday-khaki.vercel.app" in origins
    assert "https://portfolio.example" in origins
    assert "https://raceday.example" in origins


def test_data_source_health_includes_live_source():
    response = api.data_source_health()
    names = {source["name"] for source in response}

    assert {"FastF1", "Jolpica", "OpenMeteo", "OpenF1"}.issubset(names)


def test_data_source_health_exposes_circuit_state():
    response = api.data_source_health()
    sources = {source["name"]: source for source in response}

    assert sources["OpenF1"]["circuit"] == "closed"
    assert sources["Jolpica"]["circuit"] == "closed"
    assert sources["OpenMeteo"]["circuit"] == "closed"
    assert sources["Companion AI"]["circuit"] == "closed"


def test_open_circuit_marks_source_as_degraded(monkeypatch):
    monkeypatch.setattr(
        api.http_client.circuit_breakers,
        "snapshot",
        lambda: {
            "openf1": {
                "state": "open",
                "failure_count": 4,
                "retry_after_seconds": 12.5,
            }
        },
    )
    monkeypatch.setattr(
        api.live_feed,
        "get_live_status",
        lambda: {"status": "idle", "last_error": None},
    )

    sources = {source["name"]: source for source in api.data_source_health()}
    openf1 = sources["OpenF1"]

    assert openf1["status"] == "degraded"
    assert openf1["circuit"] == "open"
    assert openf1["circuit_failures"] == 4
    assert openf1["circuit_retry_after_seconds"] == 12.5


def test_partial_live_data_marks_openf1_as_degraded(monkeypatch):
    monkeypatch.setattr(
        api.live_feed,
        "get_live_status",
        lambda: {"status": "degraded", "last_error": "Partial OpenF1 data: stints"},
    )

    sources = {source["name"]: source for source in api.data_source_health()}

    assert sources["OpenF1"]["status"] == "degraded"
    assert sources["OpenF1"]["note"] == "Partial OpenF1 data: stints"


def test_live_demo_endpoint_returns_active_snapshot():
    response = api.live_demo_snapshot()

    assert response["active"] is True
    assert response["session"] == "Demo Grand Prix"
    assert response["drivers"]


def test_storage_status_route_reports_active_store():
    response = api.storage_status()

    assert response["active_store"] == "json"
    assert response["backend"] in {"json", "postgres"}
    assert response["event_store"]["status"] in {
        "disabled",
        "misconfigured",
        "degraded",
        "available",
    }


def test_event_store_health_reports_operational_status(monkeypatch):
    expected = {
        "status": "degraded",
        "enabled": True,
        "database_configured": True,
        "database_available": False,
        "worker_running": True,
        "queue_depth": 2,
        "queue_capacity": 500,
        "written_events": 10,
        "failed_writes": 1,
        "dropped_events": 3,
        "invalid_events": 0,
        "last_error": "ConnectionError",
        "retry_after_seconds": 12.0,
    }
    monkeypatch.setattr(api.event_store.service_events, "status", lambda: expected)

    assert api.event_store_health() == expected


def test_cache_health_reports_memory_fallback(monkeypatch):
    monkeypatch.setattr(
        api.cache.runtime_cache,
        "status",
        lambda: {
            "status": "degraded",
            "backend": "memory",
            "redis_configured": True,
            "redis_available": False,
            "fallback_backend": "memory",
            "last_error": "ConnectionError",
            "retry_after_seconds": 12.0,
        },
    )

    response = api.cache_health()

    assert response["status"] == "degraded"
    assert response["backend"] == "memory"
    assert response["redis_configured"] is True
    assert response["redis_available"] is False


@pytest.mark.asyncio
async def test_season_summary_uses_runtime_cache(monkeypatch):
    await api.cache.runtime_cache.clear_memory()
    calls = 0

    def build_summaries():
        nonlocal calls
        calls += 1
        return [{"year": 2026, "races": 10}]

    monkeypatch.setattr(api.insights, "get_all_season_summaries", build_summaries)

    first = await api.all_season_summaries()
    second = await api.all_season_summaries()

    assert first == second == [{"year": 2026, "races": 10}]
    assert calls == 1


@pytest.mark.asyncio
async def test_season_summary_survives_cache_failure(monkeypatch):
    class FailedCache:
        async def get_json(self, *args, **kwargs):
            raise ConnectionError("cache unavailable")

        async def set_json(self, *args, **kwargs):
            raise ConnectionError("cache unavailable")

    monkeypatch.setattr(api.cache, "runtime_cache", FailedCache())
    monkeypatch.setattr(
        api.insights,
        "get_all_season_summaries",
        lambda: [{"year": 2025, "races": 24}],
    )

    response = await api.all_season_summaries()

    assert response == [{"year": 2025, "races": 24}]


@pytest.mark.asyncio
async def test_expensive_route_is_rate_limited_without_affecting_response_contract(monkeypatch):
    await api.cache.runtime_cache.clear_memory()
    monkeypatch.setitem(api._RATE_LIMIT_POLICIES, "companion-note", (1, 60))

    async def build_note(*args, **kwargs):
        return {
            "ok": True,
            "mode": "replay",
            "headline": "The pit timing matters now.",
            "notes": ["Fresh tyres help only if the driver avoids traffic."],
            "source": "race-context",
        }

    monkeypatch.setattr(api.companion, "build_companion_note_with_ai", build_note)
    transport = httpx.ASGITransport(app=api.app)
    payload = {
        "title": "Race Highlights | 2026 Canadian Grand Prix",
        "year": 2026,
        "raceName": "Canadian Grand Prix",
        "mode": "replay",
    }
    headers = {"x-forwarded-for": "198.51.100.42"}

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/companion/note", json=payload, headers=headers)
        blocked = await client.post("/companion/note", json=payload, headers=headers)

    assert first.status_code == 200
    assert first.json()["headline"] == "The pit timing matters now."
    assert first.headers["x-ratelimit-remaining"] == "0"
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"]
    assert blocked.json() == {"detail": "Too many requests. Please try again shortly."}


@pytest.mark.asyncio
async def test_rate_limiter_failure_does_not_block_companion(monkeypatch):
    class FailedLimiter:
        async def check(self, *args, **kwargs):
            raise ConnectionError("limiter unavailable")

    async def build_note(*args, **kwargs):
        return {
            "ok": True,
            "mode": "replay",
            "headline": "RaceDay stays available.",
            "notes": ["The fallback keeps this explanation working."],
            "source": "race-context",
        }

    monkeypatch.setattr(api.cache, "rate_limiter", FailedLimiter())
    monkeypatch.setattr(api.companion, "build_companion_note_with_ai", build_note)
    transport = httpx.ASGITransport(app=api.app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/companion/note",
            json={"raceName": "Canadian Grand Prix", "mode": "replay"},
            headers={"x-forwarded-for": "203.0.113.9"},
        )

    assert response.status_code == 200
    assert response.json()["headline"] == "RaceDay stays available."


def test_rate_limit_identifier_does_not_expose_client_address():
    request = api.Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/companion/note",
            "headers": [(b"x-forwarded-for", b"198.51.100.24")],
            "client": ("127.0.0.1", 1234),
            "server": ("test", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )

    identifier = api._rate_limit_identifier(request)

    assert len(identifier) == 24
    assert "198.51.100.24" not in identifier


def test_empty_race_response_returns_indexed_fallback(monkeypatch):
    monkeypatch.setattr(api.insights, "get_season_races", lambda year: None)
    monkeypatch.setattr(
        api.insights,
        "get_indexed_season_races",
        lambda year: [{"year": year, "track": "Stable Grand Prix"}],
    )

    response = api.season_races(2035)

    assert response == [{"year": 2035, "track": "Stable Grand Prix"}]
