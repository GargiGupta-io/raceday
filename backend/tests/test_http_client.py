import asyncio
from datetime import datetime, timezone

import httpx
import pytest

from backend.core.circuit_breaker import CircuitBreakerPolicy, CircuitBreakerRegistry
from backend.core.http_client import (
    AsyncUpstreamClient,
    RequestPolicy,
    UpstreamCircuitOpenError,
    UpstreamPayloadError,
    UpstreamRequestError,
)


def policy(**overrides):
    values = {
        "connect_timeout_seconds": 1.0,
        "read_timeout_seconds": 1.0,
        "write_timeout_seconds": 1.0,
        "pool_timeout_seconds": 1.0,
        "max_attempts": 2,
        "base_backoff_seconds": 0.5,
        "max_backoff_seconds": 2.0,
        "max_retry_after_seconds": 3.0,
    }
    values.update(overrides)
    return RequestPolicy(**values)


@pytest.mark.asyncio
async def test_returns_json_without_retry():
    attempts = 0
    timeout_extension = None

    def handler(request):
        nonlocal attempts, timeout_extension
        attempts += 1
        timeout_extension = request.extensions["timeout"]
        return httpx.Response(200, json={"active": False}, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client)
        result = await client.request_json(
            "GET",
            "https://api.openf1.org/v1/sessions",
            source="openf1",
            operation="sessions",
            policy=policy(),
        )

    assert result == {"active": False}
    assert attempts == 1
    assert timeout_extension == {
        "connect": 1.0,
        "read": 1.0,
        "write": 1.0,
        "pool": 1.0,
    }


@pytest.mark.asyncio
async def test_retries_timeout_then_returns_json():
    attempts = 0
    delays = []

    def handler(request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise httpx.ReadTimeout("slow upstream", request=request)
        return httpx.Response(200, json={"drivers": []}, request=request)

    async def fake_sleep(delay):
        delays.append(delay)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, sleep=fake_sleep, jitter=lambda: 0.0)
        result = await client.request_json(
            "GET",
            "https://api.openf1.org/v1/drivers",
            source="openf1",
            operation="drivers",
            policy=policy(),
        )

    assert result == {"drivers": []}
    assert attempts == 2
    assert delays == [0.5]


@pytest.mark.asyncio
async def test_retries_temporary_server_error():
    attempts = 0
    delays = []

    def handler(request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(200, json={"ok": True}, request=request)

    async def fake_sleep(delay):
        delays.append(delay)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, sleep=fake_sleep, jitter=lambda: 0.0)
        result = await client.request_json(
            "GET",
            "https://api.jolpi.ca/ergast/f1/2026.json",
            source="jolpica",
            operation="season",
            policy=policy(),
        )

    assert result == {"ok": True}
    assert attempts == 2
    assert delays == [0.5]


@pytest.mark.asyncio
async def test_does_not_retry_permanent_client_error():
    attempts = 0
    registry = CircuitBreakerRegistry()

    def handler(request):
        nonlocal attempts
        attempts += 1
        return httpx.Response(400, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, breaker_registry=registry)
        with pytest.raises(UpstreamRequestError) as caught:
            await client.request_json(
                "GET",
                "https://example.test/bad-request",
                source="test",
                operation="bad-request",
                policy=policy(max_attempts=3),
            )

    assert attempts == 1
    assert caught.value.status_code == 400
    assert caught.value.retryable is False
    assert registry.snapshot()["test"]["state"] == "closed"
    assert registry.snapshot()["test"]["failure_count"] == 0


@pytest.mark.asyncio
async def test_respects_bounded_retry_after_header():
    attempts = 0
    delays = []

    def handler(request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, headers={"Retry-After": "1.5"}, request=request)
        return httpx.Response(200, json={"ok": True}, request=request)

    async def fake_sleep(delay):
        delays.append(delay)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, sleep=fake_sleep)
        result = await client.request_json(
            "GET",
            "https://example.test/rate-limited",
            source="test",
            operation="rate-limited",
            policy=policy(),
        )

    assert result == {"ok": True}
    assert attempts == 2
    assert delays == [1.5]


@pytest.mark.asyncio
async def test_rejects_retry_after_above_request_budget():
    attempts = 0
    delays = []

    def handler(request):
        nonlocal attempts
        attempts += 1
        return httpx.Response(429, headers={"Retry-After": "30"}, request=request)

    async def fake_sleep(delay):
        delays.append(delay)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, sleep=fake_sleep)
        with pytest.raises(UpstreamRequestError) as caught:
            await client.request_json(
                "GET",
                "https://example.test/rate-limited",
                source="test",
                operation="rate-limited",
                policy=policy(max_retry_after_seconds=2.0),
            )

    assert attempts == 1
    assert delays == []
    assert caught.value.reason == "Retry-After exceeds request budget"


@pytest.mark.asyncio
async def test_http_date_retry_after_uses_injected_clock():
    delays = []
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(
                503,
                headers={"Retry-After": "Thu, 10 Jul 2026 12:00:02 GMT"},
                request=request,
            )
        return httpx.Response(200, json={"ok": True}, request=request)

    async def fake_sleep(delay):
        delays.append(delay)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(
            raw_client,
            sleep=fake_sleep,
            now=lambda: datetime(2026, 7, 10, 12, 0, 0, tzinfo=timezone.utc),
        )
        result = await client.request_json(
            "GET",
            "https://example.test/recovering",
            source="test",
            operation="recovering",
            policy=policy(),
        )

    assert result == {"ok": True}
    assert delays == [2.0]


@pytest.mark.asyncio
async def test_invalid_json_is_not_retried():
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        return httpx.Response(200, content=b"not-json", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client)
        with pytest.raises(UpstreamPayloadError) as caught:
            await client.request_json(
                "GET",
                "https://example.test/not-json",
                source="test",
                operation="not-json",
                policy=policy(max_attempts=3),
            )

    assert attempts == 1
    assert caught.value.reason == "invalid JSON response"


@pytest.mark.asyncio
async def test_exhausted_timeouts_report_the_final_attempt():
    attempts = 0
    delays = []

    def handler(request):
        nonlocal attempts
        attempts += 1
        raise httpx.ReadTimeout("still slow", request=request)

    async def fake_sleep(delay):
        delays.append(delay)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, sleep=fake_sleep, jitter=lambda: 0.0)
        with pytest.raises(UpstreamRequestError) as caught:
            await client.request_json(
                "GET",
                "https://example.test/timeout",
                source="test",
                operation="timeout",
                policy=policy(max_attempts=3),
            )

    assert attempts == 3
    assert delays == [0.5, 1.0]
    assert caught.value.attempts == 3
    assert caught.value.reason == "timeout"
    assert caught.value.retryable is True


@pytest.mark.asyncio
async def test_cancellation_is_never_retried():
    attempts = 0

    def handler(request):
        nonlocal attempts
        attempts += 1
        raise asyncio.CancelledError()

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client)
        with pytest.raises(asyncio.CancelledError):
            await client.request_json(
                "GET",
                "https://example.test/cancelled",
                source="test",
                operation="cancelled",
                policy=policy(max_attempts=3),
            )

    assert attempts == 1


@pytest.mark.asyncio
async def test_repeated_exhausted_requests_open_the_circuit():
    attempts = 0
    registry = CircuitBreakerRegistry(
        default_policy=CircuitBreakerPolicy(
            failure_threshold=2,
            recovery_timeout_seconds=10,
        )
    )

    def handler(request):
        nonlocal attempts
        attempts += 1
        return httpx.Response(503, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, breaker_registry=registry)
        for _ in range(2):
            with pytest.raises(UpstreamRequestError):
                await client.request_json(
                    "GET",
                    "https://example.test/unavailable",
                    source="test",
                    operation="unavailable",
                    policy=policy(max_attempts=1),
                )

        with pytest.raises(UpstreamCircuitOpenError) as caught:
            await client.request_json(
                "GET",
                "https://example.test/unavailable",
                source="test",
                operation="unavailable",
                policy=policy(max_attempts=1),
            )

    assert attempts == 2
    assert caught.value.attempts == 0
    assert caught.value.retry_after_seconds > 0
    assert registry.snapshot()["test"]["state"] == "open"


@pytest.mark.asyncio
async def test_successful_half_open_request_closes_the_circuit():
    attempts = 0
    clock = [0.0]
    registry = CircuitBreakerRegistry(
        default_policy=CircuitBreakerPolicy(
            failure_threshold=1,
            recovery_timeout_seconds=5,
        ),
        clock=lambda: clock[0],
    )

    def handler(request):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(200, json={"recovered": True}, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, breaker_registry=registry)
        with pytest.raises(UpstreamRequestError):
            await client.request_json(
                "GET",
                "https://example.test/recovering",
                source="test",
                operation="recovering",
                policy=policy(max_attempts=1),
            )

        clock[0] = 5.0
        result = await client.request_json(
            "GET",
            "https://example.test/recovering",
            source="test",
            operation="recovering",
            policy=policy(max_attempts=1),
        )

    assert result == {"recovered": True}
    assert attempts == 2
    assert registry.snapshot()["test"]["state"] == "closed"


@pytest.mark.asyncio
async def test_owned_client_starts_and_closes_cleanly():
    client = AsyncUpstreamClient()

    assert client.started is False

    await client.start()
    assert client.started is True

    await client.close()
    assert client.started is False


@pytest.mark.asyncio
async def test_successful_request_records_sanitized_operational_event():
    events = []
    times = iter([10.0, 10.125])

    def handler(request):
        return httpx.Response(200, json={"ok": True}, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(
            raw_client,
            timer=lambda: next(times),
            event_recorder=lambda **event: events.append(event) or True,
        )
        result = await client.request_json(
            "GET",
            "https://provider.example/private-path?token=secret",
            source="openf1",
            operation="sessions",
            policy=policy(max_attempts=1),
            headers={"Authorization": "Bearer secret"},
        )

    assert result == {"ok": True}
    assert events == [
        {
            "event_type": "upstream_request",
            "source": "openf1",
            "outcome": "success",
            "duration_ms": 125,
            "status_code": None,
            "fallback_used": False,
            "error_code": None,
            "context": {"operation": "sessions"},
        }
    ]
    assert "secret" not in str(events)
    assert "provider.example" not in str(events)


@pytest.mark.asyncio
async def test_failed_and_open_circuit_requests_record_failure_and_fallback():
    events = []
    timer_value = 0.0
    registry = CircuitBreakerRegistry(
        default_policy=CircuitBreakerPolicy(
            failure_threshold=1,
            recovery_timeout_seconds=30,
        )
    )

    def timer():
        nonlocal timer_value
        timer_value += 0.1
        return timer_value

    def handler(request):
        return httpx.Response(503, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(
            raw_client,
            breaker_registry=registry,
            timer=timer,
            event_recorder=lambda **event: events.append(event) or True,
        )
        with pytest.raises(UpstreamRequestError):
            await client.request_json(
                "GET",
                "https://provider.example/failing",
                source="openf1",
                operation="position",
                policy=policy(max_attempts=1),
            )
        with pytest.raises(UpstreamCircuitOpenError):
            await client.request_json(
                "GET",
                "https://provider.example/failing",
                source="openf1",
                operation="position",
                policy=policy(max_attempts=1),
            )

    assert [event["outcome"] for event in events] == ["failure", "skipped"]
    assert events[0]["status_code"] == 503
    assert events[0]["context"] == {"operation": "position", "attempts": 1}
    assert events[1]["fallback_used"] is True
    assert events[1]["error_code"] == "circuit_open"
    assert events[1]["context"] == {"operation": "position", "circuit": "open"}


@pytest.mark.asyncio
async def test_event_recorder_failure_does_not_break_upstream_request():
    def handler(request):
        return httpx.Response(200, json={"ok": True}, request=request)

    def failed_recorder(**event):
        raise RuntimeError("event queue unavailable")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as raw_client:
        client = AsyncUpstreamClient(raw_client, event_recorder=failed_recorder)
        result = await client.request_json(
            "GET",
            "https://provider.example/healthy",
            source="openf1",
            operation="sessions",
            policy=policy(max_attempts=1),
        )

    assert result == {"ok": True}
