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
- A text hyphen printed where a minus sign is plainly meant (`f2018-final` Q7 choice D "-15", Q12 choice E "- 5/64") is stored as a math minus, such as `$-15$`. This is typography, not a fix to the question.
- `choices` have 2 to 10 entries labeled consecutively from A. Store every printed choice in printed order.
- `answer` comes from the key. Solve at least the quick questions yourself. If your answer disagrees with the key, keep the key's letter and report the disagreement.
- `lessonIds`: one or more, chosen by reading the question against the lesson titles, not by keywords. Tag the skill the question tests. See below.
- `sourcePage` is the number of the PNG the question appears on.
- `solution`: fill in from the solutions PDF when one exists, as Markdown with LaTeX. If the solutions PDF only marks the answer and shows no working for a question, leave `solution` out for that question. You may add a final arithmetic step the working stops short of, and put a sketch's information (which curve is on top, a shell's radius) into words. If the handwriting has a slip that its own next line corrects, write the corrected step and note it in your report. Do not invent solutions otherwise.
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

Facts that still fit the schema: `f2017-e1` page 5 prints a note above Q8 saying the problem was changed after the exam; leave the note out of the stem and transcribe the problem as printed. `s2018-final` Q18 choices A and D are equal; keep both as printed. `f2018-final` Q3 prints "nature length", `s2018-e1` Q2 prints $\langle 1, 2, -2, \rangle$ with a trailing comma, and `s2018-e1` Q3 choice E prints "$x = 5-, -5$"; keep all as printed. `s2022-e2` Q12 prints the density as $\rho\,\frac{kg}{m^2}$, `s2022-e1` Q4 choice A prints a stray outer $2\pi$, `s2022-e1` Q10 choice D prints `π/27(10^{3/2} − 1)` inline, and `s2022-final` Q15 choice E prints "I, II and II"; keep all as printed. `s2022-e3` Q1 has four choices. `f2022-final` printed Q6 says "wench" and printed Q14 says "Which of the following statement is true?"; keep both as printed. `f2023-e1` Q3 and Q4 print vectors as `=< a, b, c >`, and Q5 prints "the area of the area of the triangle"; keep both as printed. `f2024-e1` Q9 prints choices B and C identically; store both as printed. `f2021` has 6 choices throughout. `s2017-e2` and `s2017-e3` Q12 to Q14 are True/False, stored as A. True, B. False. Some `f2025` questions have 8 or 9 choices and print "Partial credit is possible"; keep that text. The app scores all or nothing.

**Points.** Use the booklet's stated points. Do not store free points: 12 questions at 8 points stores 96, not 100. Only `f2016-e1` is 100/12 per problem. `f2016-e2` and `f2016-e3` are 8 each. `s2017-e1` is 9 each. `s2024-*` are 1 each. `s2017-e2`, `s2017-e3`, and all of `f2024` and `f2025` print points per question.

**Picture choices** (`f2017-final` Q12, `f2018-final` Q21, `f2019-final` Q25, `f2022-final` Q24, `f2023-final` Q25, `f2025-e2` Q4, `s2019-e3` Q10, `s2019-final` Q21, `s2024-final` Q7). Crop one figure covering all the pictures with their letters, and use choice text such as "Graph A" or "Triangle A". The stem stays text. Other exams may have more; apply the same rule. When a question prints a given graph as well as picture choices (`f2024-final` Q21), crop them separately as `q21a.png` and `q21b.png` and list both in `figures` in printed order.

**Duration.** Only `f2021-final`, `f2024-*`, `f2025-*`, and `s2024-*` state one. "10 minutes" and "20 minutes" on covers are no-leave windows, not durations. Use 60 for midterms and 120 for finals everywhere; that is what clock times imply.

## Exams with no key or solutions

Six exams have neither: `f2023-e2`, `f2023-e3`, `f2023-final`, `s2023-final`, `f2022-e2`, `f2022-e3`. Solve every question in full, two independent ways where practical, and check numerically by script where possible. Set `"answerSource": "derived"` on each question, and report your confidence and working per question. Never set this field on an exam with a key.

## Formatting (enforced by `pnpm test src/content`)

- Inline math is `$...$`. Display math is a three-line block: a line with only `$$`, the math, a line with only `$$`.
- Do not pad a `$` pair with spaces, and do not put a digit immediately after a closing `$`. Write a literal dollar outside math as `\$5`.
- KaTeX-supported LaTeX only, with no custom macros or `\displaystyle`. Vectors as printed, for example `\vec{u}` or `\mathbf{i}`.
- 2-space indent, trailing newline.

## Figures

A question gets a figure if a diagram carries information the text does not. Keep a printed graph if the stem leaves a boundary, intersection, or orientation for the student to work out, since exam takers had it. Add a rectangle to `scripts/crops.json`, run `pnpm content:crop`, view the PNG, and adjust until it holds the whole diagram with a small margin and no stray text. Reference it as `"figures": ["figures/<examId>/q02.png"]`. Coordinates are in pixels on the rendered page image: 1224 x 1584 for letter pages, 1190 x 1683 for A4 pages such as `f2018-e1`. Check the image size before cropping. Do not paste a whole question as an image.

## Lesson tags

| Topic | Lesson |
|---|---|
| Vector arithmetic, unit vectors, 3D coordinates and planes such as $z = 5$ | L1 |
| Spheres (equation, center, radius), regions in 3D, collinear points | L2 |
| Dot product, projections, angles | L3 |
| Cross product, area of a parallelogram, torque | L4 |
| Area between curves | L5 |
| Volume by slicing, disks, washers | L6 |
| Volume by shells | L7 |
| Arc length, surface area | L8 |
| Density and mass of a thin bar or wire, work by a variable force, springs and Hooke's law, work against gravity, chains and cables | L9 |
| Pumping fluid from a tank, hydrostatic pressure and force | L10 |
| Integration by parts | L11 |
| Powers of sine and cosine, basic tan, sec, and cot integrals | L12 |
| Powers of tan and sec, rewriting tan and sec as sine and cosine | L13 |
| Trig substitution: building the triangle, sine and tangent cases | L14 |
| Trig substitution: completing the square, factored radicals, arc-length applications | L15 |
| Partial fractions: distinct and repeated linear factors | L16 |
| Partial fractions: polynomial long division, irreducible and repeated quadratic factors | L17 |
| Improper integrals | L18 |
| Sequence and series overview, partial sums | L19 |
| Sequence limits | L20 |
| Geometric and telescoping series | L21 |
| Divergence Test, Integral Test, p-series | L22 |
| Direct and Limit Comparison | L23 |
| Alternating series, error bound, absolute versus conditional convergence | L24 |
| Ratio and Root Tests, absolute convergence | L25 |
| Mixed "which test" | L26 |
| Taylor polynomials | L27 |
| Taylor error bounds | L28 |
| Radius and interval of convergence | L29 |
| Power series operations | L30 |
| Taylor and Maclaurin series | L31 |
| Applications of Taylor series | L32 |
| Polar coordinates: points, converting points and equations, identifying a curve by converting | L33 |
| Graphing polar curves: roses, limaçons, cardioids | L34 |
| Polar area and length | L35 |

Questions may carry more than one lesson, but do not add a lesson as a hedge. A wrong tag sends a student to the wrong lesson.

No lesson teaches center of mass or equations of a line. If an exam asks either, tag the nearest lesson (L9, or L1 and L2) and report it. Other gaps, tagged the same way and reported:

- Circles in the plane (center, radius, how two circles relate): tag L2.
- Symmetry of a polar curve: tag L34.
- Binomial series (first terms of $(1+x)^p$): tag L31.
- Constant-force work along a displacement at an angle ($W=\vec F\cdot\vec d=|\vec F||\vec d|\cos\theta$): tag L3, not L9.
- An improper integral whose antiderivative needs another lesson's technique (integration by parts, partial fractions, trig substitution): tag that lesson and L18. A plain $u$-substitution inside an improper integral stays L18 only.
- Parametric curves (graphs, tangents, concavity, arc length of $x(t)$, $y(t)$): no lesson teaches them; tag L34 and report it.
- Centroid: tag L9 and report it.
- Conic sections (ellipse, hyperbola, parabola, foci): tag L2 and report it.
- Complex numbers, including exponential form $re^{i\theta}$: tag L33 and report it.
- Multiplying two Maclaurin series: L32.
- Average value of a function: no lesson teaches it; tag the lesson of the integration technique it needs and report it.
- Partial fractions with an irreducible quadratic factor alongside linear or repeated linear factors: L17 only. A question that mentions long division but asks only for a linear-factor coefficient: L16 only.
- A list of true/false statements about several convergence tests: tag the lesson of each test the statements use. Add L26 only when the question asks which test to choose.
- A plain $u$-substitution that needs no other technique (such as $\int_0^1 x^2e^{x^3}\,dx$): tag L11, whose key ideas say to use a substitution instead of parts when one works. When the substitution is only a step inside another lesson's technique (powers of sine and cosine, tan and sec, an improper integral), tag that lesson instead.
- A completed square in the sine or tangent case is L15 only.
- A secant substitution has no worked example: tag L14. If the radical must first be completed to $(x-a)^2-b^2$, tag L14 and L15, since both skills are tested.

Series of an integral: tag by the model series, and do not tag both.

- Integrating an integrand built from the Maclaurin table (sin, cos, $e^x$, arctan, ln), often after cancelling terms or dividing by a power of $x$: L32.
- Differentiating or integrating the geometric series to reach a closed form such as $\frac{1}{(1-x)^2}$ or a log, or asking how endpoints change: L30.
- Differentiating a given or tabled non-geometric series, with or without a substitution (such as $\sec^2(x^3)$ from the series for $\tan x$): L32.
- Building a Maclaurin series by substituting into, multiplying by a power of $x$, or adding series from the table, with no differentiation or integration (such as $x\cos x-\sin 3x$): L31.
- Building a power series from the geometric series by factoring the denominator to start with 1, substituting, and multiplying by a power of $x$, with no differentiation or integration (such as $\frac{x}{2+3x}$): L30.

`keyIdeas` is empty for L1 to L18 and L33 to L35, so settle splits by reading the lesson's `notesUrl` page with base64 images stripped.

## Finishing

1. `pnpm test src/content`, then `pnpm test && pnpm typecheck`.
2. Commit only `content/exams/<examId>.json`, `scripts/crops.json`, and `public/figures/<examId>/`, one commit per exam, with the message `Add <Term YYYY Exam N> questions and figures`.
3. In your report: a table of question, points, answer, lessons, figure yes or no; every doubt; every key disagreement.
