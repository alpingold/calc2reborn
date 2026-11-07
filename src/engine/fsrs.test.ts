import { describe, expect, it } from 'vitest'
import { createScheduler, type Rating } from './fsrs'

const now = new Date('2026-01-01T00:00:00Z')

describe('fsrs scheduler', () => {
  it('creates a new state', async () => {
    const s = await createScheduler()
    const st = s.newState('L19-c01', now)
    expect(st.cardId).toBe('L19-c01')
    expect(st.introducedAt).toBe(now.toISOString())
    expect(st.fsrs.dueAt).toBe(now.toISOString())
    expect(st.fsrs.reps).toBe(0)
  })

  it('review advances reps and due date without mutating input', async () => {
    const s = await createScheduler()
    const st = s.newState('L19-c01', now)
    const before = JSON.stringify(st)
    const next = s.review(st, 3, now)
    expect(next.fsrs.reps).toBe(1)
    expect(new Date(next.fsrs.dueAt).getTime()).toBeGreaterThan(now.getTime())
    expect(JSON.stringify(st)).toBe(before)
  })

  it('Again, Good, Good, Easy ends in review with no lapses', async () => {
    const s = await createScheduler()
    let st = s.newState('L19-c01', now)
    let t = now
    for (const r of [1, 3, 3, 4] as Rating[]) {
      st = s.review(st, r, t)
      t = new Date(st.fsrs.dueAt)
    }
    expect(st.fsrs.scheduleStatus).toBe('review')
    expect(st.fsrs.lapses).toBe(0)
  })

  it('survives a JSON round trip', async () => {
    const s = await createScheduler()
    const st = s.review(s.newState('L19-c01', now), 3, now)
    const copy = JSON.parse(JSON.stringify(st))
    expect(() => s.review(copy, 3, new Date(copy.fsrs.dueAt))).not.toThrow()
  })

  it('isDue at dueAt but not one second before', async () => {
    const s = await createScheduler()
    const st = s.review(s.newState('L19-c01', now), 3, now)
    const due = new Date(st.fsrs.dueAt)
    expect(s.isDue(st, due)).toBe(true)
    expect(s.isDue(st, new Date(due.getTime() - 1000))).toBe(false)
  })

  it('preview gives non-decreasing dates for ratings 1 to 4', async () => {
    const s = await createScheduler()
    const st = s.review(s.newState('L19-c01', now), 3, now)
    const p = s.preview(st, new Date(st.fsrs.dueAt))
    const times = ([1, 2, 3, 4] as Rating[]).map((r) => p[r].getTime())
    for (let i = 1; i < 4; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1])
    expect(times[3]).toBeGreaterThan(times[0])
  })
})
