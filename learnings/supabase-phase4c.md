# Supabase — Raceday Phase 4C (Built)

> The backend-as-a-service that handles user accounts, database, and live discussion for Raceday — so you build features instead of infrastructure.

---

## In Plain English

Imagine you want to add a comment section to Raceday. Users need to sign up, log in, post theories, reply to each other, and upvote things. Building all of that from scratch is months of work — you'd need to set up a database, write secure login code, build an API for every action, and handle all the edge cases of storing passwords safely.

Supabase does all of that for you before you write a single line of your own code. You go to their website, create a project, define your tables, and immediately have a working database with a login system and an API. The frontend talks to Supabase directly — no backend code needed for the social layer.

Think of it like renting a fully-equipped kitchen instead of building one. Supabase is the kitchen — you bring the recipes (your features). For Raceday, the recipes are: user sign-in, fan theories per race, comments on theories, and upvoting.

---

## What We Actually Built

### The Setup

1. Created a Supabase project at supabase.com ("RaceDay", production environment)
2. Installed `@supabase/supabase-js` in the frontend
3. Created `frontend/lib/supabase.ts` — the client singleton
4. Stored project URL and anon key in `frontend/.env.local` (gitignored)
5. Enabled anonymous sign-in and email auth in the Supabase dashboard
6. Ran the SQL schema to create tables + RLS policies + real-time

### Architecture — Two Backends, One Frontend

```
┌─────────────────────────────────────────────┐
│           Next.js Frontend                  │
│                                             │
│  Race data     ←──── FastAPI (port 8080)    │
│  (results,           Python, FastF1         │
│   standings,         Jolpica, OpenMeteo     │
│   strategy,                                 │
│   sidebar)                                  │
│                                             │
│  User data     ←──── Supabase (cloud)       │
│  (auth,              Postgres, PostgREST    │
│   theories,          GoTrue, Realtime       │
│   comments,                                 │
│   upvotes)                                  │
└─────────────────────────────────────────────┘
```

FastAPI doesn't know Supabase exists. Supabase doesn't know FastAPI exists. The frontend is the only thing that knows about both. Zero coupling.

---

## The Supabase Client

**`frontend/lib/supabase.ts`**

Plain English: This is the single connection to Supabase that every component uses.

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Technical detail: `NEXT_PUBLIC_` prefix makes these available in client-side code (Next.js convention). The `!` tells TypeScript "trust me, these exist." The anon key is public by design — it only grants access per RLS policies. The client handles JWT storage, refresh tokens, and WebSocket connections automatically.

---

## Authentication (What Was Built)

### `frontend/app/components/AuthButton.tsx`

Plain English: A button in the navbar that handles three states — not signed in, signed in as guest, and signed in with email. Shows the appropriate UI for each.

**Three auth flows:**

```typescript
// Guest — anonymous session (can read, can't post)
const { error } = await supabase.auth.signInAnonymously();

// Email sign up — creates a new account
const { error } = await supabase.auth.signUp({ email, password });

// Email sign in — existing account
const { error } = await supabase.auth.signInWithPassword({ email, password });

// Sign out
await supabase.auth.signOut();
```

**Auth state listener:**

```typescript
useEffect(() => {
  supabase.auth.getUser().then(({ data }) => setUser(data.user));
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });
  return () => listener.subscription.unsubscribe();
}, []);
```

This runs once on mount: gets the current user (from stored JWT), then listens for auth changes (sign in, sign out, token refresh). The cleanup unsubscribes to prevent memory leaks.

**UI states:**

| State | What shows |
|-------|-----------|
| Not signed in | [Guest] [Sign In] buttons |
| Guest (anonymous) | "Guest" + [Sign Up] + [Sign Out] |
| Registered | email + [Sign Out] |
| Modal open | Email/password form with sign-in/sign-up toggle |

The Sign In modal has a toggle between "Sign In" and "Create Account" — one form, two modes. Enter key submits from the password field.

**Integrated into Navbar:** AuthButton sits next to the year dropdown. Navbar widened from `max-w-3xl` to `max-w-5xl` to match the race page layout.

---

## Database Schema (What Was Built)

Three tables created via SQL in the Supabase dashboard:

### theories

```sql
CREATE TABLE theories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  race_year INT NOT NULL,
  race_track TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

Plain English: Each theory belongs to one user and one race. `race_year` + `race_track` identify which race page it appears on. `ON DELETE CASCADE` means if a user deletes their account, their theories are automatically removed.

### comments

```sql
CREATE TABLE comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  theory_id UUID REFERENCES theories(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

Plain English: Comments are replies to theories. If a theory is deleted, all its comments go too (cascade).

### upvotes

```sql
CREATE TABLE upvotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  theory_id UUID REFERENCES theories(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, theory_id)
);
```

Plain English: One upvote per user per theory — the `UNIQUE` constraint prevents double-upvoting at the database level.

**Key design decision:** No `profiles` table. We reference `auth.users` directly. Simpler schema — Supabase's auth system already stores user emails and IDs. We can add a profiles table later if we need usernames or avatars.

---

## Row Level Security (What Was Built)

RLS was enabled by default when we created the project. Every table has four policies:

### The anonymous check pattern

```sql
-- Only non-anonymous users can insert
CREATE POLICY "theories_insert" ON theories
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND auth.jwt()->>'is_anonymous' = 'false'
  );
```

This is the critical pattern: `auth.jwt()->>'is_anonymous' = 'false'` extracts the `is_anonymous` field from the JWT and checks it. Guest users have `is_anonymous = true` in their token, so this blocks them from posting. Without this check, guests could post theories (because `signInAnonymously()` gives them a real user ID that would pass `auth.uid() = user_id`).

### Full policy summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| theories | Anyone | Registered only | Own only | Own only |
| comments | Anyone | Registered only | — | Own only |
| upvotes | Anyone | Registered only | — | Own only |

---

## Real-time Subscriptions (What Was Built)

All three tables were added to the Supabase real-time publication:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE theories;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE upvotes;
```

In the frontend, `DiscussionPanel.tsx` subscribes to all three:

```typescript
const channel = supabase
  .channel(`discussion-${raceYear}-${raceTrack}`)
  .on("postgres_changes", { event: "*", schema: "public", table: "theories" }, () => {
    fetchTheories();
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => {
    fetchTheories();
    if (expandedId) fetchComments(expandedId);
  })
  .on("postgres_changes", { event: "*", schema: "public", table: "upvotes" }, () => {
    fetchTheories();
  })
  .subscribe();

return () => {
  supabase.removeChannel(channel);
};
```

Plain English: When anyone posts a theory, comment, or upvote anywhere in the database, every user on that race page instantly sees the update — no refresh needed. The cleanup `removeChannel()` runs when the component unmounts to prevent memory leaks.

**Design choice:** We re-fetch the full theory list on every change rather than surgically inserting the new item. This is simpler and guarantees consistency (upvote counts, comment counts all recalculate). For a fan platform with moderate traffic, the extra queries are negligible.

---

## Discussion Panel (What Was Built)

### `frontend/app/components/DiscussionPanel.tsx`

Plain English: A full discussion UI added as a fourth tab on race pages. Shows theories with upvotes, expandable comments, and a post form for registered users.

**Key features:**

1. **Theory list** — fetches all theories for the current race, sorted by newest first
2. **Upvote counts** — counted client-side by querying the upvotes table (no denormalized counter)
3. **Comment counts** — same approach, counted from the comments table
4. **User upvote state** — checks if the current user has already upvoted each theory
5. **Expand to see comments** — clicking "X replies" toggles the comment thread
6. **Post form** — title + body textarea, only shown to registered users
7. **Reply input** — inline text input at the bottom of expanded comments
8. **Time ago** — "just now", "5m ago", "2h ago", "3d ago" relative timestamps

**The upvote toggle:**

```typescript
const toggleUpvote = async (theoryId: string, currentlyUpvoted: boolean) => {
  if (!canPost) return;
  if (currentlyUpvoted) {
    await supabase.from("upvotes").delete()
      .eq("user_id", user!.id).eq("theory_id", theoryId);
  } else {
    await supabase.from("upvotes").insert({
      user_id: user!.id, theory_id: theoryId,
    });
  }
  fetchTheories();
};
```

Click once to upvote, click again to remove. The `UNIQUE(user_id, theory_id)` constraint in the database prevents duplicates even if the frontend has a bug.

**Guest prompt:**

```typescript
{canPost ? (
  <button onClick={() => setShowForm(!showForm)}>
    Share a theory or take...
  </button>
) : (
  <p>Sign up with email to join the discussion.</p>
)}
```

Guests see content but get a gentle prompt to sign up when they try to post.

---

## Race Page Integration

The race page now has four tabs instead of three:

```typescript
type Tab = "results" | "standings" | "strategy" | "discussion";

{(["results", "standings", "strategy", "discussion"] as Tab[]).map((t) => (
  <button key={t} onClick={() => setTab(t)} ...>{t}</button>
))}

{tab === "discussion" && (
  <DiscussionPanel raceYear={parseInt(year)} raceTrack={trackName} />
)}
```

The Discussion tab doesn't fetch from FastAPI at all — it goes directly to Supabase. No backend changes were needed.

---

## Files Created and Modified

| File | Status | What it does |
|------|--------|-------------|
| `frontend/lib/supabase.ts` | **Created** | Supabase client singleton |
| `frontend/.env.local` | **Created** | Supabase URL + anon key (gitignored) |
| `frontend/app/components/AuthButton.tsx` | **Created** | Guest/email auth with sign-in modal |
| `frontend/app/components/DiscussionPanel.tsx` | **Created** | Theory list, comments, upvotes, real-time |
| `frontend/app/components/Navbar.tsx` | **Modified** | Added AuthButton, widened to max-w-5xl |
| `frontend/app/races/[year]/[track]/page.tsx` | **Modified** | Added Discussion tab |
| `.gitignore` | **Modified** | Added .env.local |

**Zero backend changes:** FastAPI was not touched. Supabase handles the entire social layer independently.

---

## Edge Cases & Gotchas

**1. Anonymous users and RLS**
In plain English: Guest sessions have a real user ID — if your RLS only checks `auth.uid() IS NOT NULL`, guests can post.
Fix: Every insert policy checks `auth.jwt()->>'is_anonymous' = 'false'`.

**2. The anon key is public — that's fine**
In plain English: The `SUPABASE_ANON_KEY` is in your frontend code where anyone can see it. This is intentional.
Why it's safe: The anon key only grants access per RLS policies. The service role key (which bypasses RLS) is never in frontend code.

**3. Supabase free tier pauses after 1 week of inactivity**
In plain English: If no one uses the app for a week, Supabase pauses the project. Next visit takes ~20 seconds to wake up.
Fix: Set up a cron ping, or upgrade when you deploy for real users.

**4. Real-time re-fetches the full list**
In plain English: When any change happens, we re-fetch all theories rather than surgically updating one.
Why: Simpler code, guaranteed consistency (counts recalculate). Fine for moderate traffic. Could optimize later with optimistic updates.

**5. No profiles table — using auth.users directly**
In plain English: We don't store usernames or avatars yet. Theories show by user email or "Guest".
Future: Add a `profiles` table when we need display names or profile pictures.

---

## How It Connects to Everything Else

- **FastAPI (Phases 1-3)**: Serves race data (results, standings, strategy, sidebar). Completely independent of Supabase. No coupling.
- **Phase 4A (Historical data)**: Discussion works on any indexed race — 2010 or 2024, doesn't matter. The Discussion tab just needs a year and track name.
- **Phase 4B (Facts sidebar)**: The sidebar shows auto-stats + press + Reddit. The Discussion tab shows user-generated theories. They coexist on the same page — sidebar on the right, discussion as a tab.
- **Stripe (future)**: When you add subscriptions, a Stripe webhook sets `subscriber: true` on the user's metadata in Supabase. RLS can check this for premium features.

---

## Quick Reference

### Supabase client
```typescript
import { supabase } from "@/lib/supabase";
```

### Auth
```typescript
await supabase.auth.signInAnonymously()        // Guest
await supabase.auth.signUp({ email, password }) // Register
await supabase.auth.signInWithPassword({ email, password }) // Login
await supabase.auth.signOut()                   // Logout
const { data: { user } } = await supabase.auth.getUser()
user?.is_anonymous  // true = guest, false = registered
```

### Database queries
```typescript
// Read theories for a race
const { data } = await supabase.from("theories")
  .select("*").eq("race_year", 2023).eq("race_track", "British Grand Prix")

// Insert a theory
await supabase.from("theories").insert({ user_id, race_year, race_track, title, body })

// Toggle upvote
await supabase.from("upvotes").insert({ user_id, theory_id })
await supabase.from("upvotes").delete().eq("user_id", id).eq("theory_id", tid)
```

### Real-time
```typescript
const channel = supabase.channel("name")
  .on("postgres_changes", { event: "*", schema: "public", table: "theories" }, callback)
  .subscribe()
// Cleanup:
supabase.removeChannel(channel)
```

### Key Terms
| Term | Plain English | Technical |
|------|--------------|-----------|
| Supabase | Managed backend service | Open-source BaaS on Postgres |
| RLS | Rules for who can see/edit what | Row Level Security policies in SQL |
| anon key | Public API key for the frontend | JWT granting access per RLS |
| PostgREST | Turns tables into an API | Auto-generates REST from schema |
| Realtime | Live updates without refreshing | WebSocket on Postgres NOTIFY |
| is_anonymous | Whether a user is a guest | Boolean in JWT, checked by RLS |

---

*Updated: 2026-03-17 | Project: Raceday | Phase 4C complete | Files: supabase.ts, AuthButton.tsx, DiscussionPanel.tsx, Navbar.tsx, page.tsx*
