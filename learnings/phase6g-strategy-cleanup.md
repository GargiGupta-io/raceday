# Phase 6G — Strategy Tab Cleanup: Empty States & Data-Driven UI

> Fixing the Strategy panel so it gracefully handles races where tyre data is missing, incomplete, or irrelevant — instead of showing confusing "?" chips.

---

## In Plain English

Imagine opening a menu at a restaurant and half the items just say "?". You'd have no idea what's available. That's what the Strategy panel looked like for certain races — the 2010 season had no tyre data at all, and the 2021 Belgian Grand Prix was stopped after three laps behind the safety car (no pit stops happened). Instead of useful information, users saw rows of grey question-mark circles with no explanation.

Phase 6G fixed this by teaching the Strategy panel to recognise when it doesn't have real data and show a clear, human-readable message instead. For the stopped Belgian GP, it says "This race was shortened or stopped early — no pit stops were made." For 2010 races, it says "Detailed stint data is not available for this race." And for normal races, the compound legend at the top now only shows the tyre types that were actually used — no phantom "Intermediate" or "Wet" entries cluttering a race that was bone dry.

It's a small change in code — about 30 lines — but it turns a confusing experience into a clean, informative one. The user never wonders "why are there question marks?" because there are no question marks. There's either real data or a clear explanation of why there isn't.

---

## The Problem

### What Users Saw Before

The StrategyPanel component rendered every driver as a row with compound chips (coloured circles: red for Soft, yellow for Medium, white for Hard) and a stops badge. This worked perfectly for races from 2018-2024 where FastF1 provides detailed stint-level data.

But three categories of races broke the UI:

```
Category 1: No stint data at all (2010 races)
┌──────────────────────────────────────────┐
│  WEB  [?]                          —     │
│  BUT  [?]                          —     │
│  HAM  [?]                          —     │
│  ...20 more rows of grey "?" chips...    │
└──────────────────────────────────────────┘
→ User thinks: "Is this broken?"

Category 2: Race stopped early (2021 Belgian GP)
┌──────────────────────────────────────────┐
│  VER  [?]                       0-stop   │
│  RUS  [?]                       0-stop   │
│  HAM  [?]                       0-stop   │
│  ...the race did 3 laps behind SC...     │
└──────────────────────────────────────────┘
→ User thinks: "Why does everyone have 0 stops?"

Category 3: Dry race with phantom compounds in legend
┌──────────────────────────────────────────┐
│  Legend: S  M  H  I  W                   │
│  ──────────────────────────              │
│  VER  M → S                    1-stop    │
│  ...nobody used Intermediate or Wet...   │
└──────────────────────────────────────────┘
→ User thinks: "Were inters and wets available?"
```

### Why It Happened

The data pipeline has different levels of completeness depending on the era:

```
Era            Source      Stint data?   Compounds?
─────────────  ──────────  ────────────  ──────────
2018-2024      FastF1      ✓ detailed    ✓ exact
2011-2017      Jolpica +   ✓ from pits   ~ heuristic
               compound
               lookup
2010           Jolpica     ✗ none        ✗ "Unknown"
```

The 2010 season falls through because the compound lookup table starts at 2011 (that's when Pirelli took over F1 tyres — 2010 was the last Bridgestone year, and no structured data source covers Bridgestone nominations). The backend returns `compounds: ["Unknown"]` and `stops: null` for every driver.

The 2021 Belgian GP is a different kind of edge case. The race was red-flagged after three laps behind the safety car due to heavy rain. No green-flag racing happened. No one pitted. The data is technically correct — 0 stops, no compounds used — but the raw numbers make no sense without context.

---

## How It Was Fixed

### The Audit

Before writing any code, every year from 2010 to 2024 was checked through the API:

```
Year    Races  Issue
──────  ─────  ────────────────────────────────────────
2010    19     All compounds "Unknown", stops null
2011    19     Clean (Pirelli era begins)
2012    20     Clean
...
2020    17     Clean
2021    22     Belgian GP: 0-stop, compounds "UNKNOWN"
2022    22     Clean
2023    22     Clean
2024    24     Clean
```

Only two problem categories: the entire 2010 season and one specific race (2021 Belgian GP).

### The Fix: Three Changes to StrategyPanel.tsx

The fix was 29 new lines and 1 modified line. Here's what each part does:

#### Change 1: Detect "all unknown" data and show empty state

Plain English: Before trying to render any strategy grid, check if every single driver has unknown or empty compound data. If so, skip the grid entirely and show a helpful message instead.

```typescript
// frontend/app/components/StrategyPanel.tsx:43-59

export default function StrategyPanel({ data }: { data: StrategyEntry[] }) {
  // Check if all data is unknown/empty
  const allUnknown = data.every(
    (e) => e.compounds.length === 0 || e.compounds.every((c) => c.toUpperCase() === "UNKNOWN")
  );

  if (allUnknown) {
    return (
      <div className="rounded-lg bg-zinc-900 p-6 text-center">
        <p className="text-sm text-zinc-400 mb-1">No tyre strategy data available</p>
        <p className="text-xs text-zinc-600">
          {data.length > 0 && data[0].stops === 0
            ? "This race was shortened or stopped early — no pit stops were made."
            : "Detailed stint data is not available for this race."}
        </p>
      </div>
    );
  }
  // ... rest of component
}
```

Technical detail: `data.every()` returns true only if the predicate is true for every single entry. The check handles two formats — an empty array `[]` or an array where every element is `"UNKNOWN"` (case-insensitive). The secondary check `data[0].stops === 0` distinguishes between "no data exists" (2010, stops is null) and "race was stopped" (2021 Belgian, stops is explicitly 0). This is the key signal that determines which message shows.

#### Change 2: Build a set of actually-used compounds

Plain English: Before rendering the compound legend, scan through every driver's data and collect only the tyre types that someone actually used. Ignore any "Unknown" entries.

```typescript
// frontend/app/components/StrategyPanel.tsx:61-68

// Find which compounds are actually used (for legend)
const usedCompounds = new Set<string>();
for (const entry of data) {
  for (const c of entry.compounds) {
    const upper = c.toUpperCase();
    if (upper !== "UNKNOWN") usedCompounds.add(upper);
  }
}
```

Technical detail: A `Set` is used because we only care about unique compound names. The double loop walks every driver's compound sequence and collects unique entries. `"UNKNOWN"` is excluded so it never appears in the legend. By uppercasing before comparing, we handle case inconsistencies between data sources (FastF1 returns "SOFT", the fallback returns "Unknown").

#### Change 3: Filter the legend by actual usage

Plain English: The legend used to show every compound except "Unknown" — which meant dry races showed Intermediate and Wet entries that nobody used. Now it only shows compounds from the set we just built.

```typescript
// Before (showed all compounds except UNKNOWN):
.filter(([k]) => k !== "UNKNOWN")

// After (shows only compounds actually used in this race):
.filter(([k]) => usedCompounds.has(k))
```

Technical detail: `COMPOUND_STYLES` is an object with keys `SOFT`, `MEDIUM`, `HARD`, `INTERMEDIATE`, `WET`, `UNKNOWN`. `Object.entries()` converts it to an array of `[key, value]` pairs. The old filter excluded only `UNKNOWN`, which meant all five real compounds always appeared. The new filter checks against `usedCompounds` — a dry race with only Soft, Medium, and Hard shows just those three in the legend.

---

## What Each Edge Case Looks Like Now

### 2010 Races (No Stint Data)

```
┌──────────────────────────────────────────┐
│                                          │
│    No tyre strategy data available        │
│    Detailed stint data is not available   │
│    for this race.                        │
│                                          │
└──────────────────────────────────────────┘
```

Clean, centered, informative. No question marks. The user understands this is a data limitation, not a bug.

### 2021 Belgian GP (Stopped Race)

```
┌──────────────────────────────────────────┐
│                                          │
│    No tyre strategy data available        │
│    This race was shortened or stopped    │
│    early — no pit stops were made.       │
│                                          │
└──────────────────────────────────────────┘
```

Different message acknowledges the specific situation. A fan who remembers the infamous 2021 Belgian GP immediately understands.

### 2023 British GP (Normal Race)

```
  Legend:  S Soft   M Medium   H Hard

  ┌────────────────────────────────────┐
  │  VER   M → S                1-stop │
  │  NOR   M → H                1-stop │
  │  HAM   M → S                1-stop │
  │  ...                               │
  └────────────────────────────────────┘
```

No Intermediate or Wet entries in the legend even though the style definitions include them. The legend matches reality.

---

## The Data Flow: Backend to Frontend

Understanding where the "Unknown" compounds come from and why helps explain the fix:

```
Backend Pipeline
────────────────

get_strategy_breakdown(year, track)
        │
        ├── Load index: results + stints
        │
        ├── Has stints.json for this driver?
        │     ├── YES → compounds from stints, stops = stints - 1
        │     │         e.g. ["MEDIUM", "SOFT"], stops=1
        │     │
        │     └── NO → Fallback to dominant compound
        │               compounds=["Unknown"], stops=None
        │
        └── Return array of {driver, team, stops, compounds, label}


Frontend Pipeline
─────────────────

StrategyPanel receives data array
        │
        ├── ALL unknown? → Show empty state message
        │     ├── stops === 0 → "Race was shortened"
        │     └── stops === null → "Data not available"
        │
        ├── Build usedCompounds set (excluding UNKNOWN)
        │
        ├── Render legend (filtered by usedCompounds)
        │
        └── Render driver rows with compound chips
```

The fix is entirely in the frontend. The backend data format didn't change — `compounds: ["Unknown"]` and `stops: null` are valid responses. The frontend just needed to interpret them meaningfully instead of rendering them literally as "?" chips.

---

## The UX Design Pattern: Contextual Empty States

### What Makes a Good Empty State

Empty states aren't just "no data" messages. A good empty state answers three questions:

1. **What's missing?** — "No tyre strategy data available"
2. **Why is it missing?** — "This race was shortened or stopped early"
3. **Is it my fault?** — Implicitly no, through the phrasing. It's a data limitation or a real-world event, not a user error.

### Why Two Different Messages

The fix distinguishes between two fundamentally different situations:

| Signal | Meaning | Message |
|--------|---------|---------|
| `stops === null` | Data never existed for this era | "Detailed stint data is not available for this race." |
| `stops === 0` | Data exists but race had no stops | "This race was shortened or stopped early — no pit stops were made." |

Using `null` vs `0` as the discriminator is important. In JavaScript/TypeScript:
- `null` means "this value was never set" — the backend couldn't determine stops
- `0` means "this value is explicitly zero" — the backend determined there were zero stops

This distinction flows naturally from the backend: when stints.json exists but has no entries, `stops` = `len(stints) - 1` = `-1`... actually no. When stints exist but all compounds are UNKNOWN (like the 2021 Belgian GP), `stops` = `len(stints) - 1` = 0 because there's one "stint" (the whole race on one set) with no stops.

When stints.json doesn't exist at all (2010), the fallback path sets `stops: None` (Python None → JSON null → TypeScript null).

### The Legend Filtering Pattern

```
BEFORE: Show everything possible → User guesses what's relevant
AFTER:  Show only what's real    → User sees exactly what happened
```

This is a common pattern called **data-driven UI filtering**. Instead of hardcoding which options to show, you derive the visible options from the actual data. Applied here:

```typescript
// Collect what's real
const usedCompounds = new Set<string>();
for (const entry of data) {
  for (const c of entry.compounds) {
    if (c.toUpperCase() !== "UNKNOWN") usedCompounds.add(c.toUpperCase());
  }
}

// Show only what's real
Object.entries(COMPOUND_STYLES)
  .filter(([k]) => usedCompounds.has(k))
```

This pattern scales automatically. If a wet race uses Intermediates and Wets, those appear in the legend. If a dry race only uses Soft and Medium, only those two show. No manual configuration needed.

---

## How It Connects to Other Concepts

- **Stint strategy pipeline (Phase 2)**: This is where `stints.json` was first created. Phase 6G handles the cases where that pipeline produces empty or unknown results.

- **Compound lookup (Phase 4A)**: The lookup table covers 2011-2017. Phase 6G reveals the gap — 2010 has no lookup coverage because Bridgestone (not Pirelli) supplied tyres that year.

- **Phase 6F (future)**: The planned fix for 2010-2011 data. When that phase scrapes formula1.com pit stop summaries and builds a Bridgestone nominations table, the "Data not available" empty state will naturally disappear for those races — no StrategyPanel changes needed.

- **Go Deeper accordion (Phase 6A)**: Strategy data lives behind an expandable "Strategy breakdown" section. The empty state appears when a user expands it for a problematic race — it needs to be clear enough to read once and understand immediately.

---

## Edge Cases & Gotchas

### 1. Case Sensitivity in Compound Names

In plain English: The backend returns compound names in different cases depending on the data source — FastF1 sends "SOFT", the fallback sends "Unknown" (title case).

Technical cause: Two different code paths produce compound strings. FastF1's stint data uses ALL CAPS. The fallback path in `get_strategy_breakdown()` uses `r.get("compound") or "Unknown"` which preserves whatever case the original data had.

How to avoid: Always uppercase before comparing: `c.toUpperCase() === "UNKNOWN"`. The fix does this consistently in both the `allUnknown` check and the `usedCompounds` builder.

### 2. Empty Arrays vs Unknown Arrays

In plain English: A driver could have `compounds: []` (empty list) or `compounds: ["UNKNOWN"]` (list with one unknown entry). Both mean "no real data" but they're structurally different.

Technical cause: Different error paths produce different shapes. If a driver has no stints at all, compounds might be empty. If they have a fallback stint, it's `["Unknown"]`.

How to avoid: The `allUnknown` check handles both: `e.compounds.length === 0 || e.compounds.every(...)`. The OR catches empty arrays, the every() catches unknown-filled arrays.

### 3. Mixed Data Races

In plain English: What if some drivers have real data and others have unknown? This doesn't happen currently but could if partial stint data were added.

How it's handled: `data.every()` only triggers the empty state if ALL entries are unknown. If even one driver has real compounds, the normal grid renders. Drivers with unknown data would show "?" chips in their rows — acceptable because the grid itself is useful.

---

## Quick Reference

### Decision Tree

```
StrategyPanel receives data
        │
        ├── All compounds unknown?
        │     ├── YES, stops === 0 → "Race was shortened/stopped"
        │     ├── YES, stops !== 0 → "Data not available"
        │     └── NO → Render normal grid
        │
        └── Normal grid:
              ├── Build usedCompounds set
              ├── Legend: show only usedCompounds
              └── Rows: compound chips + stops badge
```

### Key Code Locations

| What | Where |
|------|-------|
| Strategy data generation | `backend/core/insights.py:187` — `get_strategy_breakdown()` |
| Empty state + legend fix | `frontend/app/components/StrategyPanel.tsx:42-68` |
| Compound style definitions | `frontend/app/components/StrategyPanel.tsx:9-16` |
| Stint data loading | `backend/core/indexer.py` — `load_race_index()` stints key |

### The Three Problem Races/Eras

| Race/Era | compounds | stops | Message shown |
|----------|-----------|-------|---------------|
| 2010 (all 19 races) | `["Unknown"]` | `null` | "Detailed stint data is not available" |
| 2021 Belgian GP | `["UNKNOWN"]` | `0` | "Race was shortened or stopped early" |
| All others | Real data | 1-3 | Normal compound grid |

---

*Generated: 2026-03-19 | Project: Raceday | Phase 6G — Strategy Tab Cleanup*
*Files referenced: frontend/app/components/StrategyPanel.tsx, backend/core/insights.py*
