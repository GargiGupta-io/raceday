# Phase 8F: Cinematic Home Page Scroll + Railway/Vercel Deploy

> Transforming the RaceDay home page from a single-screen hero into a multi-section cinematic scroll experience with GSAP-powered animations — then deploying the full stack to Railway (backend) and Vercel (frontend).

---

## In Plain English

Imagine walking into a movie theater. Before the film starts, there's a moment — the lights dim, the screen goes dark, and then the first image hits you full-screen. That's what we built for RaceDay's home page.

Before this work, visiting RaceDay showed you a single screen: a title, some small feature pills, and a "pick a season" button. It worked, but it felt like a menu screen, not an experience. You'd click the button and start using the app. Nothing made you pause and think "this is special."

After this work, visiting RaceDay for the first time triggers a loading animation (an F1 car driving across a progress counter), then drops you into a full-screen "RACEDAY" title. As you scroll down, an F1 car flies across the viewport — tied to your scroll position, not auto-playing. Then five full-screen sections reveal themselves one by one, each with a dark F1 photograph filling the viewport and text that fades in from a blur. At the bottom, you pick a season from a grid. The whole thing feels like scrolling through a luxury brand website — because we literally studied Chanel and a space startup called GRU Space to build it.

We also deployed the entire app: Python/FastAPI backend on Railway, Next.js frontend on Vercel. The backend indexes all F1 races from 2010-2026 on startup, and the frontend talks to it via environment variables.

## What Is GSAP ScrollTrigger?

GSAP (GreenSock Animation Platform) is the industry-standard JavaScript animation library. It's used by Apple, Google, Nike, and most high-end marketing sites. It's ~30KB gzipped and handles things that CSS animations can't — particularly scroll-linked animations.

ScrollTrigger is a GSAP plugin that lets you tie animations to scroll position. Instead of an animation playing when the page loads (like CSS `@keyframes`), ScrollTrigger says "play this animation when this element enters the viewport" or "scrub this animation forward/backward based on how far the user has scrolled."

The key concept is **scrub**. When `scrub: true`, the animation's progress is literally mapped to the scrollbar position. Scroll down 50% of the trigger distance → animation is 50% complete. Scroll back up → animation reverses. This creates the feeling that the user is "controlling" the animation with their scroll, which is the exact technique GRU Space uses for their earth rotation and Chanel uses for their watch reveals.

**Pin** is the other core concept. When ScrollTrigger pins an element, it locks that element in place on the screen while the user continues scrolling. The content below "waits" until the pinned animation completes. This is how the car animation section works — the car section stays fixed while you scroll, and the car drives across based on your scroll progress.

## The Problem It Solves

Most developer portfolio projects have the same home page: a hero section with the project name, some feature cards in a grid, and a call-to-action. It's functional but forgettable. Recruiters spend 30 seconds on a portfolio site — if the first impression is a standard dark-mode grid, they've already categorized it as "another side project."

The cinematic scroll pattern changes the first impression from "this is a data tool" to "this person can build experiences." The actual features (race stories, strategy simulator, etc.) are the same — but presenting them as full-viewport scroll reveals with blur-to-sharp animations and dark F1 photography makes the visitor feel like they're exploring something premium.

The two reference sites we studied:
- **Chanel J12** (chanel.com/us/watches/the-j12-watch/) — Pure monochrome, massive typography, extreme whitespace, full-bleed photography, gentle scroll reveals. Silent luxury.
- **GRU Space** (gru.space) — Pure black + white, 160-frame scroll-linked sequence, GSAP + ScrollTrigger, Three.js 3D model, SplitText word reveals. Motion IS the design language.

Common patterns extracted: no decorative elements, all visual richness from content (images, video, 3D), massive spacing, scroll-driven reveals, blur-to-sharp text animations, large fonts with wide letter-spacing.

## What We Built

### Architecture Overview

The home page is now a vertical scroll story with 8 sections:

```
┌─────────────────────────────────┐
│  PageLoader (first visit only)  │  ← z-9999 overlay, sessionStorage skip
├─────────────────────────────────┤
│  HeroSection (100vh)            │  ← RACEDAY title, scroll indicator
├─────────────────────────────────┤
│  ScrollCarAnimation (100vh+)    │  ← Pinned, car drives on scroll
├─────────────────────────────────┤
│  FeatureSection: Race Stories   │  ← 100vh, f1-pack-racing.jpg, left align
├─────────────────────────────────┤
│  FeatureSection: Strategy Sim   │  ← 100vh, cockpit-detail.jpg, right align
├─────────────────────────────────┤
│  FeatureSection: Team Radio     │  ← 100vh, night-race.jpg, left align
├─────────────────────────────────┤
│  FeatureSection: Pattern Finder │  ← 100vh, aerial-racing.jpg, right align
├─────────────────────────────────┤
│  FeatureSection: 16 Seasons     │  ← 100vh, monaco-tight.jpg, left align
├─────────────────────────────────┤
│  SeasonPicker (100vh)           │  ← Grid of season cards, click to enter
└─────────────────────────────────┘
```

All images are existing dark-themed F1 photographs already in `/public/images/`. No external assets were added.

### Component Breakdown

**5 new files created:**
1. `PageLoader.tsx` — Full-screen first-visit loading animation
2. `ScrollCarAnimation.tsx` — GSAP-pinned car flyby section
3. `FeatureSection.tsx` — Reusable full-viewport feature showcase
4. `DataLoader.tsx` — Inline loading animation for data fetches
5. `phase8f-cinematic-scroll-and-deploy.md` — This document

**2 files rewritten:**
1. `IntroHero.tsx` — Complete rewrite from single-screen to scroll composition
2. `page.tsx` — Layout restructure + DataLoader integration

**1 file updated:**
1. `globals.css` — Added `driveLoader` keyframe

### 1. PageLoader — The First Impression

Plain English: When someone visits RaceDay for the very first time, they see a black screen with an F1 car driving across as a number counts from 0 to 100. Once it hits 100, the screen fades out and reveals the site. If they navigate to another page or refresh, the loader doesn't show again for the rest of their session.

**frontend/app/components/PageLoader.tsx**

The loader uses three pieces of React state:
- `progress` (0-100) — the visible counter number
- `done` (boolean) — triggers the fade-out animation
- `hide` (boolean) — removes the component from the DOM entirely

The progress simulation uses variable speed to feel natural:
```typescript
if (current < 60) {
  current += Math.random() * 8 + 4;      // Fast start: big jumps
} else if (current < 90) {
  current += Math.random() * 3 + 1;      // Slow middle: builds tension
} else {
  current += Math.random() * 2 + 2;      // Quick finish: satisfying end
}
```

This mirrors how real loading bars feel — they start confidently, slow down when things get heavy, then rush to completion. The randomness (`Math.random()`) prevents it from looking mechanical.

The sessionStorage check is the first thing that runs:
```typescript
if (sessionStorage.getItem("raceday_loader_done")) {
  setHide(true);
  return;  // Exits immediately — no loader, no animation
}
```

`sessionStorage` (not `localStorage`) is the right choice because it clears when the browser tab closes. This means returning visitors the next day see the loader again (which is fine — it's a 2-second experience), but navigating between pages within a session never re-triggers it.

The visual layers:
1. **Car SVG** — positioned using `left: ${progress * 0.6}%` so it drives from left to right as progress increases
2. **Trail line** — a gradient line behind the car that grows with progress
3. **Counter** — large `text-5xl font-light tracking-widest` number, tabular-nums for even spacing
4. **Bottom bar** — a 2px red line across the bottom that fills like a progress bar

### 2. ScrollCarAnimation — The Wow Moment

Plain English: After the RACEDAY title, there's a full-screen black section. As you scroll, an F1 car flies from right to left across the screen — your scrolling controls the car's speed. Red speed lines trail behind it. Text appears mid-scroll saying "Every Race Has a Story" and then fades away as the car exits.

**frontend/app/components/ScrollCarAnimation.tsx**

This is the most technically interesting component. It uses GSAP's ScrollTrigger with two key settings:

```typescript
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: section,
    start: "top top",
    end: "+=150%",
    pin: true,
    scrub: 1,
    anticipatePin: 1,
  },
});
```

What each setting does:
- `trigger: section` — this element triggers the animation
- `start: "top top"` — animation starts when the section's top hits the viewport's top
- `end: "+=150%"` — the animation spans 150% of the viewport height of scroll distance
- `pin: true` — locks the section in place while the user scrolls through the animation
- `scrub: 1` — ties animation progress to scroll position with 1 second of smoothing (prevents jitter)
- `anticipatePin: 1` — prevents a visual "jump" when pinning starts

The timeline has four parallel tracks:
1. **Car movement**: `xPercent: 120` → `xPercent: -30` (drives from off-screen right to off-screen left)
2. **Glow orb**: follows the car with a `radial-gradient` red glow and `blur(40px)`
3. **Speed lines**: 5 horizontal lines that scale in, hold, then fade out at staggered times
4. **Center text**: fades in at 30% scroll with blur-to-sharp, fades out at 80% scroll

The car size is responsive: `w-[280px] sm:w-[360px] md:w-[440px]` — bigger on larger screens for impact.

### 3. FeatureSection — The Scroll Reveal Pattern

Plain English: Each feature gets its own full-screen section. A dark F1 photograph fills the entire viewport as background. As you scroll into view, a small red line grows, then the feature name blurs into focus, then the description text appears. The features alternate left and right alignment.

**frontend/app/components/FeatureSection.tsx**

This component takes props and is reused 5 times:
```typescript
interface FeatureSectionProps {
  image: string;      // Background image path
  title: string;      // "Race Stories", "Strategy Simulator", etc.
  subtitle: string;   // Small red text above the title
  description: string; // 2-3 sentences about the feature
  align: "left" | "right";  // Text position
  index: number;      // Controls eager vs lazy loading
}
```

Two separate GSAP animations run:

**1. Image parallax (scrub-linked):**
```typescript
gsap.fromTo(imageRef.current,
  { scale: 1.15 },
  { scale: 1, scrollTrigger: { scrub: true } }
);
```
The image starts 15% zoomed in and slowly zooms to normal as you scroll through the section. This creates a subtle parallax depth effect — the image "moves" slower than the page, like looking through a window.

**2. Content reveal (triggered once):**
```typescript
tl.fromTo(titleRef.current,
  { opacity: 0, y: 20, filter: "blur(12px)" },
  { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7 }
);
```
The text starts invisible, 20px below its final position, and blurred. It fades in, slides up, and sharpens — all in 0.7 seconds. This is the Chanel/GRU pattern: blur-to-sharp makes text feel like it's materializing from depth rather than just appearing.

The `toggleActions: "play none none reverse"` setting means the animation plays when scrolling down into view and reverses when scrolling back up — so the text disappears again if you scroll up past it.

Image overlays stack for readability:
1. `bg-black/70` — heavy dark base
2. Directional gradient — darker on the text side (left or right)
3. Top/bottom fade — blends into the page background color (`#08080c`)

### 4. IntroHero — The Composition Layer

Plain English: IntroHero used to be a single component with everything in it. Now it's a thin wrapper that composes all the scroll sections in order: hero title, car animation, five features, season picker.

**frontend/app/components/IntroHero.tsx**

The old IntroHero contained:
- `F1CarSilhouette` SVG component (deleted — now in ScrollCarAnimation)
- `FEATURES` array with emoji icons (deleted — replaced with full feature configs)
- `AnimatedCarIntro` with CSS transitions (deleted — replaced with GSAP)
- Feature pills (deleted — replaced with full-viewport sections)
- CTA button (deleted — replaced with SeasonPicker)

The new IntroHero is a composition:
```tsx
<div>
  <HeroSection />
  <ScrollCarAnimation />
  {FEATURES.map((f, i) => <FeatureSection key={i} index={i} {...f} />)}
  <SeasonPicker seasons={seasons} onSelectYear={onSelectYear} />
</div>
```

The `FEATURES` array now contains full descriptions:
```typescript
const FEATURES = [
  {
    image: "/images/f1-pack-racing.jpg",
    title: "Race Stories",
    subtitle: "Beyond the Results",
    description: "Every Grand Prix is more than a finishing order...",
    align: "left",
  },
  // ... 4 more
];
```

The HeroSection is simpler than before — just the title and a scroll indicator. The title is much larger: `text-7xl sm:text-9xl md:text-[10rem]` (up from `text-6xl sm:text-8xl`). The scroll indicator fades out as you scroll via GSAP.

### 5. SeasonPicker — The Destination

Plain English: After scrolling through all the features, you reach a full-screen section that says "Choose Your Season" with a grid of clickable cards — one for each season from 2025 back to 2010. Each card shows the year, champion name, and team, with a colored left border matching the team color. Clicking one takes you into the race explorer.

The grid uses `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` for responsive columns. Cards use the same `glass-card` class from the existing design system, plus a team-colored left border (`border-l-2 ${TEAM_COLOR[s.team]}`).

Scroll reveal uses the same blur-to-sharp pattern: title fades in first, subtitle second, grid third — staggered at 0, 0.2s, 0.35s.

### 6. DataLoader — Replacing Blank Screens

Plain English: Instead of showing skeleton shimmer boxes or blank screens when data is loading, we now show a small F1 car driving back and forth with a label like "Loading races..." underneath.

**frontend/app/components/DataLoader.tsx**

Three sizes: `sm` (inline), `md` (section), `lg` (full-page replacement). The car animation uses a CSS keyframe:

```css
@keyframes driveLoader {
  0% { transform: translateX(-20%); }
  50% { transform: translateX(80%); }
  100% { transform: translateX(-20%); }
}
```

This replaced the 12-card skeleton grid on the home page with a single `<DataLoader size="lg" label="Loading races..." />`.

## Railway Deployment — Backend

The FastAPI backend runs on Railway at `web-production-b8406.up.railway.app`.

### Port Issue

The original start commands used `${PORT:-8888}` bash syntax. This works in local terminals but fails in Docker (exec form doesn't run through a shell) and Nixpacks (variable expansion not supported in config files). The error was:

```
Error: Invalid value for '--port': '${PORT:-8888}' is not a valid integer.
```

**Fix**: Read PORT from Python instead of relying on shell expansion:
```python
import os; import uvicorn
uvicorn.run('backend.api:app', host='0.0.0.0', port=int(os.environ.get('PORT', 8888)))
```

We also deleted `nixpacks.toml` entirely — Railway's auto-detection works fine for a Python project with a `Procfile` and `requirements.txt`.

### Background Indexing

On startup, the backend spawns a daemon thread that indexes all F1 seasons (2010-current) via FastF1. Each season takes several minutes because FastF1 downloads race data from the F1 API. The indexing status is visible at `/indexing/status`:

```json
{"running":true,"current_year":2011,"completed_years":[2010],"total_indexed":19}
```

Railway's filesystem is ephemeral — data is lost on every redeploy. The `INDEX_DIR` and `CACHE_DIR` environment variables point to `./data/index` and `./data/cache` respectively. For persistence, Railway would need a volume mount, but the current approach (re-index on deploy) works for the scale of data.

## Vercel Deployment — Frontend

The Next.js frontend deploys on Vercel from the `frontend/` root directory.

### Environment Variables

Only one is needed:
| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://web-production-b8406.up.railway.app` |

The Supabase variables were removed — login was cut in an earlier phase and no code references Supabase anymore.

### CORS Configuration

The backend's CORS middleware accepts any `*.vercel.app` origin:
```python
allow_origin_regex=r"https://.*\.vercel\.app",
```

## Design Decisions

### Why GSAP over CSS-only animations?

CSS can handle fade-ins and simple transitions. But three things require GSAP:
1. **Scroll-linked scrub** — CSS has no way to tie animation progress to scroll position
2. **Pinning** — holding an element fixed while scrolling requires JavaScript scroll listeners + transforms
3. **Timeline orchestration** — staggering multiple elements with precise timing is verbose in CSS but natural in GSAP timelines

The trade-off is 30KB of JavaScript. For a portfolio site where the animation quality is the differentiator, this is worth it.

### Why full-viewport sections?

The Chanel pattern: one idea per screen. When every section is 100vh, the user processes one thing at a time. It forces a slower, more deliberate scroll — the same rhythm as flipping through a magazine. This is the opposite of cramming features into a grid, which encourages scanning rather than reading.

### Why blur-to-sharp?

GRU Space and Chanel both use this pattern. A simple fade-in (opacity 0→1) feels flat — the element "appears." Adding `filter: blur(12px)` → `blur(0px)` makes the element feel like it's coming into focus, like adjusting a camera lens. Combined with a slight upward translate (y: 20→0), it creates the sensation of depth — the text is materializing from the background rather than being placed on top of it.

## Phase 8F — Statistics

| Metric | Value |
|--------|-------|
| New files | 4 components + 1 learning doc |
| Rewritten files | 2 (IntroHero.tsx, page.tsx) |
| Updated files | 2 (globals.css, phase8e learning doc) |
| New dependency | gsap (~30KB gzipped) |
| Total commits | 11 |
| Sections on home page | 8 (loader + hero + car + 5 features + picker) |
| Images used | 6 (all existing, dark F1 themed) |
| Deploy targets | Railway (backend) + Vercel (frontend) |
| Build status | 0 errors, 0 warnings |

## What RaceDay's Home Page Looks Like Now vs Before

**Before Phase 8F:**
- Single 100vh screen
- Title + feature pills (small badges) + CTA button
- Small CSS car animation (auto-plays once on load)
- Click button → jump to season grid
- Skeleton shimmer during data loads
- Not deployed

**After Phase 8F:**
- 8 full-viewport scroll sections
- GSAP-powered car flyby tied to scroll position
- 5 dark F1 photographs filling the viewport
- Blur-to-sharp text reveals on each section
- First-visit loading screen with progress counter
- Season picker grid at the bottom
- F1 car animation for all loading states
- Deployed on Railway + Vercel

---

*Generated: 2026-03-27 | Project: RaceDay | Phase 8F: Cinematic Scroll + Deploy (11 commits)*
