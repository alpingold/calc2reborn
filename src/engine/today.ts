import type { Content } from '../content'
import type { Question } from '../content/schema'
import type { Attempt, CardState, GuidedResult, Settings } from '../storage/types'
import { WEAK_BELOW, typeMastery, type Mastery } from './mastery'
import { dailyQueue, isSameLocalDay } from './queue'
import { examScope, studyLessonIds } from './scope'
import { RETRY_LIMIT, recentMissTypes, retryCandidates } from './select'

// the practise item is done after this many practice answers in a day
export const PRACTISE_TARGET = 10
// how many problem types the practise item names
export const PRACTISE_TYPES = 2

export type PlanItem =
  | { kind: 'review'; due: number; fresh: number; done: boolean }
  | { kind: 'retry'; count: number; done: boolean }
  | { kind: 'practise'; typeIds: string[]; answeredToday: number; done: boolean }

/**
 * The problem types most worth practising, at most `count`: those scored below WEAK_BELOW, lowest
 * first; then untested types of the current lesson; then other untested types in the order given;
 * then, only to fill the list, the rest from the lowest score up.
 */
export function weakestTypes(args: {
  mastery: Map<string, Mastery>
  scopeTypeIds: string[]
  currentLessonTypeIds: string[]
  count: number
}): string[] {
  const { mastery, scopeTypeIds, count } = args
  const current = new Set(args.currentLessonTypeIds)
  const rows = scopeTypeIds.map((id, i) => ({ id, i, score: mastery.get(id)?.score ?? null }))
  const group = (r: (typeof rows)[number]) =>
    r.score === null ? (current.has(r.id) ? 1 : 2) : r.score < WEAK_BELOW ? 0 : 3
  return rows
    .sort((a, b) => {
      const ga = group(a)
      const gb = group(b)
      if (ga !== gb) return ga - gb
      if (a.score !== null && b.score !== null && a.score !== b.score) return a.score - b.score
      return a.i - b.i
    })
    .slice(0, count)
    .map((r) => r.id)
}

/**
 * What the Dashboard suggests for today, in order. An item with nothing to do is left out; one that
 * was finished today stays, marked done. "Today" is the local calendar day of `now`.
 */
export function todayPlan(args: {
  now: Date
  attempts: Attempt[]
  states: CardState[]
  guided: GuidedResult[]
  settings: Settings
  content: Content
  isDue: (s: CardState, now: Date) => boolean
}): PlanItem[] {
  const { now, attempts, states, settings, content, isDue } = args
  const items: PlanItem[] = []
  const today = (iso: string) => isSameLocalDay(new Date(iso), now)
  const scope = examScope(settings, content.lessons, now)
  const lessonIds = studyLessonIds(settings, content.lessons, now)

  // review: the same queue the Review page builds, for cards that still exist
  const known = states.filter((s) => content.cardById.has(s.cardId))
  const queue = dailyQueue({
    now,
    cards: content.cards,
    states: known,
    lessons: content.lessons,
    settings,
    isDue,
    focusLessonIds: scope.active ? scope.lessonIds : undefined,
    recentMissTypeIds: recentMissTypes(attempts, content.questionById, now),
  })
  const left = queue.due.length + queue.fresh.length
  const reviewedToday = known.some((s) => s.fsrs.lastReviewAt !== null && today(s.fsrs.lastReviewAt))
  if (left > 0 || reviewedToday) {
    items.push({ kind: 'review', due: queue.due.length, fresh: queue.fresh.length, done: left === 0 })
  }

  // retry: what was waiting when the day began, less what has been answered since
  const seen = new Set<string>()
  const inScope: Question[] = []
  for (const id of lessonIds) {
    for (const q of content.questionsByLesson.get(id) ?? []) {
      if (!seen.has(q.id)) {
        seen.add(q.id)
        inScope.push(q)
      }
    }
  }
  const before = attempts.filter((a) => !today(a.timestamp) && new Date(a.timestamp) < now)
  const answeredToday = new Set(attempts.filter((a) => today(a.timestamp)).map((a) => a.questionId))
  const candidates = retryCandidates(before, inScope, now)
  if (candidates.length > 0) {
    const target = Math.min(RETRY_LIMIT, candidates.length)
    const answered = candidates.filter((q) => answeredToday.has(q.id)).length
    const done = answered >= target
    items.push({ kind: 'retry', count: done ? 0 : target - answered, done })
  }

  // practise: the weakest problem types in scope that have a question
  const typesOf = (lessonId: string) =>
    (content.lessonById.get(lessonId)?.problemTypes ?? [])
      .map((t) => t.id)
      .filter((id) => (content.questionsByType.get(id)?.length ?? 0) > 0)
  const scopeTypeIds = lessonIds.flatMap(typesOf)
  if (scopeTypeIds.length > 0) {
    const practised = attempts.filter((a) => a.mode === 'practice' && today(a.timestamp)).length
    items.push({
      kind: 'practise',
      typeIds: weakestTypes({
        mastery: typeMastery(attempts, content.questionById, scopeTypeIds),
        scopeTypeIds,
        currentLessonTypeIds: settings.currentLessonId === null ? [] : typesOf(settings.currentLessonId),
        count: PRACTISE_TYPES,
      }),
      answeredToday: practised,
      done: practised >= PRACTISE_TARGET,
    })
  }
  return items
}
