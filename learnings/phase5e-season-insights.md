# Phase 5E — Season Insights (Built)

> Auto-generating end-of-season awards and teammate head-to-head records from indexed race data — no manual input needed.

---

## In Plain English

Before Phase 5E, the Standings tab showed race results and the season story (momentum, turning points, constructor battle). But it didn't answer questions like "who was the best qualifier this year?" or "how did Norris compare to Piastri?" You'd have to mentally track those stats across 22 races yourself.

Now the Standings tab has two more sections at the bottom. "Season Awards" automatically picks out the most interesting stats — who gained the most positions across the season (Best Starter), who was on the podium the most (Most Consistent), who retired the most (Worst Luck), who scored points most often (Points Machine), and who qualified highest on average (Best Qualifier). These are like the end-of-season awards you'd see on a sports broadcast, except they're computed from the data rather than voted on.

Below the awards, "Teammate Head-to-Head" shows every team's internal battle as a split bar. Green on the left for the driver who finished ahead more often, red on the right for the other. You can instantly see that Verstappen beat Perez 17-2 in 2023, or that Hulkenberg and Perez were tied 7-7 at Force India in 2014. These numbers cut through narratives — they're the objective record of who beat who when they had the same car.

---

## What Was Built

### Backend: `get_season_insights(year)`

Plain English: Scans every indexed race in a season and computes driver statistics and teammate battles. Needs at least 3 indexed races to produce meaningful results.

#### Per-Driver Statistics

The function first builds a stats object for every driver who raced that year:

```python
driver_stats[drv] = {
    "team": r["team"],
    "finishes": [],      # list of finishing positions (None for DNF)
    "grids": [],         # list of grid positions
    "gains": [],         # list of position deltas (grid - finish)
    "top3": 0,           # podium count
    "top10": 0,          # points finish count
    "wins": 0,           # win count
    "dnfs": 0,           # retirement count
    "races": 0,          # total starts
}
```

Each race updates these counters. A retirement (status not "Finished" and not "+X Laps") increments `dnfs` and adds `None` to finishes. A normal finish updates everything else.

The `gains` list stores `grid - finish` for each race where the driver finished — positive means gained positions, negative means lost. This is used for the Best Starter award.

#### Five Awards

Each award scans `driver_stats` looking for the extreme value:

**1. Best Starter** — Most total positions gained across the season

```python
for drv, s in driver_stats.items():
    if s["races"] >= 3 and s["gains"]:
        total_gain = sum(g for g in s["gains"] if g > 0)
```

Only counts positive gains (races where they moved forward). Ignores races where they lost positions — this isn't "best average," it's "who climbed the most in total." Requires 3+ races to filter out one-race substitutes.

**Example:** Perez gained +101 positions in 2023 — largely from starting far back (grid penalties, poor qualifying) and recovering through the field.

**2. Most Consistent** — Most podium finishes (top 3)

```python
most_consistent = max(driver_stats.items(), key=lambda x: x[1]["top3"])
```

Simple — who appeared on the podium most often. Verstappen had 21 out of 22 in 2023. Requires at least 2 podiums to show.

**3. Worst Luck** — Most DNFs

```python
worst_luck = max(driver_stats.items(), key=lambda x: x[1]["dnfs"])
```

Requires 2+ DNFs to show. In 2023, Magnussen had 15 DNFs out of 22 races — though some of those may be classified retirements (damage, not mechanical failure). The data doesn't distinguish between types of retirement.

**4. Points Machine** — Most top-10 finishes

Only shown if the driver is different from Most Consistent (to avoid redundancy). Measures reliability rather than peak performance — finishing P8 every race gives you a high score here but low on Most Consistent.

**5. Best Qualifier** — Lowest average grid position

```python
for drv, s in driver_stats.items():
    if len(s["grids"]) >= 3:
        avg_grid = sum(s["grids"]) / len(s["grids"])
```

Lower is better (P1.7 average beats P3.2). Also counts pole positions (grid == 1) for the detail text.

#### Teammate Head-to-Head

Groups drivers by team, then for each team with exactly 2 drivers:

```python
for race_name, results in all_results:
    pos1 = None
    pos2 = None
    for r in results:
        if r["driver"] == d1:
            status1 = r["status"]
            if status1 in ("Finished",) or status1.startswith("+"):
                pos1 = r.get("finish_position")
        elif r["driver"] == d2:
            # same check

    if pos1 is not None and pos2 is not None:
        if pos1 < pos2:
            d1_ahead += 1
        elif pos2 < pos1:
            d2_ahead += 1
```

Only counts races where **both** drivers finished. If one retired and the other finished, it doesn't count — the comparison isn't fair since one didn't complete the race. Ties (same position) are also excluded, though they're extremely rare in F1.

The winning driver (higher score) is always placed first in the output so the frontend can render green on the left, red on the right.

**Example output (2023):**
```
Red Bull Racing: Verstappen 17-2 Perez
Mercedes: Hamilton 11-5 Russell
McLaren: Norris 10-3 Piastri
Williams: Albon 8-0 Sargeant
```

Albon's 8-0 over Sargeant is one of the most one-sided teammate battles in recent F1 history.

---

### API Endpoint

```
GET /seasons/{year}/insights
    {
      "awards": [
        {"title": "Best Starter", "driver": "PER", "full_name": "Sergio Perez",
         "team": "Red Bull Racing", "stat": "+101 positions gained",
         "detail": "Gained positions in 15 races, avg +5.3 per race"},
        ...
      ],
      "h2h": [
        {"team": "Red Bull Racing", "driver1": "VER", "name1": "Max Verstappen",
         "score1": 17, "driver2": "PER", "name2": "Sergio Perez", "score2": 2},
        ...
      ],
      "races_counted": 22
    }
```

Note: this endpoint is season-level (`/seasons/{year}/insights`), not race-level. The same data applies to every race in that year.

---

### Frontend: `SeasonInsights.tsx`

Plain English: Fetches season awards and teammate battles and renders them as two card sections.

**Awards section** — 2-column grid of award cards:

Each card has:
- Icon matching the award type (up arrow for Best Starter, star for Most Consistent, lightning for Worst Luck, target for Points Machine, stopwatch for Best Qualifier)
- Award title in small uppercase
- Driver name with team colour dot
- Main stat in slightly larger text
- Detail line in muted grey

```typescript
const AWARD_ICON: Record<string, string> = {
  "Best Starter": "\u2B06",       // ⬆
  "Most Consistent": "\u2B50",    // ⭐
  "Worst Luck": "\u26A1",         // ⚡
  "Points Machine": "\uD83C\uDFAF", // 🎯
  "Best Qualifier": "\u23F1",     // ⏱
};
```

**Teammate H2H section** — split bars per team:

Each team gets a row:
- Team colour dot and name
- Driver 1 name (winner) on the left, score in bold
- Split bar: green portion for driver 1's wins, red for driver 2's
- Driver 2 name and score on the right

```typescript
const pct1 = total > 0 ? Math.round((h.score1 / total) * 100) : 50;
// Green bar width = pct1%, Red bar width = (100 - pct1)%
```

For Verstappen vs Perez (17-2), the green bar takes up ~89% of the width. For Hulkenberg vs Perez at Force India (7-7), it's exactly 50/50.

---

### How the Pieces Connect

```
User clicks Standings tab
     │
     ├── StandingsTable (race finishing order)
     ├── SeasonStory (momentum, turning points, constructors)
     └── SeasonInsights loads independently
           ├── Fetches GET /seasons/{year}/insights
           │     └── insights.get_season_insights(year)
           │           ├── Iterates all indexed races chronologically
           │           ├── Builds per-driver stats (gains, podiums, DNFs, grids)
           │           ├── Picks award winners (5 categories)
           │           └── Counts teammate finishing order battles
           │
           └── Renders two sections
                 ├── Awards (2-col grid, icon + stat + detail)
                 └── H2H (split green/red bars per team)
```

---

## Edge Cases & Gotchas

**1. Minimum 3 races required**

With fewer than 3 indexed races, the function returns None. Awards like "Most Consistent" are meaningless with 1-2 data points. The frontend handles this by rendering nothing.

**2. Teams with more than 2 drivers**

Some teams used 3+ drivers in a season (reserve drivers, mid-season replacements). The H2H section only shows teams with exactly 2 drivers who raced 3+ times each. This filters out one-off substitutes cleanly.

**3. DNF counting is coarse**

The `dnfs` counter includes all non-finished statuses — mechanical failures, crashes, disqualifications, damage retirements. The data doesn't distinguish between bad luck (engine failure) and driver error (crash). "Worst Luck" could more accurately be called "Most Retirements."

**4. Points Machine vs Most Consistent redundancy**

If the same driver leads both top-3 and top-10 counts (common for dominant champions), the Points Machine award is skipped to avoid showing the same driver twice. This is checked explicitly:

```python
if drv != (most_consistent[0] if most_consistent else None):
    awards.append({...})
```

**5. Qualifying data is approximated**

Grid position isn't the same as qualifying position (grid penalties move drivers back). "Best Qualifier" is really "Best Grid Position" — a driver with consistent penalties would appear worse than they actually qualified.

---

## Files Created and Modified

| File | Status | What it does |
|------|--------|-------------|
| `backend/core/insights.py` | **Modified** | Added `get_season_insights()` — 5 awards + teammate H2H |
| `backend/api.py` | **Modified** | Added `GET /seasons/{year}/insights` endpoint |
| `frontend/app/components/SeasonInsights.tsx` | **Created** | Award cards in 2-col grid + teammate H2H split bars |
| `frontend/app/races/[year]/[track]/page.tsx` | **Modified** | Imported SeasonInsights, rendered below SeasonStory in Standings tab |

---

## Quick Reference

### Season Insights API
```
GET /seasons/{year}/insights
    {"awards": [...], "h2h": [...], "races_counted": 22}
```

### Award Types
| Award | What it measures | Threshold |
|-------|-----------------|-----------|
| Best Starter | Total positions gained (positive only) | 3+ races |
| Most Consistent | Podium count (top 3 finishes) | 2+ podiums |
| Worst Luck | Retirement count | 2+ DNFs |
| Points Machine | Points finishes (top 10) | Different driver from Most Consistent |
| Best Qualifier | Lowest average grid position | 3+ qualifying sessions |

### Key Terms
| Term | Plain English | Technical |
|------|---------------|-----------|
| Teammate H2H | How often each driver beat their teammate | Count of races where both finished, lower position wins |
| Position gain | How many places a driver moved forward | Grid position minus finish position (positive = gained) |
| Points finish | Finishing in the top 10 | F1 awards points to P1-P10 only |
| DNF | Did Not Finish — retired from the race | Status not "Finished" and not "+X Laps" |

---

*Generated: 2026-03-17 | Project: Raceday | Phase 5E complete | Files: insights.py, api.py, SeasonInsights.tsx, page.tsx*
