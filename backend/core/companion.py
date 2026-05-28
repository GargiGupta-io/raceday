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
        return build_live_note(live_state)

    analysis = analysis or analyze_video_context(payload)
    moment = pick_timeline_moment(
        analysis.get("timeline") or [],
        _to_float(payload.get("currentTime"), analysis.get("currentTime") or 0),
        _to_float(payload.get("duration"), analysis.get("duration") or 0),
        payload.get("chapter") or analysis.get("chapter"),
    )

    headline = moment.get("headline") or "RaceDay is watching this race moment."
    notes = [note for note in moment.get("notes", []) if note][:3]

    return {
        "ok": True,
        "mode": "replay",
        "headline": headline,
        "notes": notes,
        "momentLabel": moment.get("label") or "race moment",
        "confidence": moment.get("confidence") or analysis.get("confidence") or "medium",
        "source": moment.get("source") or analysis.get("source") or "backend-companion",
    }


def build_live_note(live_state: dict[str, Any]) -> dict[str, Any]:
    """
    Convert live race data into one beginner-friendly companion note.
    """
    alerts = live_state.get("alerts") or []
    predictions = live_state.get("predictions") or []
    drivers = sorted(live_state.get("drivers") or [], key=lambda d: d.get("position", 99))

    notes: list[str] = []
    headline = ""

    if alerts:
        headline = _beginnerize(str(alerts[0].get("text", "")))

    if not headline and len(drivers) >= 2:
        first = drivers[0].get("name") or drivers[0].get("code") or "The leader"
        second = drivers[1].get("name") or drivers[1].get("code") or "second place"
        headline = f"{_first_name(second)} is chasing {_first_name(first)}."

    if not headline:
        headline = "RaceDay is watching for strategy changes."

    for prediction in predictions[:2]:
        driver = _driver_name(prediction.get("driver"), drivers)
        if driver:
            notes.append(f"{driver} may stop soon for fresh tyres.")

    for driver in drivers[:6]:
        tyre_life = driver.get("tyreLife")
        if isinstance(tyre_life, (int, float)) and tyre_life <= 35:
            notes.append(f"{_first_name(driver.get('name') or driver.get('code'))}'s tyres are fading, so they may slow down soon.")

    if not notes:
        notes.append("Watch tyre age, gaps, and pit timing. Those usually explain the next big move.")

    return {
        "ok": True,
        "mode": "live",
        "headline": headline,
        "notes": _dedupe(notes)[:3],
        "momentLabel": f"Lap {live_state.get('lap')}" if live_state.get("lap") else "live race",
        "confidence": "medium",
        "source": "live-state",
    }


def build_replay_timeline(year: int, track: str, duration: float = 0) -> list[dict[str, Any]]:
    """
    Build a race-aware replay timeline using existing RaceDay data.
    """
    race_data = _safe_call(indexer.load_race_index, year, track) or {}
    profile = _race_profile(race_data)
    moments = _safe_call(insights.get_key_moments, year, track) or []
    story = _safe_call(insights.get_race_story, year, track) or {}
    tagline = _safe_call(insights.generate_race_tagline, year, track)
    strategy = _safe_call(insights.get_strategy_breakdown, year, track) or []

    timeline = _fallback_timeline(duration)
    _apply_profile_context(timeline, profile)

    if tagline:
        timeline[0] = {
            **timeline[0],
            "headline": tagline,
            "notes": _dedupe([*timeline[0]["notes"], *_podium_notes(profile)])[:3],
            "source": "race-story",
            "confidence": "medium",
        }

    story_lines = [line for line in story.get("narrative", []) if isinstance(line, str)]
    for index, line in enumerate(story_lines[: min(3, len(timeline))]):
        timeline[index]["notes"] = [_beginnerize(line), *timeline[index]["notes"][:1]]
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
) -> dict[str, Any]:
    if not timeline:
        return FALLBACK_MOMENTS[0]

    clean_chapter = _clean_text(chapter)
    if clean_chapter:
        chapter_match = _match_chapter(timeline, clean_chapter)
        if chapter_match:
            return {
                **chapter_match,
                "notes": _dedupe([
                    f"This part is about {clean_chapter.lower()}. Watch how it changes the strategy picture.",
                    *chapter_match.get("notes", []),
                ])[:3],
                "confidence": "high",
                "source": "video-chapter",
            }

    ratio = 0 if duration <= 0 else max(0, min(1, current_time / duration))
    for moment in timeline:
        if moment.get("startRatio", 0) <= ratio < moment.get("endRatio", 1):
            return moment

    return timeline[-1]


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


def _match_chapter(timeline: list[dict[str, Any]], chapter: str) -> dict[str, Any] | None:
    chapter_lower = chapter.lower()
    best_score = 0.0
    best_moment = None
    for moment in timeline:
        text = " ".join([
            str(moment.get("label", "")),
            str(moment.get("headline", "")),
            " ".join(moment.get("notes", [])),
        ]).lower()
        score = SequenceMatcher(None, chapter_lower, text).ratio()
        if any(word in text for word in chapter_lower.split() if len(word) > 3):
            score += 0.25
        if score > best_score:
            best_score = score
            best_moment = moment
    return best_moment if best_score >= 0.35 else None


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
    podium_notes = _podium_notes(profile)
    if podium_notes:
        timeline[0]["notes"] = _dedupe([*podium_notes, *timeline[0]["notes"]])[:3]
        timeline[0]["source"] = "race-results"

    condition = _clean_text((profile.get("weather") or {}).get("condition"))
    if condition and condition != "dry":
        timeline[1]["notes"] = _dedupe([
            f"The race was {condition}, so grip and timing mattered more than usual.",
            *timeline[1]["notes"],
        ])[:3]
        timeline[1]["source"] = "race-weather"

    retired_count = profile.get("retiredCount") or 0
    if retired_count >= 4:
        timeline[4]["notes"] = _dedupe([
            f"{retired_count} drivers retired, so staying out of trouble was part of the strategy.",
            *timeline[4]["notes"],
        ])[:3]
        timeline[4]["source"] = "race-results"


def _podium_notes(profile: dict[str, Any]) -> list[str]:
    podium = profile.get("podium") or []
    if len(podium) < 3:
        return []

    winner, second, third = podium[:3]
    return [
        f"{winner.get('driver')} won, with {second.get('driver')} second and {third.get('driver')} third.",
    ]


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


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    result = []
    for item in items:
        clean = _clean_text(item)
        if clean and clean not in seen:
            seen.add(clean)
            result.append(clean)
    return result
