# Solution checking guide

How to check the drafted solutions for one exam. The checker is independent of the drafter: it solves every question itself before it sees the key or the draft. All files for the exam are under `.scratch/solutions/<examId>/`.

The checker writes only `blind.json` and `grades.json`, and modifies nothing else.

Six exams have no official key (`f2022-e2`, `f2022-e3`, `f2023-e2`, `f2023-e3`, `f2023-final`, `s2023-final`), and the two `xp-` exams were written for this app. Their stored answers may be wrong. Where your blind answer differs from the stored one and you still believe yours after reworking, escalate with your working.

## Step 1: solve blind

Read only `questions-no-key.json`, and the figure images it lists. Do not open `content/exams/`, `draft.json`, or anything else about this exam yet.

Work every question fully. Where a numeric check is possible, run one in Python or Node: evaluate the integral numerically, sum the first terms of the series, compute the cross product. Then choose the letter your result matches.

Write `blind.json`, one record per question, before going on to step 2:

```json
{ "questionId": "f2025-e3-q01", "answer": "C", "value": "your result in words", "confidence": "high" }
```

`confidence` is `high`, `medium` or `low`. If no choice matches your result, write `"answer": "none"`. Do not pick a letter to make it fit.

## Step 2: grade the draft

Now read:

- `content/exams/<examId>.json`, for each question's keyed `answer` and `lessonIds`;
- `docs/solution-writing-guide.md`, the rules the draft was written to;
- `docs/problem-types.md`, for the lessons this exam's questions are tagged to;
- `draft.json`. If it does not exist yet, run `sleep 60` and look again, up to fifteen times.

Do not change `blind.json` after this point.

For each question give a verdict:

- **pass**: every step is correct, the working reaches the keyed answer's value, the guide is followed, and the types are a sensible choice from the question's own lessons.
- **fix**: usable after a small correction, such as a slip in one step, a wrong or muddled closing sentence, a formatting fault, a missing final statement, or a poor type choice. Give the complete corrected solution in `fixedSolution`, the corrected types in `fixedTypeIds`, or both.
- **reject**: the reasoning is wrong, it reaches a different value, a wrong step is hidden, or it would mislead a student. Say why.

Check each line of algebra, not just the last. A solution that states the right value after a wrong intermediate step is never a pass. Check the closing "trap" sentence as carefully as the working: a false statement there is a fix.

A question that already had a solution in the exam file has an empty `solution` in the draft. Grade only its types, and pass it unless they are wrong.

### When answers disagree

- **Your blind answer differs from the key.** Rework the question with the key in view. If you made a slip, say so in `reason` (it must not be left empty, or the question is held) and grade the draft normally. If you still believe the key or the transcription is wrong, set `escalate` with your working in a sentence or two.
- **The draft carries a `flag` saying its answer differs from the key.** Decide who is right in the same way. Escalate unless the draft is plainly the one in error, in which case reject it.

### Fields

`escalate` holds the question back for the owner. Use it for a suspected wrong key, a suspected transcription error, a question that cannot be solved as printed, or a draft you cannot repair with confidence. Otherwise leave it `null`.

`lessonNote` does not hold anything back. Use it when the question clearly belongs in a lesson it is not tagged to, naming the lesson, whether the draft flagged it or you noticed it.

`quality` rates the solution as teaching, from 1 to 5: 5 means a student could redo the problem from it, 1 means a bare answer. Rate the solution as it will be merged, after your fix if there is one.

Write `grades.json`:

```json
{
  "examId": "f2025-e3",
  "grades": [
    {
      "questionId": "f2025-e3-q01",
      "verdict": "pass",
      "quality": 5,
      "reason": "",
      "fixedSolution": null,
      "fixedTypeIds": null,
      "escalate": null,
      "lessonNote": null
    }
  ]
}
```

Every question of the exam has one entry. Before finishing, check that `blind.json` and `grades.json` parse as JSON and hold one record per question. In JSON, every backslash in LaTeX is doubled.

## Report

End with a short report: the counts of pass, fix and reject; each escalation with its reason; each question where your blind answer differed from the key and how it was settled; and the mean quality.
