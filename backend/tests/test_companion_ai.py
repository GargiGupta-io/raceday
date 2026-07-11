import pytest

from backend.core import companion, companion_ai, event_store, http_client


BASE_NOTE = {
    "ok": True,
    "mode": "replay",
    "headline": "The pit call matters now.",
    "notes": ["Fresh tyres can change the order."],
}


class FakeRuntimeCache:
    def __init__(self, *, fail: bool = False):
        self.values = {}
        self.fail = fail
        self.set_calls = []

    async def get_json(self, key, **kwargs):
        if self.fail:
            raise ConnectionError("cache unavailable")
        return self.values.get(key)

    async def set_json(self, key, value, ttl_seconds):
        if self.fail:
            raise ConnectionError("cache unavailable")
        self.values[key] = value
        self.set_calls.append((key, value, ttl_seconds))


@pytest.mark.asyncio
async def test_missing_provider_key_keeps_deterministic_note_path(monkeypatch):
    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")

    result = await companion_ai.refine_companion_note({}, BASE_NOTE)

    assert result is None


@pytest.mark.asyncio
async def test_openai_refinement_uses_protected_upstream_client(monkeypatch):
    captured = {}

    async def request_json(method, url, **kwargs):
        captured.update({"method": method, "url": url, **kwargs})
        return {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"headline":"The first stop could swing this fight.",'
                            '"notes":["Fresh tyres matter only if the driver rejoins in clean air."]}'
                        )
                    }
                }
            ]
        }

    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "test-openai-key")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")
    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)

    result = await companion_ai.refine_companion_note(
        {"raceName": "Canadian Grand Prix", "currentTime": 120, "duration": 480},
        BASE_NOTE,
    )

    assert result["source"] == "ai-explainer"
    assert result["headline"] == "The first stop could swing this fight."
    assert captured["source"] == "ai"
    assert captured["operation"] == "openai-companion-refine"
    assert captured["headers"]["Authorization"] == "Bearer test-openai-key"


@pytest.mark.asyncio
async def test_gemini_key_is_sent_as_a_parameter_not_in_the_url(monkeypatch):
    captured = {}

    async def request_json(method, url, **kwargs):
        captured.update({"method": method, "url": url, **kwargs})
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": (
                                    '{"headline":"Traffic decides whether this stop works.",'
                                    '"notes":["Clean air lets the fresh tyres deliver their advantage."]}'
                                )
                            }
                        ]
                    }
                }
            ]
        }

    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "test-gemini-key")
    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)

    result = await companion_ai.refine_companion_note({}, BASE_NOTE)

    assert result["headline"] == "Traffic decides whether this stop works."
    assert "test-gemini-key" not in captured["url"]
    assert captured["params"] == {"key": "test-gemini-key"}
    assert captured["source"] == "ai"


@pytest.mark.asyncio
async def test_provider_failure_returns_deterministic_fallback_signal(monkeypatch):
    events = []

    async def request_json(*args, **kwargs):
        raise http_client.UpstreamRequestError(
            "ai",
            "openai-companion-refine",
            attempts=2,
            retryable=True,
            reason="timeout",
        )

    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "test-openai-key")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")
    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)
    monkeypatch.setattr(
        event_store,
        "record_service_event",
        lambda **event: events.append(event) or True,
    )

    result = await companion_ai.refine_companion_note({}, BASE_NOTE)

    assert result is None
    assert events == [
        {
            "event_type": "fallback",
            "source": "ai",
            "outcome": "used",
            "fallback_used": True,
            "error_code": "UpstreamRequestError",
            "context": {"provider": "openai"},
        }
    ]


@pytest.mark.asyncio
async def test_event_recorder_failure_does_not_block_ai_fallback(monkeypatch):
    async def request_json(*args, **kwargs):
        raise TimeoutError("provider unavailable")

    def failed_recorder(**event):
        raise RuntimeError("event queue unavailable")

    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "test-openai-key")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")
    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)
    monkeypatch.setattr(event_store, "record_service_event", failed_recorder)

    assert await companion_ai.refine_companion_note({}, BASE_NOTE) is None


@pytest.mark.asyncio
async def test_identical_companion_moment_reuses_cached_ai_note(monkeypatch):
    calls = 0
    fake_cache = FakeRuntimeCache()

    async def request_json(*args, **kwargs):
        nonlocal calls
        calls += 1
        return {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"headline":"Traffic decides this stop.",'
                            '"notes":["Fresh tyres help only with clear road ahead."]}'
                        )
                    }
                }
            ]
        }

    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "test-openai-key")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")
    monkeypatch.setattr(companion_ai.cache, "runtime_cache", fake_cache)
    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)

    first = await companion_ai.refine_companion_note(
        {"raceName": "Dutch Grand Prix", "currentTime": 120, "duration": 480},
        BASE_NOTE,
    )
    second = await companion_ai.refine_companion_note(
        {"raceName": "Dutch Grand Prix", "currentTime": 128, "duration": 480},
        BASE_NOTE,
    )

    assert first == second
    assert calls == 1
    assert fake_cache.set_calls[0][2] == companion_ai.COMPANION_AI_CACHE_TTL_SECONDS


@pytest.mark.asyncio
async def test_cache_failure_does_not_block_ai_refinement(monkeypatch):
    async def request_json(*args, **kwargs):
        return {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"headline":"The timing of this stop matters.",'
                            '"notes":["Traffic can erase the fresh-tyre advantage."]}'
                        )
                    }
                }
            ]
        }

    monkeypatch.setattr(companion_ai, "OPENAI_KEY", "test-openai-key")
    monkeypatch.setattr(companion_ai, "GEMINI_KEY", "")
    monkeypatch.setattr(
        companion_ai.cache,
        "runtime_cache",
        FakeRuntimeCache(fail=True),
    )
    monkeypatch.setattr(http_client.upstream_client, "request_json", request_json)

    result = await companion_ai.refine_companion_note(
        {"raceName": "Singapore Grand Prix", "currentTime": 200},
        BASE_NOTE,
    )

    assert result["headline"] == "The timing of this stop matters."


@pytest.mark.asyncio
async def test_async_companion_wrapper_refines_the_deterministic_note(monkeypatch):
    monkeypatch.setattr(
        companion,
        "build_companion_note",
        lambda *args, **kwargs: BASE_NOTE,
    )

    async def refine(*args, **kwargs):
        return {
            "headline": "The pit timing controls this fight.",
            "notes": ["Stopping first works only if the driver avoids traffic."],
            "source": "ai-explainer",
        }

    monkeypatch.setattr(companion_ai, "refine_companion_note", refine)

    result = await companion.build_companion_note_with_ai(
        {"mode": "replay", "raceName": "Canadian Grand Prix"}
    )

    assert result["headline"] == "The pit timing controls this fight."
    assert result["source"] == "ai-explainer"
    assert "Fresh tyres can change the order." in result["notes"]
