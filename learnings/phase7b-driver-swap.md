# Phase 7B — Driver Swap: Predicting "What If Hamilton Was In a Red Bull?"

> A prediction engine that answers F1's biggest hypothetical by combining car speed data, driver qualifying skill, and tyre management profiles into a single estimated finish position.

---

## In Plain English

Every F1 fan has had the argument: "Hamilton would win if he had Verstappen's car." It's the sport's biggest what-if. But nobody can actually test it because drivers are locked to their teams for a whole season.

Driver Swap does the closest thing possible with real data. You pick a driver — say Lewis Hamilton — and put him in a different car — say the Red Bull. The system then looks at three things: how fast is the Red Bull compared to Hamilton's Mercedes at this specific circuit? How does Hamilton compare to his teammate Russell in qualifying (that tells us his raw driver skill)? And does Hamilton save his tyres or burn through them (because that changes the optimal pit strategy)?

It then combines all three into a single prediction: "Hamilton in the Red Bull would finish P1, 31.6 seconds faster." Or flip it: "Verstappen in the Williams would drop from P1 to P9, losing 55 seconds." The prediction isn't perfect — it's a thought experiment, not a physics engine — but it uses real data from the actual race, not guesswork.

---

## What Is Driver Swap? (The Technical View)

Driver Swap is a multi-factor prediction engine built on top of Raceday's existing data pipeline. It doesn't require any new external data sources — everything is derived from race results (grid positions, finish positions) and lap timing data (lap-by-lap times from FastF1 for 2018+ races).

The architecture has three data extraction layers feeding into one prediction function:

1. **Teammate qualifying deltas** — Isolates the "driver skill" signal by comparing each driver to their teammate (who drives the same car). VER qualifying P1 while PER qualifies P15 in the same Red Bull tells us VER is ~14 positions better as a driver.

2. **Car performance gaps** — Measures the "car advantage" by comparing each team's best qualifying position and median lap pace. Red Bull's median lap being 0.6s faster than Mercedes tells us the car difference at that circuit.

3. **Tyre degradation profiles** — Captures the "tyre management" style by fitting a linear regression to each driver's lap times within their stints. A negative slope relative to the race average means this driver is gentle on tyres.

The prediction function (`simulate_swap`) combines these three signals over the race distance to estimate a total time advantage, then converts that to a position change using a diminishing-returns heuristic.

---

## The Problem It Solves

Before Driver Swap, F1 debates about car vs driver were entirely qualitative. Pundits would say "the Red Bull is clearly faster" but couldn't quantify by how much, or what would happen if a specific driver switched teams. Fantasy F1 leagues use arbitrary point systems. Racing games use fictional physics.

Raceday's Driver Swap uses the actual race data — the real lap times from the real event — to give a quantified answer. It's still an estimate, but it's an estimate grounded in data, not opinion.

The challenge: you can't separate "driver" from "car" perfectly. Hamilton's lap times are a product of both his skill AND the Mercedes he's driving. The trick is using the **teammate comparison** as a control variable — since teammates drive the same car, the gap between them is mostly driver skill.

---

## How It Works

### Factor 1: Teammate Qualifying Deltas

Plain English: How much faster is this driver than their teammate? Since they drive the same car, the gap is mostly talent.

```python
def get_teammate_deltas(year, track):
    # Group drivers by team
    # For each driver, find teammate, compute grid delta
    # delta = my_grid - teammate_grid
    # Negative = I qualified higher (better)
```

**`backend/core/strategy_sim.py:563-619`**

The function groups all drivers by team, then for each 2-car team computes the grid position difference between teammates. At the 2023 British GP:

| Driver | Teammate | Delta | Meaning |
|--------|----------|-------|---------|
| VER | PER | -14 | Verstappen 14 positions ahead |
| HAM | RUS | +1 | Hamilton 1 position behind Russell |
| LEC | SAI | -1 | Leclerc 1 position ahead of Sainz |
| HUL | MAG | -8 | Hulkenberg 8 positions ahead |

This delta is the "driver skill" signal. When we swap HAM into a Red Bull, we keep his skill (approximately neutral — he's roughly as fast as Russell) but change his car.

Edge case: solo entries (reserve drivers, only 1 car finished) get a delta of 0.

### Factor 2: Car Performance Gaps

Plain English: How fast is each team's car compared to the fastest car? Measured in seconds per lap using real race data.

```python
def get_car_performance_gaps(year, track):
    # Grid-based gaps (always available)
    # + Lap-time-based gaps for 2018+ (more accurate)
    # Returns gap_positions AND gap_seconds
```

**`backend/core/strategy_sim.py:622-708`**

Two layers of accuracy:

**Layer 1 (all years):** Best grid position per team. Simple but imprecise — grid position doesn't tell you the actual speed difference.

**Layer 2 (2018+ only):** Median clean lap time per driver, then best pace per team. This gives the gap in actual seconds. At Silverstone 2023:

| Team | Best Grid | Gap (positions) | Gap (seconds/lap) |
|------|-----------|------------------|--------------------|
| Red Bull | P1 | 0 | 0.000s |
| McLaren | P2 | 1 | +0.384s |
| Ferrari | P4 | 3 | +0.592s |
| Mercedes | P6 | 5 | +0.606s |
| Williams | P8 | 7 | +1.057s |

The median (not mean) lap time is used to resist outliers from safety car periods and pit laps. Clean laps are filtered: no lap 1, no pit laps, times between 60-180 seconds, no NaN values.

For pre-2018 races (no lap data), the engine falls back to a heuristic: ~0.3 seconds per grid position. Crude but the best available.

### Factor 3: Tyre Degradation Profiles

Plain English: Does this driver save their tyres or burn through them? Some drivers are gentle and can run longer stints. Others push hard and need to pit sooner.

```python
def get_driver_deg_profiles(year, track):
    # For each driver, for each stint:
    #   Fit linear regression: time = a + b * stint_age
    #   b = degradation rate
    # Compare to race average
    # Label: "Easy on tyres" / "Average" / "Hard on tyres"
```

**`backend/core/strategy_sim.py:711-816`**

For each driver's stint, the function:
1. Extracts clean lap times (same filters as car gaps)
2. Fits a linear regression: `lap_time = intercept + slope * stint_age`
3. The slope is the degradation rate (how much slower per lap)
4. Clamps to physical range: -0.1 to +0.3 s/lap
5. Compares each driver's average slope to the race average

The `tyre_saving` score is the delta from average:
- Negative = saves tyres (degrades slower than field average)
- Positive = burns through tyres (degrades faster)

At Silverstone 2023: Ocon saved the most (-0.030 s/lap vs average), Hulkenberg was hardest on tyres (+0.058 s/lap).

Note: slopes are often negative overall because fuel burn-off makes cars faster over time, which offsets degradation. The relative comparison (driver vs race average) is what matters, not the absolute value.

### The Prediction Engine

Plain English: Combine car speed + tyre management across the full race distance, then convert to a predicted finish position.

**`backend/core/strategy_sim.py:869-1060`**

```python
def simulate_swap(year, track, driver_code, target_team):
    # Factor 1: car gap per lap (source car vs target car)
    car_delta_per_lap = source_secs - target_secs  # positive = target faster

    # Factor 2: tyre management effect
    tyre_total_effect = tyre_saving * total_laps * 0.6

    # Combine over race distance
    car_total_effect = car_delta_per_lap * total_laps
    total_advantage = car_total_effect - tyre_total_effect

    # Convert to position change (diminishing returns)
    # First 20s: ~1 position per 5s
    # Beyond 20s: ~1 position per 10s
```

The key formula:

```
total_advantage = (car_gap_per_lap × race_laps) - (tyre_saving × race_laps × 0.6)
```

The 0.6 factor on tyre saving accounts for the fact that degradation differences only manifest in the second half of each stint (the first few laps on fresh tyres are similar for everyone).

Position change uses the same diminishing-returns heuristic from the strategy simulator:
- 0-20 seconds: 1 position per 5 seconds (tight midfield gaps)
- 20+ seconds: 1 position per 10 seconds (bigger gaps further back)

The verdict is generated in plain English: "Lewis Hamilton in the Red Bull Racing would likely finish ~P1, gaining 2 positions. The Red Bull Racing car is 0.6s/lap faster."

---

## What We Built

### Overview

The Driver Swap feature is integrated directly into the existing Strategy Simulator component as a second mode. Users toggle between "Strategy" (the original pit stop simulator) and "Driver Swap" with a tab-style button at the top.

When the user opens Driver Swap:
1. Two dropdowns appear: "Put this driver" and "In this car"
2. The car dropdown shows each team with their qualifying position and gap info
3. Below the dropdowns, a line shows who currently drives for the target team
4. Hit "Swap Driver" and a result card appears with:
   - Time advantage (big number, green or red)
   - Position change (P3 → P1 with arrow)
   - Factor breakdown (car gap per lap + tyre management label)
   - Plain-English verdict
   - Model disclaimer

### Architecture

```
Frontend (StrategySimulator.tsx)
  │
  ├─ GET /swap-context
  │    → Returns: teams[], teammate_deltas{}, car_gaps{}, deg_profiles{}
  │    → Populates driver + team dropdowns
  │
  └─ POST /simulate-swap { driver, target_team }
       │
       ▼
  Backend (strategy_sim.py)
       │
       ├─ get_teammate_deltas()     → driver skill signal
       ├─ get_car_performance_gaps() → car speed signal
       ├─ get_driver_deg_profiles()  → tyre management signal
       │
       └─ simulate_swap()
            ├─ Combine 3 factors over race distance
            ├─ Convert to position change (diminishing returns)
            ├─ Generate verdict
            └─ Return prediction + factors + verdict
```

### Code Walkthrough: The Prediction Flow

**Step 1: Get the car speed difference**

The most important factor. If the target car is 0.6s/lap faster over 52 laps, that's 31 seconds of advantage.

```python
source_gap = car_gaps.get(source_team, {})
target_gap = car_gaps.get(target_team, {})

source_secs = source_gap.get("gap_seconds")
target_secs = target_gap.get("gap_seconds")

if source_secs is not None and target_secs is not None:
    car_delta_per_lap = source_secs - target_secs
else:
    # Pre-2018 fallback: ~0.3s per grid position
    car_delta_per_lap = (source_pos - target_pos) * 0.3
```

The `gap_seconds` values are both relative to the fastest team. So if Mercedes is +0.606 and Red Bull is +0.000, then moving from Mercedes to Red Bull gives car_delta_per_lap = 0.606 (positive = target car is faster).

**Step 2: Apply tyre management**

A driver who saves tyres can extend stints, which sometimes avoids an extra pit stop. The effect is modelled as a time saving across the race:

```python
tyre_total_effect = tyre_saving * total_laps * 0.6
```

The 0.6 multiplier: only ~60% of the race distance is affected by degradation differences. The first few laps of each stint are on fresh rubber where everyone's pace is similar.

**Step 3: Combine and predict**

```python
car_total_effect = car_delta_per_lap * total_laps
total_advantage = car_total_effect - tyre_total_effect
```

Why subtract tyre_total_effect? Because `tyre_saving` is negative for gentle drivers (they're *saving* time vs the field). Double-negative: subtracting a negative adds to the advantage.

**Step 4: Position change with diminishing returns**

```python
if abs_advantage <= 20:
    pos_change = round(abs_advantage / 5.0) * sign
else:
    pos_change = round((4 + (abs_advantage - 20) / 10.0)) * sign
```

The first 20 seconds of advantage (or disadvantage) translate to about 4 positions. Beyond that, each additional position requires more time because the gaps between cars widen further down the field. This matches F1 reality: the gap between P1 and P5 might be 15 seconds, but the gap between P10 and P15 could be 40 seconds.

### Frontend: The Mode Toggle

The Strategy Simulator now has a state variable `mode: "strategy" | "swap"`. Switching modes clears results from both and shows the appropriate UI.

```tsx
<div className="flex gap-1 rounded-lg bg-zinc-800 p-1">
  {(["strategy", "swap"] as const).map((m) => (
    <button
      key={m}
      onClick={() => { setMode(m); setResult(null); setSwapResult(null); }}
      className={`flex-1 rounded-md py-1.5 text-xs font-medium ...`}
    >
      {m === "strategy" ? "Strategy" : "Driver Swap"}
    </button>
  ))}
</div>
```

The swap UI disables the button and shows "Driver is already in this team" when the selected driver's team matches the target team. This is a frontend guard — the backend also returns an error for same-team swaps.

---

## Common Patterns

### Pattern 1: Three-Factor Prediction Model

What it's for: Combining independent data signals into a single outcome prediction.

The pattern: extract each factor independently with its own function, then combine them in a prediction function with explicit weights. Each factor has:
- Its own extraction function with its own data source
- A normalized output (e.g., seconds per lap, positions)
- A known limitation (pre-2018 data gaps)

This is better than a single monolithic function because:
- Each factor can be tested independently
- The frontend can display factor breakdowns
- New factors can be added without changing the others

### Pattern 2: Graceful Degradation by Data Era

What it's for: Providing useful results even when some data sources aren't available.

```python
if source_secs is not None and target_secs is not None:
    car_delta_per_lap = source_secs - target_secs  # data-driven
else:
    car_delta_per_lap = (source_pos - target_pos) * 0.3  # grid-estimate
```

For 2018+ races: all three factors use real lap data (seconds-per-lap gaps, degradation slopes, median pace).
For pre-2018: car gap uses grid positions with a heuristic (0.3s per position), deg profiles return empty, teammate deltas still work (grid positions always available).

The `model_used` field in the response tells the frontend which model produced the result, so the UI can show an appropriate disclaimer.

### Pattern 3: Dual-Mode Component

What it's for: Adding a second feature to an existing component without breaking the first.

```tsx
const [mode, setMode] = useState<"strategy" | "swap">("strategy");
```

Both modes share: the same component, the same collapsed/expanded state, the same driver context. They diverge: strategy mode has pit stop controls and compound selectors; swap mode has team selector and factor breakdown. Switching modes clears results from both.

---

## Edge Cases & Gotchas

1. **Same-team swap**
   In plain English: If you try to put Verstappen in a Red Bull (his own car), the system returns an error instead of nonsense results.
   Technical cause: The car gap would be 0, the teammate delta would be comparing him to himself. The result would be meaningless.
   How to avoid: Frontend disables the button + backend returns an explicit error message.

2. **Pre-2018 races have no degradation data**
   In plain English: For races before 2018, the system can only use grid positions (not lap times) and can't estimate tyre management.
   Technical cause: FastF1 lap timing data starts at 2018. Earlier races only have results and grid positions.
   How to avoid: The model falls back to grid-position-based estimates (~0.3s per position) and labels the result as "grid-estimate" so the UI shows a disclaimer.

3. **Wet races produce unusual car gaps**
   In plain English: Rain races scramble the pecking order. The "car gap" measured in a wet race doesn't reflect normal dry-condition car speed.
   Technical cause: Different teams have different levels of rain performance. A midfield car might look like a frontrunner in the wet.
   How to avoid: Currently not handled specifically — the prediction reflects the wet-condition performance, which is arguably what the user wants ("what if Hamilton was in a Red Bull during this specific wet race").

4. **Solo team entries (reserve drivers)**
   In plain English: Some teams occasionally run a reserve driver for one race. That driver has no teammate to compare against.
   Technical cause: With only 1 driver, the teammate delta is 0 (no comparison possible).
   How to avoid: The code handles this with `if len(drivers_with_grid) < 2: delta = 0`.

5. **Tyre saving can be misleading for short stints**
   In plain English: A driver who did 3 very short stints might show "Easy on tyres" simply because their tyres were always fresh, not because they're actually gentle.
   Technical cause: Short stints (< 5 clean laps) are filtered out, but 5-8 lap stints can still have insufficient data for a reliable slope.
   How to avoid: The `stints_analyzed` count is included in the profile so the prediction engine (and future UI) can weigh the confidence.

---

## How It Connects to Other Concepts

- **Strategy Simulator (Phase 6I, 7A)**: Driver Swap shares the same component, data pipeline, and position-change heuristic. The ML calibration from Phase 7A (extrapolation guard, coefficient clamping) ensures the car gap calculations are reliable.

- **Phase 7C (Beautification)**: The swap UI follows the same design language as the strategy controls — zinc-900 backgrounds, compact labels, green/red colouring for gains/losses.

- **Phase 7E (Browser Extension)**: The swap data could feed into live race predictions — "Hamilton in a Red Bull would be leading by 15 seconds right now."

- **Product Vision**: Driver Swap is the feature that generates social media controversy. "Data says Alonso in a McLaren would've won 4 more races" is the kind of claim that drives engagement and shares.

---

## Going Deeper

### Qualifying Time-Based Deltas (Instead of Grid Positions)
Currently the teammate delta uses grid positions (integer values). For even more accuracy, you could load actual qualifying lap times from FastF1 and compute the delta in seconds. This would distinguish between "1 position and 0.1s" vs "1 position and 0.8s" — both show as delta=1 in the current system. This would require loading the qualifying session (`get_session(year, track, "Q")`) and extracting best lap times per driver.

### Multi-Race Driver Profiles
Currently the deg profile is per-race. Across an entire season, you could build a persistent driver profile: "Hamilton saves 0.02s/lap on average across all 2023 races." This would make predictions more robust (not dependent on one race's data) and could feed into pre-race predictions for upcoming events.

### Combining Strategy + Swap
The ultimate feature: "What if Hamilton was in a Red Bull AND used a different pit strategy?" Currently strategy mode and swap mode are separate. Combining them would let users simultaneously change the car and the strategy — the swap engine adjusts the base pace, then the strategy engine runs on top.

---

## Quick Reference

### Key Terms

| Term | Plain English | Technical |
|------|---------------|-----------|
| Teammate delta | How much faster you are than your teammate | Grid position difference between same-team drivers |
| Car gap | How fast your car is vs the fastest car | Median lap time difference in seconds per lap |
| Tyre saving | Whether you're gentle or hard on tyres | Degradation slope vs race average (negative = gentle) |
| Diminishing returns | Big advantages don't translate to proportionally more positions | First 20s = 1pos/5s, beyond = 1pos/10s |
| Grid-estimate | Rough prediction when lap data isn't available | ~0.3s per grid position heuristic |

### API Endpoints

```
GET  /races/{year}/{track}/swap-context
     → { teams[], teammate_deltas{}, car_gaps{}, deg_profiles{} }

POST /races/{year}/{track}/simulate-swap
     Body: { driver: "HAM", target_team: "Red Bull Racing" }
     → { prediction, factors, verdict, model_used }
```

### Key Functions

```python
# backend/core/strategy_sim.py

get_teammate_deltas(year, track)      # → {driver: {teammate, delta_positions}}
get_car_performance_gaps(year, track)  # → {team: {gap_seconds, gap_positions}}
get_driver_deg_profiles(year, track)   # → {driver: {tyre_saving, label}}
get_swap_context(year, track)          # → combines all three for frontend
simulate_swap(year, track, driver, team)  # → prediction + verdict
```

---

*Generated: 2026-03-22 | Project: Raceday | Phase 7B complete (8 steps, 8 commits)*
