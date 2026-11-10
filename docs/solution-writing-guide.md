# Solution writing guide

How to write the worked solution and choose the problem types for an exam question. It applies to every question in `content/exams/` that has no `solution` yet. A question that already has one keeps it word for word and only gains its problem types.

## Who writes and who checks

Decided by a pilot on 2026-11-10 (`f2018-e1`, 12 questions): solutions are drafted by Haiku and checked by Sonnet in a fresh context. Haiku's drafts passed the check on 12 of 12 with a mean teaching quality of 4.9 out of 5; Sonnet's own drafts passed on 10 of 12 with 3.9, the two faults being wrong closing sentences. The pilot covered only Exam 1 material, so the rejection rate on series and Taylor questions is watched in the first batch, and an exam whose drafts are rejected often is redrafted on Sonnet.

The steps for one exam, with its files under `.scratch/solutions/<examId>/`:

1. `pnpm content:prepare <examId>` writes `questions-no-key.json`.
2. The drafter writes `draft.json`, following this guide.
3. The checker first solves `questions-no-key.json` without the key or the draft and writes `blind.json`. It then reads the key and the draft and writes `grades.json`: for each question a verdict of pass, fix (with the corrected text) or reject, and an `escalate` reason for anything the owner must see.
4. `pnpm content:collect <examId>` writes `final.json`, the records safe to merge, and `escalations.json`.
5. `pnpm content:solutions .scratch/solutions/<examId>/final.json` merges them into the exam file.

## The drafter's task

Given an exam id:

1. Read this guide, then `docs/problem-types.md` for the lessons the exam's questions are tagged to, then `content/exams/<examId>.json`. For a question that lists `figures`, read the image at `public/<path>` before solving.
2. For every question, solve it, write the solution, and choose its problem types. A question that already has a `solution` in the exam file gets `"solution": ""` and only its types.
3. Write one record per question, in question order, to `.scratch/solutions/<examId>/draft.json`, and confirm with node that the file parses and has one record per question.
4. Modify no other file and read no other file in that directory.
5. Report one line per flagged question, or "no flags".

Six exams have no official key (`f2022-e2`, `f2022-e3`, `f2023-e2`, `f2023-e3`, `f2023-final`, `s2023-final`), and the two `xp-` exams were written for this app. Their stored answers were worked out independently and are probably right but not certain, so be especially careful to flag a question where your own answer differs.

## Inputs

- The exam file, `content/exams/<examId>.json`: each question's `stem`, `choices`, keyed `answer`, `lessonIds` and `figures`.
- The figure images under `public/`, for a question that lists `figures`. Read the image before solving.
- The problem types, in `docs/problem-types.md`.
- This guide.

## Output

One JSON file per exam, an array with one record for each question:

```json
[
  {
    "questionId": "f2018-e1-q01",
    "solution": "Markdown with LaTeX",
    "typeIds": ["L4-area-from-points"]
  }
]
```

Add `"flag": "<one sentence>"` to a record when something is wrong (see Flags). Records are merged into the exam files with `pnpm content:solutions <file>`.

## The solution

A student reads it straight after getting the question wrong. It must let them redo the problem on paper.

1. **Solve the problem yourself first**, from the stem alone. Then compare with the keyed answer. Never work backwards from the key to a justification.
2. **Open with the method**: the formula, test or technique, in one short sentence. "Use shells, since the region is revolved about the $y$-axis." "Apply the ratio test."
3. **Show every step a student would write.** No "it can be shown" and no skipped algebra that hides the idea. Routine arithmetic can be combined on one line.
4. **End by stating the result as a value or statement**, such as "so the area is $2\sqrt{2}$" or "so the series converges conditionally". Never mention a choice letter, and never say "the answer is C": the app shows which choice is correct.
5. **Length**: three to eight short lines for most questions. A multi-part question ("which of these series converge?") gets one or two lines per part.
6. **For a "which statements are true" question**, deal with each statement in turn, giving the reason or a counterexample for each.
7. **Name the trap** in a closing sentence when the wrong choices are built on a classic mistake, such as forgetting the factor $\frac12$ or testing only one endpoint. One sentence, and only when there is a real trap.

Write plainly, in the present tense, as a tutor would at a whiteboard. Address nobody: no "you" and no "we" beyond the conventional "we get".

## Formatting

The same rules as `docs/exam-transcription-guide.md`:

- Inline math in `$...$`. Display math in a `$$` fence with `$$` alone on its own line before and after.
- A blank line before and after each display block.
- No dollar sign directly before a digit after closing math; write `$5$ and $10$`, not `$5+$10`.
- LaTeX as in the existing solutions: `\frac`, `\sqrt`, `\int_a^b`, `\sum_{n=1}^{\infty}`, `\langle 1, 2, 3 \rangle`, `\vec{u}`.
- No headings, tables, images, HTML or code blocks. Short lists are fine for part-by-part questions.
- In JSON, every backslash is doubled: `"$\\frac{1}{2}$"`.

## Problem types

- Choose one type from `docs/problem-types.md`: the one whose "What the question asks" line best matches what the student must do.
- Add a second type only when the question truly needs two separate skills, each of which could be missed on its own. Most questions have one.
- Each type must belong to one of the question's own `lessonIds`. The lesson is the part of the type id before the first hyphen.
- If the question clearly belongs in a lesson it is not tagged to, do not use that lesson's type. Choose the best type from its current lessons and flag it.

## Flags

Add a `flag` and keep going. A flagged record is not merged until someone has looked at it.

- **Your answer differs from the key.** Write the solution you believe is right, and say in the flag what you got and what the key says. Do not bend the working to reach the key.
- **The question looks mistranscribed or cannot be solved as written.**
- **The question fits a lesson it is not tagged to.** Name the lesson.
- **No listed type fits.** Choose the nearest and say what is missing.

Questions with a note in the transcription guide's "Known exceptions" (a key that accepts every choice, a printed typo kept on purpose) are not errors. Solve them as printed and mention the oddity in the solution only if a student would trip over it.

## Worked examples

A computation, from `f2016-e1-q03`:

> $\overrightarrow{PQ} = Q - P = \langle 1, -1, -1 \rangle$ and $\overrightarrow{PR} = R - P = \langle -1, 1, -3 \rangle$. The area of the triangle is $\frac{1}{2}|\overrightarrow{PQ} \times \overrightarrow{PR}|$.
>
> $$
> \overrightarrow{PQ} \times \overrightarrow{PR} = \begin{vmatrix} \vec{i} & \vec{j} & \vec{k} \\ 1 & -1 & -1 \\ -1 & 1 & -3 \end{vmatrix} = 4\vec{i} + 4\vec{j}
> $$
>
> $|\overrightarrow{PQ} \times \overrightarrow{PR}| = \sqrt{16 + 16} = 4\sqrt{2}$, so the area of the triangle is $2\sqrt{2}$.

Type: `L4-area-from-points`.

A convergence question with a trap, written for this guide:

> Apply the alternating series test to $\sum_{n=1}^{\infty} \frac{(-1)^n}{\sqrt{n}}$. The terms $\frac{1}{\sqrt{n}}$ are positive, decreasing, and tend to $0$, so the series converges.
>
> For absolute convergence, look at $\sum \frac{1}{\sqrt{n}}$, a $p$-series with $p = \frac12 \le 1$, which diverges.
>
> So the series converges conditionally. Stopping after the alternating series test gives "converges" without saying which kind.
