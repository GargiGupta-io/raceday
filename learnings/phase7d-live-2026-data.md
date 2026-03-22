# Phase 7D — Live 2026 Data: Making the Site Feel Current

> How Raceday automatically detects, indexes, and displays new F1 races as they happen — turning a historical archive into a living platform.

---

## In Plain English

Imagine you built an amazing encyclopaedia of every F1 race from 2010 to 2025. It's impressive — 300+ races, all with stories, strategies, radio clips. But someone opens it in March 2026 and the latest content is from December 2025. It feels abandoned. Dead. The F1 season is happening right now and your site doesn't know about it.

Phase 7D fixes this by making Raceday aware of the present. When the backend starts up, it automatically checks: "What year is it? Are there new races I don't have yet?" The 2026 season has 22 races — 2 have already happened (Russell won Australia, Antonelli won China). The backend indexes both automatically. When the Japanese GP happens next week, it'll pick that up too — either within 6 hours (automatic re-check) or immediately if you hit the refresh button.

On the frontend, the site now understands the difference between a completed season and an ongoing one. The 2025 page says "24 Races" because they're all done. The 2026 page says "2 of 22 Races" because the season is in progress. Future races show an "UPCOMING" badge with the date instead of a winner. And a "Latest" banner highlights the most recent result so the site feels alive the moment you land on it.

---

## The Problem It Solves

Before Phase 7D, three things were hardcoded or static:

1. **Year range**: `SEASONS_TO_INDEX = list(range(2010, 2026))` — literally stopped at 2025. When 2026 arrived, the backend wouldn't even try to fetch data for it.

2. **No re-checking**: The indexer ran once on startup. If a race happened after the server started, it wouldn't appear until the next restart.

3. **No partial season awareness**: The frontend showed "22 Races" for 2026 even though only 2 existed. Upcoming races were greyed out with no context — no date, no badge, no explanation.

---

## How It Works

### Dynamic Year Range

Plain English: The backend now checks what year it is and automatically includes the current year.

**`backend/api.py:27`**

```python
from datetime import datetime

CURRENT_YEAR = datetime.now().year
SEASONS_TO_INDEX = list(range(2010, CURRENT_YEAR + 1))
```

In March 2026, this produces `[2010, 2011, ..., 2025, 2026]`. In January 2027, it'll automatically include 2027. No code change needed when a new year starts.

The `get_all_season_summaries()` function in insights.py already used `datetime.now().year` — so the year selector on the home page was already dynamic. The gap was only in the indexer.

### Periodic Re-Check

Plain English: After the initial index finishes, the backend sleeps for 6 hours then re-checks the current season for new races. This repeats forever.

**`backend/api.py:79-90`**

```python
def _periodic_current_season_check():
    """Re-index the current season every 6 hours to pick up new races."""
    while True:
        time.sleep(6 * 3600)  # 6 hours
        logger.info("Periodic re-check: indexing %d season...", CURRENT_YEAR)
        try:
            result = indexer.index_season(CURRENT_YEAR)
            if result["indexed"] > 0:
                logger.info("Found %d new races!", result["indexed"])
        except Exception as exc:
            logger.error("Periodic check failed: %s", exc)
```

This function runs in the same daemon thread as the initial indexer — after `_background_index_all()` finishes, it calls `_periodic_current_season_check()` which loops forever. Since it's a daemon thread, it dies when the server shuts down.

Why 6 hours? Races happen on Sundays, usually finishing around 15:00-18:00 UTC. A 6-hour cycle means the latest a new race appears is ~6 hours after it ends. For immediate results, there's the manual refresh endpoint.

### Manual Refresh Endpoint

Plain English: Hit a button and the server immediately re-indexes a specific season.

**`backend/api.py`**

```python
@app.post("/refresh/{year}")
def refresh_season(year: int):
    result = indexer.index_season(year)
    return {
        "year": year,
        "indexed": result["indexed"],
        "skipped": result["skipped"],
        "failed": result["failed"],
    }
```

Usage: `POST /refresh/2026` — returns how many races were newly indexed, skipped (already existed), or failed. Useful right after a race weekend when you want instant results.

### Partial Season UI

Plain English: The home page now understands that a season can be "in progress" and adjusts what it shows.

Three changes to `frontend/app/page.tsx`:

**1. Smart race count:**

```jsx
{year} Season — {(() => {
  const indexed = races.filter((r) => r.indexed).length;
  return indexed < races.length
    ? `${indexed} of ${races.length} Races`
    : `${races.length} Races`;
})()}
```

For 2026: "2 of 22 Races". For 2025: "24 Races". The logic: if the number of indexed races is less than the total schedule, show "X of Y". Otherwise just show "Y".

**2. UPCOMING badge + date:**

```jsx
const isUpcoming = race.date && new Date(race.date) > new Date();

// In the card bottom row:
{isUpcoming && (
  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
    UPCOMING
  </span>
)}

// Date instead of winner for upcoming races:
{!race.winner && isUpcoming && race.date && (
  <span className="text-xs text-zinc-500">
    {new Date(race.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
  </span>
)}
```

Future races show "29 Mar" with an "UPCOMING" badge instead of "P1 VER".

**3. Latest Race banner:**

```jsx
{(() => {
  const indexedRaces = races.filter((r) => r.indexed && r.winner);
  if (indexedRaces.length === 0 || indexedRaces.length === races.length) return null;
  const latest = indexedRaces[indexedRaces.length - 1];
  return (
    <Link href={`/races/${year}/${encodeURIComponent(latest.name)}`}>
      <div className="rounded-lg bg-gradient-to-r from-zinc-900 to-zinc-900/50 border ...">
        <p>Latest — {latest.name.replace(" Grand Prix", "")}</p>
        <p>P1 {latest.winner}</p>
      </div>
    </Link>
  );
})()}
```

Only shows for partial seasons (not complete ones). Displays the most recent race result as a prominent clickable card above the grid. Uses `indexedRaces.length === races.length` to detect complete seasons.

### 2026 Calendar Facts

The 2026 F1 season has some interesting changes detected during Step 25:

| Detail | Value |
|--------|-------|
| Total races | 22 |
| Completed (as of 2026-03-22) | 2 (Australia, China) |
| Next race | Japanese GP (2026-03-29) |
| New track | Madrid (IFEMA street circuit) |
| Renamed race | "Barcelona Grand Prix" (was "Spanish Grand Prix") |
| "Spanish Grand Prix" | Now at Madrid (new circuit) |

The Barcelona/Madrid naming change required adding "Barcelona Grand Prix" to the circuit map. The "Spanish Grand Prix" still maps to the Barcelona SVG (correct for 15 years of history). A Madrid SVG was created but isn't linked yet — would need year-aware circuit mapping.

---

## Edge Cases & Gotchas

1. **Same GP name, different circuit across years**
   In plain English: "Spanish Grand Prix" was at Barcelona from 2010-2025, but moves to Madrid in 2026. The circuit SVG map is name-based, so it can't show different outlines for different years.
   Technical cause: `CIRCUIT_MAP` is a flat `Record<string, string>` — no year dimension.
   How to avoid: Accept that pre-2026 Spanish GPs show Barcelona (correct for 15/16 years). Future improvement: make circuit mapping year-aware.

2. **FastF1 warnings for missing driver data**
   In plain English: Some 2026 drivers (like Doohan, #81) had "no lap data" warnings during indexing.
   Technical cause: The driver may have retired or been lapped badly, so FastF1 has incomplete timing data.
   How to avoid: Already handled — the indexer logs a warning but continues. The driver appears in results with whatever data is available.

3. **6-hour periodic check runs forever**
   In plain English: The re-check loop never stops — it runs even during the off-season when there are no new races.
   Technical cause: `while True: time.sleep(6 * 3600)` with no termination condition.
   How to avoid: Acceptable — `index_season()` is fast when all races are already indexed (just checks disk). Could add a check for "is it racing season?" but not worth the complexity.

---

## Quick Reference

### Key Endpoints

```
GET  /seasons/summary     → All seasons with champions (auto-includes current year)
GET  /races/{year}         → Race list with indexed status + upcoming dates
POST /refresh/{year}       → Manually re-index a season (use after race weekends)
GET  /indexing/status      → Background indexer progress
```

### Key Files

```
backend/api.py                    → Dynamic SEASONS_TO_INDEX, periodic re-check, /refresh
backend/core/insights.py          → get_season_races() returns date + indexed per race
frontend/app/page.tsx             → Partial season count, UPCOMING badge, Latest banner
frontend/app/lib/circuits.ts      → Barcelona Grand Prix mapping added
frontend/public/circuits/madrid.svg → New circuit SVG (not yet linked in map)
```

### Timeline of a New Race

```
Sunday 16:00  Race finishes
Sunday 16:05  FastF1 data becomes available
              (F1 publishes timing data almost immediately)

Option A — Automatic:
Sunday ~22:00 Periodic re-check runs → indexes new race
              (within 6 hours of race end)

Option B — Manual:
Sunday 16:10  POST /refresh/2026 → indexes immediately
              Frontend shows new race on next page load
```

---

*Generated: 2026-03-22 | Project: Raceday | Phase 7D complete (5 steps)*
