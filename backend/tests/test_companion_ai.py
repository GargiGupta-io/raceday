import pytest

from backend.core import companion, companion_ai, http_client


BASE_NOTE = {
    "ok": True,
    "mode": "replay",
    "headline": "The pit call matters now.",
    "notes": ["Fresh tyres can change the order."],
}


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

    result = await companion_ai.refine_companion_note({}, BASE_NOTE)

    assert result is None


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
