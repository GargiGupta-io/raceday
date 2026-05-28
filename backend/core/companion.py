"""
RaceDay companion intelligence.

This module is the backend "brain" for the browser companion. It does not
render UI, call external AI providers, or know anything about browser popups.
It takes video/live context and returns short fan-facing notes that the
extension can display with its existing overlay.
"""

from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher
from typing import Any

from backend.core import indexer, insights
from backend.core import companion_ai

logger = logging.getLogger(__name__)


RaceAlias = dict[str, Any]


RACE_ALIASES: list[RaceAlias] = [
    {"keys": ["australian", "australia", "melbourne"], "name": "Australian GP", "track": "Australian Grand Prix", "laps": 58},
    {"keys": ["chinese", "china", "shanghai"], "name": "Chinese GP", "track": "Chinese Grand Prix", "laps": 56},
    {"keys": ["japanese", "japan", "suzuka"], "name": "Japanese GP", "track": "Japanese Grand Prix", "laps": 53},
    {"keys": ["bahrain", "sakhir"], "name": "Bahrain GP", "track": "Bahrain Grand Prix", "laps": 57},
    {"keys": ["saudi", "jeddah"], "name": "Saudi Arabian GP", "track": "Saudi Arabian Grand Prix", "laps": 50},
    {"keys": ["miami"], "name": "Miami GP", "track": "Miami Grand Prix", "laps": 57},
    {"keys": ["emilia", "imola"], "name": "Emilia Romagna GP", "track": "Emilia Romagna Grand Prix", "laps": 63},
    {"keys": ["monaco", "monte carlo"], "name": "Monaco GP", "track": "Monaco Grand Prix", "laps": 78},
    {"keys": ["canadian", "canada", "montreal"], "name": "Canadian GP", "track": "Canadian Grand Prix", "laps": 70},
    {"keys": ["spanish", "spain", "barcelona"], "name": "Spanish GP", "track": "Spanish Grand Prix", "laps": 66},
    {"keys": ["austrian", "austria", "spielberg"], "name": "Austrian GP", "track": "Austrian Grand Prix", "laps": 71},
    {"keys": ["british", "silverstone"], "name": "British GP", "track": "British Grand Prix", "laps": 52},
    {"keys": ["hungarian", "hungary", "hungaroring"], "name": "Hungarian GP", "track": "Hungarian Grand Prix", "laps": 70},
    {"keys": ["belgian", "belgium", "spa"], "name": "Belgian GP", "track": "Belgian Grand Prix", "laps": 44},
    {"keys": ["dutch", "netherlands", "zandvoort"], "name": "Dutch GP", "track": "Dutch Grand Prix", "laps": 72},
    {"keys": ["italian", "monza"], "name": "Italian GP", "track": "Italian Grand Prix", "laps": 53},
    {"keys": ["azerbaijan", "baku"], "name": "Azerbaijan GP", "track": "Azerbaijan Grand Prix", "laps": 51},
    {"keys": ["singapore", "marina bay"], "name": "Singapore GP", "track": "Singapore Grand Prix", "laps": 62},
    {"keys": ["united states", "austin", "cota"], "name": "United States GP", "track": "United States Grand Prix", "laps": 56},
    {"keys": ["mexico", "mexican"], "name": "Mexico City GP", "track": "Mexico City Grand Prix", "laps": 71},
    {"keys": ["brazil", "sao paulo", "interlagos"], "name": "Sao Paulo GP", "track": "Sao Paulo Grand Prix", "laps": 71},
    {"keys": ["las vegas", "vegas"], "name": "Las Vegas GP", "track": "Las Vegas Grand Prix", "laps": 50},
    {"keys": ["qatar", "lusail"], "name": "Qatar GP", "track": "Qatar Grand Prix", "laps": 57},
    {"keys": ["abu dhabi", "yas marina"], "name": "Abu Dhabi GP", "track": "Abu Dhabi Grand Prix", "laps": 58},
]


FALLBACK_MOMENTS = [
    {
        "id": "race-start",
        "label": "race start",
        "startRatio": 0.0,
        "endRatio": 0.10,
        "headline": "The opening laps are about track position.",
        "notes": [
            "Cars are close together, so one good start can change the whole race.",
            "Watch who gets clean air and who gets stuck behind slower cars.",
        ],
        "source": "backend-fallback",
    },
    {
        "id": "opening-laps",
        "label": "opening laps",
        "startRatio": 0.10,
        "endRatio": 0.25,
        "headline": "Teams are learning who has real pace.",
        "notes": [
            "Drivers close behind another car can overheat their tyres.",
            "This is where the first strategy pressure starts building.",
        ],
        "source": "backend-fallback",
    },
    {
        "id": "first-pit-window",
        "label": "first pit choices",
        "startRatio": 0.25,
        "endRatio": 0.45,
        "headline": "The first pit choices can change the order.",
        "notes": [
            "Stopping early gives fresh tyres, but traffic can ruin the gain.",
            "Staying out protects track position, but old tyres can fade quickly.",
        ],
        "source": "backend-fallback",
    },
    {
        "id": "middle-stint",
        "label": "middle stint",
        "startRatio": 0.45,
        "endRatio": 0.68,
        "headline": "This is the main strategy fight.",
        "notes": [
            "Gaps, tyre age, and pit timing are all linked now.",
            "A small gap can become important if a pit stop drops a driver into traffic.",
        ],
        "source": "backend-fallback",
    },
    {
        "id": "late-race",
        "label": "late-race pressure",
        "startRatio": 0.68,
        "endRatio": 0.88,
        "headline": "Late tyre life can decide the fight.",
        "notes": [
            "Fresh tyres are dangerous because there is less time to respond.",
            "The driver ahead needs clean exits and no mistakes.",
        ],
        "source": "backend-fallback",
    },
    {
        "id": "finish",
        "label": "final laps",
        "startRatio": 0.88,
        "endRatio": 1.01,
        "headline": "The final laps are about pressure.",
        "notes": [
            "Strategy is mostly done now; execution matters most.",
            "One lock-up, bad exit, or traffic moment can still change the result.",
        ],
        "source": "backend-fallback",
    },
]


def analyze_video_context(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Identify the race/video and prepare a reusable companion timeline.
    """
    title = _clean_text(payload.get("title"))
    chapter = _clean_text(payload.get("chapter"))
    transcript = _normalize_transcript(payload.get("transcript") or payload.get("transcriptText"))
    url = _clean_text(payload.get("url"))
    year = _detect_year(payload.get("year"), title)
    race = _detect_race(title, payload.get("raceName") or payload.get("track"))
    duration = _to_float(payload.get("duration"))
    current_time = _to_float(payload.get("currentTime"))

    timeline = build_replay_timeline(year, race["track"], duration) if year and race else []
    if not timeline:
        timeline = _fallback_timeline(duration)

    confidence = "high" if year and race else "medium" if race else "low"
    source = "race-data" if year and race else "video-title"

    return {
        "ok": True,
        "mode": payload.get("mode") or "replay",
        "url": url,
        "title": title,
        "year": year,
        "raceName": race["name"] if race else "",
        "track": race["track"] if race else "",
        "totalLaps": race["laps"] if race else None,
        "duration": duration,
        "currentTime": current_time,
        "chapter": chapter,
        "transcript": transcript,
        "confidence": confidence,
        "source": source,
        "timeline": timeline,
    }


def build_companion_note(
    payload: dict[str, Any],
    analysis: dict[str, Any] | None = None,
    live_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Return one short companion note for the current live/replay context.
    """
    mode = payload.get("mode") or (analysis or {}).get("mode") or "replay"
    if mode == "live" and live_state:
        note = build_live_note(live_state)
        return _refine_with_ai(payload, note, analysis=analysis, live_state=live_state)

    analysis = analysis or analyze_video_context(payload)
    race_data = _safe_call(indexer.load_race_index, analysis.get("year"), analysis.get("track")) or {}
    profile = _race_profile(race_data) if race_data else {}
    ratio = _time_ratio(
        _to_float(payload.get("currentTime"), analysis.get("currentTime") or 0),
        _to_float(payload.get("duration"), analysis.get("duration") or 0),
    )
    moment = pick_timeline_moment(
        analysis.get("timeline") or [],
        _to_float(payload.get("currentTime"), analysis.get("currentTime") or 0),
        _to_float(payload.get("duration"), analysis.get("duration") or 0),
        payload.get("chapter") or analysis.get("chapter"),
        payload.get("transcript") or payload.get("transcriptText") or analysis.get("transcript"),
    )

    replay_note = _build_replay_companion_note(
        payload=payload,
        analysis=analysis,
        moment=moment,
        profile=profile,
        ratio=ratio,
    )

    headline = replay_note.get("headline") or "RaceDay is watching this race moment."
    notes = [note for note in replay_note.get("notes", []) if note][:4]

    note = {
        "ok": True,
        "mode": "replay",
        "headline": headline,
        "notes": notes,
        "momentLabel": replay_note.get("momentLabel") or moment.get("label") or "race moment",
        "confidence": moment.get("confidence") or analysis.get("confidence") or "medium",
        "source": replay_note.get("source") or moment.get("source") or analysis.get("source") or "backend-companion",
    }
    return _refine_with_ai(payload, note, analysis=analysis)


def build_live_note(live_state: dict[str, Any]) -> dict[str, Any]:
    """
    Convert live race data into one beginner-friendly companion note.
    """
    alerts = live_state.get("alerts") or []
    predictions = live_state.get("predictions") or []
    drivers = sorted(live_state.get("drivers") or [], key=lambda d: d.get("position", 99))

    notes: list[str] = []
    headline = ""
    lap = live_state.get("lap")
    total_laps = live_state.get("totalLaps")

    if alerts:
        headline = _beginnerize(str(alerts[0].get("text", "")))

    if not headline and len(drivers) >= 2:
        first = drivers[0].get("name") or drivers[0].get("code") or "The leader"
        second = drivers[1].get("name") or drivers[1].get("code") or "second place"
        gap = _parse_gap(drivers[1].get("gap"))
        if gap is not None and gap <= 1.5:
            headline = f"{_first_name(second)} is close enough to pressure {_first_name(first)}."
        else:
            headline = f"{_first_name(second)} is chasing {_first_name(first)}."

    if not headline:
        headline = "RaceDay is watching for strategy changes."

    if lap and total_laps:
        notes.append(f"Lap {lap}/{total_laps} is where the next move could change the race.")

    for prediction in predictions[:2]:
        driver = _driver_name(prediction.get("driver"), drivers)
        if driver:
            notes.append(f"{driver} may stop soon, and that can flip track position fast.")

    for driver in drivers[:6]:
        tyre_life = driver.get("tyreLife")
        if isinstance(tyre_life, (int, float)) and tyre_life <= 35:
            notes.append(f"{_first_name(driver.get('name') or driver.get('code'))}'s tyres are fading, so the pace may drop soon.")

    if not notes:
        notes.append("Watch tyre age, gaps, and pit timing. That usually explains the next big move.")
        if len(drivers) >= 2:
            notes.append(f"{_first_name(drivers[1].get('name') or drivers[1].get('code'))} is the first one to watch.")

    note = {
        "ok": True,
        "mode": "live",
        "headline": headline,
        "notes": _dedupe(notes)[:4],
        "momentLabel": f"Lap {live_state.get('lap')}" if live_state.get("lap") else "live race",
        "confidence": "medium",
        "source": "live-state",
    }
    return note


def build_replay_timeline(year: int, track: str, duration: float = 0) -> list[dict[str, Any]]:
    """
    Build a race-aware replay timeline using existing RaceDay data.
    """
    race_data = _safe_call(indexer.load_race_index, year, track) or {}
    profile = _race_profile(race_data)
    moments = _safe_call(insights.get_key_moments, year, track) or []
    story = _safe_call(insights.get_race_story, year, track) or {}
    strategy = _safe_call(insights.get_strategy_breakdown, year, track) or []

    timeline = _fallback_timeline(duration)
    _apply_profile_context(timeline, profile)

    story_lines = [line for line in story.get("narrative", []) if isinstance(line, str)]
    for index, line in enumerate(story_lines[: min(3, len(timeline))]):
        line_text = _beginnerize(line)
        if _looks_like_recap(line_text):
            line_text = _trim_replay_line(_clean_talky_line(line_text))
        timeline[index]["notes"] = [line_text, *timeline[index]["notes"][:1]]
        timeline[index]["source"] = "race-story"
        timeline[index]["confidence"] = "high"

    for index, moment in enumerate(moments[: len(timeline)]):
        target = _moment_slot(moment, index, len(timeline))
        headline = _clean_text(moment.get("headline")) or timeline[target]["headline"]
        detail = _clean_text(moment.get("detail"))
        notes = [_beginnerize(detail)] if detail else timeline[target]["notes"]
        timeline[target] = {
            **timeline[target],
            "headline": headline,
            "notes": _dedupe([*notes, *timeline[target]["notes"]])[:3],
            "source": "race-moments",
            "confidence": "high",
        }

    strategy_notes = _strategy_notes(strategy)
    if strategy_notes:
        timeline[2]["notes"] = _dedupe([*strategy_notes, *timeline[2]["notes"]])[:3]
        timeline[2]["source"] = "race-strategy"

    stint_notes = _stint_notes(profile)
    if stint_notes:
        timeline[2]["notes"] = _dedupe([*stint_notes[:2], *timeline[2]["notes"]])[:3]
        timeline[3]["notes"] = _dedupe([*stint_notes[2:], *timeline[3]["notes"]])[:3]
        timeline[2]["source"] = "race-stints"
        timeline[3]["source"] = "race-stints"

    return timeline


def pick_timeline_moment(
    timeline: list[dict[str, Any]],
    current_time: float,
    duration: float,
    chapter: str | None = None,
    transcript: str | None = None,
) -> dict[str, Any]:
    if not timeline:
        return FALLBACK_MOMENTS[0]

    ratio = _time_ratio(current_time, duration)
    time_match = _match_time(timeline, ratio)
    clean_chapter = _normalize_chapter(chapter)
    if clean_chapter:
        chapter_match, chapter_score = _match_chapter(timeline, clean_chapter)
        if chapter_match and chapter_score >= 0.58:
            return {
                **chapter_match,
                "notes": _dedupe([
                    f"This part is about {clean_chapter.lower()}. Watch how it changes the strategy picture.",
                    *chapter_match.get("notes", []),
                ])[:3],
                "confidence": "high",
                "source": "video-chapter",
            }

        if chapter_match and chapter_score >= 0.35 and chapter_match.get("id") == time_match.get("id"):
            return {
                **time_match,
                "notes": _dedupe([
                    f"The video chapter mentions {clean_chapter.lower()}, which lines up with this race phase.",
                    *time_match.get("notes", []),
                ])[:3],
                "confidence": "high",
                "source": "timestamp-and-chapter",
            }

    clean_transcript = _normalize_transcript(transcript)
    if clean_transcript:
        transcript_match, transcript_score = _match_chapter(timeline, clean_transcript)
        if transcript_match and transcript_score >= 0.58:
            return {
                **transcript_match,
                "notes": _dedupe([
                    f"The transcript points to {clean_transcript.lower()}. Watch how it changes the strategy picture.",
                    *transcript_match.get("notes", []),
                ])[:3],
                "confidence": "high",
                "source": "video-transcript",
            }

        if transcript_match and transcript_score >= 0.35 and transcript_match.get("id") == time_match.get("id"):
            return {
                **time_match,
                "notes": _dedupe([
                    f"The transcript lines up with this race phase, so the commentary is reinforcing the same moment.",
                    *time_match.get("notes", []),
                ])[:3],
                "confidence": "high",
                "source": "timestamp-and-transcript",
            }

    return time_match


def _detect_year(raw_year: Any, title: str) -> int | None:
    if isinstance(raw_year, int):
        return raw_year
    if isinstance(raw_year, str) and raw_year.isdigit():
        return int(raw_year)
    match = re.search(r"\b(20\d{2})\b", title)
    return int(match.group(1)) if match else None


def _detect_race(title: str, fallback: Any = None) -> RaceAlias | None:
    haystack = f"{title} {_clean_text(fallback)}".lower()
    return next((race for race in RACE_ALIASES if any(key in haystack for key in race["keys"])), None)


def _fallback_timeline(duration: float = 0) -> list[dict[str, Any]]:
    timeline = []
    for moment in FALLBACK_MOMENTS:
        start = moment["startRatio"] * duration if duration else None
        end = moment["endRatio"] * duration if duration else None
        timeline.append({**moment, "startTime": start, "endTime": end, "confidence": "medium"})
    return timeline


def _time_ratio(current_time: float, duration: float) -> float:
    if duration <= 0:
        return 0
    if 0 <= current_time <= 1:
        return current_time
    return max(0, min(1, current_time / duration))


def _match_time(timeline: list[dict[str, Any]], ratio: float) -> dict[str, Any]:
    best_moment = timeline[-1]
    best_distance = 2.0
    for moment in timeline:
        start = float(moment.get("startRatio", 0))
        end = float(moment.get("endRatio", 1))
        if start <= ratio < end:
            return {
                **moment,
                "confidence": moment.get("confidence") or "medium",
                "source": moment.get("source") or "timestamp",
            }
        midpoint = start + ((end - start) / 2)
        distance = abs(ratio - midpoint)
        if distance < best_distance:
            best_distance = distance
            best_moment = moment
    return {
        **best_moment,
        "confidence": best_moment.get("confidence") or "low",
        "source": best_moment.get("source") or "nearest-timestamp",
    }


def _match_chapter(timeline: list[dict[str, Any]], chapter: str) -> tuple[dict[str, Any] | None, float]:
    chapter_lower = chapter.lower()
    chapter_tokens = _content_tokens(chapter_lower)
    if not chapter_tokens:
        return None, 0

    best_score = 0.0
    best_moment = None
    for moment in timeline:
        text = " ".join([
            str(moment.get("id", "")),
            str(moment.get("label", "")),
            str(moment.get("headline", "")),
            " ".join(moment.get("notes", [])),
        ]).lower()
        moment_tokens = _content_tokens(text)
        overlap = len(chapter_tokens & moment_tokens) / max(1, len(chapter_tokens))
        fuzzy = SequenceMatcher(None, chapter_lower, text[:160]).ratio()
        score = (overlap * 0.7) + (fuzzy * 0.3)
        if _chapter_keyword_bonus(chapter_tokens, moment):
            score += 0.25
        if score > best_score:
            best_score = score
            best_moment = moment
    return best_moment, best_score


def _normalize_chapter(value: Any) -> str:
    title = _clean_text(value)
    if not title or len(title) < 3:
        return ""
    if not re.search(r"[a-z0-9]", title, re.IGNORECASE):
        return ""
    if re.fullmatch(r"[.\-_:;|/\\()[\]{}]+", title):
        return ""
    if title.lower() in {"chapter", "chapters", "key moment", "key moments"}:
        return ""
    return title


def _normalize_transcript(value: Any) -> str:
    text = _clean_text(value)
    if not text or len(text) < 4:
        return ""
    if not re.search(r"[a-z0-9]", text, re.IGNORECASE):
        return ""
    return text


def _content_tokens(value: str) -> set[str]:
    stop_words = {
        "race", "races", "formula", "grand", "prix", "highlight", "highlights",
        "chapter", "video", "this", "that", "with", "from", "into", "about",
    }
    return {
        token for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 2 and token not in stop_words
    }


def _chapter_keyword_bonus(tokens: set[str], moment: dict[str, Any]) -> bool:
    moment_id = str(moment.get("id", ""))
    label = str(moment.get("label", "")).lower()
    haystack = f"{moment_id} {label}"
    keyword_groups = {
        "race start": {"start", "lights", "launch", "lap"},
        "first pit choices": {"pit", "stop", "stops", "strategy"},
        "middle stint": {"battle", "fight", "pressure", "tyre", "tire"},
        "late-race pressure": {"late", "attack", "defend", "finish"},
        "final laps": {"finish", "flag", "final", "podium"},
    }
    return any(name in haystack and tokens & words for name, words in keyword_groups.items())


def _strategy_notes(strategy: list[dict[str, Any]]) -> list[str]:
    if not strategy:
        return []

    stop_counts: dict[int, int] = {}
    for row in strategy:
        stops = row.get("stops")
        if isinstance(stops, int):
            stop_counts[stops] = stop_counts.get(stops, 0) + 1

    if not stop_counts:
        return []

    common_stops = max(stop_counts, key=stop_counts.get)
    return [
        f"Most drivers used a {common_stops}-stop plan, so pit timing mattered more than raw speed.",
    ]


def _race_profile(data: dict[str, Any]) -> dict[str, Any]:
    results = data.get("results") or []
    weather = data.get("weather") or {}
    stints = data.get("stints") or {}
    finishers = sorted(
        [row for row in results if row.get("finish_position") is not None],
        key=lambda row: row.get("finish_position", 99),
    )
    retired = [
        row for row in results
        if row.get("status") not in ("Finished",)
        and not str(row.get("status", "")).startswith("+")
    ]

    first_stops = []
    stop_counts: dict[int, int] = {}
    for driver, driver_stints in stints.items():
        if not isinstance(driver_stints, list) or not driver_stints:
            continue
        stops = max(0, len(driver_stints) - 1)
        stop_counts[stops] = stop_counts.get(stops, 0) + 1
        if len(driver_stints) >= 2:
            first_stops.append({
                "driver": driver,
                "lap": driver_stints[0].get("lap_end"),
                "nextCompound": driver_stints[1].get("compound"),
            })

    first_stops = [stop for stop in first_stops if isinstance(stop.get("lap"), int)]
    first_stops.sort(key=lambda stop: stop["lap"])

    return {
        "winner": finishers[0] if finishers else None,
        "podium": finishers[:3],
        "weather": weather,
        "retiredCount": len(retired),
        "firstStops": first_stops,
        "stopCounts": stop_counts,
    }


def _apply_profile_context(timeline: list[dict[str, Any]], profile: dict[str, Any]) -> None:
    condition = _clean_text((profile.get("weather") or {}).get("condition"))
    if condition and condition != "dry":
        timeline[1]["notes"] = _dedupe([
            f"The race was {condition}, so grip and timing mattered more than usual.",
            *timeline[1]["notes"],
        ])[:3]
        timeline[1]["source"] = "race-weather"

    retired_count = profile.get("retiredCount") or 0
    if retired_count >= 4:
        target = min(len(timeline) - 1, 4)
        timeline[target]["notes"] = _dedupe([
            f"{retired_count} drivers retired, so staying out of trouble was part of the strategy.",
            *timeline[target]["notes"],
        ])[:3]
        timeline[target]["source"] = "race-results"


def _stint_notes(profile: dict[str, Any]) -> list[str]:
    notes = []
    first_stops = profile.get("firstStops") or []
    stop_counts = profile.get("stopCounts") or {}

    if first_stops:
        first = first_stops[0]
        last = first_stops[-1]
        notes.append(f"{first.get('driver')} was one of the first to stop around lap {first.get('lap')}.")
        if last.get("lap") and first.get("lap") and last["lap"] - first["lap"] >= 8:
            notes.append("The first pit window was spread out, which usually means teams disagreed on tyre life.")

    if stop_counts:
        common_stops = max(stop_counts, key=stop_counts.get)
        count = stop_counts[common_stops]
        notes.append(f"{count} drivers used a {common_stops}-stop race, making it the main strategy pattern.")

    return notes


def _build_replay_companion_note(
    payload: dict[str, Any],
    analysis: dict[str, Any],
    moment: dict[str, Any],
    profile: dict[str, Any],
    ratio: float,
) -> dict[str, Any]:
    race_name = _clean_text(payload.get("raceName") or analysis.get("raceName") or "")
    track = _clean_text(payload.get("track") or analysis.get("track") or race_name)
    headline = _replay_headline(moment, profile, ratio)
    notes = _replay_notes(moment, profile, ratio, race_name, track)

    return {
        "headline": headline,
        "notes": notes,
        "momentLabel": _replay_moment_label(moment, profile, ratio),
        "source": moment.get("source") or analysis.get("source") or "backend-companion",
    }


def _replay_headline(moment: dict[str, Any], profile: dict[str, Any], ratio: float) -> str:
    if ratio >= 0.88:
        return "The result is starting to settle."

    condition = _clean_text((profile.get("weather") or {}).get("condition"))
    if condition and condition != "dry":
        return "The weather is changing how this race feels."

    label = _clean_text(moment.get("label")).lower()
    moment_type = _clean_text(moment.get("type")).lower()
    headline = _clean_text(moment.get("headline"))

    if "pit" in label or "stop" in label or moment_type == "undercut":
        return "The next stop could change who stays ahead."

    if moment_type in {"biggest_gainer", "comeback"}:
        return "Someone is making a real move through the field."

    if moment_type in {"biggest_loser", "attrition"}:
        return "The race is getting messy enough to matter."

    if moment_type == "dominant_win":
        return "The leader is setting the tone now."

    if headline and not _looks_like_recap(headline):
        return _trim_replay_line(_clean_talky_line(headline))

    return "This part of the race is starting to matter more."


def _replay_notes(
    moment: dict[str, Any],
    profile: dict[str, Any],
    ratio: float,
    race_name: str,
    track: str,
) -> list[str]:
    notes: list[str] = []
    moment_notes = [n for n in moment.get("notes", []) if n]
    summary = _summary_line_from_moment(moment, ratio)
    if summary:
        notes.append(summary)

    why = _why_this_matters(moment, profile, ratio, race_name, track)
    if why:
        notes.append(why)

    race_texture = _race_texture_line(profile, ratio)
    if race_texture:
        notes.append(race_texture)

    filtered_moment_notes = []
    for line in moment_notes:
        if ratio < 0.85 and _looks_like_recap(line):
            continue
        filtered_moment_notes.append(_clean_talky_line(line))

    if filtered_moment_notes:
        notes.append(filtered_moment_notes[0])
        if len(filtered_moment_notes) > 1:
            notes.append(filtered_moment_notes[1])
    elif not summary:
        notes.append("This is where the race starts to lean one way.")

    return _dedupe([_cleanup_replay_line(note) for note in notes])[:4]


def _summary_line_from_moment(moment: dict[str, Any], ratio: float) -> str:
    headline = _clean_text(moment.get("headline"))
    label = _clean_text(moment.get("label"))
    if not headline:
        return ""

    if ratio < 0.85 and _looks_like_recap(headline):
        if label:
            return _clean_talky_line(f"{label} is where the race starts to lean one way.")
        return "This is where the race starts to lean one way."

    if _looks_like_recap(headline):
        if ratio >= 0.88:
            return "The race is close to being decided."
        if label:
            return _clean_talky_line(f"{label} is where the race starts to matter more.")
        return "This is where the race starts to matter more."

    return _trim_replay_line(_clean_talky_line(headline))


def _why_this_matters(
    moment: dict[str, Any],
    profile: dict[str, Any],
    ratio: float,
    race_name: str,
    track: str,
) -> str:
    label = _clean_text(moment.get("label")).lower()
    moment_type = _clean_text(moment.get("type")).lower()
    condition = _clean_text((profile.get("weather") or {}).get("condition"))
    stop_counts = profile.get("stopCounts") or {}
    retired_count = profile.get("retiredCount") or 0

    if ratio >= 0.88:
        return "This part matters because one mistake now can decide the podium."

    if moment_type in {"dominant_win", "biggest_gainer", "comeback"}:
        return "This matters because clean air and timing are deciding who gets the advantage."

    if "pit" in label or "stop" in label or moment_type == "undercut":
        return "A pit stop here could flip track position before the race settles."

    if condition and condition != "dry":
        return f"The {condition} conditions are making grip and timing more important than raw pace."

    if len(stop_counts) >= 2 and max(stop_counts) - min(stop_counts) >= 1:
        return "The field split on strategy, so one stop timing mistake can matter more than speed."

    if retired_count >= 4:
        return "The attrition is high enough that staying clean is part of the strategy now."

    if race_name or track:
        return "This is the part where the race story starts to narrow down to a few key fights."

    return "This is the part where the next move matters more than the last one."


def _race_texture_line(profile: dict[str, Any], ratio: float) -> str:
    condition = _clean_text((profile.get("weather") or {}).get("condition"))
    retired_count = profile.get("retiredCount") or 0
    stop_counts = profile.get("stopCounts") or {}
    first_stops = profile.get("firstStops") or []

    if condition and condition != "dry":
        return f"The race has been {condition}, so every lap is asking more of the tyres."

    if len(stop_counts) >= 2:
        common_stop = max(stop_counts, key=stop_counts.get)
        return f"The grid is split between {common_stop}-stop and other plans, which keeps the strategy picture open."

    if first_stops:
        first = first_stops[0]
        lap = first.get("lap")
        driver = _clean_text(first.get("driver"))
        if lap:
            if driver:
                return f"{driver} was one of the first to stop, so the pit timing story is already moving."
            return f"The first pit call came on lap {lap}, which usually means the tyre story is already changing."

    if retired_count >= 4:
        return f"{retired_count} drivers have already dropped out, so staying out of trouble matters."

    if ratio >= 0.7:
        return "The tyres are getting old enough that one clean lap can matter more than a full push."

    return ""


def _replay_moment_label(moment: dict[str, Any], profile: dict[str, Any], ratio: float) -> str:
    if ratio >= 0.88:
        return "final laps"

    moment_type = _clean_text(moment.get("type")).lower()
    label = _clean_text(moment.get("label"))

    if moment_type in {"biggest_gainer", "comeback"}:
        return "someone is moving through the field"
    if moment_type in {"biggest_loser", "attrition"}:
        return "the race is getting messy"
    if "pit" in label.lower() or "stop" in label.lower() or moment_type == "undercut":
        return "the pit call is the key"
    if _clean_text((profile.get("weather") or {}).get("condition")) not in {"", "dry"}:
        return "the weather is shaping the race"
    return "this race is opening up"


def _looks_like_recap(text: str) -> bool:
    lowered = _clean_text(text).lower()
    return any(word in lowered for word in ["won", "finished", "podium", "victory", "converted pole", "claimed victory"])


def _clean_talky_line(text: str) -> str:
    clean = _clean_text(text)
    clean = re.sub(r"\s*\([A-Z0-9]{2,4}\)", "", clean)
    clean = re.sub(r"\bwon\b", "is in control", clean, flags=re.I)
    clean = re.sub(r"\bfinished second\b", "is running second", clean, flags=re.I)
    clean = re.sub(r"\bfinished third\b", "is running third", clean, flags=re.I)
    clean = re.sub(r"\bconverted pole position into victory\b", "is controlling the race from the front", clean, flags=re.I)
    clean = re.sub(r"\bstormed from P\d+\s+to win\b", "is charging through the field", clean, flags=re.I)
    clean = re.sub(r"\bpodium\b", "the front group", clean, flags=re.I)
    return clean


def _trim_replay_line(text: str) -> str:
    line = _clean_text(text)
    if not line:
        return ""

    for separator in [". ", "; ", " - ", " — ", ", "]:
        if separator in line:
            line = line.split(separator, 1)[0]
            break

    line = re.sub(r"\s+", " ", line).strip(" -")
    if len(line) > 120:
        line = f"{line[:117].rstrip()}..."
    return line


def _cleanup_replay_line(text: str) -> str:
    line = _clean_talky_line(text)
    line = re.sub(r"\s+", " ", line).strip(" -")
    if len(line) > 170:
        line = f"{line[:167].rstrip()}..."
    return line


def _moment_slot(moment: dict[str, Any], index: int, timeline_length: int) -> int:
    moment_type = _clean_text(moment.get("type"))
    preferred = {
        "dominant_win": 0,
        "biggest_gainer": 1,
        "biggest_loser": 1,
        "comeback": 3,
        "undercut": 2,
        "close_battle": 4,
        "attrition": 4,
    }
    return min(preferred.get(moment_type, index + 1), timeline_length - 1)


def _safe_call(func, *args):
    try:
        return func(*args)
    except Exception as exc:
        logger.info("companion_source_unavailable", extra={"source": getattr(func, "__name__", "unknown"), "error": str(exc)})
        return None


def _beginnerize(text: str) -> str:
    return _clean_text(text).replace("undercut", "early-stop advantage").replace("overcut", "staying out longer")


def _driver_name(code: Any, drivers: list[dict[str, Any]]) -> str:
    for driver in drivers:
        if driver.get("code") == code:
            return _first_name(driver.get("name") or driver.get("code"))
    return _clean_text(code)


def _first_name(value: Any) -> str:
    return _clean_text(value).split(" ")[0]


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _to_float(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_gap(value: Any) -> float | None:
    text = _clean_text(value)
    if not text or text.upper() == "LEADER":
        return None
    match = re.search(r"([-+]?\d+(?:\.\d+)?)", text)
    if not match:
        return None
    try:
        return abs(float(match.group(1)))
    except ValueError:
        return None


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        clean = _clean_text(item)
        if clean and clean not in seen:
            seen.add(clean)
            result.append(clean)
    return result


def _refine_with_ai(
    payload: dict[str, Any],
    base_note: dict[str, Any],
    analysis: dict[str, Any] | None = None,
    live_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    refined = companion_ai.refine_companion_note(payload, base_note, analysis=analysis, live_state=live_state)
    if not refined:
        return base_note

    notes = _dedupe([
        *refined.get("notes", []),
        *base_note.get("notes", []),
    ])[:3]

    return {
        **base_note,
        "headline": refined.get("headline") or base_note.get("headline"),
        "notes": notes,
        "source": refined.get("source", "ai-explainer"),
    }
