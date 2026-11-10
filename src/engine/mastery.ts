import type { Attempt } from '../storage/types'
import { isPlanned } from '../content/schema'
import type { Lesson, Question, Unit } from '../content/schema'

export interface Mastery {
  score: number | null // null = untested
  attempts: number
}

export const MASTERY_ALPHA = 0.3
export const MIN_ATTEMPTS = 3
export const WEAK_BELOW = 0.7

/**
 * Mastery for any grouping of questions. `keysOf` says which groups a question counts toward; a
 * question in two groups counts toward both, and one in none (or no longer in the content) is ignored.
 * A group has no score until it has MIN_ATTEMPTS answers; after that, later answers weigh more.
 */
export function groupMastery(
  attempts: Attempt[],
  keysOf: (questionId: string) => readonly string[],
  keys: string[],
): Map<string, Mastery> {
  const sorted = attempts
    .map((a, i) => ({ a, i }))
    .sort((x, y) =>
      x.a.timestamp < y.a.timestamp ? -1 : x.a.timestamp > y.a.timestamp ? 1 : x.i - y.i,
    )
    .map((x) => x.a)
  const wanted = new Set(keys)
  const byKey = new Map<string, Attempt[]>()
  for (const a of sorted) {
    for (const key of new Set(keysOf(a.questionId))) {
      if (!wanted.has(key)) continue
      const list = byKey.get(key)
      if (list) list.push(a)
      else byKey.set(key, [a])
    }
  }
  const result = new Map<string, Mastery>()
  for (const key of keys) {
    const mine = byKey.get(key) ?? []
    let score: number | null = null
    if (mine.length >= MIN_ATTEMPTS) {
      score = mine[0].correct ? 1 : 0
      for (const a of mine.slice(1)) {
        score = MASTERY_ALPHA * (a.correct ? 1 : 0) + (1 - MASTERY_ALPHA) * score
      }
    }
    result.set(key, { score, attempts: mine.length })
  }
  return result
}

export function lessonMastery(
  attempts: Attempt[],
  questionById: Map<string, Question>,
  lessonIds: string[],
): Map<string, Mastery> {
  return groupMastery(attempts, (id) => questionById.get(id)?.lessonIds ?? [], lessonIds)
}

/** Mastery per problem type, by the same rule as lessons. */
export function typeMastery(
  attempts: Attempt[],
  questionById: Map<string, Question>,
  typeIds: string[],
): Map<string, Mastery> {
  return groupMastery(attempts, (id) => questionById.get(id)?.typeIds ?? [], typeIds)
}

export function unitMastery(lessons: Lesson[], byLesson: Map<string, Mastery>): Map<Unit, Mastery> {
  const groups = new Map<Unit, Mastery[]>()
  for (const l of lessons) {
    if (!isPlanned(l) || l.unit === null) continue
    const list = groups.get(l.unit) ?? []
    list.push(byLesson.get(l.id) ?? { score: null, attempts: 0 })
    groups.set(l.unit, list)
  }
  const result = new Map<Unit, Mastery>()
  for (const [unit, ms] of groups) {
    const scored = ms.filter((m) => m.score !== null)
    result.set(unit, {
      score: scored.length ? scored.reduce((s, m) => s + (m.score as number), 0) / scored.length : null,
      attempts: ms.reduce((s, m) => s + m.attempts, 0),
    })
  }
  return result
}

export function isWeak(m: Mastery): boolean {
  return m.score !== null && m.score < WEAK_BELOW
}
