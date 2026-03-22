# Steps Log — Raceday Phase 7

---

## Step 1 — Strategy Simulator Calibration
*Completed: 2026-03-21*

**What was built**
- `backend/core/strategy_sim.py` — Fixed ML model to prevent unrealistic time deltas on long stints and wet races

**In plain English**
The strategy simulator had a math problem: when you tried a 1-stop strategy with a really long stint on hard tyres, the prediction went haywire — saying things like "120 seconds faster" which makes no sense. This happened because the model's curve-fitting formula assumed tyres degrade faster and faster forever, but in reality degradation levels off. Also, when a race had rain (like the 2024 British GP), comparing a dry strategy against the actual wet strategy produced meaningless numbers. Now the model caps its math at what it's actually seen in real data, clamps extreme values, and tells you when a weather mismatch makes the comparison invalid.

**Files changed**
~ modified: backend/core/strategy_sim.py
~ modified: learnings/product-analysis-and-vision.md
+ created: steps.md

---

## Step 2 — Radio Transcription Fix
*Completed: 2026-03-21*

**What was built**
- `backend/core/radio_transcriber.py` — Added faster-whisper as local fallback, improved backend detection
- `frontend/app/components/RadioMoments.tsx` — Shows "audio only" notice when transcripts unavailable
- `.env.example` — Clear instructions for enabling Groq (free) or OpenAI transcription

**In plain English**
The team radio feature lets you listen to actual driver/engineer radio clips. Transcribing them to text requires a speech-to-text service, and none were configured. Now there's a clear setup guide for enabling Groq's free tier (just needs a signup), and the code tries faster-whisper locally if available. When no transcription backend exists, the UI shows a subtle "audio only" notice instead of silently hiding transcripts.

**Files changed**
~ modified: backend/core/radio_transcriber.py
~ modified: frontend/app/components/RadioMoments.tsx
~ modified: .env.example
~ modified: backend/requirements.txt

---

## Step 3 — RadioMoments UI Polish
*Completed: 2026-03-21*

**What was built**
- `frontend/app/components/RadioMoments.tsx` — Redesigned radio cards with integrated play button, team colours, and inline progress bar

**In plain English**
Each radio clip card now looks and feels much better. The old design had a separate small play button below the text. Now the play button IS the big round icon on the left — tap it and it fills with the team's colour (Red Bull blue, Ferrari red, etc.) while playing. The progress bar sits directly under the driver's name, also in team colour when active. Sentiment labels (like "Celebration" or "Frustration") show as small coloured badges. The whole card has a team-coloured left border strip. It feels like one cohesive unit instead of separate pieces stacked together.

**Files changed**
~ modified: frontend/app/components/RadioMoments.tsx

---

## Step 4 — Pre-generate laps.json
*Completed: 2026-03-21*

**What was built**
- `backend/scripts/generate_laps.py` — Batch script to generate lap timing data for all 2018+ races
- `backend/core/loader.py` — Fixed compound "nan" values being stored instead of "UNKNOWN"

**In plain English**
The strategy simulator needs lap-by-lap timing data (laps.json) for each race. Previously, this was generated on-demand when someone opened a race — which meant the first visitor waited 10-15 seconds for FastF1 to fetch it. Now there's a script that pre-generates all of them in one batch run. Out of 173 indexed races from 2018-2025, 146 were missing laps.json. The script also found that early FastF1 data (2018) sometimes had "nan" instead of a tyre compound name, so the loader was patched to normalize those to "UNKNOWN".

Run with: `python -m backend.scripts.generate_laps` (takes ~30 min for all races)

**Files changed**
+ created: backend/scripts/generate_laps.py
~ modified: backend/core/loader.py

---

## Step 5 — Loading States & Error Handling
*Completed: 2026-03-22*

**What was built**
- `frontend/app/races/[year]/[track]/page.tsx` — Skeleton loader for race page (podium, moments, story shapes)
- `frontend/app/page.tsx` — Skeleton race cards grid while loading season
- `frontend/app/patterns/page.tsx` — Skeleton result rows while searching
- `frontend/app/championship/[year]/page.tsx` — Skeleton leader card + table rows

**In plain English**
Every page that loads data now shows animated placeholder shapes (skeletons) while waiting, instead of plain "Loading..." text. The race page shows ghost outlines of the podium, key moments, and story. The home page shows 6 empty race card shapes. The pattern finder shows 5 result row skeletons. The championship page shows a leader card outline plus 8 table row placeholders. Error messages are also improved — they now show inside styled boxes with a hint to check the backend, instead of plain red text.

**Files changed**
~ modified: frontend/app/races/[year]/[track]/page.tsx
~ modified: frontend/app/page.tsx
~ modified: frontend/app/patterns/page.tsx
~ modified: frontend/app/championship/[year]/page.tsx

---

## Step 6 — Circuit SVG Audit
*Completed: 2026-03-22*

**What was built**
Nothing — audit found everything already in place.

**In plain English**
Checked all 35 circuit SVG files against the circuit map and all indexed race names. Every SVG exists, every map entry has a file, and every race in the index (2010-2025, all 300+ races) maps to a circuit outline. This was already handled in Phase 6C. No gaps found.

**Files changed**
(none)

---

## Step 7 — Dead Code Cleanup
*Completed: 2026-03-22*

**What was built**
- Removed `backend/core/rss_fetcher.py` and `backend/core/reddit_fetcher.py` (Discussion was killed in Phase 6)
- Simplified `backend/core/insights.py` sidebar function — no more RSS/Reddit fetching
- Cleaned `SidebarData` interface — removed unused `articles` and `reddit` fields
- Removed `feedparser` from requirements.txt

**In plain English**
The Discussion section was removed back in Phase 6, but the code that fetched news articles (RSS) and Reddit posts was still sitting in the backend. Two whole files plus a library dependency that did nothing. The sidebar function was also still wiring up those results even though the frontend ignored them. All cleaned out — the sidebar now only returns "Did You Know" facts, which is all the frontend uses.

**Files changed**
- deleted: backend/core/rss_fetcher.py
- deleted: backend/core/reddit_fetcher.py
~ modified: backend/core/insights.py
~ modified: backend/requirements.txt
~ modified: frontend/app/races/[year]/[track]/page.tsx

---

## Step 8 — Visual Test (Phase 7A Verification)
*Completed: 2026-03-22*

**What was tested**
5 races across different years and conditions:
- 2010 British GP (pre-2018, dry)
- 2015 Hungarian GP (pre-2018, dry)
- 2019 German GP (wet, chaotic, 2018+ with ML model)
- 2023 British GP (dry, 2023+ with radio)
- 2025 Miami GP (damp, latest season)

**Results**
All passed. Simulator calibration fixes working — 2019 German GP correctly detects weather mismatch and clamps 7 extreme coefficients. Radio clips load for 2023+. Skeleton loaders, sidebar facts, stories, taglines, moments, precedents all functional across every era.

**Files changed**
(none — verification only)

---

## Step 9 — Extract Teammate Qualifying Deltas
*Completed: 2026-03-22*

**What was built**
- `backend/core/strategy_sim.py` — Three new functions: `get_teammate_deltas()`, `get_car_performance_gaps()`, `get_swap_context()`

**In plain English**
The Driver Swap feature needs to know two things: how much faster is one driver than their teammate (the "driver skill" part), and how much faster is one car than another (the "car performance" part). These functions extract both from existing race data. For example, at the 2023 British GP, Verstappen qualified 14 positions ahead of Perez (same Red Bull car — that's the driver gap), and Red Bull's best qualifying was P1 while McLaren's was P2 (that's the car gap). All computed from grid positions already in the index — no new data sources needed.

**Files changed**
~ modified: backend/core/strategy_sim.py

---

## Step 10 — Extract Tyre Degradation Profiles Per Driver
*Completed: 2026-03-22*

**What was built**
- `backend/core/strategy_sim.py` — `get_driver_deg_profiles()` function, integrated into `get_swap_context()`

**In plain English**
Every F1 driver treats their tyres differently. Some nurse them gently and can run longer stints. Others push hard and burn through rubber faster. This function analyses each driver's real lap times within their stints and calculates how quickly their tyres wore out compared to the race average. For example, at the 2023 British GP, Ocon saved his tyres the most (0.03s/lap better than average) while Hulkenberg was hardest on them. This data feeds into the Driver Swap prediction — if you put a tyre-saving driver in a car that usually chews through rubber, the model can estimate how that changes the strategy.

**Files changed**
~ modified: backend/core/strategy_sim.py (+110 lines)

---

## Step 11 — Calculate Car Performance Gap
*Completed: 2026-03-22*

**What was built**
- `backend/core/strategy_sim.py` — Enhanced `get_car_performance_gaps()` with real lap-time-based seconds-per-lap gap

**In plain English**
Step 9 built a rough car gap estimate using grid positions (Red Bull P1, McLaren P2 = "1 position gap"). But positions don't tell you the actual speed difference. Now the function also computes the gap in seconds per lap using real race data. At Silverstone 2023, Red Bull was 0.38s/lap faster than McLaren and 0.59s faster than Ferrari. Over a 52-lap race, that's nearly 20 seconds of pure car advantage. This is critical for Driver Swap — when you put Hamilton in a Red Bull, the model needs to know the car is 0.6s/lap faster than his Mercedes, not just "5 grid positions better."

**Files changed**
~ modified: backend/core/strategy_sim.py

---

## Step 12 — Driver Swap Prediction Engine
*Completed: 2026-03-22*

**What was built**
- `backend/core/strategy_sim.py` — `simulate_swap()` function (~170 lines)

**In plain English**
This is the brain of Driver Swap. You pick a driver and a different team's car, and it predicts where they'd finish. It combines three factors: car speed gap (seconds/lap), driver tyre management, and qualifying skill. Hamilton in a Red Bull at Silverstone 2023 goes from P3 to P1 (car is 0.6s/lap faster = 31s over 52 laps). Verstappen in a Williams drops from P1 to P9 (car is 1.1s/lap slower). Handles edge cases: same-team errors, pre-2018 grid-estimate fallback, tyre management commentary in verdicts.

**Files changed**
~ modified: backend/core/strategy_sim.py (+197 lines)

---

## Step 13 — Driver Swap API Endpoints
*Completed: 2026-03-22*

**What was built**
- `backend/api.py` — Two new endpoints: `GET /swap-context` and `POST /simulate-swap`

**In plain English**
The prediction engine from Step 12 is now accessible via the API. The frontend can call `/swap-context` to get the list of teams, teammate deltas, car gaps, and tyre profiles for the dropdown UI. Then when the user picks a driver and car, it calls `/simulate-swap` with the driver code and target team name, and gets back the predicted finish position, time advantage, and a human-readable verdict.

**Files changed**
~ modified: backend/api.py (+22 lines)

---

## Step 14 — Driver Swap UI in StrategySimulator
*Completed: 2026-03-22*

**What was built**
- `frontend/app/components/StrategySimulator.tsx` — Added mode toggle (Strategy / Driver Swap), full swap UI with team selector, factor breakdown, and prediction display

**In plain English**
The Strategy Simulator now has two modes accessible via a toggle at the top: "Strategy" (the original pit stop simulator) and "Driver Swap" (new). In swap mode, you pick a driver from a dropdown, then pick a target car from another dropdown that shows each team with their qualifying position and gap. Hit "Swap Driver" and you get a prediction card showing: the time advantage/disadvantage in seconds, position change (P3 to P1 with a green arrow), a breakdown of car gap per lap and tyre management style, and a plain-English verdict explaining the result.

**Files changed**
~ modified: frontend/app/components/StrategySimulator.tsx (+237 lines)

---

## Step 15 — Disclaimer + Edge Cases
*Completed: 2026-03-22*

**What was built**
- Disclaimers on both strategy and swap results (ML vs physics model notice)
- Pre-2018 grid-estimate notice for swap mode
- Same-team swap prevention in frontend (button disabled + message)
- Swap unavailable fallback when context fails to load

**In plain English**
Every prediction now has a small disclaimer: "ML regression trained on real lap data" for 2018+ or "Physics-based estimate (no lap timing data)" for older races. The Driver Swap button disables and shows "Driver is already in this team" when you pick the same team. If swap context fails to load, a clean "unavailable" message shows instead of a broken UI.

**Files changed**
~ modified: frontend/app/components/StrategySimulator.tsx

---

## Steps 21-24 — Mobile Responsiveness (Summary)
*Completed: 2026-03-22*

**What was built**
Steps 21-24 made all pages mobile-responsive:
- Step 21: Compact navbar ("Champ" on mobile), tighter padding across all 4 pages
- Step 22: Simulator — wider sliders, taller touch targets for compound buttons
- Step 23: Pattern Finder — single-column filter form on phones; Championship — responsive leader card + scrollable table
- Step 24: Cross-device audit — fixed championship min-width, deleted orphaned AuthButton (192 lines)

**In plain English**
The entire site now works on phones. The navbar compresses "Championship" to "Champ" on small screens. All pages use tighter padding (16px instead of 24px). The strategy simulator's controls stretch to full width on mobile with bigger tap targets. Pattern Finder filters stack to one column. Championship table scrolls horizontally if needed. A cross-device CSS audit found only 2 issues — both fixed.

**Files changed**
~ Navbar.tsx, page.tsx, races page, patterns page, championship page, StrategySimulator.tsx
- deleted: AuthButton.tsx (orphaned)

---
