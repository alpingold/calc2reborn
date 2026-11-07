import fs from 'node:fs'
import path from 'node:path'
import katex from 'katex'
import { describe, expect, test } from 'vitest'
import { loadContent } from './index'
import { CHOICE_LABELS } from './schema'

/** Extract `$$...$$` first, then `$...$` (single line, non-greedy). */
export function extractMath(text: string): { fragment: string; displayMode: boolean }[] {
  const out: { fragment: string; displayMode: boolean }[] = []
  const rest = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, f: string) => {
    out.push({ fragment: f, displayMode: true })
    return ' '
  })
  for (const m of rest.matchAll(/\$([^$\n]+?)\$/g)) out.push({ fragment: m[1], displayMode: false })
  return out
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
      if (e.exam !== 'final') expect(e.durationMinutes, e.id).toBe(60)
    }
  })

  test('all Markdown renders through KaTeX', () => {
    for (const [id, text] of markdownStrings()) checkMath(id, text)
  })

  test('all display math is fenced on its own lines', () => {
    for (const [id, text] of markdownStrings()) checkDisplayMathFences(id, text)
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
