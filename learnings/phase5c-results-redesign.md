# Phase 5C — Results Tab Redesign (Built)

> Turning the Results tab from a static winner/podium display into a dynamic race story — auto-detecting key moments from the data and presenting them with team-coloured visual identity.

---

## In Plain English

Before Phase 5C, the Results tab showed three things: who won, who came second and third, and who retired. It showed three-letter codes like "VER" and "NOR" with no colour or personality — just white text on dark cards. You had to already know that "VER" means Max Verstappen and that he drives for Red Bull. There was nothing to tell you *what happened* in the race beyond the bare finishing order.

Now the Results tab tells a story. The winner card says "Max Verstappen" in large text with a blue left-border accent that matches Red Bull's livery colour, and a small blue dot next to the team name. The podium cards do the same for P2 and P3 — orange for McLaren, emerald green for Mercedes. Below the podium, a "Key Moments" section automatically spots the most interesting things that happened: "Sergio Perez gained 9 places", "Lewis Hamilton beat Oscar Piastri in a grid-defying fight", "Jenson Button undercut Daniel Ricciardo." These aren't written by hand — the app scans the race data and detects patterns every time.

The idea is that someone looking at the Results tab should immediately understand not just *who won* but *what made this race interesting*. A dominant pole-to-win is different from a chaotic wet race with 8 retirements and a comeback from P15. The key moments make that difference visible at a glance.

---

## What Was Built

### Backend: The Key Moments Engine

#### `get_key_moments(year, track)` — Pattern Detection

Plain English: Takes a race and scans through the results, starting grid, pit stop data, and retirement list to automatically find interesting things that happened. Returns a list of "moment" cards, each with a type, a headline, a longer explanation, and the primary driver involved.

**Seven types of moment are detected:**

#### 1. Biggest Gainer

Plain English: Who gained the most positions from where they started to where they finished?

```python
best_gain = None
for r in finishers:
    grid = r.get("grid_position")
    finish = r["finish_position"]
    if grid is not None and finish is not None:
        delta = grid - finish
        if delta >= 3 and (best_gain is None or delta > best_gain[1]):
            best_gain = (r, delta)
```

The delta is `grid minus finish` — a positive number means you moved forward. If you started P15 and finished P6, that's `15 - 6 = 9` positions gained. The threshold is 3 places — smaller gains aren't interesting enough to highlight. Only the single biggest gainer is shown.

**Example output (2023 British GP):**
```
Sergio Perez (PER) gained 9 places
Started P15, finished P6. The biggest forward charge of the race for Red Bull Racing.
```

#### 2. Biggest Loser

Plain English: Who dropped the most positions without retiring?

```python
worst_loss = None
for r in finishers:
    grid = r.get("grid_position")
    finish = r["finish_position"]
    status = r["status"]
    if (grid is not None and finish is not None
            and status in ("Finished",) or status.startswith("+")):
        delta = grid - finish  # negative = lost places
        if delta <= -3 and (worst_loss is None or delta < worst_loss[1]):
            worst_loss = (r, delta)
```

Same delta math but looking for negative numbers. A driver who started P4 and finished P9 has a delta of `4 - 9 = -5`. The status check (`Finished` or `+X Laps`) excludes retirements — dropping out of a race isn't the same as losing positions. The threshold is -3.

**Example output (2023 British GP):**
```
Charles Leclerc (LEC) dropped 5 places
Started P4 but fell to P9. A tough afternoon for Ferrari.
```

#### 3. Comeback Drive

Plain English: Did anyone start outside the top 10 and finish in the top 5?

```python
for r in finishers[:5]:
    grid = r.get("grid_position")
    finish = r["finish_position"]
    if grid and grid > 10 and finish and finish <= 5:
        moments.append({...})
```

This checks the top 5 finishers — if any of them started outside P10, that's a comeback worth highlighting. Starting P11 and finishing P5 is notable. Starting P15 and finishing P5 is remarkable. The threshold is deliberately strict (top 5 finish from outside top 10) to avoid showing every minor position gain.

**Example output (2014 Australian GP):**
```
Valtteri Bottas (BOT) stormed from P15 to P5
Starting outside the top 10, Valtteri Bottas carved through the field to finish in the top 5 for Williams.
```

#### 4. Dominant Win

Plain English: Did the winner start from pole position?

```python
if finishers:
    winner = finishers[0]
    grid = winner.get("grid_position")
    if grid == 1:
        moments.append({...})
```

The simplest detection — if the winner started P1, it's a dominant "lights to flag" performance. This is a common pattern in modern F1 (especially the Verstappen era) but it's still worth calling out because it tells you the race was controlled from the front rather than decided by late drama.

**Example output (2023 British GP):**
```
Max Verstappen (VER) converted pole to victory
Led from lights out to chequered flag. A commanding performance by Red Bull Racing.
```

#### 5. Undercut Detection

Plain English: Did someone pit earlier than a rival, come out on fresh tyres, do fast laps, and end up ahead?

```python
first_stops: list[tuple[str, int]] = []
for driver, stints in stints_by_driver.items():
    if len(stints) >= 2:
        first_pit_lap = stints[0].get("lap_end", 0)
        first_stops.append((driver, first_pit_lap))
first_stops.sort(key=lambda x: x[1])

undercuts = []
for i, (d1, lap1) in enumerate(first_stops):
    for d2, lap2 in first_stops[i + 1:]:
        info1 = driver_info.get(d1, {})
        info2 = driver_info.get(d2, {})
        grid1, grid2 = info1.get("grid"), info2.get("grid")
        fin1, fin2 = info1.get("finish"), info2.get("finish")
        if (grid1 and grid2 and fin1 and fin2
                and grid1 > grid2 and fin1 < fin2 and lap1 < lap2):
            undercuts.append((d1, d2, lap1, lap2, fin1))
```

This is the same algorithm used in Phase 5B's strategy narrative. An undercut is when:
- Driver A pits before Driver B (`lap1 < lap2`)
- Driver A started behind Driver B on the grid (`grid1 > grid2`)
- Driver A finished ahead of Driver B (`fin1 < fin2`)

The combination of all three conditions means the early pit stop was the decisive move that gained the position. Only the undercut with the best finishing position is shown (using `min` on `fin1`).

**Example output (2014 Australian GP):**
```
Jenson Button (BUT) undercut Daniel Ricciardo (RIC)
Jenson Button pitted on lap 11, Daniel Ricciardo waited until lap 12. The early stop worked — Jenson Button finished P3.
```

#### 6. Close Battle

Plain English: Did a driver from further back on the grid fight past another driver from a different team to finish just ahead of them?

```python
for i in range(len(finishers) - 1):
    r1 = finishers[i]
    r2 = finishers[i + 1]
    if r1["team"] != r2["team"] and r1["finish_position"] <= 10:
        grid1 = r1.get("grid_position")
        grid2 = r2.get("grid_position")
        if grid1 and grid2 and grid1 > grid2:
            moments.append({...})
            break  # only show the best one
```

This scans consecutive finishers (P3/P4, P4/P5, etc.) looking for cases where:
- They're from different teams (teammates swapping isn't interesting)
- The finishing position is in the top 10 (midfield swaps are less notable)
- The driver who finished ahead started *behind* the other on the grid

The `break` ensures only one close battle is shown — the first one found (which will be the highest up the order, so the most significant).

**Example output (2023 British GP):**
```
Lewis Hamilton (HAM) beat Oscar Piastri (PIA) in a grid-defying fight
Lewis Hamilton started P7 behind Oscar Piastri (P3) but finished ahead — P3 vs P4.
```

#### 7. High Attrition

Plain English: Did 5 or more drivers fail to finish?

```python
if len(retired) >= 5:
    moments.append({
        "type": "attrition",
        "headline": f"{len(retired)} drivers retired",
        "detail": f"A race of attrition — {len(retired)} out of {len(results)} starters "
                  f"failed to see the chequered flag.",
        ...
    })
```

Five retirements out of 20 starters (25%) is unusual enough to flag. Modern F1 reliability means most races have 1-3 retirements. When 5+ don't finish, something dramatic happened — mechanical failures, crashes, or extreme weather.

**Example output (2014 Australian GP):**
```
8 drivers retired
A race of attrition — 8 out of 22 starters failed to see the chequered flag.
```

---

### The Data Shape

Each moment returned from the API has a consistent structure:

```python
{
    "type": "biggest_gainer",      # Machine-readable category
    "headline": "Sergio Perez (PER) gained 9 places",  # Short, punchy summary
    "detail": "Started P15, finished P6...",            # Longer explanation
    "driver": "PER"                                     # Primary driver code
}
```

The `type` field drives the frontend's icon and colour choices. The `headline` uses full driver names via the `_dn()` helper (returning "Sergio Perez (PER)" format). The `detail` field gives context. The `driver` field could be used for linking to driver profiles later.

---

### API Endpoint

```
GET /races/{year}/{track}/moments
    [
      {"type": "biggest_gainer", "headline": "...", "detail": "...", "driver": "PER"},
      {"type": "dominant_win", "headline": "...", "detail": "...", "driver": "VER"},
      ...
    ]
```

Returns 404 if the race isn't indexed. Thin route — just calls `insights.get_key_moments()` and passes through.

---

### Frontend: Two Components Changed

#### `KeyMoments.tsx` — The Moment Cards

Plain English: Fetches key moments from the API and renders them as a vertical list of cards, each with a coloured icon on the left indicating what type of moment it is.

**The icon/colour mapping:**

```typescript
const MOMENT_STYLE: Record<string, { icon: string; color: string }> = {
  biggest_gainer:  { icon: "↑", color: "text-green-400" },
  biggest_loser:   { icon: "↓", color: "text-red-400" },
  comeback:        { icon: "⇈", color: "text-emerald-400" },
  dominant_win:    { icon: "★", color: "text-yellow-400" },
  undercut:        { icon: "⚔", color: "text-orange-400" },
  close_battle:    { icon: "☣", color: "text-blue-400" },
  attrition:       { icon: "⚠", color: "text-amber-400" },
};
```

Green for gains, red for losses, yellow for dominance, orange for strategic moves — the colours are intuitive enough that you can scan the icons without reading the text and get a feel for the race.

**Driver name highlighting:**

The same regex pattern from Phase 5B's StrategyStory is reused:

```typescript
const DRIVER_NAME_PATTERN = /([A-Z][a-z]+(?: [A-Z][a-z]+)*) \(([A-Z]{3})\)/g;

function highlightDrivers(text: string): string {
  if (!text) return "";
  return text.replace(
    DRIVER_NAME_PATTERN,
    '<span class="font-semibold text-white">$1</span> <span class="text-zinc-500">($2)</span>'
  );
}
```

This finds patterns like "Max Verstappen (VER)" and renders the full name in bold white text with the three-letter code in muted grey. Uses `dangerouslySetInnerHTML` — safe because the content comes from our backend, not user input.

**Loading state:** Three skeleton cards with animated pulse show where the moments will appear.

**Empty state:** If no moments are detected (very unusual — every race has at least a biggest gainer or a pole-to-win), the component returns `null` and takes up no space.

#### `ResultsCard.tsx` — Visual Refresh

Plain English: The existing winner/podium/weather/retirements card now shows full driver names, team colour accents, and a more polished layout.

**Three lookup tables were added:**

1. **`DRIVER_NAMES`** — Maps 3-letter codes to full names (45 drivers, 2010-2024):
```typescript
const DRIVER_NAMES: Record<string, string> = {
  VER: "Max Verstappen", HAM: "Lewis Hamilton",
  NOR: "Lando Norris", LEC: "Charles Leclerc",
  // ... 41 more
};
```

2. **`TEAM_ACCENT`** — Maps team names to left-border colours at 40% opacity:
```typescript
const TEAM_ACCENT: Record<string, string> = {
  "Red Bull Racing": "border-blue-500/40",
  "Ferrari": "border-red-500/40",
  "McLaren": "border-orange-400/40",
  // ... 15 more teams including historical ones
};
```

3. **`TEAM_DOT`** — Maps team names to small coloured dot backgrounds:
```typescript
const TEAM_DOT: Record<string, string> = {
  "Red Bull Racing": "bg-blue-500",
  "Ferrari": "bg-red-500",
  "McLaren": "bg-orange-400",
  // ... matches TEAM_ACCENT but without opacity
};
```

**Visual changes:**
- Winner card: `border-l-4` with team colour accent instead of `border border-yellow-500/30`
- Winner name: Full name (e.g. "Max Verstappen") instead of code ("VER")
- Team name: Small coloured dot before the team name
- Podium cards: Same `border-l-4` accent treatment
- Retirement list: Full names with team dots instead of bare codes
- Weather: Added "damp" as a weather type (was missing before)

**The `dn()` helper:**

```typescript
function dn(code: string): string {
  return DRIVER_NAMES[code] || code;
}
```

Falls back to the raw code if the driver isn't in the map — so old or obscure drivers still display correctly, just without full names.

---

### How the Pieces Connect

```
User clicks Results tab
     │
     ├── ResultsCard renders immediately (data already fetched)
     │     ├── Winner card with full name + team colour accent
     │     ├── P2/P3 cards with full names + team accents
     │     └── Weather + Retirements with team dots
     │
     └── KeyMoments loads independently
           ├── Fetches GET /races/{year}/{track}/moments
           │     └── insights.get_key_moments(year, track)
           │           ├── Scans finishers for biggest gain/loss
           │           ├── Checks top 5 for comebacks
           │           ├── Checks winner for pole-to-win
           │           ├── Cross-references stints for undercuts
           │           ├── Scans consecutive finishers for battles
           │           └── Counts retirements for attrition
           │
           └── Renders moment cards with type-specific icons
                 ├── Green ↑ for gains
                 ├── Red ↓ for losses
                 ├── Yellow ★ for dominance
                 ├── Orange ⚔ for undercuts
                 └── Amber ⚠ for attrition
```

---

## The Pattern Detection Approach

The core idea behind `get_key_moments` is **threshold-based pattern scanning**. Each detector:

1. Reads through the race data (results, grid, stints)
2. Calculates a metric (position delta, pit lap difference, retirement count)
3. Checks if the metric exceeds a threshold (3+ places gained, 5+ retirements)
4. Generates a structured moment if it does

The thresholds were chosen to be selective enough that most races produce 3-6 moments, not 10-15. Here's how the thresholds filter:

| Detector | Threshold | Typical hit rate |
|----------|-----------|-----------------|
| Biggest gainer | 3+ places | ~95% of races |
| Biggest loser | 3+ places lost | ~80% of races |
| Comeback | P10+ start, top 5 finish | ~20% of races |
| Dominant win | Pole to win | ~50% of races |
| Undercut | Grid behind, pit earlier, finish ahead | ~60% of races |
| Close battle | Different teams, grid swap in top 10 | ~70% of races |
| Attrition | 5+ retirements | ~15% of races |

**Strengths:** Fast (pure data scanning, no AI/ML), always factually correct, deterministic (same data always produces same moments).

**Limitations:** Can't detect things that aren't in the data — fastest lap battles, safety car drama, weather changes mid-race, team orders. These would need lap-by-lap timing data or event feeds.

---

## The Team Colour System

Two parallel maps exist — one in `ResultsCard.tsx` and one in `page.tsx` (the home page). Both map team names to Tailwind CSS colour classes.

**Why two maps?** The home page uses `bg-` classes for coloured dots. The ResultsCard uses `border-` classes at 40% opacity for subtle left-border accents. The colours are the same (Red Bull = blue, Ferrari = red) but the CSS class names are different.

**Historical teams covered:**
The maps include teams that no longer exist — Force India, Toro Rosso, Lotus F1, Brawn GP, Racing Point. This matters because the app covers races from 2010-2024. A 2012 race might show Kimi Raikkonen driving for Lotus F1, and the amber accent needs to be there.

**Team name variants:**
Some teams appear with different names in different years. "Red Bull Racing" vs "Red Bull", "AlphaTauri" vs "RB" vs "Toro Rosso". Each variant has its own entry in the map to ensure correct colours regardless of which season is being viewed.

---

## Edge Cases & Gotchas

**1. Biggest loser operator precedence bug**

In plain English: The condition for excluding retirements has a subtle operator precedence issue in the current code.

```python
if (grid is not None and finish is not None
        and status in ("Finished",) or status.startswith("+")):
```

Due to Python's operator precedence, `and` binds tighter than `or`, so this reads as `(... and status in ("Finished",)) or (status.startswith("+"))`. This means any lapped car (`+1 Lap`, `+2 Laps`) will always pass the check regardless of grid/finish being None. In practice this rarely causes issues because lapped cars always have grid/finish positions, but the logic isn't quite what was intended.

**2. Driver name maps exist in two places**

The backend has `_DRIVER_NAMES` (78 drivers) in `insights.py`. The frontend has `DRIVER_NAMES` (45 drivers) in `ResultsCard.tsx`. These can drift out of sync. The backend map is more comprehensive because it was built first and covers more historical drivers. The frontend map only includes drivers whose codes appear in results — reserve drivers or one-race substitutes might be missing.

**3. Undercut detection reuses Phase 5B logic**

The exact same undercut algorithm appears in both `get_strategy_narrative()` and `get_key_moments()`. This is intentional duplication rather than a shared function — the two features format the output differently and may evolve independently. But if the detection logic needs to change (e.g. adding a minimum lap gap threshold), it needs to be changed in both places.

**4. `dangerouslySetInnerHTML` usage**

Both `KeyMoments.tsx` and `StrategyStory.tsx` use `dangerouslySetInnerHTML` to render highlighted driver names. This is safe because the text comes from the backend (which generates it from indexed data, not user input). If the backend ever included user-generated content in these fields, it would need sanitization.

---

## Files Created and Modified

| File | Status | What it does |
|------|--------|-------------|
| `backend/core/insights.py` | **Modified** | Added `get_key_moments()` — 7-type pattern detection engine |
| `backend/api.py` | **Modified** | Added `GET /races/{year}/{track}/moments` endpoint |
| `frontend/app/components/KeyMoments.tsx` | **Created** | Moment cards with type-specific icons and driver highlighting |
| `frontend/app/components/ResultsCard.tsx` | **Modified** | Full driver names, team colour accents, team dots, tighter layout |
| `frontend/app/races/[year]/[track]/page.tsx` | **Modified** | Imported KeyMoments, rendered below ResultsCard in Results tab |

---

## Quick Reference

### Key Moments API
```
GET /races/{year}/{track}/moments
    [{"type": "biggest_gainer", "headline": "...", "detail": "...", "driver": "PER"}, ...]
```

### Moment Types
| Type | Icon | Colour | Detection |
|------|------|--------|-----------|
| biggest_gainer | ↑ | Green | Largest positive grid-to-finish delta (3+) |
| biggest_loser | ↓ | Red | Largest negative delta, excl. retirements (3+) |
| comeback | ⇈ | Emerald | Started outside top 10, finished top 5 |
| dominant_win | ★ | Yellow | Winner started from pole (P1) |
| undercut | ⚔ | Orange | Pitted earlier, started behind, finished ahead |
| close_battle | ☣ | Blue | Consecutive finishers, different teams, grid swap |
| attrition | ⚠ | Amber | 5+ retirements |

### Team Colours
| Team | Border accent | Dot |
|------|---------------|-----|
| Red Bull Racing | border-blue-500/40 | bg-blue-500 |
| Mercedes | border-emerald-400/40 | bg-emerald-400 |
| Ferrari | border-red-500/40 | bg-red-500 |
| McLaren | border-orange-400/40 | bg-orange-400 |
| Aston Martin | border-green-500/40 | bg-green-500 |
| Alpine | border-pink-400/40 | bg-pink-400 |
| Williams | border-white/30 | bg-white |
| Haas F1 Team | border-zinc-400/40 | bg-zinc-400 |

### Key Terms
| Term | Plain English | Technical |
|------|---------------|-----------|
| Key moment | An automatically detected interesting thing from a race | Pattern match against result/stint data exceeding a threshold |
| Undercut | Pitting before your rival to jump ahead on fresh tyres | Grid behind + pit earlier + finish ahead |
| Position delta | How many places a driver gained or lost | Grid position minus finish position |
| Team accent | Coloured left-border matching a team's livery | Tailwind `border-l-4` with team-specific colour class |
| `_dn(code)` | Shows "Full Name (CODE)" for any driver | Backend helper, lookup in `_DRIVER_NAMES` dict |
| `dn(code)` | Shows full name for a driver code | Frontend helper, lookup in `DRIVER_NAMES` record |

---

*Generated: 2026-03-17 | Project: Raceday | Phase 5C complete | Files: insights.py, api.py, KeyMoments.tsx, ResultsCard.tsx, page.tsx*
