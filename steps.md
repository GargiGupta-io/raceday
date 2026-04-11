# Phase 7 — Steps

> Execute with `/steps`. One step at a time, verify, move on.

---

## Phase 7A: Bug Fixes & Cleanup (Steps 1-8)

### Step 1: Strategy simulator calibration
Investigate HAM 1-stop unrealistic deltas. Check polynomial regression coefficients for edge cases. Fix outlier filtering in strategy_sim.py. Test on 5+ races.

### Step 2: Radio transcription fix
Investigate Groq API status. If still broken, implement Whisper local fallback. Ensure RadioMoments UI shows transcripts when available.

### Step 3: RadioMoments UI polish
Make speaker icon a clickable play button. Add progress bar below driver name. Handle audio load failures gracefully. Style with team colours.

### Step 4: Pre-generate laps.json
Script to batch-generate laps.json for all 2018-2025 races. Store in data/index/{year}/{track}/. Skip races that already have laps.json.

### Step 5: Loading states & error handling
Add skeleton loaders for all async sections on race page. Audit API error responses for consistency. Ensure empty states show helpful messages.

### Step 6: Circuit SVG audit
Verify all 2024-2025 tracks have circuit outlines in circuits.ts. Add any missing SVGs. Ensure they render on both home page cards and race pages.

### Step 7: Dead code cleanup
Remove rss_fetcher.py, reddit_fetcher.py if Discussion is fully killed. Remove unused imports across frontend. Clean up any orphaned components.

### Step 8: Visual test — verify all Phase 7A fixes
Start backend + frontend. Test 5 races across different years (2010, 2015, 2019, 2023, 2025). Verify simulator, radio, loading states, circuits all work.

---

## Phase 7B: Strategy Simulator + Driver Swap (Steps 9-16)

### Step 9: Extract teammate qualifying deltas
Backend function: calculate qualifying gap between teammates for each race. Store as part of race data or compute on-demand. Return via API.

### Step 10: Extract tyre degradation profiles per driver
Backend function: from laps.json, calculate each driver's degradation rate per compound. Compare to average — is this driver easier or harder on tyres?

### Step 11: Calculate car performance gap
Backend function: use qualifying gaps between teams to estimate car performance delta per circuit. e.g., "Red Bull is 0.4s/lap faster than Mercedes at Silverstone."

### Step 12: Driver Swap prediction engine
Backend: new function in strategy_sim.py that takes (driver, target_car, race) and predicts finish position. Combines quali delta + deg profile + car gap.

### Step 13: Driver Swap API endpoint
Add POST `/races/{year}/{track}/simulate-swap` or extend existing `/simulate` with optional `target_car` field. Return predicted position + explanation.

### Step 14: Driver Swap UI in StrategySimulator.tsx
Add "Swap Car" toggle below driver selector. When active, show car dropdown (all teams in that race). Update stint bars and prediction with swap context. Keep clean.

### Step 15: Disclaimer + edge cases
Add disclaimer text: "Estimate based on historical data patterns." Handle pre-2018 gracefully (quali deltas only). Handle same-team swap (no-op warning).

### Step 16: Visual test — verify Driver Swap
Test with 5+ driver/car combinations across different races. Verify predictions are reasonable. Check UI doesn't break on any race.

---

## Phase 7C: Frontend Beautification + Mobile (Steps 17-24)

### Step 17: Typography & spacing audit
Review all pages for consistent use of Racing Sans One headers. Fix spacing between sections. Ensure visual hierarchy is clear.

### Step 18: Card & component polish
Add hover states, borders, subtle shadows to interactive elements. Make race cards, Go Deeper sections, and sidebar feel alive.

### Step 19: Scroll animations
Add subtle fade-in-on-scroll for race page sections. Use Intersection Observer. Keep it fast — no heavy animation libraries.

### Step 20: Circuit SVGs on race pages
Add circuit outline to the race page header (not just home page cards). Subtle background element that gives each race visual identity.

### Step 21: Mobile — home page + navbar
Stack race cards to 1 column on mobile. Compact navbar (hamburger or simplified). Year scrollbar works with touch. IntroHero scales down.

### Step 22: Mobile — race page + simulator
Full-width sections. Simulator controls stack vertically. Compound buttons wrap. Stint bars scroll horizontally. 44px minimum tap targets.

### Step 23: Mobile — pattern finder + championship
Filter form stacks to single column. Results grid goes 1-column. Championship table horizontal scroll or card layout. Test at 375px.

### Step 24: Cross-device test
Test all pages at 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1024px (iPad landscape), 1440px (desktop). Fix any broken layouts.

---

## Phase 7D: Live 2026 Data (Steps 25-29)

### Step 25: Verify 2026 FastF1 support
Test if FastF1 can fetch 2026 schedule and race data. Check Jolpica/OpenF1 for 2026 support. Document any gaps.

### Step 26: Auto-indexing for current season
Extend background indexer to periodically check for new races in the current season. Or add a manual refresh endpoint.

### Step 27: Partial season UI
Handle 2026 showing only completed races. Race cards show "upcoming" badge for future rounds. Don't show "24 races" when only 5 exist.

### Step 28: 2026 circuit SVGs
Add circuit outlines for any new 2026 tracks. Update circuits.ts mapping.

### Step 29: "Latest Race" landing feature
Add a banner or highlighted card on the home page showing the most recent race result. Makes the site feel alive and current.

---

## Phase 7E: Browser Extension (Steps 30-42)

### Step 30: Extension scaffold
Create extension/ directory. Set up Manifest V3, popup.html, sidebar panel, content script. Basic React build pipeline.

### Step 31: Extension popup UI
Build the popup panel: current race status, driver list with positions, tyre indicators. Mock data initially.

### Step 32: WebSocket server
Add WebSocket endpoint to FastAPI. Broadcasts live timing updates to connected clients. Handle connection lifecycle.

### Step 33: OpenF1 real-time integration
Connect backend to OpenF1 live timing API. Parse lap times, pit events, weather updates. Feed into WebSocket broadcast.

### Step 34: Live prediction engine
Reuse strategy_sim.py model on streaming data. Every lap update: predict remaining strategy for each driver. Calculate pit windows.

### Step 35: Live "What If" ticker
Generate real-time "If X pits now → Pn" predictions for top 5 drivers. Update every lap. Show in extension sidebar.

### Step 36: Pattern alerts
Query pattern matcher with current race conditions (circuit, weather, position changes). Surface relevant historical precedents.

### Step 37: Tyre life indicator
Track stint age per driver from live data. Estimate remaining tyre life using degradation model. Show cliff warnings.

### Step 38: Extension sidebar overlay
Content script injects floating panel on any page. Minimizable, draggable, theme-matched. Shows live predictions.

### Step 39: /live dashboard page
Add raceday.com/live page showing same live data for non-extension users. Responsive, auto-updates via WebSocket.

### Step 40: Extension polish
Smooth animations, connection status indicator, error handling for dropped connections. Dark theme matching main site.

### Step 41: Chrome Web Store prep
Icons (128x128, 48x48, 16x16), screenshots, description, privacy policy. Package for Chrome Web Store submission.

### Step 42: Full integration test
Test extension during a live race weekend (or with recorded session). Verify predictions update, WebSocket stays connected, UI performs well.

---

## Phase 7 Complete → Phase 8: Deploy

Steps 43+: See to-be-done.md Priority 1 for deployment checklist.

---

*Total: 42 steps across 5 sub-phases*
*Created: 2026-03-21 | Project: Raceday*

---

## ✅ Step 1 — New /races page
*Completed: 2026-04-11*

**What was built**
- `frontend/app/races/page.tsx` — dedicated page for browsing a season with year picker, weather filter, latest race banner, and race card grid

**In plain English**
Created a separate /races page that shows the year picker, season header, weather filter, and grid of race cards. This is what used to render on the homepage after picking a year, now living on its own URL so the homepage can stay as a pure intro.

**Files changed**
+ created: frontend/app/races/page.tsx

---

## ✅ Step 2 — Homepage strip + navbar split
*Completed: 2026-04-11*

**What was built**
- `frontend/app/page.tsx` — now only renders IntroHero, year/race logic removed
- `frontend/app/components/Navbar.tsx` — Races link points to /races, year dropdown routes there too

**In plain English**
The homepage is now always the cinematic intro. The Races tab in the navbar takes you to the dedicated /races page. Clicking the Raceday logo always brings you home. The year dropdown in the top right also routes to /races.

**Files changed**
~ modified: frontend/app/page.tsx
~ modified: frontend/app/components/Navbar.tsx

---

## ✅ Step 3 — NewToF1Card component
*Completed: 2026-04-11*

**What was built**
- `frontend/app/components/NewToF1Card.tsx` — beginner primer glass card with F1 explainer, live "right now" context, 3 starter race links, and CTA button to /new-to-f1

**In plain English**
Built the beginner welcome card. Four parts: a two-sentence explainer of what F1 is, a live "Right now" line showing which round of the current season is next, three hand-picked legendary races for newcomers (Brazil 2008, Abu Dhabi 2021, Turkey 2020), and a red CTA button pointing at the full beginner guide page.

**Files changed**
+ created: frontend/app/components/NewToF1Card.tsx

---

## ✅ Step 4 — Wire NewToF1Card into IntroHero
*Completed: 2026-04-11*

**What was built**
- `frontend/app/components/IntroHero.tsx` — NewToF1Card rendered between ScrollCarAnimation and the feature sections

**In plain English**
The beginner primer card now actually shows up on the homepage. It lands right after the cinematic car scroll animation, before the feature showcase. Newcomers hit it early in the scroll, get the F1 explainer + current race context + starter recommendations, and can jump to the full guide via the CTA.

**Files changed**
~ modified: frontend/app/components/IntroHero.tsx

---

## ✅ Step 5 — FeatureSection CTA prop
*Completed: 2026-04-11*

**What was built**
- `frontend/app/components/FeatureSection.tsx` — accepts optional cta prop and renders a red-glow button below the description

**In plain English**
Taught the feature section component how to show a call-to-action button. It's optional — most feature sections won't use it, but any feature that passes a cta prop gets a red "Pick a Season" style button right below its description, with the same fade-in animation as the rest of the content. Sets up the next step where Race Stories gets the CTA attached.

**Files changed**
~ modified: frontend/app/components/FeatureSection.tsx
