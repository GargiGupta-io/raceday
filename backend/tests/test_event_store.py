import json

import pytest

from backend.core.event_store import ServiceEvent, ServiceEventStore


class FakeClock:
    def __init__(self, value: float = 0.0):
        self.value = value

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class FakePool:
    def __init__(self):
        self.executions = []
        self.fail_writes = False
        self.closed = False

    async def execute(self, query: str, *args):
        if query.startswith("INSERT") and self.fail_writes:
            raise ConnectionError("database write failed")
        self.executions.append((query, args))
        return "OK"

    async def close(self):
        self.closed = True


def test_service_event_sanitizes_context_and_sensitive_values():
    event = ServiceEvent.create(
        event_type="Upstream Request",
        source="OpenF1",
        outcome="HTTP Failure",
        duration_ms=125.6,
        status_code=503,
        fallback_used=True,
        error_code="Bearer secret-token",
        context={
            "operation": "sessions",
            "mode": "live",
            "year": 2026,
            "url": "https://provider.example/private",
            "headers": {"Authorization": "Bearer secret"},
            "transcript": "private radio text",
            "provider": "sk-private-key",
            "endpoint": "postgresql://user:password@host/raceday",
            "circuit": "operator@example.com",
        },
    )

    assert event.event_type == "upstream_request"
    assert event.source == "openf1"
    assert event.outcome == "http_failure"
    assert event.duration_ms == 126
    assert event.status_code == 503
    assert event.fallback_used is True
    assert event.error_code == "redacted"
    assert event.context == {
        "operation": "sessions",
        "mode": "live",
        "year": 2026,
    }


@pytest.mark.asyncio
async def test_event_store_is_disabled_without_explicit_opt_in():
    factory_calls = 0

    async def factory(database_url):
        nonlocal factory_calls
        factory_calls += 1
        return FakePool()

    store = ServiceEventStore(pool_factory=factory, migration_sql="CREATE TABLE test")
    await store.start(database_url="postgresql://configured", enabled=False)

    accepted = store.record(
        event_type="upstream_request",
        source="openf1",
        outcome="success",
    )

    assert accepted is False
    assert factory_calls == 0
    assert store.status()["status"] == "disabled"
    assert store.status()["database_configured"] is True


@pytest.mark.asyncio
async def test_enabled_event_store_requires_database_url():
    store = ServiceEventStore(migration_sql="CREATE TABLE test")

    await store.start(database_url="", enabled=True)

    assert store.status()["status"] == "misconfigured"
    assert store.status()["enabled"] is False
    assert store.record(
        event_type="upstream_request",
        source="openf1",
        outcome="failure",
    ) is False


@pytest.mark.asyncio
async def test_event_writer_migrates_and_persists_sanitized_event():
    pool = FakePool()

    async def factory(database_url):
        assert database_url == "postgresql://events"
        return pool

    store = ServiceEventStore(
        pool_factory=factory,
        migration_sql="CREATE TABLE service_events (id int)",
    )
    await store.start(database_url="postgresql://events", enabled=True)

    accepted = store.record(
        event_type="upstream_request",
        source="openf1",
        outcome="failure",
        duration_ms=250,
        status_code=503,
        fallback_used=True,
        error_code="timeout",
        context={"operation": "position", "attempts": 3, "url": "https://private"},
    )
    assert accepted is True
    assert await store.flush() is True

    assert pool.executions[0] == ("CREATE TABLE service_events (id int)", ())
    insert_query, insert_args = pool.executions[1]
    assert insert_query.startswith("INSERT INTO service_events")
    assert insert_args[:7] == (
        "upstream_request",
        "openf1",
        "failure",
        250,
        503,
        True,
        "timeout",
    )
    assert json.loads(insert_args[7]) == {"operation": "position", "attempts": 3}
    assert store.status()["written_events"] == 1
    assert store.status()["status"] == "available"

    await store.close()
    assert pool.closed is True


@pytest.mark.asyncio
async def test_full_queue_drops_oldest_event():
    pool = FakePool()

    async def factory(database_url):
        return pool

    store = ServiceEventStore(
        queue_size=2,
        pool_factory=factory,
        migration_sql="CREATE TABLE test",
    )
    await store.start(database_url="postgresql://events", enabled=True)

    for operation in ("oldest", "middle", "newest"):
        assert store.record(
            event_type="upstream_request",
            source="openf1",
            outcome="success",
            context={"operation": operation},
        ) is True

    assert store.status()["dropped_events"] == 1
    assert await store.flush() is True
    written_contexts = [json.loads(args[7]) for query, args in pool.executions if query.startswith("INSERT")]
    assert written_contexts == [
        {"operation": "middle"},
        {"operation": "newest"},
    ]

    await store.close()


@pytest.mark.asyncio
async def test_startup_failure_is_degraded_and_recovers_on_later_event():
    clock = FakeClock(10.0)
    pool = FakePool()
    fail_connection = True

    async def factory(database_url):
        if fail_connection:
            raise ConnectionError("database unavailable")
        return pool

    store = ServiceEventStore(
        pool_factory=factory,
        clock=clock,
        retry_seconds=5,
        migration_sql="CREATE TABLE test",
    )
    await store.start(database_url="postgresql://events", enabled=True)
    assert store.status()["status"] == "degraded"
    assert store.status()["last_error"] == "ConnectionError"

    assert store.record(
        event_type="upstream_request",
        source="openf1",
        outcome="failure",
    ) is True
    assert await store.flush() is True
    assert store.status()["dropped_events"] == 1

    fail_connection = False
    clock.advance(5)
    assert store.record(
        event_type="upstream_request",
        source="openf1",
        outcome="success",
    ) is True
    assert await store.flush() is True
    assert store.status()["status"] == "available"
    assert store.status()["written_events"] == 1

    await store.close()


@pytest.mark.asyncio
async def test_write_failure_does_not_escape_background_worker():
    clock = FakeClock(30.0)
    pools = []

    async def factory(database_url):
        pool = FakePool()
        pools.append(pool)
        return pool

    store = ServiceEventStore(
        pool_factory=factory,
        clock=clock,
        retry_seconds=5,
        migration_sql="CREATE TABLE test",
    )
    await store.start(database_url="postgresql://events", enabled=True)
    pools[0].fail_writes = True

    assert store.record(
        event_type="upstream_request",
        source="ai",
        outcome="failure",
    ) is True
    assert await store.flush() is True
    assert store.status()["failed_writes"] == 1
    assert store.status()["dropped_events"] == 1
    assert store.status()["status"] == "degraded"

    clock.advance(5)
    assert store.record(
        event_type="upstream_request",
        source="ai",
        outcome="success",
    ) is True
    assert await store.flush() is True
    assert len(pools) == 2
    assert store.status()["written_events"] == 1
    assert store.status()["status"] == "available"

    await store.close()


@pytest.mark.asyncio
async def test_invalid_event_is_dropped_without_raising():
    pool = FakePool()

    async def factory(database_url):
        return pool

    store = ServiceEventStore(
        pool_factory=factory,
        migration_sql="CREATE TABLE test",
    )
    await store.start(database_url="postgresql://events", enabled=True)

    accepted = store.record(
        event_type="upstream_request",
        source="openf1",
        outcome="failure",
        context=["not", "a", "mapping"],
    )

    assert accepted is False
    assert store.status()["invalid_events"] == 1
    await store.close()
