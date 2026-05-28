# RaceDay Companion Intelligence

> How RaceDay turned raw race data, replay timing, and team radio into a backend brain that can explain F1 moments in beginner-friendly language.

---

## In Plain English

RaceDay started as a race site and grew into something more useful: a companion that can sit next to a video or live race and explain what is happening without making the fan do the mental work first.

The important idea is that the extension does not try to become a full app on its own. It stays light. It reads the page, sends a small amount of context to the backend, and shows the note that comes back. The backend does the heavy lifting: it identifies the race, builds the moment timeline, checks live state, and now also listens to team radio/transcript context when it can.

That split matters because it keeps the browser piece simple and keeps the “brain” in one place. It also means RaceDay can improve over time without changing the overlay every time a new signal source is added.

## What This Is

RaceDay companion intelligence is the backend layer that turns race context into short notes.

It is not a full race simulator and it is not a chatbot. It is closer to a translator. The backend takes things like:

- the race title
- the current video time
- whether the session is live or replayed
- the current live state
- radio clips or transcripts when available
- the stored race story and strategy data

Then it converts that into one short headline and a few supporting lines that a casual fan can read quickly.

The same backend logic supports both replay and live viewing. That is the key design choice. Instead of building one system for YouTube and a separate one for live race weekends, RaceDay keeps a single note engine and feeds it different context.

## The Problem It Solves

Without this layer, the extension can still show something, but it is mostly guessing from broad race phases.

That creates a few problems:

- the note can arrive late
- the note can stay generic
- the note can miss a specific driver or strategy change
- the extension can look smart for one moment and vague for the next

Team radio helps fix that. So does a better replay timeline. So does using the live race state instead of only the current video progress. The backend layer exists to combine those signals before the note is shown.

## How It Works

At a high level, the flow is:

```text
video page / live session
        |
        v
extension reads title, time, and live snapshot
        |
        v
backend identifies race and current moment
        |
        v
backend adds replay timeline + live state + radio/transcript context
        |
        v
optional AI rewrites the note into simpler language
        |
        v
extension displays the same UI as before
```

### 1) Replay context

Plain English: the backend first figures out which race the user is looking at and where they are in the video.

The replay path starts with the page title, race name, year, current timestamp, duration, and chapter title if one exists. From that, the backend picks a timeline slot like opening laps, first pit choices, middle stint, late-race pressure, or final laps.

The important part is that the timeline is not just guessed from time. It is built from the stored race data when possible, so the note can reflect the actual race story.

### 2) Live context

Plain English: when the race is live, RaceDay stops behaving like a replay assistant and starts reading the live race state.

The live path uses things like lap number, driver gaps, tyre life, pit predictions, and alerts. That gives the backend a reason to say things like:

- a driver may stop soon
- the tyres are fading
- two cars are close enough for a position battle
- the first pit choice may decide track position

This is different from replay mode because the current live state is the truth source, not the video timestamp.

### 3) Radio and transcript context

Plain English: if RaceDay can hear a driver or read a transcript, it can use that to explain the moment more naturally.

The radio pipeline already existed in the backend. It downloads team radio clips, transcribes them, scores them, and caches the result. The companion layer now reads that data and turns it into a short note when a relevant race can be identified.

That matters because radio often reveals the “why” faster than raw telemetry does. A driver saying tyres are gone or box box gives the backend a strong signal that a strategy change is happening.

### 4) Optional AI rewrite

Plain English: after the backend has the note, an AI model can make the wording simpler and friendlier.

This part is optional. If OpenAI or Gemini is available, the note can be rewritten into cleaner beginner language. If the model is missing or fails, RaceDay falls back to the normal backend note.

That fallback is important. The system still works without AI keys.

## What We Built

The work was done in layers so the system could improve without breaking the overlay.

### Backend companion brain

Plain English: this is the module that knows how to turn race context into a short readable note.

The heart of the system lives in `backend/core/companion.py`. It contains the replay timeline builder, the live note builder, the chapter/timestamp matcher, and the new radio context merge.

The file now does three jobs:

1. identify the race and moment
2. merge in live or radio context
3. hand the final note to the optional AI refiner

### API routes

Plain English: these are the two doors the extension uses to ask the backend for a note.

`backend/api.py` exposes:

- `POST /companion/analyze-video`
- `POST /companion/note`

The extension already knows how to call those routes. No new UI buttons were added. The overlay stayed the same.

### Replay data helpers

Plain English: these helpers build a better race story before the note is written.

The replay timeline now pulls from the existing data model:

- race story narrative
- key moments
- strategy breakdown
- podium
- weather
- retirements
- first stops
- stop-count patterns

That makes the backend much less generic. A note can now come from the real race structure instead of only the video timestamp.

### Radio transcription pipeline

Plain English: this is the part that turns team radio clips into text and scores which ones matter most.

The radio pipeline is already split into three pieces:

- `backend/core/radio_transcriber.py` downloads and transcribes clips
- `backend/core/radio_sentiment.py` scores the clips
- `backend/core/insights.py` exposes `get_radio_moments(...)`

The companion layer does not replace that system. It reads from it and uses the best clip as extra context.

### AI rewrite layer

Plain English: this is the optional cleaner that rewrites the note if an AI key exists.

`backend/core/companion_ai.py` keeps provider logic out of the main companion module. That makes the backend safer and easier to reason about:

- no API keys in the browser
- no provider-specific code in the extension
- no need to change the overlay when the model changes

## Code Walkthrough

### `backend/core/companion.py`

Plain English: this file decides what RaceDay should say right now.

The main entry points are:

- `analyze_video_context(payload)`
- `build_companion_note(payload, analysis=None, live_state=None)`
- `build_live_note(live_state)`
- `build_replay_timeline(year, track, duration)`

`analyze_video_context(...)` does the first pass. It tries to recognize the race and build a timeline from the stored race data.

`build_companion_note(...)` uses that analysis to pick one moment and then enriches it with live or radio context if available.

`build_live_note(...)` works directly from the current live race state and now can also pull in radio context if the live session is identifiable.

### `backend/core/radio_transcriber.py`

Plain English: this file converts audio clips into text and caches the result so the same clip does not need to be processed over and over.

The main design choice here is fallback order:

1. Groq transcription if configured
2. OpenAI transcription if configured
3. local Whisper if available
4. no transcript if none of the above works

That order matters because it keeps the feature useful even when the strongest backend is not available.

### `backend/core/radio_sentiment.py`

Plain English: this file decides which radio clips are most worth showing.

It scores transcripts with keyword matching and also uses timing-based scoring, so even clips without perfect transcription can still surface if they happen near something important.

That is a good fit for RaceDay because the goal is not perfect natural-language understanding. The goal is to surface the clips that help explain the race.

### `backend/core/insights.py`

Plain English: this file already knew how to collect team radio moments, and the companion layer now borrows that work.

`get_radio_moments(...)` loads the cached data if it exists, otherwise it pulls clips, transcribes them, scores them, and stores the result.

That means the companion layer gets a ready-made “radio summary” instead of having to rebuild everything itself.

### `backend/api.py`

Plain English: this file exposes the backend to the extension and the browser app.

The companion routes sit next to the rest of the RaceDay API, which is useful because the extension and the site can both ask the same backend questions later.

That keeps the product consistent. The extension and the website are not two separate brains.

### `extension/public/background.js`

Plain English: this file is the messenger between the page and the backend.

It already knows how to ask for companion notes, cache them, and reuse them when the context has not changed.

That is why the UI did not need to change. The note text improved, but the same overlay stayed in place.

### `extension/public/content.js`

Plain English: this file decides what note to show on the page.

It still prefers local detection and then asks the backend for a better note when needed. The new part is that it now accepts backend radio context without adding a new visible control.

### `extension/public/manifest.json`

Plain English: this file just keeps the extension version aligned with the code it ships.

During the work, the manifest version was bumped as the extension package changed. That matters for reloading and distribution, even though it does not change the note logic itself.

## Common Patterns

### Pattern 1: Local first, backend second

What it is for: keeping the extension fast even when the backend is slow.

The browser side can make a reasonable guess on its own. The backend then improves that guess when it has enough context.

```text
local page read -> backend enrichment -> final note
```

This pattern keeps the product usable when the network is weak or the backend is still waking up.

### Pattern 2: Fallback instead of failure

What it is for: making sure one missing input does not kill the whole experience.

If the transcript is missing, the backend still has timing. If AI is unavailable, the backend still has the base note. If the radio cache is empty, RaceDay still has the replay timeline.

That is the right shape for a fan product. Fans should see something useful, not a blank panel.

### Pattern 3: Beginner language first

What it is for: making the note readable in one glance.

The system tries to avoid raw terms unless they help explain the moment. The most useful note is the one that makes a new fan understand why the moment matters.

### Pattern 4: Merge context instead of replacing it

What it is for: keeping the race story intact while adding one more signal.

Radio context does not replace the replay or live note. It nudges it. That is why the base note still exists and the radio detail is merged into it.

## Edge Cases & Gotchas

### Missing transcript data

In plain English: sometimes the radio clip exists, but the transcript does not.

Technical cause: the clip may not transcribe cleanly, the backend may not have a key, or the clip may have no useful speech.

How to avoid: keep the timing-based scoring and do not depend on transcript text being present.

### Radio data only exists for some races

In plain English: not every race has usable radio moments to learn from.

Technical cause: the data source is limited and the radio pipeline only makes sense for certain seasons.

How to avoid: treat radio as enrichment, not as a required input.

### Backend dependencies can be missing in a local shell

In plain English: the code can be fine, but the current machine may not have every library installed.

Technical cause: the RaceDay backend imports modules like `dotenv` and `fastf1` through the full package tree.

How to avoid: validate syntax directly when runtime imports are not available, and keep the companion module tolerant of missing upstream data.

### AI should never be the only path

In plain English: the note still needs to work when AI is offline.

Technical cause: API keys can expire, rate limits can hit, and providers can fail.

How to avoid: keep the base backend note as the default and treat AI as a rewrite layer only.

### Notes can become too generic if merged badly

In plain English: if the system picks the wrong context, the note can sound correct but not helpful.

Technical cause: a generic headline can crowd out a more useful transcript line.

How to avoid: prioritize the most relevant context and keep the final note short.

## How It Connects to Other Concepts

- **Replay timeline**: gives the companion a race-aware map instead of a random guess.
- **Live state**: keeps the note tied to what is happening right now.
- **Team radio**: adds a human clue that often explains the strategy faster than numbers do.
- **AI refiner**: improves wording without owning the whole feature.
- **Extension overlay**: remains the display surface, not the brain.

The big picture is that the backend is now a layered interpreter for the race, not just a data fetcher.

## Going Deeper

### Why the split matters

Plain English: the browser is the place to show the note, but the server is the place to think.

This split keeps the extension light and keeps secret keys out of the browser. It also makes it easier to improve the backend later without shipping a new UI just to change wording.

### Why transcripts are valuable

Plain English: radio clips often explain the race faster than the timing chart does.

If a driver says the tyres are dead, the note can explain why a pit stop is coming instead of just saying “pit window.”

### Why fallback logic is not optional

Plain English: good race software has to keep talking even when one signal disappears.

Fans do not care whether the backend got a perfect signal. They care whether the note still makes sense.

## Quick Reference

### Key Terms

| Term | Plain English meaning | Technical meaning |
|------|-----------------------|-------------------|
| Replay timeline | The race story laid out over time | A list of moment slots matched to timestamp or chapter |
| Live state | What is happening right now | The current race snapshot from OpenF1/live data |
| Radio context | What the driver or team is saying | Transcribed and scored team radio clips |
| Backend brain | The part that decides what to say | Companion note generation and optional AI rewrite |
| Fallback | The backup path when something is missing | Local note or base note without AI or transcript support |

### Essential Flow

```text
page/video/live session
  -> detect race
  -> build race moment
  -> fetch radio/live context
  -> merge the notes
  -> optionally rewrite with AI
  -> show the same overlay
```

### Practical Rule Set

- Keep the overlay unchanged.
- Improve the note text behind the scenes.
- Prefer beginner language.
- Use radio as enrichment, not dependency.
- Fail soft, not hard.

---

*Generated: 2026-05-28 | Project: RaceDay | Files: backend/core/companion.py, backend/core/companion_ai.py, backend/core/radio_transcriber.py, backend/core/radio_sentiment.py, backend/core/insights.py, backend/api.py, extension/public/background.js, extension/public/content.js, extension/public/manifest.json*

## Updates

- 2026-05-28 — Added transcript and chapter context support so the companion can use on-screen captions as an extra clue, not just the chapter title or live state.
- 2026-05-28 — Added a media-signal layer that turns strong caption or transcript text into a clearer race clue before the note is shown.
- 2026-05-28 — Added caption-number detail parsing so lap numbers and position cues inside transcript text can sharpen the race moment.
- 2026-05-28 — Updated note selection so race-specific backend notes win before the fixed phase fallback, which stops the companion from repeating the same generic answers across different races.
- 2026-05-28 — Removed the visible replay phase label from the overlay headline so the backend story note can lead instead of `race start` / `first pit choices` text.
