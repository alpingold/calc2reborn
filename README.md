# MA 16200 Study

A study app for Purdue's MA 16200 (Calculus II). It has 65 past exams transcribed from Purdue's archive, a lesson outline that follows Dr. Chen's course, and 456 concept flashcards scheduled with FSRS spaced repetition. You can review cards, practice exam questions by lesson, take a past exam under its time limit, or generate a timed mock exam from a range of lessons. Any exam can instead be taken untimed with feedback after each answer. Mastery per lesson is tracked from your answers.

Every one of the 994 exam questions has a worked solution and is sorted into one of 120 problem types, such as "interval of convergence with endpoints". After an answer the app shows the solution, the problem type, the flashcards that support it, and a similar question to try. The Dashboard builds a short plan for the day (new guided problems, cards to review, missed questions to retry, and the two weakest problem types to practise) and, before an exam, shows which problem types on it have been tested. Each lesson page has two or three guided problems under "Check your understanding": 88 in all, written for this app, worked one step at a time with a note on each wrong choice. Four topics that appear on older exams but not in Dr. Chen's lessons (parametric curves, conic sections, complex numbers and numerical integration) have their own pages under Other topics and stay out of lesson mastery.

It is a Vite + React + TypeScript single-page app with no backend.

## Prerequisites

- Node 24
- pnpm

## Commands

```sh
pnpm install   # install dependencies
pnpm dev       # start the dev server
pnpm test      # run the tests once
pnpm build     # typecheck and build to dist/
pnpm preview   # serve the built app from dist/
```

`pnpm typecheck` runs the TypeScript checker alone.

## Your progress

Progress (card schedules, answers, and settings) lives in your browser's IndexedDB, so it stays on that browser and device. To move it or back it up, open Settings and use **Export progress**, which downloads a JSON file, and **Import progress** to load such a file. **Reset progress** deletes everything. If IndexedDB is unavailable, the app keeps progress in memory only, so it is lost when the page closes, and shows a banner saying so.

## Content

All content is JSON under `content/`: `lessons.json` (with each lesson's problem types), one card file per lesson in `content/cards/`, one file per exam in `content/exams/`, and one file of guided problems per lesson in `content/guided/`. The solutions and guided problems were drafted and then checked independently by AI models, with every numeric result recomputed; how that was done, and what was settled by hand, is in `docs/solution-writing-guide.md`, `docs/solution-checking-guide.md`, `docs/guided-problem-guide.md` and `docs/content-escalations.md`. A mistake can still be reported from any revealed answer with "Report a problem". Exam figures are PNGs under `public/figures/`. Every file is validated by the test suite.

The pipeline that produced the exams:

1. `pnpm content:manifest` reads Purdue's past exam archive and writes `scripts/exams-manifest.json`.
2. `pnpm content:fetch [examId ...]` downloads the exam, answer key, and solution PDFs into `raw/exams/`.
3. `pnpm content:render [examId ...]` renders their pages to PNGs in `raw/pages/`.
4. `pnpm content:crop` cuts the figures listed in `scripts/crops.json` out of the page images into `public/figures/`.

The `raw/` folder is never committed. Transcription follows `docs/exam-transcription-guide.md`, and cards and lesson key ideas follow `docs/card-writing-guide.md`. In development, `/dev/content` shows each transcribed question next to its source page image for review. It is left out of production builds.

## Deployment

`pnpm site:deploy` runs the tests, builds, and publishes `dist/` to Vercel as a static site (project `ma16200-study`). The first time, log in with `npx vercel@65.12.1 login`; the script then links the project and deploys. `public/vercel.json` sends unknown paths to `index.html`, and the page carries a `noindex` tag so the shared link stays out of search results.

`pnpm build` produces a static site in `dist/`. Any static host works if it serves `index.html` for unknown paths, since the app uses browser history routing. A host that serves the app from a sub-path, such as GitHub Pages at `/<repo>/`, also needs Vite's `base` option set to that path and a matching `basename` for the router in `src/App.tsx`. Figure paths are root-relative (`/figures/...`), so they need that prefix too.

## Sources

- Lessons, videos, and notes: Dr. Chen's MA 16200 course, <https://drjchen1.github.io/chenflix/courses/ma-16200-f23.html>.
- Past exams, answer keys, and solutions: Purdue Department of Mathematics past exam archive, <https://www.math.purdue.edu/academic/courses/oldexams.php?course=MA16200>.

Six exams have no official answer key (`f2022-e2`, `f2022-e3`, `f2023-e2`, `f2023-e3`, `f2023-final`, `s2023-final`). Their answers were worked out independently, and the app marks each one with a notice that it may contain errors.
