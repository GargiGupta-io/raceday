"""
reddit_fetcher.py — Reddit r/formula1 Post Fetcher

Searches the r/formula1 subreddit for race threads and fan discussions
using Reddit's public JSON API (no authentication required).

Uses the .json trick on public Reddit URLs — appending .json to any
Reddit page returns the same data in JSON format. No OAuth needed
for read-only access to public subreddits.

Rate limit: ~60 requests/minute without auth. We only fetch once per
race and cache the result, so this is never an issue.
"""

import logging
import time

import requests

logger = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Raceday/1.0 (F1 fan intelligence platform, by /u/raceday_app)",
})

_SUBREDDIT = "formula1"


def _get_json(url: str, params: dict | None = None, retries: int = 3) -> dict | None:
    """
    GET a Reddit JSON endpoint with retry and backoff.
    Returns parsed JSON or None on failure.
    """
    for attempt in range(retries):
        try:
            resp = _SESSION.get(url, params=params, timeout=15)
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", 5))
                logger.info("Reddit rate limited, waiting %ds", wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                logger.warning("Reddit request failed: %s — %s", url, exc)
    return None


def _extract_post(post_data: dict) -> dict:
    """Extract the fields we care about from a Reddit post's data dict."""
    d = post_data.get("data", {})
    return {
        "title": d.get("title", ""),
        "url": f"https://www.reddit.com{d.get('permalink', '')}",
        "score": d.get("score", 0),
        "num_comments": d.get("num_comments", 0),
        "author": d.get("author", ""),
        "created": d.get("created_utc", 0),
        "flair": d.get("link_flair_text", ""),
    }


def search_race_posts(race_name: str, year: int, limit: int = 8) -> list[dict]:
    """
    Search r/formula1 for posts about a specific race.

    Searches for the race name + year, sorted by top score.
    Returns a list of post dicts:
        title        — post title
        url          — full Reddit permalink
        score        — upvote count
        num_comments — comment count
        author       — Reddit username
        created      — Unix timestamp
        flair        — post flair (e.g. "Race", "Discussion")

    Returns an empty list on failure or no results.
    """
    # Build search query with quotes for exact phrase matching
    race_keyword = race_name.lower().replace("grand prix", "").strip()
    query = f'"{race_keyword}" "grand prix" {year}'

    url = f"https://www.reddit.com/r/{_SUBREDDIT}/search.json"
    params = {
        "q": query,
        "sort": "relevance",
        "t": "all",
        "limit": 25,
        "restrict_sr": 1,
    }

    data = _get_json(url, params=params)
    if data is None:
        return []

    children = data.get("data", {}).get("children", [])
    posts = [_extract_post(c) for c in children]

    # Client-side filter: title must contain the race keyword AND the year
    race_kw_lower = race_keyword.lower()
    year_str = str(year)
    posts = [
        p for p in posts
        if race_kw_lower in p["title"].lower() and year_str in p["title"]
        and p["score"] > 10
    ]

    # Sort by score and trim to limit
    posts.sort(key=lambda p: p["score"], reverse=True)
    posts = posts[:limit]

    logger.info("Reddit search '%s': %d posts matched", query, len(posts))
    return posts


def get_race_thread(race_name: str, year: int) -> dict | None:
    """
    Find the official race discussion thread for a specific race.

    Searches for posts with "Race Thread" or "Post Race" in the title
    matching the race name and year. Returns the highest-scored match,
    or None if not found.
    """
    race_keyword = race_name.lower().replace("grand prix", "").strip()

    for thread_type in ["Race Thread", "Post Race Discussion"]:
        query = f'"{thread_type}" "{race_keyword}" {year}'
        url = f"https://www.reddit.com/r/{_SUBREDDIT}/search.json"
        params = {
            "q": query,
            "sort": "relevance",
            "t": "all",
            "limit": 5,
            "restrict_sr": 1,
        }

        data = _get_json(url, params=params)
        if data is None:
            continue

        children = data.get("data", {}).get("children", [])
        for c in children:
            post = _extract_post(c)
            title_lower = post["title"].lower()
            if race_keyword in title_lower and str(year) in post["title"]:
                return post

    return None


def get_race_posts(race_name: str, year: int) -> dict:
    """
    Get all Reddit content for a race — thread + top fan posts.

    Returns a dict:
        race_thread — the official race thread (dict or None)
        posts       — list of top fan discussion posts
    """
    race_thread = get_race_thread(race_name, year)
    posts = search_race_posts(race_name, year)

    # Remove the race thread from general posts if it appeared there too
    if race_thread:
        thread_url = race_thread["url"]
        posts = [p for p in posts if p["url"] != thread_url]

    return {
        "race_thread": race_thread,
        "posts": posts,
    }


# ---------------------------------------------------------------------------
# Manual test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    race = "British Grand Prix"
    year = 2023
    print(f"=== Reddit posts for {year} {race} ===\n")

    result = get_race_posts(race, year)

    thread = result["race_thread"]
    if thread:
        print(f"  Race Thread: {thread['title']}")
        print(f"    Score: {thread['score']}  Comments: {thread['num_comments']}")
        print(f"    {thread['url']}")
    else:
        print("  No race thread found.")

    print(f"\n  Top posts ({len(result['posts'])}):")
    for p in result["posts"][:5]:
        print(f"    [{p['score']}] {p['title']}")
        print(f"      {p['url']}")
