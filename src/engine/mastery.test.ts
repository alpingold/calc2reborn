import { describe, expect, it } from 'vitest'
import type { Attempt } from '../storage/types'
import type { Lesson, Question, Unit } from '../content/schema'
import { groupMastery, isWeak, lessonMastery, typeMastery, unitMastery, type Mastery } from './mastery'

function attempt(questionId: string, correct: boolean, timestamp: string): Attempt {
  return { id: `${questionId}-${timestamp}`, questionId, chosen: 0, correct, seconds: 10, timestamp, mode: 'practice' } as unknown as Attempt
}
function question(id: string, lessonIds: string[]): Question {
  return { id, lessonIds } as unknown as Question
}
function lesson(id: string, unit: Unit | null, isReview = false): Lesson {
  return { id, number: 1, unit, isReview } as unknown as Lesson
}
const qs = new Map([['q', question('q', ['L1'])]])
const t = (n: number) => `2026-01-0${n}T00:00:00Z`

describe('lessonMastery', () => {
  it('no attempts', () => {
    expect(lessonMastery([], qs, ['L1']).get('L1')).toEqual({ score: null, attempts: 0 })
  })
  it('two attempts is untested', () => {
    const m = lessonMastery([attempt('q', true, t(1)), attempt('q', true, t(2))], qs, ['L1']).get('L1')
    expect(m).toEqual({ score: null, attempts: 2 })
  })
  it('correct, correct, wrong = 0.7', () => {
    const m = lessonMastery([attempt('q', true, t(1)), attempt('q', true, t(2)), attempt('q', false, t(3))], qs, ['L1']).get('L1')!
    expect(m.score).toBeCloseTo(0.7, 9)
    expect(isWeak(m)).toBe(false)
  })
  it('wrong, wrong, correct = 0.3', () => {
    const m = lessonMastery([attempt('q', false, t(1)), attempt('q', false, t(2)), attempt('q', true, t(3))], qs, ['L1']).get('L1')!
    expect(m.score).toBeCloseTo(0.3, 9)
    expect(isWeak(m)).toBe(true)
  })
  it('orders by timestamp, not array order', () => {
    const m = lessonMastery([attempt('q', false, t(3)), attempt('q', true, t(1)), attempt('q', true, t(2))], qs, ['L1']).get('L1')!
    expect(m.score).toBeCloseTo(0.7, 9)
  })
  it('multi-lesson question counts toward both; unknown questions ignored', () => {
    const q = new Map([['m', question('m', ['L22', 'L23'])]])
    const a = [attempt('m', true, t(1)), attempt('m', true, t(2)), attempt('m', true, t(3)), attempt('zz', false, t(4))]
    const r = lessonMastery(a, q, ['L22', 'L23', 'L24'])
    expect(r.get('L22')!.attempts).toBe(3)
    expect(r.get('L23')!.attempts).toBe(3)
    expect(r.get('L24')).toEqual({ score: null, attempts: 0 })
  })
})

describe('isWeak', () => {
  it('null is not weak', () => expect(isWeak({ score: null, attempts: 0 })).toBe(false))
})

describe('unitMastery', () => {
  it('averages non-null scores and sums attempts', () => {
    const ls = [lesson('a', 'Polar'), lesson('b', 'Polar'), lesson('c', 'Polar'), lesson('d', 'Sequences and Series'), lesson('r', 'Polar', true)]
    const by = new Map<string, Mastery>([
      ['a', { score: 0.8, attempts: 5 }], ['b', { score: null, attempts: 1 }], ['c', { score: 0.6, attempts: 4 }],
      ['d', { score: null, attempts: 2 }], ['r', { score: 0.1, attempts: 9 }],
    ])
    const u = unitMastery(ls, by)
    expect(u.get('Polar')!.score).toBeCloseTo(0.7, 9)
    expect(u.get('Polar')!.attempts).toBe(10)
    expect(u.get('Sequences and Series')).toEqual({ score: null, attempts: 2 })
  })
  it('leaves out extra topics', () => {
    const extra = { ...lesson('x', 'Other topics'), isExtra: true }
    const u = unitMastery([extra], new Map([['x', { score: 0.2, attempts: 5 }]]))
    expect(u.has('Other topics')).toBe(false)
  })
})

describe('typeMastery', () => {
  const typed = (id: string, typeIds?: string[]) => ({ id, lessonIds: ['L1'], typeIds }) as unknown as Question
  const byId = new Map([
    ['a', typed('a', ['L1-a'])],
    ['ab', typed('ab', ['L1-a', 'L1-b'])],
    ['plain', typed('plain')],
  ])
  it('a type with two answers is untested', () => {
    const m = typeMastery([attempt('a', true, t(1)), attempt('a', true, t(2))], byId, ['L1-a']).get('L1-a')
    expect(m).toEqual({ score: null, attempts: 2 })
  })
  it('wrong, right, right scores 0.51 by the same rule as lessons', () => {
    const m = typeMastery([attempt('a', false, t(1)), attempt('a', true, t(2)), attempt('a', true, t(3))], byId, ['L1-a']).get('L1-a')!
    expect(m.score).toBeCloseTo(0.51, 9)
    expect(isWeak(m)).toBe(true)
  })
  it('a question with two types counts toward both', () => {
    const attempts = [attempt('ab', true, t(1)), attempt('ab', true, t(2)), attempt('ab', true, t(3))]
    const m = typeMastery(attempts, byId, ['L1-a', 'L1-b'])
    expect(m.get('L1-a')).toEqual({ score: 1, attempts: 3 })
    expect(m.get('L1-b')).toEqual({ score: 1, attempts: 3 })
  })
  it('answers on untagged questions and on questions no longer in the content are ignored', () => {
    const attempts = [attempt('plain', false, t(1)), attempt('removed', false, t(2)), attempt('a', true, t(3))]
    const m = typeMastery(attempts, byId, ['L1-a', 'L1-b'])
    expect(m.get('L1-a')).toEqual({ score: null, attempts: 1 })
    expect(m.get('L1-b')).toEqual({ score: null, attempts: 0 })
  })
  it('a type nobody asked about is not reported, and one with no answers is reported as untested', () => {
    const m = typeMastery([attempt('ab', true, t(1))], byId, ['L1-b', 'L1-z'])
    expect([...m.keys()]).toEqual(['L1-b', 'L1-z'])
    expect(m.get('L1-z')).toEqual({ score: null, attempts: 0 })
  })
  it('answers are taken in time order whatever order they arrive in', () => {
    const inOrder = [attempt('a', true, t(1)), attempt('a', true, t(2)), attempt('a', false, t(3))]
    const shuffled = [inOrder[2], inOrder[0], inOrder[1]]
    expect(typeMastery(shuffled, byId, ['L1-a'])).toEqual(typeMastery(inOrder, byId, ['L1-a']))
  })
})

describe('groupMastery', () => {
  it('a question listed twice under one group still counts once per answer', () => {
    const m = groupMastery([attempt('q', true, t(1))], () => ['g', 'g'], ['g'])
    expect(m.get('g')).toEqual({ score: null, attempts: 1 })
  })
})
