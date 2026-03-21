"""
generate_laps.py — Batch-generate laps.json for all 2018+ races.

Scans the index directory for races that are indexed but missing laps.json,
then fetches lap timing data from FastF1 and saves it.

Usage:
    python -m backend.scripts.generate_laps           # all missing
    python -m backend.scripts.generate_laps --year 2023   # single year
    python -m backend.scripts.generate_laps --dry-run     # show what would be generated
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.core import indexer, loader

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def find_missing(year_filter: int | None = None) -> list[tuple[int, str]]:
    """Find all 2018+ indexed races missing laps.json."""
    index_dir = Path(indexer._index_dir)
    missing = []

    for year_dir in sorted(index_dir.iterdir()):
        if not year_dir.is_dir() or year_dir.name.startswith("_"):
            continue
        try:
            year = int(year_dir.name)
        except ValueError:
            continue
        if year < 2018:
            continue
        if year_filter and year != year_filter:
            continue

        for track_dir in sorted(year_dir.iterdir()):
            if not track_dir.is_dir():
                continue
            laps_path = track_dir / "laps.json"
            if not laps_path.exists():
                missing.append((year, track_dir.name))

    return missing


def generate(year: int, track: str) -> bool:
    """Generate laps.json for a single race. Returns True on success."""
    race_dir = indexer._race_dir(year, track)
    laps_path = race_dir / "laps.json"

    if laps_path.exists():
        return True

    try:
        lap_data = loader.get_lap_times(year, track)
        if lap_data is None:
            logger.warning("  SKIP  %d %s — no lap data from FastF1", year, track)
            return False

        drivers = len([k for k in lap_data if k != "_meta"])
        total = lap_data.get("_meta", {}).get("total_laps", "?")

        with open(laps_path, "w") as f:
            json.dump(lap_data, f)

        size_kb = laps_path.stat().st_size / 1024
        logger.info("  OK    %d %s — %d drivers, %s laps (%.0f KB)",
                     year, track, drivers, total, size_kb)
        return True

    except Exception as exc:
        logger.error("  FAIL  %d %s — %s", year, track, exc)
        return False


def main():
    parser = argparse.ArgumentParser(description="Batch-generate laps.json for 2018+ races")
    parser.add_argument("--year", type=int, help="Only process this year")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be generated")
    args = parser.parse_args()

    missing = find_missing(args.year)
    logger.info("Found %d races missing laps.json", len(missing))

    if not missing:
        logger.info("Nothing to do!")
        return

    if args.dry_run:
        for year, track in missing:
            print(f"  {year} {track}")
        return

    success = 0
    failed = 0
    skipped = 0
    start_time = time.time()

    for i, (year, track) in enumerate(missing):
        logger.info("[%d/%d] Generating %d %s...", i + 1, len(missing), year, track)

        if generate(year, track):
            success += 1
        else:
            # Write empty marker to avoid re-trying races with no data
            failed += 1

        # Brief pause between requests to be polite to FastF1/F1 servers
        if i < len(missing) - 1:
            time.sleep(1)

    elapsed = time.time() - start_time
    logger.info(
        "Done! %d succeeded, %d failed, %d skipped in %.0f seconds",
        success, failed, skipped, elapsed,
    )


if __name__ == "__main__":
    main()
