import { describe, expect, it } from 'vitest'
import type { CardState, Settings } from '../storage/types'
import type { ConceptCard, Lesson } from '../content/schema'
import { coveredLessonIds, dailyQueue, isSameLocalDay, promoteCardsForTypes } from './queue'

function lesson(number: number, isReview = false): Lesson {
  return { id: isReview ? `R-${number}` : `L${number}`, number, isReview } as unknown as Lesson
}
function card(id: string, lessonId: string): ConceptCard {
  return { id, lessonId, front: 'f', back: 'b' } as unknown as ConceptCard
}
function state(cardId: string, dueAt: string, introducedAt = '2026-01-01T00:00:00.000Z'): CardState {
  return { cardId, introducedAt, fsrs: { dueAt } } as unknown as CardState
}
const settings = (n: number) => ({ currentLessonId: null, dailyNewCards: n }) as unknown as Settings
const lessons: Lesson[] = [
  ...Array.from({ length: 35 }, (_, i) => lesson(i + 1)),
  lesson(10, true),
]
const now = new Date(2026, 0, 10, 12, 0)
const isDue = (s: CardState, n: Date) => new Date(s.fsrs.dueAt) <= n

describe('coveredLessonIds', () => {
  it('up to current', () => {
    expect(coveredLessonIds(lessons, 'L3')).toEqual(['L1', 'L2', 'L3'])
  })
  it('null gives all 35 non-review', () => {
    const ids = coveredLessonIds(lessons, null)
    expect(ids).toHaveLength(35)
    expect(ids.some((i) => i.startsWith('R-'))).toBe(false)
  })
  it('never includes an extra topic', () => {
    const withExtra = [...lessons, { id: 'X1', number: 42, isReview: false, isExtra: true } as unknown as Lesson]
    expect(coveredLessonIds(withExtra, null)).not.toContain('X1')
    expect(coveredLessonIds(withExtra, 'X1')).toHaveLength(35)
  })
  it('unknown or review current gives all non-review', () => {
    expect(coveredLessonIds(lessons, 'nope')).toHaveLength(35)
    expect(coveredLessonIds(lessons, 'R-10')).toHaveLength(35)
  })
})

describe('isSameLocalDay', () => {
  it('compares local calendar days', () => {
    expect(isSameLocalDay(new Date(2026, 0, 1, 0, 1), new Date(2026, 0, 1, 23, 59))).toBe(true)
    expect(isSameLocalDay(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1))).toBe(false)
  })
})

describe('dailyQueue', () => {
  const cards = [card('a', 'L1'), card('b', 'L1'), card('c', 'L1'), card('d', 'L2'), card('x', 'L9')]
  const args = (over: object = {}) => ({
    now, cards, states: [] as CardState[], lessons, settings: { ...settings(2), currentLessonId: 'L2' }, isDue, ...over,
  })

  it('due sorted ascending, excludes future', () => {
    const states = [
      state('a', '2026-01-09T00:00:00.000Z'),
      state('b', '2026-01-05T00:00:00.000Z'),
      state('c', '2026-02-01T00:00:00.000Z'),
    ]
    expect(dailyQueue(args({ states })).due.map((s) => s.cardId)).toEqual(['b', 'a'])
  })
  it('with a focus, due cards from focus lessons come first, each group by due date', () => {
    const states = [
      state('a', '2026-01-05T00:00:00.000Z'),
      state('d', '2026-01-09T00:00:00.000Z'),
      state('b', '2026-01-07T00:00:00.000Z'),
    ]
    expect(dailyQueue(args({ states, focusLessonIds: ['L2'] })).due.map((s) => s.cardId)).toEqual(['d', 'a', 'b'])
  })
  it('with a focus, new cards from focus lessons are introduced first', () => {
    expect(dailyQueue(args({ focusLessonIds: ['L2'] })).fresh.map((c) => c.id)).toEqual(['d', 'a'])
  })
  it('fresh starts at the current lesson and works back, within the cap and the covered range', () => {
    expect(dailyQueue(args()).fresh.map((c) => c.id)).toEqual(['d', 'a'])
    const all = dailyQueue(args({ settings: { ...settings(10), currentLessonId: 'L2' } })).fresh.map((c) => c.id)
    expect(all).toEqual(['d', 'a', 'b', 'c'])
  })
  it('with no current lesson set, fresh runs from the first lesson up', () => {
    const all = dailyQueue(args({ settings: settings(10) })).fresh.map((c) => c.id)
    expect(all).toEqual(['a', 'b', 'c', 'd', 'x'])
  })
  it('a student well into the course meets the current lesson first, and nothing from later lessons', () => {
    const many = [card('l1', 'L1'), card('l8', 'L8'), card('l9a', 'L9'), card('l9b', 'L9'), card('l10', 'L10')]
    const r = dailyQueue(args({ cards: many, settings: { ...settings(10), currentLessonId: 'L9' } }))
    expect(r.fresh.map((c) => c.id)).toEqual(['l9a', 'l9b', 'l8', 'l1'])
  })
  it('cards for a problem type missed lately come before the focus lessons and everything else', () => {
    const typed = [
      card('a', 'L1'),
      { ...card('m', 'L1'), typeIds: ['L1-x'] },
      card('d', 'L2'),
      { ...card('later', 'L9'), typeIds: ['L1-x'] },
    ] as ConceptCard[]
    const r = dailyQueue(args({ cards: typed, settings: { ...settings(10), currentLessonId: 'L2' }, focusLessonIds: ['L2'], recentMissTypeIds: ['L1-x'] }))
    // 'later' supports the type but its lesson is not covered yet
    expect(r.fresh.map((c) => c.id)).toEqual(['m', 'd', 'a'])
  })
  it('a missed type that no card supports changes nothing', () => {
    expect(dailyQueue(args({ recentMissTypeIds: ['L1-zzz'] })).fresh.map((c) => c.id)).toEqual(['d', 'a'])
  })
  it('cards with state are not fresh', () => {
    const states = [state('d', '2026-02-01T00:00:00.000Z')]
    expect(dailyQueue(args({ states })).fresh.map((c) => c.id)).toEqual(['a', 'b'])
  })
  it('introduced today counts against cap', () => {
    const intro = now.toISOString()
    const states = [state('a', '2026-02-01T00:00:00.000Z', intro), state('b', '2026-02-01T00:00:00.000Z', intro)]
    const r = dailyQueue(args({ states, settings: { ...settings(3), currentLessonId: 'L2' } }))
    expect(r.fresh).toHaveLength(1)
  })
  it('Review Focus 1: introduced 23:50 yesterday local does not count', () => {
    const states = [state('a', '2026-02-01T00:00:00.000Z', new Date(2026, 0, 1, 23, 50).toISOString())]
    const r = dailyQueue(args({ states, now: new Date(2026, 0, 2, 0, 10), settings: { ...settings(1), currentLessonId: 'L2' } }))
    expect(r.fresh.map((c) => c.id)).toEqual(['d'])
  })
  it('cap never negative', () => {
    const intro = now.toISOString()
    const states = [state('a', '2026-02-01T00:00:00.000Z', intro), state('b', '2026-02-01T00:00:00.000Z', intro)]
    expect(dailyQueue(args({ states, settings: { ...settings(1), currentLessonId: 'L2' } })).fresh).toEqual([])
  })
})

describe('promoteCardsForTypes', () => {
  const cards = [
    { ...card('a', 'L23'), typeIds: ['L23-x'] },
    { ...card('b', 'L23'), typeIds: ['L23-x', 'L23-y'] },
    { ...card('c', 'L23'), typeIds: ['L23-y'] },
    card('plain', 'L23'),
  ] as ConceptCard[]
  const tomorrow = '2026-01-11T12:00:00.000Z'
  it('brings forward only started, not-yet-due cards that support the missed type, without mutating', () => {
    const states = [state('a', tomorrow), state('b', '2026-01-01T00:00:00.000Z'), state('c', tomorrow), state('plain', tomorrow)]
    const snapshot = JSON.stringify(states)
    const out = promoteCardsForTypes(states, cards, ['L23-x'], now)
    expect(out.map((s) => s.cardId)).toEqual(['a'])
    expect(out[0].fsrs.dueAt).toBe(now.toISOString())
    expect(JSON.stringify(states)).toBe(snapshot)
    expect(out[0]).not.toBe(states[0])
  })
  it('a card supporting any of several missed types is moved once', () => {
    const states = [state('a', tomorrow), state('b', tomorrow), state('c', tomorrow)]
    expect(promoteCardsForTypes(states, cards, ['L23-x', 'L23-y'], now).map((s) => s.cardId)).toEqual(['a', 'b', 'c'])
  })
  it('a card not started yet has no state to move', () => {
    expect(promoteCardsForTypes([], cards, ['L23-x'], now)).toEqual([])
  })
  it('no types, or a type no card supports, moves nothing', () => {
    const states = [state('a', tomorrow), state('plain', tomorrow)]
    expect(promoteCardsForTypes(states, cards, [], now)).toEqual([])
    expect(promoteCardsForTypes(states, cards, ['L23-zzz'], now)).toEqual([])
  })
})
