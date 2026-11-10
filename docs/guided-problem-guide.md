# Guided problem guide

How to write and check the "Check your understanding" problems on a lesson page, and how to map the lesson's flashcards to its problem types. One lesson at a time. Working files are under `.scratch/guided/<lessonId>/`.

A guided problem walks a student through one problem type a step at a time. At each step they choose from two to four options. A wrong choice shows a note saying why it is wrong and lets them choose again; the right one shows the step's explanation and reveals the next step. The finished page reads as a worked solution.

## Who writes and who checks

Both on Sonnet, in separate fresh contexts. A pilot on three lessons with Haiku writing gave correct mathematics, but two of eight problems were light renumberings of exam questions and the problems were short; the owner asked for fuller, more helpful problems on 2026-11-10.

## The steps for one lesson

1. `pnpm content:guided-prepare <lessonId>` writes `brief.json`: the lesson's key ideas, its problem types with how many exam questions each has, every exam question tagged to the lesson with its worked solution, and its flashcards.
2. The writer writes `draft.json`, following this guide.
3. The checker works every step without looking at the marked answers, then writes `final.json` (the corrected draft) and `review.json`.
4. `pnpm content:guided .scratch/guided/<lessonId>/final.json` writes `content/guided/<lessonId>.json` and sets the cards' `typeIds`.

## What to write

- **Two or three problems for the lesson**, each on a different problem type. Choose the types with the most exam questions in `brief.json`. Write three when the lesson has three or more types with at least five questions each; otherwise two.
- **Original.** Never reuse or lightly re-number an exam question from `brief.json`. Use different functions and numbers.
- **About the level of the easier exam questions of that type, but worked in full.** An exam question tests one result; a guided problem takes the student through the whole workflow for the type: recognise it, set it up, carry out each computation, check what needs checking, state the result. Choose numbers that keep the arithmetic short, so the length comes from the method and not from the algebra.
- **Multi-part where the type allows.** Prefer a problem whose later part builds on an earlier one: find the radius of convergence, then test each endpoint, then state the interval; set up the integral, evaluate it, then say what changes if the axis moves; find the series, then use it to approximate a value. A second part must belong to the same problem type or lean only on earlier lessons. Do not pad a type that is truly one move.
- **Aimed at what students get wrong.** `brief.json` gives each exam question's solution, and many end by naming the trap. Build the steps and the wrong choices around those traps.
- **No figures.** Describe any region or curve in words.

## Shape of a problem

```json
{
  "id": "L25-g1",
  "lessonId": "L25",
  "typeId": "L25-ratio-apply",
  "stem": "Markdown: the problem as a student would meet it.",
  "steps": [
    {
      "prompt": "Markdown: one question about the next move.",
      "choices": [
        { "label": "A", "text": "A wrong option", "note": "Why it is wrong." },
        { "label": "B", "text": "The right option" },
        { "label": "C", "text": "Another wrong option", "note": "Why it is wrong." }
      ],
      "answer": "B",
      "explanation": "Markdown: the working for this step, shown once it is answered."
    }
  ],
  "takeaway": "One line: the habit to carry to the next problem of this type."
}
```

Ids are the lesson id, `-g`, and 1, 2 or 3.

## Steps

- **Five to eight steps.** Four is accepted only when the type has no more to it. Each step is one decision or computation a student really faces: which method or test, how to set it up, what each key computation gives, what must be checked, what the result means. Do not skip a stage a student would have to write on paper, and do not split one line of arithmetic into two steps to reach the count. The last step reaches the final answer to the stem.
- **A multi-part stem labels its parts** "(a)", "(b)" in the stem, and each prompt says which part it belongs to when that is not obvious.
- **Each step stands on the ones before it.** Earlier steps and their explanations stay on screen, so a prompt may refer to them ("With that ratio, ..."). A prompt must never give away the answer to its own step or need something from a later one.
- **Two to four choices**, labelled A, B, C, D in order. Vary which label is right from step to step.
- **Exactly one choice is right.** Check that no wrong choice is also defensible.
- **Wrong choices are the classic mistakes** for that step: the dropped factor, the wrong endpoint, the test that does not apply, the sign error. A wrong value should be what that mistake actually produces. No joke options.
- **Choices are short**: a formula, a value or a phrase, not a paragraph.

## Notes and explanations

- **A note says why that choice is wrong** in one or two sentences, and points at the idea to revisit. It must not state the right answer or name the right choice: the student is about to choose again.
- **Every note must be true.** If it says a mistake gives a certain value, that value must be what the mistake gives.
- **The explanation shows the full working for the step**, two to six short lines, as it would be written on paper, ending with the result the next step builds on. Read in order, the stem and the explanations form a complete worked solution with nothing left out.
- **The takeaway** is one sentence, a habit and not a summary of this problem: "Check the endpoints separately; the ratio test says nothing when the limit is 1."

## Checking the mathematics

Work every step yourself. Where a result is a number, confirm it with a short computation in Python or Node (plain Python; scipy and sympy are not installed): evaluate the integral numerically, sum the series, compute the limit at a large index. Confirm each wrong value named in a choice or note the same way.

## Writing and formatting

The same rules as `docs/solution-writing-guide.md`:

- Plain, present tense, as a tutor at a whiteboard. No "you", and no "we" beyond "we get".
- Inline math in `$...$`. Display math in a `$$` fence with `$$` alone on its own line before and after, and a blank line around the block. Choice text uses inline math only.
- No dollar sign directly before a digit after closing math.
- No headings, tables, images, HTML or code blocks.
- In JSON, every backslash is doubled.
- Never refer to a choice by its letter in a prompt, note, explanation or takeaway.

## Flashcards and problem types

For each flashcard in `brief.json`, list the problem types it directly supports: knowing the card is a real help with a question of that type. Most cards support one type, some two, and a card about a general fact or a type the lesson does not list supports none. Every type should end up with at least one card where the lesson has a card for it; do not stretch a card to fill a gap.

## The writer's task

Given a lesson id:

1. Read this guide and `.scratch/guided/<lessonId>/brief.json`.
2. Write the problems and the card mapping to `.scratch/guided/<lessonId>/draft.json`:

```json
{
  "lessonId": "L25",
  "guided": [],
  "cardTypes": { "L25-c01": ["L25-ratio-apply"], "L25-c02": [] }
}
```

3. Confirm with node that the file parses, that `cardTypes` has an entry for every card, and run `pnpm -s content:guided .scratch/guided/<lessonId>/draft.json --check`, which validates the file without writing anything. Fix whatever it reports.
4. Modify no other file. Report one line per problem (its type and what it asks), and anything uncertain.

## The checker's task

Given a lesson id:

1. Read this guide, then `brief.json` and `draft.json`.
2. **Work each problem blind.** For each step, cover the `answer`, the notes and the explanation: read only the stem, the earlier steps, the prompt and the choice texts, decide which choice is right and why each other is wrong, and confirm numbers by computation. Only then compare with the draft.
3. Judge each problem against this guide. In particular:
   - every step has exactly one right choice, and it is the marked one;
   - every note and explanation is true, and no note gives the answer away;
   - the steps follow from one another and end at the answer to the stem;
   - the problem is original (compare it with every exam stem in `brief.json`), at the level of the easier exam questions, and worked in full: no stage a student would write is missing, and no step is padding;
   - the wrong choices are real mistakes, not filler;
   - the type fits, and the formatting rules are met.
4. Judge the card mapping card by card.
5. Write `final.json` in the same shape as the draft, with your corrections made. Rewrite a step or a whole problem if that is what it takes; drop nothing silently. Run `pnpm -s content:guided .scratch/guided/<lessonId>/final.json --check` and fix what it reports.
6. Write `review.json`:

```json
{
  "lessonId": "L25",
  "problems": [
    { "id": "L25-g1", "verdict": "pass", "check": "What was recomputed and how.", "changes": "" }
  ],
  "cardChanges": "Which card mappings were changed and why, or none.",
  "escalate": null
}
```

`verdict` is `pass` (unchanged), `fix` (corrected; say what in `changes`) or `rewrite` (replaced; say why). `escalate` is for anything the owner must decide; otherwise null. A problem with an empty `check` is not accepted.

7. Modify no other file. Report the verdicts, each change in a line, and the escalations.
