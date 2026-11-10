import { describe, expect, it } from 'vitest'
import type { Attempt } from '../storage/types'
import type { Question } from '../content/schema'
import type { Mastery } from './mastery'
import { RETRY_LIMIT, lessonWeight, nextRetry, pickPracticeQuestion, retryCandidates, similarQuestion, type SelectArgs } from './select'

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
  it('a miss earlier today waits behind never-seen and older questions', () => {
    const m = new Map([['L1', [q('missed', 'L1'), q('new', 'L1')]]])
    const hoursAgo = new Date(now.getTime() - 3 * 3600000).toISOString()
    const r = pickPracticeQuestion(args({ questionsByLesson: m, attempts: [att('missed', false, hoursAgo)] }))
    expect(r?.id).toBe('new')
  })
  it('a miss a day or more ago comes back before never-seen questions', () => {
    const m = new Map([['L1', [q('new', 'L1'), q('missed', 'L1')]]])
    const r = pickPracticeQuestion(args({ questionsByLesson: m, attempts: [att('missed', false, daysAgo(1))] }))
    expect(r?.id).toBe('missed')
  })
  it('a missed question answered right later is back in the normal order', () => {
    const m = new Map([['L1', [q('new', 'L1'), q('fixed', 'L1')]]])
    const r = pickPracticeQuestion(
      args({ questionsByLesson: m, attempts: [att('fixed', false, daysAgo(3)), att('fixed', true, daysAgo(2))] }),
    )
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

describe('nextRetry', () => {
  const pending = [
    { questionId: 'a', after: 4 },
    { questionId: 'b', after: 6 },
  ]
  it('serves a retry once three other questions have been answered', () => {
    expect(nextRetry(pending, 3, false)).toBeNull()
    expect(nextRetry(pending, 4, false)).toBe('a')
    expect(nextRetry(pending, 7, false)).toBe('a')
  })
  it('serves the earliest retry early when nothing else is left', () => {
    expect(nextRetry(pending, 1, true)).toBe('a')
  })
  it('is null with nothing pending', () => {
    expect(nextRetry([], 9, true)).toBeNull()
  })
})

function typed(id: string, ...typeIds: string[]): Question {
  return { id, lessonIds: ['L1'], typeIds: typeIds.length ? typeIds : undefined } as unknown as Question
}
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString()

describe('pickPracticeQuestion by problem type', () => {
  const byType = new Map([
    ['L1-a', [typed('a1', 'L1-a'), typed('a2', 'L1-a'), typed('ab', 'L1-a', 'L1-b')]],
    ['L1-b', [typed('ab', 'L1-a', 'L1-b'), typed('b1', 'L1-b')]],
  ])
  const base = { questionsByType: byType, questionsByLesson: new Map([['L1', [q('other', 'L1')]]]) }
  it('only ever serves questions of the types asked for', () => {
    const served = new Set<string>()
    const got: string[] = []
    for (let i = 0; i < 10; i++) {
      const picked = pickPracticeQuestion(args({ ...base, typeIds: ['L1-a'], servedThisSession: served, rng: Math.random }))
      if (!picked) break
      served.add(picked.id)
      got.push(picked.id)
    }
    expect(got.sort()).toEqual(['a1', 'a2', 'ab'])
  })
  it('two types give the union, with a shared question once', () => {
    const served = new Set<string>()
    const got: string[] = []
    for (;;) {
      const picked = pickPracticeQuestion(args({ ...base, typeIds: ['L1-a', 'L1-b'], servedThisSession: served }))
      if (!picked) break
      served.add(picked.id)
      got.push(picked.id)
    }
    expect(got.sort()).toEqual(['a1', 'a2', 'ab', 'b1'])
  })
  it('an old miss comes before a question never answered, which comes before one answered right', () => {
    const attempts = [att('a1', true, daysAgo(3)), att('a2', false, daysAgo(2))]
    const served = new Set<string>()
    const order: string[] = []
    for (;;) {
      const picked = pickPracticeQuestion(args({ ...base, typeIds: ['L1-a'], attempts, servedThisSession: served }))
      if (!picked) break
      served.add(picked.id)
      order.push(picked.id)
    }
    expect(order).toEqual(['a2', 'ab', 'a1'])
  })
  it('an unknown type, or no types at all, gives nothing', () => {
    expect(pickPracticeQuestion(args({ ...base, typeIds: ['L9-zzz'] }))).toBeNull()
    expect(pickPracticeQuestion(args({ ...base, typeIds: [] }))).toBeNull()
    expect(pickPracticeQuestion(args({ typeIds: ['L1-a'] }))).toBeNull()
  })
})

describe('retryCandidates', () => {
  const questions = [typed('old'), typed('older'), typed('recent'), typed('fixed'), typed('never'), typed('right')]
  const attempts = [
    att('old', false, hoursAgo(25)),
    att('older', false, daysAgo(6)),
    att('recent', false, hoursAgo(2)),
    att('fixed', false, daysAgo(5)),
    att('fixed', true, daysAgo(4)),
    att('right', true, daysAgo(3)),
    att('removed', false, daysAgo(9)),
  ]
  it('lists questions last answered wrong at least a day ago, longest-standing first', () => {
    expect(retryCandidates(attempts, questions, now).map((x) => x.id)).toEqual(['older', 'old'])
  })
  it('a miss exactly a day old counts, one a minute short of it does not', () => {
    const edge = [att('old', false, daysAgo(1)), att('recent', false, new Date(now.getTime() - 86400000 + 60000).toISOString())]
    expect(retryCandidates(edge, questions, now).map((x) => x.id)).toEqual(['old'])
  })
  it('a question missed again more recently is judged by its latest answer', () => {
    const again = [att('old', false, daysAgo(5)), att('old', false, hoursAgo(1))]
    expect(retryCandidates(again, questions, now)).toEqual([])
  })
  it('only questions in the list given are returned, and no attempts gives none', () => {
    expect(retryCandidates(attempts, [typed('old')], now).map((x) => x.id)).toEqual(['old'])
    expect(retryCandidates([], questions, now)).toEqual([])
  })
  it('the session limit is five', () => {
    expect(RETRY_LIMIT).toBe(5)
  })
})

describe('similarQuestion', () => {
  const question = typed('ab', 'L1-a', 'L1-b')
  const byType = new Map([
    ['L1-a', [typed('a1', 'L1-a'), question, typed('a2', 'L1-a')]],
    ['L1-b', [question, typed('b1', 'L1-b')]],
    ['L1-c', [typed('c1', 'L1-c')]],
  ])
  const call = (over: Partial<Parameters<typeof similarQuestion>[0]> = {}) =>
    similarQuestion({ question, questionsByType: byType, attempts: [], served: new Set(), rng: () => 0, ...over })
  it('returns another question sharing one of its types, never itself or another type', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 40; i++) ids.add(call({ rng: Math.random })!.id)
    expect([...ids].sort()).toEqual(['a1', 'a2', 'b1'])
  })
  it('skips questions already served this session', () => {
    expect(call({ served: new Set(['a1', 'a2']) })!.id).toBe('b1')
  })
  it('prefers one never answered, and falls back to an answered one', () => {
    const attempts = [att('a1', true, daysAgo(1)), att('b1', false, daysAgo(1))]
    for (let i = 0; i < 20; i++) expect(call({ attempts, rng: Math.random })!.id).toBe('a2')
    const all = [...attempts, att('a2', true, daysAgo(1))]
    expect(['a1', 'a2', 'b1']).toContain(call({ attempts: all })!.id)
  })
  it('gives nothing when every sibling has been served, the type has no other question, or the question has no type', () => {
    expect(call({ served: new Set(['a1', 'a2', 'b1']) })).toBeNull()
    expect(call({ question: typed('c1', 'L1-c') })).toBeNull()
    expect(call({ question: typed('plain') })).toBeNull()
  })
  it('an rng that returns 1 still picks a question', () => {
    expect(call({ rng: () => 1 })).not.toBeNull()
  })
})
