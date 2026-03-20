# Phase 6D — Auto-Generated Race Narrative and Tagline Engine

> Turning raw race data (positions, pit stops, weather) into flowing prose and one-line hooks — automatically, for every race from 2010 to 2024.

---

## In Plain English

Imagine you're a sports journalist who has to write a short article about every F1 race in the last 15 years. That's about 330 races. For each one, you'd look at who won, where they started, what the weather was like, who gained the most positions, what tyre strategy the winner used, and how many cars retired. Then you'd write 4-5 paragraphs telling the story. You'd also write a single catchy headline — "Rain rewrote the script at Silverstone" or "The race nobody finished unscathed."

That's exactly what Phase 6D built. Two Python functions that look at the same raw data a journalist would look at, and produce the same kind of output: a one-line tagline (the headline) and a multi-paragraph narrative (the article). No AI language model involved — just if/then rules that mimic how a human writer would frame a race based on its key facts.

The tagline works like a newspaper editor choosing a headline. The editor scans the facts and picks the most dramatic angle: was it chaos? (5+ retirements) Was it a comeback? (winner from P6+) Was it dominant? (pole to win) Was it a team sweep? (1-2 finish). The first dramatic fact wins the headline. The narrative works differently — it tells the whole story in order: who won, what the conditions were, who gained the most, what strategy was used.

## What Is Data-to-Narrative Generation? (The Technical View)

Data-to-narrative (also called "data-to-text" or "template-based generation") is a technique where structured data is transformed into natural language using rules, templates, and conditional logic. It's one of the oldest forms of automated writing — weather forecasts, financial reports, and sports recaps have used it since the 1990s.

The approach is fundamentally different from LLM-based text generation. An LLM takes a prompt and generates text probabilistically — it might produce different output each time. A rule-based narrative engine takes structured input and produces deterministic output — the same data always produces the same text. This makes it predictable, testable, and fast (no API calls, no inference time, no cost).

Raceday uses a hybrid approach: conditional logic selects which narrative templates to use (if the winner started from pole, use the "dominance" opener; if they started from P6+, use the "comeback" opener), and f-string interpolation fills in the specific details (driver names, positions, temperatures). The result reads like natural prose because each template was hand-written to sound natural, but the selection is mechanical.

## The Problem It Solves

### Before Phase 6D

The race page had no narrative. Users saw:
- A podium card (who finished P1, P2, P3)
- Key moment cards (auto-detected highlights)
- A strategy narrative (hidden behind the Strategy tab, rarely found)

The data was there but scattered. A user had to mentally piece together the story: "OK, Verstappen won from pole, it was dry, Perez gained 9 places... what does that mean?" The site showed *what happened* but never explained *the story of what happened*.

The strategy narrative (`get_strategy_narrative()`) existed but was focused only on tyre strategy — pit stops, undercuts, compound choices. It didn't mention who won, what the weather was, or who gained the most positions. It was a specialist view, not a story.

### After Phase 6D

Every race has:
1. **A tagline** — one sentence that frames the entire race ("The day Max Verstappen defied a P6 start")
2. **A narrative** — 4-5 paragraphs covering winner + podium, weather + retirements, biggest mover, strategy, and race control

A beginner reads the tagline and immediately knows the angle. They read the narrative and understand the race. No mental assembly required. The data serves the story — the story is never sacrificed for more data.

## How It Works

### The Tagline: Priority-Based Pattern Matching

Plain English: The tagline function checks the race data for dramatic facts in order of importance, and the first one it finds becomes the headline.

The priority order is:

```
1. Chaos      (5+ DNFs)           → "The race nobody finished unscathed"
2. Rain       (wet conditions)     → "Rain rewrote the script at {track}"
3. Comeback   (winner from P6+)   → "The day {name} defied a P{grid} start"
4. Dominance  (pole to win, ≤2 DNFs) → "A masterclass from lights to flag"
5. Team 1-2   (same team P1+P2)   → "{team}'s day — everyone else raced for third"
6. Damp       (mixed conditions)   → "Changeable skies shook up the order"
7. Overtake   (winner from P2-P5) → "{name} made the decisive move from P{grid}"
8. Fallback   (none of the above)  → "{name} took the victory"
```

This priority order is a design choice, not a technical constraint. Chaos beats everything because it's the most unusual. Rain beats comeback because weather affects the entire field. Comeback beats dominance because overcoming adversity is more dramatic than controlling from the front. The fallback only fires when nothing dramatic happened — a rare, clean, front-of-grid win.

**`backend/core/insights.py:generate_race_tagline()`**

Plain English: This function reads the race data, checks each dramatic pattern in order, and returns the first matching tagline.

```python
def generate_race_tagline(year: int, track: str) -> str | None:
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data.get("weather", {})
    condition = weather.get("condition", "dry")

    finished = [r for r in results if r.get("finish_position") is not None]
    finished_sorted = sorted(finished, key=lambda r: r["finish_position"])
    dnf = [r for r in results
           if r["status"] not in ("Finished", "Lapped")
           and not r["status"].startswith("+")]

    winner = finished_sorted[0]
    w_name = _DRIVER_NAMES.get(winner["driver"], winner["driver"])
    w_grid = winner.get("grid_position")
    w_team = winner["team"]

    team_12 = (
        len(finished_sorted) >= 2
        and finished_sorted[0]["team"] == finished_sorted[1]["team"]
    )

    # Priority cascade — first match wins
    if len(dnf) >= 5:
        return "The race nobody finished unscathed"
    if condition == "wet":
        return f"Rain rewrote the script at {track.replace(' Grand Prix', '')}"
    if w_grid and w_grid >= 6:
        return f"The day {w_name} defied a P{w_grid} start"
    if w_grid and w_grid == 1 and len(dnf) <= 2:
        return "A masterclass from lights to flag"
    if team_12:
        return f"{w_team}'s day — and everyone else was racing for third"
    # ... more patterns, then fallback
```

Technical detail: The key design decision is the `dnf` filter. The original code counted every non-"Finished" status as a retirement, but "Lapped" drivers (who crossed the finish line but were a lap behind) were being counted too. This made 2023 Monaco show 12 "retirements" when only 2 actually retired. The fix excludes "Lapped" and statuses starting with "+" (like "+1 Lap") from the DNF count.

The `early return` pattern means the function exits as soon as it finds a match. This naturally implements priority — chaos is checked first, fallback is last. If you wanted to change the priority (e.g., make comeback wins more important than rain), you'd just swap the order of the if-blocks.

### The Narrative: Paragraph-by-Paragraph Assembly

Plain English: The story function builds the narrative one paragraph at a time, each covering a different aspect of the race, then returns them all as a list.

The paragraph structure:

```
Paragraph 1: The headline — who won, from where, who else was on the podium
Paragraph 2: Weather and conditions — dry/wet/damp, temperature, retirements
Paragraph 3: The biggest mover — who gained the most positions (if 4+)
Paragraph 4: Strategy — winner's tyre sequence, field strategy split
Paragraph 5: Race control — dominant vs contested (conditional)
```

Not every paragraph appears in every race. If nobody gained 4+ positions, paragraph 3 is skipped. If there's no stint data, paragraph 4 is skipped. The narrative adapts to the data available.

**`backend/core/insights.py:get_race_story()`**

Plain English: This function assembles the race narrative by examining results, weather, positions, and strategy data, then generating a paragraph for each aspect.

```python
def get_race_story(year: int, track: str) -> dict | None:
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data.get("weather", {})
    stints_by_driver = data.get("stints") or {}

    condition = weather.get("condition", "dry")
    temp = weather.get("avg_air_temp")

    finished_sorted = sorted(
        [r for r in results if r.get("finish_position") is not None],
        key=lambda r: r["finish_position"]
    )
    retirements = [r for r in results
                   if r["status"] not in ("Finished",)
                   and not r["status"].startswith("+")]

    winner = finished_sorted[0]
    paragraphs = []

    # --- Paragraph 1: The headline ---
    w_name = _dn(winner["driver"])
    w_grid = winner.get("grid_position")

    if w_grid and w_grid == 1:
        opener = f"{w_name} converted pole position into victory"
    elif w_grid and w_grid <= 3:
        opener = f"{w_name} took the win from P{w_grid} on the grid"
    elif w_grid and w_grid > 5:
        opener = f"{w_name} stormed from P{w_grid} to win"
    else:
        opener = f"{w_name} claimed victory"

    opener += f" for {winner['team']}."
    # ... add podium context, then append

    # --- Paragraph 2: Weather ---
    # ... condition-based template selection

    # --- Paragraph 3: Biggest mover ---
    # ... find max(grid - finish_position), threshold of 4+

    # --- Paragraph 4: Strategy ---
    # ... winner's stint sequence, field strategy split

    return {
        "narrative": paragraphs,
        "weather": condition,
        "retirements": len(retirements),
        "laps": total_laps if total_laps > 0 else None,
    }
```

Technical detail: The paragraph 1 opener uses a conditional chain based on the winner's grid position. This is the core narrative technique: **the same fact (who won) is phrased differently based on context**. A pole-to-win is "converted pole position into victory." A mid-grid start is "took the win from P3." A comeback is "stormed from P6 to win." Same data, different framing.

The biggest mover calculation (paragraph 3) uses `grid - finish_position` as the delta. A positive delta means gaining places (started P15, finished P6 = gained 9). The threshold of 4+ ensures only genuinely notable drives are mentioned — gaining 1-3 positions is normal pit strategy, gaining 4+ is a story.

### The API Endpoint

Plain English: One HTTP endpoint returns both the tagline and the narrative, so the frontend makes a single call to get everything.

```python
@app.get("/races/{year}/{track}/story")
def race_story(year: int, track: str):
    tagline = insights.generate_race_tagline(year, track)
    story = insights.get_race_story(year, track)
    if story is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return {"tagline": tagline, **story}
```

Technical detail: The `**story` spread operator merges the story dict into the response. So the final JSON contains `tagline`, `narrative`, `weather`, `retirements`, and `laps` — all at the top level. The tagline is generated separately because it reads from the index independently (it could return a tagline even if the story function fails, though in practice they use the same data).

### The Frontend Component

Plain English: A React component that fetches the story endpoint and renders the tagline, narrative paragraphs, and metadata badges.

**`frontend/app/components/RaceStory.tsx`**

```tsx
export default function RaceStory({ year, track }: { year: string; track: string }) {
  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/races/${year}/${encodeURIComponent(track)}/story`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [year, track]);

  if (loading) return <SkeletonLoader />;
  if (!data) return null;

  return (
    <div>
      {data.tagline && (
        <p className="text-sm italic text-zinc-400 mb-4">
          &ldquo;{data.tagline}&rdquo;
        </p>
      )}
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        The Race Story
      </p>
      <div className="space-y-3">
        {data.narrative.map((paragraph, i) => (
          <p key={i} className="text-sm text-zinc-300 leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>
      {/* Weather/DNF/laps badges */}
    </div>
  );
}
```

Technical detail: The tagline is rendered in italics with `&ldquo;` / `&rdquo;` (curly quotes) to give it a literary feel — like a quote on a movie poster. The `leading-relaxed` class on paragraphs adds extra line spacing (1.625 line-height) for readability. The badges at the bottom use `text-[10px]` (Tailwind arbitrary value for 10px font) — tiny, factual, non-intrusive.

The **tagline** is displayed in the race header, directly below the circuit name — it's the first thing a user reads before any data. It's styled as highlighted text (lighter colour on a subtle dark background pill) so it stands out from the header but doesn't compete with the race name. The tagline is fetched independently from the `/story` endpoint so it loads without blocking the main data.

The **narrative** (RaceStory component) is placed between Key Moments and Go Deeper in the race page scroll order.

```
2024
Bahrain Grand Prix
"A masterclass from lights to flag"    ← tagline (highlighted, in header)

THE RESULT
...
Key Moments
...
THE RACE STORY                         ← narrative (in main scroll)
...
Go Deeper
```

The tagline lives in `page.tsx` (race header), NOT in `RaceStory.tsx`. This separation means the tagline appears immediately at the top while the full narrative loads further down the scroll. The user reads the tagline, sees the podium, sees the highlights, THEN reads the full story — a natural reading flow.

## What We Built

### Overview

Phase 6D added three files and modified two:

| File | What it does |
|------|-------------|
| `insights.py` (modified) | `generate_race_tagline()` — priority-based one-line hook |
| `insights.py` (modified) | `get_race_story()` — multi-paragraph narrative assembly |
| `api.py` (modified) | `GET /races/{year}/{track}/story` — combined endpoint |
| `RaceStory.tsx` (new) | Frontend component rendering narrative + badges (tagline removed — moved to header) |
| `page.tsx` (modified) | Tagline in race header (highlighted pill), RaceStory between Key Moments and Go Deeper |

### Sample Outputs

**2023 Belgian GP (comeback win, damp):**
- Tagline: *"The day Max Verstappen defied a P6 start"*
- Narrative opens: "Max Verstappen (VER) stormed from P6 to win for Red Bull Racing..."

**2014 Australian GP (chaos, 8 DNFs):**
- Tagline: *"The race nobody finished unscathed"*
- Narrative: "...It was a brutal day for reliability — 8 drivers failed to reach the finish."

**2023 Bahrain GP (Red Bull 1-2):**
- Tagline: *"Red Bull Racing's day — and everyone else was racing for third"*

**2023 Monaco GP (pole-to-win, clean):**
- Tagline: *"A masterclass from lights to flag"*

### How the Pieces Connect

```
User opens race page
        │
        ├── page.tsx renders <RaceStory year="2023" track="British Grand Prix" />
        │
        ▼
RaceStory.tsx useEffect fires
        │
        ├── fetch("/races/2023/British Grand Prix/story")
        │
        ▼
api.py race_story()
        │
        ├── calls generate_race_tagline(2023, "British Grand Prix")
        │     └── reads index → checks priority patterns → returns tagline
        │
        ├── calls get_race_story(2023, "British Grand Prix")
        │     └── reads index → builds 4-5 paragraphs → returns narrative
        │
        ▼
Returns JSON: { tagline, narrative[], weather, retirements, laps }
        │
        ▼
RaceStory.tsx renders:
  "Max Verstappen took the victory"  ← tagline in italics
  THE RACE STORY                     ← heading
  [paragraph 1]                      ← winner + podium
  [paragraph 2]                      ← weather + retirements
  [paragraph 3]                      ← biggest mover
  [paragraph 4]                      ← strategy
  [DRY] [3 DNFs]                     ← metadata badges
```

## Common Patterns

### Pattern 1: Priority Cascade

What it's for: Choosing the most dramatic/important categorisation from multiple possible ones.

Many real-world categorisation problems have overlapping categories. A race can be *both* rainy *and* have a comeback winner. The priority cascade resolves this by checking conditions in order of drama/importance and returning on the first match.

```python
# Priority cascade — first match wins
if chaos_condition:
    return "chaos"
if weather_condition:
    return "weather"
if comeback_condition:
    return "comeback"
return "default"
```

When to use: Any time you need to classify something into exactly one category from multiple overlapping options. Alert severity levels, email subject lines, notification types.

### Pattern 2: Conditional Template Selection

What it's for: Generating different natural-language phrasings for the same underlying fact based on context.

```python
if grid == 1:
    text = f"{name} converted pole into victory"
elif grid <= 3:
    text = f"{name} took the win from P{grid}"
elif grid > 5:
    text = f"{name} stormed from P{grid} to win"
else:
    text = f"{name} claimed victory"
```

When to use: Any time you're generating human-readable text from data. The key insight is that the same fact ("X won the race") should be phrased differently depending on context. "Converted pole" implies dominance. "Stormed from P6" implies drama. Same data, different stories.

### Pattern 3: Paragraph Assembly with Optional Sections

What it's for: Building a multi-part text where some sections only appear when the data warrants them.

```python
paragraphs = []
paragraphs.append(always_present_paragraph)

if condition_met:
    paragraphs.append(optional_paragraph)

if other_data_exists:
    paragraphs.append(another_optional_paragraph)

return paragraphs
```

When to use: Email bodies, report generation, notification content — anywhere the output length should adapt to the input complexity. A race with no notable movers and no stint data gets a shorter story. A chaotic wet race with comebacks and strategy splits gets a longer one.

## Edge Cases & Gotchas

1. **"Lapped" drivers counted as retirements**
   In plain English: Drivers who finish the race but are a lap behind the leader have status "Lapped" in the data. The original code counted them as retirements, making almost every race look like chaos.
   Technical cause: The retirement filter `status not in ("Finished",)` didn't account for "Lapped" as a valid finishing status.
   How to avoid: The tagline function now explicitly excludes "Lapped" and "+N Lap" statuses from the DNF count. The narrative function still counts them in `retirements` (less critical since the narrative mentions specific names rather than triggering a binary threshold).

2. **Temperature encoding in narrative**
   In plain English: The temperature value shows up with garbled characters in some terminals (showing "22Â°C" instead of "22°C").
   Technical cause: The degree symbol (°) is a multi-byte UTF-8 character. When the Python string passes through the JSON serialiser and then through some terminal displays, the encoding can get mangled.
   How to avoid: The frontend renders the narrative as plain text, and modern browsers handle UTF-8 correctly. This is only a terminal/curl display issue, not a real bug.

3. **No stint data for some races**
   In plain English: Pre-2011 races and some edge cases don't have tyre stint data. The strategy paragraph won't appear for these races.
   Technical cause: The `stints_by_driver` dict is empty for races indexed without pit stop data.
   How to avoid: The narrative function checks `if stints_by_driver:` before generating the strategy paragraph. Missing data means a shorter story, not a crash.

4. **"0-stop" strategies in the narrative**
   In plain English: The strategy paragraph sometimes mentions "0-stop" strategies, which seems wrong — every driver pits at least once.
   Technical cause: Some drivers' stint data has only one entry (one continuous stint), meaning zero pit stops were recorded. This can happen with incomplete data or drivers who retired before pitting.
   How to avoid: Could filter out 0-stop entries from the strategy split calculation. Low priority since it only affects the "X-stop and Y-stop strategies" summary line.

## How It Connects to Other Concepts

- **Phase 5B (Strategy Story)**: The existing `get_strategy_narrative()` produced a detailed multi-section strategy story. Phase 6D's `get_race_story()` is broader — it covers the whole race, with strategy as one paragraph. The strategy narrative still exists inside Go Deeper for fans who want the full breakdown.

- **Phase 5C (Key Moments)**: Key moments are individual highlights (biggest gainer, undercuts, close battles). The race story is a flowing narrative that connects these into a coherent story. They complement each other: moments are scannable, the story is readable.

- **Phase 6E (Pattern Matcher)**: The tagline and story tell you *what happened*. The pattern matcher will tell you *what history says about it* — "In 3 previous dry Silverstone races, pole sitters won 2 out of 3 times." Together they create the full picture: narrative + historical context.

- **Phase 6A (Go Deeper)**: The race story sits in the main scroll flow (visible to everyone). The detailed strategy breakdown sits inside Go Deeper (hidden until expanded). This is the progressive disclosure principle in action — beginners get the story, experts get the data.

## Going Deeper

### Sentiment-Aware Narrative

The current narrative is factual — it reports what happened. A future improvement could add emotional language based on the context: "a gutsy drive" for a big comeback, "a processional race" for a dominant pole-to-win with no overtakes, "heartbreak for Leclerc" when a driver leads most of the race and loses on the last lap. This would require tracking lead changes and race incidents, which the current index data doesn't include.

### LLM-Enhanced Summaries

The rule-based approach produces consistent, predictable output. An LLM could produce more varied, natural-sounding prose — but at the cost of unpredictability, latency (API call per race), and potential hallucination. A hybrid approach could work: generate the factual narrative with rules (guaranteed accuracy), then optionally pass it through an LLM for style polish (cached per race, regenerated rarely).

### Comparative Taglines

The current tagline only looks at the single race. A more powerful version could compare against the season: "Verstappen's 7th win in a row" or "The first non-Red Bull victory since March." This would require loading season-level data in the tagline function, which is currently scoped to a single race for performance.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|-----------------------|-------------------|
| Tagline | A one-sentence hook for the race | String generated by priority-based pattern matching |
| Narrative | The full race story as paragraphs | List of strings assembled from conditional templates |
| Priority cascade | Check the most dramatic fact first | Series of if/return blocks, first match exits |
| Template selection | Pick the right phrasing for the context | Conditional branches producing different f-strings |
| DNF | Did Not Finish — driver retired from the race | Status not in ("Finished", "Lapped", "+N Lap") |

### Tagline Patterns Quick Reference

| Pattern | Condition | Example output |
|---------|-----------|---------------|
| Chaos | 5+ DNFs | "The race nobody finished unscathed" |
| Rain | wet condition | "Rain rewrote the script at Silverstone" |
| Comeback | winner grid P6+ | "The day Verstappen defied a P6 start" |
| Dominance | pole to win, ≤2 DNFs | "A masterclass from lights to flag" |
| Team 1-2 | same team P1+P2 | "Red Bull's day — everyone raced for third" |
| Damp | damp condition | "Changeable skies shook up the order" |
| Overtake | winner grid P2-P5 | "Verstappen made the decisive move from P2" |
| Fallback | none of above | "Max Verstappen took the victory" |

### API Response Shape

```json
{
  "tagline": "A masterclass from lights to flag",
  "narrative": [
    "Paragraph 1: winner + podium",
    "Paragraph 2: weather + retirements",
    "Paragraph 3: biggest mover (optional)",
    "Paragraph 4: strategy (optional)",
    "Paragraph 5: race control (optional)"
  ],
  "weather": "dry",
  "retirements": 2,
  "laps": 52
}
```

---

*Generated: 2026-03-18 | Project: Raceday | Phase 6D complete | Files: insights.py, api.py, RaceStory.tsx, page.tsx*

---

## Post-Phase Updates (2026-03-20)

### Tagline Moved to Race Header
The tagline was originally rendered inside `RaceStory.tsx`, buried below Key Moments. It's now displayed **directly below the circuit name** in the race page header (`page.tsx`), styled as a highlighted pill (lighter text on `bg-zinc-800/60` rounded background). This makes it the first thing users read — setting the emotional tone before any data appears.

The tagline is fetched independently from the `/story` endpoint so it loads without blocking the main data. `RaceStory.tsx` no longer renders the tagline (removed to avoid duplication).

```
2024
Bahrain Grand Prix
"A masterclass from lights to flag"    ← highlighted tagline

THE RESULT
...
```

*Updated: 2026-03-20 | Files: page.tsx (tagline in header), RaceStory.tsx (tagline removed)*
