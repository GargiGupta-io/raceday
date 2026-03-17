# Phase 5D — Season Story (Built)

> Turning the Standings tab from a static race finishing order into a season narrative — showing who's on form, what shifted the championship, and how teams compare.

---

## In Plain English

Before Phase 5D, clicking the Standings tab on any race showed you one thing: the finishing order for that specific race. Position, driver, grid, delta. Useful, but it told you nothing about the bigger picture. Was this race part of a dominant streak? Did it change the championship? How are the teams doing overall?

Now the Standings tab tells the season story. Below the race results table, three new sections appear. "Hot Right Now" shows who's on the best form — not total season points (which just tells you who's been consistently good all year) but points in the last 5 races. This catches surges. If a driver has won 5 in a row, they'll be at the top even if they're second in the championship overall. "Championship Turning Points" spots the moments that mattered — when did the lead change? When did the gap blow open by 15+ points in a single race? "Constructor Battle" shows how the teams compare at that exact moment in the season, with coloured bars matching each team's livery.

The key insight: all of this is relative to the race you're viewing. Look at Round 5 and you see the story through 5 races. Look at Round 20 and the full picture emerges. The season unfolds as you browse forward through the calendar.

---

## What Was Built

### Backend: `get_season_story(year, track)`

Plain English: Takes a specific race and calculates the season context up to that point — who's hot, what shifted, and how teams compare. Only counts races that happened before or at this round.

**Three computations in one function:**

#### 1. Momentum — Points in Last 5 Races

```python
recent = race_results[-5:]
momentum_tally: dict[str, dict] = {}
for race_name, results in recent:
    for r in results:
        drv = r["driver"]
        pos = r.get("finish_position")
        pts = _POINTS_TABLE.get(pos, 0) if pos else 0
        if drv not in momentum_tally:
            momentum_tally[drv] = {"points": 0, "team": r["team"], "results": []}
        momentum_tally[drv]["points"] += pts
        momentum_tally[drv]["results"].append({"race": race_name, "position": pos, "points": pts})
```

Takes the last 5 indexed races before (and including) the current one, sums points per driver, and returns the top 5. Each entry includes the per-race breakdown so the frontend can show mini position badges.

**Why last 5, not all?** Total season points tell you who's winning. Recent form tells you who's *currently fast*. A driver could be leading the championship but have scored nothing in the last 3 races — they're not "hot." The 5-race window balances recency with enough data to spot real trends.

**Example output (2023 British GP, Round 10):**
```
1. Max Verstappen — 125 pts (P1, P1, P1, P1, P1)
2. Lewis Hamilton — 64 pts
3. Fernando Alonso — 58 pts
4. Sergio Perez — 43 pts
5. George Russell — 41 pts
```

Verstappen had 125 out of a possible 125 — perfect form.

#### 2. Turning Points — Lead Changes and Big Swings

```python
turning_points = []
prev_leader = None
prev_gap = 0
running_tally: dict[str, int] = {}

for race_name, results in race_results:
    # Update running tally
    for r in results:
        drv = r["driver"]
        pos = r.get("finish_position")
        pts = _POINTS_TABLE.get(pos, 0) if pos else 0
        running_tally[drv] = running_tally.get(drv, 0) + pts

    sorted_drivers = sorted(running_tally.items(), key=lambda x: -x[1])
    leader = sorted_drivers[0][0]
    gap = sorted_drivers[0][1] - sorted_drivers[1][1]

    # Lead change
    if prev_leader and leader != prev_leader:
        turning_points.append({
            "type": "lead_change",
            "headline": f"{_dn(leader)} takes the championship lead",
            ...
        })

    # Big swing (gap changed by 15+ points)
    elif prev_leader and abs(gap - prev_gap) >= 15:
        if gap > prev_gap:
            turning_points.append({"type": "gap_extension", ...})
        else:
            turning_points.append({"type": "gap_closing", ...})

    prev_leader = leader
    prev_gap = gap
```

Walks through every indexed race in chronological order, maintaining a running points tally. After each race, checks two things:

1. **Did the leader change?** If the person at the top of the standings is different from last race, that's a `lead_change`. These are the dramatic moments — when Norris finally overtakes Verstappen, for example.

2. **Did the gap swing by 15+ points?** Even without a lead change, a 15-point swing in one race is significant. If the leader scored 25 (win) and the second-place driver scored 0 (DNF), that's a 25-point extension. The threshold of 15 filters out normal variation (scoring 25 vs 18 is only 7 points difference).

Three types: `lead_change` (most dramatic), `gap_extension` (leader pulling away), `gap_closing` (challenger closing in).

#### 3. Constructor Battle — Team Standings

```python
team_tally: dict[str, int] = {}
for race_name, results in race_results:
    for r in results:
        team = r["team"]
        pos = r.get("finish_position")
        pts = _POINTS_TABLE.get(pos, 0) if pos else 0
        team_tally[team] = team_tally.get(team, 0) + pts
```

Sums points per team across all races up to this point. Both drivers' points count. Returns the top 5 teams sorted by points. Simple but effective — the frontend's coloured bars make relative strength immediately visible.

**Example output (2023 British GP):**
```
1. Red Bull Racing — 375 pts
2. Mercedes — 193 pts
3. Aston Martin — 168 pts
4. Ferrari — 140 pts
5. McLaren — 59 pts
```

Red Bull's bar is full width; McLaren's is about 16% — the visual makes the dominance obvious.

---

### The Chronological Ordering Problem

The indexed race list from `list_indexed()` returns races in alphabetical order (Abu Dhabi, Australian, Austrian...). But the season story needs chronological order (Bahrain R1, Saudi Arabia R2, Australia R3...).

The solution: fetch the season schedule from `loader.get_season_schedule(year)`, which returns races in round order with dates. Then filter to only indexed races, preserving calendar order:

```python
race_names_in_order = [s["name"] for s in schedule]
race_index = race_names_in_order.index(track)
races_so_far = race_names_in_order[: race_index + 1]

for t in races_so_far:
    if not indexer.is_indexed(year, t):
        continue
    data = indexer.load_race_index(year, t)
    race_results.append((t, data["results"]))
```

This ensures that "last 5 races" means the 5 most recent chronologically, not alphabetically. And "races so far" stops at the current round — viewing Round 10 doesn't include Round 11's results.

---

### API Endpoint

```
GET /races/{year}/{track}/season-story
    {
      "momentum": [...],
      "turning_points": [...],
      "constructor_battle": [...],
      "race_round": 10,
      "total_rounds": 22
    }
```

Returns 404 if the race isn't indexed or the schedule is unavailable.

---

### Frontend: Two New Components

#### `MomentumCard.tsx` — Who's Hot

Plain English: Shows the top 5 drivers by recent form, each with a points bar and mini position badges for their last 5 races.

**Visual structure per driver row:**

```
 1  ● Max Verstappen                    125
    [████████████████████████████] P1 P1 P1 P1 P1
```

- Rank number (1-5) in muted mono font
- Team colour dot (blue for Red Bull, red for Ferrari, etc.)
- Full driver name
- Points total in bold on the right
- Red horizontal bar sized relative to the top driver's points
- 5 mini badges showing finishing position per race:
  - Gold (`bg-yellow-500`) for P1
  - Silver (`bg-zinc-400`) for P2-P3
  - Light grey (`bg-zinc-700`) for P4-P10
  - Dark grey (`bg-zinc-800`) for P11+

Each badge has a `title` attribute so hovering shows the race name.

**Position colour function:**

```typescript
function positionColor(pos: number | null): string {
  if (!pos) return "bg-zinc-700 text-zinc-500";
  if (pos === 1) return "bg-yellow-500 text-black";
  if (pos <= 3) return "bg-zinc-400 text-black";
  if (pos <= 10) return "bg-zinc-700 text-zinc-200";
  return "bg-zinc-800 text-zinc-500";
}
```

#### `SeasonStory.tsx` — The Container

Plain English: Fetches the season story from the API and renders all three sections — momentum, turning points, and constructor battle.

**Three sections rendered:**

1. **Round indicator** — "Round 10 of 22" in small text at the top
2. **MomentumCard** — rendered directly using the momentum data
3. **Turning Points** — cards with directional arrow icons:
   - `⇄` (yellow) for lead changes
   - `↗` (green) for gap extensions
   - `↘` (orange) for gap closings
   - Driver names highlighted using the same regex pattern from Phase 5B/5C
4. **Constructor Battle** — horizontal bars coloured by team livery

```typescript
const TP_ICON: Record<string, { icon: string; color: string }> = {
  lead_change:   { icon: "⇄", color: "text-yellow-400" },
  gap_extension: { icon: "↗", color: "text-green-400" },
  gap_closing:   { icon: "↘", color: "text-orange-400" },
};
```

**Loading state:** Three skeleton blocks matching the approximate height of each section.

**Empty state:** If the API returns null (race not indexed), the component returns null and takes no space.

---

### How the Pieces Connect

```
User clicks Standings tab
     │
     ├── StandingsTable renders immediately (data already fetched)
     │     └── Race finishing order, grid positions, deltas
     │
     └── SeasonStory loads independently
           ├── Fetches GET /races/{year}/{track}/season-story
           │     └── insights.get_season_story(year, track)
           │           ├── Gets season schedule for chronological order
           │           ├── Iterates indexed races up to this round
           │           ├── Computes momentum (last 5 races)
           │           ├── Detects turning points (lead changes, swings)
           │           └── Sums constructor points
           │
           └── Renders three sections
                 ├── MomentumCard (points bars + position badges)
                 ├── Turning Points (arrow icons + headlines)
                 └── Constructor Battle (team-coloured bars)
```

---

## Edge Cases & Gotchas

**1. Round 1 has no turning points**

At the first race of the season, there's no previous leader to compare against. The turning points list is empty. This is handled correctly — the section simply doesn't render if the list is empty (`{data.turning_points.length > 0 && (...)}`).

**2. Unindexed races create gaps in the story**

If races 3, 4, and 5 aren't indexed but race 10 is, the momentum calculation uses whatever 5 most recent indexed races exist — which might span a wider calendar range than expected. The turning point detection also skips unindexed races, so a lead change could happen "between" two indexed races without being detected.

**3. Schedule fetch can fail**

`get_season_schedule()` makes a network call (FastF1 for 2018+, Jolpica for earlier years). If the network is down, the function returns None and the endpoint returns 404. The cached schedule data on disk mitigates this for previously fetched seasons.

**4. Points table doesn't include fastest lap bonus**

The `_POINTS_TABLE` awards standard points (25-18-15-12-10-8-6-4-2-1) without the fastest lap bonus point. This means real-world standings may differ by a few points. For the purpose of momentum and relative comparisons, this is negligible.

**5. Team colour maps duplicated across components**

`TEAM_BAR` and `TEAM_DOT` maps appear in MomentumCard.tsx, SeasonStory.tsx, ResultsCard.tsx, and page.tsx. These could be consolidated into a shared utility, but the duplication keeps each component self-contained.

---

## Files Created and Modified

| File | Status | What it does |
|------|--------|-------------|
| `backend/core/insights.py` | **Modified** | Added `get_season_story()` — momentum, turning points, constructor battle |
| `backend/api.py` | **Modified** | Added `GET /races/{year}/{track}/season-story` endpoint |
| `frontend/app/components/MomentumCard.tsx` | **Created** | Driver form card with points bars and mini position badges |
| `frontend/app/components/SeasonStory.tsx` | **Created** | Container fetching and rendering all three season story sections |
| `frontend/app/races/[year]/[track]/page.tsx` | **Modified** | Imported SeasonStory, rendered below StandingsTable |

---

## Quick Reference

### Season Story API
```
GET /races/{year}/{track}/season-story
    {
      "momentum": [{"driver": "VER", "full_name": "Max Verstappen", "team": "...", "points": 125, "results": [...]}],
      "turning_points": [{"race": "...", "type": "lead_change", "headline": "...", "detail": "..."}],
      "constructor_battle": [{"team": "Red Bull Racing", "points": 375}],
      "race_round": 10,
      "total_rounds": 22
    }
```

### Turning Point Types
| Type | Icon | Colour | Detection |
|------|------|--------|-----------|
| lead_change | ⇄ | Yellow | Different driver at top of standings after a race |
| gap_extension | ↗ | Green | Leader's gap grew by 15+ points |
| gap_closing | ↘ | Orange | Leader's gap shrank by 15+ points |

### Key Terms
| Term | Plain English | Technical |
|------|---------------|-----------|
| Momentum | Who's scoring the most points right now | Sum of points in last 5 chronological races |
| Turning point | A race that shifted the championship | Lead change or 15+ point gap swing |
| Constructor battle | How teams compare in total points | Sum of both drivers' points per team |
| Race round | Where this race sits in the calendar | Index in the season schedule (1-based) |

---

*Generated: 2026-03-17 | Project: Raceday | Phase 5D complete | Files: insights.py, api.py, MomentumCard.tsx, SeasonStory.tsx, page.tsx*
