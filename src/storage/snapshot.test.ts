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
  test('rejects invalid chosen', () => {
    const r = parseSnapshot({ ...valid, attempts: [{ ...attempt, chosen: 'F' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('attempts[0].chosen')
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
})
