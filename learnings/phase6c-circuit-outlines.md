# Phase 6C — Circuit Outlines on Race Cards

> Every race card on the home page now has a tiny circuit outline in the corner — a visual fingerprint that gives each race its own identity at a glance.

---

## In Plain English

Imagine a bookshelf where every book has the same plain cover — just a title and author. You'd have to read each title to find what you want. Now imagine each cover has a small silhouette of the story's setting: a castle for one, a spaceship for another, a city skyline for a third. Suddenly you can find books by shape alone.

That's what circuit outlines do for Raceday. Each race card on the home page now has a faint drawing of the track layout in its top-right corner. Monaco is a tight rectangle with hairpins. Monza is a stretched loop with barely any corners. Spa is a big triangle. Suzuka crosses over itself in a figure-8. Even at thumbnail size, an F1 fan can recognise which circuit they're looking at without reading the name.

The outlines are deliberately very faint — 7% opacity, like a watermark. They're there for recognition, not decoration. They don't compete with the text (race name, winner, weather badge) because they sit behind it. It's a subtle touch that makes the grid of race cards feel like a collection of unique events rather than a list of identical boxes.

## What Is an SVG Circuit Outline? (The Technical View)

SVG (Scalable Vector Graphics) is a format for drawing shapes using mathematical instructions rather than pixels. Instead of saving millions of coloured dots like a JPEG, an SVG says "draw a curve from point A to point B, then a line to point C." This means SVGs look sharp at any size — from a tiny 64-pixel thumbnail to a billboard — and they're incredibly small (usually under 1KB each).

For circuit outlines, each SVG contains a single `<path>` element: one continuous line that traces the track layout. The path uses bezier curves (smooth curves defined by control points) and straight line segments. The stroke colour is set to `currentColor`, a CSS keyword meaning "inherit whatever text colour the parent element uses." On a dark theme where text is white, the circuit outline renders white. On a light theme, it would render dark. This makes the SVGs theme-agnostic — they adapt automatically.

The outlines are simplified representations, not GPS-accurate maps. Silverstone's complex Maggots-Becketts-Chapel sequence is reduced to a characteristic S-curve. Monaco's tight streets become a dense rectangle. The goal is recognition, not cartographic accuracy.

## The Problem It Solves

### Before Phase 6C

The home page showed a grid of race cards. Each card had the same visual structure: round number, race name, location, winner, weather badge, lap count. They were functional but visually identical. Scrolling through 22 cards for a season, nothing caught your eye — they were all the same shape, same colour, same layout.

```
┌──────────────────────┐  ┌──────────────────────┐
│ Round 1               │  │ Round 2               │
│ Bahrain Grand Prix    │  │ Saudi Arabian GP      │
│ Sakhir, Bahrain       │  │ Jeddah, Saudi Arabia  │
│ P1 VER    DRY 57 LAPS │  │ P1 PER    DRY 50 LAPS│
└──────────────────────┘  └──────────────────────┘
```

No visual identity. No way to scan and find a specific race by shape alone.

### After Phase 6C

```
┌──────────────────────┐  ┌──────────────────────┐
│ Round 1          ╭─╮ │  │ Round 2        ┃     │
│ Bahrain GP       ╰─╯ │  │ Saudi Arabian  ┃     │
│ Sakhir, Bahrain       │  │ Jeddah         ┃     │
│ P1 VER    DRY 57 LAPS │  │ P1 PER    DRY 50 LAPS│
└──────────────────────┘  └──────────────────────┘
```

Each card has a unique shape. Bahrain's tight loops vs Jeddah's long narrow street circuit. Even at 7% opacity, the shapes are distinct enough for pattern recognition.

## How It Works

### The Three-Layer Architecture

Phase 6C has three clean layers that connect: SVG files → mapping function → rendering component.

```
35 SVG files              circuits.ts              page.tsx (RaceCard)
(public/circuits/)   →    getCircuitSvg()     →    <Image> element
                          maps 40 GP names          renders at 7% opacity
                          to 35 filenames           in top-right corner
```

### Layer 1: SVG Files

Plain English: Small drawing files, one per circuit, stored in the public folder where the browser can fetch them directly.

Each SVG follows a strict format:

**`frontend/public/circuits/silverstone.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
  <path d="M50,12 C55,10 65,10 72,14 L82,20 C86,23 90,26 92,30 ..."
        stroke="currentColor" fill="none" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Technical detail:
- **`viewBox="0 0 120 80"`** — the coordinate system. All paths are drawn within a 120×80 unit space. The actual rendered size can be anything; the viewBox scales proportionally.
- **`stroke="currentColor"`** — inherits the parent element's text colour. On the dark zinc theme, this means white. The opacity is controlled by the parent CSS, not the SVG itself.
- **`fill="none"`** — no fill colour; just the outline stroke.
- **`stroke-width="2"`** — 2 units wide in the viewBox coordinate system. At 64px render width, that's about 1px of visible line.
- **`stroke-linecap="round"` / `stroke-linejoin="round"`** — smooth line endings and corners instead of sharp cuts.

The `d` attribute contains the path data: `M` (move to), `L` (line to), `C` (cubic bezier curve), `Z` (close path). This is the SVG drawing language — a sequence of instructions that the browser follows like a connect-the-dots puzzle.

35 SVG files cover all unique circuits. Some Grand Prix names share the same circuit:
- "British Grand Prix" and "70th Anniversary Grand Prix" → silverstone.svg
- "Austrian Grand Prix" and "Styrian Grand Prix" → red-bull-ring.svg
- "Brazilian Grand Prix" and "São Paulo Grand Prix" → interlagos.svg
- "Bahrain Grand Prix" and "Sakhir Grand Prix" → bahrain.svg

### Layer 2: The Mapping Function

Plain English: A lookup table that converts any Grand Prix name (like "British Grand Prix") into the path to the right SVG file (like "/circuits/silverstone.svg").

**`frontend/app/lib/circuits.ts`**

```typescript
const CIRCUIT_MAP: Record<string, string> = {
  "70th Anniversary Grand Prix": "silverstone",
  "Abu Dhabi Grand Prix": "yas-marina",
  "Australian Grand Prix": "melbourne",
  "Austrian Grand Prix": "red-bull-ring",
  // ... 40 entries total
  "United States Grand Prix": "cota",
};

export function getCircuitSvg(raceName: string): string | null {
  const filename = CIRCUIT_MAP[raceName];
  return filename ? `/circuits/${filename}.svg` : null;
}
```

Technical detail: The function returns a path starting with `/circuits/` — this is a path relative to the `public/` directory in Next.js. Files in `public/` are served statically at the root URL. So `/circuits/silverstone.svg` maps to `frontend/public/circuits/silverstone.svg` on disk.

The function returns `null` for unknown race names. This means if a new Grand Prix is added to the F1 calendar (e.g., a hypothetical "Seoul Grand Prix"), the race card simply won't show a circuit outline until someone adds the SVG and mapping entry. No errors, no broken images — just a graceful absence.

The `Record<string, string>` type means TypeScript enforces that both keys and values are strings. The 40 entries cover every Grand Prix name that appears in the indexed data from 2010 to 2024.

### Layer 3: Rendering on Race Cards

Plain English: Each race card checks if it has a circuit SVG, and if so, draws it very faintly in the top-right corner.

**`frontend/app/page.tsx` (inside RaceCard function)**

```tsx
const circuitSvg = getCircuitSvg(race.name);

const content = (
  <div className="rounded-lg bg-zinc-900 p-5 h-full flex flex-col relative overflow-hidden">
    {/* Circuit outline — faint background element */}
    {circuitSvg && (
      <div className="absolute top-2 right-2 w-16 h-11 opacity-[0.07]">
        <Image src={circuitSvg} alt="" width={64} height={44} className="invert" />
      </div>
    )}
    {/* ... rest of the card */}
  </div>
);
```

Technical detail:
- **`relative overflow-hidden`** on the container — `relative` creates a positioning context for the `absolute` child. `overflow-hidden` clips the SVG if it extends beyond the card boundaries.
- **`absolute top-2 right-2`** — positions the circuit outline 8px from the top-right corner, overlapping with the card background but not with the text content.
- **`w-16 h-11`** — 64×44 pixels. Small enough to be a background element, large enough to be recognisable.
- **`opacity-[0.07]`** — 7% opacity. This is a Tailwind arbitrary value (the square brackets allow any CSS value). The outline is barely visible — a whisper of shape behind the text.
- **`className="invert"`** — inverts the SVG colours. Since `currentColor` renders as the text colour (white on dark theme), and the SVG has no fill, the `invert` filter ensures the stroke appears as a light shape against the dark card background. Without `invert`, the stroke would be invisible (white on near-white).
- **`alt=""`** — empty alt text because this is a decorative image. Screen readers should skip it — it adds no information that isn't already in the text.

## What We Built

### Overview

When a user opens the Raceday home page and selects a season, they see a grid of race cards. Each card now has a faint circuit outline watermark in its top-right corner. The outline loads from a static SVG file, looked up by the race name through a mapping function. The entire system is:

- **35 SVG files** (1-3KB total, negligible bandwidth)
- **1 mapping file** (40 entries, ~50 lines)
- **3 lines of JSX** added to the RaceCard component

### How the Pieces Connect

```
User sees race card for "2023 British Grand Prix"
          │
          ▼
RaceCard component calls getCircuitSvg("British Grand Prix")
          │
          ▼
circuits.ts looks up "British Grand Prix" → "silverstone"
          │
          ▼
Returns "/circuits/silverstone.svg"
          │
          ▼
Next.js <Image> fetches public/circuits/silverstone.svg
          │
          ▼
Browser renders SVG at 64x44px, 7% opacity, inverted
          │
          ▼
User sees a faint Silverstone outline behind the race text
```

## Common Patterns

### Pattern 1: Static Asset Mapping

What it's for: Converting a data value (race name) into a file path for a static asset (SVG image).

This is a common pattern in web apps: you have data from an API and need to display a corresponding image, icon, or badge. Instead of embedding image URLs in the API response (which couples the backend to frontend asset locations), the frontend maintains its own mapping.

```typescript
// Data → asset path mapping
const MAP: Record<string, string> = {
  "key-from-api": "filename-on-disk",
};

export function getAsset(key: string): string | null {
  const file = MAP[key];
  return file ? `/assets/${file}.svg` : null;
}
```

When to use: Any time you need to map API data to frontend assets. Team logos, flag icons, circuit outlines, weather icons.

### Pattern 2: Decorative Background Images

What it's for: Adding visual texture to a card without interfering with the content.

The combination of `absolute` positioning, low opacity, and `overflow-hidden` creates a background decoration that sits behind text. The text remains fully readable because the image is almost invisible.

```tsx
<div className="relative overflow-hidden">
  {image && (
    <div className="absolute top-2 right-2 w-16 h-11 opacity-[0.07]">
      <Image src={image} alt="" width={64} height={44} />
    </div>
  )}
  {/* Actual content on top */}
  <p>This text is fully readable</p>
</div>
```

When to use: Watermarks, background patterns, visual identity hints. Keep opacity below 10% and use `alt=""` to mark as decorative.

### Pattern 3: currentColor for Themeable SVGs

What it's for: Making SVG icons that automatically match whatever colour scheme they're placed in.

```xml
<path stroke="currentColor" fill="none" />
```

The SVG inherits the text colour of its container. Drop it in a white-on-dark card and it renders white. Drop it in a dark-on-light card and it renders dark. No theme-specific SVG variants needed.

When to use: Any icon or illustration that should match the surrounding text colour. Most icon libraries (Heroicons, Lucide) use this pattern.

## Edge Cases & Gotchas

1. **New circuits need manual addition**
   In plain English: If F1 adds a new track (like the rumoured Madrid GP), race cards for that Grand Prix won't show a circuit outline until someone creates the SVG and adds the mapping entry.
   Technical cause: The mapping is a static lookup table, not auto-generated. There's no fallback circuit shape.
   How to handle: When a new GP appears in the data, create the SVG, add it to `public/circuits/`, and add the entry to `CIRCUIT_MAP` in `circuits.ts`.

2. **São Paulo encoding**
   In plain English: The São Paulo Grand Prix has a special character (ã) in its name that could cause matching failures if encoded differently.
   Technical cause: The filesystem on Windows may store "São" with a different byte sequence than the UTF-8 "São" in the TypeScript file. The API sends proper UTF-8, which matches the TypeScript mapping.
   How to handle: Always match against the API response string, not the filesystem directory name. This is already the case — the frontend receives the race name from the API and passes it to `getCircuitSvg()`.

3. **SVG invert filter on light themes**
   In plain English: The `invert` CSS class flips colours to make the SVG visible on dark backgrounds. On a light theme, this would make the outline dark — which might look wrong.
   Technical cause: `currentColor` alone would handle theming, but the `invert` filter overrides this. It's a workaround for the specific dark zinc background.
   How to handle: If a light theme is ever added, remove `className="invert"` and rely on `currentColor` instead. Or use conditional classes based on the theme.

4. **Next.js Image component and SVGs**
   In plain English: Next.js's `<Image>` component normally optimises images (resizing, format conversion). SVGs don't need optimisation and can sometimes cause issues with the Image component.
   Technical cause: The Image component may attempt to process the SVG through its image optimisation pipeline. For static SVGs in `public/`, this usually works fine because Next.js serves them as-is.
   How to handle: If SVGs stop rendering correctly, switch to a plain `<img>` tag or use `unoptimized` prop on `<Image>`.

## How It Connects to Other Concepts

- **Phase 6A (Race Page Redesign)**: The circuit outlines are currently only on the home page race cards. They could also appear on the race page header (next to the track name) as part of the Phase 6 design. The same `getCircuitSvg()` function would be used.

- **Phase 6D (Race Story + Tagline)**: The tagline and circuit outline together create the visual identity of each race. The outline is the shape; the tagline is the emotional hook. Both work at a glance.

- **Team colour system**: Similar to the team colour maps (`TEAM_DOT`, `TEAM_BAR`) used in other components, the circuit map is a static lookup. All these maps could be consolidated into a shared utility, but keeping them separate means each feature is self-contained.

## Going Deeper

### Animated Circuit Drawing

The SVG path could be animated using CSS `stroke-dasharray` and `stroke-dashoffset` to create a "drawing" effect where the circuit outline appears to trace itself on screen. This is a common SVG animation technique — set the dash length equal to the path length, offset it fully, then transition the offset to zero. The line appears to draw itself from start to finish. Worth considering for the race page header but probably too distracting for the home page grid.

### Real GPS-Accurate Tracks

FastF1 can provide actual circuit coordinates (latitude/longitude for each track point). These could be converted to SVG paths using a map projection. The result would be geographically accurate instead of artist-approximated. The tradeoff: more complex path data (larger SVGs), and the shapes might be less recognisable at small sizes because GPS accuracy includes details that make the outline "noisy."

### Circuit Metadata

Each SVG could be extended with metadata: track length, number of turns, lap record. This data could appear on hover or in a tooltip. The SVGs themselves would stay simple, but the mapping file could be expanded to include structured data alongside the filename.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|-----------------------|-------------------|
| SVG | A drawing file made of math, not pixels | Scalable Vector Graphics — XML format for 2D graphics |
| viewBox | The coordinate system inside the drawing | SVG attribute defining the internal drawing space |
| currentColor | "Use whatever colour the text is" | CSS keyword inheriting the `color` property from the parent |
| Path data | Instructions for drawing the shape | SVG `d` attribute: M(move), L(line), C(curve), Z(close) |
| Opacity | How see-through something is (0=invisible, 1=solid) | CSS `opacity` property, 0.0 to 1.0 |

### File Map

```
frontend/
  public/circuits/
    ├── bahrain.svg        (Bahrain International Circuit)
    ├── baku.svg           (Baku City Circuit)
    ├── barcelona.svg      (Circuit de Barcelona-Catalunya)
    ├── ... (35 total)
    └── zandvoort.svg      (Circuit Zandvoort)
  app/
    lib/
      └── circuits.ts      (40-entry name→file mapping + getCircuitSvg())
    page.tsx               (RaceCard renders circuit outline)
```

### Adding a New Circuit

```bash
# 1. Create the SVG (500x500 viewBox, currentColor stroke)
#    Save to frontend/public/circuits/new-circuit.svg

# 2. Add mapping entry to frontend/app/lib/circuits.ts:
#    "New Grand Prix": "new-circuit",

# That's it — the race card picks it up automatically.
```

---

## Post-Launch Fix: Accurate Circuit SVGs (2026-03-19)

### What went wrong

The original 35 SVGs were hand-drawn bezier curves — rough approximations of circuit shapes. While some were recognizable (Spa's triangle, Suzuka's figure-8), most were inaccurate enough that F1 fans would notice immediately. Monaco looked like a generic rectangle. Silverstone's complex Maggots-Becketts section was just a smooth curve. The shapes were "inspired by" the real tracks rather than traced from them.

### What was fixed

All 35 SVGs were replaced with accurate track outlines sourced from [julesr0y/f1-circuits-svg](https://github.com/julesr0y/f1-circuits-svg), a community-maintained GitHub repo with real circuit layouts traced from official track maps. The repo covers every F1 circuit from 1950 to present, with multiple layout variants per circuit (e.g., `silverstone-1.svg` through `silverstone-8.svg` for each major track reconfiguration).

A Python download script was used to:
1. Fetch the latest layout variant for each of our 35 circuits from the repo's `white-outline` folder
2. Extract the SVG `<path>` data and original `viewBox`
3. Replace the stroke with `currentColor` for theme compatibility
4. Scale the `stroke-width` proportionally to the viewBox size

### Key technical changes

**ViewBox fix:** The original SVGs used `viewBox="0 0 120 80"` but the downloaded paths have coordinates in the hundreds (e.g., Silverstone's path has points at x=500, y=400). The fix preserves the original `viewBox="0 0 500 500"` from the source repo, so the path coordinates match the coordinate space.

**Stroke width scaling:** With a 500x500 viewBox, a `stroke-width="2"` would be invisibly thin at thumbnail size. The download script now calculates `stroke_w = max(3, round(vb_width / 100))`, giving a stroke width of 5 for the 500x500 viewBoxes — visible even at 56x40px render size.

**Opacity increase:** Bumped from `opacity-[0.07]` (7%) to `opacity-[0.15]` (15%) on the race cards. The original 7% was barely visible — the accurate outlines deserve to be seen.

### Source mapping

Each of our filenames maps to a specific variant from the repo:

| Our filename | Repo source | Why this variant |
|-------------|-------------|-----------------|
| silverstone.svg | silverstone-8.svg | Current layout (post-2010 reconfiguration) |
| monza.svg | monza-7.svg | Current layout with chicanes |
| monaco.svg | monaco-6.svg | Current layout |
| spa.svg | spa-francorchamps-4.svg | Current layout |
| suzuka.svg | suzuka-2.svg | Current layout |
| red-bull-ring.svg | spielberg-3.svg | Current short layout |
| barcelona.svg | catalunya-6.svg | Current layout (modified Turn 10) |
| singapore.svg | marina-bay-4.svg | Current layout |
| mexico-city.svg | mexico-city-3.svg | Current layout |
| ... | ... | (35 total — all using latest variant) |

### Hydration error fix (same commit)

A Next.js hydration error was also fixed in this commit. The Grammarly browser extension was injecting `data-new-gr-c-s-check-loaded` and `data-gr-ext-installed` attributes onto the `<body>` tag at runtime. These attributes didn't exist in the server-rendered HTML, causing a hydration mismatch. The fix: added `suppressHydrationWarning` to the `<body>` tag in `layout.tsx` (it was already on `<html>` but doesn't propagate to children).

### Remaining work

Some circuits may still have minor inaccuracies — the repo's SVGs are community-contributed and some tracks may use older layout variants. A visual audit against current track maps would catch these. Low priority since the outlines are at 15% opacity and thumbnail size.

---

*Updated: 2026-03-19 | Project: Raceday | Phase 6C + fix | Source: github.com/julesr0y/f1-circuits-svg*
