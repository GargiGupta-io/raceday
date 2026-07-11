import asyncio
import json

import httpx
import pytest

from backend import api
from backend.core import cache, companion, companion_ai, event_store, http_client, live_feed
from backend.core.event_store import ServiceEventStore


BASE_NOTE = {
    "ok": True,
    "mode": "replay",
    "headline": "The next stop could decide this fight.",
    "notes": ["Fresh tyres help only if the driver rejoins away from traffic."],
    "source": "race-context",
}


class NullRuntimeCache:
    async def get_json(self, key, **kwargs):
        return None

    async def set_json(self, key, value, ttl_seconds):
        return None

    async def delete(self, key, **kwargs):
        return None


class AllowAllLimiter:
    async def check(self, scope, identifier, *, limit, window_seconds):
        return cache.RateLimitDecision(
            allowed=True,
            limit=limit,
            remaining=max(0, limit - 1),
            retry_after_seconds=0,
        )


class FailingRedis:
    def __init__(self):
        self.closed = False

    async def ping(self):
        raise ConnectionError("redis unavailable")

    async def aclose(self):
        self.closed = True


class FakeThread:
    def __init__(self):
        self.started = False

    def start(self):
        self.started = True


async def _no_op():
    return None


async def _skip_sleep(delay):
    return None


async def _run_websocket_session(path: str) -> list[dict]:
    incoming = iter(
        [
            {"type": "websocket.connect"},
            {"type": "websocket.disconnect", "code": 1000},
        ]
    )
    outgoing = []

    async def receive():
        return next(incoming)

    async def send(message):
        outgoing.append(message)

    await api.app(
        {
            "type": "websocket",
            "asgi": {"version": "3.0", "spec_version": "2.4"},
            "http_version": "1.1",
            "scheme": "ws",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "root_path": "",
            "headers": [],
            "client": ("test", 50000),
            "server": ("test", 80),
            "subprotocols": [],
            "state": {},
        },
        receive,
        send,
    )
    return outgoing


@pytest.mark.asyncio
async def test_openf1_timeout_preserves_last_state_through_live_api(monkeypatch):
    attempts = 0
    events = []
    last_state = {
        "session": "2026 Canadian Grand Prix",
        "lap": 25,
        "totalLaps": 70,
        "drivers": [],
    }

    def record_event(**event):
        events.append(event)
        return True

    def timeout_handler(request):
        nonlocal attempts
        attempts += 1
        raise httpx.ReadTimeout("OpenF1 timed out", request=request)

    monkeypatch.setattr(live_feed.cache, "runtime_cache", NullRuntimeCache())
    monkeypatch.setattr(event_store, "record_service_event", record_event)
    monkeypatch.setattr(live_feed, "_live_state", last_state)
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "live")

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(timeout_handler)
    ) as raw_client:
        protected_client = http_client.AsyncUpstreamClient(
            raw_client,
            sleep=_skip_sleep,
            jitter=lambda: 0.0,
            event_recorder=record_event,
        )
        monkeypatch.setattr(http_client, "upstream_client", protected_client)

        assert await live_feed._openf1_get("sessions") is None

        transport = httpx.ASGITransport(app=api.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            live_response = await client.get("/live")
            status_response = await client.get("/live/status")

    assert attempts == http_client.SOURCE_POLICIES["openf1"].max_attempts
    assert live_response.status_code == 200
    assert live_response.json() == {"active": True, **last_state}
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "degraded"
    assert any(event["event_type"] == "upstream_request" for event in events)
    assert any(
        event["event_type"] == "fallback" and event["fallback_used"] is True
        for event in events
    )


@pytest.mark.asyncio
async def test_ai_timeout_returns_deterministic_note_from_api(monkeypatch):
    attempts = 0
    events = []

    def record_event(**event):
        events.append(event)
        return True

    def timeout_handler(request):
        nonlocal attempts
        attempts += 1
        raise httpx.ReadTimeout("AI provider timed out", request=request)

    monkeypatch.setattr(companion, "build_companion_note", lambda *args: BASE_NOTE)
    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "test-openai-key")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")
    monkeypatch.setattr(companion_ai.cache, "runtime_cache", NullRuntimeCache())
    monkeypatch.setattr(event_store, "record_service_event", record_event)
    monkeypatch.setattr(cache, "rate_limiter", AllowAllLimiter())

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(timeout_handler)
    ) as raw_client:
        protected_client = http_client.AsyncUpstreamClient(
            raw_client,
            sleep=_skip_sleep,
            jitter=lambda: 0.0,
            event_recorder=record_event,
        )
        monkeypatch.setattr(http_client, "upstream_client", protected_client)

        transport = httpx.ASGITransport(app=api.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/companion/note",
                json={
                    "mode": "replay",
                    "raceName": "Canadian Grand Prix",
                    "currentTime": 120,
                    "duration": 480,
                },
            )

    assert attempts == http_client.SOURCE_POLICIES["ai"].max_attempts
    assert response.status_code == 200
    assert response.json()["headline"] == BASE_NOTE["headline"]
    assert response.json()["notes"] == BASE_NOTE["notes"]
    assert response.json()["source"] == "race-context"
    assert any(
        event["event_type"] == "fallback" and event["source"] == "ai"
        for event in events
    )


@pytest.mark.asyncio
async def test_duplicate_companion_requests_reuse_ai_result(monkeypatch):
    provider_calls = 0
    runtime_cache = cache.RuntimeCache()
    await runtime_cache.start(redis_url="")

    def provider_handler(request):
        nonlocal provider_calls
        provider_calls += 1
        return httpx.Response(
            200,
            request=request,
            json={
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"headline":"Traffic decides this stop.",'
                                '"notes":["Fresh tyres matter only with clear road ahead."]}'
                            )
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(companion, "build_companion_note", lambda *args: BASE_NOTE)
    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "test-openai-key")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")
    monkeypatch.setattr(companion_ai.cache, "runtime_cache", runtime_cache)
    monkeypatch.setattr(cache, "rate_limiter", AllowAllLimiter())

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(provider_handler)
    ) as raw_client:
        protected_client = http_client.AsyncUpstreamClient(raw_client)
        monkeypatch.setattr(http_client, "upstream_client", protected_client)
        transport = httpx.ASGITransport(app=api.app)
        payload = {
            "mode": "replay",
            "raceName": "Canadian Grand Prix",
            "currentTime": 120,
            "duration": 480,
        }

        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            first = await client.post("/companion/note", json=payload)
            second = await client.post("/companion/note", json=payload)

    await runtime_cache.close()

    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["source"] == "ai-explainer"
    assert provider_calls == 1


@pytest.mark.asyncio
async def test_redis_outage_keeps_season_summary_route_available(monkeypatch):
    redis = FailingRedis()
    runtime_cache = cache.RuntimeCache(redis_factory=lambda url: redis)
    await runtime_cache.start(redis_url="redis://cache.test")

    monkeypatch.setattr(cache, "runtime_cache", runtime_cache)
    monkeypatch.setattr(
        api.insights,
        "get_all_season_summaries",
        lambda: [{"year": 2026, "races": 24}],
    )

    transport = httpx.ASGITransport(app=api.app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        summary_response = await client.get("/seasons/summary")
        cache_response = await client.get("/health/cache")

    await runtime_cache.close()

    assert summary_response.status_code == 200
    assert summary_response.json() == [{"year": 2026, "races": 24}]
    assert cache_response.status_code == 200
    assert cache_response.json()["status"] == "degraded"
    assert cache_response.json()["backend"] == "memory"
    assert redis.closed is True


@pytest.mark.asyncio
async def test_postgres_startup_outage_does_not_block_fastapi(monkeypatch):
    async def failed_pool_factory(database_url):
        raise ConnectionError("postgres unavailable")

    store = ServiceEventStore(
        pool_factory=failed_pool_factory,
        retry_seconds=1,
        migration_sql="CREATE TABLE service_events (id int)",
    )

    monkeypatch.setenv("RELIABILITY_EVENTS_ENABLED", "true")
    monkeypatch.setenv("DATABASE_URL", "postgresql://events.test/raceday")
    monkeypatch.setattr(event_store, "service_events", store)
    monkeypatch.setattr(api.cache, "start_runtime_cache", _no_op)
    monkeypatch.setattr(api.cache, "stop_runtime_cache", _no_op)
    monkeypatch.setattr(api.http_client, "start_upstream_client", _no_op)
    monkeypatch.setattr(api.http_client, "stop_upstream_client", _no_op)
    monkeypatch.setattr(api.live_feed, "start_feed", _no_op)
    monkeypatch.setattr(api.live_feed, "stop_feed", _no_op)
    monkeypatch.setattr(api, "_use_prebuilt_index_if_available", lambda: True)
    monkeypatch.setattr(api.threading, "Thread", lambda **kwargs: FakeThread())

    async with api.lifespan(api.app):
        transport = httpx.ASGITransport(app=api.app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            health_response = await client.get("/health")
            events_response = await client.get("/health/events")

        assert health_response.status_code == 200
        assert health_response.json()["status"] == "ok"
        assert events_response.status_code == 200
        assert events_response.json()["status"] == "degraded"
        assert events_response.json()["worker_running"] is True
        assert events_response.json()["last_error"] == "ConnectionError"

    assert store.status()["worker_running"] is False


@pytest.mark.asyncio
async def test_live_shutdown_cancels_inflight_openf1_request(monkeypatch):
    request_started = asyncio.Event()
    request_cancelled = asyncio.Event()

    async def waiting_handler(request):
        request_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            request_cancelled.set()
            raise

    monkeypatch.setattr(live_feed.cache, "runtime_cache", NullRuntimeCache())
    monkeypatch.setattr(live_feed, "_feed_task", None)
    monkeypatch.setattr(live_feed, "_feed_running", False)
    monkeypatch.setattr(live_feed, "_live_state", None)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(waiting_handler)
    ) as raw_client:
        protected_client = http_client.AsyncUpstreamClient(raw_client)
        monkeypatch.setattr(http_client, "upstream_client", protected_client)

        await live_feed.start_feed()
        await asyncio.wait_for(request_started.wait(), timeout=1)
        await asyncio.wait_for(live_feed.stop_feed(), timeout=1)

    assert request_cancelled.is_set()
    assert live_feed._feed_task is None
    assert live_feed._feed_running is False


@pytest.mark.asyncio
async def test_websocket_endpoint_accepts_a_clean_reconnection(monkeypatch):
    monkeypatch.setattr(live_feed, "_clients", set())
    monkeypatch.setattr(
        live_feed,
        "_live_state",
        {"session": "2026 Canadian Grand Prix", "lap": 25},
    )

    first_messages = await _run_websocket_session("/ws/live")
    first_snapshot = next(
        message for message in first_messages if message["type"] == "websocket.send"
    )
    assert json.loads(first_snapshot["text"])["lap"] == 25
    assert live_feed._clients == set()

    live_feed._live_state = {
        "session": "2026 Canadian Grand Prix",
        "lap": 26,
    }
    recovered_messages = await _run_websocket_session("/ws/live")
    recovered_snapshot = next(
        message for message in recovered_messages if message["type"] == "websocket.send"
    )

    assert json.loads(recovered_snapshot["text"])["lap"] == 26
    assert live_feed._clients == set()
