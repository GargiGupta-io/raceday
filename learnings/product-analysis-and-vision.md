# Raceday — Product Analysis & Future Vision

> A brutally honest assessment of where Raceday stands as a product, what makes it unique, where it falls short, and the roadmap of features that could turn it from a portfolio project into a real F1 fan platform.

---

## In Plain English

Raceday started as a data viewer — show F1 race results in a nice way. Over six phases and 55+ steps, it evolved into something more interesting: a platform where you can read auto-generated race stories, hear actual team radio clips, explore historical patterns, and most importantly, build your own pit strategies and get ML-predicted outcomes. That last feature — the strategy simulator — is the thing no other free F1 site has.

But having a unique feature doesn't make a product. A product needs users, retention, and a reason to come back. Right now, Raceday is like a beautiful restaurant with no door — it exists on localhost. Even if deployed, most features are "visit once, read, leave." The race stories are interesting the first time, but you don't re-read the 2023 British GP story every week.

The path from "interesting project" to "product people use" requires three things: deployment (obviously), real-time data (cover the current season as races happen), and social features (compete with friends on strategy predictions). This document captures where the product stands, what would make it work, and the specific features that could get it there.

---

## Current Product State

### What exists (Phase 6 complete)

```
LANDING PAGE
  └── Animated intro with F1 car silhouette
  └── Feature cards (Race Stories, Simulator, Radio, Patterns, Stats)
  └── "Pick a season to start" → year scrollbar + race cards

RACE PAGE (story-first scroll)
  ├── Tagline ("A masterclass from lights to flag")
  ├── Podium (compact 3-row with team colours)
  ├── Key Moments (auto-detected highlights)
  ├── Race Story (unified narrative, auto-generated)
  ├── What History Tells Us (pattern matcher)
  ├── Team Radio (2023+, audio playback)
  ├── Go Deeper (strategy breakdown, season standings, awards)
  ├── Strategy Simulator (ML-powered, right sidebar)
  └── Race Intelligence (Did You Know facts, right sidebar)

PATTERN FINDER PAGE
  └── Custom queries across 300+ races

CHAMPIONSHIP PAGE
  └── Points tables per season

DATA COVERAGE
  └── 2010-2025 (16 seasons, 300+ races)
  └── Results, weather, stints, lap timing (2018+), radio (2023+)
```

### Tech stack

| Layer | Tech | Cost |
|-------|------|------|
| Frontend | Next.js 16 + Tailwind | Free (Vercel) |
| Backend | FastAPI + Python | ~$10-20/month (Railway) |
| Data | FastF1, Jolpica, OpenF1, OpenMeteo | Free (all open APIs) |
| ML | numpy polynomial regression | Free (runs on backend) |
| Storage | JSON files on disk | Included in hosting |
| CDN | F1 livetiming CDN (radio audio) | Free (F1's servers) |

**Total operating cost: ~$20-30/month.** This is remarkably low for a data-intensive platform.

---

## Competitive Analysis

### What exists in the market

**F1 Official App** — Live timing, race replays, driver tracker. The 800-pound gorilla. Has exclusive live data rights. Raceday can't compete on live data, but F1's app has zero strategy analysis or historical pattern matching.

**Motorsport.com / The Race** — Editorial journalism. Great writing, expert opinions. But every article requires a human journalist. Raceday's auto-generated stories cost zero to produce and cover 300+ races. These sites cover maybe 20-30 races per year with deep analysis.

**StatsF1 / Ergast** — Raw statistics databases. Comprehensive but completely passive — numbers in tables. No stories, no interactivity, no "so what does this mean?"

**F1 Manager (game)** — Strategy game costing $40. Focuses on team management (hiring drivers, upgrading facilities). Raceday's simulator is free, web-based, and uses real race data instead of game physics.

**Reddit r/formula1** — Fan discussion. 3M+ members. Incredible engagement but it's opinions, not data. "Hamilton should've pitted earlier" with no evidence vs Raceday's "Hamilton pitting 3 laps earlier would've saved 4.2 seconds."

### Raceday's unique position

```
                    Interactive ←————————————→ Passive
                         |                        |
              Raceday    |                        |  StatsF1
              Simulator  |                        |  Ergast
                         |                        |
           F1 Manager    |                        |  F1 App
              (game)     |                        |  (viewer)
                         |                        |
                         |    Motorsport.com      |
                         |    The Race            |
                         |    (editorial)         |
                         |                        |
               Data-driven ←————————————→ Opinion-based
                         |                        |
                         |        Reddit          |
                         |        Twitter         |
```

Raceday sits in the top-left quadrant: **interactive + data-driven.** No one else is there. F1 Manager is interactive but game-based (not real data). The F1 App is data-driven but passive (view-only). Raceday is the only free, web-based, real-data, interactive F1 analysis tool.

---

## Revenue Model

### Freemium tiers

**Free (everyone):**
- All race stories, key moments, taglines
- Pattern finder
- Race Intelligence facts
- Team radio playback (2023+)
- Historical browsing (2010-2025)

**Premium ($5/month or $40/year):**
- Strategy simulator (ML-powered)
- AI Race Engineer mode
- Pre-race predictions with scoring
- Driver swap simulator
- Strategy replay mode
- Ad-free experience
- API access for developers

### Revenue projections

| Monthly visitors | Free users | Premium (2-3%) | Revenue |
|-----------------|-----------|----------------|---------|
| 5,000 | 4,850 | 100-150 | $500-750/month |
| 25,000 | 24,250 | 500-750 | $2.5K-3.75K/month |
| 50,000 | 48,500 | 1,000-1,500 | $5K-7.5K/month |
| 100,000 | 97,000 | 2,000-3,000 | $10K-15K/month |

At 50K monthly visitors with premium: **~$60K-90K/year revenue** against **~$360/year hosting costs.** The margins are extreme because the content is auto-generated and the data sources are free.

### Alternative revenue:
- F1 ticket affiliate links: 5-8% commission (~$10-20 per sale)
- Betting site partnerships: F1 gambling is a massive market
- API licensing to fantasy F1 platforms: $99-499/month per client
- Sponsored "strategy of the week" content

---

## The Features That Would Change Everything

### 1. Live Race Companion (Browser Extension)

**Impact: Transforms Raceday from archive to real-time platform.**

A browser extension that overlays strategy predictions on any F1 broadcast. "Hamilton will pit in 3-5 laps." "If Norris pits NOW → P3. If he waits → P5." Uses OpenF1 real-time data + the ML models already built.

Why it matters:
- Creates 24 guaranteed traffic spikes per year (every race Sunday)
- Viral: fans screenshot predictions that came true → social media
- The extension is free → drives users to the website for deep analysis
- Hardest feature for competitors to copy (needs the full data pipeline + ML)

```
Extension (Chrome/Firefox)
    │
    ├── Detects F1 broadcast (URL matching)
    ├── Connects to Raceday backend via WebSocket
    ├── Receives live predictions every lap
    ├── Overlays on video: strategy alerts, tyre life, "what if"
    │
    └── Post-race: "See the full analysis on raceday.com"
```

### 2. AI Race Engineer Mode

**Impact: Gamification that creates replayable content from static data.**

Play as the race engineer. The system presents real decision points. You choose. ML scores your decisions.

"Lap 18: Rain incoming. Your driver is P4 on Mediums. Pit for inters or stay out?"

End of race: "You scored 78/100. You nailed the undercut but the rain call cost 12 seconds."

Why it matters:
- Every historical race becomes a replayable game (300+ levels)
- Shareable scores ("I got 92/100 as Verstappen's engineer")
- Uses existing data — no new data sources needed
- Progression system: "You've engineered 50 races. Average score: 81."

### 3. Prediction Leagues

**Impact: Social retention — the thing that makes people come back every week.**

Before each race: predict the strategy, top 5, retirements. After the race: auto-score. Season leaderboard.

Why it matters:
- Weekly engagement loop tied to the real F1 calendar
- Social competition drives retention (competing with friends)
- Prediction accuracy feeds into the "how good is your strategy sense" narrative
- Can use the same ML models to show "the model predicted X, you predicted Y"

### 4. Driver Swap Simulator

**Impact: Answers the biggest fan argument in F1.**

"What if Hamilton was in the Red Bull?" Use real qualifying deltas and tyre management profiles to simulate any driver in any car.

Why it matters:
- Incredibly shareable ("Data says Alonso in a McLaren would've won 4 more races")
- Uses data already in the index (qualifying times, stint degradation)
- Generates controversy → social media engagement
- No other site can do this with real data

### 5. Strategy Replay Mode

**Impact: Makes Raceday THE place to understand a race after watching it.**

Lap-by-lap timeline with track map, strategy annotations, degradation curves, and gap charts. Like a director's commentary for the strategy chess game.

Why it matters:
- Fills the gap between "highlights video" and "raw timing sheets"
- Visual and intuitive — works for casual fans who can't read timing data
- Every race gets a replay (300+ replays from existing data)

---

## What Would Kill Growth

1. **Not deploying.** The single biggest risk. Every day on localhost is a day of zero users.

2. **Not covering the current season in real-time.** If the 2026 season starts and Raceday doesn't have the Australian GP indexed by Monday morning, fans go to F1 App/Motorsport.com and don't come back.

3. **Ignoring mobile.** 60%+ of F1 social media consumption is on phones. If the simulator doesn't work on a phone, most users can't use the premium feature.

4. **No social features.** Single-player experiences create visitors, not users. Without prediction leagues or shareable scores, there's no retention loop.

5. **Legal issues with F1 data.** F1 is protective of their data rights. Using FastF1 (which scrapes F1's timing feed) for a commercial product could draw legal attention. The free tier might be fine, but charging for features based on F1's data needs legal review.

---

## The 6-Month Roadmap

| Month | What | Impact |
|-------|------|--------|
| 1 | Deploy + mobile fixes + auto-indexing | Go live, first real users |
| 2 | AI Race Engineer mode | Unique gamified content |
| 3 | Live Race Companion extension (MVP) | Real-time relevance |
| 4 | Prediction leagues + user accounts | Retention loop |
| 5 | Driver swap simulator + strategy replay | Depth features |
| 6 | Premium tier launch + marketing push | Revenue |

By month 6, Raceday would have:
- A deployed website with 300+ race analyses
- A browser extension used during every race
- A gamified race engineer mode
- Social prediction leagues
- Premium features worth paying for
- A genuine moat: the ML models + data pipeline + extension ecosystem

---

## The One-Sentence Pitch

**"Raceday is the only place where you can rewrite an F1 race's strategy and see what would have happened — powered by machine learning trained on real lap data."**

For investors: "We auto-generate F1 content at zero editorial cost, serve it to 500M potential fans, and monetize through a premium strategy simulation tool."

For users: "Read the race story. Hear the team radio. Then build your own strategy and see if you'd beat the real team."

For developers: "A full-stack platform with FastF1 data pipeline, polynomial regression ML, real-time OpenF1 integration, and a Next.js frontend — open source and extensible."

---

*Generated: 2026-03-20 | Project: Raceday | Product analysis + future vision*
