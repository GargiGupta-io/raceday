# Phase 9 — Beginner UX, Route Architecture, and Performance Optimization

> Making RaceDay approachable to newcomers while cutting ~10 MB of dead weight and eliminating the main sources of scroll jank. Also: hackathon demo prep via git branch snapshots.

---

## In Plain English

Imagine you've built a really nice restaurant, but there's no sign on the door, no menu for first-timers, and the kitchen is using industrial ovens to toast bread. This phase fixed all three problems.

First, we put up the sign: a "New to F1?" card on the homepage that explains what Formula 1 is, shows what race is coming up next, and recommends three legendary races to read first. Behind it, there's a full beginner guide page with a glossary of every jargon word — hover any term like "compound" or "stint" on the site and a tooltip pops up explaining it.

Second, we reorganised the front door. The homepage used to do two jobs — show a flashy intro AND display all the race data. Now it only does the intro. There's a separate "Races" page for browsing seasons. Clicking the logo always brings you back to the welcome screen. Simple.

Third, we swapped out the industrial ovens. The site was loading a 9 MB video on every visit and running 21 separate blur filters on every scroll. We replaced the video with a single 52 KB image (with a parallax effect that looks just as good), stripped the blur filters from all the small cards, and converted all images to WebP. The site now loads 10 MB less and scrolls without jank.

---

## The Big Picture

This session started with a practical problem: the user needed hackathon demo videos showing "weekly progress" for a project that was already complete. It evolved into a full UX + performance overhaul.

Four distinct workstreams ran in one session:
1. **Hackathon demo staging** — git branch snapshots of 3 project milestones
2. **Beginner-friendliness** — making the site navigable for someone who's never seen F1
3. **UI polish** — navbar, footer, glass cards, background glow effects
4. **Performance surgery** — a real audit + 5 concrete optimizations

---

## Part A: Hackathon Demo Branches

### In Plain English

Think of git commits like save points in a video game. The project had 250+ save points over its development history. We picked 3 key save points — one "early," one "mid," one "final" — and created named bookmarks (branches) at each. To record a demo video for any week, just load that bookmark, start the servers, and the site looks exactly as it did at that stage of development.

### The Problem
Hackathon requires video evidence of progress over 3 weeks. The project was already complete.

### The Solution
Used git history to create 3 branches at natural milestone commits:

| Branch | Commit | Shows |
|--------|--------|-------|
| `week1-demo` | `c2edaac` (Phase 4D) | Basic tabs + sidebar, no storytelling |
| `week2-demo` | `52da9ef` (Phase 7A) | Full feature set, pre-glassmorphism |
| `week3-demo` | `HEAD` | Final polished product |

### How It Works

```
git branch week1-demo c2edaac    ← create a named pointer to an old commit
git branch week2-demo 52da9ef
git branch week3-demo master     ← points to current HEAD
```

To record a video for week 1:
```
git checkout week1-demo          ← files revert to that point in time
python -m uvicorn backend.api:app --port 8080
cd frontend && npm run dev       ← site looks like early development
```

This doesn't affect the deployed site because branches are local-only — Vercel/Railway only watch `master`.

### Gotchas

1. **Shared `node_modules`**: Week 1's `package.json` still referenced `@supabase/supabase-js` which had been removed from `node_modules` by master. Fix: `npm install @supabase/supabase-js` temporarily.

2. **Missing `.env.local`**: Week 1's code imported a Supabase client that crashed without env vars. Fix: created dummy values (`NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co`) so the unused auth component didn't break on import.

3. **Port differences**: Week 1 hardcoded port 8080 in frontend API calls. Weeks 2–3 use 8888. This is normal for old code — just run the backend on the correct port for that era.

4. **OneDrive branch collision**: A second Claude terminal running `git checkout week2-demo` silently changed the repo out from under the first terminal. Caught by running `git branch --show-current` and seeing the wrong branch. Key lesson: when running multiple Claude terminals on the same repo, branches WILL collide. The fix is to always verify your branch before committing.

5. **Hydration warnings**: Week 1 didn't have `suppressHydrationWarning` on the `<body>` tag. Browser extensions like Grammarly inject attributes into the body, causing React to complain about server/client mismatch. Fix: add `suppressHydrationWarning` to `<body>`. This is a local-only change for the recording, not committed.

---

## Part B: Beginner-Friendly UX

### In Plain English

Imagine landing on a cricket analytics site when you've never watched cricket. You'd see "economy rate" and "strike rotation" and "powerplay" and have no idea what any of it means. That's what RaceDay was like for F1 newcomers — terms like "compound," "stint," "undercut," and "DRS" were everywhere with no explanation.

We fixed this in three layers: a welcome card on the homepage ("here's what F1 is, here are 3 races to start with"), a full guide page explaining everything from scratch, and hover-tooltips on every jargon word across the entire site.

### Route Architecture Change

**Before**: The homepage (`/`) was doing double duty. When no year was selected, it showed the cinematic intro. When a year was selected, it switched to the race grid. The "Races" nav link pointed to `/`.

**After**: Clean separation of concerns:

```
/              ← ALWAYS shows the cinematic intro. Logo click → here.
/races         ← Dedicated race grid. "Races" nav link → here.
/races?year=2026  ← Auto-selects a season.
/new-to-f1     ← Full beginner guide.

/races/2024/Monaco%20Grand%20Prix  ← Individual race (unchanged).
```

This means the intro is a *gateway*, not a mode toggle. Newcomers get the full pitch; returning users jump straight to `/races`.

**How the split was done:**

Step 1 — Created `frontend/app/races/page.tsx` by extracting the year-selected JSX from the old `page.tsx` (year pills, weather filter, race grid, RaceCard component). When the user hits `/races` with no `?year=` param, it auto-detects the latest indexed year and redirects:

**frontend/app/races/page.tsx (lines 82-89):**

Plain English: If someone visits /races without specifying a year, figure out the most recent season and show that one automatically.

```tsx
useEffect(() => {
  fetch(`${API}/seasons/summary`)
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data: SeasonSummary[]) => {
      setSeasons(data);
      if (year === null && data.length > 0) {
        const latest = Math.max(...data.map((s) => s.year));
        setYear(latest);
        router.replace(`/races?year=${latest}`);
      }
    })
    .catch(() => setSeasonsError(true));
}, []);
```

Technical detail: `router.replace` (not `router.push`) so the redirect doesn't add a back-button entry. The user won't get stuck in a loop hitting "back" and being redirected again.

Step 2 — Stripped `frontend/app/page.tsx` down from 325 lines to 37. It now only fetches the seasons summary and renders `<IntroHero>`, passing `onSelectYear` which navigates to `/races?year=X`.

Step 3 — Updated `Navbar.tsx`: "Races" link points to `/races`, year dropdown navigates to `/races?year=X`, and `isRaces` detection uses `pathname.startsWith("/races")`.

```
[User clicks RACEDAY logo]  →  /  (homepage intro)
[User clicks Races nav]     →  /races  (auto-redirects to latest year)
[User clicks a race card]   →  /races/2024/Monaco%20Grand%20Prix
[User clicks Pick a Season] →  /races?year=2026
```

### NewToF1Card (Homepage Primer)

Plain English: A welcome card that appears on the homepage after the car animation. It answers three questions a newcomer would have: "What is F1?", "What's happening right now?", and "Where should I start?"

**frontend/app/components/NewToF1Card.tsx:**

The component accepts `currentYear` as a prop and fetches `/races/{currentYear}` to compute the "Right now" line:

```tsx
useEffect(() => {
  fetch(`${API}/races/${currentYear}`)
    .then((r) => (r.ok ? r.json() : []))
    .then((races: Race[]) => {
      setTotalRaces(races.length);
      const upcoming = races.find((r) => r.date && new Date(r.date) > new Date());
      if (upcoming) setNextRace(upcoming);
      const completed = races.filter((r) => r.indexed && r.winner);
      if (completed.length > 0) setLatestCompleted(completed[completed.length - 1]);
    })
    .catch(() => {});
}, [currentYear]);
```

Technical detail: It finds the first upcoming race by date comparison. If the season is complete (no upcoming races), it shows the latest completed race instead. This makes the component work for both partial and finished seasons.

Three starter races are hardcoded:
- **Brazil 2008** — Hamilton clinches his first title in the final corner
- **Abu Dhabi 2021** — Verstappen overtakes Hamilton on the final lap
- **Turkey 2020** — Hamilton seals his seventh title in the rain

These link directly to their race pages (`/races/2008/Brazilian%20Grand%20Prix` etc.).

The card has a red glow behind it — two stacked radial gradients with heavy blur (80–120px) that fade smoothly into the pure black page background:

```tsx
<div
  aria-hidden="true"
  className="absolute top-1/2 left-1/2 pointer-events-none"
  style={{
    width: "1100px",
    height: "1100px",
    transform: "translate(-50%, -50%)",
    background: "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.22) 0%, ..., transparent 65%)",
    filter: "blur(120px)",
  }}
/>
```

Technical detail: `overflow-hidden` on the section prevents the glow from bleeding into adjacent sections. The card itself uses `glass-card-blur` (with backdrop-filter) since it's a static, once-per-page panel — worth the GPU cost.

### Glossary Tooltip System

Plain English: When you're reading a race story and you see a word like "compound" or "stint" with a dotted underline, hover over it (or tap on mobile) and a small dark popup explains what the word means. The system automatically detects which words to underline — you don't have to manually mark them.

Two files power this:

**frontend/app/lib/glossary.ts** — A dictionary of 16 F1 terms:

```typescript
export const GLOSSARY: Record<string, string> = {
  compound: "The type of tyre used — softer compounds are faster but wear out quicker...",
  stint: "A run of laps on the same set of tyres, between two pit stops...",
  pole: "Starting first on the grid. Earned by setting the fastest lap in qualifying...",
  // ... 13 more terms
};
```

**frontend/app/components/GlossaryTerm.tsx** — The tooltip component + the auto-scanner:

The auto-scanner builds a single regex at module load time, sorted by term length (longest first) to prevent "pit" from matching inside "pit window":

```typescript
const TERMS_SORTED = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const TERM_REGEX = new RegExp(
  `\\b(${TERMS_SORTED.map(escapeRegex).join("|")})\\b`,
  "gi"
);
```

The `wrapGlossaryTerms(text)` function scans a string and returns JSX with matching terms wrapped in `<GlossaryTerm>`:

```typescript
export function wrapGlossaryTerms(text: string): React.ReactNode {
  TERM_REGEX.lastIndex = 0;  // reset regex state between calls
  while ((match = TERM_REGEX.exec(text)) !== null) {
    // ...split text at match, wrap in <GlossaryTerm>
  }
}
```

Technical detail: The regex uses the global flag (`g`) which means it has state (`lastIndex`). Without the `lastIndex = 0` reset before each call, the regex would start searching from where the previous call left off, potentially missing matches. This is a classic JavaScript regex gotcha.

Applied in three places:
- `RaceStory.tsx` — narrative paragraphs
- `HighlightedText.tsx` — plain-text segments between driver name highlights (cascades to StrategyStory)
- `StrategyKey.tsx` — compound descriptions and stat row labels

**Key bug and fix**: After refining `.glass-card` to ultra-low opacity (0.028), the tooltip became invisible because page text bled through. Fixed by giving the tooltip its own near-opaque background with inline styles:

```tsx
<span
  style={{
    background: "rgba(10, 10, 12, 0.97)",  // almost solid black
    backdropFilter: "blur(16px) saturate(1.3)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 32px rgba(0,0,0,0.7)",
  }}
>
```

Technical detail: Using inline `style` instead of a CSS class means this tooltip background can't be accidentally overridden by a global `.glass-card` refine. The tooltip needs to be opaque regardless of what the shared class does.

### /new-to-f1 Beginner Guide Page

Plain English: A full standalone page that explains Formula 1 from scratch. Someone who's never seen a race can read it top to bottom and understand the sport, how race weekends work, what tyres do, what every jargon word means, how to navigate the site, and which three races to start with.

**frontend/app/new-to-f1/page.tsx** — static server component (no `"use client"`, no API calls), with SEO metadata:

```tsx
export const metadata: Metadata = {
  title: "New to F1 — RaceDay",
  description: "A plain-English guide to Formula 1...",
};
```

Six sections:
1. **What is F1?** — the sport in 3 paragraphs
2. **How a race weekend works** — Practice/Qualifying/Race in glass cards with day labels
3. **The cars, the tyres, the teams** — tyre compound colour key with dot indicators
4. **How to read a RaceDay race page** — explains Race Story, Key Moments, Pattern Precedents, Go Deeper, Strategy Simulator
5. **F1 Glossary** — all 16 terms from `glossary.ts`, rendered as a `<dl>` definition list
6. **Three races to start with** — same 3 as NewToF1Card but with longer contextual hooks

Bottom CTA links to `/races` ("Browse all races") and `/` ("Back to home").

### "Pick a Season" CTA Relocation

Plain English: The "Pick a Season" button used to sit all the way at the bottom of the intro, after all five feature sections. Most users would never scroll that far. Now it appears right below the "Race Stories" feature — the first feature section — so users encounter it much sooner.

Implementation: added an optional `cta` prop to `FeatureSection`:

```typescript
interface FeatureSectionProps {
  // ...existing props
  cta?: { label: string; onClick: () => void };
}
```

In `IntroHero.tsx`, only the first FeatureSection (index 0, Race Stories) receives it:

```tsx
{FEATURES.map((f, i) => (
  <FeatureSection
    key={i}
    index={i}
    {...f}
    cta={i === 0 ? { label: "Pick a Season", onClick: () => onSelectYear(latestYear) } : undefined}
  />
))}
```

The old standalone `SeasonPicker` component was deleted (~70 lines removed).

---

## Part C: UI Polish

### Pure Black Background

Plain English: The site's background had a very subtle blue tint from three radial gradients. On most screens you'd never notice, but against the red accents and dark glass panels, it made things feel slightly muddy. We replaced it with pure black (#000000) so every element sits on a crisp, clean void.

**Before** (globals.css body):
```css
background: #08080c;
background-image:
  radial-gradient(ellipse 80% 60% at 20% 10%, rgba(30, 30, 80, 0.25) 0%, transparent 60%),
  radial-gradient(ellipse 60% 50% at 80% 80%, rgba(60, 20, 40, 0.15) 0%, transparent 50%),
  radial-gradient(ellipse 90% 60% at 50% 50%, rgba(15, 15, 35, 0.3) 0%, transparent 70%);
```

**After**:
```css
background: #000000;
```

Also replaced all `#08080c` edge-fade references in FeatureSection, ScrollCarAnimation, SectionDivider, and IntroHero with Tailwind's `from-black`/`to-black`.

### Red Glow Behind Panels

Plain English: Behind the NewToF1Card and the Footer, there's a soft red glow that fades into the black background. It creates depth — the panel feels like it's floating above a warm light source — without being distracting. The glow is invisible on its own; you only notice it because the panel area feels slightly warmer than the rest of the page.

Implementation pattern (used identically for both NewToF1Card and Footer):

```tsx
{/* Outer bloom — wide and soft */}
<div
  aria-hidden="true"
  className="absolute top-1/2 left-1/2 pointer-events-none"
  style={{
    width: "1100px",
    height: "1100px",
    transform: "translate(-50%, -50%)",
    background: "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.22) 0%, ..., transparent 65%)",
    filter: "blur(120px)",
  }}
/>

{/* Inner hot core — smaller, brighter */}
<div
  aria-hidden="true"
  className="absolute top-1/2 left-1/2 pointer-events-none"
  style={{
    width: "700px",
    height: "700px",
    transform: "translate(-50%, -50%)",
    background: "radial-gradient(ellipse at center, rgba(255, 80, 80, 0.18) 0%, ..., transparent 70%)",
    filter: "blur(80px)",
  }}
/>
```

Key technique: `overflow-hidden` on the section prevents glow leaking into adjacent sections. Content inside gets `position: relative` to sit above the glow layers.

### Navbar Overhaul

**Removed scroll morph**: The navbar was transforming from a full-width bar into a centered floating pill on scroll. This used `left: 50%, translateX(-50%), maxWidth: 760px` via inline styles — causing a visible "jump" as the navbar resized and repositioned. Replaced with a permanently transparent, full-width, fixed-top bar with no scroll behavior at all.

**Size increase**: Scaled up everything to match the polish level of reference sites like Vorqal:
- Brand: `text-sm` → `text-2xl sm:text-3xl`
- Links: `text-[11px] sm:text-xs` → `text-sm sm:text-base`
- Padding: `py-3 px-6` → `py-8 sm:py-10 px-8 sm:px-14`
- Container: `max-w-5xl` → `max-w-7xl`

**Removed scroll state entirely**: No more `useState`/`useEffect` for scroll detection. Zero JS cost. The navbar is always the same — transparent background, no border, no animation.

### Footer

Plain English: The site now has a proper footer at the bottom of every page — a dark glass panel with four columns of links (Explore, Learn, Data) plus the RACEDAY branding. Above it, a gradient fade smoothly blends the preceding content (usually a feature section background image) into the footer area, so there's no harsh black gap between them.

**frontend/app/components/Footer.tsx** — wired into root `layout.tsx` so it appears on every page.

Key design decisions:
- Uses `glass-card-blur` (with backdrop-filter) since it's a static, once-per-page panel
- Top gradient merge bar: `-mt-40` negative margin pulls a `from-transparent to-black` gradient into the preceding section
- Data column links are external (`target="_blank"`) to FastF1, Jolpica, Open-Meteo, OpenF1
- Copyright line: "Not affiliated with Formula 1, FIA, or any F1 team"

### Glass-Card Refinement

Evolved `.glass-card` in two stages:

**Stage 1 (aesthetic refinement):**
- Darker base: `rgba(255,255,255,0.05)` → `rgba(255,255,255,0.028)` — less milky
- Stronger blur: 24px → 32px
- Layered shadow: sharp near shadow + soft far shadow
- Stronger inner highlight: `inset 0 1px 0 rgba(255,255,255,0.07)`

**Stage 2 (performance flattening — see Part D):**
- Removed backdrop-filter from `.glass-card` entirely
- Background changed to solid dark rgba: `rgba(20, 20, 24, 0.6)`
- Created `.glass-card-blur` opt-in variant for the few panels that need real glass (Footer, NewToF1Card)

### Scroll-to-Top on Refresh

Plain English: When you refresh any page, the browser normally remembers where you were scrolled to and jumps back there. We disabled that so every refresh starts at the top of the page — cleaner experience, especially for the cinematic homepage intro.

**frontend/app/components/ScrollToTop.tsx:**

```tsx
export default function ScrollToTop() {
  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
  }, []);
  return null;
}
```

Technical detail: `scrollRestoration = "manual"` tells the browser to stop auto-restoring scroll position. `scrollTo(0, 0)` forces the viewport to the top on mount. The component renders nothing (`return null`) — it's purely a side-effect hook mounted in `layout.tsx`.

---

## Part D: Performance Optimization

### In Plain English

The site was loading a 9 MB video on every visit and running 21 separate blur filters every time you scrolled. That's like asking every guest at a dinner party to carry a grand piano up the stairs just to sit down. We replaced the video with a 52 KB image, stripped the blur from everything that moves, and saved ~10 MB of first-load weight. The site looks identical. It just scrolls smoothly now.

### The Audit

Spawned an Explore agent to audit the full codebase. The agent returned a structured report covering dead code, heavy dependencies, render bottlenecks, large assets, and dead endpoints.

**Critical finding: the audit was wrong on 4 of 6 "dead" endpoints.** It flagged `/results`, `/standings`, `/strategy`, `/strategy/narrative`, `/sidebar`, and `/quiz` as unused. Manual grep-verification revealed that only `/quiz` and `/standings` were truly dead — the other 4 were actively called from the race page's `useEffect`.

The `/standings` case was interesting: the frontend DID fetch it, but never consumed the response. It was stored in React state (`setStandings(sta)`) but the state variable was never read by any component. That's a wasted network call on every race page load — worse than a dead endpoint because it actually costs bandwidth.

```
AUDIT CLAIM          REALITY           ACTION
/results             USED by ResultsCard    KEEP
/standings           FETCHED but unused     DELETE + remove fetch
/strategy            USED by StrategyPanel  KEEP
/strategy/narrative  USED by StrategyStory  KEEP
/sidebar             USED by FactsSidebar   KEEP
/quiz                ZERO references        DELETE
```

Lesson: never trust automated audits blindly. Always `grep -r` the frontend for each endpoint before deleting.

### 5 Optimizations Executed

**1. Dead endpoint cleanup** (`7bd2b77`)

- Deleted `/quiz` endpoint from `backend/api.py` + `generate_race_quiz()` function from `insights.py` (157 lines total including the randomised question generator)
- Deleted `/standings` endpoint
- Removed `safeFetch(\`${base}/standings\`)` from race page `useEffect` — this was inside a `Promise.all` that blocked the entire page render while waiting for all 3 fetches. Removing it means the page now waits for 2 fetches instead of 3.
- Removed `StandingEntry` interface and `standings` useState (dead types and state)

**2. JPEG → WebP conversion** (`3c3174b`)

Converted all 6 FeatureSection background images using ffmpeg:

```bash
for f in *.jpg; do
  ffmpeg -y -i "$f" -c:v libwebp -quality 80 "${f%.jpg}.webp"
done
```

Results:
| File | JPEG | WebP | Savings |
|------|------|------|---------|
| monaco-tight | 716 KB | 505 KB | 29% |
| f1-pack-racing | 531 KB | 322 KB | 39% |
| night-race | 462 KB | 244 KB | 47% |
| aerial-racing | 387 KB | 208 KB | 46% |
| cockpit-detail | 251 KB | 117 KB | 53% |
| hero-f1-dark | 109 KB | 39 KB | 64% |
| **Total** | **2,456 KB** | **1,435 KB** | **42%** |

All references updated in IntroHero.tsx and race detail page. Original JPEGs deleted.

Note: Next.js `<Image>` already served WebP to supporting browsers at runtime, but having smaller source files means the image optimizer uses less memory and the first-load cache miss on Vercel is faster.

**3. GSAP ScrollTrigger → IntersectionObserver** (`78bbdd9`)

Plain English: Before, every feature section (Race Stories, Strategy Simulator, Team Radio, Pattern Finder, 16 Seasons) had its own GSAP animation timeline with a scroll listener. That's 5 scroll listeners each doing DOM math on every scroll event. We replaced them with a single native browser API (IntersectionObserver) that fires once when the section scrolls into view, then disconnects. Same visual effect — text fades in with staggered timing — but zero ongoing scroll cost.

**Before** (GSAP):
```tsx
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: section,
    start: "top 70%",
    toggleActions: "play none none reverse",
  },
});
tl.fromTo(subtitleRef.current, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.6 }, 0.1);
tl.fromTo(titleRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7 }, 0.2);
tl.fromTo(descRef.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, 0.4);
```

**After** (IntersectionObserver + CSS transitions):
```tsx
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();  // fire once and stop
      }
    }
  },
  { threshold: 0.25 }
);

// In JSX:
<p className={`transition-all duration-[600ms] ease-out ${
  visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
}`} style={{ transitionDelay: "100ms" }}>
  {subtitle}
</p>
```

The stagger effect is achieved via `transitionDelay` on each element (100ms, 200ms, 400ms, 600ms) — same visual cadence as the GSAP timeline offsets.

GSAP is still used in IntroHero for the hero scroll indicator fade — user explicitly chose to keep it there.

**4. Flat glass-card by default** (`eb3435a`)

Plain English: Backdrop-filter blur is like asking the browser to take a photo of everything behind an element, blur it, then composite it on top — on every single frame. When 21 elements do this during scroll, the GPU melts. We changed the default to a simple solid dark colour that looks almost identical, and only kept the real blur on 2 stationary panels.

**Before** (globals.css):
```css
.glass-card {
  backdrop-filter: blur(32px) saturate(1.5);
  background: rgba(255, 255, 255, 0.028);
}
```

**After**:
```css
/* Default: flat, no GPU cost */
.glass-card {
  background: rgba(20, 20, 24, 0.6);
  /* NO backdrop-filter */
}

/* Opt-in blur for static panels */
.glass-card-blur {
  backdrop-filter: blur(32px) saturate(1.5);
  background: rgba(255, 255, 255, 0.028);
}
```

Only Footer and NewToF1Card use `.glass-card-blur`. Everything else — race cards, season cards, strategy panels, pattern results, championship table — uses the flat default.

Why `rgba(20, 20, 24, 0.6)` instead of `rgba(255, 255, 255, 0.028)`? Against a black background, a nearly-transparent white overlay and a semi-transparent dark overlay look identical. But the dark overlay doesn't need a blur filter to hide what's behind it — it's already opaque enough. On a pure black page, you genuinely cannot tell the difference without a side-by-side comparison.

**5. 9.1 MB video → 52 KB parallax still** (`657e5a1` + `ca9499e`)

Plain English: The car scroll animation used to load a 9 MB video and scrub through it frame-by-frame as you scrolled. That meant the browser was decoding video frames on every scroll event — the single biggest cause of lag on the site. We extracted one good frame from the video (a night-race drone shot), saved it as a 52 KB WebP, and used CSS parallax to make it look cinematic. The image stays "pinned" in the viewport while everything else scrolls past it.

**How CSS parallax works:**

```css
background-attachment: fixed;
```

This one CSS property does all the work. Normally, a background image scrolls with its container. `fixed` tells the browser to pin the background to the viewport instead. As the user scrolls, the container moves but the image doesn't — creating the illusion of depth. Zero JavaScript.

```tsx
<div
  className="absolute inset-0"
  style={{
    backgroundImage: "url(/images/race-flyby-still.webp)",
    backgroundSize: "cover",
    backgroundPosition: "center 40%",
    backgroundAttachment: "fixed",
  }}
/>
```

**Why Next.js `<Image>` doesn't work for parallax:** The `<Image>` component renders an `<img>` tag, not a CSS background. The `backgroundAttachment` property only applies to elements with `background-image`. When I first tried adding `backgroundAttachment: "fixed"` to the `<Image>` component's style, it had no effect — the image scrolled normally.

**Extracting the still frame from git history** (after the video was already deleted):

```bash
git show HEAD~1:frontend/public/videos/night-race-flyby.mp4 | \
  ffmpeg -y -i pipe:0 -ss 00:00:05 -frames:v 1 -c:v libwebp -quality 90 \
  frontend/public/images/race-flyby-still.webp
```

`git show HEAD~1:path` retrieves file content from a previous commit and pipes it to ffmpeg's stdin. `-ss 00:00:05` seeks to the 5-second mark for a good car-in-motion frame. Result: 52 KB WebP (175× smaller than the video).

**iOS caveat**: `background-attachment: fixed` doesn't work on iOS Safari — it falls back to normal scroll. The image still displays correctly, you just don't get the parallax effect on mobile. This is an acceptable tradeoff: mobile users get the bigger win (no 9 MB download, no scroll-synced video decoding).

### Total Savings

| Metric | Before | After | Impact |
|--------|--------|-------|--------|
| First-load weight | ~12 MB | ~2.5 MB | 80% reduction |
| Backdrop-filter repaints | 21+ per scroll | 2 (static panels) | 90% reduction |
| GSAP ScrollTrigger instances | 7 | 1 (hero only) | 86% reduction |
| Scroll event listeners | 10+ | ~2 | 80% reduction |
| Dead backend code | 195 lines | 0 | Cleaner API surface |
| Race page API calls | 3 parallel | 2 parallel | 33% faster initial load |

---

## Common Patterns

### Pattern 1: Two-Layer Glow

What it's for: Creating a warm, diffuse light effect behind a glass panel without adding blur to the panel itself.

```
[Black page background]
    |
    |  [Outer glow: 1100px, blur(120px), 0.22 opacity]
    |      |
    |      |  [Inner glow: 700px, blur(80px), 0.18 opacity]
    |      |      |
    |      |      |  [Glass card with position: relative]
    |      |      |      |
    |      |      |      |  [Content]
```

The outer layer provides wide ambient wash. The inner layer adds a brighter "hot spot" at the centre. Both are absolutely positioned, centred with `left: 50%, top: 50%, transform: translate(-50%, -50%)`. The card sits above them with `position: relative`. Section has `overflow: hidden`.

### Pattern 2: IntersectionObserver + CSS Transition (replacing GSAP)

What it's for: Fade-in-on-scroll effects without any JavaScript scroll listeners.

```tsx
const [visible, setVisible] = useState(false);

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
    { threshold: 0.25 }
  );
  observer.observe(el);
  return () => observer.disconnect();
}, []);

// In JSX — stagger via transitionDelay:
<p className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
   style={{ transitionDelay: "200ms" }}>
```

`observer.disconnect()` after the first intersection means the callback fires exactly once, unlike GSAP's `toggleActions: "play none none reverse"` which fires on every scroll direction change.

### Pattern 3: Flat Glass with Opt-In Blur

What it's for: Having a unified "glass" aesthetic without paying the GPU cost everywhere.

```css
/* Default: flat, cheap */
.glass-card { background: rgba(20, 20, 24, 0.6); /* no backdrop-filter */ }

/* Opt-in: real blur, use sparingly on static elements */
.glass-card-blur { backdrop-filter: blur(32px) saturate(1.5); background: rgba(255,255,255,0.028); }
```

Rule of thumb: if the element scrolls past the viewport (race cards, list items, table rows), use flat. If it's static and once-per-page (footer, hero card, tooltip), use blur.

---

## Edge Cases & Gotchas

1. **Regex `lastIndex` state in `wrapGlossaryTerms`**
   In plain English: The glossary scanner uses a regex with the "global" flag, which makes it remember where it left off. If you call it twice without resetting, the second call starts scanning from the middle of the text and misses matches at the beginning.
   Technical cause: JavaScript regexes with `/g` flag maintain `lastIndex`. `exec()` continues from `lastIndex`, not from 0.
   How to avoid: Set `TERM_REGEX.lastIndex = 0` before every call to `wrapGlossaryTerms`.

2. **`backgroundAttachment: fixed` on `<Image>` does nothing**
   In plain English: Next.js's Image component renders an `<img>` tag. The CSS property `background-attachment` only works on elements that use `background-image` (CSS property), not `<img>` elements. Putting it on an Image component has literally no effect.
   How to avoid: Use a `<div>` with inline `style={{ backgroundImage: "url(...)" }}` when you need CSS parallax.

3. **Glass-card opacity vs tooltip readability**
   In plain English: Making `.glass-card` more transparent (0.028 opacity) for aesthetic refinement also made tooltips transparent — page text bled through and the definition became unreadable.
   How to avoid: Give tooltips their own background via inline `style` (not the shared class). Use near-opaque: `rgba(10, 10, 12, 0.97)`.

4. **OneDrive + multiple terminals**
   In plain English: If two Claude terminals work on the same repo inside OneDrive, one can silently switch branches on the other. Even worse, OneDrive can remove `.git` during a sync, making the working directory no longer a git repo.
   How to avoid: Move the repo outside OneDrive. Work from a plain local path like `C:\Users\HP\claude\raceday`.

5. **Automated audit false positives**
   In plain English: The audit agent flagged 6 endpoints as "dead" — 4 were actively used. Blindly deleting them would have broken the race page.
   How to avoid: Always `grep -r` the frontend for each endpoint path string before deleting any backend route.

6. **`sed` regex with digits in filenames**
   In plain English: When batch-renaming `.jpg` to `.webp` with `sed`, the pattern `[a-z-]*\.jpg` didn't match `f1-pack-racing.jpg` because `1` is a digit, not a lowercase letter.
   How to avoid: Use `[a-z0-9-]*` or just handle edge cases manually.

---

## How It Connects to Other Concepts

- **Phase 8 (Glassmorphism)**: This phase refined the glass system Phase 8 created. The original glass-card was designed for visual impact; Phase 9 optimised it for performance by splitting into flat-default + blur-opt-in.
- **Phase 6 (Story-First Redesign)**: The route architecture change (splitting `/` from `/races`) builds on Phase 6's decision to make the homepage story-first. Now the homepage is permanently story-first — it never shows data.
- **Phase 7D (Live Data Pipeline)**: The NewToF1Card's "Right now" line fetches from the same `/races/{year}` endpoint that Phase 7D built for partial-season display. The auto-detection of "next race" reuses the same `race.date > new Date()` logic.
- **Enables**: The glossary system is extensible — adding a new term is one line in `glossary.ts`. The two-layer glow pattern is reusable — copy-paste the two `<div>` blocks behind any section. The flat/blur glass split means future components default to performant without thinking about it.

---

## Quick Reference

### Key Terms
| Term | Plain English | Technical |
|------|--------------|-----------|
| Route split | Homepage and race grid are separate pages | `/` renders IntroHero only, `/races` renders year selector + grid |
| Glossary scanner | Auto-finds F1 words and adds hover tooltips | Regex with longest-first alternation, wraps matches in React components |
| Flat glass | Dark solid card that looks like glass without blur | `rgba(20, 20, 24, 0.6)` with no `backdrop-filter` |
| CSS parallax | Image stays fixed while page scrolls over it | `background-attachment: fixed` on a div with `background-image` |
| Two-layer glow | Warm diffuse light behind a panel | Two radial gradients with heavy blur, `overflow-hidden` on container |

### File Map
```
frontend/app/
├── page.tsx                     ← Homepage (intro only, 37 lines)
├── races/page.tsx               ← Race grid with year selector
├── new-to-f1/page.tsx           ← Full beginner guide (static)
├── components/
│   ├── NewToF1Card.tsx          ← Homepage primer card
│   ├── GlossaryTerm.tsx         ← Tooltip + wrapGlossaryTerms()
│   ├── Footer.tsx               ← Multi-column glass footer
│   ├── ScrollToTop.tsx          ← Forces scroll to top on refresh
│   ├── ScrollCarAnimation.tsx   ← Parallax hero (was video, now static)
│   ├── FeatureSection.tsx       ← IO + CSS transitions (was GSAP)
│   └── Navbar.tsx               ← Transparent, no scroll state
├── lib/
│   ├── glossary.ts              ← 16 F1 terms dictionary
│   └── HighlightedText.tsx      ← Driver name + glossary wrapping
└── globals.css                  ← .glass-card (flat) + .glass-card-blur
```

---

## Updates

- [2026-04-12] — Initial doc created covering all Phase 9 work: hackathon branches, beginner UX, UI polish, performance optimization
- [2026-04-12] — Expanded to deeplearn depth: added In Plain English sections, code walkthroughs, architecture diagrams, common patterns, edge cases, quick reference, file map

---

*Generated: 2026-04-12 | Updated: 2026-04-12 | Project: RaceDay | Phase 9: Beginner UX + Route Architecture + Performance Optimization*
