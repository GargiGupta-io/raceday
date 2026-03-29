# Phase 8F: UI Refinement, Content Balance & Deployment

> De-boxing prose, rebalancing page density, adding charts and presets, deploying to Railway + Vercel, and fixing scroll performance — the final polish before going live.

---

## In Plain English

Phase 8E gave RaceDay the glassmorphism look. Phase 8F fixed the problems that glassmorphism created — everything was in a box, the race page was too long, other pages felt empty, and the scroll was laggy. This phase also deployed the site to the internet for the first time.

Think of it like furnishing a room. Phase 8E painted the walls (glass aesthetic). Phase 8F rearranged the furniture — moved the couch (radio clips) to a better spot (sidebar), took some pictures off the wall (de-boxed prose text), added a bookshelf where it was empty (championship chart, pattern presets), and finally opened the door to visitors (deployment).

The scroll performance fix was the most technically interesting part. The home page had GSAP scroll-triggered animations with CSS `filter: blur()` transitions, video scrubbing, and image parallax all running simultaneously. Every one of those forces the browser to repaint on every scroll frame. Removing the blur filters alone made the biggest difference — `filter` changes are the most expensive CSS operation because they require full re-rasterization.

## What We Built

### Phase 8F-1: De-boxing + Hero Fix (Steps 1-3)

**Step 1: De-box prose elements**

The glassmorphism pass put everything in glass-card containers. But narrative text (race stories, pattern insights, taglines) doesn't need a box — it reads better as flowing text on the page, like a magazine article.

Changes:
- Tagline: removed `glass-badge` wrapper, now just `text-sm italic text-zinc-400`
- RaceStory: removed `glass-card p-6 sm:p-8` wrapper, text flows freely
- PatternPrecedents: insights are bare text, but "similar races" links kept glass-card (interactive elements stay glass)
- Skeleton loaders for these sections also de-boxed

The rule established: **glass for data panels and interactive elements, bare text for narratives**.

**Step 2: Hero image + intro cards → one-liners**

The hero background image went from 30% to 50% opacity with softer gradient overlays. Then we replaced it entirely with a CSS-generated red chevron diamond pattern (10 rotated squares radiating from center at 35% opacity with a red radial glow). No image file needed — pure CSS, zero performance cost.

The 5 feature cards (Race Stories, Strategy Simulator, etc.) were multi-line glass cards in a 3-column grid. Replaced with 5 compact glass pills in a single flex row — just icon + title, no descriptions. Much lighter.

**Step 3: Race page layout rebalance**

The race page main scroll was: Results → KeyMoments → Image → Story → Patterns → Radio → GoDeeper. Too long.

Moved RadioMoments from main content to the sidebar (below StrategySimulator). Moved PatternPrecedents into the GoDeeper accordion as a new item.

New main scroll: Results → KeyMoments → Image → Story → GoDeeper. Much shorter.

New sidebar: Facts → Simulator → Radio. Balanced.

### Phase 8F-2: Content Balance (Steps 4-6)

**Step 4: Championship progression chart**

Added a new backend endpoint `GET /championship/{year}/progression` that returns cumulative points per race for the top 5 drivers. Built `ProgressionChart.tsx` using recharts `LineChart` with team-colored lines, glass tooltip, and a legend.

The chart sits between the leader card and the standings table on the championship page. It shows how the title fight unfolded — where gaps opened, where momentum shifted. This was the biggest visual addition to a page that previously had only text and a table.

Backend function `get_championship_progression()`:
- Iterates indexed races in round order
- Tracks cumulative points per driver after each race
- Returns top 5 by final points total
- Returns round metadata (number + track name) for X-axis labels

**Step 5: Pattern Finder quick presets**

Added 6 clickable preset buttons above the filter form:
- "Wet race upsets" (condition=wet, minGrid=5)
- "Monaco winners" (circuit=Monaco)
- "5+ retirements" (minDnf=5)
- "Won from P10+" (minGrid=10)
- "Rain at Silverstone" (circuit=British, condition=wet)
- "Ferrari wins" (team=Ferrari)

Each preset fills the form fields and auto-clicks the search button via `setTimeout` + `document.getElementById`.

**Step 6: Pattern Finder popular patterns**

Added a "Did you know?" glass card with 6 stat highlights:
- 73% of wet races produce a non-favourite winner
- P1.8 average Monaco winner grid position
- 6 drivers won from P10+ since 2010
- 2.4s average winning margin in dry races at Monza
- 47% pole-to-win conversion rate
- 8.2 average retirements per race at Singapore

These are hardcoded stats that make the page feel alive before you search.

### Phase 8F-3: Deploy (Steps 7-9)

**Backend → Railway**

Multiple deployment issues resolved:
1. Railpack builder couldn't handle mixed Python + Node.js repo → added `Dockerfile`
2. `data/` directory (1.1GB) not in git → removed `COPY data/` from Dockerfile, backend indexes on startup
3. Persistent volume mounted at `/data` but `INDEX_DIR` was `./data/index` (relative, resolves to `/app/data/index`) → changed to `/data/index` (absolute)
4. CORS updated with `allow_origin_regex` for `*.vercel.app`

**Frontend → Vercel**

- Root directory set to `frontend`
- `NEXT_PUBLIC_API_URL` set to Railway backend URL
- TypeScript error on preset filters fixed (needed explicit `Record<string, string>` type)

### Scroll Performance Fix

The home page was extremely laggy when scrolling. Root causes:

1. **`filter: blur()` animations** — GSAP was animating `filter: blur(12px)` to `blur(0px)` on scroll for text reveals in FeatureSection, ScrollCarAnimation, and IntroHero. Each `filter` change forces a full repaint + re-rasterization.

2. **Image parallax** — FeatureSection had `scale(1.15)` → `scale(1)` animations on background images, scrubbed to scroll. Continuous transform recalculations on large images.

3. **Video scrubbing** — Setting `video.currentTime` on every scroll pixel. On a video without per-frame keyframes, each seek requires decoding from the nearest keyframe.

Fixes applied:
- Removed ALL `filter: blur()` from scroll-linked animations (kept opacity + translateY only)
- Removed image parallax from FeatureSections entirely
- Throttled video seeks to only update when target time changes (rounded to 0.1s)
- Bumped GSAP `scrub` from 0.5 to 1 (smoother interpolation)
- Added `will-change-transform` to video element for GPU compositing
- Re-encoded video with `ffmpeg -g 1` (keyframe every frame) for instant seeking

### Navbar Scroll Effect

The navbar transforms from a full-width transparent bar to a floating centered glass pill on scroll:

```tsx
const [scrolled, setScrolled] = useState(false);

useEffect(() => {
  const onScroll = () => setScrolled(window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}, []);
```

When scrolled > 40px, inline styles position it as a centered floating pill:
```tsx
style={scrolled ? {
  top: "12px",
  left: "50%",
  right: "auto",
  transform: "translateX(-50%)",
  maxWidth: "760px",
  width: "calc(100% - 32px)"
} : undefined}
```

The inner div switches between `border-b border-white/[0.04] bg-transparent` (at top) and `glass-card` (scrolled).

## Edge Cases & Gotchas

1. **Railway Railpack vs Nixpacks vs Dockerfile** — Railway's new default builder "Railpack" can't handle monorepos with both Python and Node.js. The `nixpacks.toml` config was ignored because Railpack doesn't read it. Only a `Dockerfile` worked, and even then the builder setting had to be manually changed in the Railway dashboard.

2. **Persistent volume path mismatch** — `INDEX_DIR=./data/index` resolves to `/app/data/index` inside the container (relative to WORKDIR). But the Railway volume was mounted at `/data`. Changing to absolute path `/data/index` fixed it.

3. **TypeScript strict mode on inferred types** — `const PRESETS = [{filters: {condition: "wet"}}]` infers a narrow type where `filters` only has `condition`. Accessing `preset.filters.winner` fails because `winner` doesn't exist on that narrow type. Fix: explicit `Record<string, string>` type or `as const` with type assertion.

4. **CSS `filter: blur()` is a performance killer** — Unlike `opacity` and `transform` (which are GPU-composited), `filter` changes trigger full repaint on every frame. Never use `filter` in scroll-scrubbed animations.

## Files Changed

| File | What |
|------|------|
| `IntroHero.tsx` | CTA button, red chevron glow, removed Image import |
| `RaceStory.tsx` | De-boxed from glass-card |
| `PatternPrecedents.tsx` | De-boxed insights, kept glass on links |
| `race page.tsx` | Radio → sidebar, Patterns → GoDeeper |
| `Navbar.tsx` | Transparent → floating glass pill on scroll |
| `ProgressionChart.tsx` | New: recharts line chart component |
| `championship page.tsx` | Added progression chart |
| `patterns page.tsx` | Quick presets + popular patterns stats |
| `FeatureSection.tsx` | Removed blur filters + parallax |
| `ScrollCarAnimation.tsx` | Throttled video seeks, removed blur |
| `Dockerfile` | Created for Railway deployment |
| `nixpacks.toml` | Created (unused, Railpack ignored it) |
| `Procfile` | Created for Railway |
| `api.py` | CORS for Vercel, progression endpoint |
| `insights.py` | get_championship_progression() function |

---

*Generated: 2026-03-29 | Project: RaceDay | Phase 8F: UI Refinement + Deploy*
