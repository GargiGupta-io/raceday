"""
rss_fetcher.py — RSS Feed Article Fetcher

Fetches recent F1 articles from The Race and Autosport RSS feeds,
filters them by race name and year, and returns structured article data.

RSS feeds only contain recent articles (latest ~20-50), so this works
best for current/recent races. For historical races, results will
typically be empty — the sidebar handles this gracefully.
"""

import logging
import time
from datetime import datetime

import feedparser

logger = logging.getLogger(__name__)

_FEEDS = {
    "The Race": "https://the-race.com/feed/",
    "Autosport": "https://www.autosport.com/rss/feed/all",
}

# feedparser doesn't use requests.Session, but we can set the user agent
feedparser.USER_AGENT = "Raceday/1.0 (F1 fan intelligence platform)"


def _fetch_feed(url: str, retries: int = 2) -> list[dict]:
    """
    Fetch and parse an RSS feed, returning a list of entry dicts.
    Retries on failure with 2s backoff.
    """
    for attempt in range(retries + 1):
        try:
            feed = feedparser.parse(url)
            if feed.bozo and not feed.entries:
                logger.warning("RSS feed error for %s: %s", url, feed.bozo_exception)
                if attempt < retries:
                    time.sleep(2)
                    continue
                return []
            return feed.entries
        except Exception as exc:
            logger.warning("RSS fetch failed for %s: %s", url, exc)
            if attempt < retries:
                time.sleep(2)
    return []


def _matches_race(entry: dict, race_name: str, year: int) -> bool:
    """
    Check if an RSS entry is about a specific race.

    Matches if the title or summary contains keywords from the race name
    AND the year. Uses flexible matching — splits the race name into words
    and checks for key terms (e.g. "British" from "British Grand Prix").
    """
    title = (entry.get("title") or "").lower()
    summary = (entry.get("summary") or "").lower()
    text = f"{title} {summary}"

    year_str = str(year)

    # Extract the distinctive part of the race name (e.g. "British" from "British Grand Prix")
    name_words = race_name.lower().replace("grand prix", "").strip().split()
    if not name_words:
        return False

    # The race keyword is the first distinctive word (e.g. "british", "australian", "monaco")
    race_keyword = name_words[0]

    # Must contain the race keyword
    if race_keyword not in text:
        return False

    # For recent articles, year might not be mentioned explicitly
    # Check if the article date is in the same year
    published = entry.get("published_parsed") or entry.get("updated_parsed")
    if published:
        try:
            entry_year = published.tm_year
            if entry_year == year:
                return True
        except (AttributeError, TypeError):
            pass

    # Fallback: check if year string appears in text
    if year_str in text:
        return True

    return False


def _entry_to_article(entry: dict, source: str) -> dict:
    """Convert a feedparser entry to our article format."""
    published = ""
    pub_parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if pub_parsed:
        try:
            published = datetime(*pub_parsed[:6]).strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            published = entry.get("published", "")

    return {
        "title": entry.get("title", ""),
        "url": entry.get("link", ""),
        "summary": (entry.get("summary") or "")[:300],
        "source": source,
        "published": published,
    }


def get_race_articles(race_name: str, year: int, max_per_source: int = 5) -> list[dict]:
    """
    Fetch articles about a specific race from all RSS feeds.

    Returns a list of article dicts:
        title     — article headline
        url       — link to the full article
        summary   — first ~300 chars of the article summary
        source    — "The Race" or "Autosport"
        published — ISO date string (YYYY-MM-DD) or empty

    Returns an empty list if no matching articles are found.
    Articles are sorted by published date (newest first).
    """
    all_articles = []

    for source_name, feed_url in _FEEDS.items():
        entries = _fetch_feed(feed_url)
        matched = []
        for entry in entries:
            if _matches_race(entry, race_name, year):
                matched.append(_entry_to_article(entry, source_name))
                if len(matched) >= max_per_source:
                    break
        all_articles.extend(matched)
        logger.info("RSS %s: %d/%d entries matched '%s %s'",
                     source_name, len(matched), len(entries), year, race_name)

    # Sort by date, newest first
    all_articles.sort(key=lambda a: a.get("published", ""), reverse=True)
    return all_articles


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    race = "British Grand Prix"
    year = 2025
    print(f"=== RSS articles for {year} {race} ===\n")
    articles = get_race_articles(race, year)
    if articles:
        for a in articles:
            print(f"  [{a['source']}] {a['title']}")
            print(f"    {a['url']}")
            print(f"    Published: {a['published']}")
            print()
    else:
        print("  No matching articles found (expected for non-recent races).")

    # Also test with a keyword likely in current feeds
    print(f"\n=== RSS articles mentioning 'Formula 1' (any race) ===\n")
    for source_name, feed_url in _FEEDS.items():
        entries = _fetch_feed(feed_url)
        print(f"  {source_name}: {len(entries)} total entries in feed")
        if entries:
            print(f"    Latest: {entries[0].get('title', 'N/A')}")
