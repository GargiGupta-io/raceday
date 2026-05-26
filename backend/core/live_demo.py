"""Saved live race snapshots for demo mode."""

from __future__ import annotations

DEMO_SNAPSHOTS = [
    {
        "active": True,
        "lap": 22,
        "totalLaps": 57,
        "session": "Demo Grand Prix",
        "drivers": [
            {"code": "NOR", "name": "Lando Norris", "team": "McLaren", "teamColour": "#ffffff", "position": 1, "gap": "LEADER", "compound": "MEDIUM", "stintAge": 18, "pitWindow": "Lap 25-28", "tyreLife": 46},
            {"code": "VER", "name": "Max Verstappen", "team": "Red Bull Racing", "teamColour": "#ffffff", "position": 2, "gap": "+1.8", "compound": "MEDIUM", "stintAge": 18, "pitWindow": "Lap 24-27", "tyreLife": 43},
            {"code": "LEC", "name": "Charles Leclerc", "team": "Ferrari", "teamColour": "#dc2626", "position": 3, "gap": "+4.2", "compound": "HARD", "stintAge": 10, "pitWindow": None, "tyreLife": 72},
            {"code": "HAM", "name": "Lewis Hamilton", "team": "Ferrari", "teamColour": "#dc2626", "position": 4, "gap": "+6.9", "compound": "SOFT", "stintAge": 11, "pitWindow": "Lap 23-25", "tyreLife": 34},
            {"code": "PIA", "name": "Oscar Piastri", "team": "McLaren", "teamColour": "#ffffff", "position": 5, "gap": "+8.1", "compound": "MEDIUM", "stintAge": 18, "pitWindow": "Lap 25-28", "tyreLife": 45},
        ],
        "predictions": [
            {"driver": "HAM", "prediction": "Pit L23-25 for Hard", "confidence": "high"},
            {"driver": "VER", "prediction": "Pit L24-27 for Hard", "confidence": "medium"},
            {"driver": "NOR", "prediction": "Pit L25-28 for Hard", "confidence": "medium"},
        ],
        "whatIf": [
            {"driver": "HAM", "position": 4, "pitNow": "P7", "stayOut": "P5", "recommendation": "stay"},
            {"driver": "VER", "position": 2, "pitNow": "P6", "stayOut": "P3", "recommendation": "neutral"},
        ],
        "alerts": [
            {"text": "Hamilton is close to the tyre cliff. The next three laps decide whether he attacks or protects track position.", "type": "warning"},
            {"text": "Leclerc is offset on hard tyres, so his race may come alive after the leaders stop.", "type": "info"},
        ],
    },
    {
        "active": True,
        "lap": 29,
        "totalLaps": 57,
        "session": "Demo Grand Prix",
        "drivers": [
            {"code": "LEC", "name": "Charles Leclerc", "team": "Ferrari", "teamColour": "#dc2626", "position": 1, "gap": "LEADER", "compound": "HARD", "stintAge": 17, "pitWindow": None, "tyreLife": 57},
            {"code": "HAM", "name": "Lewis Hamilton", "team": "Ferrari", "teamColour": "#dc2626", "position": 2, "gap": "+2.7", "compound": "HARD", "stintAge": 5, "pitWindow": None, "tyreLife": 88},
            {"code": "NOR", "name": "Lando Norris", "team": "McLaren", "teamColour": "#ffffff", "position": 3, "gap": "+5.1", "compound": "HARD", "stintAge": 1, "pitWindow": None, "tyreLife": 98},
            {"code": "VER", "name": "Max Verstappen", "team": "Red Bull Racing", "teamColour": "#ffffff", "position": 4, "gap": "+6.4", "compound": "HARD", "stintAge": 1, "pitWindow": None, "tyreLife": 98},
            {"code": "PIA", "name": "Oscar Piastri", "team": "McLaren", "teamColour": "#ffffff", "position": 5, "gap": "+11.2", "compound": "HARD", "stintAge": 1, "pitWindow": None, "tyreLife": 98},
        ],
        "predictions": [
            {"driver": "LEC", "prediction": "No stop expected yet", "confidence": "medium"},
            {"driver": "HAM", "prediction": "Long second stint possible", "confidence": "medium"},
            {"driver": "NOR", "prediction": "Fresh tyre attack phase", "confidence": "high"},
        ],
        "whatIf": [
            {"driver": "LEC", "position": 1, "pitNow": "P6", "stayOut": "P1", "recommendation": "stay"},
            {"driver": "NOR", "position": 3, "pitNow": "P8", "stayOut": "P3", "recommendation": "stay"},
        ],
        "alerts": [
            {"text": "Leclerc leads on the offset strategy, but Norris and Verstappen now have fresher hard tyres behind.", "type": "warning"},
            {"text": "The undercut worked for Hamilton. The question is whether he can keep tyre life alive to the finish.", "type": "info"},
        ],
    },
]


def get_demo_snapshot(index: int = 0) -> dict:
    return DEMO_SNAPSHOTS[index % len(DEMO_SNAPSHOTS)]
