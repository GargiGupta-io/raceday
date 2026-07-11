import pytest

from backend import api
from backend.core import live_feed


def async_result(value):
    async def result(*args, **kwargs):
        return value

    return result


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


@pytest.mark.asyncio
async def test_live_state_builder_uses_mocked_openf1_data(monkeypatch):
    monkeypatch.setattr(
        live_feed,
        "_fetch_drivers",
        async_result({
            1: {
                "code": "VER",
                "name": "Max Verstappen",
                "team": "Red Bull Racing",
                "team_colour": "ff0000",
            }
        }),
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_positions",
        async_result([{"driver_number": 1, "position": 1}]),
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_stints",
        async_result({
            1: {
                "compound": "MEDIUM",
                "lap_start": 1,
                "lap_end": 20,
                "stint_number": 1,
            }
        }),
    )
    monkeypatch.setattr(
        live_feed,
        "_fetch_lap_count",
        async_result({"current": 20, "total": 58}),
    )
    monkeypatch.setattr(live_feed, "_generate_pattern_alerts", lambda *args: [])
    monkeypatch.setattr(live_feed, "_last_error", None)
    monkeypatch.setattr(live_feed, "_last_source_status", "idle")

    state = await live_feed._build_live_state({
        "session_key": 123,
        "year": 2026,
        "location": "Melbourne",
        "country_name": "Australia",
    })

    assert state["session"] == "2026 Melbourne Grand Prix"
    assert state["lap"] == 20
    assert state["drivers"][0]["code"] == "VER"
    assert state["drivers"][0]["compound"] == "MEDIUM"
