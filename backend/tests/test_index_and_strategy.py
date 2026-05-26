import json

from backend.core import indexer, strategy_sim


def test_race_index_loads_fixture_data(tmp_path, monkeypatch):
    monkeypatch.setattr(indexer, "_index_dir", tmp_path)

    race_dir = tmp_path / "2024" / "Test Grand Prix"
    race_dir.mkdir(parents=True)
    (race_dir / "race_results.json").write_text(
        json.dumps([{"driver": "VER", "finish_position": 1}]),
        encoding="utf-8",
    )
    (race_dir / "weather.json").write_text(
        json.dumps({"condition": "dry"}),
        encoding="utf-8",
    )
    (race_dir / "stints.json").write_text(
        json.dumps({"VER": [{"compound": "MEDIUM", "lap_start": 1, "lap_end": 20}]}),
        encoding="utf-8",
    )

    data = indexer.load_race_index(2024, "Test Grand Prix")

    assert data["results"][0]["driver"] == "VER"
    assert data["weather"]["condition"] == "dry"
    assert data["stints"]["VER"][0]["compound"] == "MEDIUM"


def test_strategy_simulator_runs_with_fixture_data(monkeypatch):
    fixture = {
        "results": [
            {
                "driver": "VER",
                "team": "Red Bull Racing",
                "grid_position": 1,
                "finish_position": 1,
                "status": "Finished",
            },
            {
                "driver": "NOR",
                "team": "McLaren",
                "grid_position": 2,
                "finish_position": 2,
                "status": "Finished",
            },
        ],
        "weather": {"condition": "dry"},
        "stints": {
            "VER": [
                {"compound": "MEDIUM", "lap_start": 1, "lap_end": 10, "lap_count": 10},
                {"compound": "HARD", "lap_start": 11, "lap_end": 20, "lap_count": 10},
            ],
            "NOR": [
                {"compound": "MEDIUM", "lap_start": 1, "lap_end": 20, "lap_count": 20},
            ],
        },
    }
    monkeypatch.setattr(strategy_sim.indexer, "load_race_index", lambda year, track: fixture)
    monkeypatch.setattr(strategy_sim.indexer, "load_lap_data", lambda year, track: None)

    result = strategy_sim.simulate_strategy(
        2024,
        "Test Grand Prix",
        "VER",
        pit_stop_laps=[9],
        compounds=["MEDIUM", "HARD"],
    )

    assert result["driver"]["code"] == "VER"
    assert result["actual"]["num_stops"] == 1
    assert result["alternate"]["num_stops"] == 1
    assert result["model_used"] == "physics"
