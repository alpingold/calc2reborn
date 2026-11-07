import { describe, expect, it } from 'vitest'
import type { Attempt } from '../storage/types'
import type { Lesson, Question, Unit } from '../content/schema'
import { isWeak, lessonMastery, unitMastery, type Mastery } from './mastery'

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
})
