"""Generate the JSON race index used by production deployments.

Run from the repository root:
    python -m backend.scripts.seed_index 2010 2026
"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime

os.environ.setdefault("INDEX_DIR", "./data/index")
os.environ.setdefault("CACHE_DIR", "./data/cache")

from backend.core import indexer  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed RaceDay JSON index data.")
    parser.add_argument("start_year", nargs="?", type=int, default=2010)
    parser.add_argument("end_year", nargs="?", type=int, default=datetime.now().year)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    logging.getLogger("fastf1").setLevel(logging.ERROR)

    for year in range(args.start_year, args.end_year + 1):
        print(f"Indexing {year}...", flush=True)
        result = indexer.index_season(year)
        print(
            f"{year}: total={result['total']} indexed={result['indexed']} "
            f"skipped={result['skipped']} failed={result['failed']}",
            flush=True,
        )

    print("Seed index complete.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
