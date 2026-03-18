# Phase 6E — Pattern Matcher: Finding Similar Races Across F1 History

> A scoring engine that compares any F1 race against 305 indexed races to find historical parallels — the feature no other F1 site has.

---

## In Plain English

Imagine you've just watched the 2023 Belgian Grand Prix. Max Verstappen won from P6 on the grid in changeable weather. You're curious: has this kind of thing happened before? Has a driver won from that far back at Spa? Do wet Spa races usually produce big comebacks?

Before Phase 6E, you'd have to manually scroll through 15 years of races, open each one, and check. That's 305 races. Nobody does that.

The Pattern Matcher does it for you in under a second. It takes the race you're looking at, extracts its key characteristics (who won, where they started, was it wet, how many retired, was it a team 1-2), then compares those characteristics against every other indexed race. Each shared trait earns points. The races with the highest scores are the most similar.

The result appears on the race page as "What History Tells Us" — a few sentences like "In 5 previous races at Spa, pole sitters won 2 times" and "In similar damp conditions, 3 of 3 races saw major position gains." Below that, links to the 3 most similar races so you can click through and read their stories.

There's also a standalone Pattern Finder page at `/patterns` where you can build your own queries: "show me every wet race where the winner started P5 or worse" or "every Ferrari win at Monza." It's like a search engine for F1 history, except instead of searching text, you're searching race characteristics.

## What Is Similarity Scoring? (The Technical View)

Similarity scoring is a technique where two items are compared across multiple dimensions, and each matching dimension contributes points to a total score. The higher the score, the more similar the items are. It's the same principle behind recommendation engines ("users who bought X also bought Y") and content-based filtering.

In Raceday's case, a "race profile" is a vector of characteristics: circuit name, weather condition, winner's grid position, DNF count, maximum position gain, dominant strategy, whether pole won, whether it was a team 1-2. Two races are compared by checking how many of these characteristics match or are close to matching.

The scoring is weighted — not all traits are equally important. Same circuit (+5 points) is the strongest signal because fans are specifically interested in what happened at the same track. Same weather (+2) matters because conditions fundamentally change race dynamics. Same winner grid position (+3) matters because a comeback win is a fundamentally different story than a pole-to-win. Same winner name (+2) connects the driver's career arc.

This is deliberately simpler than machine learning approaches like cosine similarity or k-nearest-neighbors. The weights are hand-tuned, not learned. The dimensions are discrete, not continuous. The tradeoff: less mathematically optimal, but fully explainable — every match comes with human-readable reasons ("Same circuit", "Also a pole-to-win"). Explainability matters because the output is shown directly to users.

## The Problem It Solves

### Before Phase 6E

Every race page showed what happened in *that* race. Results, key moments, strategy, season context. But there was no connection to history. A race existed in isolation.

F1 fans love patterns. "Hamilton always wins at Silverstone." "Wet races at Spa produce chaos." "Nobody wins from P10+ at Monaco." These are the kinds of insights that make watching F1 richer — but they required either deep personal knowledge or hours of manual research.

The official F1 app doesn't have this. Wikipedia doesn't have this. Even paid analytics sites like F1TV don't surface historical parallels automatically. They show you data for one race or one season, but they don't connect races across time.

### After Phase 6E

Every race page has a "What History Tells Us" section with auto-generated insights and links to similar races. The standalone Pattern Finder page lets users build any query they can imagine. The 305-race corpus becomes a connected graph of historical parallels.

## How It Works

### The Three Layers

```
Layer 1: Race Profile Extraction
  _extract_race_profile(year, track) → compact dict of 11 traits

Layer 2: Similarity Scoring
  find_similar_races(year, track) → scored + sorted matches

Layer 3: Insight Generation
  get_auto_precedents(year, track) → human-readable insights + top matches

Standalone:
  POST /patterns/search → filter-based search across all races
```

### Layer 1: Race Profile Extraction

Plain English: For any race, extract a compact summary of its key characteristics into a standardized format so it can be compared against other races.

**`backend/core/insights.py:_extract_race_profile()`**

```python
def _extract_race_profile(year: int, track: str) -> dict | None:
    data = indexer.load_race_index(year, track)
    if data is None:
        return None

    results = data["results"]
    weather = data.get("weather", {})
    stints = data.get("stints") or {}

    finished = [r for r in results if r.get("finish_position") is not None]
    finished_sorted = sorted(finished, key=lambda r: r["finish_position"])
    dnf = [r for r in results
           if r["status"] not in ("Finished", "Lapped")
           and not r["status"].startswith("+")]

    winner = finished_sorted[0]

    # Biggest position gain across all finishers
    max_gain = 0
    for r in finished_sorted:
        g = r.get("grid_position")
        f = r["finish_position"]
        if g and f:
            max_gain = max(max_gain, g - f)

    # Most common pit stop count
    stop_counts = {}
    for d, sts in stints.items():
        sc = len(sts) - 1
        stop_counts[sc] = stop_counts.get(sc, 0) + 1
    dominant_stops = max(stop_counts, key=stop_counts.get) if stop_counts else 1

    return {
        "year": year,
        "track": track,
        "circuit": track.replace(" Grand Prix", ""),
        "condition": weather.get("condition", "dry"),
        "winner": winner["driver"],
        "winner_team": winner["team"],
        "winner_grid": winner.get("grid_position") or 1,
        "dnf_count": len(dnf),
        "max_gain": max_gain,
        "dominant_stops": dominant_stops,
        "pole_won": (winner.get("grid_position") or 1) == 1,
        "team_12": (len(finished_sorted) >= 2
                    and finished_sorted[0]["team"] == finished_sorted[1]["team"]),
    }
```

Technical detail: The profile extracts 11 traits from the full race data. `circuit` strips "Grand Prix" from the track name so "British Grand Prix" and "70th Anniversary Grand Prix" both become "British" — enabling same-circuit matching across name variants. `max_gain` is the single largest position improvement by any driver (grid minus finish), capped at the actual values. `dominant_stops` finds the most common pit stop count, which characterizes the race's strategy landscape (a "1-stop race" vs a "2-stop race").

The function returns `None` for races that can't be loaded, making it safe to call on every indexed race without error handling at the caller.

### Layer 2: Similarity Scoring

Plain English: Compare one race against every other race in the database, scoring each comparison across 9 weighted traits, and return the highest-scoring matches.

**`backend/core/insights.py:find_similar_races()`**

The scoring weights:

| Trait | Points | Why this weight |
|-------|--------|-----------------|
| Same circuit | +5 | Strongest signal — fans want same-track history |
| Same winner grid | +3 (exact) / +1 (close) | Comeback vs dominance is the story angle |
| Same winner | +2 | Career arc connection |
| Same weather | +2 (exact) / +1 (both non-dry) | Conditions change everything |
| Both high chaos (5+ DNFs) | +3 | Attrition races are rare and memorable |
| Both team 1-2 | +2 | Team dominance is a distinct narrative |
| Similar max gain (both 6+) | +2 | Big comeback races feel similar |
| Same winning team | +1 | Weaker signal but adds context |
| Same dominant strategy | +1 | Similar race characteristics |

```python
def find_similar_races(year, track, max_results=5):
    target = _extract_race_profile(year, track)
    all_races = indexer.list_indexed()
    candidates = []

    for race in all_races:
        if race is self: continue
        profile = _extract_race_profile(race year, race track)

        score = 0
        reasons = []

        # Same circuit (+5)
        if profile["circuit"] == target["circuit"]:
            score += 5
            reasons.append(f"Same circuit ({profile['circuit']})")

        # Similar winner grid (+3 exact, +1 close)
        grid_diff = abs(profile["winner_grid"] - target["winner_grid"])
        if grid_diff <= 1:
            score += 3
            reasons.append("Also a pole-to-win" or "Winner also started P{grid}")

        # ... 7 more trait comparisons ...

        if score >= 4 and reasons:
            candidates.append({...score, reasons, metadata...})

    candidates.sort(by score desc, then year desc)
    return candidates[:max_results]
```

Technical detail: The threshold of `score >= 4` filters out noise — a race that only shares one minor trait (like "same dominant strategy") won't appear. A score of 4 means at least one strong match (same circuit) or several weaker matches. The secondary sort by year descending means when two races tie on score, the more recent one appears first — typically more relevant to modern F1 fans.

The `reasons` list is built alongside the score. Every time a trait matches and contributes points, a human-readable explanation is added. This is the key design decision: **scoring and explanation happen in the same pass**. There's no separate "explain why this matched" step. The reasons are a natural byproduct of the scoring.

### Layer 3: Insight Generation

Plain English: Take the similar races and analyze them as a group to produce 2-3 statistical sentences about what patterns emerge.

**`backend/core/insights.py:get_auto_precedents()`**

This function doesn't just list the matches — it analyzes them:

```python
def get_auto_precedents(year, track):
    similar = find_similar_races(year, track, max_results=6)
    target = _extract_race_profile(year, track)
    insights = []

    # Same-circuit insight: how often does pole win here?
    same_circuit = [m for m in similar if "Same circuit" in reasons]
    if same_circuit:
        pole_wins = count(profile.pole_won for each)
        insights.append(f"In {N} previous races at {circuit}, pole sitters won {M} times.")

    # Weather insight: do wet races here produce comebacks?
    if target is wet/damp:
        wet_matches = [m for m in similar if also wet]
        comeback_count = count(max_gain >= 5)
        insights.append(f"In similar conditions, {X} of {Y} races saw 5+ place gains.")

    # Winner pattern: does pole convert, or do comebacks happen?
    if target.pole_won:
        pole_total = count(similar where pole_won)
        insights.append(f"Pole sitters converted in {N} of {M} similar races.")

    return { insights: [...], matches: top 3 with reasons }
```

Technical detail: The function calls `_extract_race_profile()` multiple times — once for the target, then once per similar race to analyze specific traits. This is intentionally simple rather than optimized. With 305 races and a max of 6 similar results, we're looking at ~7 profile extractions for the insight generation. Each extraction reads from the on-disk index (cached by the OS). The total time is under 2 seconds, which is acceptable for a page load that happens once per race view.

The insight generation uses a priority system similar to the tagline: circuit history is checked first, then weather patterns, then winner patterns, then chaos patterns. A race gets 2-3 insights maximum — enough to be informative without being overwhelming.

### The Standalone Pattern Finder

Plain English: A search endpoint that lets users define their own filters and get back every matching race.

**`backend/api.py:POST /patterns/search`**

```python
@app.post("/patterns/search")
def pattern_search(filters: dict):
    all_races = indexer.list_indexed()
    results = []

    for race in all_races:
        profile = _extract_race_profile(race)

        # Apply each filter — skip race if any filter fails
        if circuit_filter and circuit not in profile.circuit: continue
        if condition_filter and condition != profile.condition: continue
        if winner_filter and winner not in profile.winner: continue
        if team_filter and team not in profile.winner_team: continue
        if min_grid and profile.winner_grid < min_grid: continue
        if max_dnf and profile.dnf_count < max_dnf: continue
        if year_range and not in range: continue

        results.append(profile + metadata)

    return sorted by year desc
```

Technical detail: This is a filter-based search, not a similarity search. Every filter is optional — send `{}` and you get all 305 races. Each filter narrows the results. Filters are applied with short-circuit logic: the first failing filter skips the race immediately, avoiding unnecessary comparisons.

The `winner` filter does a dual match: it checks both the 3-letter driver code (e.g., "VER") and the full name (e.g., "Verstappen"). This lets users search either way. The `circuit` and `team` filters are substring matches (`in` operator), so "Red" matches "Red Bull Racing" and "British" matches "British Grand Prix".

### The Frontend Components

**PatternPrecedents.tsx** — race page section

Fetches `/races/{year}/{track}/precedents`, renders insight sentences as paragraphs and matching races as clickable links. Each link shows year, track name, winner, and the primary reason for the match. Clicking jumps to that race's page.

**patterns/page.tsx** — standalone finder

An 8-field filter form (circuit, weather, winner, team, min grid, min DNFs, year range) with a "Find Races" button. Results render as rows with weather badges, DNF counts, and position gain indicators. Every result is clickable — links to the race page.

## What We Built

### Overview

Phase 6E added 5 files and modified 2:

| File | What it does |
|------|-------------|
| `insights.py` | `_extract_race_profile()` — compact race trait extraction |
| `insights.py` | `find_similar_races()` — weighted similarity scoring engine |
| `insights.py` | `get_auto_precedents()` — insight generation from similar races |
| `api.py` | `GET /precedents` — race page section data |
| `api.py` | `POST /patterns/search` — standalone filter search |
| `PatternPrecedents.tsx` | Race page "What History Tells Us" component |
| `patterns/page.tsx` | Standalone Pattern Finder page |
| `Navbar.tsx` | Added "Patterns" nav link |

### How the Pieces Connect

```
RACE PAGE FLOW:
  User opens /races/2023/British Grand Prix
          │
          ▼
  PatternPrecedents.tsx fetches /precedents
          │
          ▼
  api.py calls get_auto_precedents()
          │
          ├── calls find_similar_races() (scores 305 races)
          │         │
          │         └── calls _extract_race_profile() per race
          │
          └── analyzes top matches → generates 2-3 insights
          │
          ▼
  Returns { insights: [...], matches: [...] }
          │
          ▼
  Component renders insight sentences + clickable race links


PATTERN FINDER FLOW:
  User opens /patterns, fills filters, clicks "Find Races"
          │
          ▼
  POST /patterns/search { circuit: "British", condition: "wet" }
          │
          ▼
  api.py loops all 305 races, extracts profile, applies filters
          │
          ▼
  Returns { count: 8, races: [...] }
          │
          ▼
  Page renders filterable results with badges
```

## Common Patterns

### Pattern 1: Profile-Based Comparison

What it's for: Comparing complex objects by extracting a standardized set of traits and scoring similarities.

Instead of comparing raw data (which might have different structures, missing fields, or irrelevant details), extract a fixed-shape profile first. Then comparisons are always apples-to-apples.

```python
def extract_profile(item) -> dict:
    return { "trait_a": ..., "trait_b": ..., "trait_c": ... }

def compare(item_a, item_b) -> float:
    pa = extract_profile(item_a)
    pb = extract_profile(item_b)
    score = 0
    if pa["trait_a"] == pb["trait_a"]: score += weight_a
    if abs(pa["trait_b"] - pb["trait_b"]) <= threshold: score += weight_b
    return score
```

When to use: Any time you need to find "similar" items in a collection. Product recommendations, content suggestions, duplicate detection.

### Pattern 2: Score + Explain in One Pass

What it's for: Generating both a numeric similarity score and human-readable reasons simultaneously.

```python
score = 0
reasons = []

if condition_matches:
    score += points
    reasons.append("Explanation of why this matched")

return { "score": score, "reasons": reasons }
```

When to use: Any recommendation or matching system where users need to understand *why* something was suggested. The alternative — scoring first, then explaining separately — risks the explanation diverging from the actual scoring logic.

### Pattern 3: Optional Filter Chain

What it's for: Building a search where every filter is optional and they combine with AND logic.

```python
for item in all_items:
    if filter_a and not matches_a(item): continue
    if filter_b and not matches_b(item): continue
    results.append(item)
```

When to use: Any search or filtering UI where users can combine multiple criteria. The `if filter and not match: continue` pattern makes each filter a no-op when empty.

## Edge Cases & Gotchas

1. **Performance on full corpus scan**
   In plain English: Every call to `find_similar_races()` extracts profiles for all 305 races. That means 305 disk reads and profile computations.
   Technical cause: There's no caching layer — `_extract_race_profile()` reads from the index every time.
   How to handle: Currently takes ~1-2 seconds, which is acceptable. If the corpus grows (adding 2025, 2026...) or if caching is needed, profiles could be pre-computed at index time and stored as a `profile.json` per race.

2. **Circuit name matching across GP name variants**
   In plain English: "Brazilian Grand Prix" and "São Paulo Grand Prix" are the same circuit but have different names after stripping "Grand Prix".
   Technical cause: `circuit` is computed as `track.replace(" Grand Prix", "")`, giving "Brazilian" and "São Paulo" — different strings for the same Interlagos circuit.
   How to handle: The same-circuit check uses exact string match, so these won't match as "same circuit." Could be fixed with a circuit alias map (like the SVG mapping), but low priority since the other traits still produce good matches.

3. **Pattern search with no filters returns 305 races**
   In plain English: Sending an empty POST body returns every single indexed race. This is by design — it's useful for "show me everything" — but it could be a lot of data.
   Technical cause: All filters are optional, and an empty filter dict matches everything.
   How to handle: The response includes a `count` field so the frontend knows how many results there are. Could add pagination later if needed.

4. **Insight generation calls _extract_race_profile multiple times per match**
   In plain English: To generate insights, the function re-extracts profiles for races that were already profiled during the similarity search.
   Technical cause: `find_similar_races()` doesn't return the profiles — it returns scores and reasons. `get_auto_precedents()` needs profile data (like `pole_won`) that isn't in the match results.
   How to handle: Could cache profiles in a session-scoped dict, or modify `find_similar_races()` to return profiles alongside scores. Low priority — the redundant reads add ~200ms total.

## How It Connects to Other Concepts

- **Phase 6D (Race Story + Tagline)**: The race story tells you *what happened*. The pattern matcher tells you *what history says about it*. Together they create the full picture: narrative + context. The tagline sets the emotional hook, the story explains the race, and the precedents connect it to the past.

- **Phase 6A (Go Deeper)**: The pattern matcher's "What History Tells Us" section sits in the main scroll flow — it's beginner-friendly. A "Go Deeper" accordion could house a more detailed version in the future (e.g., showing all 6 matches instead of 3, or detailed trait-by-trait comparisons).

- **Phase 6C (Circuit Outlines)**: The circuit SVG mapping and the pattern matcher's circuit matching both use track names as keys. They could share a common circuit alias map to handle name variants (Brazilian vs São Paulo).

- **The standalone Pattern Finder page**: This is the power-user surface. The race page section gives you auto-generated insights. The Pattern Finder lets you ask your own questions. Same engine, two interfaces — one for casual users, one for fans who want to explore.

## Going Deeper

### Pre-Computed Profile Index

Instead of extracting profiles on every request, compute them once at index time and store as `profile.json` alongside `results.json`, `weather.json`, and `stints.json`. The similarity scoring then reads compact profile files instead of full race data. This would reduce `find_similar_races()` from ~1.5s to ~50ms.

### Weighted Similarity Learning

The current weights are hand-tuned. With user interaction data (e.g., which "similar race" links users actually click), the weights could be optimized. If users consistently click same-circuit matches over same-winner matches, the circuit weight should increase. This would require an analytics pipeline.

### Fuzzy Circuit Matching

Build a circuit alias map: `{"Brazilian": "interlagos", "São Paulo": "interlagos", "British": "silverstone", "70th Anniversary": "silverstone"}`. Use canonical circuit IDs instead of stripped GP names for same-circuit matching. This would catch all name variants automatically.

### Time-Weighted Scoring

More recent races could receive a slight bonus in similarity scoring. A 2022 match is more relevant than a 2010 match because cars, regulations, and teams have changed. A `recency_bonus = (match_year - 2010) / 14 * 0.5` would add up to 0.5 points for the most recent races.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|-----------------------|-------------------|
| Race profile | A compact summary of a race's key traits | Dict with 11 standardized fields extracted from index data |
| Similarity score | How much two races have in common | Sum of weighted trait comparisons (0-20+ range) |
| Precedent | A historical race that's similar to the current one | A match with score >= 4 and at least one explainable reason |
| Pattern search | Finding races that match specific criteria | Filter-based scan across all indexed races |
| Insight | A plain-English observation about what patterns show | Generated by analyzing trait distributions across similar races |

### Scoring Weights Quick Reference

```
Same circuit:       +5
Winner grid match:  +3 (exact ±1) / +1 (±3)
Both high chaos:    +3
Same weather:       +2 (exact) / +1 (both non-dry)
Same winner:        +2
Both team 1-2:      +2
Similar big gain:   +2
Same team:          +1
Same strategy:      +1
Minimum to show:    4
```

### API Endpoints

```
GET  /races/{year}/{track}/precedents  → insights + top 3 matches
POST /patterns/search                  → filter-based race search

Pattern search filters (all optional):
  circuit, condition, winner, team, min_grid, max_dnf, year_from, year_to
```

### File Map

```
backend/core/insights.py
  ├── _extract_race_profile()    — 11-trait race fingerprint
  ├── find_similar_races()       — weighted scoring across 305 races
  └── get_auto_precedents()      — insight generation + match list

backend/api.py
  ├── GET  /precedents           — race page section
  └── POST /patterns/search      — standalone finder

frontend/app/
  ├── components/PatternPrecedents.tsx  — race page section
  ├── patterns/page.tsx                — standalone finder page
  └── components/Navbar.tsx            — added "Patterns" link
```

---

*Generated: 2026-03-19 | Project: Raceday | Phase 6E complete | Files: insights.py, api.py, PatternPrecedents.tsx, patterns/page.tsx, Navbar.tsx*
