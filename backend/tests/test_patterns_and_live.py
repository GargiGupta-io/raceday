from backend import api
from backend.core import live_feed


def test_pattern_search_applies_filters(monkeypatch):
    monkeypatch.setattr(
        api.indexer,
        "list_indexed",
        lambda: [{"year": 2024, "track": "Wet Test Grand Prix"}],
    )
    monkeypatch.setattr(
        api.insights,
        "_extract_race_profile",
        lambda year, track: {
            "circuit": "Wet Test Grand Prix",
            "condition": "wet",
            "winner": "NOR",
            "winner_team": "McLaren",
            "winner_grid": 12,
            "dnf_count": 5,
            "max_gain": 11,
        },
    )

    response = api.pattern_search({
        "condition": "wet",
        "winner": "NOR",
        "min_grid": 10,
        "max_dnf": 4,
        "year_from": 2024,
        "year_to": 2024,
    })

    assert response["count"] == 1
    assert response["races"][0]["track"] == "Wet Test Grand Prix"


def test_live_state_builder_uses_mocked_openf1_data(monkeypatch):
    monkeypatch.setattr(
        live_feed,
        "_fetch_drivers",
        lambda session_key: {
            1: {
                "code": "VER",
                "name": "Max Verstappen",
                "team": "Red Bull Racing",
                "team_colour": "ff0000",
            }
        },
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_positions",
        lambda session_key: [{"driver_number": 1, "position": 1}],
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_stints",
        lambda session_key: {
            1: {
                "compound": "MEDIUM",
                "lap_start": 1,
                "lap_end": 20,
                "stint_number": 1,
            }
        },
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_lap_count",
        lambda session_key: {"current": 20, "total": 58},
    )
    monkeypatch.setattr(live_feed, "_generate_pattern_alerts", lambda *args: [])

    state = live_feed._build_live_state({
        "session_key": 123,
        "year": 2026,
        "location": "Melbourne",
        "country_name": "Australia",
    })

    assert state["session"] == "2026 Melbourne Grand Prix"
    assert state["lap"] == 20
    assert state["drivers"][0]["code"] == "VER"
    assert state["drivers"][0]["compound"] == "MEDIUM"
