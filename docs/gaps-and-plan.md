# Known gaps and a plan to address them

Written 2026-11-07, after the MVP merge and the `exam-feedback-redesign` branch (feedback mode and the main-page redesign). It collects every gap found so far: from using the app, from the final review of the MVP, and from the minor findings each task review deferred.

Each item has a size: **S** is under an hour of work, **M** is a few hours, **L** is a day or more or needs its own design.

## 1. Studying for a specific exam

Most of the gaps that matter day to day are here. The app knows the exam date and which lessons are on the exam, but almost nothing uses that.

| # | Gap | Effect today | Fix | Size |
|---|-----|--------------|-----|------|
| 1.1 | "Lessons on the exam" is a multi-select list | You need Ctrl-click or Shift-click, and a plain click silently replaces the selection | Replace it with a From/To lesson range like the mock-exam form, saved as the same `examLessonIds` list | S |
| 1.2 | That setting only filters the Dashboard's "Weakest lessons" | Practice, Review and mock exams all ignore it | Make it the default scope for Practice (1.3) and the default range of the mock form; let Review put exam-lesson cards first | M |
| 1.3 | The Practice tab can't choose lessons | It always draws from L1 up to the current lesson. Only a lesson page's "Practice this lesson" link narrows it, and only to one lesson | Add a scope picker: "Exam lessons" (the default when an exam date is set), "Everything so far", or a From/To range. Keep `?lesson=` working | M |
| 1.4 | A Practice session never ends | No natural stopping point and no end-of-session summary | Optional length (10, 20, or unlimited) and a short summary: score, lessons missed, and links to those lessons | S |
| 1.5 | A question missed in the last 7 days is not served sooner | The selector only brings back misses older than 7 days. A recent miss waits in line with everything else | Decided: a missed question comes back later in the same session; if the session ends first, it returns in a later session on a short spaced schedule rather than after 7 days | S |

## 2. Exams and scoring

| # | Gap | Effect today | Fix | Size |
|---|-----|--------------|-----|------|
| 2.1 | "Best" score on the Exams page counts feedback-mode attempts | A score from a feedback run, where you saw each solution as you went, can stand as your best timed result | Show the timed best, with a feedback best beside it only if no timed attempt exists | S |
| 2.2 | Time per question in feedback mode includes reading solutions | Per-question seconds are elapsed time divided by answers, so reading time inflates them. Nothing shows this number yet, so it only matters if timing stats are added later | Log the seconds QuestionView measures for each question at Check, instead of the session average | S |
| 2.3 | Partial-credit questions are scored all or nothing, and free points aren't stored | Totals such as "/ 96" differ from the paper | Leave as is unless it bothers you. Matching the paper would need per-question partial-credit data from the keys | M |
| 2.4 | Omitted questions: the free-response parts of the Fall 2024 exams (e1 Q11–12, e2 Q11–12, e3 Q11) and f2022-final Q4 | Those exams look shorter than the paper | Optionally add free-response parts as self-graded items (show the worked solution, you mark yourself right or wrong) outside the score. f2022-final Q4 has no correct printed choice and stays out | M |

## 3. Content

| # | Gap | Effect today | Fix | Size |
|---|-----|--------------|-----|------|
| 3.1 | Exam topics Dr. Chen's lessons don't teach: parametric curves (s2019-e3 Q10–12), conics (s2019-final Q24), complex numbers (s2019-final Q25), Midpoint Rule (s2016-e2 Q7) | They are tagged to the nearest lesson (L34, L2, L33, L5), so a miss there marks that lesson as weak | Add an "Other topics" group with its own tags that is excluded from lesson mastery and the mastery grid, still practicable on its own | M |
| 3.2 | Six exams have worked-out answers, not official keys (f2022-e2, f2022-e3, f2023-e2, f2023-e3, f2023-final, s2023-final) | Each answer was solved twice independently, but an error would mark correct students wrong | Add a "Flag this question" button that records a note locally and includes it in the progress export, so problems can be collected and fixed | S |
| 3.3 | Small leftovers from content review | s2019-e3 Q3's solution mixes `<` and `≤` across its two lines. Cards: L34-c12's symmetry tests read as "if and only if"; L33-c06 leaves out the negative x-axis. Eleven exam questions write `$xy-$plane` or `$x-$axis`, which renders a minus sign where a hyphen belongs | Fix in one content pass | S |
| 3.4 | The spoiler check (cards must not give away exam answers) was last run before all 65 exams were in | A few cards may give away an answer on one of the later exams | Re-run the exam-reuse and numeric-equivalence scans against all 65 exams, and rewrite any hits | S |

## 4. Robustness (deferred review findings)

None of these has been seen to cause a problem. They are edge cases the task reviews recorded and deferred.

| # | Gap | Fix | Size |
|---|-----|-----|------|
| 4.1 | After an exam submit fails partway and the page is reloaded, some answers can be logged twice | Write the attempts with stable ids saved in the session, so a repeat write replaces rather than adds | S |
| 4.2 | For about a second after Submit starts, a click can still change an answer; that answer reaches the results page but not the saved attempts | Lock answering on the same render that freezes the attempts | S |
| 4.3 | Results are reached with a normal navigation, so Back returns to the finished exam page | Navigate with `replace` | S |
| 4.4 | Rebuilt mock results (after a reload) only list answered questions | Done on 2026-11-10: each finished exam is saved as a session with its question list, and the results page is built from it. Checked in the browser: a 12-question exam with 5 answered lists all 12 after a reload | S |
| 4.5 | An imported progress file with duplicate attempt ids fails in IndexedDB but is silently deduplicated in memory | Reject duplicate ids when the file is checked | S |
| 4.6 | Practice: retrying after a failed save can change the chosen answer after the attempt was logged. A failed question load has no retry button | Freeze the choice once logged; add a Retry button | S |
| 4.7 | Review: keyboard shortcuts fire with modifier keys and on key repeat; cards whose id no longer exists are counted in the summary | Ignore modifiers and repeats; drop unknown cards from the counts | S |
| 4.8 | Settings: no `min`/`max` on the daily-cards field and no field-level error messages; the Dashboard keeps an old error message after the lesson changes | Add bounds, `aria-invalid` and a message under the field; clear the error on change | S |
| 4.9 | `tsc --noEmit` doesn't check `vite.config.ts` or `scripts/` | Add a second tsconfig for them to `pnpm typecheck` | S |
| 4.10 | The content checks accept `$5+$x` as math and don't check code-fence indentation | Indentation check added. The dollar-sign rule was left as is: rejecting a letter after closing math would flag 36 correct uses such as `$n$th`, and the app's content has no dollar amounts | S |
| 4.11 | Content pipeline scripts exit 0 when a download fails or an exam id is unknown | Exit non-zero and list what failed | S |

## 5. Performance

| # | Gap | Fix | Size |
|---|-----|-----|------|
| 5.1 | The build warns that the main JavaScript chunk is over 500 kB, mostly the exam content compiled into the bundle | Partly done on 2026-11-10: all content loads as its own chunk after the first paint (2.0 MB, 471 kB gzipped, now including 994 solutions and 88 guided problems). The app chunk is still 1.0 MB (318 kB gzipped), so the warning remains. Still open: load exams and guided problems per file on demand, and split KaTeX out | M |

## 6. Larger features you asked for earlier

| # | Feature | Notes | Size |
|---|---------|-------|------|
| 6.1 | Progress that carries across devices | Needs a backend or a sync service and sign-in. The `ProgressStore` interface was built so a remote store can slot in. Until then, Settings export/import is the workaround | L |
| 6.2 | Full written lessons | Write-ups for each of the 35 lessons, beyond the current key ideas and links to Dr. Chen's notes and videos | L |

## Plan

The order is by value to you while studying, then by risk. Each phase gets its own short design for your approval before any code, following the same process as the feedback-mode change. Phases 1 to 3 are small enough to agree in chat; phases 5 and 6 each need a written spec.

### Phase 1: exam focus (items 1.1 to 1.5, 2.1). Done on 2026-11-07
1. Turn "Lessons on the exam" into a From/To range in Settings (1.1).
2. Add the scope picker and optional session length to Practice, defaulting to the exam lessons when an exam date is set (1.3, 1.4).
3. Use the exam range as the default for the mock-exam form, and put exam-lesson cards first in Review (1.2).
4. Apply the recent-miss rule (1.5): retry within the session, then spaced return across sessions.
5. Show timed and feedback best scores separately (2.1).

Testing: tests written first for each picker and default; then a browser check of Settings, Practice and Exams at phone and desktop widths. Practice gains a scope picker, so its screen changes. The question view itself stays as it is.

### Phase 2: robustness fixes (items 4.1 to 4.11, 2.2). Done on 2026-11-07
All small and independent. Do them as one batch, each with a test that fails before the fix and passes after. Start with 4.1 to 4.4, which affect saved exam data.

### Phase 3: content (items 3.1 to 3.4). Done on 2026-11-07
1. Re-run the spoiler scans and fix hits (3.4). Done on 2026-11-07: all 456 cards and 41 sets of key ideas were checked against the 970 questions. After setting aside notation shared by three or more questions, 185 matches remained. All were common notation, a different problem reaching the same number, or a standard result the spoiler rule exempts. Nothing needed rewriting.
2. Fix the small leftovers (3.3). Done on 2026-11-07: 13 hyphens moved out of math (`$x$-axis`, `$xy$-plane`, `$10$-m`). L34-c12 and L33-c06 had already been fixed. The `<` and `≤` in s2019-e3 Q3 are each correct where they are used: the `≤` lines reach equality at ℓ = 0 and m = 1, 2.
3. Add the "Other topics" group and move the coverage-gap questions into it (3.1). Done on 2026-11-07: four extra topics, X1 to X4, with key ideas and no flashcards. 24 questions were retagged after a check by hand: 12 parametric, 6 conic sections, 5 complex numbers, 1 numerical integration.
4. Add "Flag this question" (3.2). Done on 2026-11-07: "Report a problem" under every revealed answer, saved in the browser, carried in the export, and listed in Settings with a Copy report button.

### Phase 4: performance (item 5.1)
Load exam content and cards on demand. Measure the main chunk before and after; the goal is to clear the 500 kB warning without slowing down the first question.

### Phase 5: optional exam completeness (items 2.3, 2.4)
Only if you want the paper totals to match. Self-graded free-response parts come first; per-question partial credit only if the keys support it.

### Phase 6: larger features (items 6.1, 6.2)
Each starts with its own design discussion and written spec. Sync comes first if you plan to share the app or study on more than one device.
