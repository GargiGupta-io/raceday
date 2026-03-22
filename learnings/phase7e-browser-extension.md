# Phase 7E — Browser Extension: Live F1 Strategy Companion

> A Chrome extension that overlays real-time pit predictions, tyre life tracking, and historical pattern alerts on any F1 broadcast — the feature that makes Raceday unique.

---

## In Plain English

Imagine you're watching an F1 race on TV. The commentator says "Hamilton might pit soon" but you have no idea when or what tyre he'd switch to. You're guessing. Everyone's guessing.

Raceday's browser extension changes that. It sits as a small floating panel in the corner of your screen while you watch. Every 10 seconds, it checks: what tyre is each driver on? How old is that tyre? Based on degradation patterns, when will they need to stop? And the killer question — "What if Norris pits RIGHT NOW? He'd drop to P4 and recover to P2. But if he stays out, his tyres will fall off a cliff and he'll drop to P3 anyway."

It's like having a strategy engineer sitting next to you on the couch, except this one has data from 300+ historical races and a machine learning model trained on real lap times.

The extension works in two forms: a Chrome extension popup (click the icon in your browser toolbar) and a floating overlay injected directly onto formula1.com pages. For people who don't want to install an extension, there's also a /live page on the main Raceday site with the same data.

---

## How It Works

### Architecture

```
                    ┌─────────────────────────────┐
                    │   OpenF1 Real-Time API       │
                    │   (positions, stints, laps)   │
                    └─────────────┬───────────────┘
                                  │ polling every 10s
                                  ▼
              ┌───────────────────────────────────────┐
              │  Raceday Backend (FastAPI)             │
              │                                       │
              │  live_feed.py                          │
              │  ├── _find_active_session()            │
              │  ├── _build_live_state()               │
              │  │   ├── _fetch_positions()            │
              │  │   ├── _fetch_stints()               │
              │  │   ├── _fetch_drivers()              │
              │  │   └── _fetch_lap_count()            │
              │  ├── _generate_pit_predictions()       │
              │  ├── _generate_what_if()               │
              │  └── _generate_pattern_alerts()        │
              │                                       │
              │  Endpoints:                            │
              │  ├── GET /live (REST polling)           │
              │  └── WS  /ws/live (WebSocket)          │
              └────────┬──────────────┬───────────────┘
                       │              │
            REST poll  │              │  REST poll
            every 10s  │              │  every 10s
                       ▼              ▼
         ┌──────────────┐    ┌──────────────────┐
         │  Extension    │    │  /live Page       │
         │  background.js│    │  (Next.js)        │
         │       │       │    │                   │
         │       ▼       │    │  Auto-refresh     │
         │  popup.tsx    │    │  driver standings  │
         │  content.js   │    │  pit predictions   │
         └──────────────┘    └──────────────────┘
```

### The Data Flow (Step by Step)

1. **Session detection**: The backend checks OpenF1 for any Race session that started within the last 3 hours. No race happening? The feed sleeps, checking every 60 seconds.

2. **Data collection**: When a session is active, the feed polls OpenF1 every 10 seconds for:
   - Driver positions (who's P1, P2, etc.)
   - Stint data (what compound, when did the stint start)
   - Driver info (names, teams, team colours)
   - Lap count (current lap / total laps)

3. **Prediction generation**: On each update, three engines run:
   - **Pit predictions**: When will each driver likely pit, based on compound stint limits
   - **What-if scenarios**: For top 5 drivers — what happens if they pit NOW vs stay out
   - **Pattern alerts**: Historical stats for this circuit (pole sitter win rate, retirement frequency, tyre cliff warnings)

4. **Distribution**: The complete state is available via:
   - `GET /live` — REST endpoint, returns JSON (used by extension + /live page)
   - `WS /ws/live` — WebSocket for real-time push (available but extension uses REST)

---

## What We Built

### Backend: live_feed.py (450+ lines)

**Session Detection**

The feed finds active sessions by checking if any Race session started within 3 hours:

```python
def _find_active_session():
    sessions = _openf1_get("sessions", {"year": 2026, "session_name": "Race"})
    for session in reversed(sessions):
        start = datetime.fromisoformat(session["date_start"])
        elapsed = (now - start).total_seconds()
        if 0 < elapsed < 3 * 3600:
            return session
    return None
```

**Pit Prediction Engine**

Each compound has an expected maximum stint length before the "cliff" (sudden performance drop):

```python
COMPOUND_MAX_STINT = {
    "SOFT": 18, "MEDIUM": 28, "HARD": 40,
    "INTERMEDIATE": 25, "WET": 30,
}
```

The engine calculates `laps_to_cliff = max_stint - stint_age`, then creates a pit window: `earliest = current_lap + laps_to_cliff - 3`, `latest = current_lap + laps_to_cliff + 3`. Confidence is "high" when within 3 laps of the cliff.

**What-If Engine**

The most interesting prediction. For each of the top 5 drivers, it estimates:
- **If they pit NOW**: How many positions lost (22s pit stop / variable gap per position), how many recovered on fresh tyres (0.2s/lap effective advantage × remaining laps)
- **If they stay out**: How many positions lost from tyre cliff (0.4s/lap penalty once past optimal stint length)

Gap between positions isn't flat — it scales: ~2.5s at the front, ~4s in midfield, ~6s further back. This reflects F1 reality where the top cars are close together but backmarkers are spread out.

**Pattern Alerts**

Queries indexed race history for the current circuit. Uses a location-to-GP-name mapping (Silverstone → "british", Suzuka → "japanese") to find historical races. Generates:
- Pole sitter win rate ("At Suzuka, pole won 5 of last 6 races")
- High retirement warning ("Melbourne had 4+ DNFs in 3 of last 6 races")
- Tyre cliff warning for the current leader

### Extension: Chrome Manifest V3

Three parts:

**1. popup.tsx (React, 300+ lines)**
- Shows backend connection status (green/red dot)
- During a live session: session bar, driver standings with tyre indicators, pit predictions with confidence badges, what-if comparisons, pattern alerts
- When idle: latest race result, "predictions appear during race weekends"
- Demo mode: click hidden "Demo" button to see mock live data

**2. content.js (injected on F1 sites)**
- Floating panel in bottom-right corner
- Collapsed: small bar showing "RD" + session name + lap counter
- Expanded: compact version of popup (top 5 drivers, predictions, what-if, alerts)
- Draggable: click and drag the header to reposition
- Auto-updates from background polling

**3. background.js (service worker)**
- Polls `GET /live` every 10 seconds
- Broadcasts updates to popup and content scripts via `chrome.runtime.sendMessage`
- Auto-starts on install/startup
- Tracks connection status (connected/disconnected)

Uses REST polling instead of WebSocket because Manifest V3 service workers have limited lifecycle — they can be terminated by Chrome at any time, which would break a persistent WebSocket connection.

### Frontend: /live Page

Full-page dashboard for non-extension users. Same data as the extension, same 10-second polling. Layout:
- Session bar with lap counter (red border when active)
- Driver standings table (2 columns on desktop) with tyre indicators and pit windows
- Sidebar with predictions, what-if, and alerts
- When idle: chequered flag icon with explanation

Accessible via "Live" link in the navbar (red accent colour to distinguish from other nav items).

---

## Edge Cases & Gotchas

1. **No active session most of the time**
   In plain English: F1 races happen ~24 Sundays per year. The other 341 days, there's nothing to show.
   How it's handled: The feed checks every 60 seconds when idle, 10 seconds during a session. The UI shows a clean "No live session" state with explanation.

2. **Service worker termination in Manifest V3**
   In plain English: Chrome can kill the extension's background script at any time to save resources.
   How it's handled: Using REST polling instead of WebSocket. Each poll is independent — no persistent connection to break. The service worker auto-restarts on `onStartup` and `onInstalled`.

3. **OpenF1 data lag**
   In plain English: OpenF1's data can be 5-30 seconds behind the live broadcast.
   How it's handled: Predictions are based on trends (stint age, compound life) not split-second timing, so a few seconds of lag doesn't affect accuracy.

4. **Gap estimation is approximate**
   In plain English: The what-if engine uses ~2.5-6s per position as a rough estimate. Real gaps vary wildly.
   How it's handled: Acceptable for "would you pit or not?" decisions. The exact position might be off by 1-2, but the direction (better/worse) is reliable.

---

## Quick Reference

### Extension Files

```
extension/
├── public/
│   ├── manifest.json      — Manifest V3 config
│   ├── background.js      — Service worker (REST polling)
│   ├── content.js         — Floating overlay for F1 sites
│   └── content.css        — Overlay styling
├── src/
│   └── popup.tsx          — React popup UI
├── popup.html             — Popup HTML shell
├── package.json           — Vite + React deps
├── vite.config.ts         — Build config
├── tsconfig.json          — TypeScript config
└── generate-icons.html    — Open in browser to create icon PNGs
```

### Backend Endpoints

```
GET  /live          — Current live state (REST, poll every 10s)
WS   /ws/live       — WebSocket for real-time push
GET  /health        — Backend status check
```

### Key Backend Functions

```python
# backend/core/live_feed.py
_find_active_session()     → dict | None
_build_live_state(session) → dict | None
_generate_pit_predictions(drivers, lap, total) → predictions, windows
_generate_what_if(drivers, lap, total)         → what_if_list
_generate_pattern_alerts(session, lap, total, drivers) → alerts
start_feed()               → launches background polling thread
```

### How to Test Locally

```bash
# 1. Start backend
cd backend && python -m uvicorn backend.api:app --port 8888

# 2. Build extension
cd extension && npm install && npm run build

# 3. Load in Chrome
# Go to chrome://extensions → Enable developer mode
# Click "Load unpacked" → select extension/dist/

# 4. Or use the /live page
# Start frontend: cd frontend && npm run dev
# Open http://localhost:3000/live
```

---

*Generated: 2026-03-23 | Project: Raceday | Phase 7E complete (13 steps)*
