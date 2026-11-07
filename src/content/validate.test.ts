import fs from 'node:fs'
import path from 'node:path'
import katex from 'katex'
import { describe, expect, test } from 'vitest'
import { loadContent } from './index'

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

const content = loadContent()

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
      expect(q.choices.map((c) => c.label), q.id).toEqual(['A', 'B', 'C', 'D', 'E'])
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
    for (const l of content.lessons) checkMath(l.id, l.keyIdeas)
    for (const c of content.cards) {
      checkMath(`${c.id}.front`, c.front)
      checkMath(`${c.id}.back`, c.back)
    }
    for (const q of content.questions) {
      checkMath(`${q.id}.stem`, q.stem)
      for (const ch of q.choices) checkMath(`${q.id}.${ch.label}`, ch.text)
      if (q.solution) checkMath(`${q.id}.solution`, q.solution)
    }
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
})
