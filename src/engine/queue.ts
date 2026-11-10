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
  /** problem types missed lately: new cards that support them are introduced before any others */
  recentMissTypeIds?: string[]
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
  const missed = new Set(args.recentMissTypeIds ?? [])
  // 0: supports a problem type missed lately; 1: a focus lesson; 2: everything else
  const group = (c: ConceptCard) => ((c.typeIds ?? []).some((t) => missed.has(t)) ? 0 : focus.has(c.lessonId) ? 1 : 2)
  // With a current lesson set, the rest start there and work back, so a student who joins mid-course
  // meets this week's material first. With none set, they run from the first lesson up, as before.
  const current = settings.currentLessonId === null ? undefined : lessons.find((l) => l.id === settings.currentLessonId)
  const backwards = current !== undefined && isPlanned(current)
  const fresh = cards
    .map((c, i) => ({ c, i, g: group(c), n: numberById.get(c.lessonId)! }))
    .filter(({ c }) => coveredSet.has(c.lessonId) && !haveState.has(c.id))
    .sort((x, y) => x.g - y.g || (x.g === 2 && backwards ? y.n - x.n : x.n - y.n) || x.i - y.i)
    .slice(0, remaining)
    .map(({ c }) => c)
  return { due, fresh }
}

/**
 * The card states to save after a missed question: the started cards that support one of its problem
 * types, not yet due, brought forward to now. A question with no types moves nothing.
 */
export function promoteCardsForTypes(
  states: CardState[],
  cards: ConceptCard[],
  typeIds: readonly string[],
  now: Date,
): CardState[] {
  const wanted = new Set(typeIds)
  if (wanted.size === 0) return []
  const supports = new Set(cards.filter((c) => (c.typeIds ?? []).some((t) => wanted.has(t))).map((c) => c.id))
  return states
    .filter((s) => supports.has(s.cardId) && new Date(s.fsrs.dueAt).getTime() > now.getTime())
    .map((s) => ({ ...s, fsrs: { ...s.fsrs, dueAt: now.toISOString() } }))
}
