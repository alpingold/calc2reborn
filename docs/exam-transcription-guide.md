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

Use `id`, `term`, `year`, `exam`, and the URLs from the manifest. `durationMinutes` is 60 for a midterm and 120 for a final (see Known exceptions).

## Check the version first

Many exams have several test versions, marked "TEST NUMBER 01" or "VERSION 01" on the cover. Keys may list answers per version. Confirm the key you read belongs to the version you transcribed. If they cannot be matched, stop and report it rather than guess.

## Question fields

- `id` `<examId>-qNN`, sequential `number`.
- `points` from the booklet (see Known exceptions). For `f2016-e1` store the JSON number `8.333333333333334`.
- `stem` and `choices` reproduce the printed mathematics exactly: same bounds, constants, signs, and units. Keep printed quirks. Do not fix a typo in a question; note it in your report.
- `choices` have 2 to 10 entries labeled consecutively from A. Store every printed choice in printed order.
- `answer` comes from the key. Solve at least the quick questions yourself. If your answer disagrees with the key, keep the key's letter and report the disagreement.
- `lessonIds`: one or more, chosen by reading the question against the lesson titles, not by keywords. Tag the skill the question tests. See below.
- `sourcePage` is the number of the PNG the question appears on.
- `solution`: fill in from the solutions PDF when one exists, as Markdown with LaTeX. Do not invent solutions otherwise.
- `status`: `transcribed` first. Set `reviewed` only after a genuine second pass comparing every stem and choice with the page image. Report which questions got the second pass.

## Known exceptions

Check this list before starting. These were confirmed by surveying every booklet and key.

- **Free response, multi-select, and fill-in parts are left out.** `f2024-e1` Q11 and Q12, `f2024-e2` Q11 and Q12, `f2024-e3` Q11. Transcribe the lettered questions only. Record the omission in your report.
- **Key accepts every choice** (`f2017-e1` Q8, `s2018-e3` Q6, key says ABCDE). Solve it, store the correct letter, and start `solution` with "The official key accepted every choice for this question." This is the one exception to keeping the key's letter, along with the next item.
- **Key accepts two choices** (`s2018-e2` Q2, "C OR D"). Solve it, store the better-justified letter, and note both in `solution`.
- **Key blank** (`f2022-final` Q4, and no printed choice is correct). Leave it out and renumber, so the exam has 24 questions. `id` and `number` stay sequential; `sourcePage` still points at the real page.
- **Solutions PDFs with two versions** (`f2016-e1`, `f2016-e2`, `f2016-e3`, `s2017-e1`, `s2017-e2`, `s2017-e3`). They hold TEST NUMBER 01 and then TEST NUMBER 02, and the numbers differ. Use only the TEST 01 half: pages 1 to 7, or 1 to 8 for `s2017-e3`.
- **Solutions as the only key** (`f2016-e2`, `s2017-e2`). The answers are handwritten circles, boxes, and arrows on the TEST 01 half.
- **`s2019-e1`, `s2019-e2`** keys say Version 01 and booklets say 00. This is a label slip, so use the key. **`s2016-*`** booklets say Form A and keys say Version 01; these match. **`f2022-final`, `f2024-*`, `f2025-*`** keys print no version; these match.
- **`s2019-*.sol`** has no cover, so its pages run one behind the booklet. `sourcePage` always refers to the booklet.
- **`f2022-e2`** is "Alternate Exam 2". Use it as published.

Facts that still fit the schema: `f2021` has 6 choices throughout. `s2017-e2` and `s2017-e3` Q12 to Q14 are True/False, stored as A. True, B. False. Some `f2025` questions have 8 or 9 choices and print "Partial credit is possible"; keep that text. The app scores all or nothing.

**Points.** Use the booklet's stated points. Do not store free points: 12 questions at 8 points stores 96, not 100. Only `f2016-e1` is 100/12 per problem. `f2016-e2` and `f2016-e3` are 8 each. `s2017-e1` is 9 each. `s2024-*` are 1 each. `s2017-e2`, `s2017-e3`, and all of `f2024` and `f2025` print points per question.

**Picture choices** (`f2017-final` Q12, `f2018-final` Q21, `f2019-final` Q25, `f2022-final` Q24, `f2023-final` Q25, `s2019-e3` Q10, `s2019-final` Q21). Crop one figure covering all the graphs with their letters, and use choice text such as "Graph A". The stem stays text.

**Duration.** Only `f2021-final`, `f2024-*`, `f2025-*`, and `s2024-*` state one. "10 minutes" and "20 minutes" on covers are no-leave windows, not durations. Use 60 for midterms and 120 for finals everywhere; that is what clock times imply.

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
