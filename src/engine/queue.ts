import type { CardState, Settings } from '../storage/types'
import { isPlanned } from '../content/schema'
import type { ConceptCard, Lesson } from '../content/schema'

export function coveredLessonIds(lessons: Lesson[], currentLessonId: string | null): string[] {
  const sorted = lessons.filter(isPlanned).sort((a, b) => a.number - b.number)
  const current = currentLessonId === null ? undefined : lessons.find((l) => l.id === currentLessonId)
  const limit = current && isPlanned(current) ? current.number : Infinity
  return sorted.filter((l) => l.number <= limit).map((l) => l.id)
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export interface DailyQueue {
  due: CardState[]
  fresh: ConceptCard[]
}

export function dailyQueue(args: {
  now: Date
  cards: ConceptCard[]
  states: CardState[]
  lessons: Lesson[]
  settings: Settings
  isDue: (s: CardState, now: Date) => boolean
  /** lessons to serve first, such as the lessons on an upcoming exam */
  focusLessonIds?: string[]
}): DailyQueue {
  const { now, cards, states, lessons, settings, isDue } = args
  const focus = new Set(args.focusLessonIds ?? [])
  const lessonOfCard = new Map(cards.map((c) => [c.id, c.lessonId]))
  const unfocused = (lessonId: string | undefined) => (lessonId !== undefined && focus.has(lessonId) ? 0 : 1)
  const due = states
    .filter((s) => isDue(s, now))
    .sort(
      (a, b) =>
        unfocused(lessonOfCard.get(a.cardId)) - unfocused(lessonOfCard.get(b.cardId)) ||
        new Date(a.fsrs.dueAt).getTime() - new Date(b.fsrs.dueAt).getTime(),
    )

  const introducedToday = states.filter((s) => isSameLocalDay(new Date(s.introducedAt), now)).length
  const remaining = Math.max(0, settings.dailyNewCards - introducedToday)

  const covered = coveredLessonIds(lessons, settings.currentLessonId)
  const numberById = new Map(lessons.map((l) => [l.id, l.number]))
  const coveredSet = new Set(covered)
  const haveState = new Set(states.map((s) => s.cardId))
  const fresh = cards
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => coveredSet.has(c.lessonId) && !haveState.has(c.id))
    .sort(
      (x, y) =>
        unfocused(x.c.lessonId) - unfocused(y.c.lessonId) ||
        numberById.get(x.c.lessonId)! - numberById.get(y.c.lessonId)! ||
        x.i - y.i,
    )
    .slice(0, remaining)
    .map(({ c }) => c)
  return { due, fresh }
}

export function pullForward(
  states: CardState[],
  cards: ConceptCard[],
  lessonIds: string[],
  now: Date,
): CardState[] {
  const lessonByCard = new Map(cards.map((c) => [c.id, c.lessonId]))
  const wanted = new Set(lessonIds)
  return states
    .filter((s) => {
      const lid = lessonByCard.get(s.cardId)
      return lid !== undefined && wanted.has(lid) && new Date(s.fsrs.dueAt).getTime() > now.getTime()
    })
    .map((s) => ({ ...s, fsrs: { ...s.fsrs, dueAt: now.toISOString() } }))
}
