"""
Optional AI refinement for RaceDay companion notes.

This module keeps API keys on the backend and only runs when a provider key
is available. It refines already-structured companion notes into shorter,
clearer fan language. If the provider fails or no key is configured, callers
should keep the non-AI note unchanged.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

OPENAI_KEY = os.getenv("OPENAI_API_KEY", "").strip()
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()


def refine_companion_note(
    payload: dict[str, Any],
    base_note: dict[str, Any],
    analysis: dict[str, Any] | None = None,
    live_state: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    Ask an AI provider to rewrite an existing companion note in beginner language.

    Returns a dict with headline/notes/source when successful, or None when no
    provider is available or the provider fails.
    """
    provider = _selected_provider()
    if provider is None:
        return None

    prompt = _build_prompt(payload, base_note, analysis=analysis, live_state=live_state)

    try:
        if provider == "openai":
            refined = _call_openai(prompt)
        else:
            refined = _call_gemini(prompt)
    except Exception as exc:
        logger.info("companion_ai_failed", extra={"provider": provider, "error": str(exc)})
        return None

    if not refined:
        return None

    return _normalize_ai_note(refined, base_note)


def _selected_provider() -> str | None:
    if OPENAI_KEY:
        return "openai"
    if GEMINI_KEY:
        return "gemini"
    return None


def _build_prompt(
    payload: dict[str, Any],
    base_note: dict[str, Any],
    analysis: dict[str, Any] | None = None,
    live_state: dict[str, Any] | None = None,
) -> str:
    mode = payload.get("mode") or base_note.get("mode") or "replay"
    headline = base_note.get("headline") or ""
    notes = base_note.get("notes") or []
    race_name = payload.get("raceName") or analysis.get("raceName") if analysis else payload.get("raceName") or ""
    track = payload.get("track") or analysis.get("track") if analysis else payload.get("track") or ""
    chapter = payload.get("chapter") or ""
    current_time = payload.get("currentTime") or 0
    duration = payload.get("duration") or 0
    if analysis:
        chapter = chapter or analysis.get("chapter") or ""
        current_time = current_time or analysis.get("currentTime") or 0
        duration = duration or analysis.get("duration") or 0

    live_bits = []
    if live_state:
        live_bits.append(f"lap {live_state.get('lap')}/{live_state.get('totalLaps') or '?'}")
        if live_state.get("alerts"):
            live_bits.append(f"alert: {live_state['alerts'][0].get('text', '')}")

    payload_blob = {
        "mode": mode,
        "raceName": race_name,
        "track": track,
        "chapter": chapter,
        "currentTime": current_time,
        "duration": duration,
        "baseHeadline": headline,
        "baseNotes": notes[:3],
        "liveContext": live_bits[:2],
    }

    return f"""
You are RaceDay, a friendly F1 companion for beginners.

Rewrite the note below so it sounds like a smart fan explaining the race to a friend sitting beside them.
Rules:
- Keep the same meaning.
- Use simple, conversational language.
- Keep it unique to this specific race moment.
- Avoid recap-style wording like a news summary.
- Do not mention driver codes in the text.
- Do not use radio, transcript, caption, or commentator text.
- Do not turn the note into a result recap unless the race is actually at the finish.
- Return only JSON.
- JSON shape: {{"headline":"...", "notes":["...","...","..."]}}
- headline: one short sentence, max 14 words.
- notes: 2 to 4 short lines, each max 22 words.
- The full result should not be the focus unless the context is the last part of the race.
- At least one line should explain why the moment matters.
- Do not add filler or markdown.

Context:
{json.dumps(payload_blob, ensure_ascii=False)}
""".strip()


def _call_openai(prompt: str) -> str | None:
    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4.1-mini",
            "temperature": 0.3,
            "messages": [
                {"role": "system", "content": "You rewrite F1 strategy notes in simple beginner language."},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=10,
    )
    if resp.status_code != 200:
        logger.warning("OpenAI companion refine failed: %s %s", resp.status_code, resp.text[:120])
        return None
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content")


def _call_gemini(prompt: str) -> str | None:
    resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}",
        headers={"Content-Type": "application/json"},
        json={
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 250,
            },
        },
        timeout=10,
    )
    if resp.status_code != 200:
        logger.warning("Gemini companion refine failed: %s %s", resp.status_code, resp.text[:120])
        return None
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts") or []
    return "".join(part.get("text", "") for part in parts).strip() or None


def _normalize_ai_note(raw: str, fallback: dict[str, Any]) -> dict[str, Any] | None:
    text = raw.strip()
    if not text:
        return None

    parsed = _parse_json_blob(text)
    if parsed:
        headline = _clean_line(parsed.get("headline")) or fallback.get("headline") or ""
        notes = [_clean_line(note) for note in parsed.get("notes", []) if _clean_line(note)]
        if headline or notes:
            return {
                "headline": headline or fallback.get("headline") or "",
                "notes": notes[:4] or list(fallback.get("notes") or [])[:4],
                "source": "ai-explainer",
            }

    lines = [line.strip("-• \t") for line in text.splitlines() if line.strip()]
    if not lines:
        return None

    headline = lines[0]
    notes = lines[1:4]
    return {
        "headline": headline or fallback.get("headline") or "",
        "notes": notes or list(fallback.get("notes") or [])[:4],
        "source": "ai-explainer",
    }


def _parse_json_blob(text: str) -> dict[str, Any] | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict):
        return payload
    return None


def _clean_line(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()
