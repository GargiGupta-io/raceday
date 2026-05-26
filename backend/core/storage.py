"""
storage.py - RaceDay storage adapters.

JSON remains the production default. The adapter boundary keeps indexing and
insight code from depending directly on file names, which makes the later
PostgreSQL move smaller and easier to roll back.
"""

import json
import os
from pathlib import Path
from typing import Any

DEFAULT_INDEX_DIR = Path(os.getenv("INDEX_DIR", "./data/index"))


class JsonRaceStore:
    """Persist indexed race data using the current JSON-on-disk layout."""

    def __init__(self, index_dir: Path | str = DEFAULT_INDEX_DIR):
        self.index_dir = Path(index_dir)
        self.index_dir.mkdir(parents=True, exist_ok=True)

    def race_dir(self, year: int, track: str) -> Path:
        return self.index_dir / str(year) / track

    def is_indexed(self, year: int, track: str) -> bool:
        race_dir = self.race_dir(year, track)
        return (race_dir / "race_results.json").exists() and (race_dir / "weather.json").exists()

    def save_race_index(self, year: int, track: str, results: list, weather: dict, stints: dict):
        race_dir = self.race_dir(year, track)
        race_dir.mkdir(parents=True, exist_ok=True)

        self._write_json(race_dir / "race_results.json", results)
        self._write_json(race_dir / "weather.json", weather)
        self._write_json(race_dir / "stints.json", stints)

    def load_race_index(self, year: int, track: str) -> dict[str, Any]:
        race_dir = self.race_dir(year, track)
        stints_path = race_dir / "stints.json"

        return {
            "results": self._read_json(race_dir / "race_results.json"),
            "weather": self._read_json(race_dir / "weather.json"),
            "stints": self._read_json(stints_path) if stints_path.exists() else None,
        }

    def save_lap_data(self, year: int, track: str, lap_data: dict):
        race_dir = self.race_dir(year, track)
        race_dir.mkdir(parents=True, exist_ok=True)
        self._write_json(race_dir / "laps.json", lap_data)

    def load_lap_data(self, year: int, track: str) -> dict | None:
        laps_path = self.race_dir(year, track) / "laps.json"
        if not laps_path.exists():
            return None
        return self._read_json(laps_path)

    def list_indexed(self) -> list[dict]:
        indexed = []
        if not self.index_dir.exists():
            return indexed

        for year_dir in sorted(self.index_dir.iterdir()):
            if not year_dir.is_dir():
                continue
            try:
                year = int(year_dir.name)
            except ValueError:
                continue

            for track_dir in sorted(year_dir.iterdir()):
                if track_dir.is_dir() and self.is_indexed(year, track_dir.name):
                    indexed.append({"year": year, "track": track_dir.name})

        return indexed

    @staticmethod
    def _write_json(path: Path, payload: Any):
        with open(path, "w") as f:
            json.dump(payload, f, indent=2)

    @staticmethod
    def _read_json(path: Path):
        with open(path) as f:
            return json.load(f)


def storage_status() -> dict:
    storage_backend = os.getenv("STORAGE_BACKEND", "json").lower()
    database_url = os.getenv("DATABASE_URL", "")

    return {
        "backend": storage_backend,
        "json_index_dir": str(DEFAULT_INDEX_DIR),
        "database_url_configured": bool(database_url),
        "postgres_ready": False,
        "active_store": "json",
    }
