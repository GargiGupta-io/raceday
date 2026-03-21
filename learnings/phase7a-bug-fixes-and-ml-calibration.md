# Phase 7A — Bug Fixes, ML Calibration & Production Hardening

> Fixing the invisible math problems that made the strategy simulator lie, cleaning up dead code, and making every page feel polished while loading.

---

## In Plain English

Imagine you built a weather forecasting app. It works great most of the time — sunny days, cloudy days, normal rain. But one day someone checks the forecast for a hurricane, and your app says "24°C and sunny" because it's never seen wind speeds that high and its math goes haywire. That's essentially what was happening with Raceday's strategy simulator.

The simulator takes real lap timing data from F1 races and fits a mathematical curve to predict how fast a car goes on different tyres. It works brilliantly for normal races — 2-stop strategies on dry tracks. But when someone tried a 1-stop strategy with a very long stint on hard tyres, the math exploded. The curve-fitting formula assumed tyres degrade faster and faster *forever*, when in reality degradation levels off. A 40-lap stint on hards shouldn't show "200 seconds slower" — that's absurd.

Phase 7A was about finding and fixing these edge cases. Not just the simulator — also cleaning up leftover code from features we'd already removed, making every page show nice animated placeholder shapes while loading instead of plain "Loading..." text, and ensuring the radio playback feature degrades gracefully when no transcription service is configured. It's the unglamorous work that separates a demo from a product.

---

## What Was Fixed (The Full Picture)

Phase 7A covered 8 steps across three categories:

```
┌──────────────────────────────────────────────────┐
│  PHASE 7A — BUG FIXES & CLEANUP                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  ML Calibration (Step 1)                         │
│  ├── Quadratic extrapolation guard               │
│  ├── Coefficient sanity clamping                 │
│  ├── Weather mismatch detection                  │
│  ├── Delta cap (±120s)                           │
│  └── Position change diminishing returns         │
│                                                  │
│  Radio Pipeline (Steps 2-3)                      │
│  ├── Faster-whisper fallback                     │
│  ├── .env.example with Groq setup guide          │
│  ├── "Audio only" UI indicator                   │
│  └── RadioMoments redesign (team colour play)    │
│                                                  │
│  Infrastructure (Steps 4-8)                      │
│  ├── Laps.json batch generator                   │
│  ├── Skeleton loaders (4 pages)                  │
│  ├── Circuit SVG audit (100% coverage)           │
│  ├── Dead code removal (RSS + Reddit)            │
│  └── Visual test across 5 eras                   │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## The ML Calibration Problem (Step 1)

### What Was Going Wrong

The strategy simulator uses polynomial regression to predict lap times. The model fits a curve through hundreds of real lap times from a race:

```
lap_time = c0 + c1 × stint_age + c2 × stint_age² + c3 × race_lap
```

Where:
- `c0` = base lap time (intercept — how fast is the car on fresh tyres?)
- `c1` = linear degradation (how much slower per lap on worn tyres?)
- `c2` = quadratic degradation (the "cliff" — non-linear tyre death)
- `c3` = fuel correction (lighter car = faster as fuel burns off)

This works because real tyre degradation isn't linear. Tyres are fine for 15 laps, then suddenly fall off a cliff — the quadratic `c2` term captures this.

**The bug:** When a user picked a 1-stop strategy that put a driver on hard tyres for 40+ laps, the `stint_age²` term exploded. The training data only had stints up to ~25 laps, so the model was *extrapolating* into territory it had never seen. `c2 × 40² = c2 × 1600` — even a tiny `c2` value creates a massive penalty.

Plain English: The model learned from reality (stints of 10-25 laps) and was asked to predict fantasy (stints of 40+ laps). It panicked.

### The Five Fixes

#### Fix 1: Extrapolation Guard

The model now tracks the maximum stint age it actually saw in the training data (95th percentile). When predicting beyond that, it switches from quadratic to linear extrapolation.

**`backend/core/strategy_sim.py:457-494`**

```python
def _predict_lap_time_ml(model, compound, stint_age, race_lap):
    # Cap stint_age to prevent quadratic extrapolation
    max_stint_age = model.get("max_stint_ages", {}).get(compound.upper(), 35)
    capped_age = min(stint_age, max_stint_age)

    # Beyond the cap: linear extension only (no quadratic explosion)
    extra_laps = max(0, stint_age - max_stint_age)
    linear_deg_per_lap = coeffs[0] + 2 * coeffs[1] * capped_age  # derivative at cap

    predicted = (coeffs[0] * capped_age +
                 coeffs[1] * capped_age ** 2 +
                 coeffs[2] * race_lap +
                 coeffs[3])

    if extra_laps > 0:
        predicted += max(0, linear_deg_per_lap) * extra_laps

    # Sanity clamp: no lap can deviate more than 15s from circuit baseline
    predicted = max(base_lap - 5.0, min(base_lap + 15.0, predicted))
    return predicted
```

The key insight is taking the *derivative* of the quadratic at the cap point and using that as the slope for the linear extension. This means the curve transitions smoothly — it doesn't suddenly flatten or jump. It's like saying "the tyre was degrading at X seconds per lap when we last had real data, so we'll assume it continues at that rate instead of accelerating."

#### Fix 2: Coefficient Sanity Clamping

Sometimes the regression produces absurd coefficients, especially for compounds with few data points (WET tyres in a race that was only wet for 5 laps). The model now clamps these:

```python
# Quadratic degradation: max 0.01 s/lap² (beyond = unphysical)
if quad_deg > 0.01:
    coeffs[1] = 0.01

# Negative quadratic: makes no physical sense (tyres getting better?)
if quad_deg < -0.005:
    coeffs[1] = 0.0

# Linear degradation: extreme negatives zeroed
if linear_deg < -0.5:
    coeffs[0] = 0.0

# Fuel effect: should be negative and modest (lighter = faster)
if abs(fuel_effect) > 0.3:
    coeffs[2] = -0.06  # fallback to standard
```

The 2019 German GP (chaotic wet race) triggered 7 clamping warnings — WET compound had `quad_deg = -3.36` (negative!) and `fuel_effect = 36.1` (cars apparently getting 36 seconds slower per lap from fuel?). The clamping caught all of these.

#### Fix 3: Weather Mismatch Detection

The 2024 British GP exposed this: Hamilton's actual strategy used INTERMEDIATE tyres (rain mid-race). A user trying MEDIUM → HARD (dry) would see "-238 seconds" — the model thinks dry tyres are way faster because it's comparing apples to oranges.

```python
wet_compounds = {"INTERMEDIATE", "WET"}
actual_had_wet = any(c.upper() in wet_compounds for c in actual_compounds)
alternate_has_wet = any(c.upper() in wet_compounds for c in compounds)
weather_mismatch = actual_had_wet != alternate_has_wet

if weather_mismatch and abs(delta_seconds) > 30:
    delta_seconds = 0.0
    verdict = ("This race had changing weather conditions. The actual strategy "
               "included wet-weather tyres, so a pure dry comparison isn't "
               "meaningful. Try including INTERMEDIATE or WET compounds.")
```

Instead of showing a bogus number, the simulator now explains *why* the comparison doesn't work and tells the user what to do instead.

#### Fix 4: Delta Cap (±120 seconds)

Even with all other guards, edge cases might slip through. The final safety net: no delta can exceed ±120 seconds. If the raw delta is larger, it's capped and a warning is logged.

```python
raw_delta = alternate_result["total_time"] - actual_result["total_time"]
delta_seconds = max(-120.0, min(120.0, raw_delta))
```

120 seconds is roughly 2 minutes — the biggest reasonable strategy difference in a 90-minute race. Anything beyond that is a model failure, not a strategy insight.

#### Fix 5: Position Change Diminishing Returns

The old heuristic: `1 position per 5 seconds`. This meant a 100s delta = "lose 20 positions" — impossible when there are only 20 cars.

The new heuristic uses diminishing returns:
- First 20 seconds: ~1 position per 5s (tight midfield gaps)
- Beyond 20 seconds: ~1 position per 10s (bigger gaps further back)

```python
if abs_delta <= 20:
    pos_change = round(abs_delta / 5.0) * sign
else:
    pos_change = round((4 + (abs_delta - 20) / 10.0)) * sign
```

This reflects reality: the gap between P1 and P2 might be 5 seconds, but the gap between P15 and P16 could be 30+ seconds.

### Test Results After Calibration

| Test | Before | After |
|------|--------|-------|
| HAM 2023 1-stop S→H | Unrealistic delta | +12.6s, P6 (sensible) |
| HAM 2023 0-stop H | Massive blowup | +11.8s, P5 (reasonable) |
| HAM 2024 M→H (wet race) | -238s (bogus) | 0s + weather warning |
| VER 2023 3-stop S-S-S-S | Very large | +45.7s, P8 (correct — extra pit stops cost time) |
| 2019 German GP (chaotic) | Model failure | 7 coefficients clamped, weather mismatch detected |

---

## Radio Pipeline Hardening (Steps 2-3)

### The Transcription Architecture

Team radio clips come from OpenF1 as MP3 URLs. Transcribing them to text requires a speech-to-text service. The pipeline supports three backends in fallback order:

```
┌─────────────────────────────────────────────┐
│  Radio Clip (MP3 URL from OpenF1)           │
│       │                                     │
│       ▼                                     │
│  Download to local cache                    │
│       │                                     │
│       ▼                                     │
│  Transcription (try in order):              │
│    1. Groq API (free tier, fast)            │
│    2. OpenAI API (paid, reliable)           │
│    3. faster-whisper (local, no API needed) │
│    4. openai-whisper (local, heavy)         │
│       │                                     │
│       ▼                                     │
│  Cache result to disk (even if None)        │
│       │                                     │
│       ▼                                     │
│  Return transcript or None                  │
└─────────────────────────────────────────────┘
```

Phase 7A added `faster-whisper` as option 3 — it uses CTranslate2 instead of PyTorch, making it much lighter. The `.env.example` file now has clear instructions for setting up Groq's free tier.

**Key design decision:** Caching `None` results. If no backend can transcribe a clip, we cache that fact so we don't retry the same clip every page load. This prevents the "try 3 backends, fail 3 times, wait 15 seconds" loop on pages with 5 clips.

### RadioMoments UI Redesign

The old design had separate pieces: a sentiment emoji icon, driver name, transcript text, and a small play button below everything. The new design integrates everything into one cohesive card:

```
┌─────────────────────────────────────────────┐
│ ┌────┐                                      │
│ │ ▶  │  Max Verstappen  VER   Lap 23       │
│ │play│  ───────────────── (progress bar)     │
│ └────┘                                      │
│         "Box box, box box"                   │
│                                    Strategy  │
├─ team colour border (left edge) ─────────────┤
```

Key changes:
- **Play button IS the icon** — tap the big circle to play, it fills with team colour
- **Progress bar directly below driver name** — not in a separate row
- **Team colour accent** — left border strip, play button fill, progress bar colour
- **SVG icons** for play/pause instead of text characters (`▶` and `| |`)
- **Hover scale + active press** animation on the play button

---

## Infrastructure Fixes (Steps 4-8)

### Batch Laps Generator (Step 4)

The strategy simulator needs `laps.json` for each race (2018+). Previously this was generated on-demand — the first person to open a race waited 10-15 seconds while FastF1 fetched data. Now there's a batch script:

```bash
python -m backend.scripts.generate_laps           # all missing
python -m backend.scripts.generate_laps --year 2023   # single year
python -m backend.scripts.generate_laps --dry-run     # preview
```

Status: 146 out of 173 races were missing laps.json. 2018 (21 races) was generated as a test — all successful. The script also found that FastF1 sometimes returns "nan" as a compound name for 2018 races, which was patched in the loader to normalize to "UNKNOWN".

### Skeleton Loaders (Step 5)

Four pages were upgraded from plain text loading states to animated skeleton placeholders:

| Page | Before | After |
|------|--------|-------|
| Race page | "Loading race data..." | Ghost podium + moments + story shapes |
| Home page | "Loading 2024 season..." | 6 empty race card outlines |
| Pattern finder | "Searching..." | 5 result row skeletons |
| Championship | "Loading standings..." | Leader card + 8 table rows |

All skeletons use Tailwind's `animate-pulse` class and match the actual layout shapes. Error messages were also improved — they now appear in styled boxes with a hint to check the backend, instead of raw red text.

### Dead Code Removal (Step 7)

The Discussion section was killed back in Phase 6, but two entire backend files and a library dependency were still hanging around:

- `backend/core/rss_fetcher.py` — fetched news articles from RSS feeds (~150 lines)
- `backend/core/reddit_fetcher.py` — scraped Reddit r/formula1 posts (~200 lines)
- `feedparser` in requirements.txt — RSS parsing library, no longer needed
- `SidebarData` interface in the race page — still defined `articles` and `reddit` fields that nothing used

The sidebar function was also still importing these modules and wiring up their results, even though the frontend's `FactsSidebar` only reads `did_you_know`. All cleaned out.

### Circuit SVG Audit (Step 6)

Quick audit found 100% coverage — all 35 unique circuits have SVG outlines, all indexed race names map to a circuit, and all 2025 tracks are present. No action needed.

### Visual Test (Step 8)

Tested 5 races spanning the full data range:

| Race | Year | Era | Weather | Result |
|------|------|-----|---------|--------|
| British GP | 2010 | Pre-2018 (no lap data) | Dry | All features pass |
| Hungarian GP | 2015 | Pre-2018 | Dry | All features pass |
| German GP | 2019 | ML model | Wet (chaotic) | 7 clamps triggered, weather mismatch detected |
| British GP | 2023 | ML + radio | Dry | Simulator + 5 radio clips |
| Miami GP | 2025 | Latest season | Damp | All features pass |

---

## How the Pieces Connect

```
User clicks "Simulate"
       │
       ▼
Frontend (StrategySimulator.tsx)
  → POST /races/{year}/{track}/simulate
  → Body: { driver, pit_stop_laps, compounds }
       │
       ▼
API (api.py)
  → simulate_strategy(year, track, driver, ...)
       │
       ▼
strategy_sim.py
  ├── Load race data from indexer
  ├── Load laps.json (2018+) or use physics model
  ├── _build_circuit_model() ← NEW: coefficient clamping
  │     ├── Collect training data per compound
  │     ├── IQR outlier removal
  │     ├── Polynomial regression (least squares)
  │     ├── Clamp extreme coefficients ← NEW
  │     └── Track max_stint_ages ← NEW
  ├── Predict actual strategy total time
  ├── Predict alternate strategy total time
  │     └── _predict_lap_time_ml() ← NEW: extrapolation guard
  │           ├── Cap stint_age at training max
  │           ├── Linear extension for extrapolated laps
  │           └── Sanity clamp (±15s from base)
  ├── Calculate delta ← NEW: ±120s cap
  ├── Position change ← NEW: diminishing returns
  ├── Weather mismatch check ← NEW
  └── Generate verdict
       │
       ▼
Frontend displays result
  → delta_seconds, predicted_position, verdict
  → weather_mismatch flag for UI warning
```

---

## Common Patterns

### Pattern 1: Extrapolation Guards for ML Models

What it's for: Preventing regression models from producing garbage when asked to predict beyond their training data.

The general pattern:
1. During training, record the bounds of your input features (e.g., max stint age per compound)
2. During prediction, cap inputs at those bounds
3. For values beyond the cap, switch to a simpler model (linear extrapolation from the derivative at the cap point)
4. Add a final sanity clamp on the output

This applies to any polynomial regression, not just tyre degradation — any model with quadratic+ terms will explode on extrapolation.

### Pattern 2: Weather-Aware Comparisons

What it's for: Detecting when two strategies can't be meaningfully compared because one accounts for rain and the other doesn't.

```python
wet_compounds = {"INTERMEDIATE", "WET"}
actual_had_wet = any(c in wet_compounds for c in actual_compounds)
alternate_has_wet = any(c in wet_compounds for c in user_compounds)
if actual_had_wet != alternate_has_wet:
    # Comparison is meaningless — tell user why
```

### Pattern 3: Multi-Backend Fallback with Caching

What it's for: Trying multiple service providers in priority order, caching results (including failures) to avoid retrying.

```
try backend_1 → if fails, try backend_2 → if fails, try backend_3
cache the result (even if None) to disk
next request: check cache first, skip all backends
```

This pattern appears in the radio transcription pipeline and could be reused for any external service dependency.

---

## Edge Cases & Gotchas

1. **Compound "nan" in early FastF1 data (2018)**
   In plain English: Some 2018 races have tyre data where the compound name is literally the text "nan" instead of "SOFT" or "MEDIUM".
   Technical cause: FastF1's historical data doesn't always have compound metadata for early supported seasons.
   How to avoid: Normalize in the loader — check for "nan", "none", "" and convert to "UNKNOWN".

2. **WET compound regression with 5 laps of data**
   In plain English: If a race had only 5 laps of rain, the model tries to fit a 4-parameter polynomial to 5 data points. The fit is meaningless.
   Technical cause: Least squares with nearly as many parameters as data points produces overfitting.
   How to avoid: Minimum 15 samples per compound before fitting (`if len(samples) < 15: continue`).

3. **Safety car laps contaminating training data**
   In plain English: During a safety car, lap times are 30+ seconds slower than normal. If these leak into the training data, the model thinks tyres degrade much worse than they actually do.
   Technical cause: Safety car laps have artificially slow times that aren't related to tyre performance.
   How to avoid: IQR outlier removal catches most of these. The `time_sec > 180` filter catches extreme cases. Lap 1 is always excluded.

4. **Position change overflow**
   In plain English: A 100-second delta with the old "1 position per 5 seconds" heuristic says "lose 20 positions" — but there are only 20 cars total.
   Technical cause: Linear mapping doesn't account for the non-linear distribution of gaps between positions.
   How to avoid: Diminishing returns formula + `max(1, min(len(finishers), ...))` clamping.

---

## How It Connects to Other Concepts

- **Phase 6I (Strategy Simulator)**: Phase 7A calibrates the ML model that Phase 6I built. The model architecture is unchanged — these are guardrails and sanity checks.
- **Phase 7B (Driver Swap)**: The calibrated model is the foundation. Driver Swap will add qualifying deltas and degradation profiles *on top of* this calibrated base.
- **Phase 7C (Beautification)**: The skeleton loaders from Step 5 are a preview of the visual polish coming in Phase 7C. The RadioMoments redesign (Step 3) is already at the Phase 7C quality bar.
- **Deployment**: The laps.json batch generator (Step 4) is critical for deployment — you can't have users waiting 15 seconds for on-demand FastF1 calls under load.

---

## Quick Reference

### Key Terms

| Term | Plain English | Technical |
|------|---------------|-----------|
| Quadratic blowup | The math goes crazy on long stints | `c2 × age²` grows exponentially beyond training data |
| Coefficient clamping | Force extreme regression values into safe ranges | Cap `quad_deg`, `linear_deg`, `fuel_effect` at physical limits |
| Extrapolation guard | Don't trust the model beyond what it's seen | Cap `stint_age` at 95th percentile of training data |
| Weather mismatch | Can't compare dry vs wet strategies meaningfully | Detect INTERMEDIATE/WET in actual vs alternate compounds |
| IQR outlier removal | Remove freak lap times (safety car, crashes) | Values outside Q1 - 1.5×IQR to Q3 + 1.5×IQR |
| Skeleton loader | Animated placeholder shapes while data loads | `animate-pulse` divs matching the real layout |
| faster-whisper | Lightweight speech-to-text that runs locally | CTranslate2-based Whisper, no PyTorch needed |

### Essential Files Changed

```
backend/core/strategy_sim.py     — ML model + 5 calibration fixes
backend/core/radio_transcriber.py — faster-whisper fallback
backend/core/loader.py           — compound "nan" fix
backend/core/insights.py         — sidebar simplified (RSS/Reddit removed)
backend/scripts/generate_laps.py — batch laps.json generator
frontend/app/components/RadioMoments.tsx — redesigned card UI
frontend/app/races/[year]/[track]/page.tsx — skeleton + cleanup
frontend/app/page.tsx            — skeleton race cards
frontend/app/patterns/page.tsx   — skeleton search results
frontend/app/championship/[year]/page.tsx — skeleton table
.env.example                     — Groq setup instructions
```

---

*Generated: 2026-03-22 | Project: Raceday | Phase 7A complete (8 steps, 8 commits)*
