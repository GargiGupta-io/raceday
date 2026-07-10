"""Optional fail-open PostgreSQL storage for sanitized reliability events."""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import math
import os
import re
import time
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Protocol

logger = logging.getLogger(__name__)

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "schema"
    / "migrations"
    / "001_service_events.sql"
)

_INSERT_EVENT_SQL = """
INSERT INTO service_events (
    event_type,
    source,
    outcome,
    duration_ms,
    status_code,
    fallback_used,
    error_code,
    context
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
""".strip()

_SAFE_CONTEXT_KEYS = frozenset(
    {
        "operation",
        "mode",
        "year",
        "race",
        "endpoint",
        "circuit",
        "attempts",
        "cache_backend",
        "provider",
    }
)
_TOKEN_PATTERN = re.compile(r"[^a-z0-9_.-]+")
_SENSITIVE_VALUE_PATTERN = re.compile(
    r"(?:[a-z][a-z0-9+.-]*://|[^\s@]+@[^\s@]+|authorization|bearer\s|"
    r"api[_-]?key|password|secret|sk-|gsk_)",
    re.IGNORECASE,
)


class EventPool(Protocol):
    async def execute(self, query: str, *args: Any) -> Any: ...

    async def close(self) -> Any: ...


PoolFactory = Callable[[str], Awaitable[EventPool]]


async def _default_pool_factory(database_url: str) -> EventPool:
    import asyncpg

    return await asyncpg.create_pool(
        dsn=database_url,
        min_size=1,
        max_size=3,
        timeout=2,
        command_timeout=2,
    )


@dataclass(frozen=True)
class ServiceEvent:
    event_type: str
    source: str
    outcome: str
    duration_ms: int | None
    status_code: int | None
    fallback_used: bool
    error_code: str | None
    context: dict[str, Any]

    @classmethod
    def create(
        cls,
        *,
        event_type: str,
        source: str,
        outcome: str,
        duration_ms: int | float | None = None,
        status_code: int | None = None,
        fallback_used: bool = False,
        error_code: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> "ServiceEvent":
        return cls(
            event_type=_clean_token(event_type, "event"),
            source=_clean_token(source, "unknown"),
            outcome=_clean_token(outcome, "unknown"),
            duration_ms=_clean_duration(duration_ms),
            status_code=_clean_status_code(status_code),
            fallback_used=bool(fallback_used),
            error_code=_clean_error_code(error_code),
            context=_sanitize_context(context or {}),
        )


class ServiceEventStore:
    """Queue reliability events and persist them without delaying requests."""

    def __init__(
        self,
        *,
        queue_size: int = 500,
        pool_factory: PoolFactory = _default_pool_factory,
        clock: Callable[[], float] = time.monotonic,
        retry_seconds: float = 30.0,
        shutdown_timeout_seconds: float = 1.0,
        migration_sql: str | None = None,
    ):
        if queue_size < 1:
            raise ValueError("event queue size must be positive")
        if retry_seconds <= 0 or shutdown_timeout_seconds <= 0:
            raise ValueError("event-store timeouts must be positive")

        self._queue: asyncio.Queue[ServiceEvent] = asyncio.Queue(maxsize=queue_size)
        self._pool_factory = pool_factory
        self._clock = clock
        self._retry_seconds = retry_seconds
        self._shutdown_timeout_seconds = shutdown_timeout_seconds
        self._migration_sql = migration_sql
        self._database_url: str | None = None
        self._pool: EventPool | None = None
        self._pool_lock = asyncio.Lock()
        self._worker: asyncio.Task[None] | None = None
        self._requested = False
        self._enabled = False
        self._database_available = False
        self._retry_at = 0.0
        self._last_error: str | None = None
        self._written_events = 0
        self._failed_writes = 0
        self._dropped_events = 0
        self._invalid_events = 0
        self._closing = False

    async def start(
        self,
        *,
        database_url: str | None = None,
        enabled: bool | None = None,
    ) -> None:
        if self._worker is not None and not self._worker.done():
            return

        self._requested = _env_flag("RELIABILITY_EVENTS_ENABLED") if enabled is None else enabled
        configured_url = database_url if database_url is not None else os.getenv("DATABASE_URL", "")
        self._database_url = configured_url.strip() or None
        self._enabled = self._requested and self._database_url is not None
        self._closing = False
        self._retry_at = 0.0
        self._last_error = None
        if not self._enabled:
            return

        await self._ensure_pool()
        self._worker = asyncio.create_task(
            self._worker_loop(),
            name="service-event-writer",
        )

    async def close(self) -> None:
        self._closing = True
        worker = self._worker
        if worker is not None:
            try:
                await asyncio.wait_for(
                    self._queue.join(),
                    timeout=self._shutdown_timeout_seconds,
                )
            except asyncio.TimeoutError:
                self._drain_queue()
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
        self._worker = None
        await self._discard_pool()

    def record(
        self,
        *,
        event_type: str,
        source: str,
        outcome: str,
        duration_ms: int | float | None = None,
        status_code: int | None = None,
        fallback_used: bool = False,
        error_code: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> bool:
        if not self._enabled or self._closing:
            return False
        try:
            event = ServiceEvent.create(
                event_type=event_type,
                source=source,
                outcome=outcome,
                duration_ms=duration_ms,
                status_code=status_code,
                fallback_used=fallback_used,
                error_code=error_code,
                context=context,
            )
        except Exception:
            self._invalid_events += 1
            return False

        if self._queue.full():
            try:
                self._queue.get_nowait()
                self._queue.task_done()
                self._dropped_events += 1
            except asyncio.QueueEmpty:
                pass
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            self._dropped_events += 1
            return False
        return True

    async def flush(self, timeout_seconds: float = 1.0) -> bool:
        try:
            await asyncio.wait_for(self._queue.join(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            return False
        return True

    def status(self) -> dict[str, Any]:
        if not self._requested:
            status = "disabled"
        elif self._database_url is None:
            status = "misconfigured"
        elif self._database_available:
            status = "available"
        else:
            status = "degraded"

        return {
            "status": status,
            "enabled": self._enabled,
            "database_configured": self._database_url is not None,
            "database_available": self._database_available,
            "worker_running": self._worker is not None and not self._worker.done(),
            "queue_depth": self._queue.qsize(),
            "queue_capacity": self._queue.maxsize,
            "written_events": self._written_events,
            "failed_writes": self._failed_writes,
            "dropped_events": self._dropped_events,
            "invalid_events": self._invalid_events,
            "last_error": self._last_error,
            "retry_after_seconds": round(max(0.0, self._retry_at - self._clock()), 3),
        }

    async def _worker_loop(self) -> None:
        while True:
            event = await self._queue.get()
            try:
                await self._write_event(event)
            except asyncio.CancelledError:
                raise
            finally:
                self._queue.task_done()

    async def _write_event(self, event: ServiceEvent) -> None:
        pool = await self._ensure_pool()
        if pool is None:
            self._dropped_events += 1
            return

        try:
            await pool.execute(
                _INSERT_EVENT_SQL,
                event.event_type,
                event.source,
                event.outcome,
                event.duration_ms,
                event.status_code,
                event.fallback_used,
                event.error_code,
                json.dumps(event.context, ensure_ascii=True, separators=(",", ":")),
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._failed_writes += 1
            self._dropped_events += 1
            self._mark_failure(exc)
            logger.warning(
                "service_event_write_failed",
                extra={"error_type": type(exc).__name__},
            )
            await self._discard_pool()
            return

        self._database_available = True
        self._last_error = None
        self._retry_at = 0.0
        self._written_events += 1

    async def _ensure_pool(self) -> EventPool | None:
        if not self._enabled or self._database_url is None:
            return None
        if self._pool is not None and self._database_available:
            return self._pool
        if self._clock() < self._retry_at:
            return None

        async with self._pool_lock:
            if self._pool is not None and self._database_available:
                return self._pool
            if self._clock() < self._retry_at:
                return None
            pool: EventPool | None = None
            try:
                pool = await self._pool_factory(self._database_url)
                await pool.execute(self._load_migration_sql())
            except Exception as exc:
                self._mark_failure(exc)
                logger.warning(
                    "service_event_store_connection_failed",
                    extra={"error_type": type(exc).__name__},
                )
                if pool is not None:
                    await self._close_pool(pool)
                return None

            self._pool = pool
            self._database_available = True
            self._last_error = None
            self._retry_at = 0.0
            return pool

    async def _discard_pool(self) -> None:
        pool = self._pool
        self._pool = None
        self._database_available = False
        if pool is not None:
            await self._close_pool(pool)

    async def _close_pool(self, pool: EventPool) -> None:
        try:
            result = pool.close()
            if inspect.isawaitable(result):
                await asyncio.wait_for(result, timeout=0.5)
        except Exception as exc:
            logger.warning(
                "service_event_store_close_failed",
                extra={"error_type": type(exc).__name__},
            )

    def _load_migration_sql(self) -> str:
        if self._migration_sql is not None:
            return self._migration_sql
        return MIGRATION_PATH.read_text(encoding="utf-8")

    def _mark_failure(self, exc: Exception) -> None:
        self._database_available = False
        self._last_error = type(exc).__name__
        self._retry_at = self._clock() + self._retry_seconds

    def _drain_queue(self) -> None:
        while True:
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            self._queue.task_done()
            self._dropped_events += 1


def _clean_token(value: Any, default: str) -> str:
    token = _TOKEN_PATTERN.sub("_", str(value or "").strip().lower()).strip("_")
    return (token or default)[:64]


def _clean_duration(value: int | float | None) -> int | None:
    if value is None:
        return None
    try:
        duration = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(duration) or duration < 0:
        return None
    return min(round(duration), 3_600_000)


def _clean_status_code(value: int | None) -> int | None:
    try:
        status = int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
    return status if status is not None and 100 <= status <= 599 else None


def _clean_error_code(value: str | None) -> str | None:
    if not value:
        return None
    if _SENSITIVE_VALUE_PATTERN.search(str(value)):
        return "redacted"
    return _clean_token(value, "unknown")


def _sanitize_context(context: dict[str, Any]) -> dict[str, Any]:
    sanitized: dict[str, Any] = {}
    for key, value in context.items():
        normalized_key = str(key).strip().lower()
        if normalized_key not in _SAFE_CONTEXT_KEYS or value is None:
            continue
        if isinstance(value, bool):
            sanitized[normalized_key] = value
            continue
        if isinstance(value, int):
            sanitized[normalized_key] = value
            continue
        if isinstance(value, float) and math.isfinite(value):
            sanitized[normalized_key] = value
            continue
        text = str(value).strip()
        if not text or _SENSITIVE_VALUE_PATTERN.search(text):
            continue
        sanitized[normalized_key] = text[:120]
    return sanitized


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _positive_env_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


service_events = ServiceEventStore(
    queue_size=_positive_env_int("RELIABILITY_EVENT_QUEUE_SIZE", 500),
)


def record_service_event(**kwargs: Any) -> bool:
    return service_events.record(**kwargs)


async def start_service_event_store() -> None:
    await service_events.start()


async def stop_service_event_store() -> None:
    await service_events.close()
