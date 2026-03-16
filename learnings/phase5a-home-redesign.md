# Phase 5A — Home Page Redesign (Built)

> Turning Raceday's home page from a plain list of race names into a magazine-style layout with champion year cards, a 2-column race grid, and weather filters.

---

## In Plain English

Before this phase, the Raceday home page was a list of race names — like a file browser. You saw "Bahrain Grand Prix", "Saudi Arabian Grand Prix", "Australian Grand Prix" one after another with a small "indexed" badge. No visual hierarchy, no context, no sense of what happened in each race. You had to click into every single race to learn anything about it.

Now it looks like a sports magazine. At the top, a scrollable row of year cards tells you the story of each season at a glance — "2023: Verstappen, dominant season" with a blue team-colour dot, "2021: Verstappen, title decided last race." Below that, a grid of race cards shows the winner, whether it rained, and how many laps — all before you click anything. You can filter by weather to see only wet races or only dry ones.

The difference is like going from a spreadsheet to a dashboard. The data is the same. The presentation tells a story.

---

## What Was Built

### New Backend: Season Summaries

**`backend/core/insights.py: get_season_summary(year)`**

Plain English: Takes a year and returns a one-liner about who won and how dominant they were.

```python
def get_season_summary(year: int) -> dict | None:
    standings = get_championship_standings(year)
    if not standings:
        return None

    leader = standings[0]
    wins = leader["wins"]
    races = leader["races"]

    # Auto-generate tagline based on dominance
    if wins >= races * 0.8:
        tagline = "dominant season"
    elif wins >= races * 0.6:
        tagline = f"{wins} wins"
    # ...

    # Check if it was a close fight
    if len(standings) >= 2:
        gap = leader["points"] - standings[1]["points"]
        if gap <= 10 and races >= 10:
            tagline = "title decided last race"

    return {
        "year": year, "champion": driver, "team": team,
        "wins": wins, "races": races, "tagline": tagline,
    }
```

Technical detail: The tagline generator uses thresholds — 80%+ win rate is "dominant", a points gap of 10 or less with 10+ races is "title decided last race." This produces different taglines for different seasons automatically. `get_all_season_summaries()` calls this for 2024 down to 2010 and returns the full list.

**Results:**
```
2024: VER — 9 wins
2023: VER — dominant season
2022: VER — 15 wins
2021: VER — title decided last race
2020: HAM — 11 wins
2010: VET — 256pts
```

### Extended Race List

**`backend/core/insights.py: get_season_races(year)` — extended**

Plain English: The race list now includes who won, what the weather was like, and how many laps — not just the race name and indexed status.

For each indexed race, the function:
1. Loads the race index from disk
2. Finds the P1 finisher → `winner` + `winner_team`
3. Reads the weather condition → `weather` ("dry"/"wet"/"damp")
4. Calculates total laps from either `total_laps` field (Jolpica) or stint data (FastF1)

**The total_laps bug:** First attempt used `max(r.get("total_laps") or r.get("finish_position") or 0)` which fell back to finish position (1-20) when `total_laps` was missing. Every FastF1 race showed "20 laps." Fixed by checking `total_laps` explicitly, then falling back to stint data's `lap_end`.

### API Endpoint

```
GET /seasons/summary → [{year, champion, team, wins, races, tagline}, ...]
GET /races/{year} → [{round, name, location, ..., winner, weather, total_laps}, ...]
```

---

## Frontend: The Year Cards

### Scrollable Row

Plain English: A horizontal strip of cards you can scroll sideways, one per season, showing the champion's name with their team colour.

```typescript
<div className="mb-8 overflow-x-auto pb-2 -mx-6 px-6">
  <div className="flex gap-3 min-w-max">
    {seasons.map((s) => (
      <button
        key={s.year}
        onClick={() => setYear(s.year)}
        className={`shrink-0 rounded-lg px-5 py-4 text-left transition-all ${
          s.year === year
            ? "bg-zinc-900 border-2 border-red-500 shadow-lg shadow-red-500/10"
            : "bg-zinc-900 border-2 border-transparent hover:border-zinc-700"
        }`}
        style={{ minWidth: "160px" }}
      >
        <p className="text-2xl font-bold text-white">{s.year}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={`w-2 h-2 rounded-full ${TEAM_COLOR[s.team] || "bg-zinc-400"}`} />
          <span className="text-sm text-zinc-300">{s.champion}</span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{s.tagline}</p>
      </button>
    ))}
  </div>
</div>
```

**Key CSS patterns:**

- `overflow-x-auto` — enables horizontal scrolling when content overflows
- `min-w-max` — prevents the flex container from wrapping; forces single row
- `-mx-6 px-6` — extends the scroll area edge-to-edge while keeping content padded
- `shrink-0` — prevents cards from compressing when space is tight
- `border-red-500 shadow-red-500/10` — selected year gets a red border with a subtle red glow

**Team colour mapping:**

```typescript
const TEAM_COLOR: Record<string, string> = {
  "Red Bull Racing": "bg-blue-500",
  "Mercedes": "bg-emerald-400",
  "Ferrari": "bg-red-500",
  "McLaren": "bg-orange-400",
};
```

A small coloured dot next to the champion's name instantly tells you which team they drove for. Colours match official F1 team branding.

---

## Frontend: The Race Cards Grid

### 2-Column Layout

Plain English: Races display as cards in a two-column grid instead of a single-column list. Each card shows the round, name, location, winner, weather, and lap count.

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  {filtered.map((race) => (
    <RaceCard key={race.round} race={race} year={year} />
  ))}
</div>
```

`grid-cols-1 md:grid-cols-2` — single column on mobile, two columns on medium+ screens.

### RaceCard Component

Each card has two sections:
- **Top:** Round number (small uppercase), race name (bold), location
- **Bottom:** Winner with green P1 badge, weather badge (colour-coded), lap count, sprint indicator

```typescript
function RaceCard({ race, year }: { race: Race; year: number }) {
  // ...
  if (race.indexed) {
    return (
      <Link
        href={`/races/${year}/${encodeURIComponent(race.name)}`}
        className="block hover:scale-[1.02] transition-transform"
      >
        {content}
      </Link>
    );
  }
  return <div className="opacity-40 cursor-default">{content}</div>;
}
```

Indexed races are clickable links with a hover scale effect. Unindexed races are greyed out and not clickable.

### Weather Badges

```typescript
const WEATHER_BADGE = {
  dry:  { bg: "bg-amber-900/60", text: "text-amber-400", label: "DRY" },
  wet:  { bg: "bg-blue-900/60",  text: "text-blue-400",  label: "WET" },
  damp: { bg: "bg-cyan-900/60",  text: "text-cyan-400",  label: "MIXED" },
};
```

Each badge uses a translucent background (`/60` = 60% opacity) so it blends with the card rather than popping out harshly. The `damp` condition from the backend maps to "MIXED" on the frontend — friendlier label.

---

## Frontend: Weather Filter

### Filter Buttons

Plain English: Four buttons above the race grid let you filter by weather. Click WET and only wet races show. Click ALL to go back.

```typescript
const [weatherFilter, setWeatherFilter] = useState<string>("ALL");

// Map frontend labels to backend values
const weatherMap = { DRY: "dry", WET: "wet", MIXED: "damp" };
const filtered = weatherFilter === "ALL"
  ? races
  : races.filter((r) => r.weather === weatherMap[weatherFilter]);
```

The mapping between frontend labels ("MIXED") and backend values ("damp") lives here. If no races match the filter, a clean empty state message appears: "No wet races in the 2023 season."

---

## Data Flow

```
Browser loads home page
     │
     ├── fetch /seasons/summary (once)
     │     → 15 year cards with champion + tagline
     │
     └── fetch /races/{year} (on year change)
           │
           insights.get_season_races(2023)
           │
           ├── loader.get_season_schedule(2023)
           │     → 22 race events with dates + locations
           │
           └── For each indexed race:
                 indexer.load_race_index(2023, track)
                 │
                 ├── results → find P1 → winner + winner_team
                 ├── weather → condition (dry/wet/damp)
                 └── stints → max lap_end → total_laps
           │
           → [{round, name, location, winner, weather, total_laps, ...}]
     │
     Frontend renders:
     ├── Year cards row (scrollable)
     ├── Season header + weather filter buttons
     └── Race card grid (2-col, filtered)
```

---

## Edge Cases & Gotchas

**1. Server running old code**
In plain English: After changing backend code, the API still returned the old response (no winner/weather fields).
Cause: Server was started without `--reload`. Code changes don't take effect until restart.
Fix: Always use `--reload` flag during development: `python -m uvicorn backend.api:app --port 8080 --reload`

**2. Total laps fallback chain**
In plain English: FastF1 results don't have a `total_laps` field. First attempt fell back to `finish_position` which gave "20 laps" for every race.
Fix: Check `total_laps` field first (Jolpica has it), then fall back to stint data's `lap_end` (FastF1 has this). Never fall back to finish_position.

**3. Google OAuth secrets in repo root**
In plain English: When setting up Google OAuth, the credentials JSON file was downloaded to the project root. Almost got committed to GitHub.
Fix: Added `client_secret_*.json` to `.gitignore` before committing.

**4. Season summaries endpoint is slow on first call**
In plain English: `get_all_season_summaries()` calls `get_championship_standings()` for all 15 years, each of which scans every indexed race for that year. First call takes a few seconds.
Impact: Minor — only happens once, then the frontend caches the response in state. Could add server-side caching later if needed.

---

## Files Created and Modified

| File | Status | What changed |
|------|--------|-------------|
| `backend/core/insights.py` | **Modified** | Added `get_season_summary()`, `get_all_season_summaries()`, extended `get_season_races()` with winner/weather/laps |
| `backend/api.py` | **Modified** | Added `GET /seasons/summary` endpoint |
| `frontend/app/page.tsx` | **Rewritten** | Year cards, race grid, weather filter, team colours |
| `.gitignore` | **Modified** | Added `client_secret_*.json` |

---

## Quick Reference

### New API endpoints
```
GET /seasons/summary
→ [{year, champion, team, wins, races, tagline}, ...]

GET /races/{year}  (extended)
→ [{round, name, location, country, date, format, indexed,
    winner?, winner_team?, weather?, total_laps?}, ...]
```

### Tailwind patterns used
| Pattern | What it does |
|---------|-------------|
| `overflow-x-auto` | Horizontal scroll |
| `min-w-max` | Prevent flex wrap |
| `-mx-6 px-6` | Edge-to-edge scroll with padded content |
| `grid-cols-1 md:grid-cols-2` | Responsive 1→2 column grid |
| `hover:scale-[1.02]` | Subtle hover zoom |
| `bg-amber-900/60` | Translucent background |
| `border-red-500 shadow-red-500/10` | Selected state with glow |

### Key Terms
| Term | Plain English | Technical |
|------|---------------|-----------|
| Season summary | One-liner about each championship year | Auto-generated from standings data |
| Year card | Clickable card showing champion + tagline | Button with conditional border styling |
| Race card | Grid card with winner/weather/laps | Link component with hover scale |
| Weather filter | Buttons to show only dry/wet/mixed races | Client-side array filter on `weather` field |
| Tagline | Auto-description like "dominant season" | Generated from win rate + points gap thresholds |

---

*Updated: 2026-03-17 | Project: Raceday | Phase 5A complete | Files: insights.py, api.py, page.tsx*
