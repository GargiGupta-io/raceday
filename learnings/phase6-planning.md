# Phase 6 — Feature Upgrade Planning

> The roadmap for taking Raceday from a data viewer to an interactive F1intelligence platform — with circuit visuals, radio drama, strategy simulation, predictions, and data gap fixes.

---

## In Plain English

Phase 5 turned Raceday into a polished race analysis tool. You can see who won, what strategy they used, how the championship unfolded, and which teammates outperformed each other. But it's still fundamentally passive — you look at data and leave.

Phase 6 changes that. It adds layers that make people want to come back. A landing page that explains why this site exists. Circuit outlines that make race cards feel alive. A search bar so you can find any race instantly. Real pit stop data for the 2010-2011 seasons that are currently broken. Driver radio messages with sentiment analysis so you can hear the human drama behind the numbers. A prediction system where you test your knowledge against any race in history. And a strategy simulator where you drag tyre compounds onto a timeline and see if your strategy would've been faster than what the real drivers did.

Each sub-phase is independent — they can be built in any order, and each one adds value on its own. But together they transform Raceday from "a thing you read" into "a thing you use."

---

## Phase 6A — Landing Page + Year Bar Styling

### What it does

Right now the home page opens straight to "2024 Season — 22 Races" with no context. A new user has no idea what this site does or why they should care. Phase 6A adds a welcome section below the existing race cards that explains what Raceday is — both for beginners who've never watched F1 and for hardcore fans who want data depth.

### Layout

```
┌─────────────────────────────────────────┐
│  Year scrollbar (2010-2024)  ← restyled │
│  to blend with dark zinc theme          │
├─────────────────────────────────────────┤
│  Race cards grid (as-is)                │
│  [Bahrain] [Saudi] [Australia] ...      │
├─────────────────────────────────────────┤
│  WELCOME SECTION (new)                  │
│                                         │
│  "Raceday — F1 Race Intelligence"       │
│                                         │
│  For beginners: plain-English race      │
│  stories, strategy explanations, and    │
│  auto-generated insights that make F1   │
│  make sense.                            │
│                                         │
│  For hardcore fans: stint-level data,   │
│  undercut detection, championship       │
│  momentum, teammate head-to-heads,      │
│  and tyre strategy simulation.          │
│                                         │
│  Pick a year, pick a race, dive in.     │
└─────────────────────────────────────────┘
```

### Key decisions

- Year scrollbar and race cards stay at the top (user's request — the useful stuff first)
- Welcome section lives below, always visible (not just first visit)
- Year scrollbar gets restyled to blend with the dark zinc colour scheme instead of standing out

### Technical approach

- Modify `frontend/app/page.tsx` — add welcome section below race cards grid
- Restyle the year selector buttons to match `bg-zinc-800/900` tones
- No backend changes needed

---

## Phase 6B — Circuit Outlines on Race Cards

### What it does

Each race card on the home page gets a small circuit layout diagram — a line drawing showing the shape of the track. When you see the Monza card, you see that distinctive long oval with chicanes. When you see Monaco, you see the tight street circuit. It gives each race visual identity at a glance.

### Data source options

1. **FastF1 circuit data** — FastF1 has circuit coordinates (corner positions) that can be plotted as SVG paths. Available for all modern circuits.

2. **Community SVG packs** — Open-source F1 circuit SVGs exist on GitHub (e.g. `f1-circuits` repos). Pre-made, clean line art.

3. **Static SVG files** — Create/download ~35 circuit SVGs (covering all tracks 2010-2024), store them in `frontend/public/circuits/`. Map circuit name → SVG file.

### Recommended approach

Option 3 (static SVGs) is simplest and most reliable. Circuits don't change shape between years (with rare exceptions like Jeddah). One SVG per circuit, ~35 files, each a few KB. Display as a small faded outline in the corner of each race card.

### Visual design

```
┌──────────────────────────┐
│  🏆 VER                  │
│  British Grand Prix      │
│  52 laps · Dry     ╭──╮  │ ← circuit outline
│                    ╰──╯  │    faded, decorative
└──────────────────────────┘
```

The circuit outline should be:
- Monochrome (zinc-700 or similar)
- Small (fits in corner of card)
- Decorative, not interactive
- Low opacity so it doesn't compete with text

### Technical approach

- Download/create SVG files for all circuits
- Store in `frontend/public/circuits/` as `silverstone.svg`, `monza.svg`, etc.
- Create a circuit name → filename mapping
- Render as `<img>` or inline SVG in the race card component

---

## Phase 6C — Search Bar

### What it does

A search bar at the top of the home page that lets users quickly find any race, driver, or track. Type "Monaco" and see all Monaco GPs. Type "Hamilton" and see races Hamilton won. Type "wet" and see rain races.

### Search scope

What can be searched:
- **Race names** — "British Grand Prix", "Monaco", "Silverstone"
- **Driver names** — "Hamilton", "VER", "Verstappen"
- **Years** — "2019", "2010"
- **Conditions** — "wet", "rain"

### Technical approach

This is a frontend-only feature — filter the race list that's already loaded:

```typescript
// Simple client-side search across race data
const filtered = races.filter(race => {
  const q = query.toLowerCase();
  return race.name.toLowerCase().includes(q)
    || race.winner?.toLowerCase().includes(q)
    || race.weather?.toLowerCase().includes(q)
    || String(race.round).includes(q);
});
```

No new backend endpoint needed. The `/races/{year}` endpoint already returns all race data including winners and weather.

For cross-year search ("show me all Hamilton wins"), we'd need to search across all loaded seasons — could fetch all season data on first search or add a backend endpoint.

### UI placement

```
┌─────────────────────────────────────────┐
│  [🔍 Search races, drivers, tracks...  ]│
│                                         │
│  Year scrollbar (2010-2024)             │
│  Race cards grid                        │
└─────────────────────────────────────────┘
```

---

## Phase 6D — 2010-2011 Data Gap Fix

### The problem

The Strategy tab is broken for 2010 and partially broken for 2011:

| Year | Pit Stop Data | Compound Data | Strategy Tab Status |
|------|--------------|---------------|-------------------|
| 2010 | Missing — Ergast/Jolpica has no pit stops before 2012 | Missing — Bridgestone era, not in compound_lookup.py | Completely empty |
| 2011 | Missing — Ergast has no pit stops before 2012 | Available — already in compound_lookup.py | Partial (compounds known, no pit timing) |
| 2012+ | Available from Ergast/Jolpica | Available from compound_lookup.py | Working |
| 2018+ | Available from FastF1 | Available from FastF1 | Full data |

### The "?" marker

When the frontend's StrategyPanel renders a compound it doesn't recognise, it shows a grey `?` badge. This happens when:
- The compound string is `"UNKNOWN"` (backend fallback when compound lookup fails)
- The compound string doesn't match any of: SOFT, MEDIUM, HARD, INTERMEDIATE, WET

### Data sources for the fix

**Pit stop lap data (2010-2011):**
Formula1.com has official pit stop summaries with exact lap numbers for every driver, every race, going back to at least 2010:
```
https://www.formula1.com/en/results/{year}/races/{race_id}/{country}/pit-stop-summary
```
This gives us driver code, lap number, and stop number. We can scrape all 38 races (19 per year).

Verified working:
- 2010 Australian GP: Full pit stop data with lap numbers for all drivers
- 2010 Malaysian GP: Same — complete data available

**Compound data (2010 Bridgestone):**
Bridgestone used 4 dry compounds in 2010: Hard, Medium, Soft, Super Soft. Two were allocated per race. The allocations are documented:
- RaceFans article: "Bridgestone changes tyre choices for five rounds"
- Motorsport.com: "Bridgestone announces 2010 F1 tyre allocations"
- F1Network: "Bridgestone announces 2010 Tyre Specifications"

We can build a `_NOMINATIONS_2010` lookup table (like the existing `_NOMINATIONS` for 2011-2017) mapping each race to its two allocated compounds.

**Compound data (2011):**
Already covered in `compound_lookup.py` — the `_NOMINATIONS` dict has all 19 races.

### Implementation plan

1. **Scrape formula1.com** — Build a scraper that hits the pit stop summary page for each 2010 and 2011 race, extracts driver/lap/stop data, saves as JSON
2. **Build 2010 Bridgestone nominations** — Add `_NOMINATIONS_2010` to `compound_lookup.py` with the two compounds per race
3. **Update the indexer** — When re-indexing 2010/2011, use the scraped pit stop data instead of the (empty) Jolpica API
4. **Re-index all 2010 and 2011 races** — Rebuild stints.json with real data
5. **Fix remaining "?" markers** — Audit all years for any compound lookup failures

### Race IDs for formula1.com

The formula1.com pit stop URLs use race IDs (e.g. `/861/australia`). We'll need to map these for all 2010-2011 races. The IDs can be discovered by scraping the results page for each year.

---

## Phase 6E — Strategy Tab Cleanup

### What it does

Fix visual issues in the Strategy tab across all years:

1. **Empty state** — When a race has no stint data (currently shows nothing), show a clean message: "Strategy data is not available for this race"
2. **"?" markers** — After 6D fixes the data, any remaining unknowns should show "Unknown compound" instead of bare "?"
3. **Story mode fallback** — When narrative generation fails (no stint data), show a meaningful message instead of "No strategy narrative available"
4. **Data mode layout** — When stint data is partial (some drivers have data, others don't), handle gracefully instead of showing gaps

### Technical approach

Mostly frontend changes in StrategyPanel.tsx, StrategyStory.tsx, and StrategyKey.tsx. No major backend work — the backend already returns appropriate fallbacks.

---

## Phase 6F — Radio Sentiment + Audio Playback

### What it does

A new "Radio" tab on the race page showing the most emotionally significant team radio messages from the race. Each message shows the transcript, which lap it happened on, a sentiment tag (frustrated, confident, panicked, satisfied), and a small speaker icon to play the original audio clip.

### The pipeline

```
OpenF1 API ──→ Audio URLs ──→ Whisper ──→ Sentiment Model ──→ Frontend
(team_radio)    (MP3 files)    (speech     (tag emotion)       (Radio tab)
                                to text)
```

### Step 1 — Fetch audio clips from OpenF1

The OpenF1 API has a `/team_radio` endpoint:
```
GET https://api.openf1.org/v1/team_radio?session_key={key}
```

Returns:
```json
{
  "date": "2023-07-09T14:23:45.000Z",
  "driver_number": 1,
  "meeting_key": 1217,
  "recording_url": "https://livetiming.formula1.com/static/2023/..."
}
```

**Availability:** 2023 onwards only. Not every message — F1 selects which ones to broadcast (typically 10-20 per driver per race, biased toward interesting ones).

**Session key mapping:** We need to map our year/track format to OpenF1's `meeting_key` and `session_key`. The OpenF1 `/meetings` and `/sessions` endpoints provide this lookup.

### Step 2 — Transcribe with Whisper

OpenF1 gives audio, not text. We run each clip through OpenAI's Whisper model:

```python
import whisper

model = whisper.load_model("base")  # or "small" for better accuracy

def transcribe_radio(audio_path: str) -> str:
    result = model.transcribe(audio_path)
    return result["text"]
```

**Model size tradeoffs:**
- `tiny` — fastest, ~70% accuracy on F1 radio (noisy, accented)
- `base` — good balance, ~80% accuracy
- `small` — better, ~85% accuracy, slower
- `medium` — best practical option, ~90% accuracy

F1 radio is challenging for speech-to-text: wind noise, engine sounds, radio distortion, diverse accents (Dutch, Finnish, Spanish, British, Australian). The `small` or `medium` model is recommended.

**Processing time:** ~50-100 clips per race. With `base` model: ~2-5 minutes per race on a modern CPU. After first transcription, results are cached to disk.

### Step 3 — Sentiment analysis

Three approaches, from simple to complex:

**Option 1 — Keyword rules (simplest, no dependencies)**

```python
FRUSTRATED_WORDS = ["no", "why", "terrible", "broken", "gone", "stupid", "ridiculous"]
CONFIDENT_WORDS = ["great", "let's go", "amazing", "perfect", "brilliant", "good pace"]
PANICKED_WORDS = ["problem", "losing", "can't", "help", "smoke", "fire"]

def tag_sentiment(text: str) -> str:
    text_lower = text.lower()
    scores = {
        "frustrated": sum(1 for w in FRUSTRATED_WORDS if w in text_lower),
        "confident": sum(1 for w in CONFIDENT_WORDS if w in text_lower),
        "panicked": sum(1 for w in PANICKED_WORDS if w in text_lower),
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "neutral"
```

Pros: No ML dependencies, fast, deterministic.
Cons: Misses nuance. "The tyres are fine" and "the tyres are gone" both match "tyres" but mean opposite things.

**Option 2 — Pre-trained sentiment model (better accuracy)**

```python
from transformers import pipeline

classifier = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")

def tag_sentiment(text: str) -> str:
    result = classifier(text)[0]
    # Map POSITIVE/NEGATIVE to F1-specific labels
    if result["label"] == "NEGATIVE" and result["score"] > 0.8:
        return "frustrated"
    elif result["label"] == "POSITIVE" and result["score"] > 0.8:
        return "confident"
    return "neutral"
```

Pros: Better at understanding context.
Cons: Requires `transformers` + `torch` (~2GB install). Binary positive/negative, not F1-specific.

**Option 3 — Claude API (best accuracy, costs money)**

```python
def tag_sentiment(text: str, context: str) -> dict:
    response = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        messages=[{
            "role": "user",
            "content": f"This is an F1 driver radio message during a race. "
                       f"Context: {context}. "
                       f"Message: \"{text}\". "
                       f"Classify the emotion: frustrated, confident, panicked, satisfied, or neutral. "
                       f"Reply with just the emotion and a one-sentence explanation."
        }]
    )
    return parse_response(response)
```

Pros: Best accuracy, understands F1 context, can explain why.
Cons: Costs per call (~$0.001 per message with Haiku), needs API key.

**Recommended:** Start with Option 1 (keyword rules) to get the feature working, then upgrade to Option 2 or 3 later.

### Step 4 — Frontend Radio tab

```
┌─────────────────────────────────────────┐
│  RADIO MESSAGES — 2023 British GP       │
│  8 key moments from team radio          │
├─────────────────────────────────────────┤
│                                         │
│  LAP 12  🔴 frustrated                  │
│  Leclerc: "Why are we pitting NOW?      │
│  We had track position!"           🔊   │ ← speaker icon plays audio
│  Context: Ferrari called Leclerc in     │
│  from P3, he came out P6                │
│                                         │
│  LAP 23  🟢 confident                   │
│  Hamilton: "Tyres feel great, I can     │
│  push now, let's go"              🔊   │
│  Context: On fresh Hards, about to      │
│  set fastest lap                        │
│                                         │
│  LAP 41  🟠 frustrated                  │
│  Verstappen: "The rear is gone, I       │
│  can't hold this car"             🔊   │
│  Context: Still P1 by 8 seconds         │
│  despite complaints                     │
│                                         │
└─────────────────────────────────────────┘
```

The speaker icon triggers an HTML5 `<audio>` element that plays the original recording URL from OpenF1.

### Data flow

```
User clicks Radio tab
     │
     └── RadioTimeline.tsx loads
           ├── Fetches GET /races/{year}/{track}/radio
           │     └── insights.get_radio_moments(year, track)
           │           ├── Checks cache (radio_transcripts.json)
           │           ├── If not cached:
           │           │     ├── Fetch audio URLs from OpenF1
           │           │     ├── Download audio files
           │           │     ├── Transcribe with Whisper
           │           │     ├── Tag sentiment
           │           │     └── Cache results
           │           ├── Filter out neutral messages
           │           └── Return top 8 most emotional
           │
           └── Renders timeline with:
                 ├── Lap number
                 ├── Sentiment badge (coloured)
                 ├── Transcript text
                 ├── Speaker icon (plays audio_url)
                 └── Context line (from race data)
```

### Dependencies to install

```
pip install openai-whisper    # or: pip install faster-whisper
pip install requests          # already installed
```

Optional (for better sentiment):
```
pip install transformers torch
```

### Limitations

- **2023+ only** — OpenF1 radio data starts from 2023
- **Not all messages** — F1 selects which ones to broadcast
- **Transcription accuracy** — ~80-90% depending on model size
- **First-load time** — 2-5 minutes per race for transcription (cached after)
- **Audio URLs may expire** — OpenF1 recording URLs point to F1's CDN, which may rotate

---

## Phase 6G — Predictions / Test Your Knowledge

### What it does

On any race page (past or future), users can make predictions about race outcomes. For historical races, the answers are revealed instantly after submission — like a quiz. For upcoming races, answers are locked until after the race happens.

This turns every indexed race into a replayable learning experience. A new fan can open the 2021 Abu Dhabi GP, guess who won, and learn about the most dramatic championship finish in F1 history. A veteran can try to predict the exact strategy split and see how close they were.

### User flow — Historical race (quiz mode)

```
1. User opens 2023 British GP → clicks "Predict" tab
2. Sees prediction form (results HIDDEN):

   Who wins?          [Verstappen ▼]
   Podium P2:         [Hamilton ▼]
   Podium P3:         [Norris ▼]
   Retirements:       [3+ ▼]
   Dominant strategy: [1-stop ▼]
   Weather:           [Dry ▼]

3. Clicks "Submit & Reveal"

4. Results show with scoring:
   ✅ Winner: Verstappen                    +1
   ❌ P2: Hamilton (actual: Norris)         +0
   ❌ P3: Norris (actual: Hamilton)         +0
   ✅ 3+ retirements (3 retired)            +1
   ✅ 1-stop strategy (13 of 20 drivers)    +1
   ✅ Dry conditions                        +1

   Score: 4/6
```

### User flow — Upcoming race (prediction mode)

Same form, but:
- "Submit & Reveal" becomes "Lock In Prediction"
- Results are hidden until the race is indexed
- After the race, user gets a notification or sees their score when they revisit

### Prediction types and how they're scored

| Prediction | Input | Scoring | Data source |
|-----------|-------|---------|-------------|
| Winner | Dropdown (all drivers) | Exact match | `results[0].driver` |
| Podium P2 | Dropdown | Exact match | `results[1].driver` |
| Podium P3 | Dropdown | Exact match | `results[2].driver` |
| Retirements | Range (0, 1-2, 3+, 5+) | Range match | `len(retired)` |
| Strategy | 1-stop / 2-stop / mixed | Most common strategy | `strategy_breakdown` |
| Weather | Dry / Wet / Mixed | Exact match | `weather.condition` |
| Custom | Free text | AI-scored or manual | Depends on prediction |

### Where predictions are stored

**For logged-in users:** Supabase `predictions` table:

```sql
CREATE TABLE predictions (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES auth.users(id),
    year        int NOT NULL,
    track       text NOT NULL,
    predictions jsonb NOT NULL,  -- [{type: "winner", value: "VER"}, ...]
    results     jsonb,           -- [{type: "winner", correct: true, actual: "VER"}, ...]
    score       int,
    total       int,
    created_at  timestamptz DEFAULT now(),
    scored_at   timestamptz
);
```

**For guests:** Store in localStorage. They can still play the quiz, they just don't appear on the leaderboard.

### Scoring engine

```python
def score_predictions(year: int, track: str, predictions: list[dict]) -> list[dict]:
    data = indexer.load_race_index(year, track)
    results = data["results"]
    weather = data["weather"]
    stints = data.get("stints") or {}

    scored = []
    for pred in predictions:
        if pred["type"] == "winner":
            winner = next(r for r in results if r["finish_position"] == 1)
            scored.append({
                **pred,
                "correct": pred["value"] == winner["driver"],
                "actual": winner["driver"],
            })
        elif pred["type"] == "retirements":
            retired = [r for r in results if r["status"] not in ("Finished",)
                       and not r["status"].startswith("+")]
            actual_count = len(retired)
            # Check range match
            ...
        elif pred["type"] == "weather":
            scored.append({
                **pred,
                "correct": pred["value"].lower() == weather.get("condition", "").lower(),
                "actual": weather.get("condition"),
            })

    return scored
```

### Leaderboard

Season leaderboard showing:
- Username
- Total score across all races predicted
- Number of races predicted
- Accuracy percentage
- Best single-race score

Stored in Supabase, queried with a simple aggregation.

---

## Phase 6H — Strategy Simulator (Sim Tab)

### What it does

A third mode in the Strategy tab (alongside Story and Data). The Sim tab shows the actual tyre strategy each driver used, but makes it interactive — users can drag tyre compound markers onto a lap timeline to build their own strategy and see if it would have been faster or slower.

### Default view

When you open the Sim tab, it shows the race winner's actual strategy as a baseline:

```
VERSTAPPEN (ACTUAL)
├── Medium  L1 ████████████████████████████████ L33
└── Soft    L34 ██████████████████ L52

YOUR STRATEGY (drag compounds below)
├── [drag here] L1 ─────────────────────────── L52
│
│   Available: [Soft] [Medium] [Hard] [Inter] [Wet]
│              (drag onto timeline)
```

### Interaction

1. User drags a "Medium" marker onto the timeline → it fills from L1
2. User clicks to set the pit stop lap (e.g. L20)
3. User drags "Hard" for the second stint (L21-L40)
4. User drags "Soft" for the final stint (L41-L52)
5. The sim calculates the result

### How scoring works

The sim uses **real stint data from the race** to estimate performance:

**Tyre life estimation:** For each compound, we know how many laps drivers actually ran it in this specific race. If the longest Soft stint was 19 laps and the user plans 25 laps on Softs, the sim warns "your tyres would degrade significantly after lap 19."

```python
def estimate_stint_viability(compound: str, planned_laps: int, race_stints: dict) -> dict:
    # Find all stints on this compound in the actual race
    real_stints = [s for driver_stints in race_stints.values()
                   for s in driver_stints
                   if s["compound"] == compound]

    if not real_stints:
        return {"viable": False, "reason": "This compound wasn't used in the race"}

    avg_length = sum(s["lap_count"] for s in real_stints) / len(real_stints)
    max_length = max(s["lap_count"] for s in real_stints)

    if planned_laps > max_length * 1.2:
        return {"viable": False, "reason": f"Longest {compound} stint was {max_length} laps"}
    elif planned_laps > avg_length * 1.1:
        return {"viable": True, "warning": f"Longer than average ({avg_length:.0f} laps)"}
    else:
        return {"viable": True}
```

**Pit stop time penalty:** Each pit stop costs ~22 seconds (pit lane entry + stop + exit). More stops = more time lost.

```python
PIT_STOP_LOSS = 22  # seconds

def compare_strategies(user_stops: int, actual_stops: int) -> str:
    diff = (user_stops - actual_stops) * PIT_STOP_LOSS
    if diff > 0:
        return f"Your strategy loses ~{diff}s from extra pit stops"
    elif diff < 0:
        return f"Your strategy saves ~{abs(diff)}s with fewer pit stops"
    else:
        return "Same number of stops as the actual strategy"
```

### Comparison output

```
YOUR STRATEGY              vs    VERSTAPPEN (ACTUAL)
Medium (L1-20)                   Medium (L1-33)
Hard (L21-40)                    Soft (L34-52)
Soft (L41-52)

PIT STOPS: 2 (yours) vs 1 (actual)
TIME PENALTY: +22s from extra pit stop

STINT ANALYSIS:
  Medium L1-20: ✅ Viable (avg Medium stint was 25 laps)
  Hard L21-40:  ✅ Viable (avg Hard stint was 22 laps)
  Soft L41-52:  ✅ Viable (12 laps, avg Soft was 15)

VERDICT: Your strategy is viable but ~22 seconds slower
due to the extra pit stop. The actual 1-stop was optimal
for this race — track position outweighed fresh tyres.
```

### Technical approach — Frontend

The interactive timeline uses HTML5 drag-and-drop:

```typescript
// Draggable compound markers
<div draggable onDragStart={(e) => e.dataTransfer.setData("compound", "SOFT")}>
  [Soft]
</div>

// Drop zone timeline
<div onDrop={(e) => {
  const compound = e.dataTransfer.getData("compound");
  addStint(compound, currentLap);
}} onDragOver={(e) => e.preventDefault()}>
  Timeline
</div>
```

The timeline is drawn as a horizontal bar, divided into lap segments. Each stint is a coloured block matching the compound colour (red for Soft, yellow for Medium, white for Hard).

### Technical approach — Backend

A new endpoint:

```
POST /races/{year}/{track}/strategy/simulate
Body: { stints: [{compound: "MEDIUM", start: 1, end: 20}, ...] }
Response: { viable: true, warnings: [...], comparison: {...}, verdict: "..." }
```

The backend checks stint viability against real race data and returns the comparison.

---

## Dependencies Summary

| Phase | New packages needed | Backend changes | Frontend changes |
|-------|-------------------|-----------------|-----------------|
| 6A | None | None | page.tsx styling |
| 6B | None | None | Race card + SVG files |
| 6C | None | Possibly new search endpoint | Search component |
| 6D | None | Scraper + compound_lookup.py + re-index | None (data fix) |
| 6E | None | StrategyPanel cleanup | Frontend cleanup |
| 6F | openai-whisper, optionally transformers | New radio endpoint + OpenF1 integration | RadioTimeline component |
| 6G | None | Scoring engine | Prediction form + results + leaderboard |
| 6H | None | Strategy simulation endpoint | Interactive timeline component |

---

## Suggested Build Order

```
6A  Landing page + year bar      (1-2 steps, quick win)
6B  Circuit outlines             (2-3 steps, visual impact)
6E  Strategy tab cleanup         (1-2 steps, fix existing bugs)
6D  2010-2011 data fix           (3-4 steps, data quality)
6C  Search bar                   (2-3 steps, usability)
6G  Predictions                  (4-5 steps, engagement feature)
6H  Strategy Simulator           (4-5 steps, interactive feature)
6F  Radio Sentiment              (5-7 steps, biggest feature, most dependencies)
```

Quick wins first (6A, 6B, 6E), then data fixes (6D), then the big interactive features (6C, 6G, 6H, 6F).

---

## How These Features Connect

```
Landing Page (6A) → explains what Raceday does
     │
     ├── Circuit Outlines (6B) → make race cards visual
     ├── Search Bar (6C) → find any race fast
     │
     └── Race Page
           ├── Results tab (existing + 5C key moments)
           ├── Standings tab (existing + 5D/5E season story)
           ├── Strategy tab
           │     ├── Story mode (existing)
           │     ├── Data mode (existing)
           │     └── Sim mode (6H) ← NEW: interactive strategy simulator
           ├── Radio tab (6F) ← NEW: sentiment-tagged transcripts + audio
           ├── Predict tab (6G) ← NEW: quiz/prediction mode
           └── Discussion tab (existing)
```

Every feature feeds into the core loop: browse → learn → interact → come back.

---

## Phase 6I — Pattern Matcher (The Original Hook)

### What it does

The feature that doesn't exist anywhere in consumer-facing F1. The pattern matcher scans all 380+ indexed races and finds historical precedents for any situation. "Last time it rained at Silverstone with a driver starting P5 on intermediates, here's what happened." It cross-references weather, circuit, grid position, strategy, and driver to surface the races that look most like the one you're viewing.

Two surfaces:
1. **Auto-generated precedents on every race page** — a "Historical Precedents" section that runs automatically
2. **Standalone Pattern Finder page** — build your own query, explore freely

### Why this matters

- **F1 official app** — shows live timing, no historical cross-referencing
- **StatsF1** — has the data but you manually open each race to compare
- **FastF1/data tools** — raw data, write your own scripts
- **Betting sites** — do pattern matching internally, never show their work

Nobody has wrapped historical pattern matching in a UI where a casual fan can see "here's what happened last time this situation occurred." The data already exists in our index. This is the gap.

### Surface 1 — Auto Precedents on Race Page

A section on the Results tab (or its own "Patterns" tab) that automatically finds similar races:

```
HISTORICAL PRECEDENTS

Similar races to this one:
  🔵 2016 British GP (wet, similar grid spread)
     → Rosberg won from P3, early slick switch was decisive
  🔵 2012 British GP (wet start, dry finish)
     → Webber won from P2, 6 drivers retired from the wet start

What history suggests:
  → Wet Silverstone races average 4.2 retirements
  → P5 starters in the wet gain 2.3 positions on average
  → 1-stop strategies worked 60% of the time in mixed conditions
```

This runs automatically when you open any race. The matcher compares the current race's features (circuit, weather, grid spread, retirement count) against all other indexed races and surfaces the closest matches.

### Surface 2 — Standalone Pattern Finder

A dedicated page where users build custom queries:

```
┌─────────────────────────────────────────┐
│  PATTERN FINDER                         │
│                                         │
│  Circuit:    [Silverstone ▼]  [Any ▼]   │
│  Weather:    [Wet ▼]                    │
│  Grid pos:   [P4] to [P7]              │
│  Driver:     [Any ▼]                   │
│  Strategy:   [Any ▼]                   │
│                                         │
│  [Find Patterns]                        │
├─────────────────────────────────────────┤
│                                         │
│  4 matching races found                 │
│                                         │
│  2016 British GP                        │
│    Rosberg P3→P1, 2-stop, wet→dry       │
│    Hamilton P1→P3, stuck behind traffic │
│                                         │
│  2014 British GP                        │
│    Hamilton P6→P1, early slick switch   │
│    Bottas P14→P5, biggest gainer        │
│                                         │
│  AGGREGATE STATS                        │
│  Avg position gain: +2.3               │
│  Most common strategy: 2-stop (75%)    │
│  Retirement rate: 21% (vs 12% avg)     │
│  Winner started from: P3 (median)      │
│                                         │
└─────────────────────────────────────────┘
```

### How the matching engine works

Every indexed race is a bag of features. The matcher scores similarity across multiple dimensions:

```python
def find_similar_races(query: dict) -> list[dict]:
    matches = []
    for year, track, data in all_indexed_races():
        score = 0
        reasons = []

        # Circuit match (strongest signal)
        if query.get("circuit") and circuit_matches(track, query["circuit"]):
            score += 3
            reasons.append("same circuit")

        # Weather match
        if query.get("weather") and query["weather"] == data["weather"]["condition"]:
            score += 2
            reasons.append(f"{query['weather']} conditions")

        # Grid position match (for a specific driver or any driver)
        if query.get("grid_range"):
            lo, hi = query["grid_range"]
            matching_drivers = [
                r for r in data["results"]
                if r.get("grid_position") and lo <= r["grid_position"] <= hi
            ]
            if matching_drivers:
                score += 2
                reasons.append(f"driver(s) started P{lo}-P{hi}")

        # Driver match
        if query.get("driver"):
            driver_result = next(
                (r for r in data["results"] if r["driver"] == query["driver"]),
                None
            )
            if driver_result:
                score += 1
                reasons.append(f"{query['driver']} raced")

        # Strategy match
        if query.get("strategy"):
            stints = data.get("stints") or {}
            stop_counts = [len(s) - 1 for s in stints.values() if s]
            if stop_counts:
                most_common = max(set(stop_counts), key=stop_counts.count)
                if str(most_common) == query["strategy"].replace("-stop", ""):
                    score += 1
                    reasons.append(f"{query['strategy']} dominant")

        if score >= 3:  # minimum relevance
            matches.append({
                "year": year,
                "track": track,
                "score": score,
                "reasons": reasons,
                "data": data,
            })

    return sorted(matches, key=lambda x: -x["score"])[:8]
```

**Scoring weights:**
- Same circuit: +3 (strongest — track characteristics dominate)
- Same weather: +2 (rain completely changes a race)
- Similar grid position: +2 (starting position is the biggest predictor of finish)
- Same driver: +1 (driver tendencies matter but less than conditions)
- Same strategy type: +1 (confirms the pattern)

A score of 3+ means the match is relevant enough to show. Scores of 5+ are strong matches.

### Aggregate statistics

After finding matching races, the engine computes aggregates:

```python
def compute_pattern_stats(matches: list[dict], query: dict) -> dict:
    position_gains = []
    strategies = []
    retirements = []

    for m in matches:
        results = m["data"]["results"]

        # Position gain for drivers in the queried grid range
        if query.get("grid_range"):
            lo, hi = query["grid_range"]
            for r in results:
                grid = r.get("grid_position")
                finish = r.get("finish_position")
                if grid and finish and lo <= grid <= hi:
                    position_gains.append(grid - finish)

        # Dominant strategy
        stints = m["data"].get("stints") or {}
        for driver_stints in stints.values():
            if driver_stints:
                strategies.append(len(driver_stints) - 1)

        # Retirements
        retired = [r for r in results
                   if r["status"] not in ("Finished",)
                   and not r["status"].startswith("+")]
        retirements.append(len(retired))

    return {
        "avg_position_gain": round(sum(position_gains) / len(position_gains), 1) if position_gains else 0,
        "most_common_strategy": f"{max(set(strategies), key=strategies.count)}-stop" if strategies else "unknown",
        "avg_retirements": round(sum(retirements) / len(retirements), 1) if retirements else 0,
        "sample_size": len(matches),
    }
```

### Auto-precedent generation for race pages

When viewing any race, the auto-matcher builds a query from that race's features:

```python
def get_auto_precedents(year: int, track: str) -> dict:
    data = indexer.load_race_index(year, track)
    weather = data["weather"]["condition"]

    # Find similar races (same circuit + same weather, excluding this race)
    similar = find_similar_races({
        "circuit": track,
        "weather": weather,
    })
    # Remove the current race from results
    similar = [m for m in similar if not (m["year"] == year and m["track"] == track)]

    # Compute aggregate stats
    stats = compute_pattern_stats(similar, {"circuit": track, "weather": weather})

    return {
        "similar_races": similar[:5],
        "stats": stats,
        "query_description": f"{weather} races at {track}",
    }
```

### API endpoints

```
GET /races/{year}/{track}/precedents
    → Auto-generated historical precedents for this race

POST /patterns/search
    Body: {circuit: "Silverstone", weather: "wet", grid_range: [4, 7]}
    → Matching races + aggregate stats
```

### Frontend components

**PatternPrecedents.tsx** — renders on the race page:
- "Historical Precedents" heading
- List of similar races with summary cards
- Aggregate stats box ("What history suggests")

**PatternFinder.tsx** — standalone page at `/patterns`:
- Query builder form (dropdowns for circuit, weather, grid range, driver)
- Results grid showing matching races
- Aggregate statistics panel

### What we already have

Everything needed is already indexed:
- Circuit names (from schedule)
- Weather conditions (from weather data)
- Grid positions (from results)
- Finish positions (from results)
- Tyre strategy (from stints)
- Retirements (from results status)

No new data sources needed. This is pure query logic over existing data.

### Data coverage

| Years | Races | Circuit | Weather | Grid | Strategy |
|-------|-------|---------|---------|------|----------|
| 2010-2024 | 380+ | All | All | All | 2012+ full, 2010-2011 partial |

380+ races is enough for meaningful patterns. Even filtering to "wet races at Silverstone" yields 3-5 matches across 15 years.

---

## Updated Phase 6 Summary

```
Phase 6A — Landing page + year bar styling
Phase 6B — Circuit outlines on race cards
Phase 6C — Search bar
Phase 6D — 2010-2011 data gap fix
Phase 6E — Strategy tab cleanup
Phase 6F — Radio Sentiment + audio playback
Phase 6G — Predictions / Test Your Knowledge
Phase 6H — Strategy Simulator (Sim tab)
Phase 6I — Pattern Matcher (auto precedents + standalone finder)
```

## Updated Feature Map

```
Landing Page (6A) → explains what Raceday does
     │
     ├── Circuit Outlines (6B) → make race cards visual
     ├── Search Bar (6C) → find any race fast
     ├── Pattern Finder (6I) → standalone query page
     │
     └── Race Page
           ├── Results tab (existing + 5C key moments)
           │     └── Historical Precedents (6I) ← auto-generated patterns
           ├── Standings tab (existing + 5D/5E season story)
           ├── Strategy tab
           │     ├── Story mode (existing)
           │     ├── Data mode (existing)
           │     └── Sim mode (6H) ← interactive strategy simulator
           ├── Radio tab (6F) ← sentiment-tagged transcripts + audio
           ├── Predict tab (6G) ← quiz/prediction mode
           └── Discussion tab (existing)
```

Every feature feeds into the core loop: browse → learn → interact → come back.

---

*Updated: 2026-03-17 | Project: Raceday | Phase 6 planning | All features discussed in session*
