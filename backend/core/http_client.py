"""Shared asynchronous HTTP client for RaceDay upstream services."""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Awaitable, Callable, Mapping

import httpx

from backend.core.circuit_breaker import (
    DEFAULT_SOURCE_POLICIES,
    CircuitBreakerOpen,
    CircuitBreakerRegistry,
)

logger = logging.getLogger(__name__)

RETRYABLE_STATUS_CODES = frozenset({408, 425, 429, 500, 502, 503, 504})


@dataclass(frozen=True)
class RequestPolicy:
    connect_timeout_seconds: float = 3.0
    read_timeout_seconds: float = 8.0
    write_timeout_seconds: float = 5.0
    pool_timeout_seconds: float = 2.0
    max_attempts: int = 3
    base_backoff_seconds: float = 0.25
    max_backoff_seconds: float = 2.0
    max_retry_after_seconds: float = 5.0
    retryable_status_codes: frozenset[int] = RETRYABLE_STATUS_CODES

    def __post_init__(self):
        timeout_values = (
            self.connect_timeout_seconds,
            self.read_timeout_seconds,
            self.write_timeout_seconds,
            self.pool_timeout_seconds,
        )
        if any(value <= 0 for value in timeout_values):
            raise ValueError("all timeout values must be positive")
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        if self.base_backoff_seconds < 0:
            raise ValueError("base_backoff_seconds cannot be negative")
        if self.max_backoff_seconds < self.base_backoff_seconds:
            raise ValueError("max_backoff_seconds cannot be below base_backoff_seconds")
        if self.max_retry_after_seconds < 0:
            raise ValueError("max_retry_after_seconds cannot be negative")

    def as_httpx_timeout(self) -> httpx.Timeout:
        return httpx.Timeout(
            connect=self.connect_timeout_seconds,
            read=self.read_timeout_seconds,
            write=self.write_timeout_seconds,
            pool=self.pool_timeout_seconds,
        )


DEFAULT_POLICY = RequestPolicy()

SOURCE_POLICIES: dict[str, RequestPolicy] = {
    "openf1": RequestPolicy(
        connect_timeout_seconds=2.0,
        read_timeout_seconds=6.0,
        write_timeout_seconds=3.0,
        pool_timeout_seconds=2.0,
        max_attempts=3,
        base_backoff_seconds=0.25,
        max_backoff_seconds=1.5,
        max_retry_after_seconds=3.0,
    ),
    "jolpica": RequestPolicy(
        connect_timeout_seconds=3.0,
        read_timeout_seconds=12.0,
        write_timeout_seconds=5.0,
        pool_timeout_seconds=2.0,
        max_attempts=3,
        base_backoff_seconds=0.5,
        max_backoff_seconds=2.0,
        max_retry_after_seconds=5.0,
    ),
    "openmeteo": RequestPolicy(
        connect_timeout_seconds=3.0,
        read_timeout_seconds=12.0,
        write_timeout_seconds=5.0,
        pool_timeout_seconds=2.0,
        max_attempts=3,
        base_backoff_seconds=0.5,
        max_backoff_seconds=2.0,
        max_retry_after_seconds=5.0,
    ),
    "ai": RequestPolicy(
        connect_timeout_seconds=3.0,
        read_timeout_seconds=10.0,
        write_timeout_seconds=5.0,
        pool_timeout_seconds=2.0,
        max_attempts=2,
        base_backoff_seconds=0.4,
        max_backoff_seconds=1.0,
        max_retry_after_seconds=2.0,
    ),
}


class UpstreamRequestError(RuntimeError):
    """An upstream request failed without exposing provider response bodies."""

    def __init__(
        self,
        source: str,
        operation: str,
        *,
        attempts: int,
        status_code: int | None = None,
        retryable: bool = False,
        reason: str = "request failed",
    ):
        super().__init__(f"{source} {operation} failed after {attempts} attempt(s): {reason}")
        self.source = source
        self.operation = operation
        self.attempts = attempts
        self.status_code = status_code
        self.retryable = retryable
        self.reason = reason


class UpstreamPayloadError(UpstreamRequestError):
    """An upstream response succeeded at HTTP level but did not contain JSON."""


class UpstreamCircuitOpenError(UpstreamRequestError):
    """An upstream call was skipped because its circuit is open."""

    def __init__(
        self,
        source: str,
        operation: str,
        *,
        retry_after_seconds: float,
    ):
        super().__init__(
            source,
            operation,
            attempts=0,
            retryable=True,
            reason="circuit open",
        )
        self.retry_after_seconds = retry_after_seconds


Sleep = Callable[[float], Awaitable[None]]
Jitter = Callable[[], float]
Now = Callable[[], datetime]


class AsyncUpstreamClient:
    """Apply consistent timeout and retry behavior to upstream HTTP calls."""

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        sleep: Sleep = asyncio.sleep,
        jitter: Jitter = random.random,
        now: Now = lambda: datetime.now(timezone.utc),
        breaker_registry: CircuitBreakerRegistry | None = None,
    ):
        self._client = client
        self._owns_client = client is None
        self._sleep = sleep
        self._jitter = jitter
        self._now = now
        self._breaker_registry = breaker_registry or CircuitBreakerRegistry()

    @property
    def started(self) -> bool:
        return self._client is not None and not self._client.is_closed

    async def start(self):
        if self.started:
            return
        self._client = httpx.AsyncClient(
            follow_redirects=True,
            headers={"User-Agent": "RaceDay/1.0 (F1 fan intelligence platform)"},
        )
        self._owns_client = True

    async def close(self):
        if self._owns_client and self._client is not None and not self._client.is_closed:
            await self._client.aclose()

    async def request_json(
        self,
        method: str,
        url: str,
        *,
        source: str,
        operation: str | None = None,
        policy: RequestPolicy | None = None,
        params: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        json: Any = None,
    ) -> Any:
        client = self._require_client()
        source_key = source.strip().lower()
        if not source_key:
            raise ValueError("source cannot be empty")

        request_policy = policy or SOURCE_POLICIES.get(source_key, DEFAULT_POLICY)
        operation_name = operation or method.upper()
        breaker = self._breaker_registry.get(source_key)

        try:
            permit = await breaker.acquire()
        except CircuitBreakerOpen as exc:
            raise UpstreamCircuitOpenError(
                source_key,
                operation_name,
                retry_after_seconds=exc.retry_after_seconds,
            ) from exc

        try:
            result = await self._request_json_with_retries(
                client,
                method,
                url,
                source=source_key,
                operation=operation_name,
                policy=request_policy,
                params=params,
                headers=headers,
                json=json,
            )
        except asyncio.CancelledError:
            await breaker.abandon(permit)
            raise
        except UpstreamPayloadError:
            await breaker.record_failure(permit)
            raise
        except UpstreamRequestError as exc:
            if exc.retryable:
                await breaker.record_failure(permit)
            else:
                await breaker.record_success(permit)
            raise
        except Exception:
            await breaker.abandon(permit)
            raise

        await breaker.record_success(permit)
        return result

    async def _request_json_with_retries(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        *,
        source: str,
        operation: str,
        policy: RequestPolicy,
        params: Mapping[str, Any] | None,
        headers: Mapping[str, str] | None,
        json: Any,
    ) -> Any:
        for attempt in range(1, policy.max_attempts + 1):
            try:
                response = await client.request(
                    method,
                    url,
                    params=params,
                    headers=headers,
                    json=json,
                    timeout=policy.as_httpx_timeout(),
                )
            except asyncio.CancelledError:
                raise
            except httpx.RequestError as exc:
                if attempt >= policy.max_attempts:
                    raise UpstreamRequestError(
                        source,
                        operation,
                        attempts=attempt,
                        retryable=True,
                        reason=self._request_error_reason(exc),
                    ) from exc

                await self._wait_before_retry(
                    source,
                    operation,
                    attempt,
                    policy,
                )
                continue

            if response.status_code >= 400:
                retryable = response.status_code in policy.retryable_status_codes
                if not retryable or attempt >= policy.max_attempts:
                    raise UpstreamRequestError(
                        source,
                        operation,
                        attempts=attempt,
                        status_code=response.status_code,
                        retryable=retryable,
                        reason=f"HTTP {response.status_code}",
                    )

                retry_after = self._retry_after_seconds(response.headers.get("Retry-After"))
                if (
                    retry_after is not None
                    and retry_after > policy.max_retry_after_seconds
                ):
                    raise UpstreamRequestError(
                        source,
                        operation,
                        attempts=attempt,
                        status_code=response.status_code,
                        retryable=True,
                        reason="Retry-After exceeds request budget",
                    )

                await self._wait_before_retry(
                    source,
                    operation,
                    attempt,
                    policy,
                    retry_after=retry_after,
                )
                continue

            if response.status_code == 204:
                return None

            try:
                return response.json()
            except ValueError as exc:
                raise UpstreamPayloadError(
                    source,
                    operation,
                    attempts=attempt,
                    status_code=response.status_code,
                    retryable=False,
                    reason="invalid JSON response",
                ) from exc

        raise AssertionError("request loop completed without a response")

    def _require_client(self) -> httpx.AsyncClient:
        if not self.started:
            raise RuntimeError("upstream HTTP client has not been started")
        assert self._client is not None
        return self._client

    async def _wait_before_retry(
        self,
        source: str,
        operation: str,
        attempt: int,
        policy: RequestPolicy,
        *,
        retry_after: float | None = None,
    ):
        delay = retry_after if retry_after is not None else self._backoff_delay(attempt, policy)
        logger.warning(
            "upstream_request_retry",
            extra={
                "source": source,
                "operation": operation,
                "attempt": attempt,
                "delay_seconds": round(delay, 3),
            },
        )
        await self._sleep(delay)

    def _backoff_delay(self, attempt: int, policy: RequestPolicy) -> float:
        exponential = min(
            policy.base_backoff_seconds * (2 ** (attempt - 1)),
            policy.max_backoff_seconds,
        )
        jitter = exponential * 0.25 * min(max(self._jitter(), 0.0), 1.0)
        return min(exponential + jitter, policy.max_backoff_seconds)

    def _retry_after_seconds(self, raw_value: str | None) -> float | None:
        if not raw_value:
            return None

        try:
            return max(0.0, float(raw_value.strip()))
        except ValueError:
            pass

        try:
            retry_at = parsedate_to_datetime(raw_value)
        except (TypeError, ValueError):
            return None

        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max(0.0, (retry_at - self._now()).total_seconds())

    @staticmethod
    def _request_error_reason(exc: httpx.RequestError) -> str:
        if isinstance(exc, httpx.TimeoutException):
            return "timeout"
        if isinstance(exc, httpx.NetworkError):
            return "network error"
        return "transport error"


circuit_breakers = CircuitBreakerRegistry(DEFAULT_SOURCE_POLICIES)
upstream_client = AsyncUpstreamClient(breaker_registry=circuit_breakers)


async def start_upstream_client():
    await upstream_client.start()


async def stop_upstream_client():
    await upstream_client.close()
