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
