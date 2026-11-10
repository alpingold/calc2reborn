import { describe, expect, it } from 'vitest'
import { applyGuided, mathFault, type GuidedFile } from './apply-guided'

const step = (answer: 'A' | 'B' = 'B') => ({
  prompt: 'p',
  choices: [
    { label: 'A', text: 'one', ...(answer === 'A' ? {} : { note: 'why' }) },
    { label: 'B', text: 'two', ...(answer === 'B' ? {} : { note: 'why' }) },
  ],
  answer,
  explanation: 'e',
})
const problem = (n: number, typeId: string, over: object = {}) => ({
  id: `L5-g${n}`,
  lessonId: 'L5',
  typeId,
  stem: 's',
  steps: [step(), step('A'), step()],
  takeaway: 't',
  ...over,
})
const types = new Set(['L5-a', 'L5-b'])
const cards = [
  { id: 'L5-c01', lessonId: 'L5', front: 'f', back: 'b', typeIds: ['L5-b'] },
  { id: 'L5-c02', lessonId: 'L5', front: 'f', back: 'b' },
]
const file = (over: Partial<GuidedFile> = {}): GuidedFile => ({
  lessonId: 'L5',
  guided: [problem(1, 'L5-a'), problem(2, 'L5-b')],
  cardTypes: { 'L5-c01': ['L5-a'], 'L5-c02': [] },
  ...over,
})

describe('applyGuided', () => {
  it('returns the problems and sets, replaces or clears each card\'s types', () => {
    const out = applyGuided(file(), types, cards)
    expect(out.guided.map((g) => g.id)).toEqual(['L5-g1', 'L5-g2'])
    expect(out.cards[0].typeIds).toEqual(['L5-a'])
    expect('typeIds' in out.cards[1]).toBe(false)
    expect(cards[0].typeIds).toEqual(['L5-b'])
  })
  it.each([
    ['one problem only', file({ guided: [problem(1, 'L5-a')] }), /two or three/],
    ['ids out of order', file({ guided: [problem(2, 'L5-a'), problem(1, 'L5-b')] }), /should have the id L5-g1/],
    ['an unknown type', file({ guided: [problem(1, 'L5-a'), problem(2, 'L5-z')] }), /unknown problem type/],
    ['two problems of one type', file({ guided: [problem(1, 'L5-a'), problem(2, 'L5-a')] }), /share a problem type/],
    ['two steps only', file({ guided: [problem(1, 'L5-a', { steps: [step(), step()] }), problem(2, 'L5-b')] }), /problem 1/],
    ['a wrong choice with no note', file({ guided: [problem(1, 'L5-a', { steps: [step(), step(), { ...step(), answer: 'A' }] }), problem(2, 'L5-b')] }), /says why it is wrong/],
    ['a choice named by letter', file({ guided: [problem(1, 'L5-a', { takeaway: 'So choice B is right.' }), problem(2, 'L5-b')] }), /by its letter/],
    ['a card left out', file({ cardTypes: { 'L5-c01': [] } }), /no entry for L5-c02/],
    ['a card that does not exist', file({ cardTypes: { 'L5-c01': [], 'L5-c02': [], 'L5-c09': [] } }), /no card L5-c09/],
    ['a type from another lesson on a card', file({ cardTypes: { 'L5-c01': ['L6-a'], 'L5-c02': [] } }), /not a problem type of L5/],
  ])('rejects %s', (_name, bad, message) => {
    expect(() => applyGuided(bad, types, cards)).toThrow(message)
  })
})

it('mathFault finds an unclosed $ and display math that is not fenced', () => {
  expect(mathFault('Plain and $x^2$ and $y$.')).toBeNull()
  expect(mathFault('Before\n\n$$\nx = 1\n$$\n\nAfter $x$')).toBeNull()
  expect(mathFault('$2x - x^2')).toMatch(/not closed/)
  expect(mathFault('So $$x = 1$$ here')).toMatch(/own line/)
  expect(mathFault('Open\n\n$$\nx = 1')).toMatch(/block is not closed/)
})
