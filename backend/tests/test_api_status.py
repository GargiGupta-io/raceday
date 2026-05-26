import pytest

from backend import api


def test_health_response_reports_backend_status():
    response = api.health()

    assert response["status"] == "ok"
    assert response["service"] == "raceday-backend"
    assert isinstance(response["current_year"], int)
    assert response["indexing_running"] in (True, False)


def test_cors_origins_include_production_frontend(monkeypatch):
    monkeypatch.setenv("FRONTEND_URLS", "https://portfolio.example, https://raceday.example")

    origins = api._cors_origins()

    assert "https://raceday-khaki.vercel.app" in origins
    assert "https://portfolio.example" in origins
    assert "https://raceday.example" in origins


def test_data_source_health_includes_live_source():
    response = api.data_source_health()
    names = {source["name"] for source in response}

    assert {"FastF1", "Jolpica", "OpenMeteo", "OpenF1"}.issubset(names)


def test_storage_status_route_reports_active_store():
    response = api.storage_status()

    assert response["active_store"] == "json"
    assert response["backend"] in {"json", "postgres"}


def test_empty_race_response_raises_404(monkeypatch):
    monkeypatch.setattr(api.insights, "get_season_races", lambda year: None)

    with pytest.raises(api.HTTPException) as exc:
        api.season_races(2035)

    assert exc.value.status_code == 404
    assert "No schedule found" in exc.value.detail
