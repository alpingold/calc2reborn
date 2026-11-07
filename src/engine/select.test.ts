import { describe, expect, it } from 'vitest'
import type { Attempt } from '../storage/types'
import type { Question } from '../content/schema'
import type { Mastery } from './mastery'
import { lessonWeight, pickPracticeQuestion, type SelectArgs } from './select'

function q(id: string, lessonId: string): Question {
  return { id, lessonIds: [lessonId] } as unknown as Question
}
function att(questionId: string, correct: boolean, timestamp: string): Attempt {
  return { id: `${questionId}-${timestamp}`, questionId, correct, timestamp, mode: 'practice' } as Attempt
}
const now = new Date('2026-01-20T12:00:00.000Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()

function args(over: Partial<SelectArgs>): SelectArgs {
  return {
    lessonIds: ['L1'],
    questionsByLesson: new Map(),
    mastery: new Map<string, Mastery>(),
    attempts: [],
    servedThisSession: new Set(),
    now,
    rng: () => 0,
    ...over,
  }
}

describe('lessonWeight', () => {
  it('weights', () => {
    expect(lessonWeight(undefined)).toBe(3)
    expect(lessonWeight({ score: null, attempts: 0 })).toBe(3)
    expect(lessonWeight({ score: 0.5, attempts: 5 })).toBe(3)
    expect(lessonWeight({ score: 0.9, attempts: 5 })).toBeCloseTo(1.1)
  })
})

describe('pickPracticeQuestion', () => {
  const qs = new Map([
    ['L1', [q('a', 'L1')]],
    ['L2', [q('b', 'L2')]],
  ])
  it('rng 0 picks first lesson, 0.999 the last', () => {
    expect(pickPracticeQuestion(args({ lessonIds: ['L1', 'L2'], questionsByLesson: qs }))?.id).toBe('a')
    expect(
      pickPracticeQuestion(args({ lessonIds: ['L1', 'L2'], questionsByLesson: qs, rng: () => 0.999 }))?.id,
    ).toBe('b')
  })
  it('prefers never-attempted over correct yesterday', () => {
    const m = new Map([['L1', [q('seen', 'L1'), q('new', 'L1')]]])
    const r = pickPracticeQuestion(args({ questionsByLesson: m, attempts: [att('seen', true, daysAgo(1))] }))
    expect(r?.id).toBe('new')
  })
  it('missed 8 days ago outranks correct 8 days ago', () => {
    const m = new Map([['L1', [q('right', 'L1'), q('wrong', 'L1')]]])
    const r = pickPracticeQuestion(
      args({
        questionsByLesson: m,
        attempts: [att('right', true, daysAgo(8)), att('wrong', false, daysAgo(8))],
      }),
    )
    expect(r?.id).toBe('wrong')
  })
  it('missed yesterday does not outrank never-seen', () => {
    const m = new Map([['L1', [q('missed', 'L1'), q('new', 'L1')]]])
    const r = pickPracticeQuestion(args({ questionsByLesson: m, attempts: [att('missed', false, daysAgo(1))] }))
    expect(r?.id).toBe('new')
  })
  it('uses the latest attempt per question, then oldest last-seen', () => {
    const m = new Map([['L1', [q('x', 'L1'), q('y', 'L1')]]])
    const r = pickPracticeQuestion(
      args({
        questionsByLesson: m,
        attempts: [att('x', false, daysAgo(20)), att('x', true, daysAgo(2)), att('y', true, daysAgo(3))],
      }),
    )
    expect(r?.id).toBe('y')
  })
  it('fully served lesson is not a candidate', () => {
    const r = pickPracticeQuestion(
      args({ lessonIds: ['L1', 'L2'], questionsByLesson: qs, servedThisSession: new Set(['a']) }),
    )
    expect(r?.id).toBe('b')
  })
  it('lesson with no questions is skipped; alone gives null', () => {
    const m = new Map([['L6', [q('s', 'L6')]]])
    expect(pickPracticeQuestion(args({ lessonIds: ['L5', 'L6'], questionsByLesson: m }))?.id).toBe('s')
    expect(pickPracticeQuestion(args({ lessonIds: ['L5'], questionsByLesson: m }))).toBeNull()
  })
  it('does not mutate inputs', () => {
    const list = [q('a', 'L1'), q('b', 'L1')]
    const attempts = [att('a', true, daysAgo(3)), att('b', true, daysAgo(5))]
    pickPracticeQuestion(args({ questionsByLesson: new Map([['L1', list]]), attempts }))
    expect(list.map((x) => x.id)).toEqual(['a', 'b'])
    expect(attempts.map((x) => x.questionId)).toEqual(['a', 'b'])
  })
})
