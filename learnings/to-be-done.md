# Raceday — To Be Done

> Features and improvements planned for future phases, prioritized by impact.

---

## Priority 1: Deploy + Go Live

**Status:** Not started
**Why first:** Nothing matters until real users can access it.

- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to Railway/Render
- [ ] Set up environment variables (API keys, INDEX_DIR, CACHE_DIR)
- [ ] Pre-index all races (don't rely on on-demand indexing under load)
- [ ] Pre-generate all laps.json files for 2018-2025 (strategy simulator needs them)
- [ ] Add proper meta tags, Open Graph images, sitemap for SEO
- [ ] Set up analytics (Plausible or PostHog — privacy-friendly)
- [ ] Domain name (raceday.app? raceday.racing?)
- [ ] SSL + CDN (Cloudflare)

---

## Priority 2: Live Race Companion (Browser Extension)

**Status:** Concept
**Why:** Creates weekly traffic spikes (24 races/year), hardest to copy, viral potential.

A Chrome/Firefox extension that overlays real-time strategy predictions on any F1 broadcast (F1TV, YouTube, Sky streams).

### What it shows:
- **Live strategy predictions:** "Hamilton will pit in 3-5 laps based on Silverstone degradation data"
- **"What if" ticker:** "If Norris pits NOW for Hards → P3. If he stays out 5 more laps → P5."
- **Pattern alerts:** "Last 3 times it rained mid-race at Spa, the leader lost position within 4 laps"
- **Tyre life indicator:** "Verstappen's Mediums are at 85% life — cliff in ~6 laps"

### Architecture:
- Extension popup/sidebar using React
- Talks to Raceday backend via WebSocket
- Backend pulls live timing from OpenF1 real-time API
- ML models run predictions every lap update
- Same predictions shown on raceday.com/live dashboard for non-extension users

### Technical needs:
- Chrome Extension Manifest V3
- WebSocket server (FastAPI supports this)
- OpenF1 real-time data stream integration
- Live prediction loop (run ML model every ~90 seconds per lap)

---

## Priority 3: AI Race Engineer Mode

**Status:** Concept
**Why:** Gamifies strategy in a way no one else has. High engagement, shareable scores.

Play as the race engineer for any driver. The system presents you with real decision points as they happened during the race:

- Lap 18: "Rain radar shows 40% chance in 10 minutes. Your driver is P4 on Mediums. Do you: A) Pit now for Inters, B) Stay out, C) Pit for fresh Mediums?"
- You choose. ML model scores your decision vs what actually happened AND vs the optimal strategy.
- End of race: "You scored 78/100 as a race engineer."

### Implementation:
- Extract decision points from race data (pit stops, weather changes, safety cars, position changes)
- Build a decision tree per race from the actual events
- Score each choice: did it match reality? Was it better than reality?
- Works on ALL historical races (2010-2025) — huge replayability
- Social sharing: "I scored 92/100 as Hamilton's engineer at Silverstone 2023"

---

## Priority 4: Pre-Race Predictor + Prediction Leagues

**Status:** Concept
**Why:** Creates weekly engagement loop + social competition = retention.

Before each race weekend, generate predictions using pattern matcher + ML:
- Optimal strategy prediction based on circuit history
- Win probability per driver based on qualifying + historical performance
- Weather impact estimation

Users submit their own predictions:
- Pick top 5 finishers
- Choose the winning strategy (stops + compounds)
- Predict number of retirements, safety cars

After the race, auto-score everyone. Weekly leaderboard. Season championship for predictors.

### Technical needs:
- User accounts (bring back Supabase, or use simple localStorage + optional sign-up)
- Prediction submission API
- Auto-scoring engine (compare predictions vs actual results)
- Leaderboard with season points

---

## Priority 5: Driver Swap Simulator

**Status:** Concept
**Why:** Answers the #1 fan argument — "what if X was in Y's car?"

Take a driver's actual performance data and simulate them in a different car:
- Qualifying pace delta relative to teammate → apply to target car
- Tyre management profile (degradation savings per lap) → apply to target car's tyre deg
- Race craft score (positions gained/lost on lap 1, overtakes per race) → factor into finish position

Example output: "Hamilton in the Red Bull at Silverstone 2023: Predicted P1 by 0.25s. His tyre management would extend the first stint by 3 laps, enabling an undercut on Norris."

### Data needed:
- Teammate qualifying deltas per race (extractable from results)
- Tyre management profiles (extractable from stint degradation in laps.json)
- Car performance gap per circuit (extractable from qualifying gaps between teams)

---

## Priority 6: Strategy Replay Mode

**Status:** Concept
**Why:** Makes Raceday THE place to understand what actually happened in a race, visually.

A lap-by-lap timeline scrubber with:
- Track map showing all car positions
- Strategy annotations at key moments ("PIT — Perez undercuts Hamilton")
- Degradation curves updating in real-time as the scrubber moves
- Gap chart showing intervals between drivers
- Weather overlay (rain probability timeline)

Like a director's commentary but for strategy — you watch the chess game, not the car chase.

### Technical needs:
- Lap-by-lap position data (available in laps.json)
- Track map SVGs with car position markers (circuit SVGs already exist)
- Timeline scrubber component with synchronised panels
- Gap calculation from lap times

---

## Priority 7: Career Mode / Season Simulator

**Status:** Concept
**Why:** Long-term engagement — play through an entire 24-race season.

Pick a team. Before each race, set the strategy. ML model simulates the race. Track championship points across the season.

- Pre-race: Choose setup (affects qualifying position)
- Race: Choose pit windows and compounds
- Post-race: Compare your strategy vs AI-optimal vs reality
- Season: Running championship points vs actual standings

---

## Fixes & Polish (Current)

### Immediate fixes:
- [ ] Radio transcription — get Groq API key working (their OAuth is currently broken)
- [ ] RadioMoments UI — make speaker icon clickable as play button, progress bar below driver name
- [ ] Mobile responsiveness audit — test all pages on 375px width
- [ ] Strategy simulator calibration — HAM 1-stop showing unrealistic deltas on some races

### Visual polish:
- [ ] Race page needs the same energy as the intro hero — dramatic layouts, better typography
- [ ] Circuit SVGs on race pages (not just home page cards)
- [ ] Team colour accents throughout (not just podium dots)
- [ ] Animated transitions between sections on scroll

### Data:
- [ ] Auto-index new races within hours of race end (cron job or webhook)
- [ ] Add 2025 circuit SVGs for any new tracks
- [ ] Pre-generate all laps.json for 2018-2025 to avoid on-demand FastF1 calls

---

*Created: 2026-03-20 | Project: Raceday | Updated as features are planned and completed*
