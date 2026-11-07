# Exam Transcription Guide

How to turn one past exam into `content/exams/<examId>.json`. `content/exams/f2025-e1.json` is the worked example.

## Sources

- Question pages: `raw/pages/<examId>/p<N>.png`
- Answer key: `raw/pages/<examId>.ans/p<N>.png`
- Solutions, when they exist: `raw/pages/<examId>.sol/p<N>.png`
- URLs and which of these exist: `scripts/exams-manifest.json`
- Lesson list for tagging: `content/lessons.json`

Run `pnpm content:fetch <examId>` and `pnpm content:render <examId>` if the pages are missing. `raw/` is never committed.

## Exam fields

Use `id`, `term`, `year`, `exam`, and the URLs from the manifest. Take `durationMinutes` from the exam's own instructions. If it states none, use 60 for a midterm and 120 for a final, and say so in your report.

## Check the version first

Many exams have several test versions, marked "TEST NUMBER 01" or "VERSION 01" on the cover. Keys may list answers per version. Confirm the key you read belongs to the version you transcribed. If they cannot be matched, stop and report it rather than guess.

## Question fields

- `id` `<examId>-qNN`, sequential `number`.
- `points` from the page. If the cover says each problem is worth 100/12, store the JSON number `8.333333333333334`. If points are not stated anywhere, divide 100 by the question count.
- `stem` and `choices` reproduce the printed mathematics exactly: same bounds, constants, signs, and units. Keep printed quirks. Do not fix a typo in a question; note it in your report.
- `choices` have 2 to 10 entries labeled consecutively from A. Store every printed choice in printed order.
- `answer` comes from the key. Solve at least the quick questions yourself. If your answer disagrees with the key, keep the key's letter and report the disagreement.
- `lessonIds`: one or more, chosen by reading the question against the lesson titles, not by keywords. Tag the skill the question tests. See below.
- `sourcePage` is the number of the PNG the question appears on.
- `solution`: fill in from the solutions PDF when one exists, as Markdown with LaTeX. Do not invent solutions otherwise.
- `status`: `transcribed` first. Set `reviewed` only after a genuine second pass comparing every stem and choice with the page image. Report which questions got the second pass.

## Exams with no key or solutions

Six exams have neither: `f2023-e2`, `f2023-e3`, `f2023-final`, `s2023-final`, `f2022-e2`, `f2022-e3`. Solve every question in full, two independent ways where practical, and check numerically by script where possible. Set `"answerSource": "derived"` on each question, and report your confidence and working per question. Never set this field on an exam with a key.

## Formatting (enforced by `pnpm test src/content`)

- Inline math is `$...$`. Display math is a three-line block: a line with only `$$`, the math, a line with only `$$`.
- Do not pad a `$` pair with spaces, and do not put a digit immediately after a closing `$`. Write a literal dollar outside math as `\$5`.
- KaTeX-supported LaTeX only, with no custom macros or `\displaystyle`. Vectors as printed, for example `\vec{u}` or `\mathbf{i}`.
- 2-space indent, trailing newline.

## Figures

A question gets a figure only if a diagram carries information the text does not. Add a rectangle to `scripts/crops.json`, run `pnpm content:crop`, view the PNG, and adjust until it holds the whole diagram with a small margin and no stray text. Reference it as `"figures": ["figures/<examId>/q02.png"]`. Coordinates are in pixels on the 1224 x 1584 page image. Do not paste a whole question as an image.

## Lesson tags

| Topic | Lesson |
|---|---|
| Vectors, 3D coordinates, spheres, lines | L1, L2 |
| Dot product, projections, angles | L3 |
| Cross product, area of a parallelogram, torque | L4 |
| Area between curves | L5 |
| Volume by slicing, disks, washers | L6 |
| Volume by shells | L7 |
| Arc length, surface area | L8 |
| Density, mass, center of mass | L9 |
| Work, pumping, springs, force | L10 |
| Integration by parts | L11 |
| Trig integrals | L12, L13 |
| Trig substitution | L14, L15 |
| Partial fractions | L16, L17 |
| Improper integrals | L18 |
| Sequence and series overview, partial sums | L19 |
| Sequence limits | L20 |
| Geometric and telescoping series | L21 |
| Divergence Test, Integral Test, p-series | L22 |
| Direct and Limit Comparison | L23 |
| Alternating series, error bound | L24 |
| Ratio and Root Tests, absolute convergence | L25 |
| Mixed "which test" | L26 |
| Taylor polynomials | L27 |
| Taylor error bounds | L28 |
| Radius and interval of convergence | L29 |
| Power series operations | L30 |
| Taylor and Maclaurin series | L31 |
| Applications of Taylor series | L32 |
| Polar coordinates, polar curves | L33, L34 |
| Polar area and length | L35 |

Questions may carry more than one lesson. Check `content/lessons.json` when a split such as L12 versus L13 matters, since part 1 and part 2 cover different cases.

## Finishing

1. `pnpm test src/content`, then `pnpm test && pnpm typecheck`.
2. Commit only `content/exams/<examId>.json`, `scripts/crops.json`, and `public/figures/<examId>/`, one commit per exam, with the message `Add <Term YYYY Exam N> questions and figures`.
3. In your report: a table of question, points, answer, lessons, figure yes or no; every doubt; every key disagreement.
