# Phase 9 — Beginner UX, Route Architecture, and Performance Optimization

> Making RaceDay approachable to newcomers while cutting ~10 MB of dead weight and eliminating the main sources of scroll jank. Also: hackathon demo prep via git branch snapshots.

---

## The Big Picture

This session started with a practical problem: the user needed hackathon demo videos showing "weekly progress" for a project that was already complete. It evolved into a full UX + performance overhaul.

Three distinct workstreams ran in one session:
1. **Hackathon demo staging** — git branch snapshots of 3 project milestones
2. **Beginner-friendliness** — making the site navigable for someone who's never seen F1
3. **Performance surgery** — a real audit + 5 concrete optimizations

---

## Part A: Hackathon Demo Branches

### The Problem
Hackathon requires video evidence of progress over 3 weeks. The project was already complete.

### The Solution
Used git history to create 3 branches at natural milestone commits:

| Branch | Commit | Shows |
|--------|--------|-------|
| `week1-demo` | `c2edaac` (Phase 4D) | Basic tabs + sidebar, no storytelling |
| `week2-demo` | `52da9ef` (Phase 7A) | Full feature set, pre-glassmorphism |
| `week3-demo` | `HEAD` | Final polished product |

### Gotchas
- **Shared `node_modules`**: Week 1's `package.json` still referenced `@supabase/supabase-js` which was removed from `node_modules` by master. Had to `npm install` it temporarily.
- **Missing `.env.local`**: Week 1 expected Supabase environment variables. Created dummy values so the old `AuthButton` component wouldn't crash at import time.
- **Port differences**: Week 1 used port 8080 (hardcoded), Weeks 2–3 use 8888.
- **OneDrive branch collision**: Another Claude terminal switched to `week2-demo` mid-session, silently changing the repo out from under us. Caught by noticing `git status` showed we were on the wrong branch. Key lesson: when running multiple Claude terminals on the same repo, branches WILL collide.

---

## Part B: Beginner-Friendly UX

### Route Architecture Change

**Before**: Homepage (`/`) did double duty — showed the cinematic intro when no year was selected, and showed the race grid after year selection. The "Races" nav link pointed to `/`.

**After**:
- `/` — Always shows the cinematic intro (hero, car animation, feature sections). Logo click → here.
- `/races` — Dedicated race grid with year pills, weather filter, latest race banner. "Races" nav link → here.
- `/races?year=2026` — auto-selects a year.
- `/new-to-f1` — Full beginner guide page.

This means the intro is a *gateway*, not a mode toggle. Newcomers get the full pitch; returning users jump straight to `/races`.

### NewToF1Card (Homepage Primer)
A glass card on the homepage intro (between car animation and first feature section) with:
1. **"What is F1?"** — two-sentence explainer
2. **"Right now"** — auto-fetched current round + next race + date
3. **Three starter races** — Brazil 2008, Abu Dhabi 2021, Turkey 2020 with one-line hooks
4. **CTA button** → `/new-to-f1` for the full guide

The card fetches `/races/{latestYear}` to compute the "Right now" line. Latest year is derived from the seasons summary passed down from the homepage.

### /new-to-f1 Beginner Guide Page
Full static page (no backend calls) with:
- What is F1? (points, championships, 2 paragraphs)
- Race weekend format (Practice/Qualifying/Race with day-by-day cards)
- Cars, tyres, teams (tyre compound colour key)
- "How to read a RaceDay race page" (explains Race Story, Key Moments, Pattern Precedents, Go Deeper, Strategy Simulator)
- Full glossary (all 16 terms from glossary.ts)
- Three starter races with longer contextual hooks

### Glossary Tooltip System
Two files:
- `lib/glossary.ts` — `Record<string, string>` of 16 F1 terms + `getDefinition()` helper
- `components/GlossaryTerm.tsx` — hover/tap tooltip component + `wrapGlossaryTerms()` auto-scanner

The auto-scanner uses a single pre-compiled regex that matches all terms (longest first to prevent "pit" matching before "pit window"). It's applied to:
- `RaceStory.tsx` narrative paragraphs
- `HighlightedText.tsx` (used by StrategyStory — plain-text segments between driver name highlights get glossary wrapping)
- `StrategyKey.tsx` compound descriptions and stat labels

**Key bug**: After refining `.glass-card` to ultra-low opacity (0.028), the tooltip using `glass-card` became invisible (page text bled through). Fixed by giving the tooltip its own near-opaque background: `rgba(10, 10, 12, 0.97)` with inline style, not the shared class.

### "Pick a Season" CTA Relocation
Moved from a standalone `SeasonPicker` component at the bottom of the intro to an inline CTA button inside the first `FeatureSection` (Race Stories). Added an optional `cta` prop to `FeatureSection` so only one instance gets it. Deleted the old `SeasonPicker` component (~70 lines).

---

## Part C: UI Polish

### Pure Black Background
Removed the three navy-blue radial gradients from `globals.css` body (rgba(30, 30, 80, 0.25) etc.) that created a subtle blue tint. Replaced with `background: #000000`. Also replaced all `#08080c` edge-fade references across FeatureSection, ScrollCarAnimation, SectionDivider, IntroHero with pure `black`.

### Red Glow Behind Panels
Added soft blurry red radial gradients behind:
- **NewToF1Card** — two layers: outer (1100px, blur 120px, 0.22 opacity) + inner (700px, blur 80px, 0.18 opacity)
- **Footer** — similar two-layer treatment (1500×900 + 900×650)

Both containers use `overflow-hidden` to prevent glow from leaking into adjacent sections.

### Navbar Overhaul
- **Removed scroll morph**: was transforming from full-width bar into a centered floating pill with `left: 50%, translateX(-50%), maxWidth: 760px` on scroll. Replaced with always-transparent, full-width, fixed-top navbar.
- **Removed scroll state entirely**: no more `useState`/`useEffect` for scroll detection. Zero JS cost.
- **Size increase**: brand text-sm → text-2xl/3xl, links text-[11px] → text-sm/base, padding py-3 → py-8/10, max-width 5xl → 7xl.

### Footer
New `Footer.tsx` component wired into root `layout.tsx`:
- **Glass card wrapper** (`glass-card-blur` for the frosted glass effect)
- **4-column grid**: RACEDAY brand / Explore (site nav) / Learn (beginner content links) / Data (external data source links)
- **Top gradient fade** — a 56-tall `from-transparent to-black` div with negative margin `-mt-40` that pulls into the preceding section, creating a smooth image-to-footer merge instead of a hard black gap.
- **RACEDAY logo** in Racing Sans One font with red accent

### Glass-Card Refinement
Tightened `.glass-card` styling:
- Darker base: `rgba(255,255,255,0.05)` → `rgba(20, 20, 24, 0.6)` (solid-ish instead of milky glass)
- Stronger inner highlight: 0.04 → 0.07
- Layered shadow: sharp 1px near + soft 24-48px far (instead of one puffy shadow)
- Created `.glass-card-blur` opt-in variant for panels that genuinely benefit from frosted glass

---

## Part D: Performance Optimization

### The Audit
Spawned an Explore agent to audit the full codebase. The agent flagged 6 "dead" backend endpoints — but 4 of those were actually in active use. Manual grep-verification was essential before deleting anything. Only `/quiz` and `/standings` were truly dead.

### 5 Optimizations Executed

**1. Dead endpoint cleanup** (`7bd2b77`)
- Deleted `/quiz` endpoint + `generate_race_quiz()` function (157 lines)
- Deleted `/standings` endpoint
- Removed the wasted `safeFetch(\`${base}/standings\`)` from the frontend race page — this was making a network call on every race page load and throwing away the response

**2. JPEG → WebP conversion** (`3c3174b`)
- Converted 6 FeatureSection background images from JPEG to WebP via ffmpeg
- Total: 2.4 MB → 1.4 MB (42% reduction)
- Updated all references in IntroHero.tsx and races/[year]/[track]/page.tsx
- Deleted original JPEGs

**3. GSAP ScrollTrigger → IntersectionObserver** (`78bbdd9`)
- Replaced all GSAP usage in FeatureSection with a single `IntersectionObserver` + CSS transitions
- 5 `ScrollTrigger` instances eliminated (one per feature section)
- Same staggered fade-in visual effect using `transitionDelay` on each element
- GSAP still used in IntroHero (hero scroll indicator fade) — user explicitly chose to keep it there

**4. Flat glass-card by default** (`eb3435a`)
- Modified `.glass-card` to use solid dark rgba background instead of `backdrop-filter: blur(32px)`
- Modified `.glass` base class similarly
- Created `.glass-card-blur` and `.glass-blur` opt-in variants
- Updated Footer and NewToF1Card to use `.glass-card-blur` (static, once-per-page panels)
- Net result: **~21 backdrop-filter instances removed** from the scroll/repaint path

**5. 9.1 MB video → 52 KB parallax still** (`657e5a1` + `ca9499e`)
- Deleted `night-race-flyby.mp4` (9.1 MB)
- Extracted a single frame at 5s via `ffmpeg` from git history as `race-flyby-still.webp` (52 KB)
- Replaced Next.js `<Image>` (which doesn't support `backgroundAttachment`) with native CSS `background-image` + `background-attachment: fixed` for real parallax
- Removed GSAP ScrollTrigger from ScrollCarAnimation (was scrubbing video.currentTime on every scroll event)
- Text overlay uses IntersectionObserver fade-in instead of GSAP timeline

### Total Savings
| Metric | Before | After |
|--------|--------|-------|
| First-load weight | ~12 MB | ~2.5 MB |
| Backdrop-filter repaints | 21+ per scroll | 2 (static panels) |
| GSAP ScrollTrigger instances | 7 | 1 (hero only) |
| Scroll event listeners | 10+ | ~2 |
| Dead backend code | 195 lines | 0 |

---

## Key Lessons

1. **Audit agents can be wrong.** The Explore agent flagged 6 endpoints as "dead" — 4 were actively used. Always manually verify with `grep -r` against the frontend before deleting backend code.

2. **`backgroundAttachment: fixed` only works on CSS `background-image`**, not on `<img>` or Next.js `<Image>` elements. When you need parallax, use native CSS, not React components.

3. **Glass-card refinement has a tolerance threshold.** Making `background` opacity too low (0.028) makes the card invisible against dark backgrounds. Tooltips especially suffer because page text bleeds through. Either keep ~0.5+ opacity or give tooltips their own solid background.

4. **OneDrive + git = dangerous.** Moving a repo while another terminal is working on it causes `.git` to disappear from the old path. The commits exist on `origin/master` but the local working directory becomes orphaned. Solution: always work from a non-OneDrive path, keep OneDrive for documents only.

5. **Backdrop-filter is the silent killer.** 21 instances of `blur(32px)` doesn't look bad in DevTools but causes constant repaint work during scroll. The fix is trivially easy — `rgba(20, 20, 24, 0.6)` looks nearly identical to a frosted blur against a dark background.

6. **Video scrubbing is GPU hell.** Tying `video.currentTime` to scroll position means the browser decodes a video frame on every scroll event. A single static image + CSS parallax achieves 90% of the visual impact for 0.5% of the cost.

---

*Generated: 2026-04-12 | Project: RaceDay | Phase 9: Beginner UX + Performance Optimization*
