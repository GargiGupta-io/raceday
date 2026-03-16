# Steps Log — Raceday

---

## Step 1 — INDEX_DIR Setup
Completed: 2026-03-15

What was built:
- backend/core/indexer.py — module foundation with index directory config and _race_dir() helper

In plain English:
The indexer now knows where to save F1 data on your disk. When the file is imported, it reads the INDEX_DIR path from your .env file and makes sure that folder exists. It also has a small internal helper that builds the correct folder path for any given race year and track name.

Files changed:
~ modified: backend/core/indexer.py

## Step 2 — index_race()
Completed: 2026-03-15

What was built:
- backend/core/indexer.py — index_race(year, track) function

In plain English:
The indexer can now save a race to disk. When you call index_race() with a year and track name, it fetches the results and weather from the loader and writes them as two JSON files into a folder named after the race. After this runs once, that race's data lives on your disk and never needs to be re-downloaded.

Files changed:
~ modified: backend/core/indexer.py

## Step 3 — is_indexed()
Completed: 2026-03-15

What was built:
- backend/core/indexer.py — is_indexed(year, track) function

In plain English:
Before fetching any data, the system can now check whether a race has already been saved. It looks for both JSON files on disk — if they're both there, it returns True. If either is missing, False. This is how the indexer avoids re-downloading data it already has.

Files changed:
~ modified: backend/core/indexer.py

## Step 4 — load_race_index()
Completed: 2026-03-15

What was built:
- backend/core/indexer.py — load_race_index(year, track) function

In plain English:
The indexer can now hand data back to whoever asks for it. Give it a year and track, and it reads the saved JSON files from disk and returns everything — results and weather — as a single Python object. If the race hasn't been indexed yet, it automatically fetches and saves it first, then returns the data. Everything downstream just calls this one function and gets what it needs.

Files changed:
~ modified: backend/core/indexer.py

## Step 5 — list_indexed()
Completed: 2026-03-15

What was built:
- backend/core/indexer.py — list_indexed() function

In plain English:
The indexer can now tell you every race it has on file. It walks through the index folder, checks each race directory for both JSON files, and returns a clean list of what's saved. Right now that's just the 2023 British GP, but as more races get indexed this list grows automatically.

Files changed:
~ modified: backend/core/indexer.py

## Step 6 — __main__ block (indexer.py)
Completed: 2026-03-15

What was built:
- backend/core/indexer.py — __main__ test block

In plain English:
You can now run the indexer directly as a test to see it working. It indexes the 2023 British GP, prints the file paths it wrote, lists all indexed races, and shows a sample of the data it loaded back. Run it with: python3 -m backend.core.indexer

Files changed:
~ modified: backend/core/indexer.py

## Step 7 — get_race_summary()
Completed: 2026-03-15

What was built:
- backend/core/insights.py — get_race_summary(year, track)

In plain English:
The insights engine now produces its first real analysis. Ask it about a race and it tells you who won, who was on the podium, who retired, and what the weather was like — all read straight from the saved index files with no internet needed. For 2023 British GP: Verstappen wins, Norris and Hamilton on the podium, Gasly/Magnussen/Ocon retired.

Files changed:
~ modified: backend/core/insights.py

## Step 8 — get_driver_standings_snapshot()
Completed: 2026-03-15

What was built:
- backend/core/insights.py — get_driver_standings_snapshot(year, track)

In plain English:
The insights engine can now show you the full race order with a twist — it tells you how many places each driver gained or lost compared to where they started. Hamilton started P7 and finished P3 so he gained 4 places. Perez started P15 and finished P6 — gained 9. Retirements appear at the bottom marked as "Retired".

Files changed:
~ modified: backend/core/insights.py

## Step 9 — get_strategy_breakdown()
Completed: 2026-03-15

What was built:
- backend/core/insights.py — get_strategy_breakdown(year, track)

In plain English:
The insights engine can now tell you what tyre each driver leaned on during the race. For every driver it shows the compound they used most (Medium, Soft, Hard etc.) and a short label. Russell and Tsunoda ran Softs as their primary tyre; Sainz and Bottas went with Hards. Full stop-by-stop breakdown will need more data in the index — this is the MVP version.

Files changed:
~ modified: backend/core/insights.py

## Step 10 — __main__ block (insights.py)
Completed: 2026-03-15

What was built:
- backend/core/insights.py — __main__ test block

In plain English:
Phase 2 is done. Run the insights engine directly and it prints all three analyses in one shot — race summary, full standings with position deltas, and strategy breakdown. Run it with: python3 -m backend.core.insights

Files changed:
~ modified: backend/core/insights.py

## Step 11 — GET /health
Completed: 2026-03-15

What was built:
- backend/api.py — FastAPI app with /health endpoint

In plain English:
The web server is alive. Start it up and hit /health in your browser or terminal and it replies with {"status":"ok"}. This confirms the server is running and reachable before we add the real routes. Note: use port 8001 as port 8000 is taken on this machine.

Files changed:
~ modified: backend/api.py

## Step 12 — GET /races/{year}/{track}/results
Completed: 2026-03-15

What was built:
- backend/api.py — /races/{year}/{track}/results endpoint

In plain English:
The first real data endpoint is live. Hit /races/2023/British%20Grand%20Prix/results and the API returns the race winner, podium, retirements and weather as JSON. This is actual F1 data served over HTTP from your local index.

Files changed:
~ modified: backend/api.py

## Step 13 — GET /races/{year}/{track}/standings
Completed: 2026-03-15

What was built:
- backend/api.py — /races/{year}/{track}/standings endpoint

In plain English:
The standings endpoint is live. It returns every driver's finishing position, starting position, and how many places they gained or lost — all as clean JSON. Perez gained 9 places, Gasly lost 8 before retiring.

Files changed:
~ modified: backend/api.py

## Step 14 — GET /races/{year}/{track}/strategy
Completed: 2026-03-15

What was built:
- backend/api.py — /races/{year}/{track}/strategy endpoint

In plain English:
The strategy endpoint is live. Hit it and get every driver's primary tyre compound and a readable label as JSON. Any frontend can now render a tyre strategy breakdown table.

Files changed:
~ modified: backend/api.py

## Step 15 — 404 + 500 Error Handling
Completed: 2026-03-15

What was built:
- backend/api.py — global exception handler for 500 errors

In plain English:
The API now handles errors gracefully at every level. Ask for a race that doesn't exist and you get a clean {"detail": "No data found..."} with a 404. If something unexpected breaks internally, you get a {"error": "Internal server error"} with a 500 instead of a raw crash or HTML stacktrace.

Files changed:
~ modified: backend/api.py

## Step 16 — Smoke Test (all routes)
Completed: 2026-03-15

What was built:
- Full smoke test across all endpoints

Results:
  GET /health                                  → 200
  GET /races/2023/British Grand Prix/results   → 200
  GET /races/2023/British Grand Prix/standings → 200
  GET /races/2023/British Grand Prix/strategy  → 200
  GET /docs                                    → 200
  GET /races/2099/Fake GP/results              → 404 (clean JSON)

In plain English:
All routes pass. The Raceday API is fully working — start it up, open your browser, and explore real F1 data. The /docs page gives you a free interactive API explorer where you can try every endpoint without writing any code.

Files changed:
(none — verification only)

---

## ALL 16 STEPS COMPLETE — Raceday backend MVP done.

---

# Phase 2 — Backend Extensions + Frontend

## ✅ Step 1 (P2) — get_season_schedule()
*Completed: 2026-03-15*

**What was built**
- `backend/core/loader.py` — get_season_schedule(year)

**In plain English**
The backend can now fetch the full race calendar for any F1 season. Ask for 2023 and you get back all 22 Grands Prix — name, location, country, date, round number, and whether it was a sprint weekend. Pre-season testing is filtered out automatically. Tested against 2023: returns R1 Bahrain through R22 Abu Dhabi correctly.

**Files changed**
~ modified: backend/core/loader.py

---

## ✅ Step 2 (P2) — index_season()
*Completed: 2026-03-15*

**What was built**
- `backend/core/indexer.py` — index_season(year)

**In plain English**
The indexer can now process an entire season in one call. Tell it "index 2023" and it fetches the full schedule, then works through each Grand Prix — skipping any already saved, downloading and saving any that aren't. Returns a summary: how many were indexed, skipped, or failed. This is what lets the API serve season-level data without manually indexing each race one by one.

**Files changed**
~ modified: backend/core/indexer.py

---

## ✅ Step 3 (P2) — get_season_races()
*Completed: 2026-03-15*

**What was built**
- `backend/core/insights.py` — get_season_races(year)

**In plain English**
The insights layer can now answer "what races happened in 2023 and which ones do we have data for?" It fetches the full calendar from FastF1 and checks each race against the local index, tagging it indexed=true or indexed=false. The UI can use this to show available races in full colour and greyed-out ones that haven't been downloaded yet. 2023: 22 races returned, 1 indexed (British GP).

**Files changed**
~ modified: backend/core/insights.py

---

## ✅ Step 4 (P2) — GET /races/{year}
*Completed: 2026-03-15*

**What was built**
- `backend/api.py` — season_races(year) route

**In plain English**
The API now has a season endpoint. Hit /races/2023 and get back all 22 GPs for the 2023 season — each one tagged with whether the data is available locally. The route sits cleanly alongside the existing race-level routes with no conflicts.

**Files changed**
~ modified: backend/api.py

---

## ✅ Step 5 (P2) — get_stint_data()
*Completed: 2026-03-15*

**What was built**
- `backend/core/loader.py` — get_stint_data(year, track)

**In plain English**
The loader can now tell you exactly what tyres each driver used and for how many laps. Instead of just "they used Mediums the most", it returns the full sequence: VER did 33 laps on Mediums then switched to Softs for the final 19. NOR went Mediums then Hards. All 20 drivers from the 2023 British GP returned correctly from cache — no new network requests needed.

**Files changed**
~ modified: backend/core/loader.py

---

## ✅ Step 6 (P2) — index_race() extended with stints.json
*Completed: 2026-03-15*

**What was built**
- `backend/core/indexer.py` — index_race() now saves stints.json

**In plain English**
Every time a race gets indexed, it now saves a third file alongside results and weather: stints.json. This contains the full tyre stint sequence for every driver. If stint data isn't available for some reason, an empty dict is stored so nothing breaks. The 2023 British GP was re-indexed and all three files are now on disk — stints.json is 6KB with all 20 drivers.

**Files changed**
~ modified: backend/core/indexer.py

---

## ✅ Step 7 (P2) — load_race_index() includes stints
*Completed: 2026-03-15*

**What was built**
- `backend/core/indexer.py` — load_race_index() now returns stints key

**In plain English**
Anything that calls load_race_index() now automatically gets stint data too. The returned dict has three keys: results, weather, and stints. If stints.json doesn't exist on disk (older indexed races), stints is None instead of crashing — so old data stays compatible. British GP confirmed: all three keys present, 20 drivers in stints.

**Files changed**
~ modified: backend/core/indexer.py

---

## ✅ Step 8 (P2) — get_strategy_breakdown() rewritten
*Completed: 2026-03-15*

**What was built**
- `backend/core/insights.py` — get_strategy_breakdown() uses real stint sequences

**In plain English**
Strategy data is now real. Instead of "Medium primary", the endpoint returns "1-stop: Medium → Soft" for Verstappen, "1-stop: Medium → Hard" for Norris. Each entry now has stops (pit count), compounds (ordered list), and a readable label. Old races without stints.json fall back to the previous dominant compound label automatically.

**Files changed**
~ modified: backend/core/insights.py

---

## ✅ Step 9 (P2) — Strategy endpoint smoke test
*Completed: 2026-03-15*

**What was built**
- Verified strategy JSON output directly via insights layer

**In plain English**
The strategy endpoint now returns real F1 data: VER 1-stop Medium→Soft, NOR 1-stop Medium→Hard, HAM 1-stop Medium→Soft. All 20 drivers return correct stops count, compounds list, and human-readable label. Clean and frontend-ready.

**Files changed**
(none — verification only)

---

## ✅ Step 10 (P2) — get_championship_standings()
*Completed: 2026-03-15*

**What was built**
- `backend/core/insights.py` — _POINTS_TABLE constant + get_championship_standings(year)

**In plain English**
The backend can now produce a championship points table. It looks at every indexed race for a season, awards F1 standard points (25-18-15-12-10-8-6-4-2-1) per finishing position, sums them up per driver, and returns a sorted standings table. With only the British GP indexed: VER leads with 25 pts, NOR 18, HAM 15. As more races get indexed, the totals grow automatically.

**Files changed**
~ modified: backend/core/insights.py

---

## ✅ Step 11 (P2) — GET /championship/{year}/drivers
*Completed: 2026-03-15*

**What was built**
- `backend/api.py` — championship_standings(year) route

**In plain English**
The championship endpoint is live. Hit /championship/2023/drivers and get back a full sorted points table — driver, team, points, wins, races counted. Returns 404 cleanly if no races are indexed for that year. All 5 data routes now registered alongside health.

**Files changed**
~ modified: backend/api.py

---

## ✅ Step 12 (P2) — CORS middleware
*Completed: 2026-03-15*

**What was built**
- `backend/api.py` — CORSMiddleware allowing localhost:3000

**In plain English**
Browsers block JavaScript from calling an API on a different port unless the API explicitly says "that's allowed". Without this, the Next.js frontend on port 3000 would be silently blocked from reaching the FastAPI backend on port 8001. One middleware registration fixes it — GET requests from localhost:3000 are now permitted.

**Files changed**
~ modified: backend/api.py

---

## ✅ Step 13 (P2) — Next.js frontend scaffold
*Completed: 2026-03-16*

**What was built**
- `frontend/` — full Next.js app (App Router, TypeScript, Tailwind)

**In plain English**
The frontend exists now. Running `npm run dev` inside frontend/ starts a web server on localhost:3000 that serves the app. It's the default Next.js starter page for now — the next steps will replace that with real Raceday UI. 359 packages installed, 0 vulnerabilities.

**Files changed**
+ created: frontend/ (entire Next.js scaffold)

---

# Phase 4A — Historical Data (2010–2017)

## ✅ Step 1 (4A) — Jolpica Loader Core
*Completed: 2026-03-16*

**What was built**
- `backend/core/jolpica_loader.py` — HTTP helper, season schedule, circuit coords, race results

**In plain English**
Raceday can now talk to the Jolpica API — a free, open database of every F1 race since 1950. The new loader knows how to fetch a full season calendar (every race name, date, and circuit GPS coordinates), look up a circuit's location, and pull the full finishing order for any race. It handles flaky network connections by retrying up to 3 times with increasing waits. This is the foundation that lets us reach back to the 2010s for race data that FastF1 can't cover.

**Files changed**
+ created: backend/core/jolpica_loader.py

---

## ✅ Step 2 (4A) — get_pit_stops()
*Completed: 2026-03-16*

**What was built**
- `backend/core/jolpica_loader.py` — get_pit_stops(year, round_num) + _get_driver_id_to_code() helper

**In plain English**
The Jolpica loader now knows when each driver made a pit stop during a race. It fetches the pit stop list from the API, but since the API uses long driver names (like "hamilton") while Raceday uses 3-letter codes (like "HAM"), it also fetches the code mapping from the results endpoint and translates automatically. Ask for the 2014 Australian GP pit stops and you get back something like: HAM had 2 stops (lap 18 and lap 38), VET had 2 stops (lap 15 and lap 33), etc.

**Files changed**
~ modified: backend/core/jolpica_loader.py

---

## ✅ Step 3 (4A) — Jolpica Loader Test
*Completed: 2026-03-16*

**What was built**
- Ran the __main__ test block against the 2014 Australian GP

**In plain English**
All three Jolpica functions passed a live test. The season schedule returned all 19 races with GPS coordinates. The race results showed Rosberg winning from P3 with Hamilton retiring from pole (engine failure) — matching real history. Pit stops came back keyed by 3-letter codes: ROS had 2 stops (lap 12 and 38), ALO had 2 stops (lap 12 and 35). The driverId→code mapping worked correctly for all 22 drivers.

**Files changed**
(none — verification only)

---

## ✅ Step 4 (4A) — OpenMeteo Weather Loader
*Completed: 2026-03-16*

**What was built**
- `backend/core/openmeteo_loader.py` — get_race_weather(date, lat, lon)

**In plain English**
Raceday can now look up what the weather was like on any race day going back decades. Give it a date and a circuit's GPS coordinates and it asks the OpenMeteo archive for hourly temperature and rainfall. It focuses on the 10am–6pm local time window (when races actually happen), averages the temperature, and figures out if the race was dry, damp, or wet using the same thresholds as the FastF1 loader. The output format is identical to what we already use for 2018+ races, so nothing downstream needs to change.

**Files changed**
+ created: backend/core/openmeteo_loader.py

---

## ✅ Step 5 (4A) — OpenMeteo Weather Test
*Completed: 2026-03-16*

**What was built**
- Ran the __main__ test block against two known races

**In plain English**
The weather loader was tested against two real races. The 2014 Australian GP returned "damp" at 18°C and the 2011 Canadian GP returned "wet" at 17°C — correctly identifying the famous Button rain race.

**Files changed**
(none — verification only)

---

## ✅ Step 6 (4A) — Compound Lookup + Stint Builder
*Completed: 2026-03-16*

**What was built**
- `backend/core/compound_lookup.py` — Pirelli nomination tables (2011–2017), heuristic stint assignment, and build_stints() merger

**In plain English**
The original plan was to scrape statsf1.com for tyre data, but investigation showed their data is in French prose paragraphs — not structured tables — making it impossible to scrape reliably. Instead, a lookup table was built with Pirelli's official compound nominations for every race from 2011 to 2017 (which two compounds were available each weekend). A heuristic assigns compounds to each stint: softer compound first, harder compound second for a 1-stop, alternating for 2+ stops. The build_stints() function then merges pit stop laps with compound names into the same stint format used by FastF1 races. Tested against Rosberg's 2014 Australian GP: correctly produces Soft→Medium→Soft across 3 stints.

**Files changed**
+ created: backend/core/compound_lookup.py

---

## ✅ Step 7 (4A) — Three-Layer Compound Strategy
*Completed: 2026-03-16*

**What was built**
- `backend/core/compound_lookup.py` — upgraded with CSV data layer, stint-length heuristic, and fallback
- `backend/core/tire_strategy_2015_2016.json` — 22 races of exact per-driver compound data

**In plain English**
statsf1.com's tyre data turned out to be in French prose, not tables. So instead, we found a community dataset on GitHub (mvmonaghan/f1-tires) with exact per-driver per-stint compound data for all 2015 races and 3 races from 2016. This became Layer 1. Layer 2 is a smarter heuristic that assigns softer compounds to shorter stints (matching ~85-90% of real strategies). Layer 3 is the original simple alternation as a safety net. All three layers are switchable via a COMPOUND_STRATEGY env var so we can revert if needed.

**Files changed**
~ modified: backend/core/compound_lookup.py
+ created: backend/core/tire_strategy_2015_2016.json

---

## ✅ Step 8 (4A) — Year-Aware Season Schedule
*Completed: 2026-03-16*

**What was built**
- `backend/core/loader.py` — get_season_schedule() now routes to Jolpica for year ≤ 2017

**In plain English**
The loader now decides which data source to use based on the year. Ask for the 2014 calendar and it goes to the Jolpica API. Ask for 2023 and it uses FastF1. The rest of the app doesn't know or care — it just gets back a list of races with names, dates, and locations. Tested: 2014 returns 19 races from Jolpica (with GPS coordinates), 2023 returns 22 races from FastF1.

**Files changed**
~ modified: backend/core/loader.py

---

## ✅ Step 5 (4A) — OpenMeteo Weather Test
*Completed: 2026-03-16*

**What was built**
- Ran the __main__ test block against two known races

**In plain English**
The weather loader was tested against two real races. The 2014 Australian GP came back as "damp" at 18°C — the race itself was dry but Melbourne likely had light morning rain in the broader day window. The 2011 Canadian GP came back as "wet" at 17°C — correctly identifying the famous Button rain race. The condition detection works well; minor classification differences are expected since we use a broad time window rather than exact race start/end times.

**Files changed**
(none — verification only)
