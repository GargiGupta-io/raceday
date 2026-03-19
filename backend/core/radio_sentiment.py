"""
radio_sentiment.py — Team Radio Sentiment Tagger

Scores radio clips by emotional intensity using two methods:
  1. Keyword rules (when transcripts are available)
  2. Timing proximity to key moments (always works)

Returns the top N most interesting clips for display on the race page.
"""

import logging
import re

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Keyword-based sentiment scoring (requires transcripts)
# ---------------------------------------------------------------------------

# Words/phrases that signal high emotion, grouped by category.
# Each entry: (pattern, score_boost, sentiment_label)
_POSITIVE_PATTERNS = [
    (r"\b(yes+|yeah+|woo+|let'?s go)\b", 8, "celebration"),
    (r"\b(amazing|incredible|brilliant|fantastic|beautiful)\b", 7, "celebration"),
    (r"\b(great (job|race|drive|work|lap|pace))\b", 6, "praise"),
    (r"\bwell done\b", 6, "praise"),
    (r"\b(p[12]|win|won|winner|victory|podium)\b", 5, "result"),
    (r"\b(fastest lap)\b", 5, "achievement"),
    (r"\b(perfect|mega|superb)\b", 5, "celebration"),
    (r"\bgood (pace|job|work)\b", 4, "praise"),
    (r"\b(love it|lovely)\b", 4, "celebration"),
]

_NEGATIVE_PATTERNS = [
    (r"\b(no+!|come on!?|seriously)\b", 7, "frustration"),
    (r"\b(what (the|are|is) (hell|f\w+|happened|going on))\b", 8, "frustration"),
    (r"\b(ridiculous|unacceptable|joke|stupid)\b", 7, "frustration"),
    (r"\b(crash|accident|collision|contact|hit|puncture)\b", 6, "incident"),
    (r"\b(retire|retir(ed|ement)|dnf|out of the race)\b", 6, "retirement"),
    (r"\b(penalty|black.?flag|warning|investigation)\b", 5, "stewards"),
    (r"\b(problem|issue|failure|broken|damage)\b", 5, "technical"),
    (r"\b(slow|struggling|losing|lost)\b", 4, "struggle"),
    (r"\b(pain|hurts?|suffering)\b", 4, "struggle"),
    (r"\b(unsafe|dangerous)\b", 5, "safety"),
    (r"\b(blue flags?|move|let me past)\b", 4, "frustration"),
    (r"\b(tyres? (are )?(gone|dead|finished|destroyed))\b", 6, "tyre_deg"),
    (r"\b(can'?t hold|sliding|grip)\b", 4, "tyre_deg"),
]

_INTENSITY_PATTERNS = [
    # Exclamation marks, caps, repeated letters boost intensity
    (r"!{2,}", 3, "emphasis"),
    (r"\b[A-Z]{3,}\b", 2, "shouting"),
    (r"(.)\1{2,}", 2, "emphasis"),  # repeated letters like "yesss" or "nooo"
]

_STRATEGIC_PATTERNS = [
    (r"\b(box|pit|pit stop|stay out|opposite|overcut|undercut)\b", 5, "strategy"),
    (r"\b(plan [a-f]|option [a-c]|switch)\b", 4, "strategy"),
    (r"\b(push now|push hard|send it|full (attack|beans))\b", 5, "attack"),
    (r"\b(defend|hold position|stay behind|drs)\b", 4, "defence"),
    (r"\b(rain|wet|dry|intermediate|slick)\b", 4, "weather"),
    (r"\b(safety car|vsc|red flag|yellow flag)\b", 6, "race_control"),
]


def _score_transcript(text: str) -> tuple[float, str, list[str]]:
    """
    Score a transcript by keyword matching.

    Returns: (score, primary_sentiment, matched_tags)
    """
    if not text:
        return 0.0, "neutral", []

    text_lower = text.lower()
    total_score = 0.0
    tags = []
    sentiments = {"positive": 0, "negative": 0, "strategic": 0, "neutral": 0}

    for pattern, score, label in _POSITIVE_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        if matches:
            total_score += score * len(matches)
            sentiments["positive"] += score * len(matches)
            tags.append(label)

    for pattern, score, label in _NEGATIVE_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        if matches:
            total_score += score * len(matches)
            sentiments["negative"] += score * len(matches)
            tags.append(label)

    for pattern, score, label in _INTENSITY_PATTERNS:
        # No IGNORECASE here — [A-Z]{3,} must stay case-sensitive for shouting detection
        matches = re.findall(pattern, text)
        if matches:
            total_score += score * len(matches)
            tags.append(label)

    for pattern, score, label in _STRATEGIC_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        if matches:
            total_score += score * len(matches)
            sentiments["strategic"] += score * len(matches)
            tags.append(label)

    # Determine primary sentiment
    if sentiments["negative"] > sentiments["positive"] and sentiments["negative"] > sentiments["strategic"]:
        primary = "frustration"
    elif sentiments["positive"] > sentiments["negative"] and sentiments["positive"] > sentiments["strategic"]:
        primary = "celebration"
    elif sentiments["strategic"] > 0:
        primary = "strategy"
    else:
        primary = "neutral"

    # Bonus for longer messages (drivers say more when emotional)
    word_count = len(text.split())
    if word_count > 15:
        total_score += 2
    if word_count > 25:
        total_score += 3

    return total_score, primary, list(set(tags))


# ---------------------------------------------------------------------------
# Timing-based scoring (works without transcripts)
# ---------------------------------------------------------------------------


def _score_timing(clip: dict, key_moments: list[dict] | None) -> float:
    """
    Score a clip based on when it happened relative to key moments.
    Clips near pit stops, overtakes, or retirements are more interesting.
    """
    score = 0.0
    clip_lap = clip.get("lap")
    if clip_lap is None:
        return 0.0

    if key_moments:
        for moment in key_moments:
            # Check if the clip's driver is involved in a key moment
            if clip.get("driver_code") == moment.get("driver"):
                score += 4  # Driver-specific moment match

    # Race start (lap 1-3) and final laps are inherently interesting
    if clip_lap <= 3:
        score += 3
    elif clip_lap >= 45:  # typical race is 50-70 laps
        score += 2

    return score


# ---------------------------------------------------------------------------
# Main scoring and selection
# ---------------------------------------------------------------------------


def score_clips(
    clips: list[dict],
    key_moments: list[dict] | None = None,
    top_n: int = 5,
) -> list[dict]:
    """
    Score and rank radio clips by emotional intensity.

    Each clip gets:
        score       — combined sentiment + timing score
        sentiment   — 'celebration', 'frustration', 'strategy', or 'neutral'
        tags        — list of matched categories

    Returns the top_n highest-scored clips, sorted by score descending.
    """
    scored = []

    for clip in clips:
        transcript = clip.get("transcript")

        # Keyword score (if transcript available)
        text_score, sentiment, tags = _score_transcript(transcript or "")

        # Timing score (always available)
        timing_score = _score_timing(clip, key_moments)

        # Combined score
        total = text_score + timing_score

        # If no transcript, fall back to timing-only with a small baseline
        # so clips near moments still surface
        if not transcript and timing_score > 0:
            sentiment = "unknown"
            tags = ["no_transcript"]

        scored.append({
            **clip,
            "score": round(total, 1),
            "sentiment": sentiment,
            "tags": tags,
        })

    # Sort by score descending
    scored.sort(key=lambda c: c["score"], reverse=True)

    # Deduplicate: avoid showing 3 clips from the same driver back-to-back
    selected = []
    driver_count: dict[str, int] = {}
    for clip in scored:
        code = clip.get("driver_code", "???")
        if driver_count.get(code, 0) >= 2:
            continue  # max 2 clips per driver
        selected.append(clip)
        driver_count[code] = driver_count.get(code, 0) + 1
        if len(selected) >= top_n:
            break

    return selected


# ---------------------------------------------------------------------------
# __main__ test block
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Test keyword scoring with sample transcripts
    test_transcripts = [
        "Yes! Yes! What a race! Amazing job everyone!",
        "What the hell happened? That's ridiculous!",
        "Box box, box this lap. Plan B.",
        "Tyres are gone, I'm sliding everywhere, can't hold this position.",
        "Okay.",
        "Safety car, safety car. Stay out, stay out!",
        "LET'S GOOOOO! P1! YESSS!",
        "Rain is coming, should we go to inters?",
        None,  # no transcript
    ]

    print("=== Keyword Scoring Tests ===")
    for text in test_transcripts:
        score, sentiment, tags = _score_transcript(text or "")
        display = (text or "(no transcript)")[:50]
        print(f"  {score:5.1f}  {sentiment:12s}  {tags[:3]!s:40s}  {display}")

    # Test with mock clips
    print("\n=== Clip Selection Test ===")
    mock_clips = [
        {"driver_code": "VER", "driver_name": "Max Verstappen", "lap": 1, "transcript": "Let's go, come on!", "recording_url": "test1.mp3", "date": ""},
        {"driver_code": "HAM", "driver_name": "Lewis Hamilton", "lap": 22, "transcript": "What happened? That's not right!", "recording_url": "test2.mp3", "date": ""},
        {"driver_code": "LEC", "driver_name": "Charles Leclerc", "lap": 23, "transcript": "Why did we pit now? I had pace!", "recording_url": "test3.mp3", "date": ""},
        {"driver_code": "NOR", "driver_name": "Lando Norris", "lap": 45, "transcript": "Tyres are dead, I'm sliding.", "recording_url": "test4.mp3", "date": ""},
        {"driver_code": "ALO", "driver_name": "Fernando Alonso", "lap": 50, "transcript": "Okay.", "recording_url": "test5.mp3", "date": ""},
        {"driver_code": "VER", "driver_name": "Max Verstappen", "lap": 52, "transcript": "YES! Get in! What a race!", "recording_url": "test6.mp3", "date": ""},
        {"driver_code": "PER", "driver_name": "Sergio Perez", "lap": 30, "transcript": None, "recording_url": "test7.mp3", "date": ""},
    ]

    mock_moments = [
        {"type": "biggest_gainer", "driver": "HAM"},
        {"type": "biggest_loser", "driver": "LEC"},
    ]

    top = score_clips(mock_clips, mock_moments, top_n=5)
    for c in top:
        t = (c.get("transcript") or "(no transcript)")[:40]
        print(f"  {c['score']:5.1f}  {c['driver_code']}  {c['sentiment']:12s}  {t}")
