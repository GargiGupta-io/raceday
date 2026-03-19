# Phase 6H — Team Radio: From Raw Audio to Emotional Highlights

> A four-stage pipeline that fetches 100+ team radio clips from every modern F1 race, figures out which ones are the most emotionally charged, and lets fans listen to them directly on the race page.

---

## In Plain English

During an F1 race, drivers and their engineers talk constantly over the radio. Most of these messages are mundane — "tyres are fine", "stay on plan A" — but some are electric. Leclerc screaming "WHY DID WE PIT NOW?!" or Verstappen yelling "YES! GET IN!" after a win. These are the human moments that make racing emotional. But no race analysis site surfaces them. You'd have to watch a full race replay or hope someone clipped it on social media.

Phase 6H solves this by building a pipeline that works like a talent scout for radio clips. It downloads every radio message from a race (typically 50-120 clips), tries to figure out what each driver said (transcription), scores each clip for emotional intensity (is this a celebration? frustration? strategy call?), picks the 5 best ones, and presents them on the race page with a play button. The entire process runs once per race and the results are cached forever.

The clever part: even without transcription (which requires an API key), the system still works. It uses timing instead — clips that happen right after a key overtake, during the final laps, or from drivers involved in the biggest moments of the race are more likely to be interesting. When transcription IS available, keyword scoring dramatically improves accuracy. It's designed to degrade gracefully, never break completely.

---

## What Is This? (The Technical View)

This is a multi-stage data pipeline that crosses three different domains: API integration (fetching data from OpenF1), audio processing (downloading and transcribing MP3s), and natural language processing (sentiment scoring). The architecture looks like this:

```
OpenF1 API                           F1 CDN
    │                                   │
    ▼                                   ▼
┌──────────────┐               ┌───────────────┐
│ openf1_radio │──audio URLs──▶│  transcriber   │
│  .py         │               │    .py         │
│              │               │                │
│ Session key  │               │ Download MP3   │
│ Driver info  │               │ Try Groq/      │
│ Radio clips  │               │   OpenAI/local │
└──────┬───────┘               └───────┬────────┘
       │                               │
       │    clips + transcripts        │
       ▼                               ▼
    ┌──────────────────────────────────────┐
    │         radio_sentiment.py           │
    │                                      │
    │  Keyword score + Timing score        │
    │  → Combined ranking                  │
    │  → Deduplicate (max 2/driver)        │
    │  → Top 5 selection                   │
    └──────────────────┬───────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  insights.py    │
              │  get_radio_     │
              │  moments()      │
              │                 │
              │  Cache to disk  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐       ┌──────────────────┐
              │  api.py         │──────▶│ RadioMoments.tsx  │
              │  /radio         │       │ Audio player +    │
              │  endpoint       │       │ sentiment icons   │
              └─────────────────┘       └──────────────────┘
```

Four Python modules and one React component, each with a single responsibility. The pipeline runs lazily — the first time someone visits a 2023+ race page, it triggers the full pipeline. After that, cached JSON is served instantly.

---

## The Problem It Solves

### Before Phase 6H

The race page showed data: who won, what strategy they used, key overtakes. All of it was numbers and text. There was no human voice, no emotion, no "being there" feeling. Every F1 site has results tables. No fan site lets you hear the raw emotion of a driver in the moment.

### The challenge

Team radio audio exists on Formula 1's servers (the CDN at `livetiming.formula1.com`), and the OpenF1 project catalogues every clip. But getting from "here are 118 MP3 URLs" to "here are the 5 most interesting clips with context" requires solving several problems:

1. **Name mapping** — Raceday calls it "British Grand Prix", OpenF1 calls it "United Kingdom / Silverstone / session_key 9126". How do you match them?
2. **Driver resolution** — OpenF1 clips are tagged with `driver_number: 44`, not "Lewis Hamilton". You need a lookup.
3. **CDN access** — Formula 1's CDN returns 403 Forbidden unless you send browser-like headers.
4. **Transcription** — Whisper requires PyTorch + ffmpeg, which are heavy. What if they're not installed?
5. **Selection** — 118 clips is too many. How do you pick the best 5 without listening to all of them?

---

## How It Works

### Stage 1: Fetching Clips (openf1_radio.py)

Plain English: This module talks to the OpenF1 API to find out what radio clips exist for a race, who said them, and where the audio files are stored.

The OpenF1 API is free and unauthenticated. It has three key endpoints:

- `/sessions` — find the session_key for "2023 British Grand Prix Race"
- `/drivers` — map driver number 44 to "Lewis Hamilton / HAM / Mercedes"
- `/team_radio` — get every radio clip for that session

The tricky part is **name mapping**. Raceday stores races as "British Grand Prix" but OpenF1 uses country names ("United Kingdom") and locations ("Silverstone"). A static lookup table handles the common cases:

```python
# backend/core/openf1_radio.py:59-96

_GP_TO_LOCATION = {
    "bahrain": "Sakhir",
    "british": "Silverstone",
    "abu dhabi": "Yas Island",
    "dutch": "Zandvoort",
    # ... 30+ mappings covering all F1 circuits
}
```

Technical detail: The mapping strips " Grand Prix" from the track name, lowercases it, and looks it up. If the lookup fails, a fuzzy fallback tries substring matching on country_name, location, and circuit_short_name. This handles unexpected aliases without a complete enumeration.

**Lap estimation** is approximate. The API provides timestamps but not lap numbers. Since the average F1 lap takes about 90 seconds, elapsed time since race start divided by 90 gives a rough lap number:

```python
# backend/core/openf1_radio.py:256-265

if race_start and clip_date:
    clip_time = datetime.fromisoformat(clip_date)
    elapsed = (clip_time - race_start).total_seconds()
    if elapsed > 0:
        lap = max(1, int(elapsed / 90) + 1)
```

Technical detail: This is deliberately rough. Monaco laps take ~75 seconds, Spa laps take ~105 seconds. The estimate could be off by 5-10 laps. But it's good enough for "early race" vs "mid-race" vs "final laps" classification, which is what the sentiment tagger needs.

**Caching** happens at two levels: session lists are cached in memory (same year won't be re-fetched), and driver data is cached per session_key.

---

### Stage 2: Downloading & Transcribing (radio_transcriber.py)

Plain English: This module downloads the actual audio files and tries to convert speech to text. It has three ways to do this, tries them in order, and works fine even if none are available.

#### The CDN access problem

The MP3 files live on `livetiming.formula1.com`. A normal Python `requests.get()` with a custom User-Agent gets a 403 Forbidden. The fix: send headers that look like a web browser:

```python
# backend/core/radio_transcriber.py:59-65

resp = requests.get(url, timeout=15, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.formula1.com/",
})
```

Technical detail: The CDN checks User-Agent and Referer headers. The Raceday API module (`openf1_radio.py`) uses a custom User-Agent "Raceday/1.0" which the CDN blocks. The transcriber uses browser-like headers because it's downloading static content, not hitting an API.

#### Content-addressed caching

Each clip gets a stable ID from its URL using MD5 hashing. The downloaded MP3 is saved as `{hash}.mp3` and the transcription as `{hash}.json`. If the file already exists, it's skipped:

```python
# backend/core/radio_transcriber.py:42-44

def _clip_id(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]
```

Technical detail: MD5 isn't used for security here — just as a stable, short filename generator. The first 12 hex characters give 48 bits of entropy, plenty to avoid collisions across ~100 clips per race. The JSON cache stores the transcript text, the URL it came from, and which backend was used. Even `None` transcripts are cached so the system doesn't re-attempt failed transcriptions.

#### The three-backend fallback

The transcription pipeline tries backends in priority order:

```
1. Groq API    → Free tier, Whisper v3, needs GROQ_API_KEY in .env
2. OpenAI API  → Paid, Whisper v1, needs OPENAI_API_KEY in .env
3. Local       → Needs openai-whisper + PyTorch + ffmpeg installed
4. (none)      → Clips returned with transcript: null
```

Each backend is a simple function that takes an audio file path and returns a string or None:

```python
# backend/core/radio_transcriber.py:80-100

def _transcribe_groq(audio_path: Path) -> str | None:
    if not _GROQ_KEY:
        return None
    with open(audio_path, "rb") as f:
        resp = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {_GROQ_KEY}"},
            files={"file": (audio_path.name, f, "audio/mpeg")},
            data={"model": "whisper-large-v3", "language": "en"},
            timeout=30,
        )
    if resp.status_code == 200:
        return resp.json().get("text", "").strip()
    return None
```

Technical detail: Both Groq and OpenAI use the same OpenAI-compatible API format (`/v1/audio/transcriptions` with multipart file upload). The local backend uses `openai-whisper`'s Python API directly. The `language="en"` parameter tells Whisper not to waste time on language detection — F1 radio is always in English.

The key design decision: **the pipeline never fails if transcription isn't available.** It logs a warning and moves on. The frontend shows "Transcripts unavailable — listen to the audio clips directly." The feature is useful with or without text.

---

### Stage 3: Sentiment Scoring (radio_sentiment.py)

Plain English: This module figures out which clips are emotionally interesting. It reads the words (if available) and also checks when the clip happened relative to exciting moments in the race.

#### Keyword scoring

The scorer has four pattern groups, each containing regex patterns with a score boost:

```
Positive     "yes!", "amazing", "well done", "P1"         → celebration
Negative     "ridiculous", "tyres gone", "crash"          → frustration
Strategic    "box box", "safety car", "plan B"            → strategy
Intensity    ALL CAPS, repeated letters, exclamations     → amplifier
```

Each matched pattern adds to a running score. The pattern groups compete — if negative keywords outscore positive ones, the clip is labelled "frustration". If strategic keywords dominate, it's "strategy".

```python
# backend/core/radio_sentiment.py:68-127

def _score_transcript(text: str) -> tuple[float, str, list[str]]:
    text_lower = text.lower()
    total_score = 0.0
    sentiments = {"positive": 0, "negative": 0, "strategic": 0, "neutral": 0}

    for pattern, score, label in _POSITIVE_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        if matches:
            total_score += score * len(matches)
            sentiments["positive"] += score * len(matches)
    # ... same for negative, intensity, strategic

    # Bonus for longer messages (emotional drivers talk more)
    if len(text.split()) > 15:
        total_score += 2
```

Technical detail: The intensity patterns run WITHOUT `re.IGNORECASE` — this is deliberate. The `[A-Z]{3,}` pattern detects shouting (all-caps words). With case-insensitive matching, it would match every 3+ letter word. This was a real bug found during testing: "Okay." was being tagged as "shouting" before the fix.

#### Timing-based scoring

Even without transcripts, clips can be scored by when they happened:

```python
# backend/core/radio_sentiment.py:135-157

def _score_timing(clip: dict, key_moments: list[dict] | None) -> float:
    score = 0.0
    clip_lap = clip.get("lap")

    if key_moments:
        for moment in key_moments:
            if clip.get("driver_code") == moment.get("driver"):
                score += 4  # Driver involved in a key moment

    if clip_lap <= 3:
        score += 3    # Race start chaos
    elif clip_lap >= 45:
        score += 2    # Final laps tension

    return score
```

Plain English: If Perez gained 9 places (a key moment) and there's a Perez radio clip, it's probably interesting. If it's from the opening laps (chaos) or final laps (tension), it's more likely to contain emotion.

#### Driver deduplication

Without deduplication, the top 5 could all be from one talkative driver. The selector limits each driver to 2 clips maximum:

```python
# backend/core/radio_sentiment.py:210-222

driver_count: dict[str, int] = {}
for clip in scored:
    code = clip.get("driver_code", "???")
    if driver_count.get(code, 0) >= 2:
        continue
    selected.append(clip)
    driver_count[code] = driver_count.get(code, 0) + 1
    if len(selected) >= top_n:
        break
```

Technical detail: The clips are already sorted by score descending. The deduplication walks through in order, skipping any driver who already has 2 clips. This means a driver with the highest-scored clip will always appear, but can't monopolise all 5 slots.

---

### Stage 4: Orchestration & Caching (insights.py → get_radio_moments)

Plain English: One function ties everything together — fetch, transcribe, score, select, cache. After running once, subsequent requests are instant.

```python
# backend/core/insights.py:1908-2000

def get_radio_moments(year: int, track: str, top_n: int = 5) -> dict | None:
    if year < 2023:
        return {"available": False, ...}

    # Check disk cache first
    cache_path = indexer._race_dir(year, track) / "radio_moments.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(...))

    # Full pipeline
    clips = openf1_radio.get_team_radio(year, track)      # Stage 1
    clips = radio_transcriber.transcribe_clips(clips)       # Stage 2
    moments = get_key_moments(year, track)
    top_clips = radio_sentiment.score_clips(clips, moments) # Stage 3

    # Cache to disk
    cache_path.write_text(json.dumps(result, ...), ...)
    return result
```

Technical detail: The imports for `openf1_radio`, `radio_transcriber`, and `radio_sentiment` happen inside the function (lazy imports), not at module level. This avoids circular import issues and means the radio modules are only loaded when actually needed — the 95% of requests for pre-2023 races never touch them.

The cache lives alongside the race's other data files (`results.json`, `weather.json`, `stints.json`) as `radio_moments.json`. This means clearing a race's cache (`rm -rf data/index/2023/British Grand Prix/`) removes radio data too — consistent with how all other data is managed.

---

### Stage 5: Frontend (RadioMoments.tsx)

Plain English: A React component that fetches the radio data and shows each clip as a card with a play button, the driver's name in their team colour, and the lap it happened on.

The component has two sub-components:

**AudioPlayer** — a minimal HTML5 audio player with a circular play/pause button and a thin progress bar. Uses `preload="none"` so browsers don't start downloading all 5 MP3s when the page loads.

```tsx
// frontend/app/components/RadioMoments.tsx:37-97

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Toggle play/pause
  const toggle = () => {
    const audio = audioRef.current;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
    setPlaying(!playing);
  };

  // Track progress via timeupdate event
  // Reset on ended
  return (
    <div className="flex items-center gap-2 mt-2">
      <button onClick={toggle} ...>▶ / ⏸</button>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-700">
        <div style={{ width: `${progress}%` }} />
      </div>
      <audio ref={audioRef} src={url} preload="none" />
    </div>
  );
}
```

Technical detail: The `audio.play().catch(() => {})` swallows the autoplay error that browsers throw if the user hasn't interacted with the page yet. The progress bar updates via the `timeupdate` event which fires ~4 times per second during playback. The `ended` event resets both state and progress bar to zero.

**RadioMoments** — the main component. Fetches from `/radio`, shows loading skeleton, renders nothing for pre-2023 races.

```tsx
// Key rendering logic

if (!data || !data.available || data.clips.length === 0) return null;

// Each clip card:
<span style={{ backgroundColor: `#${clip.team_colour}` }} />  // Team colour dot
<span>{clip.driver_name}</span>                                // Full name
<span>Lap {clip.lap}</span>                                    // Lap number
{clip.transcript && <p>"{clip.transcript}"</p>}               // Quote (if available)
<AudioPlayer url={clip.recording_url} />                       // Play button
```

Technical detail: Team colours come as hex strings from the OpenF1 API (e.g., "3671C6" for Red Bull). They're applied as inline styles rather than Tailwind classes because the values are dynamic and unknown at build time. The sentiment icon uses Unicode emoji characters mapped in `SENTIMENT_STYLE`.

---

## Edge Cases & Gotchas

### 1. F1 CDN returns 403 Forbidden

In plain English: Formula 1's servers refuse to send audio files to anything that doesn't look like a web browser.

Technical cause: The CDN checks the `User-Agent` header. Python's `requests` library sends "python-requests/2.x" by default, and our API module sends "Raceday/1.0". Both get blocked.

How to avoid: The transcriber's download function sends browser-like headers with a Chrome User-Agent and `formula1.com` as the Referer. The frontend audio player doesn't have this problem because it IS a browser.

### 2. Lap estimates are rough

In plain English: A clip tagged "Lap 49" might actually be from lap 45 or 53. The estimation uses a fixed 90-second lap time.

Technical cause: Different circuits have different lap times (Monaco ~72s, Spa ~105s). The estimate is `elapsed_seconds / 90`.

How to avoid: The lap number is used for display and for timing-based scoring (which uses broad ranges like "laps 1-3" and "laps 45+"), so ±5 laps doesn't affect results significantly. For exact lap numbers, you'd need to cross-reference with lap timing data from FastF1 or OpenF1's `/laps` endpoint.

### 3. Case sensitivity in shouting detection

In plain English: The pattern that detects "SHOUTING" (all-caps words) must NOT use case-insensitive matching, or it tags every normal word.

Technical cause: `\b[A-Z]{3,}\b` with `re.IGNORECASE` matches "Okay" as well as "OKAY". The intensity patterns deliberately skip the flag.

How to avoid: The fix is already in place. The key learning: when mixing case-sensitive and case-insensitive patterns in the same function, you can't use a single flag for all groups.

### 4. Two HAM clips at the same lap

In plain English: Sometimes two clips from the same driver appear at nearly the same timestamp, showing as the same lap number.

Technical cause: Radio messages can come seconds apart but the 90-second lap estimate rounds them to the same lap. These are genuinely different clips (different audio content).

How to avoid: The deduplication limits to 2 per driver but doesn't deduplicate by lap. A future improvement could check if two clips from the same driver are within 10 seconds of each other and only keep the higher-scored one.

### 5. Empty results for some races

In plain English: A few 2023+ races might return no radio clips even though they should have them.

Technical cause: OpenF1 depends on the F1 live timing feed. If that feed had issues during a race, clips may be missing. The CDN could also remove old files.

How to avoid: The pipeline caches "no clips found" as well, with a clean message: "No team radio recordings found for this race."

---

## How It Connects to Other Concepts

- **Key Moments (Phase 5C)**: The timing-based scorer uses `get_key_moments()` to find which drivers were involved in interesting events. Radio clips from those drivers score higher. The two features are symbiotic — moments provide context for radio selection.

- **Pattern Matcher (Phase 6E)**: Both features extract meaning from raw data without ML. Patterns use statistical comparisons across races; radio sentiment uses keyword matching within text. Both could benefit from actual ML in the future.

- **Strategy Narrative (Phase 5B)**: The strategy story describes WHAT happened. Radio clips show HOW drivers FELT about it. Together they give both the tactical and emotional view of the same race.

- **Indexer caching pattern**: Radio moments cache to `radio_moments.json` in the same race directory as `results.json`, `weather.json`, and `stints.json`. Same pattern, same lifecycle — delete the directory and everything re-generates.

- **Go Deeper accordion (Phase 6A)**: Radio sits in the main flow (visible by default), not in Go Deeper. This is deliberate — hearing a driver's voice is beginner-friendly and emotionally engaging, exactly what the story-first redesign aims for.

---

## Going Deeper

### Adding Groq transcription
Set `GROQ_API_KEY` in your `.env` file. Groq offers free Whisper transcription at ~50 requests/minute. With transcription enabled, keyword scoring kicks in and the top 5 selection improves dramatically — celebrations get tagged green, frustrations get tagged red.

### Improving lap estimation
Replace the fixed 90-second estimate with actual lap times from OpenF1's `/laps` endpoint. For each clip timestamp, binary search through lap start times to find the exact lap number.

### Speaker identification
Currently every clip is "driver radio." Some clips are the engineer talking TO the driver ("Okay Lewis, plan B, box this lap"). OpenF1 doesn't distinguish speaker, but transcription + keyword patterns could: engineer messages tend to be calmer, use strategy terms, and start with the driver's name.

### Audio waveform visualization
Replace the simple progress bar with a waveform preview (using Web Audio API's `AnalyserNode`). This would let users see intensity spikes before playing — shouting shows as tall peaks.

---

## Quick Reference

### Key Files

| File | Role |
|------|------|
| `backend/core/openf1_radio.py` | Fetch clips + driver info from OpenF1 API |
| `backend/core/radio_transcriber.py` | Download MP3s, transcribe via Groq/OpenAI/local |
| `backend/core/radio_sentiment.py` | Score clips by keywords + timing proximity |
| `backend/core/insights.py` | `get_radio_moments()` — orchestrator + disk cache |
| `backend/api.py` | `GET /races/{year}/{track}/radio` endpoint |
| `frontend/app/components/RadioMoments.tsx` | Audio player cards with sentiment icons |

### Data Flow

```
OpenF1 /sessions → session_key
OpenF1 /drivers → driver lookup
OpenF1 /team_radio → clip list (118 clips)
    ↓
Download MP3s → _radio_cache/{hash}.mp3
Transcribe → _radio_cache/{hash}.json
    ↓
Score (keywords + timing) → ranked list
Select top 5 (max 2 per driver)
    ↓
Cache → data/index/{year}/{track}/radio_moments.json
    ↓
API → /races/{year}/{track}/radio
    ↓
Frontend → RadioMoments.tsx with AudioPlayer
```

### Enabling Transcription

```bash
# In raceday/.env, add one of:
GROQ_API_KEY=gsk_your_key_here     # Free, recommended
OPENAI_API_KEY=sk-your_key_here    # Paid
# Or install local: pip install openai-whisper
```

### Key Terms

| Term | Plain English | Technical |
|------|--------------|-----------|
| OpenF1 | Free database of live F1 data | REST API at api.openf1.org |
| session_key | A number identifying one race session | Integer used as foreign key across OpenF1 endpoints |
| Sentiment score | How emotionally intense a clip is | Float from keyword matching + timing proximity |
| Graceful degradation | Works well → works okay → still works | Feature delivers value at every backend availability level |
| Content-addressed cache | Same input = same filename | MD5 hash of URL → stable filename for MP3 + JSON |

---

*Generated: 2026-03-19 | Project: Raceday | Phase 6H — Radio Sentiment + Audio Playback*
*Files: openf1_radio.py, radio_transcriber.py, radio_sentiment.py, insights.py, api.py, RadioMoments.tsx*
