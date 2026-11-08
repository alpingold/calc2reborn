import type { Attempt } from '../storage/types'
import type { Question } from '../content/schema'
import { isWeak, type Mastery } from './mastery'

// a missed question becomes a priority again this many days after the miss
export const MISS_RETURN_DAYS = 1
// a question missed in a practice session comes back after this many other answers
export const RETRY_AFTER = 3
const DAY_MS = 86400000

export interface SelectArgs {
  lessonIds: string[]
  questionsByLesson: Map<string, Question[]>
  mastery: Map<string, Mastery>
  attempts: Attempt[]
  servedThisSession: Set<string>
  now: Date
  rng: () => number
}

export function lessonWeight(m: Mastery | undefined): number {
  if (m === undefined || m.score === null || isWeak(m)) return 3
  return 1 + (1 - m.score)
}

function lastAttempts(attempts: Attempt[]): Map<string, Attempt> {
  const last = new Map<string, Attempt>()
  for (const a of attempts) {
    const prev = last.get(a.questionId)
    if (!prev || a.timestamp > prev.timestamp) last.set(a.questionId, a)
  }
  return last
}

export function pickPracticeQuestion(args: SelectArgs): Question | null {
  const { questionsByLesson, mastery, servedThisSession, now, rng } = args
  const available = (id: string) =>
    (questionsByLesson.get(id) ?? []).filter((x) => !servedThisSession.has(x.id))

  const candidates = args.lessonIds.filter((id) => available(id).length > 0)
  if (candidates.length === 0) return null

  const weights = candidates.map((id) => lessonWeight(mastery.get(id)))
  const total = weights.reduce((s, w) => s + w, 0)
  const r = rng() * total
  let acc = 0
  let lessonId = candidates[candidates.length - 1]
  for (let i = 0; i < candidates.length; i++) {
    acc += weights[i]
    if (acc > r) {
      lessonId = candidates[i]
      break
    }
  }

  const last = lastAttempts(args.attempts)
  const cutoff = now.getTime() - MISS_RETURN_DAYS * DAY_MS
  // tier 0: last answer wrong, at least a day ago; tier 1: never answered; tier 2: the rest, oldest first
  const ranked = available(lessonId).map((question) => {
    const a = last.get(question.id)
    let tier = 2
    if (!a) tier = 1
    else if (!a.correct && new Date(a.timestamp).getTime() <= cutoff) tier = 0
    return { question, tier, ts: a?.timestamp ?? '', key: rng() }
  })
  ranked.sort((x, y) => {
    if (x.tier !== y.tier) return x.tier - y.tier
    if (x.tier === 2) return x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : x.key - y.key
    return x.key - y.key
  })
  return ranked[0].question
}

export interface PendingRetry {
  questionId: string
  /** the number of answers in the session after which it may be served */
  after: number
}

/**
 * The missed question to serve next, if any: the earliest one whose turn has come, or the earliest
 * one at all when nothing else is left to serve.
 */
export function nextRetry(pending: PendingRetry[], answered: number, exhausted: boolean): string | null {
  if (pending.length === 0) return null
  const first = pending.reduce((a, b) => (b.after < a.after ? b : a))
  return first.after <= answered || exhausted ? first.questionId : null
}
