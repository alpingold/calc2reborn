# MA 16200 Study

A study app for Purdue's MA 16200 (Calculus II). It has 65 past exams transcribed from Purdue's archive, a lesson outline that follows Dr. Chen's course, and 456 concept flashcards scheduled with FSRS spaced repetition. You can review cards, practice exam questions by lesson, take a past exam under its time limit, or generate a timed mock exam from a range of lessons. Mastery per lesson is tracked from your answers.

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

All content is JSON under `content/`: `lessons.json`, one card file per lesson in `content/cards/`, and one file per exam in `content/exams/`. Exam figures are PNGs under `public/figures/`. Every file is validated by the test suite.

The pipeline that produced the exams:

1. `pnpm content:manifest` reads Purdue's past exam archive and writes `scripts/exams-manifest.json`.
2. `pnpm content:fetch [examId ...]` downloads the exam, answer key, and solution PDFs into `raw/exams/`.
3. `pnpm content:render [examId ...]` renders their pages to PNGs in `raw/pages/`.
4. `pnpm content:crop` cuts the figures listed in `scripts/crops.json` out of the page images into `public/figures/`.

The `raw/` folder is never committed. Transcription follows `docs/exam-transcription-guide.md`, and cards and lesson key ideas follow `docs/card-writing-guide.md`. In development, `/dev/content` shows each transcribed question next to its source page image for review. It is left out of production builds.

## Deployment

`pnpm build` produces a static site in `dist/`. Any static host works if it serves `index.html` for unknown paths, since the app uses browser history routing. A host that serves the app from a sub-path, such as GitHub Pages at `/<repo>/`, also needs Vite's `base` option set to that path and a matching `basename` for the router in `src/App.tsx`. Figure paths are root-relative (`/figures/...`), so they need that prefix too.

## Sources

- Lessons, videos, and notes: Dr. Chen's MA 16200 course, <https://drjchen1.github.io/chenflix/courses/ma-16200-f23.html>.
- Past exams, answer keys, and solutions: Purdue Department of Mathematics past exam archive, <https://www.math.purdue.edu/academic/courses/oldexams.php?course=MA16200>.

Six exams have no official answer key (`f2022-e2`, `f2022-e3`, `f2023-e2`, `f2023-e3`, `f2023-final`, `s2023-final`). Their answers were worked out independently, and the app marks each one with a notice that it may contain errors.
