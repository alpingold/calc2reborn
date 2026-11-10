import { expect, test } from 'vitest'
import { buildContent } from '../content'
import type { Exam, Question } from '../content/schema'
import { fixtureLessons } from '../test/fixtures'
import { sessionsFromAttempts } from './backfill'
import type { Attempt } from './types'

function q(id: string): Question {
  return {
    id,
    number: 1,
    points: 8,
    stem: id,
    choices: [
      { label: 'A', text: 'a' },
      { label: 'B', text: 'b' },
    ],
    answer: 'A',
    lessonIds: ['L1'],
    status: 'reviewed',
  }
}
const exam: Exam = {
  id: 'e1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: ['e1-q1', 'e1-q2', 'e1-q3', 'e1-q4'].map(q),
}
const content = buildContent(fixtureLessons(), [], [exam])

function att(questionId: string, correct: boolean, extra: Partial<Attempt>): Attempt {
  return {
    id: `${extra.sessionId ?? 'p'}:${questionId}:${extra.timestamp ?? ''}`,
    questionId,
    chosen: correct ? 'A' : 'B',
    correct,
    seconds: 30,
    timestamp: '2026-01-01T10:00:00.000Z',
    mode: 'exam',
    ...extra,
  }
}

test('an exam session becomes one record listing every question of the exam', () => {
  const attempts = [
    att('e1-q1', true, { sessionId: 's1', examId: 'e1' }),
    att('e1-q3', false, { sessionId: 's1', examId: 'e1' }),
    att('e1-q4', true, { sessionId: 's1', examId: 'e1' }),
  ]
  expect(sessionsFromAttempts(attempts, content)).toEqual([
    {
      sessionId: 's1',
      kind: 'exam',
      examId: 'e1',
      questionIds: ['e1-q1', 'e1-q2', 'e1-q3', 'e1-q4'],
      startedAt: '2026-01-01T10:00:00.000Z',
      finishedAt: '2026-01-01T10:00:00.000Z',
      feedback: false,
      correct: 2,
      total: 4,
    },
  ])
})

test('a mock session lists the questions that were answered, in the order they were logged', () => {
  const attempts = [
    att('e1-q3', true, { sessionId: 'm1', mode: 'mock' }),
    att('e1-q1', false, { sessionId: 'm1', mode: 'mock' }),
  ]
  const [r] = sessionsFromAttempts(attempts, content)
  expect(r).toMatchObject({ kind: 'mock', questionIds: ['e1-q3', 'e1-q1'], correct: 1, total: 2 })
  expect(r).not.toHaveProperty('examId')
})

test('practice and lesson attempts, and attempts with no session, give no records', () => {
  const attempts = [
    att('e1-q1', true, { mode: 'practice' }),
    att('e1-q2', true, { mode: 'lesson' }),
    att('e1-q3', true, { mode: 'exam' }),
  ]
  expect(sessionsFromAttempts(attempts, content)).toEqual([])
})

test('sessions come newest first, each spanning its earliest and latest attempt', () => {
  const attempts = [
    att('e1-q1', true, { sessionId: 'old', examId: 'e1', timestamp: '2026-01-01T10:00:00.000Z' }),
    att('e1-q1', true, { sessionId: 'new', examId: 'e1', timestamp: '2026-03-01T10:05:00.000Z' }),
    att('e1-q2', true, { sessionId: 'new', examId: 'e1', timestamp: '2026-03-01T10:00:00.000Z' }),
  ]
  const records = sessionsFromAttempts(attempts, content)
  expect(records.map((r) => r.sessionId)).toEqual(['new', 'old'])
  expect(records[0]).toMatchObject({ startedAt: '2026-03-01T10:00:00.000Z', finishedAt: '2026-03-01T10:05:00.000Z' })
})

test('a session taken with feedback is marked, and a question logged twice counts once by its last answer', () => {
  const attempts = [
    att('e1-q1', false, { sessionId: 's1', examId: 'e1', feedback: true, timestamp: '2026-01-01T10:00:00.000Z' }),
    att('e1-q1', true, { sessionId: 's1', examId: 'e1', feedback: true, timestamp: '2026-01-01T10:30:00.000Z' }),
  ]
  expect(sessionsFromAttempts(attempts, content)[0]).toMatchObject({ feedback: true, correct: 1, total: 4 })
})

test('attempts for an exam or question that is no longer in the content still give a record', () => {
  const attempts = [
    att('gone-q1', true, { sessionId: 's1', examId: 'gone' }),
    att('gone-q2', false, { sessionId: 's1', examId: 'gone' }),
  ]
  expect(sessionsFromAttempts(attempts, content)).toEqual([
    expect.objectContaining({ sessionId: 's1', examId: 'gone', questionIds: ['gone-q1', 'gone-q2'], correct: 1, total: 2 }),
  ])
})

test('no attempts, no records', () => {
  expect(sessionsFromAttempts([], content)).toEqual([])
})
