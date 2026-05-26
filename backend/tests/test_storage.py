from backend.core import storage


def test_json_race_store_roundtrip(tmp_path):
    store = storage.JsonRaceStore(tmp_path)

    store.save_race_index(
        2026,
        "Australian Grand Prix",
        [{"driver": "NOR", "finish_position": 1}],
        {"condition": "dry"},
        {"NOR": [{"compound": "MEDIUM", "lap_start": 1, "lap_end": 20}]},
    )
    store.save_lap_data(2026, "Australian Grand Prix", {"NOR": [{"lap": 1, "time": 82.4}]})

    race = store.load_race_index(2026, "Australian Grand Prix")
    laps = store.load_lap_data(2026, "Australian Grand Prix")

    assert store.is_indexed(2026, "Australian Grand Prix")
    assert race["results"][0]["driver"] == "NOR"
    assert race["weather"]["condition"] == "dry"
    assert race["stints"]["NOR"][0]["compound"] == "MEDIUM"
    assert laps["NOR"][0]["time"] == 82.4
    assert store.list_indexed() == [{"year": 2026, "track": "Australian Grand Prix"}]


def test_storage_status_reports_future_postgres_config(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "postgres")
    monkeypatch.setenv("DATABASE_URL", "postgresql://example")

    status = storage.storage_status()

    assert status["backend"] == "postgres"
    assert status["database_url_configured"] is True
    assert status["postgres_ready"] is False
    assert status["active_store"] == "json"
