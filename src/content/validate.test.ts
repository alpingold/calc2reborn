import fs from 'node:fs'
import path from 'node:path'
import katex from 'katex'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { Markdown } from '../ui/Markdown'
import { loadContent } from './index'
import { CHOICE_LABELS } from './schema'

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
      throw new Error(`KaTeX failed in ${ownerId}: ${JSON.stringify(fragment)}: ${(e as Error).message}`)
    }
  }
}

/** Display math must be `$$` alone on its own line: remark-math renders a one-line `$$...$$` inline. */
export function checkDisplayMathFences(ownerId: string, text: string): void {
  const lines = text.split('\n')
  const bad = lines.find((line) => line.includes('$$') && line.trim() !== '$$')
  if (bad !== undefined) throw new Error(`Display math in ${ownerId} is not fenced: ${JSON.stringify(bad)}`)
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
      const expected = `${e.term === 'Fall' ? 'f' : 's'}${e.year}-${e.exam === 'final' ? 'final' : `e${e.exam}`}`
      expect(e.id, `${e.id} is ${e.term} ${e.year} ${e.exam}`).toBe(expected)
    }
  })

  test('question ids are <examId>-qNN with NN the question number', () => {
    for (const e of content.exams) {
      for (const q of e.questions) expect(q.id).toBe(`${e.id}-q${String(q.number).padStart(2, '0')}`)
    }
  })

  test('every question has been reviewed', () => {
    expect(content.questions.filter((q) => q.status !== 'reviewed').map((q) => q.id)).toEqual([])
  })

  test('derived answers appear on every question of the six exams with no key, and nowhere else', () => {
    const noKey = new Set(['f2023-e2', 'f2023-e3', 'f2023-final', 's2023-final', 'f2022-e2', 'f2022-e3'])
    for (const e of content.exams) {
      for (const q of e.questions) {
        expect(q.answerSource, q.id).toBe(noKey.has(e.id) ? 'derived' : undefined)
      }
    }
  })

  test('questions and cards are tagged only with lessons L1 to L35, never a review', () => {
    const planned = new Set(Array.from({ length: 35 }, (_, i) => `L${i + 1}`))
    for (const q of content.questions) {
      expect(q.lessonIds.length, q.id).toBeGreaterThan(0)
      for (const lid of q.lessonIds) expect(planned.has(lid), `${q.id} -> ${lid}`).toBe(true)
    }
    for (const c of content.cards) expect(planned.has(c.lessonId), `${c.id} -> ${c.lessonId}`).toBe(true)
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
  test('a dollar amount written with \$ is text, and later math still pairs', () => {
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
