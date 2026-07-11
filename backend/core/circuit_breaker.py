"""Concurrency-safe circuit breakers for RaceDay upstream services."""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class CircuitBreakerPolicy:
    failure_threshold: int = 5
    recovery_timeout_seconds: float = 30.0

    def __post_init__(self):
        if self.failure_threshold < 1:
            raise ValueError("failure_threshold must be at least 1")
        if self.recovery_timeout_seconds <= 0:
            raise ValueError("recovery_timeout_seconds must be positive")


@dataclass(frozen=True)
class CircuitPermit:
    source: str
    generation: int
    probe: bool = False


class CircuitBreakerOpen(RuntimeError):
    def __init__(self, source: str, retry_after_seconds: float):
        super().__init__(f"{source} circuit is open")
        self.source = source
        self.retry_after_seconds = max(0.0, retry_after_seconds)


Clock = Callable[[], float]


class CircuitBreaker:
    """Track failures and allow only one recovery probe after a cooldown."""

    def __init__(
        self,
        source: str,
        policy: CircuitBreakerPolicy | None = None,
        *,
        clock: Clock = time.monotonic,
    ):
        self.source = source.strip().lower()
        if not self.source:
            raise ValueError("source cannot be empty")

        self.policy = policy or CircuitBreakerPolicy()
        self._clock = clock
        self._lock = asyncio.Lock()
        self._state = "closed"
        self._failure_count = 0
        self._opened_at: float | None = None
        self._probe_in_flight = False
        self._generation = 0

    async def acquire(self) -> CircuitPermit:
        async with self._lock:
            now = self._clock()

            if self._state == "closed":
                return CircuitPermit(self.source, self._generation)

            if self._state == "open":
                retry_after = self._retry_after(now)
                if retry_after > 0:
                    raise CircuitBreakerOpen(self.source, retry_after)

                self._state = "half_open"
                self._probe_in_flight = True
                self._generation += 1
                return CircuitPermit(self.source, self._generation, probe=True)

            if self._probe_in_flight:
                raise CircuitBreakerOpen(self.source, 0.0)

            self._probe_in_flight = True
            return CircuitPermit(self.source, self._generation, probe=True)

    async def record_success(self, permit: CircuitPermit):
        async with self._lock:
            if not self._permit_is_current(permit):
                return

            if self._state == "closed":
                self._failure_count = 0
                return

            if self._state == "half_open" and permit.probe:
                self._state = "closed"
                self._failure_count = 0
                self._opened_at = None
                self._probe_in_flight = False
                self._generation += 1

    async def record_failure(self, permit: CircuitPermit):
        async with self._lock:
            if not self._permit_is_current(permit):
                return

            now = self._clock()
            if self._state == "half_open" and permit.probe:
                self._open(now)
                return

            if self._state != "closed":
                return

            self._failure_count += 1
            if self._failure_count >= self.policy.failure_threshold:
                self._open(now)

    async def abandon(self, permit: CircuitPermit):
        """Release a cancelled half-open probe without counting a provider failure."""
        async with self._lock:
            if not self._permit_is_current(permit):
                return
            if self._state == "half_open" and permit.probe:
                self._open(self._clock())

    async def reset(self):
        async with self._lock:
            self._state = "closed"
            self._failure_count = 0
            self._opened_at = None
            self._probe_in_flight = False
            self._generation += 1

    def snapshot(self) -> dict:
        now = self._clock()
        return {
            "source": self.source,
            "state": self._state,
            "failure_count": self._failure_count,
            "failure_threshold": self.policy.failure_threshold,
            "recovery_timeout_seconds": self.policy.recovery_timeout_seconds,
            "retry_after_seconds": round(self._retry_after(now), 3)
            if self._state == "open"
            else 0.0,
            "probe_in_flight": self._probe_in_flight,
        }

    def _permit_is_current(self, permit: CircuitPermit) -> bool:
        return permit.source == self.source and permit.generation == self._generation

    def _retry_after(self, now: float) -> float:
        if self._opened_at is None:
            return 0.0
        elapsed = max(0.0, now - self._opened_at)
        return max(0.0, self.policy.recovery_timeout_seconds - elapsed)

    def _open(self, now: float):
        self._state = "open"
        self._opened_at = now
        self._probe_in_flight = False
        self._generation += 1


DEFAULT_SOURCE_POLICIES: dict[str, CircuitBreakerPolicy] = {
    "openf1": CircuitBreakerPolicy(failure_threshold=4, recovery_timeout_seconds=20.0),
    "jolpica": CircuitBreakerPolicy(failure_threshold=5, recovery_timeout_seconds=30.0),
    "openmeteo": CircuitBreakerPolicy(failure_threshold=5, recovery_timeout_seconds=30.0),
    "ai": CircuitBreakerPolicy(failure_threshold=3, recovery_timeout_seconds=30.0),
}


class CircuitBreakerRegistry:
    """Keep circuit state isolated per upstream source."""

    def __init__(
        self,
        policies: dict[str, CircuitBreakerPolicy] | None = None,
        *,
        default_policy: CircuitBreakerPolicy | None = None,
        clock: Clock = time.monotonic,
    ):
        self._policies = dict(policies or {})
        self._default_policy = default_policy or CircuitBreakerPolicy()
        self._clock = clock
        self._lock = threading.Lock()
        self._breakers: dict[str, CircuitBreaker] = {
            source: CircuitBreaker(source, policy, clock=clock)
            for source, policy in self._policies.items()
        }

    def get(self, source: str) -> CircuitBreaker:
        source_key = source.strip().lower()
        if not source_key:
            raise ValueError("source cannot be empty")

        with self._lock:
            breaker = self._breakers.get(source_key)
            if breaker is None:
                breaker = CircuitBreaker(
                    source_key,
                    self._policies.get(source_key, self._default_policy),
                    clock=self._clock,
                )
                self._breakers[source_key] = breaker
            return breaker

    def snapshot(self) -> dict[str, dict]:
        with self._lock:
            breakers = list(self._breakers.items())
        return {source: breaker.snapshot() for source, breaker in breakers}

    async def reset_all(self):
        with self._lock:
            breakers = list(self._breakers.values())
        for breaker in breakers:
            await breaker.reset()
