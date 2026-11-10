import { describe, expect, it } from 'vitest'
import type { Attempt } from '../storage/types'
import type { Question } from '../content/schema'
import { MOCK_QUESTION_COUNT, sampleMockExam } from './mock'

function q(id: string, ...lessonIds: string[]): Question {
  return { id, lessonIds } as unknown as Question
}
function many(n: number, lessonId = 'L1'): Question[] {
  return Array.from({ length: n }, (_, i) => q(`${lessonId}-q${i}`, lessonId))
}
function att(questionId: string, mode: Attempt['mode'], sessionId: string | undefined, ts: string): Attempt {
  return { id: `${questionId}-${ts}`, questionId, correct: true, timestamp: ts, mode, sessionId } as Attempt
}
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('sampleMockExam', () => {
  it('default count is 12', () => {
    expect(MOCK_QUESTION_COUNT).toBe(12)
    const m = new Map([['L1', many(20)]])
    expect(sampleMockExam({ lessonIds: ['L1'], questionsByLesson: m, attempts: [], rng: seeded(1) })).toHaveLength(12)
  })
  it('returns all when pool is small, with no duplicates across lessons', () => {
    const shared = q('shared', 'L1', 'L2')
    const m = new Map([
      ['L1', [shared, q('a', 'L1'), q('b', 'L1')]],
      ['L2', [shared, q('c', 'L2'), q('d', 'L2')]],
    ])
    const r = sampleMockExam({ lessonIds: ['L1', 'L2'], questionsByLesson: m, attempts: [], rng: seeded(2) })
    expect(r).toHaveLength(5)
    expect(new Set(r.map((x) => x.id)).size).toBe(5)
  })
  it('respects count', () => {
    const m = new Map([['L1', many(20)]])
    expect(sampleMockExam({ lessonIds: ['L1'], questionsByLesson: m, attempts: [], count: 4, rng: seeded(3) })).toHaveLength(4)
  })
  it('leaves out questions from the last two mock sessions while enough others remain', () => {
    const qs = many(20)
    const m = new Map([['L1', qs]])
    const attempts = [
      att('L1-q0', 'mock', 's1', '2026-01-01T10:00:00.000Z'),
      att('L1-q1', 'mock', 's2', '2026-01-02T10:00:00.000Z'),
      att('L1-q2', 'mock', 's3', '2026-01-03T10:00:00.000Z'),
    ]
    for (let seed = 1; seed < 20; seed++) {
      const ids = sampleMockExam({ lessonIds: ['L1'], questionsByLesson: m, attempts, count: 18, rng: seeded(seed) }).map((x) => x.id)
      expect(ids).not.toContain('L1-q1')
      expect(ids).not.toContain('L1-q2')
      expect(ids).toContain('L1-q0')
      expect(ids).toHaveLength(18)
    }
  })
  it('tops up a short pool from the excluded questions, least recently seen first', () => {
    const m = new Map([['L1', many(20)]])
    const attempts = [
      att('L1-q1', 'mock', 's2', '2026-01-02T10:00:00.000Z'),
      att('L1-q2', 'mock', 's3', '2026-01-03T10:00:00.000Z'),
    ]
    for (let seed = 1; seed < 20; seed++) {
      const ids = sampleMockExam({ lessonIds: ['L1'], questionsByLesson: m, attempts, count: 20, rng: seeded(seed) }).map((x) => x.id)
      expect(ids).toHaveLength(20)
      expect(ids.slice(18)).toEqual(['L1-q1', 'L1-q2'])
    }
  })
  it('a lesson with fewer questions than one mock still fills every later mock', () => {
    const m = new Map([['L19', many(11, 'L19')]])
    const attempts: Attempt[] = []
    for (let n = 1; n <= 4; n++) {
      const got = sampleMockExam({ lessonIds: ['L19'], questionsByLesson: m, attempts, rng: seeded(n) })
      expect(got).toHaveLength(11)
      expect(new Set(got.map((x) => x.id)).size).toBe(11)
      for (const x of got) attempts.push(att(x.id, 'mock', `s${n}`, `2026-01-0${n}T10:00:00.000Z`))
    }
  })
  it('never tops up with a question outside the lessons asked for', () => {
    const m = new Map([
      ['L1', many(3)],
      ['L2', many(3, 'L2')],
    ])
    const attempts = [att('L2-q0', 'mock', 's1', '2026-01-01T10:00:00.000Z'), att('L1-q0', 'mock', 's1', '2026-01-01T10:00:00.000Z')]
    const ids = sampleMockExam({ lessonIds: ['L1'], questionsByLesson: m, attempts, rng: seeded(5) }).map((x) => x.id)
    expect(ids.sort()).toEqual(['L1-q0', 'L1-q1', 'L1-q2'])
  })
  it('exam-mode attempts do not exclude', () => {
    const m = new Map([['L1', many(5)]])
    const attempts = [att('L1-q0', 'exam', 's1', '2026-01-01T10:00:00.000Z'), att('L1-q1', 'exam', 's2', '2026-01-02T10:00:00.000Z')]
    expect(sampleMockExam({ lessonIds: ['L1'], questionsByLesson: m, attempts, rng: seeded(4) })).toHaveLength(5)
  })
})
