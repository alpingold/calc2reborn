# Key Ideas and Card Writing Guide

How to write `keyIdeas` and flashcards for a lesson. `content/cards/L25.json`, `content/cards/L31.json`, and the `keyIdeas` of those lessons in `content/lessons.json` are the worked examples.

## Sources

Read every lesson's notes through `notesUrl` in `content/lessons.json`. Do not rely on a summarizing fetch: fetch the raw HTML with `curl -s` into a scratch folder and strip the base64 images before reading. The accessible HTML can drop strike-throughs and quote marks, so check the PDF linked from the page before saying the notes contain an error.

## Key ideas

One screen per lesson, about 25 to 45 lines, in Markdown with `###` headings and bullet lists. Cover definitions, formulas, exact conditions, and common traps. Match Chen's notation. Edit only the `keyIdeas` field, with a small script that loads, updates, and rewrites `content/lessons.json` with 2-space indent and a trailing newline.

## Cards

8 to 15 cards per lesson in `content/cards/L<N>.json`: a JSON array, 2-space indent, trailing newline. Ids are `L<N>-c01` onward. Each card has `id`, `lessonId`, `front`, `back`, and optional `tags`.

Do not reuse a question from `content/exams/` as a card, even with its wording changed. Use different numbers or a different setup, since seeing the answer on a card would spoil the exam question and distort the weakness tracking. Worked examples from Chen's notes are fine unless an exam repeats them.

The front is a question or prompt. The back is two to four sentences or a short formula block. No multiple choice. Mix recall, trap, and quick-decision or quick-compute cards. Tags are short lowercase strings, with `"trap"` on trap cards.

## Formatting (enforced by `pnpm test src/content`)

- Inline math is `$...$`. Display math is a three-line block: a line with only `$$`, the math, a line with only `$$`.
- Do not pad a `$` pair with spaces, and do not put a digit immediately after a closing `$`. Write a literal dollar outside math as `\$5`.
- KaTeX-supported LaTeX only, with no custom macros, `\displaystyle`, or `\[ \]`.

## Accuracy

Independent review has found false or misleading statements in these patterns, even when every worked result was right. Check each one.

- **Missing hypotheses.** State exactly what a theorem or formula requires. A bound stated beside a weaker condition is false.
- **"Always" and "never".** Try to break each one with a counterexample.
- **Limits that do not exist versus infinite limits.** Keep these separate where the conclusion differs.
- **Starting indices and first terms.** Say where a formula assumes a start, and check it.
- **Redefining a term against Chen.** Use his definition and note any extension separately.
- **Partial fixes.** After finishing, grep your content for each theorem or formula and check all statements agree.
- **Wrong direction of an inequality, sign errors, missing absolute values** such as $\int \frac{dx}{x} = \ln|x| + C$, and forgetting the constant of integration where it matters.

Where Chen's notes look wrong, work out the correct mathematics, write the correct version, and record the discrepancy in your report after checking the PDF. Do not silently follow the notes or silently differ from them. Leave out term-specific remarks such as "NOT on exam 3".

Check numeric claims by script wherever possible: integrals, cross products, angles, areas, and antiderivatives by differentiation or numeric quadrature.

## Finishing

Run `pnpm test && pnpm typecheck && pnpm build`. Stage only `content/lessons.json` and the card files. In your report give, per lesson: what the key ideas cover, card count, trap card ids, how the notes were read, discrepancies with Chen's notes, numeric checks, and doubts.
