"""
strategy_sim.py — Strategy Simulator Engine

Predicts race outcomes under alternate pit strategies.
Users choose a driver, set pit stop laps and compounds,
and the engine estimates total race time vs actual.

Two models:
  2018+ (data-driven): Uses real lap times from FastF1 to build
      per-circuit degradation curves, actual pit stop durations,
      and compound-specific performance deltas.
  Pre-2018 (physics model): Hardcoded compound deltas and degradation
      rates — approximate but the best we can do without lap timing.
"""

import logging
import statistics
from backend.core import indexer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Compound performance model
# ---------------------------------------------------------------------------

# Delta vs MEDIUM baseline (seconds per lap, negative = faster)
COMPOUND_DELTA: dict[str, float] = {
    "SUPERSOFT": -1.2,
    "SOFT":      -0.7,
    "MEDIUM":     0.0,
    "HARD":      +0.4,
    "INTERMEDIATE": +2.0,
    "WET":       +4.0,
    "UNKNOWN":    0.0,
}

# Degradation rate (seconds lost per lap as tyres wear)
# Softer tyres degrade faster
COMPOUND_DEGRADATION: dict[str, float] = {
    "SUPERSOFT": 0.12,
    "SOFT":      0.08,
    "MEDIUM":    0.05,
    "HARD":      0.03,
    "INTERMEDIATE": 0.06,
    "WET":       0.04,
    "UNKNOWN":   0.05,
}

# Average time lost per pit stop (seconds)
# Includes pit lane entry, stationary time, pit lane exit
PIT_STOP_LOSS = 22.0

# Fuel effect: cars get slightly faster each lap as fuel burns off
FUEL_CORRECTION_PER_LAP = -0.06


# ---------------------------------------------------------------------------
# Lap time estimation
# ---------------------------------------------------------------------------


def estimate_lap_time(
    base_lap: float,
    compound: str,
    lap_in_stint: int,
    race_lap: int,
    total_laps: int,
) -> float:
    """
    Estimate the time for a single lap given compound and stint age.

    Args:
        base_lap      — average lap time for this driver (seconds)
        compound      — tyre compound name (e.g. "SOFT")
        lap_in_stint  — how many laps since last pit stop (0-based)
        race_lap      — which lap of the race (1-based)
        total_laps    — total race distance

    Returns estimated lap time in seconds.
    """
    compound_upper = compound.upper()

    # Compound pace advantage/penalty
    delta = COMPOUND_DELTA.get(compound_upper, 0.0)

    # Tyre degradation — increases linearly with stint age
    deg_rate = COMPOUND_DEGRADATION.get(compound_upper, 0.05)
    deg = deg_rate * lap_in_stint

    # Fuel correction — lighter car = faster laps
    fuel = FUEL_CORRECTION_PER_LAP * race_lap

    return base_lap + delta + deg + fuel


def estimate_total_race_time(
    base_lap: float,
    total_laps: int,
    pit_stop_laps: list[int],
    compounds: list[str],
) -> dict:
    """
    Estimate total race time for a given strategy.

    Args:
        base_lap       — driver's average lap time (seconds)
        total_laps     — total race laps
        pit_stop_laps  — sorted list of laps where pit stops occur
        compounds      — compound for each stint (len = len(pit_stop_laps) + 1)

    Returns a dict:
        total_time     — estimated total race time (seconds)
        pit_time_total — total time lost in pits (seconds)
        stint_times    — list of per-stint time breakdowns
        lap_times      — list of estimated lap times (for charts)
    """
    num_stops = len(pit_stop_laps)

    # Build stint boundaries
    stint_starts = [1] + [lap + 1 for lap in pit_stop_laps]
    stint_ends = pit_stop_laps + [total_laps]

    total_time = 0.0
    pit_time_total = num_stops * PIT_STOP_LOSS
    stint_times = []
    lap_times = []

    for stint_idx in range(len(stint_starts)):
        if stint_idx >= len(compounds):
            break

        start = stint_starts[stint_idx]
        end = stint_ends[stint_idx]
        compound = compounds[stint_idx]
        stint_total = 0.0

        for race_lap in range(start, end + 1):
            lap_in_stint = race_lap - start
            lt = estimate_lap_time(base_lap, compound, lap_in_stint, race_lap, total_laps)
            lap_times.append({"lap": race_lap, "time": round(lt, 3), "compound": compound})
            stint_total += lt

        stint_times.append({
            "stint": stint_idx + 1,
            "compound": compound,
            "lap_start": start,
            "lap_end": end,
            "laps": end - start + 1,
            "stint_time": round(stint_total, 2),
        })
        total_time += stint_total

    total_time += pit_time_total

    return {
        "total_time": round(total_time, 2),
        "pit_time_total": round(pit_time_total, 2),
        "num_stops": num_stops,
        "stint_times": stint_times,
        "lap_times": lap_times,
    }


# ---------------------------------------------------------------------------
# Simulation context — data the frontend needs
# ---------------------------------------------------------------------------


def get_simulation_context(year: int, track: str) -> dict | None:
    """
    Return all data the frontend needs to set up the simulator.

    Returns:
        race        — display name
        total_laps  — race distance
        drivers     — list of {code, name, team, grid, finish, actual_stints}
        compounds   — list of available compounds for this race
    """
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    stints_by_driver = data.get("stints") or {}

    # Import driver name lookup
    from backend.core.insights import _DRIVER_NAMES

    # Derive total race laps from winner's stints (last stint's lap_end)
    race_total_laps = 0
    finishers_sorted = sorted(
        [r for r in results if r.get("finish_position") is not None],
        key=lambda r: r["finish_position"],
    )
    if finishers_sorted:
        winner_code = finishers_sorted[0]["driver"]
        winner_stints = stints_by_driver.get(winner_code, [])
        if winner_stints:
            race_total_laps = winner_stints[-1].get("lap_end", 0)

    drivers = []
    compounds_seen = set()

    for r in results:
        code = r["driver"]

        # Get actual stints
        actual_stints = []
        driver_stints = stints_by_driver.get(code, [])
        driver_laps = driver_stints[-1].get("lap_end", 0) if driver_stints else 0

        for s in driver_stints:
            compound = s.get("compound", "UNKNOWN")
            compounds_seen.add(compound.upper())
            actual_stints.append({
                "compound": compound,
                "lap_start": s.get("lap_start", 0),
                "lap_end": s.get("lap_end", 0),
                "laps": s.get("lap_count", 0),
            })

        actual_stops = max(0, len(driver_stints) - 1) if driver_stints else None

        drivers.append({
            "code": code,
            "name": _DRIVER_NAMES.get(code, code),
            "team": r.get("team", "Unknown"),
            "grid": r.get("grid_position"),
            "finish": r.get("finish_position"),
            "total_laps": driver_laps,
            "status": r.get("status", "Unknown"),
            "actual_stops": actual_stops,
            "actual_stints": actual_stints,
        })

    # Sort by finish position (DNFs at end)
    drivers.sort(key=lambda d: (d["finish"] is None, d["finish"] or 999))

    # Available compounds — what was used + standard options
    available = sorted(
        compounds_seen - {"UNKNOWN"},
        key=lambda c: COMPOUND_DELTA.get(c, 0),
    )
    if not available:
        available = ["SOFT", "MEDIUM", "HARD"]

    return {
        "race": f"{year} {track}",
        "year": year,
        "track": track,
        "total_laps": race_total_laps,
        "drivers": drivers,
        "compounds_available": available,
    }


# ---------------------------------------------------------------------------
# Main simulation — compare alternate strategy vs actual
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Data-driven model (2018+ with real lap times)
# ---------------------------------------------------------------------------


def _build_circuit_model(lap_data: dict) -> dict:
    """
    Build an ML regression model from real lap times at this circuit.

    For each compound, fits a polynomial regression:
        lap_time = f(stint_age, race_lap)

    This captures:
        - Non-linear tyre degradation (the "cliff" effect)
        - Fuel correction (cars get lighter = faster)
        - Circuit-specific compound behaviour
        - Per-compound base pace from real data

    Returns a dict:
        compound_models — {compound: numpy polynomial coefficients}
        compound_stats  — {compound: {count, base, cliff_lap, deg_rate}}
        pit_stop_avg    — average pit stop time loss (seconds)
        base_lap        — median clean lap time across all compounds
        data_driven     — True
    """
    import numpy as np

    meta = lap_data.get("_meta", {})

    # ---- Step 1: Collect clean training data per compound ----
    # Each sample: (stint_age, race_lap, lap_time)
    compound_samples: dict[str, list[tuple[int, int, float]]] = {}

    for key, driver_laps in lap_data.items():
        if key == "_meta" or not isinstance(driver_laps, list):
            continue

        # Group this driver's laps by stint
        stints: dict[int, list[dict]] = {}
        for lap in driver_laps:
            s = lap.get("stint", 1)
            stints.setdefault(s, []).append(lap)

        for stint_num, stint_laps in stints.items():
            stint_laps.sort(key=lambda x: x["lap"])
            for i, lap in enumerate(stint_laps):
                time_sec = lap.get("time", 0)
                compound = lap.get("compound", "UNKNOWN").upper()
                race_lap = lap.get("lap", 0)

                # Filter outliers: pit laps, safety car laps, lap 1, extreme times
                if time_sec < 60 or time_sec > 180:
                    continue
                if race_lap <= 1:
                    continue
                if lap.get("pit_stop", False):
                    continue

                compound_samples.setdefault(compound, []).append(
                    (i, race_lap, time_sec)  # stint_age, race_lap, time
                )

    # ---- Step 2: Remove NaN values and statistical outliers ----
    for compound in list(compound_samples.keys()):
        # First: remove any NaN values (from missing lap times in source data)
        compound_samples[compound] = [
            (a, r, t) for a, r, t in compound_samples[compound]
            if not (np.isnan(t) or np.isnan(a) or np.isnan(r))
        ]

        samples = compound_samples[compound]
        if len(samples) < 10:
            continue

        # IQR outlier removal for safety car laps and anomalies
        times = np.array([t for _, _, t in samples])
        q1, q3 = float(np.percentile(times, 25)), float(np.percentile(times, 75))
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        compound_samples[compound] = [
            (a, r, t) for a, r, t in samples if lower <= t <= upper
        ]

    # ---- Step 3: Fit polynomial regression per compound ----
    # Model: lap_time = c0 + c1*stint_age + c2*stint_age^2 + c3*race_lap
    # The quadratic stint_age term captures the "cliff" (non-linear degradation)
    compound_models: dict[str, list[float]] = {}
    compound_stats: dict[str, dict] = {}
    max_stint_ages: dict[str, int] = {}

    all_clean_times = []

    for compound, samples in compound_samples.items():
        if len(samples) < 15:  # need enough data for a reliable fit
            continue

        stint_ages = np.array([a for a, _, _ in samples])
        race_laps = np.array([r for _, r, _ in samples])
        times = np.array([t for _, _, t in samples])

        all_clean_times.extend(times.tolist())

        # Track max stint age seen in training data (for extrapolation guard)
        max_stint_ages[compound] = int(np.percentile(stint_ages, 95))

        # Build feature matrix: [stint_age, stint_age^2, race_lap, 1]
        X = np.column_stack([
            stint_ages,
            stint_ages ** 2,
            race_laps,
            np.ones(len(samples)),
        ])

        # Least squares regression
        coeffs, residuals, _, _ = np.linalg.lstsq(X, times, rcond=None)

        # Coefficient sanity checks — clamp extreme values
        linear_deg = float(coeffs[0])
        quad_deg = float(coeffs[1])
        fuel_effect = float(coeffs[2])

        # Quadratic degradation shouldn't be extreme (max ~0.01 s/lap²)
        if quad_deg > 0.01:
            coeffs[1] = 0.01
            logger.warning("  %s: quad_deg %.5f clamped to 0.01", compound, quad_deg)
        elif quad_deg < -0.005:
            coeffs[1] = 0.0  # negative quad makes no physical sense
            logger.warning("  %s: negative quad_deg %.5f zeroed", compound, quad_deg)

        # Linear degradation should be positive (tyres get slower)
        if linear_deg < -0.5:
            coeffs[0] = 0.0
            logger.warning("  %s: extreme negative linear_deg %.4f zeroed", compound, linear_deg)

        # Fuel effect should be negative (lighter = faster) and modest
        if abs(fuel_effect) > 0.3:
            coeffs[2] = -0.06  # fallback to standard fuel correction
            logger.warning("  %s: extreme fuel_effect %.4f reset to -0.06", compound, fuel_effect)

        compound_models[compound] = coeffs.tolist()

        # Re-extract after clamping
        base_time = float(coeffs[3])
        linear_deg = float(coeffs[0])
        quad_deg = float(coeffs[1])
        fuel_effect = float(coeffs[2])

        # Estimate "cliff lap" — where degradation accelerates
        # d(time)/d(stint_age) = c1 + 2*c2*stint_age
        # Cliff = where second derivative dominates, roughly at stint_age = -c1/(2*c2)
        cliff_lap = None
        if quad_deg > 0.001:
            cliff_est = -linear_deg / (2 * quad_deg)
            if 5 < cliff_est < 50:
                cliff_lap = round(cliff_est)

        compound_stats[compound] = {
            "count": len(samples),
            "base": round(base_time, 3),
            "linear_deg": round(linear_deg, 4),
            "quad_deg": round(quad_deg, 5),
            "fuel_effect": round(fuel_effect, 4),
            "cliff_lap": cliff_lap,
            "max_stint_age": max_stint_ages[compound],
            "r_squared": round(1 - (np.sum((times - X @ coeffs)**2) /
                                     np.sum((times - np.mean(times))**2)), 4)
                         if len(samples) > 4 else None,
        }

        logger.info(
            "  %s: %d samples, base=%.1fs, deg=%.3f+%.5f*age^2, fuel=%.4f, cliff=%s, R2=%s, max_age=%d",
            compound, len(samples), base_time, linear_deg, quad_deg,
            fuel_effect, cliff_lap, compound_stats[compound].get("r_squared"),
            max_stint_ages[compound],
        )

    # Overall base lap
    base_lap = float(np.median(all_clean_times)) if all_clean_times else 90.0

    # Pit stop duration
    pit_durations = meta.get("pit_stop_durations", [])
    pit_avg = statistics.median(pit_durations) if pit_durations else PIT_STOP_LOSS

    return {
        "compound_models": compound_models,
        "compound_stats": compound_stats,
        "max_stint_ages": max_stint_ages,
        "pit_stop_avg": round(pit_avg, 2),
        "base_lap": round(base_lap, 3),
        "data_driven": True,
    }


def _predict_lap_time_ml(model: dict, compound: str, stint_age: int, race_lap: int) -> float:
    """Predict a single lap time using the fitted regression model.

    Includes extrapolation guard: caps stint_age at the max observed in
    training data to prevent quadratic blowup on long stints (the main
    cause of unrealistic deltas on 1-stop strategies).
    """
    coeffs = model["compound_models"].get(compound.upper())
    if coeffs is None:
        # Fallback to physics model for unknown compounds
        base = model["base_lap"]
        delta = COMPOUND_DELTA.get(compound.upper(), 0)
        deg = COMPOUND_DEGRADATION.get(compound.upper(), 0.05)
        return base + delta + (deg * stint_age) + (FUEL_CORRECTION_PER_LAP * race_lap)

    # Cap stint_age to prevent quadratic extrapolation beyond training data
    max_stint_age = model.get("max_stint_ages", {}).get(compound.upper(), 35)
    capped_age = min(stint_age, max_stint_age)

    # For laps beyond the cap, add only linear degradation (no quadratic explosion)
    extra_laps = max(0, stint_age - max_stint_age)
    linear_deg_per_lap = coeffs[0] + 2 * coeffs[1] * capped_age  # derivative at cap point

    # coeffs = [c1_stint_age, c2_stint_age^2, c3_race_lap, c0_intercept]
    predicted = (coeffs[0] * capped_age +
                 coeffs[1] * capped_age ** 2 +
                 coeffs[2] * race_lap +
                 coeffs[3])

    # Add linear extension for extrapolated laps
    if extra_laps > 0:
        predicted += max(0, linear_deg_per_lap) * extra_laps

    # Sanity clamp: lap time shouldn't deviate more than 15s from base
    base_lap = model["base_lap"]
    predicted = max(base_lap - 5.0, min(base_lap + 15.0, predicted))

    return predicted


def estimate_total_race_time_ml(
    model: dict,
    total_laps: int,
    pit_stop_laps: list[int],
    compounds: list[str],
) -> dict:
    """
    Estimate total race time using ML regression model.
    Predicts each lap individually using the fitted polynomial.
    """
    num_stops = len(pit_stop_laps)
    pit_loss = model["pit_stop_avg"]

    # Build stint boundaries
    stint_starts = [1] + [lap + 1 for lap in pit_stop_laps]
    stint_ends = pit_stop_laps + [total_laps]

    total_time = 0.0
    pit_time_total = num_stops * pit_loss
    stint_times = []
    lap_times = []

    for stint_idx in range(len(stint_starts)):
        if stint_idx >= len(compounds):
            break

        start = stint_starts[stint_idx]
        end = stint_ends[stint_idx]
        compound = compounds[stint_idx].upper()
        stint_total = 0.0

        for race_lap in range(start, end + 1):
            stint_age = race_lap - start
            lt = _predict_lap_time_ml(model, compound, stint_age, race_lap)
            lap_times.append({"lap": race_lap, "time": round(lt, 3), "compound": compound})
            stint_total += lt

        stint_times.append({
            "stint": stint_idx + 1,
            "compound": compound,
            "lap_start": start,
            "lap_end": end,
            "laps": end - start + 1,
            "stint_time": round(stint_total, 2),
        })
        total_time += stint_total

    total_time += pit_time_total

    return {
        "total_time": round(total_time, 2),
        "pit_time_total": round(pit_time_total, 2),
        "num_stops": num_stops,
        "stint_times": stint_times,
        "lap_times": lap_times,
        "model": "ml-regression",
        "pit_stop_duration": pit_loss,
        "compound_stats": model.get("compound_stats", {}),
    }


# ---------------------------------------------------------------------------
# Main simulation — compare alternate strategy vs actual
# ---------------------------------------------------------------------------


def simulate_strategy(
    year: int,
    track: str,
    driver_code: str,
    pit_stop_laps: list[int],
    compounds: list[str],
) -> dict | None:
    """
    Simulate an alternate strategy for a driver and compare to actual.

    Args:
        year           — race year
        track          — race name
        driver_code    — 3-letter driver code
        pit_stop_laps  — user's chosen pit stop laps (sorted)
        compounds      — user's chosen compounds per stint

    Returns:
        driver         — driver info
        actual         — actual strategy results
        alternate      — simulated alternate results
        delta_seconds  — time difference (negative = faster)
        delta_position — estimated position change
        verdict        — human-readable summary
    """
    # Validate compounds
    valid_compounds = set(COMPOUND_DELTA.keys())
    for c in compounds:
        if c.upper() not in valid_compounds:
            return {"error": f"Unknown compound: {c}. Valid: {', '.join(sorted(valid_compounds))}"}

    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    stints_by_driver = data.get("stints") or {}

    from backend.core.insights import _DRIVER_NAMES

    # Find the driver
    driver_result = None
    for r in results:
        if r["driver"] == driver_code:
            driver_result = r
            break

    if driver_result is None:
        return None

    # Get total laps from stints data (not in results JSON)
    driver_stints = stints_by_driver.get(driver_code, [])
    total_laps = driver_stints[-1].get("lap_end", 0) if driver_stints else 0
    if total_laps < 10:
        return {"error": "Driver completed too few laps for simulation."}

    # Validate pit stop laps are within race distance
    pit_stop_laps = [lap for lap in pit_stop_laps if 1 <= lap < total_laps]

    finishers = sorted(
        [r for r in results if r["finish_position"] is not None],
        key=lambda r: r["finish_position"],
    )

    # Try data-driven model for 2018+ (uses real lap times)
    circuit_model = None
    if year >= 2018:
        lap_data = indexer.load_lap_data(year, track)
        if lap_data:
            circuit_model = _build_circuit_model(lap_data)
            logger.info(
                "Using ML model for %s %s: base=%.1fs, pit=%.1fs, compounds=%s",
                year, track, circuit_model["base_lap"], circuit_model["pit_stop_avg"],
                list(circuit_model.get("compound_models", {}).keys()),
            )

    # Build actual strategy from stints data
    actual_pit_laps = []
    actual_compounds = []
    if driver_stints:
        for i, s in enumerate(driver_stints):
            actual_compounds.append(s.get("compound", "MEDIUM"))
            if i > 0:
                actual_pit_laps.append(s.get("lap_start", 0) - 1)
    else:
        from backend.core.compound_lookup import estimate_pit_stop_laps
        actual_pit_laps = estimate_pit_stop_laps(total_laps, 2)
        actual_compounds = ["MEDIUM", "MEDIUM", "MEDIUM"]

    # Run simulation — ML regression or physics model
    if circuit_model:
        actual_result = estimate_total_race_time_ml(
            circuit_model, total_laps, actual_pit_laps, actual_compounds
        )
        alternate_result = estimate_total_race_time_ml(
            circuit_model, total_laps, pit_stop_laps, compounds
        )
    else:
        base_lap = 90.0  # nominal baseline, cancels out in delta comparison
        actual_result = estimate_total_race_time(
            base_lap, total_laps, actual_pit_laps, actual_compounds
        )
        alternate_result = estimate_total_race_time(
            base_lap, total_laps, pit_stop_laps, compounds
        )

    # Time delta — cap at ±120s to catch model failures
    raw_delta = alternate_result["total_time"] - actual_result["total_time"]
    delta_seconds = max(-120.0, min(120.0, raw_delta))

    if abs(raw_delta) > 120:
        logger.warning(
            "Delta capped: raw=%.1fs, capped=%.1fs for %s at %s %s",
            raw_delta, delta_seconds, driver_code, year, track,
        )

    # Estimate position change with diminishing returns
    # First 20s: ~1 position per 5s. Beyond that: ~1 per 10s.
    actual_pos = driver_result.get("finish_position")
    if actual_pos is not None:
        abs_delta = abs(delta_seconds)
        sign = 1 if delta_seconds > 0 else -1
        if abs_delta <= 20:
            pos_change = round(abs_delta / 5.0) * sign
        else:
            # 4 positions for first 20s, then 1 per 10s after
            pos_change = round((4 + (abs_delta - 20) / 10.0)) * sign
        predicted_pos = max(1, min(len(finishers), actual_pos + pos_change))
    else:
        predicted_pos = None
        pos_change = None

    # Detect weather mismatch: actual used wet compounds but alternate doesn't (or vice versa)
    wet_compounds = {"INTERMEDIATE", "WET"}
    actual_had_wet = any(c.upper() in wet_compounds for c in actual_compounds)
    alternate_has_wet = any(c.upper() in wet_compounds for c in compounds)
    weather_mismatch = actual_had_wet != alternate_has_wet

    # If weather mismatch, the delta is meaningless — override it
    if weather_mismatch and abs(delta_seconds) > 30:
        delta_seconds = 0.0
        pos_change = 0
        if actual_pos is not None:
            predicted_pos = actual_pos

    # Generate verdict
    if weather_mismatch:
        if actual_had_wet:
            verdict = ("This race had changing weather conditions. The actual strategy included "
                       "wet-weather tyres, so a pure dry comparison isn't meaningful. "
                       "Try including INTERMEDIATE or WET compounds to get a realistic prediction.")
        else:
            verdict = ("The actual race was dry, but your strategy includes wet-weather compounds. "
                       "The comparison isn't meaningful under dry conditions.")
    elif abs(delta_seconds) < 2:
        verdict = "Roughly the same outcome — your strategy matches the team's call."
    elif delta_seconds < 0:
        gain = abs(delta_seconds)
        if pos_change and pos_change < 0:
            verdict = f"Your strategy is ~{gain:.0f}s faster. Could have gained {abs(pos_change)} position{'s' if abs(pos_change) > 1 else ''}."
        else:
            verdict = f"Your strategy is ~{gain:.0f}s faster, but not enough to change position."
    else:
        loss = delta_seconds
        if pos_change and pos_change > 0:
            verdict = f"Your strategy is ~{loss:.0f}s slower. Would likely drop {pos_change} position{'s' if pos_change > 1 else ''}."
        else:
            verdict = f"Your strategy is ~{loss:.0f}s slower. The team's call was better."

    # Check if driver retired
    status = driver_result.get("status", "Finished")
    retired = status not in ("Finished",) and not status.startswith("+")
    if retired:
        verdict += " Note: this driver retired — simulation uses partial data."

    return {
        "driver": {
            "code": driver_code,
            "name": _DRIVER_NAMES.get(driver_code, driver_code),
            "team": driver_result.get("team", "Unknown"),
            "actual_finish": actual_pos,
            "total_laps": total_laps,
            "retired": retired,
        },
        "actual": {
            "total_time": actual_result["total_time"],
            "num_stops": actual_result["num_stops"],
            "stint_times": actual_result["stint_times"],
        },
        "alternate": {
            "total_time": alternate_result["total_time"],
            "num_stops": alternate_result["num_stops"],
            "stint_times": alternate_result["stint_times"],
        },
        "delta_seconds": round(delta_seconds, 1),
        "predicted_position": predicted_pos,
        "position_change": pos_change,
        "verdict": verdict,
        "model_used": "data-driven" if circuit_model else "physics",
        "weather_mismatch": weather_mismatch,
    }


# ---------------------------------------------------------------------------
# __main__ test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("=== Simulation Context: 2023 British GP ===")
    ctx = get_simulation_context(2023, "British Grand Prix")
    if ctx:
        print(f"Total laps: {ctx['total_laps']}")
        print(f"Compounds: {ctx['compounds_available']}")
        print(f"Drivers: {len(ctx['drivers'])}")
        for d in ctx["drivers"][:3]:
            stints = " > ".join(s["compound"] for s in d["actual_stints"])
            print(f"  {d['code']} P{d['finish']} ({d['actual_stops']}-stop): {stints}")

    print("\n=== Simulate: VER switches to 2-stop S>M>S ===")
    result = simulate_strategy(
        2023, "British Grand Prix", "VER",
        pit_stop_laps=[15, 35],
        compounds=["SOFT", "MEDIUM", "SOFT"],
    )
    if result:
        print(f"Actual: {result['actual']['num_stops']}-stop, {result['actual']['total_time']:.0f}s")
        print(f"Alt:    {result['alternate']['num_stops']}-stop, {result['alternate']['total_time']:.0f}s")
        print(f"Delta:  {result['delta_seconds']:+.1f}s")
        print(f"Verdict: {result['verdict']}")

    print("\n=== Simulate: HAM tries 1-stop H ===")
    result2 = simulate_strategy(
        2023, "British Grand Prix", "HAM",
        pit_stop_laps=[20],
        compounds=["SOFT", "HARD"],
    )
    if result2:
        print(f"Actual finish: P{result2['driver']['actual_finish']}")
        print(f"Delta: {result2['delta_seconds']:+.1f}s")
        print(f"Predicted: P{result2['predicted_position']}")
        print(f"Verdict: {result2['verdict']}")
