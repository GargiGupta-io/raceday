# Phase 4B — Facts & Theories Sidebar (Built)

> How Raceday pulls F1 journalism from RSS feeds, fan discussion from Reddit, and auto-generates race stats — then displays them in a sidebar alongside race results. Plus: background indexing so all data is ready before anyone visits.

---

## In Plain English

Before Phase 4B, Raceday showed you the facts of a race: who won, what tyres they used, how many positions they gained. But it didn't tell you the *story* — the context, the drama, the opinions. Why did Rosberg's wing fail? What did Hamilton say about the strategy call? What are fans arguing about online?

Phase 4B adds a sidebar to every race page that brings in three types of content: professional journalism from The Race and Autosport (two of the best F1 publications), fan discussion from Reddit's r/formula1 (9+ million members), and auto-generated "did you know" stats pulled from the race data we already have. The result: a race page that feels alive, not just a data table.

We also fixed a major gap: the championship page showed "could not load standings" for years where no races had been individually visited. The fix was background indexing — when the server starts, it automatically downloads and indexes every race from 2010 to 2024 in a background thread, so all data is ready before anyone visits any page.

---

## What We Built

### Overview

Five new backend modules, one new frontend component, and updates to three existing files. The sidebar loads independently from the main tab content — the race results, standings, and strategy appear instantly while the sidebar fills in a moment later.

```
Race Detail Page (new layout)
┌──────────────────────────────┬────────────────────┐
│                              │   Did you know     │
│   Tabs: Results / Standings  │   ────────────     │
│         / Strategy           │   * PER gained 9   │
│                              │   * 4 strategies   │
│   [Tab content here]         │                    │
│                              │   Fan discussion   │
│                              │   ────────────     │
│                              │   Race Thread 730↑ │
│                              │   VER wins...  4k↑ │
│                              │   RIC test...  4k↑ │
└──────────────────────────────┴────────────────────┘
         flex-1                      w-72 (lg only)
```

---

## Source 1: RSS Feed Fetcher (What Was Built)

**In plain English:** RSS is a technology where news sites publish a machine-readable list of their latest articles. Instead of scraping their website, we read this structured list and pick out anything about the race we're looking at.

### `backend/core/rss_fetcher.py`

**Two feeds configured:**

```python
_FEEDS = {
    "The Race": "https://the-race.com/feed/",
    "Autosport": "https://www.autosport.com/rss/feed/all",
}
```

**How article matching works:**

The tricky part is filtering. An RSS feed has 15-50 recent articles on all topics. To find articles about "the 2023 British Grand Prix", we:

1. Extract the distinctive keyword from the race name: "British Grand Prix" → "british"
2. Check each article's title and summary for that keyword
3. Verify the year matches — either the article's publication date is in the same year, or the year string appears in the text

```python
def _matches_race(entry, race_name, year):
    race_keyword = name_words[0]  # "british", "australian", "monaco"
    if race_keyword not in text:
        return False
    # Check if article date is in the same year
    if published and published.tm_year == year:
        return True
    # Or if year string appears in text
    if year_str in text:
        return True
    return False
```

**Important limitation:** RSS feeds only keep the latest 15-50 articles. For a 2023 race in 2026, the feed won't have anything. The sidebar handles this by hiding the "From the press" section when empty.

**feedparser library:** Handles all RSS versions (RSS 0.9, 1.0, 2.0, Atom), malformed XML, 12 different date formats, and HTML entities automatically. We don't need to worry about any of that.

### Test results

```
The Race: 15 entries in feed
Autosport: 50 entries in feed
2023 British GP: 0 matches (expected — articles are from 2026)
```

---

## Source 2: Reddit Fetcher (What Was Built)

**In plain English:** Reddit's r/formula1 has 9+ million members and generates thousands of posts per race weekend. We search for a specific race and pull back the official race thread plus the most-upvoted fan discussions.

### `backend/core/reddit_fetcher.py`

**No authentication needed.** We use the `.json` trick — append `.json` to any public Reddit URL and get structured data back. A proper User-Agent header is required:

```python
_SESSION.headers.update({
    "User-Agent": "Raceday/1.0 (F1 fan intelligence platform, by /u/raceday_app)",
})
```

**The search precision problem (and fix):**

The initial Reddit search for `british grand prix 2023` returned the most popular r/formula1 posts of all time — Verstappen winning Abu Dhabi 2021, Gasly winning Monza 2020 — because Reddit matched on "grand prix" globally and sorted by score.

**Fix:** Exact phrase matching + client-side filtering:

```python
# Quoted phrases force Reddit to match the whole phrase
query = f'"british" "grand prix" 2023'
params = {"q": query, "sort": "relevance", ...}

# Client-side filter: title must contain BOTH the race keyword AND the year
posts = [
    p for p in posts
    if race_kw_lower in p["title"].lower() and year_str in p["title"]
    and p["score"] > 10
]
```

After the fix, the 2023 British GP correctly returns:
- Race thread: "2023 British Grand Prix - Day After Devries" (730 pts, 341 comments)
- VER takes pole (8,225 pts)
- VER wins the race (4,238 pts)
- Ricciardo's Pirelli test at Silverstone (4,447 pts)
- Clarkson arrives at Silverstone (3,505 pts)

**Two separate search functions:**

`get_race_thread()` — specifically looks for the official moderator-posted race thread by searching for "Race Thread" or "Post Race Discussion" in the title.

`search_race_posts()` — broader search for all highly-upvoted posts about the race.

`get_race_posts()` — combines both and deduplicates (removes the race thread from general posts if it appeared in both searches).

### Rate limiting

Reddit allows ~60 requests/minute without auth. We handle 429 (rate limited) responses by reading the `Retry-After` header:

```python
if resp.status_code == 429:
    wait = int(resp.headers.get("Retry-After", 5))
    time.sleep(wait)
    continue
```

---

## Source 3: Did-You-Know Auto-Stats (What Was Built)

**In plain English:** These are interesting facts we generate ourselves from the race data — no external API needed. The code scans results for 8 different patterns and produces plain-English observations.

### `insights.py: get_did_you_know(year, track)`

**Patterns detected:**

| Pattern | Example output |
|---------|---------------|
| Mass retirements (5+) | "8 drivers retired — an unusually chaotic race." |
| Zero retirements | "Every driver finished the race — a clean day." |
| Biggest position gain (5+) | "PER gained 9 positions — the biggest climb of the race." |
| Biggest position loss (5+) | "GAS lost 8 positions from the grid." |
| Winner from far back (P5+) | "HAM won from P5 — a proper fightback victory." |
| Strategy variety (3+ strategies) | "Drivers used 4 different pit stop strategies." |
| Wet/damp weather | "A wet race — rain played a major role." |
| Extreme temperature | "Scorching 38°C air temperature." |
| Podium from outside top 10 | "BOT made the podium from P15." |

**The Jolpica retirement bug:**

During testing, the 2014 Australian GP (8 retirements) showed "Every driver finished" — clearly wrong. The cause: Jolpica assigns finish positions even to retired drivers (they get positions 15-22 at the end of the classification). The original check `finish_position is None` missed them.

Fix: use status-based detection instead:

```python
# Before (broken for Jolpica data):
retired = [r for r in results if r["finish_position"] is None and ...]

# After (works for both FastF1 and Jolpica):
retired = [r for r in results if r["status"] not in ("Finished",)
           and not r["status"].startswith("+")]
```

### Test results

```
2023 British GP: 3 facts (PER +9, GAS -8, 4 strategies)
2014 Australian GP: 5 facts (8 retirements, BOT +10, RIC -20, 3 strategies, damp)
```

---

## The Sidebar Pipeline (How It All Connects)

### `insights.py: get_sidebar_content(year, track)`

This function ties all three sources together with disk caching:

```python
def get_sidebar_content(year, track):
    # RSS — cached to sidebar_rss.json
    if rss_cache.exists():
        articles = load from cache
    else:
        articles = rss_fetcher.get_race_articles(track, year)
        save to rss_cache

    # Reddit — cached to sidebar_reddit.json
    if reddit_cache.exists():
        reddit = load from cache
    else:
        reddit = reddit_fetcher.get_race_posts(track, year)
        save to reddit_cache

    # Did-you-know — computed on the fly (fast, reads local data)
    did_you_know = get_did_you_know(year, track)

    return {"articles": articles, "reddit": reddit, "did_you_know": did_you_know}
```

Cache files are saved in the same race index directory: `data/index/2023/British Grand Prix/sidebar_rss.json` and `sidebar_reddit.json`. After the first fetch, subsequent loads read from disk instantly.

### API endpoint

```
GET /races/{year}/{track}/sidebar
→ {"articles": [...], "reddit": {"race_thread": {...}, "posts": [...]}, "did_you_know": [...]}
```

### Frontend integration

The race page fetches sidebar data independently from tab data:

```typescript
// Tab data (blocks render)
Promise.all([results, standings, strategy]).then(...)

// Sidebar data (loads independently, doesn't block tabs)
fetch(`${base}/sidebar`).then(data => setSidebar(data)).catch(() => {});
```

Layout changed from single-column `max-w-3xl` to two-column `max-w-5xl`:
- Left: `flex-1 min-w-0` — main content (tabs)
- Right: `hidden lg:block w-72 shrink-0` — sidebar (hidden on mobile)

### `FactsSidebar.tsx`

Three sections in dark zinc cards:
- **Did you know** — yellow `*` bullet markers, plain text facts
- **From the press** — clickable headlines linking to The Race / Autosport, with source and date
- **Fan discussion** — Reddit race thread in a highlighted card, then top posts with upvote counts and comment numbers

Empty sections are hidden automatically — if no articles exist for an old race, that section simply disappears.

---

## Background Indexing (What Was Added)

**In plain English:** The championship page was broken for every year except those where someone had manually visited individual race pages. The fix: when the server starts, it automatically downloads all race data for every season from 2010 to 2024 in the background.

### The problem

Raceday used on-demand indexing — data only downloaded when a specific race page was visited. The championship page reads `indexer.list_indexed()` to find all indexed races for a year, sums up points, and returns standings. If no races were indexed for a year, it returned 404.

### The fix

**`backend/api.py`** — FastAPI lifespan event launches a daemon thread:

```python
SEASONS_TO_INDEX = list(range(2010, 2025))  # 2010–2024

def _background_index_all():
    for year in SEASONS_TO_INDEX:
        result = indexer.index_season(year)
        # logs progress, updates _indexing_status dict

@asynccontextmanager
async def lifespan(app):
    thread = threading.Thread(target=_background_index_all, daemon=True)
    thread.start()
    yield

app = FastAPI(lifespan=lifespan)
```

Key design decisions:
- **Daemon thread** — dies automatically when the server shuts down, no cleanup needed
- **`index_season()` skips already-indexed races** — so restarts are fast (seconds, not minutes)
- **Server is usable immediately** — the thread runs in the background while the API serves requests
- **Progress tracking** — `GET /indexing/status` returns live progress:

```json
{
  "running": true,
  "current_year": 2014,
  "completed_years": [2010, 2011, 2012, 2013],
  "total_indexed": 58,
  "total_skipped": 2,
  "total_failed": 0
}
```

### Year-aware routing in action

For 2010-2017, `index_season()` calls the Jolpica + OpenMeteo + compound_lookup pipeline built in Phase 4A. For 2018-2024, it uses FastF1. The indexer routes automatically based on the year — the background thread doesn't need to know about any of this.

First full run: ~15-30 minutes (downloads ~300 races). Every restart after that: seconds (all races already on disk, skipped instantly).

---

## Files Created and Modified

| File | Status | What it does |
|------|--------|-------------|
| `backend/core/rss_fetcher.py` | **Created** | Fetches + filters articles from The Race and Autosport RSS feeds |
| `backend/core/reddit_fetcher.py` | **Created** | Searches r/formula1 for race threads and fan posts |
| `frontend/app/components/FactsSidebar.tsx` | **Created** | Three-section sidebar component |
| `backend/requirements.txt` | **Modified** | Added feedparser + requests |
| `backend/core/insights.py` | **Modified** | Added get_did_you_know() + get_sidebar_content() |
| `backend/api.py` | **Modified** | Added /sidebar route, /indexing/status route, background indexer |
| `frontend/app/races/[year]/[track]/page.tsx` | **Modified** | Two-column layout, independent sidebar fetch |

---

## Edge Cases & Gotchas (Discovered During Build)

**1. Reddit search too broad**
In plain English: Searching "british grand prix 2023" returned Abu Dhabi 2021 and Monza 2020 — the most popular posts ever on r/formula1 that happened to contain "grand prix."
Fix: Exact phrase matching (`"british" "grand prix"`) plus client-side filtering requiring both the race keyword AND the year in the title.

**2. Jolpica retirement detection**
In plain English: The "Every driver finished" fact fired for the 2014 Australian GP which had 8 retirements.
Cause: Jolpica assigns finish positions (P15-P22) even to retired drivers. The check `finish_position is None` missed them.
Fix: Use status-based detection — check if status is not "Finished" and doesn't start with "+".

**3. RSS feeds empty for old races**
In plain English: RSS only keeps the latest 15-50 articles. A 2023 race viewed in 2026 won't have any matching articles.
Impact: The "From the press" section simply doesn't appear. Not a bug — working as designed.

**4. Championship page 404 for unvisited years**
In plain English: The championship page needs all races indexed to calculate points, but on-demand indexing meant most years had zero data.
Fix: Background indexing on server start — indexes all 2010-2024 seasons automatically.

**5. feedparser SystemError on Windows**
In plain English: A `SystemError: bad argument to internal function` appears in terminal after feedparser finishes.
Cause: Known Python/Windows cleanup bug in dict objects during interpreter shutdown.
Impact: Cosmetic only — doesn't affect data or functionality.

---

## Quick Reference

### RSS feed URLs
| Source | Feed URL |
|--------|----------|
| The Race | `https://the-race.com/feed/` |
| Autosport | `https://www.autosport.com/rss/feed/all` |

### Reddit search
```
GET https://www.reddit.com/r/formula1/search.json
    ?q="british" "grand prix" 2023
    &sort=relevance&t=all&limit=25&restrict_sr=1
```

### Sidebar JSON shape
```json
{
  "articles": [{"title": "", "url": "", "source": "The Race", "published": "2026-03-16"}],
  "reddit": {
    "race_thread": {"title": "", "url": "", "score": 730, "num_comments": 341},
    "posts": [{"title": "", "url": "", "score": 8225, "num_comments": 500}]
  },
  "did_you_know": ["PER gained 9 positions — the biggest climb of the race."]
}
```

### Indexing status
```
GET /indexing/status
→ {"running": true, "current_year": 2014, "completed_years": [...], "total_indexed": 58}
```

### Key Terms
| Term | Plain English | Technical meaning |
|------|---------------|-------------------|
| RSS | A website's automatic article list | XML feed at a fixed URL, parsed by feedparser |
| .json trick | Getting data from Reddit without an account | Append .json to any public Reddit URL |
| Sidebar caching | Save fetched articles/posts to disk | sidebar_rss.json + sidebar_reddit.json in race index dir |
| Background indexing | Download all race data when server starts | Daemon thread calling index_season() for 2010-2024 |
| Daemon thread | A background worker that dies when the server stops | `threading.Thread(daemon=True)` |
| Lifespan event | Code that runs on server start/stop | FastAPI's `@asynccontextmanager` lifespan pattern |

---

*Updated: 2026-03-16 | Project: Raceday | Phase 4B complete | Files: rss_fetcher.py, reddit_fetcher.py, FactsSidebar.tsx, insights.py, api.py*
