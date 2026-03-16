# Supabase — Raceday Phase 4C

> The backend-as-a-service that handles user accounts, database, and live discussion for Raceday — so you build features instead of infrastructure.

---

## In Plain English

Imagine you want to add a comment section to Raceday. Users need to sign up, log in, post theories, reply to each other, and upvote things. Building all of that from scratch is months of work — you'd need to set up a database, write secure login code, build an API for every action, and handle all the edge cases of storing passwords safely.

Supabase does all of that for you before you write a single line of your own code. You go to their website, create a project, draw out your tables (users, theories, comments, upvotes), and immediately have a working database with a login system and an API that responds to your frontend.

Think of it like renting a fully-equipped kitchen instead of building one. The kitchen exists, the appliances are installed, everything is food-safe and inspected. You walk in and start cooking. Supabase is the kitchen — you bring the recipes (your features).

The other thing that makes Supabase special for Raceday specifically: it handles **real-time updates**. When someone posts a new theory or comment while you're on the page, it appears instantly without you needing to refresh. Supabase pushes the update to your browser automatically — like WhatsApp showing new messages as they arrive.

---

## What Is Supabase? (The Technical View)

Supabase is an open-source Firebase alternative built on top of PostgreSQL — the gold standard of relational databases. It wraps Postgres with a set of services: authentication, auto-generated REST and GraphQL APIs, real-time subscriptions via WebSockets, and file storage. Everything talks to the same underlying database.

It was started in 2020 and has grown into one of the most popular backend platforms for modern web apps. The fact that it's open-source matters: if Supabase the company ever disappeared, you could self-host the entire stack. Your data is never trapped.

Under the hood, Supabase uses:
- **PostgreSQL** for the database
- **PostgREST** to auto-generate the REST API from your table schema
- **GoTrue** for authentication
- **Realtime** (an Elixir/Phoenix server) for WebSocket connections
- **Storage** (S3-compatible) for files

You interact with all of this through one JavaScript/TypeScript SDK or through direct HTTP calls — you don't need to know the internals.

---

## The Problem It Solves

Without Supabase, adding user accounts and discussion to Raceday would require building:

1. A users table with hashed passwords
2. JWT token generation and validation
3. Session management and refresh tokens
4. Sign up / sign in / sign out endpoints
5. Password reset flow
6. A theories table, comments table, upvotes table
7. API endpoints for every CRUD operation on each
8. Authorization logic ("can this user edit this theory?")
9. Real-time polling or WebSocket server for live updates

That's 3-4 weeks of backend work before you've built a single user-facing feature. And you'd likely introduce security vulnerabilities — auth is one of the hardest things to get right.

Supabase collapses all of that into: create a project, define your tables, install the SDK.

---

## How It Works

### The Database — Postgres at the centre

Plain English: Your data lives in a real database with tables and relationships, exactly like a spreadsheet that can link to other spreadsheets.

Supabase's database is standard PostgreSQL. This means you use SQL — the universal language for databases — and every feature of Postgres is available. For Raceday's community layer, the tables would look like:

```sql
-- Who the users are
create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  created_at timestamptz default now()
);

-- Fan theories submitted per race
create table theories (
  id uuid primary key default gen_random_uuid(),
  race_year int not null,
  race_name text not null,
  title text not null,
  body text not null,
  user_id uuid references profiles(id),
  upvotes int default 0,
  created_at timestamptz default now()
);

-- Comments on theories
create table comments (
  id uuid primary key default gen_random_uuid(),
  theory_id uuid references theories(id) on delete cascade,
  user_id uuid references profiles(id),
  body text not null,
  created_at timestamptz default now()
);

-- One upvote per user per theory
create table upvote_records (
  user_id uuid references profiles(id),
  theory_id uuid references theories(id),
  primary key (user_id, theory_id)
);
```

Technical detail: `uuid` is a unique ID format — a long random string like `a4b2c1d0-...` — safer than sequential integers (no one can guess IDs). `references` creates a foreign key — a link between tables. `on delete cascade` means if a theory is deleted, all its comments are automatically deleted too. `timestamptz` stores dates with timezone info.

---

### Authentication — login without building login

Plain English: Supabase handles the entire sign-up and sign-in process — you just call functions, it does the rest.

Supabase's auth system supports:
- Email + password
- Magic link (click a link in email, you're logged in)
- OAuth (Google, GitHub, etc.)
- **Anonymous sign-in** — a temporary session with no credentials

For Raceday's three tiers:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Guest — anonymous session (can read, can't post)
const { data } = await supabase.auth.signInAnonymously()

// Register new account
const { data, error } = await supabase.auth.signUp({
  email: 'fan@example.com',
  password: 'securepassword'
})

// Log in existing account
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'fan@example.com',
  password: 'securepassword'
})

// Check who's logged in
const { data: { user } } = await supabase.auth.getUser()

// Sign out
await supabase.auth.signOut()
```

Technical detail: When a user signs in, Supabase returns a JWT (JSON Web Token) — a cryptographically signed string that proves who you are. The SDK stores this in localStorage automatically and includes it in every subsequent request. The token expires after 1 hour and the SDK silently refreshes it. You never touch the token directly.

The anonymous sign-in creates a real user record internally — they get a UUID and a session — but with no email/password attached. If they later sign up properly, Supabase can **convert** the anonymous account to a real one, preserving any content they posted as a guest.

---

### Auto-generated API — your database becomes an API instantly

Plain English: The moment you create a table, Supabase creates HTTP endpoints for reading and writing it — no code needed.

PostgREST (the engine behind this) reads your PostgreSQL schema and generates a full REST API. Every table gets:

```
GET    /rest/v1/theories          → fetch all theories
GET    /rest/v1/theories?race_name=eq.British Grand Prix  → filter
POST   /rest/v1/theories          → create a theory
PATCH  /rest/v1/theories?id=eq.abc123  → update
DELETE /rest/v1/theories?id=eq.abc123  → delete
```

Through the JavaScript SDK this looks like:

```typescript
// Get all theories for the 2023 British Grand Prix
const { data: theories } = await supabase
  .from('theories')
  .select('*, profiles(username), comments(count)')
  .eq('race_year', 2023)
  .eq('race_name', 'British Grand Prix')
  .order('upvotes', { ascending: false })

// Post a new theory
const { data, error } = await supabase
  .from('theories')
  .insert({
    race_year: 2023,
    race_name: 'British Grand Prix',
    title: 'Red Bull sandbagged in qualifying',
    body: 'Verstappen's sector 2 time was...',
    user_id: user.id
  })
```

Technical detail: The `.select('*, profiles(username)')` syntax uses PostgREST's relationship syntax — it follows the foreign key from `theories.user_id` to `profiles.id` and fetches the username in the same query. No JOIN syntax needed. The `count` aggregate on `comments` returns how many comments each theory has without fetching all comment rows.

---

### Row Level Security — permissions enforced in the database

Plain English: Rules that decide who can read, write, or delete each row — enforced at the database level so nothing slips through.

This is the most important concept in Supabase. Without RLS, anyone with your API key could read or write anything. With RLS, you write rules in SQL and the database enforces them on every single query — even if your application code has a bug.

For Raceday:

```sql
-- Enable RLS on theories table
alter table theories enable row level security;

-- Anyone can read theories (including guests)
create policy "theories are public"
  on theories for select
  using (true);

-- Only authenticated users can insert
create policy "authenticated users can post theories"
  on theories for insert
  with check (auth.uid() = user_id);

-- Users can only update their own theories
create policy "users can edit own theories"
  on theories for update
  using (auth.uid() = user_id);

-- Users can only delete their own theories
create policy "users can delete own theories"
  on theories for delete
  using (auth.uid() = user_id);
```

Technical detail: `auth.uid()` is a Supabase function that returns the ID of whoever is making the current request, extracted from their JWT. `using (true)` means "always allow". `with check (auth.uid() = user_id)` means "only allow if the user_id column matches the requester's ID". These run server-side on every query — you cannot bypass them from the frontend.

---

### Real-time Subscriptions — live updates without refreshing

Plain English: When someone else posts a comment, it appears on your screen instantly — like a live chat, no refresh button needed.

Supabase runs a WebSocket server that watches your database for changes and broadcasts them to connected clients. The frontend subscribes to a channel and receives events:

```typescript
// Listen for new comments on a specific theory
const channel = supabase
  .channel('theory-comments-abc123')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'comments',
      filter: 'theory_id=eq.abc123'
    },
    (payload) => {
      // This runs automatically when a new comment is posted
      setComments(prev => [...prev, payload.new])
    }
  )
  .subscribe()

// Clean up when leaving the page
return () => supabase.removeChannel(channel)
```

Technical detail: Under the hood, Supabase enables Postgres's built-in `NOTIFY`/`LISTEN` mechanism. When a row is inserted, updated, or deleted, Postgres fires a notification. Supabase's Realtime server picks this up and broadcasts it over WebSocket to all subscribed clients. The filter `theory_id=eq.abc123` is applied server-side so clients only receive events relevant to what they're looking at — not every database change.

---

## How It Fits Into Raceday

### Architecture — two backends, one frontend

Plain English: FastAPI handles F1 data, Supabase handles people data. The Next.js frontend talks to both.

```
┌─────────────────────────────────────────────┐
│           Next.js Frontend                  │
│                                             │
│  Race data     ←──── FastAPI (port 8080)    │
│  (results,           Python, FastF1         │
│   standings,         Jolpica, OpenMeteo     │
│   strategy)                                 │
│                                             │
│  User data     ←──── Supabase               │
│  (auth,              Postgres, PostgREST    │
│   theories,          GoTrue, Realtime       │
│   comments,                                 │
│   upvotes)                                  │
└─────────────────────────────────────────────┘
```

They never need to talk to each other. FastAPI doesn't know Supabase exists. Supabase doesn't know FastAPI exists. The frontend is the only thing that knows about both.

---

### The three user tiers in practice

Plain English: Guest users read everything, free users post and discuss, subscribers get premium features later.

```typescript
// On page load — check auth state
const { data: { user } } = await supabase.auth.getUser()

if (!user) {
  // Not signed in at all — auto sign in as guest
  await supabase.auth.signInAnonymously()
}

// Determine what UI to show
const isGuest = user?.is_anonymous === true
const isRegistered = user && !user.is_anonymous
const isSubscriber = user?.user_metadata?.subscriber === true

// Guest: show read-only view
// Registered: show post/comment buttons
// Subscriber: show premium features
```

Technical detail: `is_anonymous` is a boolean on the user object that Supabase sets automatically for anonymous sessions. `user_metadata` is a JSON field on the user record where you store custom data — you'd set `subscriber: true` via a Stripe webhook when someone pays. The RLS policies enforce the permissions server-side regardless of what the frontend checks.

---

### The race detail page with community features

Plain English: The race page becomes a two-column layout — stats on the left, community on the right.

```
┌──────────────────────┬─────────────────────┐
│  Results / Standings │  Facts & Theories   │
│  Strategy tabs       │                     │
│                      │  📰 Race narrative  │
│  [FastAPI data]      │  from The Race RSS  │
│                      │                     │
│                      │  💬 Fan theories    │
│                      │  ─────────────────  │
│                      │  Theory 1  ▲ 42     │
│                      │  Theory 2  ▲ 31     │
│                      │  Theory 3  ▲ 18     │
│                      │                     │
│                      │  [Post a theory]    │
│                      │                     │
│                      │  💬 Discussion      │
│                      │  live comments...   │
└──────────────────────┴─────────────────────┘
```

Theories fetched from Supabase, sorted by upvotes. Comments update in real-time. The "Post a theory" button only appears if the user is registered (not anonymous).

---

## Common Patterns

### Pattern 1: Optimistic UI for upvotes

What it's for: making upvotes feel instant — update the count on screen immediately, then save to database in the background.

```typescript
async function upvoteTheory(theoryId: string) {
  // Update UI instantly (optimistic)
  setTheories(prev => prev.map(t =>
    t.id === theoryId
      ? { ...t, upvotes: t.upvotes + 1 }
      : t
  ))

  // Save to database
  const { error } = await supabase
    .from('upvote_records')
    .insert({ user_id: user.id, theory_id: theoryId })

  if (error) {
    // Roll back if it failed (already upvoted, etc.)
    setTheories(prev => prev.map(t =>
      t.id === theoryId
        ? { ...t, upvotes: t.upvotes - 1 }
        : t
    ))
  }
}
```

### Pattern 2: Converting a guest to a registered user

What it's for: letting someone who posted as a guest keep their content when they sign up properly.

```typescript
// User posted theories as guest, now wants to register
const { data, error } = await supabase.auth.updateUser({
  email: 'fan@example.com',
  password: 'newpassword'
})
// Their anonymous session is converted — same user ID,
// all their theories remain linked to them
```

### Pattern 3: Fetching theories with author + comment count in one query

What it's for: getting everything you need for the sidebar in a single network request.

```typescript
const { data: theories } = await supabase
  .from('theories')
  .select(`
    id,
    title,
    body,
    upvotes,
    created_at,
    profiles ( username ),
    comments ( count )
  `)
  .eq('race_year', year)
  .eq('race_name', trackName)
  .order('upvotes', { ascending: false })
  .limit(20)
```

---

## Edge Cases & Gotchas

1. **Anonymous users and RLS**
   In plain English: Guest sessions still have a user ID — RLS treats them as authenticated users. You have to explicitly check `is_anonymous` if you want to restrict guests.
   Technical cause: `signInAnonymously()` creates a real auth record. `auth.uid()` returns their ID. RLS policies that only check `auth.uid() IS NOT NULL` will pass for guests.
   How to avoid: Add `auth.jwt() ->> 'is_anonymous' = 'false'` to policies that require real accounts.

2. **Real-time and RLS**
   In plain English: Real-time events bypass RLS by default — a user could receive updates for rows they shouldn't see.
   Technical cause: The Realtime server sends changes before RLS filters them unless you explicitly enable RLS for Realtime.
   How to avoid: Run `alter publication supabase_realtime add table comments` and ensure RLS is enabled on the table.

3. **The anon key is public — that's fine**
   In plain English: The `SUPABASE_ANON_KEY` goes in your frontend code where anyone can see it. This is intentional and safe.
   Technical cause: The anon key only grants access to what RLS policies allow for unauthenticated users. It's not a secret — it's a public identifier. The secret key (service role key) must never go in frontend code.
   How to avoid: Never use the service role key in Next.js. Only ever expose the anon key.

4. **Supabase free tier pauses after 1 week of inactivity**
   In plain English: If no one uses the app for a week, Supabase pauses the project. The next visit takes ~20 seconds to wake up.
   Technical cause: Free tier projects are paused to save resources.
   How to avoid: Set up a simple cron ping, or upgrade to the Pro plan when you have real users.

---

## How It Connects to Other Concepts

- **FastAPI**: The two backends are completely independent. FastAPI serves F1 data, Supabase serves user/social data. The frontend calls both. No coupling needed.
- **Next.js**: The Supabase JS SDK works perfectly with Next.js App Router. Auth state can be read server-side for SSR using the `@supabase/ssr` package.
- **Stripe (future)**: When you add subscriptions, a Stripe webhook calls Supabase's admin API to set `subscriber: true` on the user's metadata. One webhook, one database update, RLS handles the rest.
- **Reddit/RSS (Phase 4B)**: The facts sidebar is read-only content pulled from external APIs — no Supabase needed for that. Supabase only handles user-generated content.

---

## Going Deeper

### Supabase Edge Functions
Serverless functions that run close to your users. Use when you need backend logic that doesn't belong in the frontend — like sending an email when someone replies to your theory, or running the Stripe webhook.

### Supabase Storage
S3-compatible file storage. Relevant if you ever let users upload avatars or attach images to theories. RLS policies apply to files too.

### Database Functions and Triggers
You can write SQL functions that run automatically when rows change. For example: automatically increment `theories.upvotes` when a row is inserted into `upvote_records`, rather than doing it in application code.

```sql
create function increment_upvotes()
returns trigger as $$
begin
  update theories
  set upvotes = upvotes + 1
  where id = new.theory_id;
  return new;
end;
$$ language plpgsql;

create trigger on_upvote_insert
  after insert on upvote_records
  for each row execute function increment_upvotes();
```

### Full-text Search
Postgres has built-in full-text search. When the theory database grows, users can search across all theories for a specific race or driver without an external search service.

---

## Quick Reference

### Key Terms

| Term | Plain English | Technical |
|------|--------------|-----------|
| Supabase | The managed backend service | Open-source BaaS on Postgres |
| RLS | Rules for who can see/edit what | Row Level Security policies in SQL |
| anon key | Public API key for the frontend | JWT that grants access per RLS |
| service key | Secret admin key — never expose | Bypasses all RLS |
| PostgREST | What turns tables into an API | Auto-generates REST from schema |
| Realtime | Live updates without refreshing | WebSocket server on Postgres NOTIFY |
| anonymous session | Guest login with no credentials | Real auth record with is_anonymous=true |

### Essential Patterns

```typescript
// Init client (do once, export)
const supabase = createClient(URL, ANON_KEY)

// Auth
await supabase.auth.signInAnonymously()
await supabase.auth.signUp({ email, password })
await supabase.auth.signInWithPassword({ email, password })
const { data: { user } } = await supabase.auth.getUser()

// Query
const { data } = await supabase
  .from('theories')
  .select('*, profiles(username)')
  .eq('race_year', 2023)
  .order('upvotes', { ascending: false })

// Insert
await supabase.from('theories').insert({ title, body, user_id })

// Real-time
supabase.channel('comments')
  .on('postgres_changes', { event: 'INSERT', table: 'comments' }, handler)
  .subscribe()
```

---

*Generated: 2026-03-16 | Project: raceday | Phase: 4C Community Layer*
*Covers: auth, Postgres schema, RLS, real-time, anonymous sessions, Stripe integration path*
