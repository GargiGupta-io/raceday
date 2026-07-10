"""Optional Redis-backed runtime cache with an in-memory fallback."""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import math
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Protocol

from backend.core import event_store

logger = logging.getLogger(__name__)


class CacheBackend(Protocol):
    async def get_json(self, key: str) -> Any | None: ...

    async def set_json(self, key: str, value: Any, ttl_seconds: float) -> None: ...

    async def delete(self, key: str) -> None: ...

    async def increment(self, key: str, ttl_seconds: float) -> int: ...


@dataclass
class _MemoryEntry:
    payload: str
    expires_at: float


@dataclass
class _MemoryCounter:
    value: int
    expires_at: float


class MemoryCache:
    """Small process-local TTL cache used in development and as a fallback."""

    def __init__(self, *, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._entries: dict[str, _MemoryEntry] = {}
        self._counters: dict[str, _MemoryCounter] = {}
        self._lock = asyncio.Lock()
        self._write_count = 0

    async def get_json(self, key: str) -> Any | None:
        async with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= self._clock():
                self._entries.pop(key, None)
                return None
            payload = entry.payload

        return json.loads(payload)

    async def set_json(self, key: str, value: Any, ttl_seconds: float) -> None:
        ttl = _positive_ttl(ttl_seconds)
        payload = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        async with self._lock:
            self._entries[key] = _MemoryEntry(payload, self._clock() + ttl)
            self._prune_periodically()

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._entries.pop(key, None)
            self._counters.pop(key, None)

    async def increment(self, key: str, ttl_seconds: float) -> int:
        ttl = _positive_ttl(ttl_seconds)
        async with self._lock:
            now = self._clock()
            counter = self._counters.get(key)
            if counter is None or counter.expires_at <= now:
                counter = _MemoryCounter(1, now + ttl)
            else:
                counter.value += 1
            self._counters[key] = counter
            self._prune_periodically()
            return counter.value

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()
            self._counters.clear()

    def _prune_periodically(self) -> None:
        self._write_count += 1
        if self._write_count % 100 != 0:
            return

        now = self._clock()
        self._entries = {
            key: entry for key, entry in self._entries.items() if entry.expires_at > now
        }
        self._counters = {
            key: counter for key, counter in self._counters.items() if counter.expires_at > now
        }


class RedisClient(Protocol):
    async def ping(self) -> Any: ...

    async def get(self, key: str) -> Any: ...

    async def set(self, key: str, value: str, *, ex: int) -> Any: ...

    async def delete(self, key: str) -> Any: ...

    async def eval(self, script: str, numkeys: int, *args: Any) -> Any: ...


class RedisCache:
    """JSON cache adapter around a redis.asyncio-compatible client."""

    _INCREMENT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
""".strip()

    def __init__(self, client: RedisClient):
        self._client = client

    async def ping(self) -> None:
        await self._client.ping()

    async def get_json(self, key: str) -> Any | None:
        payload = await self._client.get(key)
        if payload is None:
            return None
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")
        return json.loads(payload)

    async def set_json(self, key: str, value: Any, ttl_seconds: float) -> None:
        payload = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
        await self._client.set(key, payload, ex=math.ceil(_positive_ttl(ttl_seconds)))

    async def delete(self, key: str) -> None:
        await self._client.delete(key)

    async def increment(self, key: str, ttl_seconds: float) -> int:
        result = await self._client.eval(
            self._INCREMENT_SCRIPT,
            1,
            key,
            math.ceil(_positive_ttl(ttl_seconds)),
        )
        return int(result)

    async def close(self) -> None:
        close = getattr(self._client, "aclose", None) or getattr(self._client, "close", None)
        if close is None:
            return
        result = close()
        if inspect.isawaitable(result):
            await result


RedisFactory = Callable[[str], RedisClient]
_PRIMARY_UNAVAILABLE = object()


def _default_redis_factory(url: str) -> RedisClient:
    from redis.asyncio import Redis

    return Redis.from_url(
        url,
        decode_responses=True,
        socket_connect_timeout=0.5,
        socket_timeout=0.5,
        retry_on_timeout=False,
        health_check_interval=30,
    )


class RuntimeCache:
    """Use Redis when healthy and fail open to process-local memory."""

    def __init__(
        self,
        *,
        memory: MemoryCache | None = None,
        redis_factory: RedisFactory = _default_redis_factory,
        clock: Callable[[], float] = time.monotonic,
        redis_retry_seconds: float = 30.0,
    ):
        self._memory = memory or MemoryCache(clock=clock)
        self._redis_factory = redis_factory
        self._clock = clock
        self._redis_retry_seconds = redis_retry_seconds
        self._redis: RedisCache | None = None
        self._redis_url: str | None = None
        self._redis_configured = False
        self._redis_available = False
        self._redis_retry_at = 0.0
        self._last_error: str | None = None
        self._started = False
        self._redis_lock = asyncio.Lock()
        self._local_authoritative_until: dict[str, float] = {}

    async def start(self, redis_url: str | None = None) -> None:
        if self._started:
            return

        self._started = True
        self._redis_retry_at = 0.0
        self._last_error = None
        configured_url = redis_url if redis_url is not None else os.getenv("REDIS_URL", "")
        self._redis_url = configured_url.strip() or None
        self._redis_configured = self._redis_url is not None
        if not self._redis_configured:
            return

        await self._get_redis()

    async def close(self) -> None:
        redis = self._redis
        self._redis = None
        self._redis_available = False
        self._started = False
        if redis is not None:
            try:
                await redis.close()
            except Exception as exc:
                logger.warning(
                    "redis_close_failed",
                    extra={"error_type": type(exc).__name__},
                )

    async def get_json(
        self,
        key: str,
        *,
        memory_ttl_seconds: float = 30.0,
    ) -> Any | None:
        authoritative_until = self._local_authoritative_until.get(key)
        if authoritative_until is not None:
            now = self._clock()
            if now < authoritative_until:
                local = await self._memory.get_json(key)
                remaining_ttl = max(1.0, authoritative_until - now)
                if local is None:
                    result = await self._call_redis(
                        "delete-stale",
                        lambda redis: redis.delete(key),
                    )
                else:
                    result = await self._call_redis(
                        "resync",
                        lambda redis: redis.set_json(key, local, remaining_ttl),
                    )
                if result is not _PRIMARY_UNAVAILABLE:
                    self._local_authoritative_until.pop(key, None)
                return local
            self._local_authoritative_until.pop(key, None)

        result = await self._call_redis("get", lambda redis: redis.get_json(key))
        if result is not _PRIMARY_UNAVAILABLE and result is not None:
            await self._memory.set_json(key, result, memory_ttl_seconds)
            return result
        return await self._memory.get_json(key)

    async def set_json(self, key: str, value: Any, ttl_seconds: float) -> None:
        ttl = _positive_ttl(ttl_seconds)
        await self._memory.set_json(key, value, ttl)
        result = await self._call_redis(
            "set",
            lambda redis: redis.set_json(key, value, ttl),
        )
        if result is _PRIMARY_UNAVAILABLE and self._redis_configured:
            self._local_authoritative_until[key] = self._clock() + ttl
        else:
            self._local_authoritative_until.pop(key, None)

    async def delete(self, key: str, *, stale_ttl_seconds: float = 30.0) -> None:
        await self._memory.delete(key)
        result = await self._call_redis("delete", lambda redis: redis.delete(key))
        if result is _PRIMARY_UNAVAILABLE and self._redis_configured:
            self._local_authoritative_until[key] = (
                self._clock() + _positive_ttl(stale_ttl_seconds)
            )
        else:
            self._local_authoritative_until.pop(key, None)

    async def increment(self, key: str, ttl_seconds: float) -> int:
        memory_count = await self._memory.increment(key, ttl_seconds)
        result = await self._call_redis(
            "increment",
            lambda redis: redis.increment(key, ttl_seconds),
        )
        if result is _PRIMARY_UNAVAILABLE:
            return memory_count
        return int(result)

    async def clear_memory(self) -> None:
        await self._memory.clear()
        self._local_authoritative_until.clear()

    def status(self) -> dict[str, Any]:
        retry_after = max(0.0, self._redis_retry_at - self._clock())
        return {
            "status": "degraded" if self._redis_configured and not self._redis_available else "available",
            "backend": "redis" if self._redis_available else "memory",
            "redis_configured": self._redis_configured,
            "redis_available": self._redis_available,
            "fallback_backend": "memory",
            "last_error": self._last_error,
            "retry_after_seconds": round(retry_after, 3),
        }

    async def _get_redis(self) -> RedisCache | None:
        if not self._redis_configured or self._redis_url is None:
            return None
        if self._redis_available and self._redis is not None:
            return self._redis
        if self._clock() < self._redis_retry_at:
            return None

        async with self._redis_lock:
            if self._redis_available and self._redis is not None:
                return self._redis
            if self._clock() < self._redis_retry_at:
                return None
            try:
                if self._redis is None:
                    self._redis = RedisCache(self._redis_factory(self._redis_url))
                await self._redis.ping()
            except Exception as exc:
                self._mark_redis_failure(exc, operation="connect")
                logger.warning(
                    "redis_connection_failed",
                    extra={"error_type": type(exc).__name__},
                )
                return None

            self._redis_available = True
            self._last_error = None
            self._redis_retry_at = 0.0
            return self._redis

    async def _call_redis(self, operation: str, call: Callable[[RedisCache], Any]) -> Any:
        redis = await self._get_redis()
        if redis is None:
            return _PRIMARY_UNAVAILABLE
        try:
            result = call(redis)
            if inspect.isawaitable(result):
                result = await result
            self._redis_available = True
            self._last_error = None
            return result
        except Exception as exc:
            self._mark_redis_failure(exc, operation=operation)
            logger.warning(
                "redis_operation_failed",
                extra={"operation": operation, "error_type": type(exc).__name__},
            )
            return _PRIMARY_UNAVAILABLE

    def _mark_redis_failure(self, exc: Exception, *, operation: str) -> None:
        self._redis_available = False
        self._last_error = type(exc).__name__
        self._redis_retry_at = self._clock() + self._redis_retry_seconds
        try:
            event_store.record_service_event(
                event_type="cache_fallback",
                source="redis",
                outcome="used",
                fallback_used=True,
                error_code=type(exc).__name__,
                context={"operation": operation, "cache_backend": "memory"},
            )
        except Exception as event_exc:
            logger.warning(
                "redis_event_record_failed",
                extra={"error_type": type(event_exc).__name__},
            )


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int


class RateLimiter:
    """Fixed-window limiter backed by RuntimeCache counters."""

    def __init__(self, cache: RuntimeCache, *, clock: Callable[[], float] = time.time):
        self._cache = cache
        self._clock = clock

    async def check(
        self,
        scope: str,
        identifier: str,
        *,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        if limit < 1 or window_seconds < 1:
            raise ValueError("rate-limit values must be positive")

        now = self._clock()
        bucket = int(now // window_seconds)
        key = f"raceday:rate:{scope}:{identifier}:{bucket}"
        count = await self._cache.increment(key, window_seconds + 1)
        retry_after = max(1, math.ceil((bucket + 1) * window_seconds - now))
        return RateLimitDecision(
            allowed=count <= limit,
            limit=limit,
            remaining=max(0, limit - count),
            retry_after_seconds=retry_after,
        )


def _positive_ttl(value: float) -> float:
    ttl = float(value)
    if not math.isfinite(ttl) or ttl <= 0:
        raise ValueError("cache TTL must be a positive finite number")
    return ttl


runtime_cache = RuntimeCache()
rate_limiter = RateLimiter(runtime_cache)


async def start_runtime_cache() -> None:
    await runtime_cache.start()


async def stop_runtime_cache() -> None:
    await runtime_cache.close()
