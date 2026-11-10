import { describe, expect, test } from 'vitest'
import { createScheduler } from '../engine/fsrs'
import { parseSnapshot } from './snapshot'
import { DEFAULT_SETTINGS } from './types'

const attempt = { id: 'a1', questionId: 'q1', chosen: 'A', correct: true, seconds: 10, timestamp: '2026-01-01T00:00:00.000Z', mode: 'practice' }
const valid = {
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  cardStates: [{ cardId: 'c1', introducedAt: '2026-01-01T00:00:00.000Z', fsrs: { dueAt: '2026-01-02T00:00:00.000Z', lastReviewAt: null, stability: 0, stabilityFast: 0, difficulty: 0, state: 0, scheduleStatus: 'new', reps: 0, lapses: 0, scheduledDays: 0, learningStep: 0, cardId: 'c1' } }],
  attempts: [attempt],
  settings: DEFAULT_SETTINGS,
}

describe('parseSnapshot', () => {
  test('accepts a valid snapshot', () => {
    const r = parseSnapshot(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.snapshot).toEqual(valid)
  })
  test('rejects wrong version', () => {
    const r = parseSnapshot({ version: 2 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('version')
  })
  test('accepts chosen H from an eight-choice question', () => {
    expect(parseSnapshot({ ...valid, attempts: [{ ...attempt, chosen: 'H' }] }).ok).toBe(true)
  })
  test('rejects invalid chosen', () => {
    const r = parseSnapshot({ ...valid, attempts: [{ ...attempt, chosen: 'K' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('attempts[0].chosen')
  })
  test('keeps the feedback flag on an exam attempt', () => {
    const fb = { ...attempt, mode: 'exam', sessionId: 's1', examId: 'f2025-e1', feedback: true }
    const r = parseSnapshot({ ...valid, attempts: [fb] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.snapshot.attempts[0]).toEqual(fb)
  })
  test('rejects duplicate attempt ids', () => {
    const r = parseSnapshot({ ...valid, attempts: [attempt, { ...attempt, chosen: 'B' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Duplicate attempt id a1')
  })
  test('rejects duplicate card states', () => {
    const r = parseSnapshot({ ...valid, cardStates: [valid.cardStates[0], valid.cardStates[0]] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Duplicate card state c1')
  })
  test('accepts reported problems and rejects a repeated one', () => {
    const f = { id: 'f1', questionId: 'q1', reason: 'display', note: '', timestamp: '2026-01-01T00:00:00.000Z' }
    const ok = parseSnapshot({ ...valid, flags: [f] })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.snapshot.flags).toEqual([f])
    const dup = parseSnapshot({ ...valid, flags: [f, f] })
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error).toContain('Duplicate report f1')
    expect(parseSnapshot({ ...valid, flags: [{ ...f, reason: 'spam' }] }).ok).toBe(false)
  })
  test('rejects non-object', () => {
    expect(parseSnapshot('nope').ok).toBe(false)
    expect(parseSnapshot(null).ok).toBe(false)
  })
  test('rejects a non-ISO fsrs dueAt', () => {
    const bad = { ...valid, cardStates: [{ ...valid.cardStates[0], fsrs: { ...valid.cardStates[0].fsrs, dueAt: 'not-a-date' } }] }
    const r = parseSnapshot(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('cardStates[0].fsrs.dueAt')
  })
  test('accepts a card produced by the scheduler', async () => {
    const s = await createScheduler()
    const st = s.review(s.newState('c1', new Date('2026-01-01T00:00:00Z')), 3, new Date('2026-01-01T00:00:00Z'))
    expect(parseSnapshot({ ...valid, cardStates: [st] }).ok).toBe(true)
  })
  test.each([0, 10, 100])('accepts dailyNewCards %d', (n) => {
    expect(parseSnapshot({ ...valid, settings: { ...DEFAULT_SETTINGS, dailyNewCards: n } }).ok).toBe(true)
  })
  test.each([-1, 101, 2.5, 1e9])('rejects dailyNewCards %d, which Settings would never save', (n) => {
    const r = parseSnapshot({ ...valid, settings: { ...DEFAULT_SETTINGS, dailyNewCards: n } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('settings.dailyNewCards')
  })
  test.each(['2026-13-40', 'tomorrow', '2026-1-5'])('rejects the exam date %s', (examDate) => {
    const r = parseSnapshot({ ...valid, settings: { ...DEFAULT_SETTINGS, examDate } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('settings.examDate')
  })
  test('accepts a real exam date and none', () => {
    expect(parseSnapshot({ ...valid, settings: { ...DEFAULT_SETTINGS, examDate: '2026-12-14' } }).ok).toBe(true)
    expect(parseSnapshot({ ...valid, settings: { ...DEFAULT_SETTINGS, examDate: null } }).ok).toBe(true)
  })
  test('rejects a timestamp that is not an ISO date-time', () => {
    const r = parseSnapshot({ ...valid, attempts: [{ ...attempt, timestamp: 'yesterday' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('attempts[0].timestamp')
  })
  test('accepts every timestamp the app itself writes', () => {
    const at = new Date(2026, 10, 7, 23, 59, 59, 5).toISOString()
    const r = parseSnapshot({ ...valid, exportedAt: at, attempts: [{ ...attempt, timestamp: at }] })
    expect(r.ok).toBe(true)
  })
  const sessionRecord = {
    sessionId: 's1', kind: 'exam', examId: 'e1', questionIds: ['q1'], startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T01:00:00.000Z', feedback: false, correct: 1, total: 1,
  }
  const guidedResult = { problemId: 'L1-g1', completedAt: '2026-01-01T00:00:00.000Z', steps: 4, firstTryCorrect: 3 }
  test('accepts session records and guided results', () => {
    const r = parseSnapshot({ ...valid, sessions: [sessionRecord], guided: [guidedResult] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.snapshot.sessions).toEqual([sessionRecord])
      expect(r.snapshot.guided).toEqual([guidedResult])
    }
  })
  test('a file without them, as version 1 of the app wrote it, still parses and leaves them undefined', () => {
    const r = parseSnapshot(valid)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.snapshot.sessions).toBeUndefined()
      expect(r.snapshot.guided).toBeUndefined()
    }
  })
  test('rejects a repeated session id or guided problem id', () => {
    const a = parseSnapshot({ ...valid, sessions: [sessionRecord, sessionRecord] })
    expect(a).toEqual({ ok: false, error: 'Duplicate session s1' })
    const b = parseSnapshot({ ...valid, guided: [guidedResult, guidedResult] })
    expect(b).toEqual({ ok: false, error: 'Duplicate guided result L1-g1' })
  })
  test.each([
    ['a session kind the app does not know', { ...sessionRecord, kind: 'practice' }],
    ['a session with no question list', { ...sessionRecord, questionIds: undefined }],
    ['a negative score', { ...sessionRecord, correct: -1 }],
    ['a finish time that is not a date', { ...sessionRecord, finishedAt: 'later' }],
  ])('rejects %s', (_name, bad) => {
    expect(parseSnapshot({ ...valid, sessions: [bad] }).ok).toBe(false)
  })
})
