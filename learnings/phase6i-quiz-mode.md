# Phase 6I — Test Your Knowledge: Auto-Generated Race Quizzes

> Turn structured race data into interactive multiple-choice quizzes that test what fans learned from the race story — no manual question writing, no database, no login.

---

## In Plain English

After reading about a race — who won, what the strategy was, which driver climbed through the field — how do you know if you actually absorbed any of it? Phase 6I adds a quiz to every race page. "Who won the 2023 British Grand Prix?" "How many drivers retired?" "What grid position did the winner start from?" Seven questions, four options each, all generated automatically from the same data that powers the rest of the page.

It works like a flashcard quiz at the end of a textbook chapter. You read the story, you see the key moments, you hear the radio — then you test yourself. Pick your answers, hit reveal, and see green highlights for correct answers and red for wrong ones. "5 out of 7 — Great job, you know your F1!" Hit "Try again" if you want another go. No account needed, no data saved, no leaderboard. It's pure self-testing.

The clever part is that the wrong answers aren't random. They're real drivers from the same race, real grid positions, real stop counts. "Who gained the most places?" with options like Alonso, Hamilton, Perez, and Tsunoda — all of whom were in the actual race. This makes the quiz feel genuine, not like a placeholder.

---

## What Is This? (The Technical View)

This is a data-to-quiz generator. The backend reads from the same indexed race data (results, weather, stints) that every other Raceday feature uses, and produces a structured quiz payload — an array of questions, each with exactly four options and one correct answer index. The frontend consumes this as a stateless interactive component.

The architecture deliberately avoided Supabase. The original Phase 6 plan called for a `predictions` table with user accounts and a leaderboard. But auth was removed in Phase 6A (Discussion was cut), and the Supabase connection was causing "Failed to fetch" errors. The simpler approach — generate questions server-side, score client-side, persist nothing — fits the "story-first" vision better. The quiz is about learning, not competing.

```
Backend                              Frontend
───────                              ────────
generate_race_quiz()                 PredictionQuiz.tsx
    │                                    │
    ├── Read results.json                ├── Collapsed: "Take the quiz"
    ├── Read weather.json                │
    ├── Read stints.json                 ├── Expanded: 5-7 question cards
    │                                    │   ├── Category icon
    ├── Generate Q: winner               │   ├── Question text
    ├── Generate Q: podium               │   ├── 4 clickable options
    ├── Generate Q: grid                 │   └── Selected state
    ├── Generate Q: weather              │
    ├── Generate Q: retirements          ├── Submit: "Reveal answers"
    ├── Generate Q: strategy (if data)   │   ├── Green = correct
    ├── Generate Q: biggest mover        │   ├── Red = wrong
    │                                    │   └── Score + feedback
    └── Return {questions: [...]}        │
                                         └── "Try again" → reset
```

---

## The Problem It Solves

### Why quizzes matter for a learning platform

Raceday's vision is "story first" — beginners read about a race and learn. But reading isn't learning. Research on education consistently shows that **active recall** (testing yourself) produces stronger memory than passive reading. A user who reads "Verstappen won from pole" and then answers "Who won?" correctly will remember it far longer than one who just scrolled past the text.

### Why not use an existing quiz service?

External quiz tools (Typeform, Google Forms) require manual question creation for each of 300+ races. They break the flow — users leave the page. And they need accounts. The entire point is that the quiz is seamless, automatic, and embedded in the race experience.

### Why not use Supabase for persistence?

The original plan had:
1. `predictions` table in Supabase
2. User accounts for tracking scores
3. A leaderboard

This was cut because:
- Auth was removed in Phase 6A (Discussion panel cut)
- The Supabase client was throwing "Failed to fetch" TypeErrors
- A leaderboard needs a user base that doesn't exist yet
- Self-testing works without any persistence

If Raceday grows and users want competitive quizzing, a leaderboard can be added later without changing the quiz generator or frontend component — just add a POST endpoint that saves `{user_id, race, score}`.

---

## How It Works

### Question Generation

Plain English: The generator reads the same race files that power the rest of the page and creates questions by extracting facts and building plausible wrong answers from real data.

Each question type follows the same pattern:
1. Extract the correct answer from race data
2. Build 3 wrong answers from the same data pool
3. Shuffle all 4 options so the correct answer isn't always first
4. Tag with a category for the frontend icon

#### Question Types

**1. "Who won?"** (category: result)

Correct answer: the race winner from `results.json`. Wrong answers: 3 randomly sampled finishers from the same race.

```python
wrong = _random.sample(
    [d for d in all_drivers if d != winner["driver"]],
    min(3, len(all_drivers) - 1)
)
options = [_DRIVER_NAMES.get(winner["driver"], winner["driver"])] + \
          [_DRIVER_NAMES.get(d, d) for d in wrong]
_random.shuffle(options)
```

Technical detail: `_random.sample()` picks without replacement, so the same wrong answer can't appear twice. `_DRIVER_NAMES` converts codes like "VER" to full names like "Max Verstappen" — quiz options always show full names, not codes.

**2. "Who was NOT on the podium?"** (category: result)

This is an inverse question — the correct answer is the driver who WASN'T on the podium. Three real podium finishers are the wrong answers. This is harder than "who was on the podium" because you need to know all three podium drivers to eliminate them.

```python
intruder = _random.choice(non_podium)
opts = [_DRIVER_NAMES.get(intruder, intruder)]
podium_sample = _random.sample(list(podium_set), min(3, len(podium_set)))
opts += [_DRIVER_NAMES.get(d, d) for d in podium_sample]
```

**3. "What grid position did the winner start from?"** (category: grid)

Wrong answers are plausible grid positions (P1, P2, P3, P5, P7, P10) with the real one removed. This means if the winner started P1, the options might be P1, P3, P7, P10.

**4. "What were the weather conditions?"** (category: weather)

Options are always: Dry, Damp, Wet, Mixed conditions. One of the first three is correct based on `weather.json`.

**5. "How many drivers retired?"** (category: drama)

Wrong answers are plausible DNF counts (0, 1, 2, 3, 5, 7, 8, 10) with the real count removed. This tests whether the user noticed how chaotic the race was.

**6. "How many pit stops did the winner make?"** (category: strategy)

Options: 0-stop, 1-stop, 2-stop, 3-stop. Only generated if stint data exists (skipped for 2010 races where stints are unavailable). This is why the 2010 British GP generates 6 questions while the 2023 British GP generates 7.

**7. "Who gained the most positions?"** (category: drama)

Correct answer: the driver with the biggest grid→finish gain (minimum +3 places to be interesting). Wrong answers: 3 other finishers.

### Adaptive Question Count

Not every question can be generated for every race:

| Condition | Questions |
|-----------|-----------|
| Full data (2018+) | 7 |
| No stints (2010) | 6 (no strategy Q) |
| No biggest mover (everyone dropped) | 6 (no mover Q) |
| Fewer than 3 finishers (extreme case) | None (returns null) |

The frontend handles any count — it just renders whatever questions arrive.

### Randomized Options

Every question shuffles its options with `_random.shuffle()`. This means the same quiz endpoint returns questions with options in a different order each time. The correct answer index (`answer` field) points to the shuffled position, so scoring still works.

```python
_random.shuffle(options)
questions.append({
    "options": options,
    "answer": options.index(correct_value),
    ...
})
```

Technical detail: `options.index()` finds the correct answer's position AFTER shuffling. This is called after shuffle, so it always reflects the shuffled order. The frontend never needs to know which position was "originally" correct.

---

## What We Built

### Backend: generate_race_quiz() in insights.py

Plain English: One function that reads race data and returns a quiz. It's ~130 lines of Python that handle seven question types, adaptive counts, and randomized options.

The function signature:

```python
def generate_race_quiz(year: int, track: str) -> dict | None:
```

It returns a dict with `race` (display name), `total_questions` (count), and `questions` (array). Each question has `id`, `question`, `options` (4 strings), `answer` (0-3 index), and `category`.

### API: GET /races/{year}/{track}/quiz

A thin route — 5 lines:

```python
@app.get("/races/{year}/{track}/quiz")
def race_quiz(year: int, track: str):
    data = insights.generate_race_quiz(year, track)
    if data is None:
        raise HTTPException(status_code=404, detail=f"No data found for {year} {track}")
    return data
```

No caching on this endpoint, deliberately. Since options are randomized, each request returns a fresh quiz. Caching would make "Try again" give the same option order.

### Frontend: PredictionQuiz.tsx

The component has four states:

```
Loading → Collapsed → Expanded (answering) → Revealed (scored)
                                    ↑                   │
                                    └── "Try again" ────┘
```

**State management** uses three pieces of React state:

```typescript
const [answers, setAnswers] = useState<Record<number, number>>({});
const [revealed, setRevealed] = useState(false);
const [expanded, setExpanded] = useState(false);
```

Plain English: `answers` tracks which option the user picked for each question (keyed by question ID). `revealed` controls whether we're showing scores. `expanded` controls whether the quiz is collapsed to just a button or showing all questions.

**The collapsed state** is intentional UX — the quiz doesn't demand attention. It sits quietly at the bottom with "Take the quiz — 7 questions" and a button. Only fans who want to test themselves expand it.

**Option styling** has three visual states:

```typescript
if (revealed) {
  if (i === q.answer)                    → green (correct)
  if (i === selected && i !== q.answer)  → red (wrong pick)
  else                                   → muted (unselected)
} else if (i === selected)               → white highlight
else                                     → default zinc
```

**The submit button** is disabled until all questions are answered. It shows a counter: "Answer all questions (3/7)". When all are answered, it turns white and says "Reveal answers". This prevents partial scoring.

**Score feedback** uses thresholds:

```typescript
score === total   → "Perfect! You really know this race."
score >= 70%      → "Great job — you know your F1!"
score >= 40%      → "Not bad — room to learn more."
else              → "Time to re-read the race story!"
```

**Try again** resets `answers` and `revealed` but keeps `expanded` true — the user stays in the quiz view, not kicked back to the collapsed button.

---

## Edge Cases & Gotchas

### 1. Randomized options mean different answer indices each request

In plain English: If you fetch the quiz twice, the correct answer for "Who won?" might be option index 0 the first time and index 2 the second time.

Technical cause: `_random.shuffle()` runs on every call. The `answer` field is computed AFTER shuffling.

How to avoid: The frontend uses the `answer` field from the same response — it never stores question data and fetches answers separately. The quiz is self-contained.

### 2. 2010 races generate fewer questions

In plain English: The strategy question ("How many pit stops?") only appears if stint data exists. 2010 races have no stint data, so they get 6 questions instead of 7.

Technical cause: The code checks `stints.get(winner["driver"])` — if it's None or empty, the strategy question is skipped.

How to avoid: The frontend handles any question count. The `total_questions` field in the response tells the submit button how many to expect.

### 3. Wrong answers could theoretically include the correct answer

In plain English: If there are fewer than 4 drivers in a race (can't happen in F1 but theoretically possible), the wrong answer pool might be too small.

Technical cause: `_random.sample(pool, 3)` throws if the pool has fewer than 3 items.

How to avoid: `min(3, len(pool) - 1)` limits the sample size. And the function returns None if fewer than 3 drivers finished — no quiz is generated.

### 4. Full names vs codes

In plain English: The quiz always shows "Max Verstappen" not "VER". But if a driver isn't in the `_DRIVER_NAMES` lookup table, it falls back to the code.

Technical cause: `_DRIVER_NAMES.get(code, code)` returns the code itself as fallback.

How to avoid: The lookup table covers all drivers from 2010-2024 (70+ entries). A missing driver would show their 3-letter code, which is still usable.

---

## How It Connects to Other Concepts

- **Race Story (Phase 6D)**: The quiz tests what the story teaches. "Who won?" is answered in the story's opening line. "How many retired?" is mentioned in the story. The quiz reinforces the narrative.

- **Key Moments (Phase 5C)**: The "biggest mover" question directly mirrors the "biggest gainer" key moment. If you read the moments, you know the answer.

- **Strategy Data (Phase 2)**: The pit stop question tests whether users absorbed strategy information from the Go Deeper section.

- **Radio (Phase 6H)**: Hearing Leclerc say "Why did we pit now?" and then answering "How many stops did the winner make?" creates a multi-sensory learning loop — audio reinforces data.

- **Phase 6 story-first vision**: The quiz is the capstone of the story flow. Read → See → Hear → Test. Each layer reinforces the previous one. A beginner who gets 4/7 will re-read the story more carefully next time. A veteran who gets 7/7 feels validated.

---

## Going Deeper

### Adding difficulty levels
Easy: winner + weather. Medium: grid + retirements. Hard: strategy + movers. Let users choose, or auto-scale based on past performance (stored in localStorage).

### Timed mode
Add a countdown per question. "You have 10 seconds — who won?" Pressure forces gut-instinct answers, which is more fun for fans who watched the race live.

### Cross-race quizzes
"Across all 2023 races, who had the most wins?" Requires querying multiple races' data. The infrastructure supports it — `generate_race_quiz` would just need a season-level variant.

### localStorage persistence
Save `{race, score, date}` to localStorage. Show a small badge on the race card: "You scored 6/7." No auth needed, works offline, resets if the user clears browser data.

---

## Quick Reference

### Key Files

| File | Role |
|------|------|
| `backend/core/insights.py` | `generate_race_quiz()` — question generation |
| `backend/api.py` | `GET /races/{year}/{track}/quiz` — endpoint |
| `frontend/app/components/PredictionQuiz.tsx` | Interactive quiz UI |
| `frontend/app/races/[year]/[track]/page.tsx` | Quiz wired between Radio and Go Deeper |

### Question Categories

| Category | Icon | Example question |
|----------|------|------------------|
| result | Trophy | Who won? / Who was NOT on the podium? |
| grid | Race car | What grid position did the winner start from? |
| weather | Umbrella | What were the weather conditions? |
| strategy | Wrench | How many pit stops did the winner make? |
| drama | Lightning | How many retirements? / Who gained most places? |

### Component State Machine

```
  [Loading]
      │
      ▼
  [Collapsed] ──"Take the quiz"──▶ [Expanded]
                                       │
                                  pick answers
                                       │
                                  all answered?
                                       │
                                  "Reveal answers"
                                       │
                                       ▼
                                  [Revealed]
                                       │
                                  "Try again"
                                       │
                                       ▼
                                  [Expanded] (reset)
```

### Key Terms

| Term | Plain English | Technical |
|------|--------------|-----------|
| Distractor | A wrong answer that looks plausible | Option drawn from real race data, not the correct answer |
| Answer index | Which option is correct (0-3) | Integer pointing into the shuffled options array |
| Active recall | Testing yourself to strengthen memory | The pedagogical principle behind quizzes over re-reading |
| Adaptive count | Fewer questions when data is limited | Strategy Q skipped for races without stint data |

---

*Generated: 2026-03-19 | Project: Raceday | Phase 6I — Test Your Knowledge (Quiz Mode)*
*Files: insights.py, api.py, PredictionQuiz.tsx, page.tsx*
