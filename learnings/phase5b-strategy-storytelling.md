# Phase 5B — Strategy Story/Data (Built)

> Turning F1 tyre strategy from a data table into two experiences: a readable race narrative and a technical breakdown with a companion key panel.

---

## In Plain English

Before Phase 5B, the Strategy tab showed a table of compounds per driver — "VER: 1-stop: Medium → Soft", "NOR: 1-stop: Medium → Hard." It was accurate but boring. You had to already understand F1 strategy to get anything from it.

Now the same tab has two modes. "Story" reads like race commentary — "Hulkenberg was the first to blink, pitting on lap 7. It didn't work out — he ended up P13. Button pulled off a textbook undercut on Ricciardo, pitting on lap 11 while Ricciardo waited until lap 12." "Data" keeps the existing table but adds a side panel explaining what each compound means and showing quick stats like who pitted first, what the longest stint was, and how many different strategies were used.

The key idea: the same data, presented two completely different ways for two completely different audiences. Someone watching their first race can read Story mode and understand what happened. A strategy nerd can switch to Data mode and dig into the numbers.

---

## What Was Built

### Backend: Two New Functions

#### `get_strategy_narrative(year, track)` — The Story Engine

Plain English: Takes a race and writes commentary paragraphs about the strategy, detecting patterns automatically.

**Five sections are generated:**

1. **Opening** — weather conditions and their impact on strategy
2. **First to pit** — who blinked first, did it work out, who stayed out longest
3. **Undercut detection** — finds cases where a driver pitted earlier than a rival, started behind them, but finished ahead
4. **Contrasting strategies** — highlights the split when some drivers went 1-stop and others went 3-stop
5. **Winner's strategy** — what compounds the winner used, how many stops, and whether starting position mattered

**The undercut detection algorithm:**

```python
for i, (d1, lap1) in enumerate(first_stops):
    for d2, lap2 in first_stops[i+1:]:
        grid1, grid2 = info1["grid"], info2["grid"]
        fin1, fin2 = info1["finish"], info2["finish"]
        # d1 pitted before d2
        # d1 started behind d2 (grid1 > grid2)
        # d1 finished ahead of d2 (fin1 < fin2)
        if grid1 > grid2 and fin1 < fin2 and lap1 < lap2:
            undercuts.append((d1, d2, lap1, lap2, fin1))
```

An undercut is when driver A pits earlier than driver B, comes out on fresh tyres, does fast laps while B is still on old tyres, and when B finally pits, A has built enough gap to be ahead. The code detects this by checking: did the earlier pitter start behind but finish ahead?

**Example output (2023 British GP):**

```
In dry conditions, tyre management and pit stop timing were everything.
Track temperatures hovered around 21.5°C.

HUL (Haas F1 Team) was the first to blink, pitting on lap 7. It didn't
work out — HUL ended up P13. VER stayed out until lap 33, stretching
the first stint 26 laps longer.

PER (Red Bull Racing) pulled off a textbook undercut on SAR, pitting on
lap 28 while SAR waited until lap 29. PER emerged ahead and held the
position to finish P6.

Strategy variety split the field. MAG committed to a 0-stop, while ZHO
went aggressive with 3 stops.

VER (Red Bull Racing) took the win on a 1-stop strategy: Medium then Soft.
```

#### `get_strategy_stats(year, track)` — The Numbers Panel

Plain English: Calculates quick strategy facts for the side panel in Data mode.

Returns:
- **Most common strategy** — e.g. "1-stop (13 drivers)"
- **Strategies used** — count of distinct stop strategies
- **First to pit** — driver, team, lap number
- **Last to pit** — driver, team, lap number
- **Longest stint** — driver, compound, lap count
- **Shortest stint** — driver, compound, lap count
- **Compounds used** — list of unique compounds in the race

```python
# Example output for 2023 British GP:
{
  "most_common": "1-stop (13 drivers)",
  "strategies": 4,
  "first_to_pit": {"driver": "HUL", "team": "Haas F1 Team", "lap": 7},
  "last_to_pit": {"driver": "ALO", "team": "Aston Martin", "lap": 33},
  "longest_stint": {"driver": "ALO", "compound": "Medium", "laps": 33},
  "shortest_stint": {"driver": "ZHO", "compound": "Soft", "laps": 3},
  "compounds_used": ["Hard", "Medium", "Soft"]
}
```

### API Endpoints

```
GET /races/{year}/{track}/strategy/narrative → ["paragraph1", "paragraph2", ...]
GET /races/{year}/{track}/strategy/stats → {most_common, strategies, first_to_pit, ...}
```

Both return 404 if the race isn't indexed or has no stint data.

---

### Frontend: Three New Components

#### `StrategyStory.tsx` — Story Mode

Plain English: Fetches the narrative paragraphs and renders them as flowing text with driver codes highlighted.

**Driver highlighting:** Three-letter codes (VER, HAM, NOR) are automatically found using a regex and wrapped in bold white text so they pop out of the grey prose:

```typescript
const DRIVER_PATTERN = /\b([A-Z]{3})\b/g;

function highlightDrivers(text: string): string {
  return text.replace(
    DRIVER_PATTERN,
    '<span class="font-semibold text-white">$1</span>'
  );
}
```

Uses `dangerouslySetInnerHTML` to render the highlighted HTML. This is safe here because the content comes from our own backend (not user input).

Includes a loading skeleton (animated pulse bars) and an empty state message.

#### `StrategyKey.tsx` — Data Mode Side Panel

Plain English: Shows what each tyre compound means and quick race stats beside the strategy table.

Two cards stacked vertically:

**Compound Key** — coloured dots with descriptions:
- Red dot: Soft — "Fastest, degrades quickly"
- Yellow dot: Medium — "Balanced pace and durability"
- White dot: Hard — "Slowest, lasts longest"
- Green dot: Intermediate — "Light rain, grooved surface"
- Blue dot: Wet — "Heavy rain, full treads"

Only compounds actually used in the race are shown (driven by the `compounds_used` field from the stats API).

**Race Stats** — label/value pairs:
```
Most common     1-stop (13 drivers)
Strategies used 4
First to pit    HUL (lap 7)
Last to pit     ALO (lap 33)
Longest stint   33 laps
                ALO, Medium
Shortest stint  3 laps
                ZHO, Soft
```

#### Story/Data Sub-Tabs in Race Page

Two small buttons ("story" / "data") appear below the main Strategy tab header:

```typescript
{(["story", "data"] as const).map((mode) => (
  <button
    onClick={() => setStrategyMode(mode)}
    className={`px-3 py-1 rounded text-xs font-medium capitalize ${
      strategyMode === mode
        ? "bg-zinc-700 text-white"
        : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
    }`}
  >
    {mode}
  </button>
))}
```

**Story mode** renders `<StrategyStory>` — full width narrative.

**Data mode** renders the existing `<StrategyPanel>` on the left with `<StrategyKey>` on the right (stacks on mobile):

```typescript
{strategyMode === "data" && strategy && (
  <div className="flex flex-col lg:flex-row gap-6">
    <div className="flex-1 min-w-0">
      <StrategyPanel data={strategy} />
    </div>
    <div className="w-full lg:w-56 shrink-0">
      <StrategyKey year={year} track={trackName} />
    </div>
  </div>
)}
```

---

## How the Pieces Connect

```
User clicks Strategy tab → sees Story/Data toggle
     │
     ├── Story mode selected:
     │     StrategyStory.tsx fetches /strategy/narrative
     │       → insights.get_strategy_narrative(year, track)
     │         → reads stint data from index
     │         → detects patterns (first pit, undercuts, variety)
     │         → generates 4-5 prose paragraphs
     │       → renders with driver name highlighting
     │
     └── Data mode selected:
           ├── StrategyPanel (existing) uses already-fetched strategy data
           └── StrategyKey.tsx fetches /strategy/stats
                 → insights.get_strategy_stats(year, track)
                   → calculates most common, first/last pit, longest stint
                 → renders compound key + stats panel
```

---

## The Narrative Generation Pattern

The core idea behind `get_strategy_narrative` is **template-based storytelling with data-driven conditionals**. It's not AI-generated text — it's structured templates that fill in with race-specific data and only appear when the pattern is detected.

```
IF wet → "Rain played a defining role..."
IF first_pitter finished > P10 → "It didn't work out..."
IF undercut detected → "X pulled off a textbook undercut on Y..."
IF strategy variety >= 2 types → "Strategy variety split the field..."
```

This produces different narratives for every race without repeating the same structure. A wet 2014 Australian GP reads completely differently from a dry 2023 British GP.

**Strengths:** Reliable, fast, no external dependencies, always factually correct.

**Limitations:** Can feel formulaic across many races. The templates follow patterns — "X was the first to blink" appears in every race. Future improvement: add more template variations and randomise between them.

---

## Edge Cases & Gotchas

**1. Races with no stint data**
Returns `["No detailed stint data available for this race."]` — a single paragraph that the frontend renders cleanly.

**2. Server restart needed for new endpoints**
Even with `--reload`, adding new route paths in `api.py` sometimes doesn't get picked up by uvicorn's file watcher. Required a manual restart to test the new `/strategy/narrative` and `/strategy/stats` endpoints.

---

## Post-Build Improvements

Three improvements were made after the initial build based on user feedback:

### 1. Full driver names instead of codes

**Problem:** Story mode showed "HUL was the first to blink" — meaningless to a beginner who doesn't know driver codes.

**Fix:** Added a `_DRIVER_NAMES` mapping (78 drivers, 2010–2024) built from the Jolpica API. Created a `_dn(code)` helper that returns "Full Name (CODE)":

```python
_DRIVER_NAMES = {
    "HAM": "Lewis Hamilton", "VER": "Max Verstappen",
    "NOR": "Lando Norris", "LEC": "Charles Leclerc", ...
}

def _dn(code: str) -> str:
    name = _DRIVER_NAMES.get(code, code)
    return f"{name} ({code})" if name != code else code
```

Now reads: "Nico Hulkenberg (HUL) was the first to pit" — beginners learn the codes naturally.

The frontend highlights these with a regex: full name in bold white, code in muted zinc:

```typescript
const DRIVER_NAME_PATTERN = /([A-Z][a-z]+(?: [A-Z][a-z]+)*) \(([A-Z]{3})\)/g;

// "Max Verstappen (VER)" → bold "Max Verstappen" + grey "(VER)"
```

### 2. Structured sections instead of flat paragraphs

**Problem:** Story mode was a wall of plain paragraphs — no visual structure.

**Fix:** Changed the API response from `list[str]` to `list[dict]` with `heading` + `body`:

```python
# Before: ["paragraph1", "paragraph2", ...]
# After: [{"heading": "Race Conditions", "body": "..."}, {"heading": "The Key Move", "body": "..."}, ...]
```

Five named sections: "Race Conditions", "The Opening Gambit", "The Key Move", "Strategy Split", "The Winning Formula". Each renders in its own card with a coloured icon marker.

### 3. Strategy breakdown replaces "strategies used" count

**Problem:** "Strategies used: 4" didn't explain what the 4 strategies were.

**Fix:** Replaced with a visual breakdown showing badges:

```python
# Before: "strategies": 4
# After: "strategy_breakdown": [
#   {"strategy": "0-stop", "count": 2},
#   {"strategy": "1-stop", "count": 13},
#   {"strategy": "2-stop", "count": 4},
#   {"strategy": "3-stop", "count": 1}
# ]
```

Frontend renders as small tags: `0-stop: 2` `1-stop: 13` `2-stop: 4` `3-stop: 1`

---

## Bugs Fixed During Build

**1. `highlightDrivers` called on undefined body**
In plain English: The frontend tried to highlight driver names in a paragraph that didn't exist, crashing the page.
Cause: The API response format changed from `string[]` to `{heading, body}[]`, but the server was still returning the old format until restarted.
Fix: Added `if (!text) return ""` guard in the highlight function.

**2. `strategy_breakdown.map()` on undefined**
In plain English: The stats panel tried to loop through strategy badges but the field didn't exist yet.
Cause: Same server-not-restarted issue — old code returned `strategies: 4` (a number), new frontend expected `strategy_breakdown: [...]` (an array).
Fix: Added `{stats.strategy_breakdown && stats.strategy_breakdown.length > 0 && (...)}` guard. Also restarted the server to serve the new format.

**Root cause of both bugs:** uvicorn's `--reload` flag watches for file changes but doesn't always detect changes in imported modules (like `insights.py` imported by `api.py`). When in doubt, kill and restart the server manually.

---

## Files Created and Modified

| File | Status | What it does |
|------|--------|-------------|
| `backend/core/insights.py` | **Modified** | `get_strategy_narrative()` (structured sections + full names), `get_strategy_stats()` (breakdown), `_DRIVER_NAMES` mapping |
| `backend/api.py` | **Modified** | Added `/strategy/narrative` + `/strategy/stats` endpoints |
| `frontend/app/components/StrategyStory.tsx` | **Created** | Story mode — structured sections with driver name highlighting |
| `frontend/app/components/StrategyKey.tsx` | **Created** | Data mode side panel — compound legend + strategy breakdown |
| `frontend/app/races/[year]/[track]/page.tsx` | **Modified** | Story/Data sub-tabs inside Strategy tab |

---

## Quick Reference

### Strategy narrative API
```
GET /races/{year}/{track}/strategy/narrative
→ [{"heading": "Race Conditions", "body": "..."}, {"heading": "The Key Move", "body": "..."}, ...]
```

### Strategy stats API
```
GET /races/{year}/{track}/strategy/stats
→ {most_common, strategy_breakdown: [{strategy, count}],
   first_to_pit, last_to_pit, longest_stint, shortest_stint, compounds_used}
```

### Key Terms
| Term | Plain English | Technical |
|------|---------------|-----------|
| Undercut | Pit before your rival to jump ahead on fresh tyres | Grid behind + pit earlier + finish ahead |
| Overcut | Stay out longer to gain an advantage | Opposite of undercut — longer first stint pays off |
| Strategy narrative | Auto-written race commentary | Template-based prose with structured sections |
| `_dn(code)` | Shows "Full Name (CODE)" for any driver | Lookup in `_DRIVER_NAMES` dict |
| Strategy breakdown | Visual badges showing how many drivers per strategy | `[{strategy: "1-stop", count: 13}, ...]` |
| Compound key | Colour legend for tyre types | Maps compound names to dot colours + descriptions |

---

*Updated: 2026-03-17 | Project: Raceday | Phase 5B complete + improvements | Files: insights.py, api.py, StrategyStory.tsx, StrategyKey.tsx, page.tsx*
