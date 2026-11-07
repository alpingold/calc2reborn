# MA 16200 Study App: Design Spec

Date: 2026-11-06
Status: approved in conversation, pending written review

## 1. Purpose

A personal web app for studying Purdue MA 16200 (Calculus II), inspired by
boilerexams.com. It follows Dr. J. Chen's Fall 2023 lesson sequence as its
syllabus, drills the user with real past-exam questions and small concept
cards, schedules reviews with spaced repetition, and surfaces per-lesson
weakness so study time goes where it matters.

Personal use first. Sharing later must stay cheap, so the MVP is a static
site with no backend, and progress storage is written behind an interface
so cross-device sync can be added without touching the UI.

The tool should be useful to anyone at any point in the course, not only
for the user's own next exam.

### Success criteria

- A student can set their current lesson and get a daily queue of concept
  cards and exam questions appropriate to where they are in the course.
- Weak lessons are visible on a dashboard and are served more often in
  practice.
- Real past exams can be taken under exam conditions, and mock exams can
  be generated for a lesson range.
- Content for all 35 lessons and the exams from Fall 2016 through Fall
  2025 can be added in batches without the app breaking at any
  intermediate point.

### Source material

- Lessons: https://drjchen1.github.io/chenflix/courses/ma-16200-f23.html
  (35 lessons plus 6 review sessions; notes are public HTML with PDF
  originals; videos on Purdue MediaSpace).
- Past exams: https://www.math.purdue.edu/academic/courses/oldexams.php?course=MA16200
  Public PDFs. Midterms: 12 multiple-choice questions, five choices (A to
  E), 100 points, 60 minutes, no calculator. Answer keys are letters only.
  Full solution sets exist for some semesters. URL pattern, relative to
  `https://www.math.purdue.edu/academic/courses/past-exams/`:
  - exam: `16200e{1|2|3}-{f|s}{YYYY}.pdf`, final: `16200fe-{f|s}{YYYY}.pdf`
  - answers: `ans-` prefix; solutions: `sol-` prefix
- Scope: Fall 2016 through Fall 2025 (about 70 exams, about 900
  questions). Earlier exams are deferred.

## 2. Architecture

Static single-page app. Vite, React, TypeScript. No server in the MVP.

```
content/            JSON content (lessons, cards, exams), committed
public/figures/     PNG crops of exam figures, committed
raw/                downloaded PDFs and rendered page PNGs, gitignored
scripts/            content pipeline (fetch, render, crop)
src/
  content/          loaders and zod schemas
  engine/           FSRS wrapper, mastery, selectors, mock-exam sampler
  storage/          ProgressStore interface, Dexie and memory stores
  ui/               screens and components
docs/superpowers/   specs and plans
```

Key libraries: `ts-fsrs` (scheduling), `dexie` (IndexedDB), `katex`
(math), a small Markdown renderer with a math extension, `zod`
(schemas), `vitest` (tests), `react-router` (routing).

Content is bundled at build time, so the app cannot fail to load content
at runtime. Content validation lives in the test suite.

## 3. Content model

All content is JSON under `content/`, validated by zod schemas in tests.

### Lesson

One record per Chen lesson, 35 total, plus the 6 review sessions flagged
`isReview: true`.

| Field | Notes |
|---|---|
| `id` | `L1` to `L35`; reviews `R-exam1`, `R-exam2`, `R-exam3`, `R-final1` to `R-final3` |
| `number` | integer order on Chen's page |
| `title` | as on Chen's page |
| `sections` | textbook section strings, e.g. `["10.5"]` |
| `unit` | one of `Vectors`, `Applications of Integration`, `Integration Techniques`, `Sequences and Series`, `Power and Taylor Series`, `Polar` |
| `videoUrl`, `notesUrl` | from Chen's page |
| `prerequisites` | lesson ids |
| `keyIdeas` | Markdown with LaTeX; one screen; formulas, conditions, common traps |
| `isReview` | boolean |

The unit is how the dashboard rolls up weakness. Lessons are the only
taxonomy; there is no separate topic list.

### Concept card

| Field | Notes |
|---|---|
| `id` | `L23-c04` style |
| `lessonId` | lesson id |
| `front`, `back` | Markdown with LaTeX |
| `tags` | optional strings |

Roughly 8 to 15 per lesson. Plain front and back, self-graded.

### Exam and question

One file per exam, e.g. `content/exams/f2025-e1.json`.

Exam fields: `id` (`f2025-e1`, `s2024-final`), `term` (`Fall`/`Spring`),
`year`, `exam` (`1`, `2`, `3`, `final`), `examUrl`, `answersUrl`,
`solutionsUrl` (optional), `durationMinutes`, `questions`.

Question fields:

| Field | Notes |
|---|---|
| `id` | `f2025-e1-q03` |
| `number` | position in the exam |
| `points` | integer |
| `stem` | Markdown with LaTeX |
| `choices` | exactly five, `{ label: "A".."E", text }` |
| `answer` | one of the labels |
| `figures` | optional paths under `public/figures/` |
| `lessonIds` | one or more lesson ids, assigned by reading the question |
| `tags` | optional strings for finer skills |
| `solution` | optional Markdown with LaTeX |
| `status` | `transcribed` or `reviewed` |

### Content validation (tests)

- Every question has exactly five choices with labels A to E and an
  answer among them.
- Every `lessonId` and `prerequisite` references an existing lesson.
- Every figure path exists.
- No duplicate ids across lessons, cards, questions.
- Every LaTeX fragment renders in KaTeX without throwing.

## 4. Learning engine

### Concept cards: FSRS

- `ts-fsrs` with default parameters. Each card's scheduler state (due,
  stability, difficulty, reps, lapses, state) is stored in the progress
  store keyed by card id.
- Ratings: Again, Hard, Good, Easy.
- Daily queue: all due cards, then new cards up to a daily cap (setting,
  default 10). New cards come only from lessons at or before the user's
  current lesson, in lesson order, then card order.

### Exam questions: attempts and mastery

- Every attempt is logged: `questionId`, `chosen`, `correct`, `seconds`,
  `timestamp`, `mode` (`practice`, `lesson`, `exam`, `mock`).
- Lesson mastery is an exponentially weighted average of correctness over
  that lesson's attempts in time order, alpha 0.3. A lesson with fewer
  than three attempts is `untested`. Questions tagged to several lessons
  count toward each.
- Unit mastery is the mean of its lessons' mastery, ignoring untested
  lessons; a unit with all lessons untested is untested.
- Weak means mastery below 0.7.

### Smart practice selection

1. Choose a lesson from the covered range (lessons at or before current
   lesson, or a caller-supplied range). Weight: untested 3, weak 3,
   otherwise `1 + (1 - mastery)`. Lessons with no remaining eligible
   questions are skipped.
2. Choose a question from that lesson: never seen first; then missed and
   not seen in the last 7 days; then least recently seen.
3. A question is never served twice in one session.

### Coupling

When an exam question is answered wrong in any mode, every concept card of
each of its lessons has its due date set to now if it is later than now.
Cards not yet introduced are unaffected.

### Exam simulation

- Real exam: the published question order, a timer at the exam's
  duration, a question navigator, mark-for-review, submit at any time or
  on timeout.
- Mock exam: 12 questions sampled from a lesson range. Sampling spreads
  across lessons in the range proportionally to how many questions each
  has, and excludes questions used in the user's last two mocks.
- Both log attempts with mode `exam` or `mock`, update mastery, and show a
  results page with per-question review.

### Not included

Streaks, badges, leaderboards. The dashboard shows cards due as the
honest daily nudge.

## 5. Screens

Client-side routing. Six screens.

- **Dashboard.** Cards due today; "start smart practice"; mastery grid,
  one tile per lesson colored by mastery and grouped by unit, untested in
  gray. If an exam date and coverage are set: days left and the weakest
  covered lessons.
- **Course.** Lesson list by unit with the current-lesson marker. Lesson
  page: video and notes links, key ideas, that lesson's cards with due
  state, its exam questions, its mastery, and "practice this lesson".
- **Review.** FSRS session: front, reveal, four rating buttons. Keys 1 to
  4 rate, space reveals.
- **Practice.** Stem and figure, five choices, submit; then correct
  answer, your answer, solution if present, link to the lesson. Keys A
  to E choose, enter submits and advances.
- **Exams.** Past exams by semester with best score; take one; results
  with per-question review. Mock-exam generator with a lesson range.
- **Settings.** Current lesson, exam date and covered lessons, daily
  new-card cap, export progress to JSON, import from JSON, reset.
- **Content review (dev only).** Each transcribed question rendered beside
  its source page image, with a button to mark it reviewed. Not linked in
  production builds.

Rendering: KaTeX for inline and display math; Markdown through a small
renderer with a math extension; light and dark theme following the
system. Keyboard-first on desktop; usable on a phone.

## 6. Storage

```ts
interface ProgressStore {
  getCardState(cardId): Promise<CardState | undefined>
  saveCardState(state: CardState): Promise<void>
  listCardStates(): Promise<CardState[]>
  logAttempt(a: Attempt): Promise<void>
  listAttempts(filter?): Promise<Attempt[]>
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  exportAll(): Promise<ProgressSnapshot>
  importAll(s: ProgressSnapshot): Promise<void>
  clear(): Promise<void>
}
```

- MVP implementation: Dexie over IndexedDB.
- Fallback: in-memory store when IndexedDB is unavailable, with a visible
  banner that progress will not persist.
- Future: a sync store that wraps the local store and pushes changes to a
  server. All UI and engine code depends only on the interface.
- Export produces a JSON snapshot with a schema version. Import validates
  against the schema and rejects with the failing field named, leaving
  existing data untouched.

## 7. Content pipeline

1. **Fetch.** `scripts/fetch-exams.ts` downloads exam, answer, and
   solution PDFs for Fall 2016 through Fall 2025 into `raw/exams/` from a
   manifest of what the archive lists. Skips files already present.
2. **Render.** `scripts/render-pages.ts` renders each PDF page to PNG with
   pdfjs and a Node canvas into `raw/pages/<examId>/p<N>.png`. Poppler is
   not assumed.
3. **Transcribe.** The assistant writes one JSON file per exam by reading
   the page images: stems and choices in LaTeX, answers from the key,
   lesson ids by reading each question, solutions when a solution set
   exists. Figures are recorded as crop rectangles in
   `scripts/crops.json`; `scripts/crop-figures.ts` produces the PNGs
   under `public/figures/`.
4. **Review.** The dev-only content review screen is used to check each
   question against its source and flip status to `reviewed`.
5. **Cards and key ideas.** Written per lesson from Chen's notes, in
   lesson order, landing together per lesson.

Order of work: Fall 2025 backward, finals included, so the newest exams
land first. Lessons: Sequences and Series and Power and Taylor Series
units first, then the rest.

The app must work correctly with any subset of content present.

## 8. Testing and error handling

Vitest.

- Engine: FSRS wrapper across the four ratings; mastery with no, few, and
  many attempts and recency weighting; smart-practice selector respects
  range, weighting, and no-repeat-in-session; mock sampler respects range
  and the no-repeat rule.
- Storage: one shared interface test suite run against the Dexie store
  (with fake-indexeddb) and the memory store. Export then import
  round-trips exactly.
- Content: the validation suite in section 3, run on every commit.
- UI: component tests for the practice flow (answer, feedback, keyboard)
  and the review flow (reveal, rate). No end-to-end browser tests in the
  MVP.

Error handling:

- Storage failures fall back to memory with a banner.
- Import rejects invalid files with the failing field named.
- KaTeX render errors display the raw LaTeX in red instead of crashing,
  which also surfaces transcription mistakes.

## 9. Delivery order

1. App skeleton: Vite, React, TypeScript, routing, theme, storage
   interface with Dexie and memory stores, engine with tests, all six
   screens working against a small seed of content.
2. Content pipeline scripts, with Fall 2025 Exam 1 as the first fully
   transcribed exam.
3. Lessons, key ideas, and cards for Sequences and Series and Power and
   Taylor Series.
4. Fall 2025 and Spring 2024 exams, all numbers.
5. Remaining units' lessons and cards.
6. Remaining exams back to Fall 2016 in batches.

## 10. Future directions (not in MVP)

- Cross-device sync via a server-backed `ProgressStore`, with accounts.
- Full written lessons with worked examples and explanations.
- API-driven transcription for new semesters.
- Exams before Fall 2016.
- Per-question timing statistics.
- A distinct "which test should I use" drill card type.
- Deployment to GitHub Pages or Vercel (the static build already permits
  this; the step is just configuration).
