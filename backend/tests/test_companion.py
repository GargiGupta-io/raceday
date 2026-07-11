from backend.core import companion


TECHNICAL_LEAK_WORDS = ("radio", "transcript", "mediaSource", "radioSource", "video/audio clue")
STRATEGY_WORDS = ("tyre", "tyres", "pit", "pressure", "track position", "clean air", "strategy", "pace")


def _assert_beginner_strategy_note(note):
    assert note["ok"] is True
    assert note["headline"]
    assert 1 <= len(note["notes"]) <= 4

    text = f"{note['headline']} {' '.join(note['notes'])}".lower()
    assert any(word.lower() in text for word in STRATEGY_WORDS)
    assert not any(word.lower() in text for word in TECHNICAL_LEAK_WORDS)


def test_replay_companion_keeps_radio_context_out_of_user_copy(monkeypatch):
    monkeypatch.setattr(
        companion.insights,
        "get_radio_moments",
        lambda year, track, top_n=5: {
            "available": True,
            "clips": [
                {
                    "driver_name": "Lando Norris",
                    "driver_code": "NOR",
                    "lap": 25,
                    "transcript": "Box box. The tyres are dead and we are sliding.",
                    "sentiment": "strategy",
                    "tags": ["strategy", "tyre_deg"],
                }
            ],
        },
    )

    payload = {
        "mode": "replay",
        "title": "Race Highlights | 2024 Las Vegas Grand Prix",
        "year": 2024,
        "raceName": "Las Vegas GP",
        "currentTime": 78,
        "duration": 494,
    }
    analysis = {
        "ok": True,
        "mode": "replay",
        "year": 2024,
        "track": "Las Vegas Grand Prix",
        "currentTime": 78,
        "duration": 494,
        "timeline": [
            {
                "id": "first-pit-window",
                "label": "first pit choices",
                "startRatio": 0.25,
                "endRatio": 0.45,
                "headline": "The first pit choices can change the order.",
                "notes": [
                    "Stopping early gives fresh tyres, but traffic can ruin the gain.",
                ],
                "source": "race-story",
            }
        ],
    }

    note = companion.build_companion_note(payload, analysis=analysis)

    _assert_beginner_strategy_note(note)
    assert "radioSource" not in note
    assert "the pit call is the key" == note["momentLabel"]


def test_live_companion_keeps_radio_context_out_of_user_copy(monkeypatch):
    monkeypatch.setattr(
        companion.insights,
        "get_radio_moments",
        lambda year, track, top_n=5: {
            "available": True,
            "clips": [
                {
                    "driver_name": "Charles Leclerc",
                    "driver_code": "LEC",
                    "lap": 18,
                    "transcript": "The tyres are gone, I am sliding everywhere.",
                    "sentiment": "frustration",
                    "tags": ["frustration", "tyre_deg"],
                }
            ],
        },
    )

    note = companion.build_live_note(
        {
            "session": "2026 Las Vegas Grand Prix",
            "year": 2026,
            "lap": 18,
            "totalLaps": 50,
            "drivers": [
                {"name": "Charles Leclerc", "code": "LEC", "position": 1, "gap": "LEADER", "tyreLife": 16},
                {"name": "Max Verstappen", "code": "VER", "position": 2, "gap": "+0.8", "tyreLife": 18},
            ],
            "alerts": [],
            "predictions": [],
        }
    )

    _assert_beginner_strategy_note(note)
    assert "radioSource" not in note
    assert note["mode"] == "live"


def test_replay_companion_turns_transcript_context_into_strategy_note(monkeypatch):
    monkeypatch.setattr(
        companion.insights,
        "get_radio_moments",
        lambda *args, **kwargs: {"available": False, "clips": []},
    )

    payload = {
        "mode": "replay",
        "title": "Race Highlights | 2024 Las Vegas Grand Prix",
        "year": 2024,
        "raceName": "Las Vegas GP",
        "currentTime": 80,
        "duration": 494,
        "transcript": "Box box, box this lap. The tyres are gone.",
    }
    analysis = {
        "ok": True,
        "mode": "replay",
        "year": 2024,
        "track": "Las Vegas Grand Prix",
        "currentTime": 80,
        "duration": 494,
        "transcript": "Box box, box this lap. The tyres are gone.",
        "timeline": [
            {
                "id": "first-pit-window",
                "label": "first pit choices",
                "startRatio": 0.25,
                "endRatio": 0.45,
                "headline": "The first pit choices can change the order.",
                "notes": [
                    "Stopping early gives fresh tyres, but traffic can ruin the gain.",
                ],
                "source": "race-story",
            }
        ],
    }

    note = companion.build_companion_note(payload, analysis=analysis)

    _assert_beginner_strategy_note(note)
    assert note["momentLabel"] == "the pit call is the key"
    assert note["source"] == "race-story"


def test_replay_companion_uses_video_analysis_without_exposing_metadata(monkeypatch):
    monkeypatch.setattr(
        companion.insights,
        "get_radio_moments",
        lambda *args, **kwargs: {"available": False, "clips": []},
    )

    payload = {
        "mode": "replay",
        "title": "Race Highlights | 2024 Las Vegas Grand Prix",
        "year": 2024,
        "raceName": "Las Vegas GP",
        "currentTime": 79,
        "duration": 494,
        "transcript": "Box box box. Pit now for fresh tyres.",
    }
    analysis = {
        "ok": True,
        "mode": "replay",
        "year": 2024,
        "track": "Las Vegas Grand Prix",
        "currentTime": 79,
        "duration": 494,
        "transcript": "Box box box. Pit now for fresh tyres.",
        "timeline": [
            {
                "id": "first-pit-window",
                "label": "first pit choices",
                "startRatio": 0.25,
                "endRatio": 0.45,
                "headline": "The first pit choices can change the order.",
                "notes": [
                    "Stopping early gives fresh tyres, but traffic can ruin the gain.",
                ],
                "source": "race-story",
            }
        ],
    }

    note = companion.build_companion_note(payload, analysis=analysis)

    _assert_beginner_strategy_note(note)
    assert "mediaSource" not in note
    assert note["momentLabel"] == "the pit call is the key"


def test_replay_companion_uses_caption_number_clues(monkeypatch):
    monkeypatch.setattr(
        companion.insights,
        "get_radio_moments",
        lambda *args, **kwargs: {"available": False, "clips": []},
    )

    payload = {
        "mode": "replay",
        "title": "Race Highlights | 2024 Las Vegas Grand Prix",
        "year": 2024,
        "raceName": "Las Vegas GP",
        "currentTime": 60,
        "duration": 494,
        "transcript": "Lap 5. P1 and P2 are covered by less than a second.",
    }
    analysis = {
        "ok": True,
        "mode": "replay",
        "year": 2024,
        "track": "Las Vegas Grand Prix",
        "currentTime": 60,
        "duration": 494,
        "transcript": "Lap 5. P1 and P2 are covered by less than a second.",
        "timeline": [
            {
                "id": "opening-laps",
                "label": "opening laps",
                "startRatio": 0.1,
                "endRatio": 0.25,
                "headline": "Teams are learning who has real pace.",
                "notes": [
                    "Drivers close behind another car can overheat their tyres.",
                ],
                "source": "race-story",
            }
        ],
    }

    note = companion.build_companion_note(payload, analysis=analysis)

    joined = " ".join(note["notes"]).lower()
    _assert_beginner_strategy_note(note)
    assert "lap 5" not in joined
    assert "this race is opening up" == note["momentLabel"]
