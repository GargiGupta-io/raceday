# Phase 8 — Glassmorphism + Apple-Clean UI Overhaul

> Apple-inspired: frosted glass, massive breathing room, imagery, one-idea-per-scroll. Execute with `/steps`. One step at a time, verify, move on.

**Design principles (apply everywhere):**
- Sections separated by 80-120px gaps, not 32px
- One concept per visual "block" — don't stack 5 things in one viewport
- Full-width imagery to break up text-heavy sections
- Glass panels float with generous internal padding (p-8 not p-4)
- Text is concise — if a section feels heavy, it needs more space or fewer words
- Max-width stays 5xl but content within feels airy

---

## Phase 8A: Foundation — Background, Glass Utilities, Spacing System (Steps 1-3)

### Step 1: Global background + glass CSS utilities + spacing tokens
- Rich dark mesh gradient background on `body` (subtle dark navy/charcoal/black — NOT garish)
- Glass utility classes in `globals.css`:
  - `.glass` — `backdrop-blur-xl bg-white/[0.04] border border-white/[0.08]`
  - `.glass-card` — rounded-2xl variant with more padding, subtle shadow
  - `.glass-button` — `bg-white/[0.08] border border-white/[0.12] hover:bg-white/[0.15]`
  - `.glass-input` — `bg-white/[0.05] border border-white/[0.10] focus:border-white/[0.25]`
  - `.glass-badge` — small pill with `bg-white/[0.06]`
- Spacing scale: define `section-gap` (py-20 / 80px between major sections), `block-gap` (py-12 between sub-blocks)
- Glass shimmer keyframe for skeleton loaders
- Update layout.tsx body to use the new background

### Step 2: Navbar → slim frosted glass bar
- `backdrop-blur-2xl bg-white/[0.03] border-b border-white/[0.06]`
- Nav links: glass pill style, active = brighter glass + accent underline
- Year dropdown: glass-input
- Brand "Raceday": clean, no glow — just crisp white
- Live link: glass pill, soft red pulse when active
- Slightly more horizontal padding, clean minimal feel

### Step 3: Image asset system
- Create `public/images/` directory
- Download 5-6 high-quality F1 images from Unsplash (cars on track, pit stops, circuits from above, night race, rain race, starting grid)
- Create a reusable `HeroImage` component: full-bleed image with gradient overlay (fades to the dark background at edges)
- Create a `SectionDivider` component: either a thin glass line OR a full-width image strip
- These will be used throughout to break up content sections

---

## Phase 8B: Home Page — Spacious, Visual, Inviting (Steps 4-6)

### Step 4: IntroHero → Apple-level hero landing
- Full viewport height hero (min-h-screen)
- Large F1 hero image behind the glass (car on track, dark and moody)
- "RACEDAY" title: huge, centered, floating over the image
- Subtitle: one clean line
- Feature cards: 3 across, glass-card, generous spacing, icons stay
- CTA: glass button with subtle glow
- Scroll indicator at bottom (chevron or "scroll to explore")
- Massive gap before the next section

### Step 5: Year selector + weather filter → glass with space
- Year selector tabs: glass pills, more padding (px-6 py-3)
- Season header: bigger text, more margin below
- Weather filter: glass pills, spaced out
- Add ~60px gap between year selector and race grid

### Step 6: Race cards → floating glass with breathing room
- Glass-card style: rounded-2xl, p-6 (up from p-5), more internal spacing
- Circuit SVG: render larger (w-20 h-16 instead of w-14 h-10), slightly more visible
- Grid gap: `gap-5` or `gap-6` (up from gap-3)
- Latest Race banner: glass with gradient accent, more padding
- Badges: glass-badge style
- Upcoming cards: frosted with lower opacity
- Below the grid: a full-bleed F1 image or circuit aerial as a visual break before footer

---

## Phase 8C: Race Page — Story-First, Breathable (Steps 7-11)

### Step 7: Race page header → cinematic
- Full-width header area with circuit image or dark gradient
- Race name: larger (text-3xl or 4xl), more vertical space
- Tagline: glass pill, stands alone with space around it
- Circuit SVG: rendered large as a decorative element (not tiny watermark)
- 80px gap before the first content section

### Step 8: ResultsCard + KeyMoments → spacious glass
- ResultsCard: glass panel, podium rows with generous padding (py-4 per row)
- Section label "The Result": bigger spacing below
- 80px gap between Results and Key Moments
- KeyMoments: each card → glass-card with larger icon circles
- More gap between moment cards (gap-4 not gap-2)
- After KeyMoments: maybe a full-bleed image strip (pit stop action shot) as a divider

### Step 9: RaceStory + PatternPrecedents + RadioMoments → editorial feel
- RaceStory: glass panel, but text gets MORE space — larger line-height, bigger paragraph gaps
- Think of it like reading a magazine article, not a data dump
- Pattern Precedents: glass panel, clear separation
- RadioMoments: glass panel, audio elements get glass circle play buttons
- Between each section: 60-80px gaps
- Consider inserting an image divider between story and patterns

### Step 10: GoDeeper accordion → glass, less dense
- Glass container for the whole accordion
- "Go Deeper" label: centered divider with more vertical margin (py-16 gap above)
- Accordion items: more internal padding when expanded
- Strategy panel: glass sub-panel, compound chips pop against glass
- Strategy mode toggle: glass segmented control
- Season standings: glass table rows
- Each accordion section content: p-6 not p-4

### Step 11: Sidebar (Facts + Simulator) → refined glass
- FactsSidebar: glass panel, facts get more spacing (space-y-3 not space-y-2)
- StrategySimulator collapsed: glass panel, inviting CTA
- Simulator expanded: glass panel, generous internal spacing
  - Mode toggle: glass segmented control
  - Dropdowns: glass-input
  - Compound buttons: keep solid colors, glass border ring
  - Simulate button: prominent but glass
  - Result: glass with color tint (green/red)
- Sidebar overall: `space-y-8` not `space-y-6`

---

## Phase 8D: Other Pages (Steps 12-14)

### Step 12: Championship page → clean glass table
- Leader card: glass with gold accent glow, more padding
- Table: glass panel, rows with hover `bg-white/[0.03]`
- More space between leader card and table (gap-8)
- Header area: larger, more breathing room

### Step 13: Pattern Finder → clean glass form
- Filter form: glass panel, inputs = glass-input, more spacing between rows
- Search button: glass with red accent
- Results: glass-card rows with hover glow
- More gap between form and results

### Step 14: Live page → glass dashboard
- Session bar: glass panel
- Driver table: glass panel, rows hover
- Sidebar cards: glass panels with color tints
- Tyre indicators: keep solid, glass ring
- "No live session": glass panel, maybe an F1 image placeholder

---

## Phase 8E: Polish & Final (Steps 15-17)

### Step 15: Skeleton loaders + error states → glass shimmer
- All skeletons: glass base with animated shimmer gradient sweep
- Error states: glass panel with red tint
- Empty states: glass panel, clean message
- Loading spinners (if any): glass style

### Step 16: Hover states, transitions, scroll animations
- All glass panels: subtle inner glow on hover
- Buttons: smooth backdrop + border transition
- FadeIn component: increase translateY distance (24px instead of 16px) for more dramatic entrance
- Accordion: smooth height transition (animate open/close, not instant show/hide)
- Consistent 200ms transitions everywhere
- Consider: subtle parallax on hero images during scroll (optional, performance-dependent)

### Step 17: Visual test + push
- Start backend + frontend
- Walk through every page: intro, home, race detail, championship, patterns, live
- Check spacing feels breathable — no section should feel cramped
- Check images load and look good
- Check mobile: glass works, images scale, spacing adapts
- Check performance: backdrop-blur on many elements — watch for jank
- Commit, push, deeplearn doc
