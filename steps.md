# Phase 8F — UI Refinement + Content Balance + Deploy Prep

> De-box prose, brighten hero, slim intro cards, rebalance page content, add charts and presets. Then deploy.

---

## Phase 8F-1: De-boxing + Hero Fix (Steps 1-3)

### Step 1: De-box prose elements
Remove glass containers from narrative text sections. Let text breathe freely.
- Tagline on race page: remove glass-badge, just floating italic text with no container
- RaceStory: unwrap from glass-card, bare text with section label
- PatternPrecedents: unwrap from glass-card, bare text
- Rule: glass for data panels (Results, Simulator, GoDeeper), bare text for narratives

### Step 2: Hero image + intro cards
- Hero image: increase opacity from 30% to 50-55%, adjust gradient to blend with glass cards
- Intro feature cards: strip descriptions, make them compact one-liners (icon + title only)
- Reduce card grid from 5 items to a single clean row of feature pills
- Keep the car animation and RACEDAY title untouched

### Step 3: Race page layout rebalance
- Move RadioMoments from main content to sidebar (below StrategySimulator)
- Move PatternPrecedents into GoDeeper accordion as a new item
- This shortens the main scroll significantly — Results → KeyMoments → Story → GoDeeper
- Adjust sidebar spacing for the new radio section

---

## Phase 8F-2: Championship + Patterns Content (Steps 4-6)

### Step 4: Championship season progression chart
- Add a recharts line chart showing points accumulation across races
- X-axis: race rounds, Y-axis: cumulative points
- Show top 3-5 drivers as colored lines (team colors)
- Place it between the leader card and the standings table
- Data comes from existing /championship/{year}/drivers endpoint (may need a new endpoint for per-race progression)

### Step 5: Pattern Finder quick presets
- Add clickable preset buttons above the filter form: "Wet race upsets", "Monaco winners", "5+ retirements", "Won from P10+", "Championship deciders"
- Each preset fills in the form fields and triggers a search
- Styled as glass pills in a horizontal row

### Step 6: Pattern Finder popular patterns
- Add a section below the form (before results) showing auto-generated stats
- "Rain races produce first-time winners 3x more often"
- "The average grid position of a Monaco winner is P2"
- These can be hardcoded initially or computed from the existing data
- Styled as a glass card with stat highlights

---

## Phase 8F-3: Deploy (Steps 7-9)

### Step 7: Backend deploy to Railway
- Create Railway project, connect GitHub repo
- Set up environment variables (port 8888, any API keys)
- Deploy backend, verify /seasons/summary endpoint responds
- Note the deployed URL

### Step 8: Frontend deploy to Vercel
- Connect GitHub repo to Vercel
- Set NEXT_PUBLIC_API_URL to the Railway backend URL
- Deploy, verify all pages load
- Test: home page, race page, championship, patterns, live

### Step 9: Final verification + Chrome Web Store prep
- Test the full deployed site end-to-end
- Update the extension's API URL to point to production
- Package extension for Chrome Web Store submission
- Push final commits, update product-analysis-and-vision.md with deployed URLs
