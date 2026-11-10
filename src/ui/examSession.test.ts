import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildContent } from '../content'
import type { Choice, Exam, Question } from '../content/schema'
import { fixtureLessons } from '../test/fixtures'
import {
  SESSION_KEY,
  clearSession,
  finishSession,
  loadSession,
  matchesRequest,
  remainingSeconds,
  saveSession,
  formatPoints,
  scoreSession,
  sessionTitle,
  sessionUrl,
  timeIsUp,
  rememberMockQuestions,
  recallMockQuestions,
  examTitle,
} from './examSession'
import type { ExamSession } from './examSession'

const choices: Choice[] = (['A', 'B', 'C', 'D', 'E'] as const).map((label) => ({ label, text: label }))

function q(n: number, points: number, answer: Choice['label']): Question {
  return { id: `e-q${n}`, number: n, points, stem: `Stem ${n}`, choices, answer, lessonIds: ['L19'], status: 'reviewed' }
}

const exam: Exam = {
  id: 'f2025-e1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: [q(1, 8, 'A'), q(2, 8, 'B'), q(3, 10, 'C')],
}
const content = buildContent(fixtureLessons(), [], [exam])

const START = '2026-11-06T12:00:00.000Z'

function session(over: Partial<ExamSession> = {}): ExamSession {
  return {
    sessionId: 's1',
    kind: 'exam',
    examId: 'f2025-e1',
    questionIds: ['e-q1', 'e-q2', 'e-q3'],
    answers: {},
    marked: [],
    startedAt: START,
    durationMinutes: 60,
    ...over,
  }
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

test('remainingSeconds counts down whole seconds and stops at zero', () => {
  const s = session()
  expect(remainingSeconds(s, new Date(START))).toBe(3600)
  expect(remainingSeconds(s, new Date(Date.parse(START) + 61_500))).toBe(3539)
  expect(remainingSeconds(s, new Date(Date.parse(START) + 3600_000))).toBe(0)
  expect(remainingSeconds(s, new Date(Date.parse(START) + 5000_000))).toBe(0)
})

test('finishSession logs one attempt per answered question with shared session fields', () => {
  const now = new Date(Date.parse(START) + 600_000)
  const attempts = finishSession(session({ answers: { 'e-q1': 'A', 'e-q3': 'D' } }), content, now)
  expect(attempts).toHaveLength(2)
  expect(attempts[0]).toMatchObject({
    questionId: 'e-q1',
    chosen: 'A',
    correct: true,
    seconds: 300,
    timestamp: now.toISOString(),
    mode: 'exam',
    sessionId: 's1',
    examId: 'f2025-e1',
  })
  expect(attempts[1]).toMatchObject({ questionId: 'e-q3', chosen: 'D', correct: false, mode: 'exam' })
  expect(attempts[0].id).not.toBe(attempts[1].id)
})

test('finishSession for a mock omits examId and rounds seconds to one decimal', () => {
  const now = new Date(Date.parse(START) + 100_000)
  const attempts = finishSession(
    session({ kind: 'mock', examId: undefined, answers: { 'e-q1': 'B', 'e-q2': 'B', 'e-q3': 'C' } }),
    content,
    now,
  )
  expect(attempts.map((a) => a.mode)).toEqual(['mock', 'mock', 'mock'])
  expect(attempts.every((a) => a.examId === undefined && !('examId' in a))).toBe(true)
  expect(attempts[0].seconds).toBe(33.3)
})

test('finishSession with nothing answered returns no attempts', () => {
  expect(finishSession(session(), content, new Date(START))).toEqual([])
})

test('scoreSession counts correct answers and points', () => {
  expect(scoreSession(session({ answers: { 'e-q1': 'A', 'e-q2': 'C', 'e-q3': 'C' } }), content)).toEqual({
    correct: 2,
    total: 3,
    points: 18,
    maxPoints: 26,
  })
})

describe('formatPoints', () => {
  test.each([
    [72, '72'],
    [0, '0'],
    [8.333333333333334, '8.3'],
    [4 * 8.333333333333334, '33.3'],
    [12 * 8.333333333333334, '100'],
    [99.96, '100'],
    [12.04, '12'],
    [12.5, '12.5'],
  ])('%d shows as %s', (points, shown) => {
    expect(formatPoints(points)).toBe(shown)
  })

  test('summing 100/12 twelve times picks up float noise that display must hide', () => {
    let sum = 0
    for (let i = 0; i < 12; i++) sum += 8.333333333333334
    expect(formatPoints(sum)).toBe('100')
  })
})

test('save, load and clear round-trip through localStorage', () => {
  const s = session({ answers: { 'e-q1': 'B' }, marked: ['e-q2'] })
  saveSession(s)
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
  expect(loadSession()).toEqual(s)
  clearSession()
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  expect(loadSession()).toBeNull()
})

test('loadSession treats corrupt data as no session', () => {
  localStorage.setItem(SESSION_KEY, '{not json')
  expect(loadSession()).toBeNull()
  localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId: 's1' }))
  expect(loadSession()).toBeNull()
})

test('storage failures are swallowed', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied')
  })
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('denied')
  })
  expect(() => saveSession(session())).not.toThrow()
  expect(loadSession()).toBeNull()
  expect(() => clearSession()).not.toThrow()
})

test('a mock session round-trips its lesson range', () => {
  const s = session({ kind: 'mock', examId: undefined, from: 'L19', to: 'L26' })
  saveSession(s)
  expect(loadSession()).toEqual(s)
})

test('loadSession accepts an older saved mock with no lesson range', () => {
  const s = session({ kind: 'mock', examId: undefined })
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  expect(loadSession()).toEqual(s)
})

test('loadSession rejects a lesson range that is not a string', () => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session({ kind: 'mock' }), from: 19 }))
  expect(loadSession()).toBeNull()
})

describe('matchesRequest', () => {
  const mock = session({ kind: 'mock', examId: undefined, from: 'L19', to: 'L26' })
  test('an exam session matches only the same exam', () => {
    expect(matchesRequest(session(), { kind: 'exam', examId: 'f2025-e1' })).toBe(true)
    expect(matchesRequest(session(), { kind: 'exam', examId: 'f2024-e1' })).toBe(false)
    expect(matchesRequest(session(), { kind: 'mock', from: 'L19', to: 'L26' })).toBe(false)
  })
  test('a mock session matches only the same lesson range', () => {
    expect(matchesRequest(mock, { kind: 'mock', from: 'L19', to: 'L26' })).toBe(true)
    expect(matchesRequest(mock, { kind: 'mock', from: 'L1', to: 'L4' })).toBe(false)
    expect(matchesRequest(mock, { kind: 'mock', from: 'L19', to: 'L20' })).toBe(false)
    expect(matchesRequest(mock, { kind: 'exam', examId: 'f2025-e1' })).toBe(false)
  })
  test('an older mock with no lesson range matches no mock request', () => {
    const old = session({ kind: 'mock', examId: undefined })
    expect(matchesRequest(old, { kind: 'mock', from: 'L19', to: 'L26' })).toBe(false)
  })
})

test('sessionUrl leads back to the page that resumes the session', () => {
  expect(sessionUrl(session())).toBe('/exams/f2025-e1')
  expect(sessionUrl(session({ kind: 'mock', examId: undefined, from: 'L19', to: 'L26' }))).toBe(
    '/exams/mock?from=L19&to=L26',
  )
  expect(sessionUrl(session({ kind: 'mock', examId: undefined }))).toBe('/exams/mock')
})

test('sessionTitle names the exam or the mock range', () => {
  expect(sessionTitle(session(), content)).toBe('Fall 2025 Exam 1')
  expect(sessionTitle(session({ examId: 'gone' }), content)).toBe('An exam')
  expect(sessionTitle(session({ kind: 'mock', examId: undefined, from: 'L19', to: 'L26' }), content)).toBe(
    'Mock exam, Lessons 19 to 26',
  )
  expect(sessionTitle(session({ kind: 'mock', examId: undefined, from: 'L19', to: 'L19' }), content)).toBe(
    'Mock exam, Lesson 19',
  )
  expect(sessionTitle(session({ kind: 'mock', examId: undefined }), content)).toBe('Mock exam')
})

test('timeIsUp: a timed session expires, a feedback session never does', () => {
  const later = new Date(Date.parse(START) + 3 * 3600_000)
  expect(timeIsUp(session(), new Date(START))).toBe(false)
  expect(timeIsUp(session(), later)).toBe(true)
  expect(timeIsUp(session({ feedback: true }), later)).toBe(false)
})

test('a feedback session round-trips its checked questions', () => {
  const s = session({ feedback: true, checked: ['e-q1'] })
  saveSession(s)
  expect(loadSession()).toEqual(s)
})

test('loadSession rejects checked questions that are not strings', () => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session(), feedback: true, checked: [1] }))
  expect(loadSession()).toBeNull()
})

test('finishSession marks attempts from a feedback session', () => {
  const attempts = finishSession(session({ feedback: true, answers: { 'e-q1': 'A' } }), content, new Date(START))
  expect(attempts[0]).toMatchObject({ feedback: true })
  const timed = finishSession(session({ answers: { 'e-q1': 'A' } }), content, new Date(START))
  expect(timed[0]).not.toHaveProperty('feedback')
})

test('finishSession gives each attempt an id fixed by session and question, so a resubmit replaces it', () => {
  const s = session({ answers: { 'e-q1': 'A', 'e-q3': 'C' } })
  const first = finishSession(s, content, new Date(START))
  const again = finishSession(s, content, new Date(Date.parse(START) + 5000))
  expect(first.map((a) => a.id)).toEqual(['s1:e-q1', 's1:e-q3'])
  expect(again.map((a) => a.id)).toEqual(first.map((a) => a.id))
})

test('finishSession uses the seconds measured per question when a session has them', () => {
  const s = session({ feedback: true, answers: { 'e-q1': 'A', 'e-q2': 'B' }, seconds: { 'e-q1': 42 } })
  const attempts = finishSession(s, content, new Date(Date.parse(START) + 600_000))
  expect(attempts[0].seconds).toBe(42)
  // no measurement: the session average, 600 s over 2 answers
  expect(attempts[1].seconds).toBe(300)
})

test('loadSession rejects per-question seconds that are not numbers', () => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session(), seconds: { 'e-q1': 'x' } }))
  expect(loadSession()).toBeNull()
})

test('mock question lists are remembered for the 20 most recent mocks', () => {
  localStorage.clear()
  for (let i = 0; i < 22; i++) rememberMockQuestions(`m${i}`, [`q${i}`])
  expect(recallMockQuestions('m21')).toEqual(['q21'])
  expect(recallMockQuestions('m2')).toEqual(['q2'])
  expect(recallMockQuestions('m1')).toBeUndefined()
  expect(recallMockQuestions('m0')).toBeUndefined()
  localStorage.clear()
})

test('a corrupt remembered list is ignored', () => {
  localStorage.setItem('ma16200-mock-questions', '{not json')
  expect(recallMockQuestions('m1')).toBeUndefined()
  rememberMockQuestions('m1', ['q1'])
  expect(recallMockQuestions('m1')).toEqual(['q1'])
  localStorage.clear()
})

test('an unofficial exam is titled by its own title', () => {
  const extra = { id: 'xp-e3-a', title: 'Extra Practice Exam 3 (A)', unofficial: true as const, durationMinutes: 60, questions: [] }
  expect(examTitle(extra)).toBe('Extra Practice Exam 3 (A)')
  expect(examTitle(exam)).toBe('Fall 2025 Exam 1')
})

test('buildContent lists unofficial exams after every official one', () => {
  const extra = { id: 'xp-e3-a', title: 'Extra Practice Exam 3 (A)', unofficial: true as const, durationMinutes: 60, questions: [] }
  const older = { ...exam, id: 's2016-e1', term: 'Spring' as const, year: 2016 }
  expect(buildContent(fixtureLessons(), [], [extra, older, exam]).exams.map((e) => e.id)).toEqual([
    'f2025-e1',
    's2016-e1',
    'xp-e3-a',
  ])
})

test('the session is kept where it survives a closed tab', () => {
  saveSession(session())
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  clearSession()
})
