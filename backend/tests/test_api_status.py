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


def test_data_source_health_exposes_circuit_state():
    response = api.data_source_health()
    sources = {source["name"]: source for source in response}

    assert sources["OpenF1"]["circuit"] == "closed"
    assert sources["Jolpica"]["circuit"] == "closed"
    assert sources["OpenMeteo"]["circuit"] == "closed"
    assert sources["Companion AI"]["circuit"] == "closed"


def test_open_circuit_marks_source_as_degraded(monkeypatch):
    monkeypatch.setattr(
        api.http_client.circuit_breakers,
        "snapshot",
        lambda: {
            "openf1": {
                "state": "open",
                "failure_count": 4,
                "retry_after_seconds": 12.5,
            }
        },
    )
    monkeypatch.setattr(
        api.live_feed,
        "get_live_status",
        lambda: {"status": "idle", "last_error": None},
    )

    sources = {source["name"]: source for source in api.data_source_health()}
    openf1 = sources["OpenF1"]

    assert openf1["status"] == "degraded"
    assert openf1["circuit"] == "open"
    assert openf1["circuit_failures"] == 4
    assert openf1["circuit_retry_after_seconds"] == 12.5


def test_live_demo_endpoint_returns_active_snapshot():
    response = api.live_demo_snapshot()

    assert response["active"] is True
    assert response["session"] == "Demo Grand Prix"
    assert response["drivers"]


def test_storage_status_route_reports_active_store():
    response = api.storage_status()

    assert response["active_store"] == "json"
    assert response["backend"] in {"json", "postgres"}


def test_empty_race_response_returns_indexed_fallback(monkeypatch):
    monkeypatch.setattr(api.insights, "get_season_races", lambda year: None)
    monkeypatch.setattr(
        api.insights,
        "get_indexed_season_races",
        lambda year: [{"year": year, "track": "Stable Grand Prix"}],
    )

    response = api.season_races(2035)

    assert response == [{"year": 2035, "track": "Stable Grand Prix"}]
