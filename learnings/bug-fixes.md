# Raceday — Bug Fixes Log

> Tracking all bugs found and fixed across the site. Updated as issues are resolved.

---

## Bug Audit (2026-03-21)

Full audit of frontend (25 issues) and backend (4 issues) across all components.

---

## CRITICAL

### BUG-1: Hardcoded `localhost:8888` in 13 files
**Status:** Open
**Severity:** CRITICAL
**Files:** All components with API calls (page.tsx, StrategySimulator, RadioMoments, KeyMoments, RaceStory, StrategyKey, StrategyStory, SeasonStory, SeasonInsights, PatternPrecedents, FactsSidebar, race page)
**Problem:** Every frontend file has `const API = "http://localhost:8888"`. Site will be completely broken when deployed.
**Fix:** Extract to `NEXT_PUBLIC_API_URL` env var in `.env.local`, import everywhere.

---

### BUG-2: XSS vulnerability in KeyMoments
**Status:** Open
**Severity:** CRITICAL
**File:** `frontend/app/components/KeyMoments.tsx:97,101`
**Problem:** Uses `dangerouslySetInnerHTML` with `highlightDrivers()` which doesn't sanitize input. If backend is compromised, malicious HTML/JS could be injected.
**Fix:** Sanitize HTML before rendering, or rewrite `highlightDrivers` to return React elements instead of raw HTML strings.

---

### BUG-3: Year sync broken between navbar and home page
**Status:** Open
**Severity:** CRITICAL
**File:** `frontend/app/components/Navbar.tsx:14-15`, `frontend/app/page.tsx`
**Problem:** Navbar extracts year from URL pathname via regex (`/(\d{4})/`), but home page uses `?year=` query param. When on `/?year=2023`, navbar doesn't detect the year and defaults to 2025. Screenshot shows scrollbar on 2023, dropdown on 2025.
**Fix:** Navbar should also read `searchParams` when on the home page, or home page should sync the URL pathname.

---

## HIGH

### BUG-4: No `r.ok` check before JSON parse
**Status:** Open
**Severity:** HIGH
**File:** `frontend/app/races/[year]/[track]/page.tsx:77-80`
**Problem:** `Promise.all` fetches call `.json()` without checking `r.ok`. If API returns 500, the JSON parse fails with a cryptic error instead of showing a clean error message.
**Fix:** Add `r.ok` check: `.then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })`

---

### BUG-5: Invalid compounds accepted by simulator backend
**Status:** Open
**Severity:** HIGH
**File:** `backend/core/strategy_sim.py`
**Problem:** Passing invalid compound names like "ULTRASOFT" or "SUPERHARD" doesn't error — returns meaningless predictions (-41s delta). Backend should validate against known compounds.
**Fix:** Add compound validation in `simulate_strategy()` — reject unknown compounds with 400 error.

---

### BUG-6: SUPERSOFT missing from simulator UI
**Status:** Open
**Severity:** HIGH
**File:** `frontend/app/components/StrategySimulator.tsx:347`
**Problem:** Compound buttons only show `["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]`. SUPERSOFT was used in 2010-2017 races and is in the actual data, but users can't select it in the simulator.
**Fix:** Add SUPERSOFT to the compound list, or dynamically show compounds based on `compounds_available` from the API.

---

### BUG-7: Pit lap ordering not validated
**Status:** Open
**Severity:** HIGH
**File:** `frontend/app/components/StrategySimulator.tsx:310-323`
**Problem:** User can drag pit lap sliders into backwards order (e.g., `[50, 40]`). The range input constraints use `pitLaps[i-1] + 2` as min and `pitLaps[i+1] - 2` as max, but when changing stop count, the default positions may violate these constraints. Backend receives invalid pit lap order and returns garbage results.
**Fix:** Sort pit laps before sending to backend, or cascade-constrain sliders when one moves.

---

## MEDIUM

### BUG-8: Seasons summary fetch silently fails
**Status:** Open
**Severity:** MEDIUM
**File:** `frontend/app/page.tsx:70-74`
**Problem:** `.catch(() => {})` silently swallows errors. If backend is down, user sees no year pills and no error — just an empty page with the intro hero.
**Fix:** Add error state for seasons fetch, show "Could not load seasons" message.

---

### BUG-9: Simulate button silently does nothing
**Status:** Open
**Severity:** MEDIUM
**File:** `frontend/app/components/StrategySimulator.tsx:185-186`
**Problem:** If `compounds.length !== numStops + 1` (state out of sync), clicking Simulate does nothing with no feedback. User has no idea why it's not working.
**Fix:** Show error toast or disable button with explanation.

---

### BUG-10: Audio play errors swallowed
**Status:** Open
**Severity:** MEDIUM
**File:** `frontend/app/components/RadioMoments.tsx:48`
**Problem:** `audio.play().catch(() => {})` silently fails. Button shows "playing" state but no audio plays. Common cause: CORS block on F1 CDN or browser autoplay policy.
**Fix:** Catch error and reset playing state, show inline error message.

---

### BUG-11: Team colour not validated
**Status:** Open
**Severity:** MEDIUM
**File:** `frontend/app/components/RadioMoments.tsx:171`
**Problem:** `style={{ backgroundColor: '#${clip.team_colour}' }}` — if API returns null or malformed hex, the CSS is invalid (`#null` or `#FF00`).
**Fix:** Add fallback: `clip.team_colour || '666666'`

---

### BUG-12: Dead tagline field in RaceStory
**Status:** Open
**Severity:** MEDIUM
**File:** `frontend/app/components/RaceStory.tsx:8`
**Problem:** `tagline` is in the TypeScript interface but never rendered (tagline moved to race page header). Dead code.
**Fix:** Remove `tagline` from the `StoryData` interface.

---

### BUG-13: Unused articles + reddit data in FactsSidebar
**Status:** Open
**Severity:** MEDIUM
**File:** `frontend/app/components/FactsSidebar.tsx`
**Problem:** Component interface includes `articles` and `reddit` fields but never renders them. Backend sends this data for nothing — wasted bandwidth.
**Fix:** Either remove from interface + API response, or render them.

---

### BUG-14: GoDeeper interface typo
**Status:** Open
**Severity:** MEDIUM
**File:** `frontend/app/components/GoDeeper.tsx:5`
**Problem:** Interface named `GoDeperItemProps` — missing an 'e'. Doesn't break anything but looks unprofessional.
**Fix:** Rename to `GoDeeperItemProps`.

---

## LOW

### BUG-15: Intro hero animation timing inconsistent
**Status:** Open
**Severity:** LOW
**File:** `frontend/app/components/IntroHero.tsx`
**Problem:** Speed lines (3000ms), car (2500ms), cards (800+i*200ms), CTA (2000ms) — the CTA button can appear before the car finishes. Total animation is ~4s with no skip option.
**Fix:** Align animation timing so CTA appears after all cards. Add "Skip" option.

---

### BUG-16: No cleanup on component unmount
**Status:** Open
**Severity:** LOW
**Files:** `StrategySimulator.tsx`, `RadioMoments.tsx`
**Problem:** Fetch callbacks update state after component unmounts (e.g., rapid navigation). Causes React "state update on unmounted component" warning.
**Fix:** Add cleanup with AbortController or mounted ref.

---

### BUG-17: Tagline appears with jank
**Status:** Open
**Severity:** LOW
**File:** `frontend/app/races/[year]/[track]/page.tsx:120-126`
**Problem:** Tagline fetches independently and appears abruptly after page renders — slight layout shift.
**Fix:** Add min-height placeholder or fade-in transition.

---

### BUG-18: Empty FactsSidebar returns null silently
**Status:** Open
**Severity:** LOW
**File:** `frontend/app/components/FactsSidebar.tsx`
**Problem:** If `did_you_know` array is empty, component returns null — no Race Intelligence header shown at all. User can't tell if it failed or has no data.
**Fix:** Show "No race intelligence available" placeholder.

---

## BACKEND BUGS

### BUG-B1: Invalid compounds not rejected
**Status:** Open
**Severity:** HIGH
**File:** `backend/core/strategy_sim.py`
**Problem:** Same as BUG-5. "ULTRASOFT" returns -41.3s delta instead of an error.
**Fix:** Validate against `COMPOUND_DELTA.keys()` before simulation.

---

### BUG-B2: Retired driver simulation gives misleading results
**Status:** Open
**Severity:** MEDIUM
**File:** `backend/core/strategy_sim.py`
**Problem:** Simulating a retired driver (e.g., MAG who DNF'd) uses their partial laps but compares against a full-race strategy. The delta (+24.2s) is meaningless — they didn't finish.
**Fix:** Flag retired drivers in the response, show "Driver retired — simulation based on partial data" warning.

---

### BUG-B3: `get_all_season_summaries` year range will need updating every year
**Status:** Open
**Severity:** LOW
**File:** `backend/core/insights.py:1240`
**Problem:** Hardcoded `range(2025, 2009, -1)`. Will need manual update when 2026 starts.
**Fix:** Use `range(datetime.now().year, 2009, -1)` or scan indexed years dynamically.

---

### BUG-B4: `get_lap_times` imports pandas inside loop
**Status:** Open
**Severity:** LOW
**File:** `backend/core/loader.py`
**Problem:** `import pandas as pd` is called inside the for loop for every lap. Should be at the top of the function.
**Fix:** Move import to function top or module level.

---

*Created: 2026-03-21 | Updated as bugs are fixed*
