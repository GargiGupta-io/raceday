"""
openmeteo_loader.py — OpenMeteo Historical Weather Loader

Fetches historical weather data for F1 race days using the free
Open-Meteo Archive API. Requires only a date and GPS coordinates.

API base: https://archive-api.open-meteo.com/v1/archive
No authentication required. Free tier, ~600 req/min.
"""

import logging
import time

import requests

logger = logging.getLogger(__name__)

_BASE = "https://archive-api.open-meteo.com/v1/archive"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Raceday/1.0 (F1 fan intelligence platform)"})


def get_race_weather(date: str, lat: float, lon: float) -> dict | None:
    """
    Fetch historical weather for a race day and return a summary.

    Args:
        date — ISO date string (YYYY-MM-DD), the race day
        lat  — circuit latitude
        lon  — circuit longitude

    Returns a dict matching the format used by loader.get_weather_summary():
        condition      — 'dry', 'damp', or 'wet'
        avg_air_temp   — mean air temperature in °C (rounded to 1dp)
        avg_track_temp — None (OpenMeteo has no track sensor data)

    Condition logic (same thresholds as the FastF1 loader):
        dry   — zero rainfall across race window
        damp  — some rainfall but under 20% of hours
        wet   — rainfall in 20%+ of hours

    The race window is 10:00–18:00 local time, which covers all
    possible F1 start times across timezones.

    Returns None if the API call fails.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": date,
        "end_date": date,
        "hourly": "temperature_2m,rain",
        "timezone": "auto",
    }

    for attempt in range(3):
        try:
            resp = _SESSION.get(_BASE, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as exc:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                logger.warning("OpenMeteo request failed for %s (%.3f, %.3f) — %s", date, lat, lon, exc)
                return None

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    rain = hourly.get("rain", [])

    if not times or not temps:
        logger.warning("OpenMeteo returned empty data for %s", date)
        return None

    # Filter to race window: 10:00–18:00 local time
    race_temps = []
    race_rain = []
    for i, t in enumerate(times):
        # time format: "2014-03-16T10:00"
        hour_str = t.split("T")[1] if "T" in t else ""
        try:
            hour = int(hour_str.split(":")[0])
        except (ValueError, IndexError):
            continue

        if 10 <= hour <= 18:
            if i < len(temps) and temps[i] is not None:
                race_temps.append(temps[i])
            if i < len(rain) and rain[i] is not None:
                race_rain.append(rain[i])

    if not race_temps:
        logger.warning("OpenMeteo: no data in race window for %s", date)
        return None

    avg_air = round(sum(race_temps) / len(race_temps), 1)

    # Determine condition from rainfall
    wet_hours = sum(1 for r in race_rain if r > 0.1)
    total_hours = len(race_rain) if race_rain else 1
    wet_fraction = wet_hours / total_hours

    if wet_fraction == 0:
        condition = "dry"
    elif wet_fraction > 0.2:
        condition = "wet"
    else:
        condition = "damp"

    return {
        "condition": condition,
        "avg_air_temp": avg_air,
        "avg_track_temp": None,
    }


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    # 2014 Australian GP — known dry race, Melbourne
    print("=== 2014 Australian GP Weather ===\n")
    w = get_race_weather("2014-03-16", -37.8497, 144.968)
    if w:
        print(f"  Condition:  {w['condition']}")
        print(f"  Air temp:   {w['avg_air_temp']}°C")
        print(f"  Track temp: {w['avg_track_temp']}")
    else:
        print("  Failed to fetch weather.")

    # 2011 Canadian GP — famous wet race, Montreal
    print("\n=== 2011 Canadian GP Weather ===\n")
    w2 = get_race_weather("2011-06-12", 45.5017, -73.5228)
    if w2:
        print(f"  Condition:  {w2['condition']}")
        print(f"  Air temp:   {w2['avg_air_temp']}°C")
        print(f"  Track temp: {w2['avg_track_temp']}")
    else:
        print("  Failed to fetch weather.")
