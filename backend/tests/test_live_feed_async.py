import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from backend.core import event_store, http_client, live_feed


class FakeRuntimeCache:
    def __init__(self):
        self.values = {}
        self.set_calls = []
        self.deleted = []

    async def get_json(self, key, **kwargs):
        return self.values.get(key)

    async def set_json(self, key, value, ttl_seconds):
        self.values[key] = value
        self.set_calls.append((key, value, ttl_seconds))

    async def delete(self, key):
        self.values.pop(key, None)
        self.deleted.append(key)


@pytest.mark.asyncio
async def test_openf1_requests_use_the_protected_client(monkeypatch):
    captured = {}

    async def request_json(method, url, **kwargs):
        captured.update({"method": method, "url": url, **kwargs})
        return [{"session_key": 123}]

    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "idle")
    monkeypatch.setattr(live_feed, "_live_state", None)

    result = await live_feed._openf1_get("sessions", {"year": 2026})

    assert result == [{"session_key": 123}]
    assert captured["source"] == "openf1"
    assert captured["operation"] == "sessions"
    assert captured["params"] == {"year": 2026}


@pytest.mark.asyncio
async def test_openf1_response_cache_avoids_duplicate_source_calls(monkeypatch):
    calls = 0
    fake_cache = FakeRuntimeCache()

    async def request_json(*args, **kwargs):
        nonlocal calls
        calls += 1
        return [{"session_key": 456}]

    monkeypatch.setattr(live_feed.cache, "runtime_cache", fake_cache)
    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "idle")

    first = await live_feed._openf1_get("sessions", {"year": 2031})
    second = await live_feed._openf1_get("sessions", {"year": 2031})

    assert first == second == [{"session_key": 456}]
    assert calls == 1
    assert fake_cache.set_calls[0][2] == live_feed.OPENF1_RESPONSE_CACHE_TTL_SECONDS


@pytest.mark.asyncio
async def test_openf1_failure_sets_degraded_live_status(monkeypatch):
    async def request_json(*args, **kwargs):
        raise http_client.UpstreamRequestError(
            "openf1",
            "sessions",
            attempts=3,
            retryable=True,
            reason="timeout",
        )

    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "idle")
    monkeypatch.setattr(live_feed, "_live_state", None)

    result = await live_feed._openf1_get("sessions")

    assert result is None
    assert live_feed.get_live_status()["status"] == "error"
    assert live_feed.get_live_status()["last_error"] == "timeout"


@pytest.mark.asyncio
async def test_openf1_failure_records_last_live_state_fallback(monkeypatch):
    events = []

    async def request_json(*args, **kwargs):
        raise http_client.UpstreamRequestError(
            "openf1",
            "position",
            attempts=2,
            retryable=True,
            reason="timeout",
            status_code=503,
        )

    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)
    monkeypatch.setattr(live_feed, "_live_state", {"lap": 25})
    monkeypatch.setattr(
        event_store,
        "record_service_event",
        lambda **event: events.append(event) or True,
    )

    assert await live_feed._openf1_get("position") is None
    assert events == [
        {
            "event_type": "fallback",
            "source": "openf1",
            "outcome": "used",
            "status_code": 503,
            "fallback_used": True,
            "error_code": "timeout",
            "context": {"endpoint": "position", "attempts": 2},
        }
    ]


@pytest.mark.asyncio
async def test_event_recorder_failure_does_not_break_openf1_fallback(monkeypatch):
    async def request_json(*args, **kwargs):
        raise http_client.UpstreamRequestError(
            "openf1",
            "sessions",
            attempts=1,
            retryable=True,
            reason="timeout",
        )

    def failed_recorder(**event):
        raise RuntimeError("event queue unavailable")

    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)
    monkeypatch.setattr(event_store, "record_service_event", failed_recorder)
    monkeypatch.setattr(live_feed, "_live_state", None)

    assert await live_feed._openf1_get("sessions") is None


@pytest.mark.asyncio
async def test_live_snapshot_fetches_independent_resources_concurrently(monkeypatch):
    started = set()
    all_started = asyncio.Event()

    async def resource(name, value):
        started.add(name)
        if len(started) == 4:
            all_started.set()
        await all_started.wait()
        return value

    monkeypatch.setattr(
        live_feed,
        "_fetch_drivers",
        lambda session_key: resource(
            "drivers",
            {
                1: {
                    "code": "NOR",
                    "name": "Lando Norris",
                    "team": "McLaren",
                    "team_colour": "ff0000",
                }
            },
        ),
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_positions",
        lambda session_key: resource(
            "positions",
            [{"driver_number": 1, "position": 1}],
        ),
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_stints",
        lambda session_key: resource(
            "stints",
            {
                1: {
                    "compound": "MEDIUM",
                    "lap_start": 1,
                    "lap_end": 12,
                    "stint_number": 1,
                }
            },
        ),
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_lap_count",
        lambda session_key: resource(
            "lap-count",
            {"current": 12, "total": 70},
        ),
    )
    monkeypatch.setattr(live_feed, "_generate_pattern_alerts", lambda *args: [])
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "idle")

    state = await live_feed._build_live_state(
        {
            "session_key": 123,
            "year": 2026,
            "location": "Montréal",
            "country_name": "Canada",
        }
    )

    assert started == {"drivers", "positions", "stints", "lap-count"}
    assert state["lap"] == 12
    assert state["drivers"][0]["code"] == "NOR"


@pytest.mark.asyncio
async def test_partial_live_snapshot_is_marked_degraded(monkeypatch):
    async def no_drivers(session_key):
        return {}

    async def positions(session_key):
        return [{"driver_number": 1, "position": 1}]

    async def no_stints(session_key):
        return {}

    async def lap_count(session_key):
        return {"current": 12, "total": 70}

    monkeypatch.setattr(live_feed, "_fetch_drivers", no_drivers)
    monkeypatch.setattr(live_feed, "_fetch_positions", positions)
    monkeypatch.setattr(live_feed, "_fetch_stints", no_stints)
    monkeypatch.setattr(live_feed, "_fetch_lap_count", lap_count)
    monkeypatch.setattr(live_feed, "_generate_pattern_alerts", lambda *args: [])
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "idle")

    state = await live_feed._build_live_state(
        {
            "session_key": 123,
            "year": 2026,
            "location": "Montréal",
            "country_name": "Canada",
        }
    )

    assert state is not None
    assert live_feed._last_source_status == "degraded"
    assert live_feed._last_error == "Partial OpenF1 data: drivers, stints"


@pytest.mark.asyncio
async def test_finished_session_broadcasts_inactive_state(monkeypatch):
    messages = []
    fake_cache = FakeRuntimeCache()

    async def broadcast(payload):
        messages.append(payload)

    monkeypatch.setattr(live_feed, "_live_state", {"session": "Canadian Grand Prix"})
    monkeypatch.setattr(live_feed, "_broadcast", broadcast)
    monkeypatch.setattr(live_feed.cache, "runtime_cache", fake_cache)

    await live_feed._publish_no_live_session()

    assert live_feed._live_state is None
    assert messages == [{"active": False, "session": None}]
    assert fake_cache.deleted == [live_feed.LIVE_STATE_CACHE_KEY]


@pytest.mark.asyncio
async def test_live_snapshot_is_timestamped_cached_and_broadcast(monkeypatch):
    messages = []
    fake_cache = FakeRuntimeCache()

    async def broadcast(payload):
        messages.append(payload)

    monkeypatch.setattr(live_feed.cache, "runtime_cache", fake_cache)
    monkeypatch.setattr(live_feed, "_broadcast", broadcast)
    monkeypatch.setattr(live_feed, "_last_error", None)

    await live_feed._publish_live_state(
        {"session": "2026 Canadian Grand Prix", "lap": 25, "drivers": []}
    )

    assert live_feed._live_state["capturedAt"]
    assert live_feed._last_source_status == "live"
    assert messages == [live_feed._live_state]
    cached = fake_cache.values[live_feed.LIVE_STATE_CACHE_KEY]
    assert cached == {"active": True, **live_feed._live_state}
    assert fake_cache.set_calls[0][2] == live_feed.LIVE_STATE_CACHE_TTL_SECONDS


@pytest.mark.asyncio
async def test_recent_cached_live_snapshot_is_restored_as_degraded(monkeypatch):
    fake_cache = FakeRuntimeCache()
    fake_cache.values[live_feed.LIVE_STATE_CACHE_KEY] = {
        "active": True,
        "session": "2026 Canadian Grand Prix",
        "lap": 26,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
    }
    monkeypatch.setattr(live_feed.cache, "runtime_cache", fake_cache)
    monkeypatch.setattr(live_feed, "_live_state", None)
    monkeypatch.setattr(live_feed, "_last_update_at", None)
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "idle")

    await live_feed._restore_cached_live_state()

    assert live_feed._live_state["lap"] == 26
    assert live_feed.get_live_status()["status"] == "degraded"
    assert "cached live snapshot" in live_feed.get_live_status()["last_error"]


@pytest.mark.asyncio
async def test_stale_cached_live_snapshot_is_not_restored(monkeypatch):
    fake_cache = FakeRuntimeCache()
    fake_cache.values[live_feed.LIVE_STATE_CACHE_KEY] = {
        "active": True,
        "session": "2026 Canadian Grand Prix",
        "lap": 20,
        "capturedAt": (
            datetime.now(timezone.utc)
            - timedelta(seconds=live_feed.LIVE_STATE_CACHE_TTL_SECONDS + 1)
        ).isoformat(),
    }
    monkeypatch.setattr(live_feed.cache, "runtime_cache", fake_cache)
    monkeypatch.setattr(live_feed, "_live_state", None)

    await live_feed._restore_cached_live_state()

    assert live_feed._live_state is None


@pytest.mark.asyncio
async def test_source_outage_preserves_last_known_live_state(monkeypatch):
    messages = []
    last_state = {"session": "Canadian Grand Prix", "lap": 25}

    async def broadcast(payload):
        messages.append(payload)

    monkeypatch.setattr(live_feed, "_live_state", last_state)
    monkeypatch.setattr(live_feed, "_last_source_status", "error")
    monkeypatch.setattr(live_feed, "_broadcast", broadcast)

    source_available = await live_feed._handle_missing_session()

    assert source_available is False
    assert live_feed._live_state == last_state
    assert messages == []


@pytest.mark.asyncio
async def test_broadcast_removes_failed_clients_without_blocking_healthy_ones():
    class HealthyClient:
        def __init__(self):
            self.messages = []

        async def send_json(self, payload):
            self.messages.append(payload)

    class FailedClient:
        async def send_json(self, payload):
            raise RuntimeError("connection closed")

    healthy = HealthyClient()
    failed = FailedClient()
    with live_feed._clients_lock:
        original_clients = set(live_feed._clients)
        live_feed._clients.clear()
        live_feed._clients.update({healthy, failed})

    try:
        await live_feed._broadcast({"lap": 25})

        assert healthy.messages == [{"lap": 25}]
        with live_feed._clients_lock:
            assert healthy in live_feed._clients
            assert failed not in live_feed._clients
    finally:
        with live_feed._clients_lock:
            live_feed._clients.clear()
            live_feed._clients.update(original_clients)


@pytest.mark.asyncio
async def test_live_feed_task_starts_once_and_stops_cleanly(monkeypatch):
    started = asyncio.Event()
    stopped = asyncio.Event()

    async def fake_feed_loop():
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            stopped.set()

    monkeypatch.setattr(live_feed, "_feed_loop", fake_feed_loop)
    monkeypatch.setattr(live_feed, "_feed_task", None)
    monkeypatch.setattr(live_feed, "_feed_running", False)

    await live_feed.start_feed()
    first_task = live_feed._feed_task
    await started.wait()

    await live_feed.start_feed()
    assert live_feed._feed_task is first_task

    await live_feed.stop_feed()

    assert stopped.is_set()
    assert live_feed._feed_task is None
    assert live_feed._feed_running is False
