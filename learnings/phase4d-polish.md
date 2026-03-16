# Phase 4D — Polish & Bug Fixes (Built)

> Making the app feel complete: extending year coverage, adding Google login, fixing mobile layout, and squashing bugs found during testing.

---

## In Plain English

Phases 4A through 4C added major features — historical data, a facts sidebar, and user accounts with discussion. Phase 4D is the cleanup pass that makes everything feel finished. It's the equivalent of painting the walls after the plumbing and wiring are done: the year selector now covers 2010 to 2024 (instead of stopping at 2018), users can sign in with their Google account, the sidebar shows up on mobile phones instead of disappearing, and the sign-in popup actually works properly.

None of these are big features by themselves, but together they're the difference between "this looks like a prototype" and "this looks like a real app."

---

## What Was Fixed

### 1. Year Range Extended to 2010–2024

**The problem:** The year selector in the navbar dropdown and the home page buttons only showed 2018–2024. But Phase 4A added data all the way back to 2010. Users couldn't see or access 8 years of data.

**The fix:** One line in two files.

**`frontend/app/page.tsx:9`** and **`frontend/app/components/Navbar.tsx:7`**

```typescript
// Before
const YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018];

// After
const YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];
```

**Verified:** 2012 shows 20/20 races indexed. 2014 championship shows Hamilton P1 with 359 pts — matches real history.

---

### 2. Auth Modal Portal Fix

**The problem:** The sign-in modal rendered inside the navbar's sticky container. CSS `position: sticky` creates a new stacking context, so `position: fixed` + `z-index: 50` on the modal was relative to the navbar (z-10), not the page root. The email field was cut off above the viewport.

**The fix:** Render the modal via `createPortal()` to escape the navbar's stacking context entirely.

```typescript
import { createPortal } from "react-dom";

// Modal rendered at document.body level — outside navbar stacking context
const modal = showModal && typeof document !== "undefined"
  ? createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
        {/* modal content */}
      </div>,
      document.body
    )
  : null;

// Buttons always render inline, modal portals to body
return (
  <>
    <div className="flex items-center gap-2">{/* buttons */}</div>
    {modal}
  </>
);
```

**Key insight:** `createPortal` renders a React component at a different DOM location while keeping it in the same React tree (state, events, context all still work). It's the standard fix for modals, tooltips, and dropdowns that need to escape a parent's `overflow: hidden` or stacking context.

---

### 3. Google OAuth

**Setup required:**
1. Google Cloud Console → create OAuth 2.0 Client ID (Web application)
2. Set authorized redirect URI to `https://<project>.supabase.co/auth/v1/callback`
3. Copy Client ID + Secret into Supabase Dashboard → Authentication → Providers → Google

**The code:**

```typescript
const signInGoogle = async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) setError(error.message);
};
```

`redirectTo: window.location.origin` sends the user back to the current page after Google auth completes. Without it, Supabase redirects to the site root.

**UI:** White "Continue with Google" button with the official Google logo SVG, separated from the email form by an "or" divider.

**Not tied to the app name:** The OAuth setup is tied to the Supabase project URL, not the website name. Renaming "Raceday" doesn't require redoing the Google Cloud setup.

---

### 4. Mobile Sidebar

**The problem:** The sidebar was `hidden lg:block` — completely invisible on mobile and tablet. Users on smaller screens couldn't see the did-you-know facts or Reddit posts.

**The fix:** Changed the layout from `flex` (side-by-side only) to `flex-col lg:flex-row` (stacked on mobile, side-by-side on desktop):

```typescript
// Before
<div className="flex gap-8">
  <div className="flex-1 min-w-0">{/* tabs */}</div>
  <div className="hidden lg:block w-72 shrink-0">{/* sidebar */}</div>
</div>

// After
<div className="flex flex-col lg:flex-row gap-8">
  <div className="flex-1 min-w-0">{/* tabs */}</div>
  <div className="w-full lg:w-72 shrink-0">{/* sidebar */}</div>
</div>
```

On mobile: tabs on top, sidebar below. On desktop (lg+): tabs left, sidebar right.

**Tab bar overflow:** Added `overflow-x-auto whitespace-nowrap` to the tab bar so the four tabs ("Results", "Standings", "Strategy", "Discussion") scroll horizontally on very narrow screens instead of wrapping or overflowing.

---

### 5. Sidebar Loading Skeleton

**The problem:** While the sidebar loads, it showed plain text "Loading sidebar..." — looked unfinished.

**The fix:** Replaced with an animated pulse skeleton matching the sidebar card style:

```typescript
<div className="rounded-lg bg-zinc-900 p-4 animate-pulse">
  <div className="h-3 w-24 bg-zinc-800 rounded mb-4" />
  <div className="space-y-2">
    <div className="h-3 w-full bg-zinc-800 rounded" />
    <div className="h-3 w-3/4 bg-zinc-800 rounded" />
    <div className="h-3 w-5/6 bg-zinc-800 rounded" />
  </div>
</div>
```

Tailwind's `animate-pulse` applies a gentle opacity animation. The grey bars mimic the shape of the actual content, giving users a sense of what's coming.

---

## Bug Sweep Results

| Test | Result |
|------|--------|
| Championship 2014 | HAM 359 pts, ROS 317 pts, RIC 226 pts — correct |
| Championship 2022 | Works after indexing completed |
| 2012 season list | 20/20 races indexed |
| 2014 Australian GP results | ROS P1, MAG P2, BUT P3 — correct |
| Auth: guest sign-in | Works |
| Auth: email sign-up | Works (confirmation email sent) |
| Auth: sign out | Works |
| Auth: Google OAuth | Configured, button renders |
| Discussion: theory post | Works (registered users only) |
| Sidebar: did-you-know | 3 facts for 2023 British GP |
| Sidebar: Reddit posts | 8 posts found for 2023 British GP |
| Background indexer | 170+ races skipped (already on disk), 28 newly indexed, 0 failed |

---

## Files Modified

| File | What changed |
|------|-------------|
| `frontend/app/page.tsx` | YEARS extended to 2010-2024 |
| `frontend/app/components/Navbar.tsx` | YEARS extended, max-w-5xl |
| `frontend/app/components/AuthButton.tsx` | Portal fix, Google OAuth button |
| `frontend/app/races/[year]/[track]/page.tsx` | Mobile sidebar, loading skeleton, scrollable tabs |

---

## Key Patterns Learned

### createPortal for modals inside sticky/fixed containers
When a modal is inside a `position: sticky` parent, `position: fixed` doesn't escape the stacking context. Use `createPortal(jsx, document.body)` to render at the document root.

### Tailwind responsive stacking
`flex flex-col lg:flex-row` is the standard pattern for "stacked on mobile, side-by-side on desktop." Combined with `w-full lg:w-72`, the sidebar takes full width on mobile and fixed width on desktop.

### animate-pulse skeleton
Grey bars with `animate-pulse` create a loading skeleton in one line of Tailwind. Match the shape of real content for the best effect.

---

*Updated: 2026-03-17 | Project: Raceday | Phase 4D complete*
