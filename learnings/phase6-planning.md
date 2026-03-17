# Phase 6 — Raceday Redesign: From Database to Learning Experience

> Refocusing Raceday around its core vision — a site where beginners learn about F1 and hardcore fans explore deeper. Not a database. Not a dashboard. A story-first experience with depth on demand.

---

## The Problem With What We Built

Phases 1-5 produced a solid data platform. Results, standings, strategy, season awards, teammate battles, key moments — all accurate, all well-presented. But it became a database with tabs. A first-time visitor sees 4 tabs, each with multiple sections, and thinks "I don't know what any of this means." A hardcore fan sees the same tabs and thinks "this is just another stats site."

The original vision was different: **a place where anyone can understand what happened in an F1 race.** A beginner reads a story and learns. A veteran digs into patterns and tests their knowledge. The data serves the story — the story is never sacrificed for more data.

Phase 6 fixes this by restructuring the entire race page around one principle: **story first, data on demand.**

---

## The Core Principle

Before adding or keeping any feature, ask:

> **"Would a friend who's never watched F1 understand why this is here?"**

- If yes → it belongs in the main flow
- If only for hardcore fans → it goes under "Go Deeper"
- If neither → cut it

---

## The New Race Page — One Scroll, No Tabs

No more tabs. One page, one scroll. A beginner reads top to bottom and understands the race. A hardcore fan scrolls past the story and expands the deep sections.

```
┌─────────────────────────────────────────────┐
│  2023 British Grand Prix                    │
│  Silverstone · Round 10 · Dry · 52 laps     │
│  ╭──╮  ← circuit outline                   │
│  ╰──╯                                       │
│                                              │
│  "A masterclass from lights to flag"         │ ← tagline (auto-generated)
│                                              │
├─────────────────────────────────────────────┤
│                                              │
│  THE RESULT                                  │
│  ┌─────────────────────────────────────┐     │
│  │ 🥇 Max Verstappen  · Red Bull      │     │
│  │ 🥈 Lando Norris    · McLaren       │     │
│  │ 🥉 Lewis Hamilton  · Mercedes      │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  THE RACE STORY                              │
│  "Verstappen converted pole to a             │
│  dominant win — his 7th in a row.            │
│  Behind him, the real fight was              │
│  Hamilton climbing from P7 to the            │
│  podium while Leclerc dropped 5              │
│  places. Perez pulled off the                │
│  biggest recovery, gaining 9                 │
│  positions from P15..."                      │
│                                              │
│  KEY MOMENTS                                 │
│  ↑ Perez gained 9 places                    │
│  ↓ Leclerc dropped 5 places                 │
│  ★ Verstappen: pole to victory              │
│  ⚔ Perez undercut Sargeant                  │
│  ⚡ Hamilton beat Piastri from behind        │
│                                              │
│  WHAT HISTORY TELLS US                       │
│  "In 3 previous dry Silverstone races,       │
│  pole sitters won 2 out of 3 times.          │
│  P5+ starters gained 2.1 places on avg."    │
│                                              │
│  🔊 RADIO (2023+ only)                      │
│  Lap 23 🔴 Leclerc: "Why did we pit now?"  │
│  Lap 31 🟢 Hamilton: "Tyres feel great"    │
│  (speaker icon to play original audio)       │
│                                              │
│  🎯 TEST YOUR KNOWLEDGE                     │
│  "Could you have predicted this race?"       │
│  [Take the quiz →]                           │
│                                              │
│  ──── GO DEEPER ────                         │
│                                              │
│  ▸ Strategy breakdown (click to expand)      │
│  ▸ Full finishing order (click to expand)    │
│  ▸ Season standings at this point            │
│  ▸ Team championship                         │
│  ▸ Season awards & teammate battles          │
│                                              │
└─────────────────────────────────────────────┘
```

---

## What Each Existing Feature Becomes

### Results tab → THE RESULT (top of page, always visible)

**Before:** A tab you click. Winner card, podium cards, weather card, retirements card — all separate boxes.

**After:** Always visible at the top. Simplified to the podium — three names, three teams, team colour dots. Weather and retirements are woven into the race story narrative. No tab click needed.

**What changes:** ResultsCard.tsx gets slimmed to a compact podium display. Weather and retirement data feed into the unified race story instead of being standalone cards.

---

### Strategy Story mode → THE RACE STORY (centrepiece of the page)

**Before:** Hidden behind Strategy tab → Story sub-tab. Most users never find it.

**After:** The heart of the page. A flowing narrative covering everything — weather, strategy, drama, the winner's path. This is what a beginner reads to understand the race.

**What changes:** Merge `get_strategy_narrative()` with `get_race_summary()` and `get_key_moments()` into one unified `get_race_story()` function. The story should weave results, strategy, and moments together — not separate them.

---

### Key Moments → KEY MOMENTS (below the story)

**Before:** Separate component below ResultsCard in the Results tab.

**After:** Stays mostly the same, positioned after the race story. The story gives context, the moments give the highlights.

**What changes:** Repositioning only — no component changes needed.

---

### Pattern Matcher → WHAT HISTORY TELLS US (new — Phase 6E)

**Before:** Didn't exist. Was the original hook idea that never got built.

**After:** A section connecting this race to the past. "In 3 previous dry Silverstone races, pole sitters won 2 out of 3 times." The unique differentiator — no other site has this. Beginners learn that F1 has patterns. Hardcore fans get analytical depth.

**What changes:** Build the matching engine. Keep it short on the race page — 2-3 sentences + 2-3 matching races. The standalone Pattern Finder page lives separately for deep exploration.

---

### Radio Sentiment → RADIO (new — Phase 6H, 2023+ only)

**Before:** Didn't exist.

**After:** 3-5 most emotional radio clips. The human layer. A beginner hears Leclerc's frustration and suddenly cares about a strategy call. Speaker icon to hear the actual voice.

**What changes:** Build the OpenF1 → Whisper → Sentiment pipeline. Scoped to top 3-5 clips, not a full timeline. For races before 2023, this section doesn't appear.

---

### Predictions → TEST YOUR KNOWLEDGE (new — Phase 6I)

**Before:** Didn't exist.

**After:** A call-to-action at the bottom of the story. "Could you have predicted this race?" Links to a quiz form. Active learning — read the story, then test yourself. Works on any race (historical = instant reveal, upcoming = locked until race day).

**What changes:** Build the prediction form + scoring engine. Position as a quiz prompt, not a full tab. Quiz form as a modal or expandable section.

---

### Strategy Data table → GO DEEPER: Strategy breakdown

**Before:** Strategy tab → Data sub-tab. Compound grid with StrategyKey side panel.

**After:** Hidden under "Go Deeper" accordion. Hardcore fans expand to see the full compound table. Beginners never need it.

**What changes:** Move into a collapsible section. No component changes.

---

### StandingsTable (race finishing order) → GO DEEPER: Full finishing order

**Before:** Standings tab — full P1-P20 grid with position deltas.

**After:** Hidden under "Go Deeper." The race story already tells you who won and who moved where. The full table is reference material.

**What changes:** Move into collapsible section.

---

### Season Story (turning points, constructors) → GO DEEPER: Season standings

**Before:** Below StandingsTable in the Standings tab.

**After:** Under "Go Deeper" — turning points + championship position + constructor bars with description.

**What changes:** Remove MomentumCard entirely (redundant). Move SeasonStory and constructor battle into collapsible sections.

---

### Season Awards + Teammate H2H → GO DEEPER: Season awards & teammate battles

**Before:** Below SeasonStory in the Standings tab.

**After:** Under "Go Deeper." Fun for hardcore fans but not essential to understanding a single race.

**What changes:** Move into collapsible section.

---

### Discussion → REMOVED

**Before:** Its own tab with Supabase-powered theories and comments.

**After:** Removed entirely. Empty for 99% of races, requires login, zero engagement with no user base. If Raceday grows and users want social features, add it back later.

**What changes:** Remove DiscussionPanel component from race page. Supabase tables can stay (no harm), but the UI surface is gone.

---

### Sidebar → "Race Intelligence" (Did You Know only)

**Before:** FactsSidebar with three sections — RSS articles, Reddit posts, Did You Know facts. RSS is empty for older races, Reddit is hit-or-miss.

**After:** Stripped down to just the auto-generated "Did You Know" facts from `get_did_you_know()`. Renamed to "Race Intelligence." This is the strongest part — unique content generated from indexed data, works for every race 2010-2024.

**What changes:** Remove RSS fetcher and Reddit fetcher calls from sidebar endpoint. Remove those sections from FactsSidebar component. Rename to "Race Intelligence." Keep the compact panel format — on desktop it can stay as a sidebar, on the scrollable race page it becomes a small section in the main flow.

---

## What Gets Cut

| Feature | Why it's cut |
|---------|-------------|
| **Discussion panel** | Empty for most races, requires login, no user base. Dead weight. |
| **RSS articles in sidebar** | Empty for any race older than a few weeks. Feeds only keep recent articles. |
| **Reddit posts in sidebar** | Hit-or-miss results, inconsistent quality. |
| **Momentum card (Hot Right Now)** | Redundant with season story. Points in last 5 races isn't meaningful to beginners. |
| **Strategy Simulator (Sim tab)** | Too complex, too niche. Doesn't serve learning. Save for a future phase after core is solid. |
| **Search bar as major feature** | Keep simple race-name search on home page. Not worth a full phase. |
| **Tabs on race page** | The root of the "database feel." Replaced by single scroll. |

---

## The Revised Phase 6 Build Order

### Phase 6A — Race Page Redesign

The biggest change. Kill the tabs. Build the scrollable story layout with "Go Deeper" accordions. This restructures everything.

**Steps:**
1. Remove tab navigation from race page
2. Build compact podium header (slim ResultsCard)
3. Move KeyMoments below podium
4. Build "Go Deeper" accordion wrapper component
5. Move Strategy Data, StandingsTable, SeasonStory, SeasonInsights into accordions
6. Remove MomentumCard and DiscussionPanel
7. Strip sidebar to "Race Intelligence" (Did You Know only, remove RSS + Reddit)
8. Visual test

---

### Phase 6B — Landing Page + Year Bar Styling

Welcome section below race cards explaining what Raceday is. Year scrollbar blended into dark zinc theme.

**Steps:**
1. Add welcome section to home page (below race cards)
2. Restyle year selector to blend with zinc theme
3. Visual test

---

### Phase 6C — Circuit Outlines on Race Cards

Small circuit layout SVGs on each race card. Visual identity at a glance.

**Steps:**
1. Collect/create ~35 circuit SVG files
2. Build circuit name → filename mapping
3. Render on race cards
4. Visual test

---

### Phase 6D — Unified Race Story Engine + Race Tagline

Merge the strategy narrative, race summary, and key moments into one cohesive `get_race_story()` function. The story should read like race commentary, not like three separate data dumps stitched together.

Also generates a **one-line tagline** — a film-poster hook that sits above THE RESULT and frames the entire page. Auto-generated from race data:

- Winner from pole with huge gap → "A masterclass from lights to flag"
- Winner from far back on the grid → "The day Hamilton defied a grid penalty"
- 5+ retirements → "The race nobody finished"
- Wet conditions → "Rain rewrote the script at Silverstone"
- Lead change in championship → "The moment the title fight changed"
- Close battle between rivals → "Settled by seconds between Norris and Piastri"
- Dominant team 1-2 finish → "Red Bull's day, and everyone else was racing for third"

One sentence. Zero effort to read. Sets the emotional tone before you even know who won.

**Steps:**
1. Build `get_race_story()` in insights.py — merges narrative + summary + weather
2. Build `generate_race_tagline()` — one-line hook from race data
3. Add `/races/{year}/{track}/story` endpoint (returns tagline + narrative)
4. Build `RaceStory.tsx` component with tagline
5. Wire into the new race page layout
6. Visual test

---

### Phase 6E — Pattern Matcher

The original hook. Auto-generated "What History Tells Us" on every race page + standalone Pattern Finder page.

**Steps:**
1. Build `find_similar_races()` matching engine
2. Build `get_auto_precedents()` for race pages
3. Add `/races/{year}/{track}/precedents` endpoint
4. Add `POST /patterns/search` endpoint for standalone finder
5. Build `PatternPrecedents.tsx` (race page section)
6. Build Pattern Finder page (`/patterns`)
7. Visual test

---

### Phase 6F — 2010-2011 Data Gap Fix

Scrape formula1.com pit stop summaries, build 2010 Bridgestone compound table, re-index.

**Steps:**
1. Build formula1.com pit stop scraper
2. Scrape all 2010 + 2011 races → save as JSON
3. Build 2010 Bridgestone nominations table
4. Update indexer to use scraped data for 2010-2011
5. Re-index all 2010-2011 races
6. Verify strategy tab shows real data

---

### Phase 6G — Strategy Tab Cleanup

Fix remaining "?" markers, empty states, fallback messages across all years.

**Steps:**
1. Audit all years for compound lookup failures
2. Fix empty state messages in StrategyPanel
3. Fix "?" rendering in StrategyPanel
4. Visual test across edge cases

---

### Phase 6H — Radio Sentiment + Audio Playback

OpenF1 audio → Whisper transcription → sentiment tagging → top 3-5 clips per race with speaker icon.

**Steps:**
1. Build OpenF1 radio fetcher (meeting/session key mapping)
2. Build Whisper transcription pipeline with caching
3. Build sentiment tagger (keyword rules v1)
4. Build `get_radio_moments()` in insights.py
5. Add `/races/{year}/{track}/radio` endpoint
6. Build `RadioMoments.tsx` component with audio playback
7. Wire into race page (between Key Moments and Test Your Knowledge)
8. Visual test

**Dependencies:** `openai-whisper` or `faster-whisper`

**Limitation:** 2023+ only. Section doesn't render for older races.

---

### Phase 6I — Test Your Knowledge (Quiz Mode)

Prediction form for any race. Historical races → instant scoring. Upcoming → locked until indexed.

**Steps:**
1. Create `predictions` table in Supabase
2. Build scoring engine in insights.py
3. Add `/races/{year}/{track}/score-predictions` endpoint
4. Build `PredictionQuiz.tsx` component (form + reveal)
5. Wire into race page (bottom of story section)
6. Build simple leaderboard
7. Visual test

---

## Feature Map — The New Raceday

```
HOME PAGE
  ├── Year scrollbar (restyled — 6B)
  ├── Race cards with circuit outlines (6C)
  ├── Simple race-name search
  └── Welcome section explaining Raceday (6B)

PATTERN FINDER PAGE (6E)
  └── Build-your-own query → matching races + stats

RACE PAGE (6A — the big redesign)
  │
  ├── MAIN FLOW (beginner-friendly, always visible)
  │     ├── Race header + circuit outline + tagline
  │     ├── THE RESULT — compact podium
  │     ├── RACE INTELLIGENCE — "Did You Know" facts (sidebar → inline)
  │     ├── THE RACE STORY — unified narrative (6D)
  │     ├── KEY MOMENTS — auto-detected highlights
  │     ├── WHAT HISTORY TELLS US — pattern matcher (6E)
  │     ├── RADIO — top 3-5 emotional clips (6H, 2023+)
  │     └── TEST YOUR KNOWLEDGE — quiz prompt (6I)
  │
  └── GO DEEPER (expandable, for hardcore fans)
        ├── Strategy breakdown (compound table)
        ├── Full finishing order (P1-P20 grid)
        ├── Season standings (turning points + championship)
        ├── Team championship (constructor bars)
        └── Season awards & teammate H2H
```

---

## Build Priority

| Priority | Phase | What | Why first |
|----------|-------|------|-----------|
| 1 | **6A** | Race page redesign | Everything else slots into this layout |
| 2 | **6B** | Landing page + year bar | First impression matters |
| 3 | **6C** | Circuit outlines | Quick visual win |
| 4 | **6D** | Unified race story + tagline | The centrepiece content + emotional hook |
| 5 | **6E** | Pattern Matcher | The original hook, the differentiator |
| 6 | **6G** | Strategy cleanup | Fix ? markers before users see them |
| 7 | **6H** | Radio Sentiment | Big feature, needs ML dependencies |
| 8 | **6I** | Test Your Knowledge | Engagement/retention feature |
| 9 | **6F** | 2010-2011 data fix | Low priority — only 5% of users will look at pre-2012 races. Fix when users ask for it. |

---

## What Success Looks Like

A first-time visitor opens a race. They read a story. They see key moments. They see "last time it rained here, this happened." They hear a driver's frustrated voice on the radio. They take a quiz and get 3 out of 6 right. They click another race. They're learning.

A hardcore fan opens the same race. They skim the story (they watched it live). They check the historical precedents ("interesting, I didn't know that"). They expand the strategy breakdown to see the compound split. They check the teammate battles. They take the quiz and get 6 out of 6. They go to the Pattern Finder and build a custom query.

Same page. Two completely different experiences. That's the vision.

---

*Updated: 2026-03-17 | Project: Raceday | Phase 6 revised — story-first redesign*
