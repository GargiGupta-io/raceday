# Phase 6I — Strategy Simulator: ML-Powered "What If?" Engine

> An interactive sandbox where fans build alternate pit strategies and see ML-predicted outcomes — powered by polynomial regression trained on real lap-by-lap timing data from 800+ laps per race.

---

## In Plain English

Every F1 fan watches a race and thinks "what if they'd pitted earlier?" or "what if Hamilton had stayed on Softs instead of switching to Hards?" Phase 6I lets you test those ideas. Open any race, pick a driver, choose how many pit stops, slide the pit lap markers where you want them, click which tyres to use on each stint, and hit Simulate. The system tells you: "+22.3 seconds slower — would drop from P1 to P5."

The predictions aren't guesses. For races from 2018 onwards, the engine trains a polynomial regression model on every actual lap time from that specific race — typically 800+ data points from all 20 drivers. It learns how fast each compound is at that circuit, how quickly the tyres degrade (including the "cliff" where degradation suddenly accelerates), and even how much the car speeds up as fuel burns off. For older races (2010-2017) where lap timing isn't available, it falls back to a physics model with hardcoded compound performance curves.

This replaced an earlier MCQ quiz ("Who won the race?" style trivia) which was too passive. The simulator is active learning — you don't memorize what happened, you understand WHY teams made the choices they did by testing alternatives yourself.

---

## What Is This? (The Technical View)

This is a three-layer system: a data pipeline that extracts lap-by-lap timing from FastF1, an ML model that learns compound-specific degradation curves from that data, and an interactive frontend that lets users build strategies and see predictions.

The ML model is a **multivariate polynomial regression (degree 2)** fitted per compound per race:

```
lap_time = c0 + c1 * stint_age + c2 * stint_age² + c3 * race_lap
```

Where:
- `c0` = base lap time for this compound (intercept)
- `c1` = linear tyre degradation per lap on the stint
- `c2` = quadratic degradation (the "cliff" — degradation accelerates with tyre age)
- `c3` = fuel correction (negative — cars get faster as fuel burns off)

The model trains separately for each compound (SOFT, MEDIUM, HARD), giving circuit-specific performance curves. At Silverstone 2023, it learned:

```
MEDIUM: base=94.1s, deg=0.020s/lap, quad=0.00022, R²=0.41 (427 samples)
SOFT:   base=94.2s, deg=0.054s/lap, quad=0.00157, R²=0.59 (248 samples)
HARD:   base=94.9s, deg=0.079s/lap, quad=0.00108, R²=0.86 (116 samples)
```

The system routes by year:

```
simulate_strategy(year, track, driver, pit_laps, compounds)
    │
    ├── year >= 2018?
    │     └── ML polynomial regression
    │         ├── Real lap times from laps.json (FastF1)
    │         ├── Per-compound degradation curves
    │         ├── IQR outlier filtering (safety cars, pit laps)
    │         └── Least-squares regression via numpy
    │
    └── year < 2018?
          └── Physics model
              ├── Hardcoded compound deltas vs Medium
              ├── Fixed degradation rates
              └── 22s pit stop loss
```

---

## The Problem It Solves

### Why the quiz was cut

The original Phase 6I was a multiple-choice quiz: "Who won?" "How many retirements?" "What grid position did the winner start from?" The user rejected this as too passive — memorizing facts isn't the same as understanding strategy. The quiz tested recall, not reasoning. You could get 7/7 without understanding a single strategic decision.

### What fans actually want

When a fan says "I want to test my knowledge," they mean "could I have done better than the team?" The strategy simulator answers that question directly. You're not picking from 4 options — you're building a complete strategy from scratch and seeing if it beats reality.

### Why ML matters here

A simple calculator with hardcoded numbers (Softs degrade 0.08s/lap everywhere) gives identical answers for Monaco and Silverstone. But real degradation is circuit-specific:

- At Monaco (low energy, smooth surface), Softs can last 30+ laps
- At Silverstone (high energy, abrasive surface), Softs degrade twice as fast
- At Bahrain (sand, rear-limited), Hards degrade faster than expected

The ML model captures these differences because it trains on real lap times from that specific race. The R² values show how much of the lap time variation the model explains — Hard tyres at Silverstone have R²=0.86, meaning the model captures 86% of the variation.

---

## How It Works

### Data Pipeline: laps.json

Plain English: For each 2018+ race, we extract every driver's lap-by-lap timing from FastF1 and save it to disk.

```python
# backend/core/loader.py — get_lap_times()

def get_lap_times(year: int, track: str) -> dict | None:
    session = get_session(year, track, "R")
    laps = session.laps

    for _, row in laps.iterrows():
        lap_time = row.get("LapTime")
        if pd.notna(lap_time):
            time_sec = lap_time.total_seconds()

        result[driver].append({
            "lap": lap_num,
            "time": time_sec,      # actual seconds
            "compound": compound,   # SOFT/MEDIUM/HARD
            "stint": stint,         # which stint (1-based)
            "pit_stop": is_pit,     # True on pit laps
        })
```

Technical detail: The data is saved as `laps.json` in the race's index directory alongside `results.json`, `weather.json`, and `stints.json`. On-demand generation — if the file doesn't exist when the simulator needs it, `load_lap_data()` generates it from FastF1's cache. Typical file size: ~200KB for 20 drivers × 50 laps.

### ML Model: _build_circuit_model()

Plain English: Takes 800+ real lap times, removes outliers (safety car laps, pit stops), and fits a polynomial curve for each tyre compound.

**Step 1: Collect training data** — each sample is (stint_age, race_lap, lap_time). Filters out lap 1 (grid start chaos), pit laps (artificially slow), and extreme outliers (>180s or <60s).

**Step 2: IQR outlier removal** — uses the Interquartile Range method. Any lap time below Q1 - 1.5×IQR or above Q3 + 1.5×IQR is removed. This catches safety car laps and VSC periods that would skew the model.

**Step 3: Least-squares regression** — for each compound, builds a feature matrix `[stint_age, stint_age², race_lap, 1]` and solves via `numpy.linalg.lstsq`. The quadratic term is what captures the "cliff."

```python
X = np.column_stack([
    stint_ages,        # linear degradation
    stint_ages ** 2,   # cliff effect
    race_laps,         # fuel correction
    np.ones(n),        # intercept (base time)
])
coeffs, _, _, _ = np.linalg.lstsq(X, times, rcond=None)
```

**Step 4: Extract stats** — R² score, cliff lap estimation (where `d²(time)/d(age)²` dominates), and human-readable degradation rates.

### Prediction: estimate_total_race_time_ml()

Plain English: Given a strategy (pit laps + compounds), predicts each lap's time using the fitted model and sums them up.

For each lap in each stint:
```
predicted_time = c0 + c1 × stint_age + c2 × stint_age² + c3 × race_lap
```

Total race time = sum of all predicted lap times + (num_stops × pit_stop_duration).

The comparison is relative: both actual and alternate strategies are predicted by the same model, so systematic biases cancel out. The delta (`alternate_time - actual_time`) is what matters.

### Position Estimation

A rough heuristic: ~1 position change per 5 seconds of race time difference. This maps the time delta to a predicted finish position:

```python
pos_change = round(delta_seconds / 5.0)
predicted_pos = max(1, min(len(finishers), actual_pos + pos_change))
```

### Frontend: StrategySimulator.tsx

The component has five interactive elements:

1. **Driver picker** — dropdown of all 20 drivers, sorted by finish position
2. **Stop count** — 5 buttons (0-4), click to select
3. **Pit lap sliders** — HTML range inputs, one per stop, constrained to valid ranges
4. **Compound buttons** — for each stint, click to cycle through available compounds
5. **Stint bars** — horizontal coloured bars comparing actual vs user strategy

State machine:
```
[Loading] → [Collapsed] → [Expanded/Building] → [Simulated]
                                    ↑                  │
                                    └── change input ──┘
```

The result display shows:
- Time delta in large text (green = faster, red = slower)
- Position change with arrow (P1 → P5)
- Model type badge ("ML regression" or "Physics model")
- Verdict sentence explaining the outcome

---

## Edge Cases & Gotchas

### 1. NaN lap times from FastF1

In plain English: Some laps have missing timing data, stored as NaN. If these get into the model, every calculation returns NaN.

Technical cause: FastF1 returns `NaT` (Not a Time) for laps where timing data was lost. When converted to seconds and saved as JSON, these become `NaN`.

How it's handled: Double filtering — `pd.notna()` check in `get_lap_times()`, plus `np.isnan()` check in `_build_circuit_model()` before regression.

### 2. IQR removing all samples

In plain English: If the NaN values aren't filtered first, numpy's `percentile()` returns NaN, making the IQR bounds NaN, and `lower <= t <= upper` with NaN is always False — removing everything.

How it's handled: NaN filtering runs BEFORE IQR filtering. Also, `float()` cast on q1/q3 prevents numpy type issues in Python comparisons.

### 3. Equal-length stints in estimated data (2010)

In plain English: When pit stops are estimated (evenly spaced), all stints are the same length, and the old heuristic assigned all the same compound.

How it's handled: A tolerance check (`max - min <= 2 laps`) detects equal stints and falls through to simple alternation (Soft → Hard → Soft).

### 4. Compound not seen in race data

In plain English: User selects SUPERSOFT but the race only used SOFT/MEDIUM/HARD. The ML model has no training data for that compound.

How it's handled: `_predict_lap_time_ml()` falls back to the physics model constants for unknown compounds. The prediction still works, just less accurate for that stint.

---

## How It Connects to Other Concepts

- **Stint data (Phase 2)**: The simulator uses `stints.json` to show each driver's actual strategy. This is the same data the Strategy panel displays.

- **Compound lookup (Phase 4A)**: The physics model fallback uses the same `COMPOUND_DELTA` and `COMPOUND_DEGRADATION` constants from the compound lookup module.

- **Strategy panel (Phase 6G)**: The "actual vs yours" stint bars use the same compound colours (red=Soft, yellow=Medium, white=Hard) as the strategy panel, keeping visual consistency.

- **2010 data gap (Phase 6F)**: The Bridgestone compound table and pit stop estimation make the simulator work for 2010 races too, even without real data.

---

## Quick Reference

### Key Files

| File | Role |
|------|------|
| `backend/core/strategy_sim.py` | ML model + simulation engine |
| `backend/core/loader.py` | `get_lap_times()` — FastF1 lap extraction |
| `backend/core/indexer.py` | `load_lap_data()` + laps.json persistence |
| `backend/api.py` | `/sim-context` + `/simulate` endpoints |
| `frontend/app/components/StrategySimulator.tsx` | Interactive simulator UI |

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/races/{year}/{track}/sim-context` | Drivers, compounds, laps, actual stints |
| POST | `/races/{year}/{track}/simulate` | Run prediction, return delta + verdict |

### POST /simulate payload

```json
{
  "driver": "VER",
  "pit_stop_laps": [15, 35],
  "compounds": ["SOFT", "MEDIUM", "SOFT"]
}
```

### Model comparison

| | ML Regression (2018+) | Physics (2010-2017) |
|---|---|---|
| Training data | 800+ real laps | None |
| Degradation | Learned quadratic curve | Fixed linear rate |
| Pit stop time | From race data | 22s fixed |
| Circuit-specific | Yes | No |
| R² typical | 0.4-0.9 | N/A |

---

*Generated: 2026-03-20 | Project: Raceday | Phase 6I v2 — Strategy Simulator*
*Files: strategy_sim.py, loader.py, indexer.py, api.py, StrategySimulator.tsx*
*Replaces: phase6i-quiz-mode.md (MCQ quiz — superseded)*
