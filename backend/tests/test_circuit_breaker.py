import pytest

from backend.core.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerOpen,
    CircuitBreakerPolicy,
    CircuitBreakerRegistry,
)


class FakeClock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


@pytest.mark.asyncio
async def test_opens_after_failure_threshold():
    clock = FakeClock()
    breaker = CircuitBreaker(
        "openf1",
        CircuitBreakerPolicy(failure_threshold=2, recovery_timeout_seconds=10),
        clock=clock,
    )

    first = await breaker.acquire()
    await breaker.record_failure(first)
    assert breaker.snapshot()["state"] == "closed"
    assert breaker.snapshot()["failure_count"] == 1

    second = await breaker.acquire()
    await breaker.record_failure(second)

    snapshot = breaker.snapshot()
    assert snapshot["state"] == "open"
    assert snapshot["failure_count"] == 2
    assert snapshot["retry_after_seconds"] == 10

    with pytest.raises(CircuitBreakerOpen) as caught:
        await breaker.acquire()

    assert caught.value.retry_after_seconds == 10


@pytest.mark.asyncio
async def test_half_open_allows_only_one_recovery_probe():
    clock = FakeClock()
    breaker = CircuitBreaker(
        "openf1",
        CircuitBreakerPolicy(failure_threshold=1, recovery_timeout_seconds=5),
        clock=clock,
    )

    permit = await breaker.acquire()
    await breaker.record_failure(permit)
    clock.advance(5)

    probe = await breaker.acquire()
    assert probe.probe is True
    assert breaker.snapshot()["state"] == "half_open"

    with pytest.raises(CircuitBreakerOpen):
        await breaker.acquire()

    await breaker.record_success(probe)

    assert breaker.snapshot()["state"] == "closed"
    assert breaker.snapshot()["failure_count"] == 0


@pytest.mark.asyncio
async def test_failed_recovery_probe_reopens_with_a_fresh_cooldown():
    clock = FakeClock()
    breaker = CircuitBreaker(
        "ai",
        CircuitBreakerPolicy(failure_threshold=1, recovery_timeout_seconds=8),
        clock=clock,
    )

    permit = await breaker.acquire()
    await breaker.record_failure(permit)
    clock.advance(8)

    probe = await breaker.acquire()
    clock.advance(2)
    await breaker.record_failure(probe)

    snapshot = breaker.snapshot()
    assert snapshot["state"] == "open"
    assert snapshot["retry_after_seconds"] == 8


@pytest.mark.asyncio
async def test_success_resets_closed_failure_count():
    breaker = CircuitBreaker(
        "jolpica",
        CircuitBreakerPolicy(failure_threshold=3, recovery_timeout_seconds=10),
    )

    failed = await breaker.acquire()
    await breaker.record_failure(failed)
    assert breaker.snapshot()["failure_count"] == 1

    succeeded = await breaker.acquire()
    await breaker.record_success(succeeded)
    assert breaker.snapshot()["failure_count"] == 0


@pytest.mark.asyncio
async def test_stale_in_flight_result_cannot_close_newly_opened_circuit():
    breaker = CircuitBreaker(
        "openmeteo",
        CircuitBreakerPolicy(failure_threshold=1, recovery_timeout_seconds=10),
    )

    stale_success = await breaker.acquire()
    failed = await breaker.acquire()
    await breaker.record_failure(failed)
    await breaker.record_success(stale_success)

    assert breaker.snapshot()["state"] == "open"


@pytest.mark.asyncio
async def test_cancelled_recovery_probe_returns_to_open_state():
    clock = FakeClock()
    breaker = CircuitBreaker(
        "openf1",
        CircuitBreakerPolicy(failure_threshold=1, recovery_timeout_seconds=5),
        clock=clock,
    )

    permit = await breaker.acquire()
    await breaker.record_failure(permit)
    clock.advance(5)

    probe = await breaker.acquire()
    await breaker.abandon(probe)

    snapshot = breaker.snapshot()
    assert snapshot["state"] == "open"
    assert snapshot["retry_after_seconds"] == 5


@pytest.mark.asyncio
async def test_registry_keeps_source_failures_isolated():
    registry = CircuitBreakerRegistry(
        {
            "openf1": CircuitBreakerPolicy(1, 5),
            "openmeteo": CircuitBreakerPolicy(1, 5),
        }
    )

    openf1 = registry.get("openf1")
    permit = await openf1.acquire()
    await openf1.record_failure(permit)

    snapshot = registry.snapshot()
    assert snapshot["openf1"]["state"] == "open"
    assert snapshot["openmeteo"]["state"] == "closed"
