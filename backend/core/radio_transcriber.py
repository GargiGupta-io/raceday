"""
radio_transcriber.py — Team Radio Transcription Pipeline

Downloads team radio MP3 clips and transcribes them to text.
Supports multiple backends:
  1. Groq API (free tier, fast) — set GROQ_API_KEY in .env
  2. OpenAI API — set OPENAI_API_KEY in .env
  3. No transcription — clips returned with transcript=None

All results are cached to disk so each clip is only transcribed once.
"""

import hashlib
import json
import logging
import os
import tempfile
from pathlib import Path

import requests

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# Cache directory for downloaded audio and transcriptions
_CACHE_DIR = Path(os.getenv("INDEX_DIR", "./data/index")).resolve() / "_radio_cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_GROQ_KEY = os.getenv("GROQ_API_KEY", "")
_OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")


# ---------------------------------------------------------------------------
# Audio download
# ---------------------------------------------------------------------------


def _clip_id(url: str) -> str:
    """Generate a short stable ID from an audio URL."""
    return hashlib.md5(url.encode()).hexdigest()[:12]


def _download_clip(url: str) -> Path | None:
    """
    Download an MP3 clip to the cache directory.
    Returns the local file path, or None on failure.
    Skips download if already cached.
    """
    clip_hash = _clip_id(url)
    local_path = _CACHE_DIR / f"{clip_hash}.mp3"

    if local_path.exists():
        return local_path

    try:
        # F1 CDN requires browser-like headers
        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.formula1.com/",
        })
        if resp.status_code == 200:
            local_path.write_bytes(resp.content)
            return local_path
        logger.warning("Download failed for %s: HTTP %s", url[-40:], resp.status_code)
    except requests.RequestException as exc:
        logger.warning("Download failed for %s: %s", url[-40:], exc)

    return None


# ---------------------------------------------------------------------------
# Transcription backends
# ---------------------------------------------------------------------------


def _transcribe_groq(audio_path: Path) -> str | None:
    """Transcribe using Groq's free Whisper API."""
    if not _GROQ_KEY:
        return None

    try:
        with open(audio_path, "rb") as f:
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {_GROQ_KEY}"},
                files={"file": (audio_path.name, f, "audio/mpeg")},
                data={"model": "whisper-large-v3", "language": "en"},
                timeout=30,
            )
        if resp.status_code == 200:
            return resp.json().get("text", "").strip()
        logger.warning("Groq transcription failed: %s %s", resp.status_code, resp.text[:100])
    except requests.RequestException as exc:
        logger.warning("Groq request failed: %s", exc)

    return None


def _transcribe_openai(audio_path: Path) -> str | None:
    """Transcribe using OpenAI's Whisper API."""
    if not _OPENAI_KEY:
        return None

    try:
        with open(audio_path, "rb") as f:
            resp = requests.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {_OPENAI_KEY}"},
                files={"file": (audio_path.name, f, "audio/mpeg")},
                data={"model": "whisper-1", "language": "en"},
                timeout=30,
            )
        if resp.status_code == 200:
            return resp.json().get("text", "").strip()
        logger.warning("OpenAI transcription failed: %s %s", resp.status_code, resp.text[:100])
    except requests.RequestException as exc:
        logger.warning("OpenAI request failed: %s", exc)

    return None


def _transcribe_local(audio_path: Path) -> str | None:
    """Transcribe using local Whisper model (if installed)."""
    try:
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(str(audio_path), language="en", fp16=False)
        return result.get("text", "").strip()
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("Local whisper failed: %s", exc)

    return None


# ---------------------------------------------------------------------------
# Main transcription pipeline
# ---------------------------------------------------------------------------


def _get_transcript_cache_path(url: str) -> Path:
    """Return the path where a transcription is cached."""
    return _CACHE_DIR / f"{_clip_id(url)}.json"


def transcribe_clip(url: str) -> str | None:
    """
    Transcribe a single radio clip. Tries cache first, then available
    backends in order: Groq → OpenAI → local Whisper.
    Returns the transcript text, or None if no backend is available.
    """
    cache_path = _get_transcript_cache_path(url)

    # Check cache
    if cache_path.exists():
        try:
            data = json.loads(cache_path.read_text(encoding="utf-8"))
            return data.get("transcript")
        except (json.JSONDecodeError, OSError):
            pass

    # Download the audio
    audio_path = _download_clip(url)
    if audio_path is None:
        return None

    # Try backends in order
    transcript = None
    backend_used = None

    if _GROQ_KEY:
        transcript = _transcribe_groq(audio_path)
        if transcript:
            backend_used = "groq"

    if transcript is None and _OPENAI_KEY:
        transcript = _transcribe_openai(audio_path)
        if transcript:
            backend_used = "openai"

    if transcript is None:
        transcript = _transcribe_local(audio_path)
        if transcript:
            backend_used = "local"

    # Cache the result (even if None, to avoid re-trying)
    try:
        cache_path.write_text(
            json.dumps({
                "url": url,
                "transcript": transcript,
                "backend": backend_used,
            }, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("Failed to cache transcription: %s", exc)

    if transcript:
        logger.debug("Transcribed via %s: %s", backend_used, transcript[:60])

    return transcript


def transcribe_clips(clips: list[dict]) -> list[dict]:
    """
    Transcribe a list of radio clips (from openf1_radio.get_team_radio).
    Adds a 'transcript' key to each clip dict.
    Returns the clips with transcripts added.
    """
    backend = "none"
    if _GROQ_KEY:
        backend = "groq"
    elif _OPENAI_KEY:
        backend = "openai"
    else:
        # Check local whisper availability
        try:
            import whisper
            backend = "local"
        except ImportError:
            pass

    if backend == "none":
        logger.info(
            "No transcription backend available. Set GROQ_API_KEY or "
            "OPENAI_API_KEY in .env for transcription. Returning clips without transcripts."
        )
        for clip in clips:
            clip["transcript"] = None
        return clips

    logger.info("Transcribing %d clips using %s backend...", len(clips), backend)

    for i, clip in enumerate(clips):
        url = clip.get("recording_url", "")
        if url:
            clip["transcript"] = transcribe_clip(url)
        else:
            clip["transcript"] = None

        if (i + 1) % 20 == 0:
            logger.info("  Transcribed %d/%d clips...", i + 1, len(clips))

    transcribed = sum(1 for c in clips if c.get("transcript"))
    logger.info(
        "Transcription complete: %d/%d clips transcribed via %s",
        transcribed, len(clips), backend,
    )

    return clips


def get_backend_status() -> dict:
    """Return info about which transcription backend is available."""
    available = []
    if _GROQ_KEY:
        available.append("groq")
    if _OPENAI_KEY:
        available.append("openai")
    try:
        import whisper
        available.append("local")
    except ImportError:
        pass

    return {
        "available_backends": available,
        "active": available[0] if available else None,
        "has_transcription": len(available) > 0,
    }


# ---------------------------------------------------------------------------
# __main__ test block
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("=== Transcription Backend Status ===")
    status = get_backend_status()
    print(f"  Available: {status['available_backends']}")
    print(f"  Active:    {status['active']}")
    print(f"  Has transcription: {status['has_transcription']}")

    print(f"\n=== Cache directory ===")
    print(f"  {_CACHE_DIR}")
    print(f"  Exists: {_CACHE_DIR.exists()}")

    # Test downloading a single clip
    test_url = "https://livetiming.formula1.com/static/2023/2023-07-09_British_Grand_Prix/2023-07-09_Race/TeamRadio/MAXVER01_1_20230709_151735.mp3"
    print(f"\n=== Download test ===")
    path = _download_clip(test_url)
    if path:
        size = path.stat().st_size
        print(f"  Downloaded: {path.name} ({size:,} bytes)")
    else:
        print("  Download failed!")

    # Test transcription (will only work if a backend is available)
    if status["has_transcription"]:
        print(f"\n=== Transcription test (via {status['active']}) ===")
        text = transcribe_clip(test_url)
        print(f"  Transcript: {text}")
    else:
        print("\n=== No transcription backend — skipping transcription test ===")
        print("  To enable: set GROQ_API_KEY or OPENAI_API_KEY in .env")
