import fs from 'node:fs'
import path from 'node:path'
import katex from 'katex'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { Markdown } from '../ui/Markdown'
import { loadContent } from './load'
import { CHOICE_LABELS, isPlanned } from './schema'

/**
 * Extract math the way remark-math pairs dollars. `\$` is a literal dollar only outside math. Inside
 * `$...$` the next `$` always closes, so `$\$5$` is the fragment `\`, which fails KaTeX as it does on the
 * page. Display fragments come first, then inline ones.
 */
export function extractMath(text: string): { fragment: string; displayMode: boolean }[] {
  const display: { fragment: string; displayMode: boolean }[] = []
  const inline: { fragment: string; displayMode: boolean }[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
    } else if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2)
      if (end === -1) break // an unclosed fence is reported by checkDisplayMathFences
      if (end > i + 2) display.push({ fragment: text.slice(i + 2, end), displayMode: true })
      i = end + 2
    } else if (text[i] === '$') {
      const close = closingDollar(text, i)
      if (close === -1) {
        i += 1 // an unpaired dollar is reported by checkDollarPairs
      } else {
        inline.push({ fragment: text.slice(i + 1, close), displayMode: false })
        i = close + 1
      }
    } else {
      i += 1
    }
  }
  return [...display, ...inline]
}

/** Index of the `$` closing the inline math opened at `open`, or -1 if none on the same line. */
function closingDollar(text: string, open: number): number {
  for (let j = open + 1; j < text.length && text[j] !== '\n'; j++) {
    if (text[j] === '$') return j
  }
  return -1
}

/** Render every math fragment; throws with the owning id and fragment on failure. */
export function checkMath(ownerId: string, text: string): void {
  for (const { fragment, displayMode } of extractMath(text)) {
    try {
      katex.renderToString(fragment, { throwOnError: true, displayMode })
    } catch (e) {
      throw new Error(`KaTeX failed in ${ownerId}: ${JSON.stringify(fragment)}: ${(e as Error).message}`, { cause: e })
    }
  }
}

/**
 * Display math must be `$$` alone on its own line: remark-math renders a one-line `$$...$$` inline.
 * The fence must also not be indented four spaces or a tab, which Markdown reads as code.
 */
export function checkDisplayMathFences(ownerId: string, text: string): void {
  const lines = text.split('\n')
  const bad = lines.find((line) => line.includes('$$') && line.trim() !== '$$')
  if (bad !== undefined) throw new Error(`Display math in ${ownerId} is not fenced: ${JSON.stringify(bad)}`)
  // four spaces of indentation make an indented code block, which shows the raw TeX
  const indented = lines.find((line) => line.trim() === '$$' && /^ {4,}|^\t/.test(line))
  if (indented !== undefined) {
    throw new Error(`Display math indented as code in ${ownerId}: ${JSON.stringify(indented)}`)
  }
  if (lines.filter((line) => line.includes('$$')).length % 2 !== 0) {
    throw new Error(`Display math in ${ownerId} has an unclosed $$ fence`)
  }
}

/**
 * Fail on dollars that cannot pair as intended: an odd count of unescaped `$` on a line, a pair with a
 * space just inside it, as in `$5 and $10`, or a closing `$` right before a digit, as in `$5+$10`. Those
 * last two have an even count and would otherwise pass as the math `5 and ` or `5+`. Write a dollar amount
 * as `\$5`.
 */
export function checkDollarPairs(ownerId: string, text: string): void {
  for (const line of text.split('\n')) {
    let misPaired = false
    let i = 0
    while (i < line.length) {
      if (line[i] === '\\') {
        i += 2
      } else if (line[i] === '$') {
        const close = closingDollar(line, i)
        if (close === -1) throw new Error(`Odd number of unescaped $ in ${ownerId}: ${JSON.stringify(line)}`)
        const fragment = line.slice(i + 1, close)
        if (fragment !== '' && fragment.trim() !== fragment) misPaired = true
        if (/\d/.test(line[close + 1] ?? '')) misPaired = true
        i = close + 1
      } else {
        i += 1
      }
    }
    if (misPaired) throw new Error(`Mis-paired $ in ${ownerId}: ${JSON.stringify(line)}`)
  }
}

/** Every exam in the archive runs 60 or 120 minutes, so this only catches a mistyped duration. */
export function checkDuration(ownerId: string, minutes: number): void {
  if (minutes < 30 || minutes > 180) throw new Error(`Duration of ${ownerId} is ${minutes} minutes, outside 30 to 180`)
}

const content = loadContent()

/** Set to true in Phase 6, when every question has its solution and problem type. */
const CONTENT_COMPLETE = false

/** Every string in the content files that is rendered as Markdown, with the id that owns it. */
function markdownStrings(): [string, string][] {
  return [
    ...content.lessons.map((l): [string, string] => [l.id, l.keyIdeas]),
    ...content.cards.flatMap((c): [string, string][] => [
      [`${c.id}.front`, c.front],
      [`${c.id}.back`, c.back],
    ]),
    ...content.questions.flatMap((q): [string, string][] => [
      [`${q.id}.stem`, q.stem],
      ...q.choices.map((ch): [string, string] => [`${q.id}.${ch.label}`, ch.text]),
      ...(q.solution ? [[`${q.id}.solution`, q.solution] as [string, string]] : []),
    ]),
  ]
}

describe('content validation', () => {
  test('lesson numbers are unique and L1..L35 exist', () => {
    const numbers = content.lessons.map((l) => l.number)
    expect(new Set(numbers).size).toBe(numbers.length)
    for (let i = 1; i <= 35; i++) expect(content.lessonById.has(`L${i}`)).toBe(true)
  })

  test('prerequisites exist', () => {
    for (const l of content.lessons) {
      for (const p of l.prerequisites) expect(content.lessonById.has(p), `${l.id} -> ${p}`).toBe(true)
    }
  })

  test('card lessonIds exist', () => {
    for (const c of content.cards) expect(content.lessonById.has(c.lessonId), c.id).toBe(true)
  })

  test('no duplicate ids across lessons, cards, questions', () => {
    const ids = [
      ...content.lessons.map((l) => l.id),
      ...content.cards.map((c) => c.id),
      ...content.questions.map((q) => q.id),
    ]
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  test('questions are well formed', () => {
    for (const q of content.questions) {
      const n = q.choices.length
      expect(n >= 2 && n <= 10, `${q.id} has ${n} choices`).toBe(true)
      expect(q.choices.map((c) => c.label), q.id).toEqual(CHOICE_LABELS.slice(0, n))
      expect(q.choices.map((c) => c.label), q.id).toContain(q.answer)
      for (const lid of q.lessonIds) expect(content.lessonById.has(lid), `${q.id} -> ${lid}`).toBe(true)
      for (const fig of q.figures ?? []) {
        expect(fs.existsSync(path.join(process.cwd(), 'public', fig)), `${q.id} figure ${fig}`).toBe(true)
      }
    }
  })

  test('exams are well formed', () => {
    for (const e of content.exams) {
      e.questions.forEach((q, i) => expect(q.number, `${e.id} #${i + 1}`).toBe(i + 1))
      checkDuration(e.id, e.durationMinutes)
    }
  })

  test('each exam id is its filename and spells its term, year, and exam', () => {
    const dir = path.join(process.cwd(), 'content', 'exams')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    expect(files).toHaveLength(content.exams.length)
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as { id: string }
      expect(raw.id, file).toBe(file.replace(/\.json$/, ''))
    }
    for (const e of content.exams) {
      if (e.unofficial) {
        // written for this app: xp-<exam>-<version>, titled as extra practice so no one mistakes it for Purdue's
        expect(e.id).toMatch(/^xp-e[123]-[a-z]$/)
        expect(e.title).toMatch(/^Extra Practice /)
        continue
      }
      const expected = `${e.term === 'Fall' ? 'f' : 's'}${e.year}-${e.exam === 'final' ? 'final' : `e${e.exam}`}`
      expect(e.id, `${e.id} is ${e.term} ${e.year} ${e.exam}`).toBe(expected)
    }
  })

  test('question ids are <examId>-qNN with NN the question number', () => {
    for (const e of content.exams) {
      for (const q of e.questions) expect(q.id).toBe(`${e.id}-q${String(q.number).padStart(2, '0')}`)
    }
  })

  test('no question repeats a choice, apart from the two the papers themselves print twice', () => {
    // checked against the source pages: Fall 2024 Exam 1 Q9 prints B and C alike, Fall 2017 Final Q15 prints B and D alike
    const printedTwice = new Set(['f2024-e1-q09', 'f2017-final-q15'])
    const repeats = content.questions
      .filter((q) => new Set(q.choices.map((c) => c.text.trim())).size !== q.choices.length)
      .map((q) => q.id)
    expect(repeats.sort()).toEqual([...printedTwice].sort())
    for (const id of printedTwice) {
      const q = content.questionById.get(id)!
      const answer = q.choices.find((c) => c.label === q.answer)!.text.trim()
      // the repeated text is never the keyed answer, so the question still has one right choice
      expect(q.choices.filter((c) => c.text.trim() === answer), id).toHaveLength(1)
    }
  })
  test('problem types: ids are unique and carry their lesson, and tags point at real types of the right lesson', () => {
    const owner = new Map<string, string>()
    for (const l of content.lessons) {
      for (const t of l.problemTypes ?? []) {
        expect(owner.has(t.id), `duplicate type ${t.id}`).toBe(false)
        expect(t.id.startsWith(`${l.id}-`), t.id).toBe(true)
        expect(t.name.trim().split(/\s+/).length, `${t.id} name`).toBeLessThanOrEqual(6)
        owner.set(t.id, l.id)
      }
    }
    for (const q of content.questions) {
      for (const tid of q.typeIds ?? []) expect(q.lessonIds, `${q.id} type ${tid}`).toContain(owner.get(tid))
      expect(new Set(q.typeIds ?? []).size, `${q.id} repeats a type`).toBe((q.typeIds ?? []).length)
    }
    for (const c of content.cards) {
      for (const tid of c.typeIds ?? []) expect(owner.get(tid), `${c.id} type ${tid}`).toBe(c.lessonId)
    }
  })
  test('once the taxonomy is in, every planned lesson has two to five types, every extra one, and reviews none', () => {
    if (content.typeById.size === 0) return
    for (const l of content.lessons) {
      const n = (l.problemTypes ?? []).length
      if (l.isReview) expect(n, l.id).toBe(0)
      else if (l.isExtra) expect(n, l.id).toBe(1)
      else {
        expect(n, l.id).toBeGreaterThanOrEqual(2)
        expect(n, l.id).toBeLessThanOrEqual(5)
      }
    }
  })
  // These hold only when the content pass is finished; see docs/plans/2026-11-10-study-app-2.0.md, Phase 6.
  describe.runIf(CONTENT_COMPLETE)('complete content', () => {
    test('every question has a solution and a problem type', () => {
      for (const q of content.questions) {
        expect(q.solution?.trim(), `${q.id} solution`).toBeTruthy()
        expect(q.typeIds?.length, `${q.id} types`).toBeGreaterThan(0)
      }
    })
    test('every problem type of a planned lesson has at least three questions', () => {
      for (const l of content.lessons.filter(isPlanned)) {
        for (const t of l.problemTypes ?? []) {
          expect((content.questionsByType.get(t.id) ?? []).length, t.id).toBeGreaterThanOrEqual(3)
        }
      }
    })
  })
  test('every question has been reviewed', () => {
    expect(content.questions.filter((q) => q.status !== 'reviewed').map((q) => q.id)).toEqual([])
  })

  test('the two Extra Practice Exam 3s have 12 questions each on lessons L20 to L27', () => {
    const extras = content.exams.filter((e) => e.unofficial)
    expect(extras.map((e) => e.id)).toEqual(['xp-e3-a', 'xp-e3-b'])
    const allowed = new Set(Array.from({ length: 8 }, (_, i) => `L${20 + i}`))
    for (const e of extras) {
      expect(e.questions, e.id).toHaveLength(12)
      for (const q of e.questions) {
        expect(q.choices, q.id).toHaveLength(5)
        expect(q.solution, q.id).toBeTruthy()
        for (const lid of q.lessonIds) expect(allowed.has(lid), `${q.id} -> ${lid}`).toBe(true)
      }
    }
  })

  test('derived answers appear on every question of the six exams with no key, written ones on extra practice, and nowhere else', () => {
    const noKey = new Set(['f2023-e2', 'f2023-e3', 'f2023-final', 's2023-final', 'f2022-e2', 'f2022-e3'])
    for (const e of content.exams) {
      for (const q of e.questions) {
        expect(q.answerSource, q.id).toBe(e.unofficial ? 'written' : noKey.has(e.id) ? 'derived' : undefined)
      }
    }
  })

  test('questions are tagged with planned lessons or one extra topic, never a review; cards only with planned lessons', () => {
    const planned = new Set(Array.from({ length: 35 }, (_, i) => `L${i + 1}`))
    const extras = new Set(content.lessons.filter((l) => l.isExtra).map((l) => l.id))
    for (const q of content.questions) {
      expect(q.lessonIds.length, q.id).toBeGreaterThan(0)
      const extraTags = q.lessonIds.filter((lid) => extras.has(lid))
      if (extraTags.length > 0) {
        // an off-syllabus question is attributed to its topic alone, so it never lowers a lesson's mastery
        expect(q.lessonIds, q.id).toEqual(extraTags.slice(0, 1))
      } else {
        for (const lid of q.lessonIds) expect(planned.has(lid), `${q.id} -> ${lid}`).toBe(true)
      }
    }
    for (const c of content.cards) expect(planned.has(c.lessonId), `${c.id} -> ${c.lessonId}`).toBe(true)
  })

  test('the four extra topics hold the off-syllabus questions found in the audit', () => {
    const count = (id: string) => content.questions.filter((q) => q.lessonIds.includes(id)).length
    expect(content.lessons.filter((l) => l.isExtra).map((l) => l.id)).toEqual(['X1', 'X2', 'X3', 'X4'])
    expect([count('X1'), count('X2'), count('X3'), count('X4')]).toEqual([12, 6, 5, 1])
  })

  test('all Markdown renders through KaTeX', () => {
    for (const [id, text] of markdownStrings()) checkMath(id, text)
  })

  test('all dollars pair up on each line', () => {
    for (const [id, text] of markdownStrings()) checkDollarPairs(id, text)
  })

  test('all display math is fenced on its own lines', () => {
    for (const [id, text] of markdownStrings()) checkDisplayMathFences(id, text)
  })
})

describe('display math fence indentation', () => {
  test('a $$ fence indented four or more spaces is rejected, since Markdown reads it as code', () => {
    expect(() => checkDisplayMathFences('Q1.stem', 'Find\n\n    $$\n    x^2\n    $$\n')).toThrow(
      /indented.*Q1\.stem/,
    )
  })
  test('a fence indented under a list item is accepted', () => {
    expect(() => checkDisplayMathFences('Q2.stem', '- item\n\n  $$\n  x^2\n  $$\n')).not.toThrow()
  })
})

describe('checkDuration', () => {
  test.each([30, 60, 75, 120, 180])('accepts %d minutes for any exam', (minutes) => {
    expect(() => checkDuration('f2024-e1', minutes)).not.toThrow()
  })
  test.each([0, 29, 181, 6000])('rejects %d minutes and names the exam', (minutes) => {
    expect(() => checkDuration('f2024-e1', minutes)).toThrow(/f2024-e1/)
  })
})

describe('checkMath', () => {
  test('accepts valid inline and display math', () => {
    expect(() => checkMath('x', 'a $x^2$ and $$\\int_0^1 x\\,dx$$ done')).not.toThrow()
  })
  test('extracts display math before inline', () => {
    expect(extractMath('$$a$$ $b$')).toEqual([
      { fragment: 'a', displayMode: true },
      { fragment: 'b', displayMode: false },
    ])
  })
  test('reports owner id and fragment on failure', () => {
    expect(() => checkMath('Q9.stem', 'bad $\\frac{1$ here')).toThrow(/Q9\.stem.*\\\\frac\{1/)
  })
  test('extracts a multi-line $$ block as one display fragment', () => {
    expect(extractMath('before\n\n$$\n\\sum_{k=1}^{\\infty} a_k\n$$\n\nafter $b$')).toEqual([
      { fragment: '\n\\sum_{k=1}^{\\infty} a_k\n', displayMode: true },
      { fragment: 'b', displayMode: false },
    ])
  })
  test('accepts a valid multi-line $$ block', () => {
    expect(() => checkMath('L1.keyIdeas', 'before\n\n$$\n\\frac{1}{2}\n$$\n\nafter')).not.toThrow()
  })
  test('a broken multi-line $$ block fails and names the owner', () => {
    expect(() => checkMath('L1.keyIdeas', 'before\n\n$$\n\\frac{1}{\n$$\n\nafter')).toThrow(/KaTeX failed in L1\.keyIdeas/)
    expect(() => checkMath('L2.keyIdeas', '$$\n\\notacommand{x}\n$$')).toThrow(/KaTeX failed in L2\.keyIdeas/)
  })
})

describe('escaped and unpaired dollars', () => {
  test('a dollar amount written with \\$ is text, and later math still pairs', () => {
    expect(extractMath('costs \\$5 and $x^2$ here')).toEqual([{ fragment: 'x^2', displayMode: false }])
    expect(extractMath('costs \\$5 and \\$10')).toEqual([])
  })
  test('an escaped backslash does not escape the dollar after it', () => {
    expect(extractMath('\\\\$x$ end')).toEqual([{ fragment: 'x', displayMode: false }])
  })
  test('inside math the next $ closes, even after a backslash, so KaTeX rejects it', () => {
    expect(extractMath('$\\$5$ today')[0]).toEqual({ fragment: '\\', displayMode: false })
    expect(() => checkMath('Q5.stem', '$\\$5$ today')).toThrow(/KaTeX failed in Q5\.stem/)
  })
  test.each([
    'costs \\$5 and $x^2$ here',
    'costs \\$5 and \\$10',
    '\\\\$x$ end',
    '$a \\\\$ end',
    '$x$ and $y$',
    '$x$ and \\$y',
  ])('extraction agrees with the rendered page: %s', (text) => {
    const html = renderToStaticMarkup(createElement(Markdown, { text }))
    const rendered = [...html.matchAll(/<annotation[^>]*>([\s\S]*?)<\/annotation>/g)].map((m) => m[1])
    expect(extractMath(text).map((m) => m.fragment)).toEqual(rendered)
  })
  test('rejects an odd count of unescaped $ and names the owner', () => {
    expect(() => checkDollarPairs('Q6.stem', 'costs $5 and $x^2$ here')).toThrow(/Odd number.*Q6\.stem/)
    expect(() => checkDollarPairs('Q7.stem', 'Let $\\frac{1}{2} be')).toThrow(/Odd number.*Q7\.stem/)
    expect(() => checkDollarPairs('Q8.stem', '$\\$5$ today')).toThrow(/Odd number.*Q8\.stem/)
  })
  test('counts each line separately', () => {
    expect(() => checkDollarPairs('Q9.stem', 'first $x\nsecond y$')).toThrow(/Odd number.*Q9\.stem/)
  })
  test('rejects an even count that pairs across text', () => {
    expect(() => checkDollarPairs('Q10.stem', 'costs $5 and $10')).toThrow(/Mis-paired.*Q10\.stem/)
  })
  test.each(['$5+$10', '$5-$10', '$5/$10', '$5,$10'])('rejects a closing $ right before a digit: %s', (line) => {
    expect(() => checkDollarPairs('Q11.stem', `costs ${line} total`)).toThrow(/Mis-paired.*Q11\.stem/)
  })
  test('accepts a digit after a closing $ once anything separates them', () => {
    expect(() => checkDollarPairs('x', 'then $x$ 2 and $y$, 3')).not.toThrow()
    expect(() => checkDollarPairs('x', '$x^2$ and $2$')).not.toThrow()
  })
  test('accepts escaped dollars, paired math, and display fences', () => {
    expect(() => checkDollarPairs('x', 'costs \\$5 and \\$10')).not.toThrow()
    expect(() => checkDollarPairs('x', 'costs \\$5 and $x^2$ here\n\n$$\n\\frac{1}{2}\n$$\n')).not.toThrow()
    expect(() => checkDollarPairs('x', '$a \\\\$ then $b$')).not.toThrow()
  })
})

describe('checkDisplayMathFences', () => {
  test('accepts fenced blocks, inline math, and text without math', () => {
    expect(() => checkDisplayMathFences('x', 'a $b$\n\n$$\nc\n$$\n\n  $$\n  d\n  $$\n')).not.toThrow()
    expect(() => checkDisplayMathFences('x', 'plain')).not.toThrow()
  })
  test('rejects a one-line $$ block and names the owner', () => {
    expect(() => checkDisplayMathFences('Q1.stem', 'Find\n\n$$x^2$$')).toThrow(/Q1\.stem.*x\^2/)
  })
  test('rejects a formula on the same line as a fence', () => {
    expect(() => checkDisplayMathFences('Q2.stem', '$$x\n+ y\n$$')).toThrow(/Q2\.stem/)
    expect(() => checkDisplayMathFences('Q3.stem', '$$\nx\n+ y$$')).toThrow(/Q3\.stem/)
  })
  test('rejects an unclosed fence, which extractMath would never see', () => {
    expect(extractMath('$$\n\\frac{1}{\n')).toEqual([])
    expect(() => checkDisplayMathFences('Q4.stem', '$$\n\\frac{1}{\n')).toThrow(/Q4\.stem.*unclosed/)
  })
})
