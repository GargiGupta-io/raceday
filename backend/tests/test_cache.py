import json

import pytest

from backend.core import cache as cache_module
from backend.core.cache import MemoryCache, RateLimiter, RuntimeCache


class FakeClock:
    def __init__(self, value: float = 0.0):
        self.value = value

    def __call__(self) -> float:
        return self.value

    def advance(self, seconds: float) -> None:
        self.value += seconds


class FakeRedis:
    def __init__(self, *, fail_ping: bool = False):
        self.fail_ping = fail_ping
        self.fail_operations = False
        self.values: dict[str, str] = {}
        self.counters: dict[str, int] = {}
        self.closed = False
        self.ping_calls = 0
        self.eval_calls = 0

    async def ping(self):
        self.ping_calls += 1
        if self.fail_ping:
            raise ConnectionError("redis unavailable")
        return True

    async def get(self, key: str):
        self._raise_if_failed()
        return self.values.get(key)

    async def set(self, key: str, value: str, *, ex: int):
        self._raise_if_failed()
        self.values[key] = value
        return True

    async def delete(self, key: str):
        self._raise_if_failed()
        self.values.pop(key, None)
        self.counters.pop(key, None)
        return 1

    async def eval(self, script: str, numkeys: int, *args):
        self._raise_if_failed()
        self.eval_calls += 1
        key = str(args[0])
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    async def aclose(self):
        self.closed = True

    def _raise_if_failed(self):
        if self.fail_operations:
            raise ConnectionError("redis operation failed")


@pytest.mark.asyncio
async def test_memory_cache_expires_json_without_sharing_mutations():
    clock = FakeClock(10.0)
    cache = MemoryCache(clock=clock)
    value = {"lap": 25, "drivers": ["NOR"]}

    await cache.set_json("live", value, 5)
    value["drivers"].append("VER")

    assert await cache.get_json("live") == {"lap": 25, "drivers": ["NOR"]}

    clock.advance(5)
    assert await cache.get_json("live") is None


@pytest.mark.asyncio
async def test_memory_counter_resets_after_its_window():
    clock = FakeClock(100.0)
    cache = MemoryCache(clock=clock)

    assert await cache.increment("rate", 10) == 1
    assert await cache.increment("rate", 10) == 2

    clock.advance(10)
    assert await cache.increment("rate", 10) == 1


@pytest.mark.asyncio
async def test_memory_cache_rejects_invalid_ttl():
    cache = MemoryCache()

    with pytest.raises(ValueError):
        await cache.set_json("bad", {}, 0)

    with pytest.raises(ValueError):
        await cache.increment("bad", float("inf"))


@pytest.mark.asyncio
async def test_runtime_cache_uses_memory_when_redis_is_not_configured():
    cache = RuntimeCache()
    await cache.start(redis_url="")

    await cache.set_json("companion", {"headline": "Pit pressure"}, 30)

    assert await cache.get_json("companion") == {"headline": "Pit pressure"}
    assert cache.status() == {
        "status": "available",
        "backend": "memory",
        "redis_configured": False,
        "redis_available": False,
        "fallback_backend": "memory",
        "last_error": None,
        "retry_after_seconds": 0.0,
    }


@pytest.mark.asyncio
async def test_runtime_cache_uses_fake_redis_when_available():
    redis = FakeRedis()
    cache = RuntimeCache(redis_factory=lambda url: redis)
    await cache.start(redis_url="redis://cache.test")

    await cache.set_json("live", {"lap": 26}, 30)
    count = await cache.increment("rate", 60)

    assert json.loads(redis.values["live"]) == {"lap": 26}
    assert await cache.get_json("live") == {"lap": 26}
    assert count == 1
    assert redis.eval_calls == 1
    assert cache.status()["backend"] == "redis"
    assert cache.status()["status"] == "available"

    await cache.close()
    assert redis.closed is True


@pytest.mark.asyncio
async def test_redis_startup_failure_falls_back_to_memory(monkeypatch):
    events = []
    clock = FakeClock(20.0)
    redis = FakeRedis(fail_ping=True)
    cache = RuntimeCache(
        redis_factory=lambda url: redis,
        clock=clock,
        redis_retry_seconds=30,
    )
    monkeypatch.setattr(
        cache_module.event_store,
        "record_service_event",
        lambda **event: events.append(event) or True,
    )
    await cache.start(redis_url="redis://cache.test")

    await cache.set_json("live", {"lap": 27}, 30)

    assert await cache.get_json("live") == {"lap": 27}
    assert redis.ping_calls == 1
    assert cache.status()["backend"] == "memory"
    assert cache.status()["status"] == "degraded"
    assert cache.status()["last_error"] == "ConnectionError"
    assert cache.status()["retry_after_seconds"] == 30.0
    assert events == [
        {
            "event_type": "cache_fallback",
            "source": "redis",
            "outcome": "used",
            "fallback_used": True,
            "error_code": "ConnectionError",
            "context": {"operation": "connect", "cache_backend": "memory"},
        }
    ]


@pytest.mark.asyncio
async def test_event_recorder_failure_does_not_break_memory_fallback(monkeypatch):
    redis = FakeRedis(fail_ping=True)
    cache = RuntimeCache(redis_factory=lambda url: redis)

    def failed_recorder(**event):
        raise RuntimeError("event queue unavailable")

    monkeypatch.setattr(
        cache_module.event_store,
        "record_service_event",
        failed_recorder,
    )

    await cache.start(redis_url="redis://cache.test")
    await cache.set_json("live", {"lap": 27}, 30)

    assert await cache.get_json("live") == {"lap": 27}
    assert cache.status()["backend"] == "memory"


@pytest.mark.asyncio
async def test_runtime_redis_failure_recovers_after_cooldown():
    clock = FakeClock(50.0)
    redis = FakeRedis()
    cache = RuntimeCache(
        redis_factory=lambda url: redis,
        clock=clock,
        redis_retry_seconds=10,
    )
    await cache.start(redis_url="redis://cache.test")
    await cache.set_json("companion", {"headline": "Old note"}, 30)
    redis.fail_operations = True

    await cache.set_json("companion", {"headline": "Fresh tyres matter"}, 30)

    assert cache.status()["status"] == "degraded"
    assert await cache.get_json("companion") == {"headline": "Fresh tyres matter"}

    redis.fail_operations = False
    clock.advance(10)
    assert await cache.get_json("companion") == {"headline": "Fresh tyres matter"}
    assert json.loads(redis.values["companion"]) == {"headline": "Fresh tyres matter"}
    assert cache.status()["status"] == "available"
    assert cache.status()["backend"] == "redis"
    assert redis.ping_calls == 2


@pytest.mark.asyncio
async def test_failed_redis_delete_does_not_restore_stale_live_state():
    clock = FakeClock(75.0)
    redis = FakeRedis()
    cache = RuntimeCache(
        redis_factory=lambda url: redis,
        clock=clock,
        redis_retry_seconds=5,
    )
    await cache.start(redis_url="redis://cache.test")
    await cache.set_json("live", {"active": True, "lap": 30}, 30)
    redis.fail_operations = True

    await cache.delete("live", stale_ttl_seconds=30)

    assert await cache.get_json("live") is None
    assert "live" in redis.values

    redis.fail_operations = False
    clock.advance(5)
    assert await cache.get_json("live") is None
    assert "live" not in redis.values


@pytest.mark.asyncio
async def test_rate_limiter_counts_requests_and_opens_a_new_window():
    clock = FakeClock(120.0)
    cache = RuntimeCache(memory=MemoryCache(clock=clock), clock=clock)
    limiter = RateLimiter(cache, clock=clock)

    first = await limiter.check("companion", "anonymous-hash", limit=2, window_seconds=60)
    second = await limiter.check("companion", "anonymous-hash", limit=2, window_seconds=60)
    blocked = await limiter.check("companion", "anonymous-hash", limit=2, window_seconds=60)

    assert first.allowed is True
    assert first.remaining == 1
    assert second.allowed is True
    assert second.remaining == 0
    assert blocked.allowed is False
    assert blocked.retry_after_seconds == 60

    clock.advance(60)
    recovered = await limiter.check("companion", "anonymous-hash", limit=2, window_seconds=60)
    assert recovered.allowed is True
    assert recovered.remaining == 1
