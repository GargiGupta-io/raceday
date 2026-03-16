# Phase 4B — Facts & Theories Sidebar

> How Raceday pulls live F1 journalism, fan theories, and race narratives from RSS feeds and the Reddit API to build a "did you know" sidebar alongside race results.

---

## In Plain English

Right now, Raceday shows you the facts of a race: who won, what tyres they used, how many positions they gained. What it doesn't tell you is the *story* — the context, the drama, the opinions. Why did Rosberg's wing fail? What did Hamilton say about the strategy call? What are fans arguing about in the comments?

Phase 4B adds a sidebar to every race page that brings in three types of content: professional journalism from The Race and Autosport (the best F1 writing on the internet), fan theories and hot takes from Reddit, and auto-generated "did you know" stats pulled from the race data we already have.

Think of RSS feeds like a newspaper's home delivery service — except the newspaper sends you a structured list of headlines and summaries rather than a physical paper, and you choose which newspapers to subscribe to. Reddit's API is just Reddit's way of letting programs access the same posts and comments you'd see on the website. We don't scrape Reddit — we ask it politely through its official API.

The result: a race page that feels alive, not just a data table. You see the podium, the strategy, and right alongside it — what journalists wrote about the race, and what fans were discussing. For historical races, the Reddit posts won't be from that race weekend, but they will be from fans discussing the race retrospectively, which is often even more interesting.

---

## The Three Content Streams

### Stream 1: RSS Feeds (The Race + Autosport)

**In plain English:** RSS is a technology that websites use to publish a list of their latest articles in a machine-readable format. It's been around since 1999 and is still widely used by news sites. Instead of us visiting The Race or Autosport, loading ads, and scraping their HTML, they give us a clean, structured list of their articles in a format called XML. We read that list and pick out anything related to the race we're looking at.

**Technical view:** RSS (Really Simple Syndication) is an XML format. A typical entry looks like:

```xml
<item>
  <title>Hamilton dominates Australian Grand Prix as Rosberg retires</title>
  <link>https://www.the-race.com/formula-1/2014/hamilton-dominates-australia</link>
  <description>Lewis Hamilton took a dominant victory at the season opener...</description>
  <pubDate>Sun, 16 Mar 2014 17:45:00 GMT</pubDate>
  <category>Formula 1</category>
</item>
```

We parse this using the `feedparser` library in Python. feedparser handles the XML parsing, date conversion, and encoding quirks automatically.

**The Race RSS:** `https://the-race.com/feed/`
**Autosport RSS:** `https://www.autosport.com/rss/news/all/`

**How we filter for a specific race:**

RSS feeds return the latest 20–50 articles across all topics. To find articles about "the 2014 Australian Grand Prix", we:
1. Fetch the feed
2. Check each article's `title` and `description` for keywords: the race name ("Australian"), the year ("2014"), and F1 terms ("Grand Prix", "Hamilton", "race")
3. Keep articles that match; discard the rest

For historical races, the live RSS feed won't have 10-year-old articles — it only shows recent ones. So for historical races we do a slightly different approach: we search for articles that *reference* that race (e.g. retrospectives, "10 years ago today" pieces, historical analysis).

**For current/recent races:** The RSS approach works perfectly. We cache the articles we find so we don't re-fetch them every time someone loads the page.

#### feedparser in practice

feedparser is a Python library that turns any RSS/Atom feed into a Python object:

```python
import feedparser

feed = feedparser.parse("https://the-race.com/feed/")

for entry in feed.entries:
    print(entry.title)        # "Hamilton dominates Australian GP"
    print(entry.link)         # "https://the-race.com/..."
    print(entry.summary)      # First paragraph of the article
    print(entry.published)    # "2014-03-16T17:45:00"
    print(entry.tags)         # [{"term": "Formula 1"}, {"term": "Race"}]
```

feedparser handles:
- RSS 0.9, RSS 1.0, RSS 2.0, Atom — all the different versions
- Malformed XML (very common on the real web)
- Date formats in 12 different standards
- HTML entities in text (`&amp;` → `&`)

#### Autosport vs The Race — Content Differences

| Source | Tone | Strength | Volume |
|--------|------|----------|--------|
| The Race | Technical, in-depth | Strategy analysis, team radio | ~5-8 articles/day |
| Autosport | News-focused, fast | Breaking news, driver quotes | ~15-20 articles/day |

We show both because they complement each other. The Race gives depth; Autosport gives breadth.

---

### Stream 2: Reddit API (r/formula1)

**In plain English:** Reddit is a forum where fans post discussions, opinions, race threads, and analysis. r/formula1 has over 9 million members and generates thousands of posts per race weekend. Reddit offers a free, official API that lets us read posts and comments without scraping.

**Technical view:** Reddit's API uses OAuth2 for authentication, but for read-only access to public subreddits, we can use their "script" app type which is dead simple to set up. The base URL is `https://www.reddit.com/` and you can get JSON from any public page by adding `.json`:

```
GET https://www.reddit.com/r/formula1/search.json
  ?q=2014+Australian+Grand+Prix
  &sort=top
  &t=all
  &limit=10
```

**Headers required:** Reddit blocks requests without a proper User-Agent. You must include:
```
User-Agent: Raceday/1.0 (by /u/YourUsername)
```

**Response structure:**

```json
{
  "data": {
    "children": [
      {
        "data": {
          "title": "Race Thread: 2014 Australian Grand Prix",
          "score": 4821,
          "url": "https://reddit.com/r/formula1/...",
          "selftext": "Full post text here...",
          "num_comments": 1893,
          "created_utc": 1394989200,
          "permalink": "/r/formula1/comments/...",
          "author": "formula1_mod"
        }
      }
    ]
  }
}
```

**What we fetch for each race:**
1. **Race Thread** — the official mega-thread posted before/during the race. Contains thousands of live reactions. We search for it using `"Race Thread: {year} {race_name}"`.
2. **Top fan theories** — posts tagged as "Discussion" or "Analysis" that got high upvotes. These are usually the most interesting takes.
3. **Notable comments** — top comments from the race thread (a separate API call to the thread's comment endpoint).

**Rate limits:** Reddit's free API allows 60 requests per minute for unauthenticated read-only access, or 100/minute with a free OAuth token. For our use case (index once, cache forever), this is more than enough.

**Authentication options:**

Option A — No auth (simplest): Use the `.json` trick on public URLs. Rate limit: 60/min. No registration needed.

```python
resp = requests.get(
    "https://www.reddit.com/r/formula1/search.json?q=2014+Australian+GP&sort=top&t=all",
    headers={"User-Agent": "Raceday/1.0 (by /u/raceday_app)"}
)
data = resp.json()
```

Option B — Script OAuth (recommended): Register a free "script" app at reddit.com/prefs/apps. Get a client_id and secret. Gives higher rate limits and more stable access.

We'll start with Option A and upgrade if needed.

**Moderation note:** r/formula1 posts are moderated, so the content is generally high quality. Obvious spam and rule-breaking is removed quickly. We only show the top-scored posts/comments, which tends to surface the best analysis.

---

### Stream 3: Auto-Generated Stats ("Did You Know")

**In plain English:** This is content we generate ourselves from data we already have — no external API needed. We look at the race data and generate interesting observations automatically. "Hamilton gained 8 positions in this race — his highest grid gain of the 2014 season." Or "This was the first wet race at Albert Park since 2010." These feel like journalism but are actually just clever calculations on our indexed data.

**Technical view:** This is implemented in `insights.py` as a new function: `get_did_you_know(year, track)`. It runs a series of small calculations against the indexed race data and returns a list of notable observations.

Examples of auto-stats we can generate:

```python
def get_did_you_know(year: str, track: str) -> list[str]:
    facts = []

    # Biggest mover
    max_gain = max(r["positions_delta"] for r in standings if r["positions_delta"])
    driver = [r for r in standings if r["positions_delta"] == max_gain][0]["driver"]
    if max_gain >= 5:
        facts.append(f"{driver} gained {max_gain} positions — the biggest climb of the race.")

    # Retirements unusual?
    retirements = len([r for r in results if r["status"] == "Retired"])
    if retirements >= 5:
        facts.append(f"{retirements} retirements — an unusually chaotic race.")

    # Strategy variety
    unique_stops = len(set(d["stops"] for d in strategy if d["stops"] is not None))
    if unique_stops >= 3:
        facts.append(f"Drivers tried {unique_stops} different pit stop strategies.")

    return facts
```

This doesn't require any network calls, which makes it fast and reliable.

---

## The Sidebar Architecture

**In plain English:** On the race detail page, the sidebar sits to the right of the main content (or below on mobile). It's divided into three sections with clear labels: "From the press", "Fan discussion", and "Did you know". Each section is populated by one of the three streams.

**Technical view:** The sidebar is a React component (`FactsSidebar`) that receives pre-fetched data as props. On the race page, we fetch all three streams in parallel using `Promise.all()` — same pattern as the Results/Standings/Strategy tabs already do.

```
Race page (races/[year]/[track]/page.tsx)
│
├── Fetches in parallel:
│   ├── /races/{year}/{track}/results  → ResultsCard
│   ├── /races/{year}/{track}/standings → StandingsTable
│   ├── /races/{year}/{track}/strategy  → StrategyPanel
│   └── /races/{year}/{track}/sidebar   → FactsSidebar  ← NEW
│
└── Layout:
    ┌──────────────────────┬──────────────────┐
    │  Tabs (Results /     │   Did you know   │
    │  Standings /         │   ─────────────  │
    │  Strategy)           │   From the press │
    │                      │   ─────────────  │
    │                      │   Fan discussion │
    └──────────────────────┴──────────────────┘
```

**New API endpoint:** `GET /races/{year}/{track}/sidebar`

This endpoint in `api.py` calls a new insights function `get_sidebar_content(year, track)` which:
1. Calls the RSS fetcher with the race name + year
2. Calls the Reddit fetcher with the race name + year
3. Calls `get_did_you_know(year, track)`
4. Returns all three as a single JSON object

**Caching strategy:**
- Did-you-know: computed from indexed data, always fast, no caching needed
- RSS articles: fetched once per race and saved to `data/index/{year}/{track}/sidebar_rss.json`
- Reddit posts: fetched once and saved to `data/index/{year}/{track}/sidebar_reddit.json`

This means after the first load, the sidebar is as fast as any other tab.

---

## Data Flow for the Sidebar

```
User loads race page for 2014 Australian GP
         │
    Frontend calls GET /races/2014/Australian%20Grand%20Prix/sidebar
         │
    api.py → insights.get_sidebar_content(2014, "Australian Grand Prix")
         │
         ├── Check cache: sidebar_rss.json exists? → load it
         │     If not:
         │       rss_fetcher.get_race_articles("Australian Grand Prix", 2014)
         │         → fetch The Race feed + Autosport feed
         │         → filter articles mentioning "Australian" + "2014"
         │         → save to sidebar_rss.json
         │
         ├── Check cache: sidebar_reddit.json exists? → load it
         │     If not:
         │       reddit_fetcher.get_race_posts("Australian Grand Prix", 2014)
         │         → search r/formula1 for "2014 Australian Grand Prix"
         │         → fetch top 5 posts + top comments from race thread
         │         → save to sidebar_reddit.json
         │
         └── insights.get_did_you_know(2014, "Australian Grand Prix")
               → calculate facts from already-indexed race data
               → return list of strings (no caching needed, it's fast)
         │
    Return combined JSON:
    {
      "articles": [{"title": "...", "url": "...", "source": "The Race"}, ...],
      "reddit_posts": [{"title": "...", "score": 4821, "url": "..."}, ...],
      "did_you_know": ["Hamilton gained 8 positions — ...", ...]
    }
         │
    Frontend renders FactsSidebar component
```

---

## New Files in Phase 4B

| File | What it does |
|------|-------------|
| `backend/core/rss_fetcher.py` | Fetches and filters articles from The Race + Autosport RSS feeds |
| `backend/core/reddit_fetcher.py` | Queries Reddit API for race threads + fan discussions |
| `backend/api.py` | Modified: adds `/races/{year}/{track}/sidebar` endpoint |
| `backend/core/insights.py` | Modified: adds `get_sidebar_content()` and `get_did_you_know()` |
| `frontend/app/components/FactsSidebar.tsx` | New sidebar component |
| `frontend/app/races/[year]/[track]/page.tsx` | Modified: fetch sidebar data, render FactsSidebar |

---

## Edge Cases & Gotchas

**1. RSS feeds change format**
In plain English: The Race or Autosport might change how their RSS feed is structured, breaking our parser.
Technical cause: RSS has multiple versions (RSS 2.0, Atom) and sites sometimes switch between them or add custom fields.
How to avoid: feedparser handles all RSS versions automatically. Cache what we fetch — if the feed breaks tomorrow, we still have the cached articles from when it worked.

**2. No articles for old races**
In plain English: The Race RSS feed only goes back a few years. For a 2014 race, there probably aren't any articles in their current feed.
Technical cause: RSS is a live feed, not an archive. Sites only publish recent articles via RSS.
How to avoid: For historical races, fall back to The Race's URL-based search (if they have one) or show the "did you know" section and Reddit only. The sidebar gracefully hides sections with no content.

**3. Reddit search returns wrong race**
In plain English: Searching "Australian Grand Prix 2014" might surface posts about the 2015 or 2019 race if those posts reference 2014.
Technical cause: Reddit's search doesn't do exact phrase matching by default.
How to avoid: Filter results by date range (posts from within 2 weeks of the race date for current races, or requiring the year in the title for historical). Always rank by score so the most relevant posts appear first.

**4. Reddit API flakiness**
In plain English: Reddit's API occasionally returns 503 errors or rate-limit responses.
Technical cause: Reddit throttles heavily during traffic spikes and has aggressive rate limiting.
How to avoid: Same retry pattern as Jolpica (3 attempts, exponential backoff). If Reddit fails completely, return an empty `reddit_posts: []` — the sidebar still shows articles and did-you-know.

**5. Sidebar slowing down the race page**
In plain English: If the sidebar takes 3 seconds to fetch Reddit, the whole page feels slow.
Technical cause: Network calls take time, especially if the API is slow.
How to avoid: Fetch the sidebar data independently from the tab data — the tabs render immediately, and the sidebar loads in parallel or even lazily (shows a spinner until ready). Cache aggressively so only the first load is slow.

---

## What RSS Is (Deep Dive)

RSS stands for Really Simple Syndication. Here's the full picture of how it works:

**The publish side (website):** When The Race publishes an article, their CMS automatically updates their RSS feed — an XML file at a fixed URL. This file always contains the latest 20–50 articles with their titles, summaries, dates, and links.

**The subscribe side (us):** We request that XML file using a regular HTTP GET. feedparser parses it into Python objects.

**Why RSS is better than scraping the website:**
- The feed is designed for machines to read — no need to find content buried in HTML
- The format is stable and predictable
- The site *wants* you to use it (it's why they publish it)
- No JavaScript rendering issues
- Much less likely to be blocked

**Why RSS still has limitations:**
- Only the latest articles — no archive
- Summary text only, not full articles (we show headlines and link to the full piece)
- No search by topic — we have to filter ourselves

---

## Quick Reference

### RSS endpoints
| Source | Feed URL |
|--------|----------|
| The Race | `https://the-race.com/feed/` |
| Autosport | `https://www.autosport.com/rss/news/all/` |

### feedparser basics
```python
import feedparser

feed = feedparser.parse(url)
for entry in feed.entries:
    title     = entry.title
    link      = entry.link
    summary   = entry.get("summary", "")
    published = entry.get("published", "")
```

### Reddit search endpoint
```
GET https://www.reddit.com/r/formula1/search.json
    ?q={race_name}+{year}
    &sort=top
    &t=all
    &limit=10
    &restrict_sr=1
```

### Sidebar JSON shape
```json
{
  "articles": [
    {"title": "...", "url": "...", "source": "The Race", "published": "2014-03-16"}
  ],
  "reddit_posts": [
    {"title": "...", "url": "...", "score": 4821, "num_comments": 1893}
  ],
  "did_you_know": [
    "Hamilton gained 8 positions — the biggest climb of the race."
  ]
}
```

### Key Terms
| Term | Plain English | Technical meaning |
|------|---------------|-------------------|
| RSS | A website's automatic article list | XML feed at a fixed URL, updated when content is published |
| feedparser | Tool that reads RSS feeds | Python library that handles all RSS/Atom versions |
| Subreddit | A topic-specific forum on Reddit | `/r/formula1` — 9M members, F1-focused |
| Reddit API | Reddit's official data access service | REST API, free, read-only public data |
| OAuth2 | The login system Reddit uses for API apps | Token-based auth; we use "script" type for simplicity |
| Race Thread | The official live discussion post for each race | Posted by moderators, gets thousands of comments |
| Sidebar | The column next to the main content | FactsSidebar component, rendered right of the tabs |
| Cache | Saving fetched data to disk | `sidebar_rss.json` / `sidebar_reddit.json` in the race index folder |

---

*Generated: 2026-03-16 | Project: Raceday | Covers: Phase 4B pre-build — RSS feeds, Reddit API, facts sidebar architecture*
