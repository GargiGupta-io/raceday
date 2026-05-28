from backend.core import companion


def test_replay_companion_merges_radio_context(monkeypatch):
    monkeypatch.setattr(companion.companion_ai, "refine_companion_note", lambda *args, **kwargs: None)
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

    assert note["radioSource"] == "radio-transcript"
    assert "tyres are dead" in " ".join(note["notes"]).lower()
    assert note["notes"]


def test_live_companion_merges_radio_context(monkeypatch):
    monkeypatch.setattr(companion.companion_ai, "refine_companion_note", lambda *args, **kwargs: None)
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

    assert note["radioSource"] == "radio-transcript"
    assert "sliding" in " ".join(note["notes"]).lower()
    assert note["notes"]
