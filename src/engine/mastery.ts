import type { Attempt } from '../storage/types'
import type { Lesson, Question, Unit } from '../content/schema'

export interface Mastery {
  score: number | null // null = untested
  attempts: number
}

export const MASTERY_ALPHA = 0.3
export const MIN_ATTEMPTS = 3
export const WEAK_BELOW = 0.7

export function lessonMastery(
  attempts: Attempt[],
  questionById: Map<string, Question>,
  lessonIds: string[],
): Map<string, Mastery> {
  const sorted = attempts
    .map((a, i) => ({ a, i }))
    .sort((x, y) =>
      x.a.timestamp < y.a.timestamp ? -1 : x.a.timestamp > y.a.timestamp ? 1 : x.i - y.i,
    )
    .map((x) => x.a)
  const result = new Map<string, Mastery>()
  for (const id of lessonIds) {
    const mine = sorted.filter((a) => questionById.get(a.questionId)?.lessonIds.includes(id))
    let score: number | null = null
    if (mine.length >= MIN_ATTEMPTS) {
      score = mine[0].correct ? 1 : 0
      for (const a of mine.slice(1)) {
        score = MASTERY_ALPHA * (a.correct ? 1 : 0) + (1 - MASTERY_ALPHA) * score
      }
    }
    result.set(id, { score, attempts: mine.length })
  }
  return result
}

export function unitMastery(lessons: Lesson[], byLesson: Map<string, Mastery>): Map<Unit, Mastery> {
  const groups = new Map<Unit, Mastery[]>()
  for (const l of lessons) {
    if (l.isReview || l.unit === null) continue
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
