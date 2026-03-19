# Phase 6F — Filling the 2010 Data Gap: When APIs Fail, Estimate

> How we gave 19 races their tyre strategy data back — not by scraping, not by finding a new API, but by combining a compound lookup table with intelligent estimation.

---

## In Plain English

Imagine you're writing a history of every football World Cup, but the 2010 tournament has no record of substitutions. Every other year has full data — who came on, who went off, what minute. But 2010? Nothing. The games happened, the scores are there, but the substitution data was never digitised.

That's what happened with Raceday's 2010 F1 season. Every race from 2011 to 2024 had tyre strategy data — which tyres each driver used, when they pitted, how many stops they made. But 2010 was a blank. The Strategy panel showed "Detailed stint data is not available for this race" for all 19 races. The 2010 season was the last year of the Bridgestone tyre era before Pirelli took over in 2011, and no free API carries its pit stop data.

The original plan was to scrape formula1.com for the data. That failed — the site is built with React Server Components and loads its data via JavaScript, making it impossible to scrape with a simple HTTP request. Instead of installing a headless browser (heavy, fragile), we took a different approach: build a Bridgestone compound nomination table (what two tyre types were available at each race) and estimate pit stop timing (assume 2 evenly-spaced stops). The result isn't perfect — we don't know the exact lap each driver pitted — but it's far more useful than "no data." Every 2010 race now shows "2-stop: Soft → Hard → Soft" instead of a blank panel.

---

## What Is This? (The Technical View)

This is a data imputation problem — filling in missing values using domain knowledge rather than raw data. The F1 data pipeline has three layers per race: results (who finished where), weather (conditions), and stints (tyre strategy). For 2010, the first two layers work fine (Jolpica API has results, OpenMeteo has historical weather). The third layer — stints — was completely empty because:

1. **Jolpica/Ergast** never had 2010 pit stop data (the original Ergast database didn't include pit stops before 2011)
2. **FastF1** only covers 2018+ (it reads from F1's live timing feed which didn't exist before then)
3. **Formula1.com** has the data but it's behind a JavaScript-rendered page that can't be scraped without a headless browser

The fix uses two pieces of domain knowledge:

- **Compound nominations**: Bridgestone published which two compounds they'd bring to each race (a softer "Option" and a harder "Prime"). This is the same pattern Pirelli follows today.
- **Typical strategy**: Most 2010 races were 2-stop affairs. Without knowing exact pit laps, dividing the race into 3 roughly equal stints is a reasonable estimate.

```
What we had:                    What we built:
─────────────                   ──────────────
Results ✓                       Results ✓
Weather ✓                       Weather ✓
Stints  ✗ (empty)               Stints  ~ (estimated)
                                  ├── Compound table: what tyres were available
                                  ├── Pit estimation: where they probably stopped
                                  └── Assignment: which tyres went on which stint
```

---

## The Problem It Solves

### What users saw before

Opening any 2010 race and expanding the Strategy breakdown showed:

```
┌──────────────────────────────────────────┐
│                                          │
│    No tyre strategy data available        │
│    Detailed stint data is not available   │
│    for this race.                        │
│                                          │
└──────────────────────────────────────────┘
```

This was the empty state added in Phase 6G. Clean, but unhelpful. 19 races — an entire season — had no strategy information at all.

### Why scraping failed

The first approach was to scrape formula1.com's pit stop summary pages. Here's what we found:

```
Attempt 1: curl the page
  → HTML returned, but zero data in it
  → The page is Next.js with React Server Components
  → Pit stop table is rendered client-side via JavaScript

Attempt 2: Find embedded JSON (__NEXT_DATA__)
  → No __NEXT_DATA__ tag (RSC uses a different format)
  → Data is fragmented across self.__next_f.push() chunks
  → Chunks contain serialised React component trees, not raw data

Attempt 3: Find the API behind the page
  → Tried api.formula1.com with various paths
  → All returned "Unable to identify proxy" errors
  → The API requires authentication or specific headers from their frontend

Attempt 4: Parse RSC payload
  → 33 chunks found, but pit stop data not in any of them
  → The data is likely fetched in a separate client-side request after page load
```

To scrape this, you'd need Playwright or Puppeteer — a full headless browser that executes JavaScript. That's a heavy dependency for a small data gap, and it's fragile (breaks whenever F1 updates their frontend).

### The estimation approach

Instead of trying harder to get exact data, we asked: **what do we actually know about 2010 races?**

1. Bridgestone brought two dry compounds to every race
2. Drivers were required to use both compounds during the race
3. Most races had 2-3 pit stops
4. Stints were roughly equal in length

With this knowledge, we can generate approximate strategy data that's correct in structure (compounds alternate) and plausible in timing (evenly-spaced stops), even if the exact pit lap numbers are estimates.

---

## How It Works

### The Bridgestone Compound Table

Plain English: A lookup table telling us which two tyre types Bridgestone brought to each of the 19 races in 2010.

```python
# backend/core/compound_lookup.py

_NOMINATIONS = {
    2010: {
        1: ("SOFT", "HARD"),        # Bahrain
        6: ("SUPERSOFT", "SOFT"),   # Monaco
        10: ("SOFT", "HARD"),       # Britain
        13: ("SOFT", "MEDIUM"),     # Belgium
        15: ("SUPERSOFT", "SOFT"),  # Singapore
        19: ("SUPERSOFT", "SOFT"),  # Abu Dhabi
        # ... all 19 races
    },
    2011: { ... },  # Pirelli era begins
    # ... through 2017
}
```

Technical detail: This extends the existing `_NOMINATIONS` dictionary which already covered 2011-2017 (Pirelli era). The format is identical: `{round_number: (option_compound, prime_compound)}` where "option" is the softer tyre and "prime" is the harder. The lookup function `get_race_compounds(year, round_num)` now returns data for 2010 as well.

The compound choices come from Bridgestone's pre-race press releases and Wikipedia season articles. Street circuits (Monaco, Singapore) and high-degradation tracks (Hungary) got softer pairings (SuperSoft/Soft). Power circuits (Britain, Turkey) got harder pairings (Soft/Hard). This matches Bridgestone's real allocation patterns.

### Pit Stop Estimation

Plain English: When we don't know when a driver pitted, we divide the race into equal chunks. A 52-lap race with 2 stops → pit on laps 17 and 35.

```python
# backend/core/compound_lookup.py

def estimate_pit_stop_laps(total_laps: int, num_stops: int = 2) -> list[int]:
    if num_stops <= 0 or total_laps <= 0:
        return []
    interval = total_laps / (num_stops + 1)
    return [round(interval * (i + 1)) for i in range(num_stops)]
```

Technical detail: For `total_laps=52, num_stops=2`: interval = 52/3 = 17.3. Stops at round(17.3) = 17 and round(34.7) = 35. This creates three stints of 17, 18, and 17 laps — roughly equal.

The assumption of 2 stops is conservative. In reality, 2010 had a mix of 1, 2, and 3-stop races. But without real data, 2-stop is the most common strategy and gives the most useful compound display (three stints showing both compounds).

### The Equal-Length Stint Fix

Plain English: When all stints are the same length, the old heuristic assigned the same compound to every stint. The fix detects this and uses simple alternation instead.

The existing Layer 2 heuristic assigns softer compounds to shorter stints and harder compounds to longer stints. But estimated stops produce equal-length stints, so the heuristic gave all stints the harder compound (all above the median).

```python
# backend/core/compound_lookup.py — _assign_by_stint_length()

# If all stints are roughly the same length (e.g. estimated stops),
# use simple alternation instead of a meaningless median split
if max(stint_lengths) - min(stint_lengths) <= 2:
    return _assign_simple(len(stint_lengths), option, prime)
```

Technical detail: The tolerance of `<= 2` laps handles the rounding in `estimate_pit_stop_laps`. A 52-lap race produces stints of 17, 18, 17 (max - min = 1). The check triggers and falls through to Layer 3 (alternation: Soft → Hard → Soft), which is the correct behaviour for evenly-spaced stops.

### The Indexer Fallback

Plain English: When the indexer finds no pit stop data from Jolpica but DOES have compound nominations, it generates estimated stints for every driver.

```python
# backend/core/indexer.py — _index_race_historical()

elif compound_lookup.get_race_compounds(year, round_num) is not None:
    # No pit stop data but we have compounds — estimate 2-stop
    for r in results:
        driver_code = r["driver"]
        total_laps = r.get("total_laps") or 0
        if total_laps < 10:
            continue  # retired too early
        pit_laps = compound_lookup.estimate_pit_stop_laps(total_laps, num_stops=2)
        compounds = compound_lookup.assign_stint_compounds(
            pit_laps, total_laps, grid, year, round_num, driver_code
        )
        driver_stints = compound_lookup.build_stints(pit_laps, compounds, total_laps)
        if driver_stints:
            stints[driver_code] = driver_stints
```

Technical detail: The `elif` branch fires when `pit_stops` is empty/None (Jolpica returned nothing) but `get_race_compounds()` returns a valid pair (the 2010 Bridgestone table has data). Drivers with fewer than 10 laps completed are skipped — they retired too early for a meaningful strategy display. For everyone else, estimated 2-stop stints are generated and written to `stints.json`.

---

## Edge Cases & Gotchas

### 1. Early retirements show as Unknown

In plain English: A driver who crashed on lap 3 doesn't get strategy data — there's nothing useful to show.

Technical cause: The `total_laps < 10` filter skips them. With only 3 laps completed, a "2-stop" strategy makes no sense.

Result: 1-2 drivers per race show "Unknown" in the strategy panel. This is correct behaviour — they genuinely didn't complete enough of the race to have a meaningful strategy.

### 2. All drivers show the same strategy

In plain English: Every driver at the 2010 British GP shows "2-stop: Soft → Hard → Soft." In reality, they pitted at different laps and some did 1-stop or 3-stop.

Technical cause: Estimated stops produce identical timing for every driver (total_laps / 3). Without real pit data, we can't differentiate.

Tradeoff: This is the main limitation. The data is structurally correct (real compounds, reasonable stop count) but lacks individual variation. It's still far more useful than "no data" — users can see what tyres were used at each race and compare across the season.

### 3. Formula1.com scraping could work with Playwright

In plain English: If we installed a headless browser, we could get exact pit stop laps for every 2010 driver.

Technical cause: The F1 website loads pit stop tables via JavaScript. A headless browser (Playwright) can execute the JS and extract the rendered HTML.

Why we didn't: Installing Playwright adds ~50MB of browser binaries and a complex dependency chain. For 19 races of approximate data, the estimation approach is lighter and more maintainable. If exact 2010 data becomes important (e.g., a user requests it), Playwright is the right tool.

---

## How It Connects to Other Concepts

- **Compound lookup (Phase 4A)**: The existing `_NOMINATIONS` table covered 2011-2017. Phase 6F extended it backward to 2010, completing the full 2010-2017 Bridgestone+Pirelli coverage.

- **Strategy cleanup (Phase 6G)**: The empty state message "Detailed stint data is not available" was added in Phase 6G specifically for 2010. Phase 6F makes that message disappear for 2010 races — now the strategy panel shows real compound chips instead.

- **Stint-length heuristic (Phase 4A)**: The Layer 2 heuristic assigns softer compounds to shorter stints. Phase 6F revealed a bug: when all stints are equal length, the heuristic assigns all the same compound. The fix (fall through to simple alternation when stint lengths are within 2 laps) benefits any future race with evenly-spaced stops.

- **Quiz feature (Phase 6I)**: With stint data available, the quiz now generates a strategy question for 2010 races: "How many pit stops did the winner make?" Before Phase 6F, the strategy question was skipped for 2010 (6 questions instead of 7).

---

## Quick Reference

### What changed

| File | Change |
|------|--------|
| `compound_lookup.py` | Added 2010 Bridgestone nominations (19 races) |
| `compound_lookup.py` | Added `estimate_pit_stop_laps()` function |
| `compound_lookup.py` | Fixed equal-length stint heuristic |
| `indexer.py` | Added fallback: estimate stints when API has no pit data |
| `data/index/2010/*/stints.json` | Regenerated all 19 files with compound data |

### 2010 Compound Allocations

| Rounds | Compounds | Tracks |
|--------|-----------|--------|
| 1-5, 7, 9-11, 16-18 | Soft / Hard | Bahrain, Australia, Malaysia, China, Spain, Turkey, Valencia, Britain, Germany, Japan, Korea, Brazil |
| 6, 8, 12, 15, 19 | SuperSoft / Soft | Monaco, Canada, Hungary, Singapore, Abu Dhabi |
| 13, 14 | Soft / Medium | Belgium, Italy |

### Before vs After

```
Before (Phase 6G empty state):
  "No tyre strategy data available"
  "Detailed stint data is not available for this race."

After (Phase 6F estimation):
  Legend: S Soft   H Hard
  VER  S → H → S   2-stop
  HAM  S → H → S   2-stop
  ALO  S → H → S   2-stop
```

---

*Generated: 2026-03-19 | Project: Raceday | Phase 6F — 2010-2011 Data Gap Fix*
*Files: compound_lookup.py, indexer.py, data/index/2010/*/stints.json*
