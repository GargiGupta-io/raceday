# Phase 6A — Story-First Race Page Redesign

> Raceday's race page went from a four-tab database view to a single scrollable story with expandable sections for fans who want more depth. The biggest structural change in the project's history.

---

## In Plain English

Imagine you walk into a museum and every exhibit is behind a locked door with a label on it — "Paintings", "Sculptures", "History", "Gift Shop." You'd have to open each door to know what's inside, and you'd never see the whole story in one visit. That's what Raceday's race page was: four tabs (Results, Standings, Strategy, Discussion), each hiding content behind a click.

Phase 6A tore down the doors. Now the museum is one long hallway. You walk in and see the headline exhibit (who won), then the highlights (key moments), and at the end there's a section marked "Go Deeper" where curators have extra detail for anyone who wants it. A first-time visitor reads top to bottom and understands the race. A repeat visitor skims to the Go Deeper section and expands what interests them.

This is called "progressive disclosure" — show the essential stuff first, hide the detail behind an opt-in action. It's the same principle Netflix uses (poster → description → trailer → play) and Wikipedia uses (summary → table of contents → full article). The key insight is that **everyone sees the same page, but different people use different amounts of it.**

## What Is Progressive Disclosure? (The Technical View)

Progressive disclosure is a UI design pattern where information is revealed in layers. The first layer is visible by default and serves the broadest audience. Deeper layers are hidden behind interactions (clicks, scrolls, expansions) and serve narrower, more expert audiences.

In web development, this usually takes three forms:

1. **Scroll-based** — content is ordered by importance top-to-bottom. Everyone sees the top; only engaged users scroll to the bottom. This is what news sites and social feeds do.

2. **Accordion/expandable** — sections start collapsed with just a title visible. Clicking reveals the content. This is what FAQ pages and settings panels do.

3. **Tab-based** — content is grouped behind tab labels. Only one tab is visible at a time. This is what dashboards and admin panels do.

Raceday moved from approach #3 (tabs) to a combination of #1 and #2 (scroll + accordions). The reason: tabs work well when users know what they're looking for (like settings categories), but they fail when users are exploring or learning. A beginner looking at "Results | Standings | Strategy | Discussion" doesn't know which tab holds the answer to "what happened in this race?" They'd have to click each one. With the scroll layout, the answer is: just read.

## The Problem It Solves

### Before Phase 6A

The race page had four tabs:

```
┌─────────┬────────────┬──────────┬────────────┐
│ Results │ Standings  │ Strategy │ Discussion │
└─────────┴────────────┴──────────┴────────────┘
```

Each tab hid a different set of components:
- **Results**: Winner card (large), P2/P3 cards, weather card, retirements card, key moments
- **Standings**: Full P1-P20 finishing order table, season story (momentum, turning points, constructors), season insights (awards, teammate H2H)
- **Strategy**: Story/data sub-tabs with strategy narrative and compound breakdown table
- **Discussion**: Supabase-powered theories and comments (empty for 99% of races)

Problems with this layout:

1. **Discovery failure** — The best content (strategy narrative, key moments, season turning points) was buried behind tabs most users never clicked.

2. **Database feel** — Four tabs with dense data in each one made it feel like a spreadsheet app, not a learning experience.

3. **Beginner hostility** — A first-time F1 viewer sees "Strategy" as a tab label and has no idea what it means or why they'd click it.

4. **Wasted space** — The Discussion tab was empty for almost every race. No user base, no content, just dead weight.

5. **Content duplication** — Weather appeared in the Results tab and also influenced the strategy narrative. Retirements appeared in Results and also in the standings table. The tabs created artificial separation between related information.

### After Phase 6A

```
┌──────────────────────────────────┐
│  2023 British Grand Prix          │
│  (year · track header)            │
│                                   │
│  THE RESULT                       │
│  🥇 Max Verstappen · Red Bull    │
│  🥈 Lando Norris   · McLaren    │
│  🥉 Lewis Hamilton · Mercedes   │
│                                   │
│  KEY MOMENTS                      │
│  ↑ Perez gained 9 places         │
│  ↓ Leclerc dropped 5 places      │
│  ★ Verstappen: pole to victory   │
│                                   │
│  ──── GO DEEPER ────              │
│  ▸ Strategy breakdown             │
│  ▸ Season standings at this point │
│  ▸ Season awards & teammate H2H  │
│                                   │
│         SIDEBAR                   │
│     Race Intelligence             │
│     • Did You Know facts          │
└──────────────────────────────────┘
```

One scroll. No tabs. Beginners read top to bottom. Fans expand what they want.

## How It Works

### The Single-Scroll Layout

Plain English: Instead of hiding content behind tab clicks, everything is stacked vertically on one page in order of importance.

The race page component (`page.tsx`) used to have a `tab` state variable that controlled which content was visible:

```tsx
// BEFORE — tab-controlled rendering
type Tab = "results" | "standings" | "strategy" | "discussion";
const [tab, setTab] = useState<Tab>("results");

// Only ONE of these rendered at a time:
{tab === "results" && <ResultsCard />}
{tab === "standings" && <SeasonStory />}
{tab === "strategy" && <StrategyStory />}
{tab === "discussion" && <DiscussionPanel />}
```

Now there's no tab state at all. Everything renders in sequence:

```tsx
// AFTER — all sections visible in scroll order
<div className="flex-1 min-w-0 space-y-8">
  {results && <ResultsCard data={results} />}
  <KeyMoments year={year} track={trackName} />
  <GoDeeper>
    <GoDeeperItem title="Strategy breakdown">...</GoDeeperItem>
    <GoDeeperItem title="Season standings">...</GoDeeperItem>
    <GoDeeperItem title="Season awards">...</GoDeeperItem>
  </GoDeeper>
</div>
```

The `space-y-8` Tailwind class puts consistent 2rem vertical gaps between each section, creating a clean visual rhythm as you scroll.

### The Compact Podium (ResultsCard)

Plain English: The podium went from four separate cards (winner, P2, P3, weather, retirements) taking up half the screen to three tight rows inside one card.

**Before:**
- Winner: Large card with team accent border, position badge, full team name
- P2 + P3: Two medium cards side by side
- Weather: Card with emoji icon and condition
- Retirements: Card with driver list
- Total: ~400px of vertical space

**After:**
- Three rows inside one `divide-y` card: medal emoji, driver name, team dot + team name
- Total: ~150px of vertical space

The key change is what got *removed*. Weather and retirements aren't shown anymore — they'll be woven into the race story narrative when Phase 6D is built. This is a deliberate design decision: weather and retirements are *context* for the story, not standalone information. "It rained and Verstappen still won from pole" is more useful than a weather emoji sitting alone in a box.

**`frontend/app/components/ResultsCard.tsx`**

Plain English: This component takes the race result data and renders a compact three-row podium card with medal emojis and team colour dots.

```tsx
const POSITION_MEDAL: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

export default function ResultsCard({ data }: { data: RaceSummary }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">The Result</p>
      <div className="rounded-lg bg-zinc-900 divide-y divide-zinc-800">
        {data.podium.map((p) => {
          const dot = TEAM_DOT[p.team] || "bg-zinc-500";
          const medal = POSITION_MEDAL[p.position] ?? `P${p.position}`;
          return (
            <div key={p.position} className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg w-7 text-center">{medal}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-zinc-100 ${
                  p.position === 1 ? "text-base" : "text-sm"
                }`}>
                  {dn(p.driver)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <p className="text-xs text-zinc-500">{p.team}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Technical detail: The `divide-y divide-zinc-800` class on the container creates thin horizontal lines between each child `div`, replacing the need for explicit border management. The `min-w-0` on the name container prevents long names from overflowing the flex layout. The winner (P1) gets `text-base` while P2/P3 get `text-sm` — subtle visual hierarchy without adding extra UI chrome.

The `TEAM_DOT` map converts team names to Tailwind background-color classes. This same map exists in several components (ResultsCard, SeasonStory, KeyMoments) — it's duplicated rather than shared because each component is self-contained. The tradeoff: a new team means updating multiple files, but each component can be understood, moved, or deleted independently.

### The Go Deeper Accordion

Plain English: A collapsible section system where titles are always visible but content is hidden until you click. Like a FAQ page — you see all the questions, but only open the ones you care about.

**`frontend/app/components/GoDeeper.tsx`**

This file exports two things: a `GoDeeper` wrapper (the section header with divider lines) and a `GoDeeperItem` (each collapsible row).

```tsx
function GoDeeperItem({ title, children, defaultOpen = false }: GoDeperItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-zinc-800 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm
                   font-medium text-zinc-300 hover:text-white transition-colors"
      >
        <span>{title}</span>
        <span className={`text-zinc-500 transition-transform duration-200 ${
          open ? "rotate-90" : ""
        }`}>
          ▸
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
```

Technical detail: Each `GoDeeperItem` manages its own `open` state via `useState`. When the button is clicked, `open` toggles and the arrow character rotates 90 degrees via `transition-transform duration-200`. The content renders conditionally — when `open` is false, the children aren't in the DOM at all (not just hidden with CSS). This means components inside a closed accordion don't fetch data or run effects until the user expands them.

This is important for performance: the `SeasonStory` and `SeasonInsights` components inside the accordions make their own API calls in `useEffect`. When collapsed, those calls don't fire. When the user expands "Season standings at this point", *that's* when the fetch happens. This is lazy loading by structure — no explicit lazy-loading code needed.

The `GoDeeper` wrapper creates the visual section divider:

```tsx
export default function GoDeeper({ children }: GoDeeperProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-px flex-1 bg-zinc-800" />
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Go Deeper</p>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
      <div className="rounded-lg bg-zinc-900 divide-y divide-zinc-800">
        {children}
      </div>
    </div>
  );
}
```

The centered "GO DEEPER" text with lines on either side is created using flexbox: two `flex-1` divs (horizontal lines) with text between them. The `flex-1` makes each line grow equally to fill available space, keeping the text perfectly centered regardless of container width.

### The Stripped Sidebar (Race Intelligence)

Plain English: The sidebar used to show three things — news articles, Reddit posts, and auto-generated facts. Only the facts worked reliably, so the other two were cut.

**`frontend/app/components/FactsSidebar.tsx`**

Before: 128 lines with Article and RedditPost interfaces, three conditional sections, external link handling.

After: 27 lines. Just the "Did You Know" facts under a "Race Intelligence" heading.

```tsx
interface SidebarData {
  articles: unknown[];
  reddit: unknown;
  did_you_know: string[];
}

export default function FactsSidebar({ data }: { data: SidebarData }) {
  if (!data.did_you_know || data.did_you_know.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
        Race Intelligence
      </p>
      <ul className="space-y-2">
        {data.did_you_know.map((fact, i) => (
          <li key={i} className="text-sm text-zinc-300 leading-relaxed">
            <span className="text-yellow-500 mr-2">*</span>
            {fact}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Technical detail: The `articles` and `reddit` fields in `SidebarData` are typed as `unknown[]` and `unknown` respectively. The backend still sends them (the `/sidebar` endpoint hasn't changed), but the frontend ignores them. This approach avoids a backend change — the API is backwards-compatible, and if RSS/Reddit are ever re-added, the data is already flowing. The component simply doesn't render what it doesn't need.

The `return null` guard means the entire sidebar disappears if there are no facts. No empty card, no "no data" message — just nothing. This is a deliberate UX choice: showing an empty card draws attention to missing content, while showing nothing lets the main content breathe.

## What We Built — The Complete Picture

### Overview

Phase 6A restructured the race page from a tab-based layout to a single-scroll layout. When a user opens any race, they now see:

1. **Race header** — year and track name
2. **The Result** — compact three-row podium with medals and team colours
3. **Key Moments** — auto-detected highlights (unchanged from Phase 5C, just repositioned)
4. **Go Deeper** — three collapsible sections: Strategy breakdown, Season standings, Season awards & teammate battles
5. **Sidebar** — "Race Intelligence" with Did You Know facts only

### What Was Removed

| Component | Reason | Fate |
|-----------|--------|------|
| Tab navigation | Root cause of the "database feel" | Deleted from page.tsx |
| Weather card | Will be in race story (6D) | Removed from ResultsCard |
| Retirements card | Will be in race story (6D) | Removed from ResultsCard |
| MomentumCard | Redundant with season story | File deleted |
| DiscussionPanel | Empty, requires login, no user base | Removed from page (file kept) |
| RSS articles sidebar | Empty for older races | Removed from FactsSidebar |
| Reddit posts sidebar | Inconsistent quality | Removed from FactsSidebar |

### What Was Added

| Component | Purpose |
|-----------|---------|
| GoDeeper wrapper | Section divider with "GO DEEPER" centered text |
| GoDeeperItem | Collapsible accordion row with arrow toggle |

### What Was Modified

| Component | Change |
|-----------|--------|
| ResultsCard | Slimmed from 170 lines to 108 lines — compact podium only |
| FactsSidebar | Slimmed from 128 lines to 27 lines — Did You Know only |
| SeasonStory | Removed unused MomentumCard import |
| page.tsx | Removed tab system, stacked all sections, wrapped deep content in GoDeeper |

### How the Pieces Connect

```
User opens /races/2023/British Grand Prix
          │
          ▼
    page.tsx loads
          │
          ├── fetches /results ──────► ResultsCard (compact podium)
          ├── KeyMoments fetches /moments independently
          │
          ├── GoDeeper wrapper
          │     ├── GoDeeperItem: "Strategy breakdown"
          │     │     └── (collapsed — no fetch until expanded)
          │     │         ├── StrategyStory fetches /strategy-story
          │     │         └── StrategyPanel uses strategy data from page
          │     │
          │     ├── GoDeeperItem: "Season standings"
          │     │     └── (collapsed — no fetch until expanded)
          │     │         └── SeasonStory fetches /season-story
          │     │
          │     └── GoDeeperItem: "Season awards"
          │           └── (collapsed — no fetch until expanded)
          │               └── SeasonInsights fetches /season-insights
          │
          └── FactsSidebar fetches /sidebar (independent, non-blocking)
                └── renders only did_you_know facts
```

The key performance insight: the page makes 4 API calls on initial load (results, standings, strategy, sidebar). The Go Deeper sections make their own calls only when expanded. So a beginner who reads the podium and key moments triggers only 4 requests. A fan who expands all three Go Deeper sections triggers 7 total. The page loads faster for the majority of users who don't need the deep content.

## Design Decisions Worth Understanding

### Why Not Just Reorder the Tabs?

You could argue: keep tabs, but put the best content in the first tab. That was considered. The problem is that tabs imply *categories* — distinct, parallel things to explore. But race data isn't parallel. The result *leads to* the key moments *which are explained by* the strategy *which sits in the context of* the season standings. It's sequential, not categorical. A scroll layout matches the natural reading order.

### Why Accordion Instead of Just Showing Everything?

If scrolling is good, why not show everything? Because a 20-driver finishing order table, a compound breakdown chart, and a full season constructor battle with bars is *a lot* of content. It would make the page feel overwhelming — the exact problem we're solving. The accordion is a middle ground: the titles are visible (so you know the content exists), but the content is opt-in.

### Why Remove Weather and Retirements Instead of Moving Them?

The weather emoji and retirements list were standalone data points — "it was dry" and "3 drivers retired." Standalone data points feel like a database. In Phase 6D, weather becomes part of the story: "Rain rewrote the script at Silverstone" as a tagline, and "Despite the rain, Verstappen converted pole" in the narrative. Retirements become moments: "8 drivers retired — an unusually chaotic race." Same information, but serving the story instead of sitting in a box.

### Why Keep DiscussionPanel File But Remove It From the Page?

The Supabase tables (theories, comments, upvotes) still exist in the cloud database. Deleting the component file doesn't delete the data. The file is kept so that if the site grows a user base and social features make sense again, the component can be re-imported without being rewritten from scratch. No harm in keeping a 150-line file that nothing imports.

## Edge Cases & Gotchas

1. **Unused state variables in page.tsx**
   In plain English: The page still fetches `standings` data (the P1-P20 finishing order) but nothing renders it directly anymore. The StandingsTable component was imported in Phase 5 but wasn't used in the JSX even before Phase 6A — it was referenced only in the interface.
   Technical cause: The `standings` state and its fetch call in `Promise.all` were left in place because the StandingsTable may be re-added inside a Go Deeper accordion in a future step.
   How to handle: The extra fetch is harmless (the data is cached on the backend). Clean up when the final page layout is settled.

2. **Accordion content lazy-loading is accidental**
   In plain English: Go Deeper sections don't fetch data until you expand them, which is great for performance. But this isn't explicit — it's a side effect of conditional rendering.
   Technical cause: React doesn't mount children of a conditional (`{open && <Component />}`) until the condition is true. Components with `useEffect` don't run effects until mounted. So the fetch inside SeasonStory's useEffect doesn't fire until the accordion opens.
   How to handle: This is fine as-is. If you ever change to CSS-based show/hide (display:none) instead of conditional rendering, the fetches would fire immediately. Keep the conditional rendering approach.

3. **Team colour maps are duplicated across components**
   In plain English: The same team-name-to-colour mappings exist in ResultsCard, SeasonStory, KeyMoments, and potentially GoDeeper children. Adding a new team means updating multiple files.
   Technical cause: Each component was built to be self-contained during different phases. No shared utility was created.
   How to handle: Acceptable for now. When a new F1 season introduces team name changes (e.g., "Sauber" → "Audi"), update all component files. Could extract to a shared `teamColors.ts` utility in the future.

4. **SidebarData interface still has articles and reddit fields**
   In plain English: The sidebar component ignores articles and Reddit data, but the TypeScript interface in page.tsx still describes them.
   Technical cause: The `/sidebar` API endpoint still returns all three fields. The interface matches the API response shape.
   How to handle: When the backend sidebar endpoint is cleaned up (to stop fetching RSS and Reddit), update both the API response and the TypeScript interfaces.

## How It Connects to Other Concepts

- **Phase 6D (Unified Race Story + Tagline)**: The race story will slot between Key Moments and Go Deeper, becoming the centrepiece of the page. Weather and retirement data will be woven into this narrative instead of being standalone cards.

- **Phase 6E (Pattern Matcher)**: "What History Tells Us" will slot between Key Moments and Go Deeper, giving historical context that no other F1 site has.

- **Phase 6H (Radio Sentiment)**: Radio clips will slot between Pattern Matcher and Go Deeper — the emotional layer of the race.

- **Phase 6I (Quiz)**: "Test Your Knowledge" will sit at the bottom of the main flow, just before Go Deeper — the call to action after reading the story.

- **React state management**: Phase 6A simplified state by removing the `tab` variable. The remaining state (`results`, `standings`, `strategy`, `sidebar`, `loading`, `error`, `strategyMode`) is all data-fetching state. The page has zero UI state beyond `strategyMode` — the Go Deeper accordion manages its own open/closed state internally.

- **Component composition**: The GoDeeper/GoDeeperItem pattern uses React's `children` prop for composition. The wrapper doesn't know or care what's inside each accordion — it just provides the expand/collapse shell. This means any component can go inside a GoDeeperItem without modification.

## Going Deeper

### Transition Animations for Accordion

Right now, accordion content appears/disappears instantly (conditional render). Adding a height animation would require either: (a) CSS `max-height` transition with an arbitrary large value, (b) a library like `framer-motion` with `AnimatePresence`, or (c) the new CSS `interpolate-size: allow-keywords` for animating `height: auto`. Worth considering once the layout is final.

### Virtual Scrolling for Long Sections

If any Go Deeper section becomes very long (e.g., a 20-driver strategy table with expanded stint details), virtual scrolling (rendering only visible rows) could improve performance. Libraries like `@tanstack/react-virtual` handle this. Not needed now — the current data size is small enough.

### Prefetching Accordion Content

Currently, Go Deeper sections fetch data only on expand. If the user's connection is fast, this creates a noticeable loading flash. A future improvement could prefetch accordion data after the main content loads (using `requestIdleCallback` or an Intersection Observer), so expanding feels instant. Tradeoff: more API calls for users who never expand.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|-----------------------|-------------------|
| Progressive disclosure | Show simple stuff first, detail on demand | UI pattern: layered information with opt-in depth |
| Accordion | Collapsible section with a clickable title | Component with boolean state toggling child visibility |
| Conditional rendering | Content that only appears when a condition is met | `{condition && <Component />}` in JSX |
| Composition | Building complex things from simple pieces | Using `children` prop to nest arbitrary content |
| Lazy loading | Loading something only when it's needed | Components mount (and fetch) only when rendered |

### File Map After Phase 6A

```
frontend/app/races/[year]/[track]/page.tsx  — main race page (no tabs)
frontend/app/components/
  ├── ResultsCard.tsx    — compact podium (3 rows)
  ├── KeyMoments.tsx     — auto-detected highlights (unchanged)
  ├── GoDeeper.tsx       — accordion wrapper + items (NEW)
  ├── StrategyStory.tsx  — strategy narrative (inside accordion)
  ├── StrategyPanel.tsx  — compound table (inside accordion)
  ├── StrategyKey.tsx    — compound legend (inside accordion)
  ├── SeasonStory.tsx    — turning points + constructors (inside accordion)
  ├── SeasonInsights.tsx — awards + H2H (inside accordion)
  ├── FactsSidebar.tsx   — Race Intelligence / Did You Know only
  ├── Navbar.tsx         — unchanged
  ├── AuthButton.tsx     — unchanged
  └── DiscussionPanel.tsx — kept on disk, not rendered
```

### The Before/After in Numbers

| Metric | Before | After |
|--------|--------|-------|
| Tabs on race page | 4 | 0 |
| Clicks to see all content | 4 (one per tab) | 3 (one per accordion) |
| Components rendered on load | All tab contents | Podium + Key Moments only |
| API calls on load | 4 (results, standings, strategy, sidebar) | 4 (same — but Go Deeper content fetches on demand) |
| ResultsCard lines | 170 | 108 |
| FactsSidebar lines | 128 | 27 |
| Total lines changed | — | +106 added, -229 removed (net -123) |

### Commits

```
1eb83c7 remove tab navigation from race page — single scroll layout
4dcc649 slim ResultsCard to compact podium — three rows, medals, no weather/retirements
57f970c add Go Deeper accordion component with expandable sections
1b04040 move strategy, season standings, and insights into Go Deeper accordions
bfe79e6 remove MomentumCard (redundant) and clean up unused imports
fa4177f strip sidebar to Race Intelligence — Did You Know facts only, drop RSS and Reddit
```

---

*Generated: 2026-03-18 | Project: Raceday | Phase 6A complete | Files: page.tsx, ResultsCard.tsx, GoDeeper.tsx, FactsSidebar.tsx, SeasonStory.tsx, MomentumCard.tsx (deleted)*
