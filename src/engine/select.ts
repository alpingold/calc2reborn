import type { Attempt } from '../storage/types'
import type { Question } from '../content/schema'
import { isWeak, type Mastery } from './mastery'

// a missed question becomes a priority again this many days after the miss
export const MISS_RETURN_DAYS = 1
// a question missed in a practice session comes back after this many other answers
export const RETRY_AFTER = 3
const DAY_MS = 86400000

// a retry-only session serves at most this many missed questions
export const RETRY_LIMIT = 5

export interface SelectArgs {
  /** when set, questions come from these problem types and the lessons are not consulted */
  typeIds?: string[]
  questionsByType?: Map<string, Question[]>
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

/** Tier 0: last answer wrong, at least a day ago. Tier 1: never answered. Tier 2: the rest, oldest first. */
function rankByNeed(pool: Question[], attempts: Attempt[], now: Date, rng: () => number): Question[] {
  const last = lastAttempts(attempts)
  const cutoff = now.getTime() - MISS_RETURN_DAYS * DAY_MS
  const ranked = pool.map((question) => {
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
  return ranked.map((r) => r.question)
}

export function pickPracticeQuestion(args: SelectArgs): Question | null {
  const { questionsByLesson, mastery, servedThisSession, now, rng } = args

  if (args.typeIds) {
    // practice by problem type: one pool across the types, with no lesson weighting
    const seen = new Set<string>()
    const pool: Question[] = []
    for (const typeId of args.typeIds) {
      for (const q of args.questionsByType?.get(typeId) ?? []) {
        if (seen.has(q.id) || servedThisSession.has(q.id)) continue
        seen.add(q.id)
        pool.push(q)
      }
    }
    return rankByNeed(pool, args.attempts, now, rng)[0] ?? null
  }

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

  return rankByNeed(available(lessonId), args.attempts, now, rng)[0]
}

/**
 * The questions due a second look: those whose latest answer was wrong at least MISS_RETURN_DAYS ago.
 * The longest-standing miss comes first. A question answered right since then is not included.
 */
export function retryCandidates(attempts: Attempt[], questions: Question[], now: Date): Question[] {
  const last = lastAttempts(attempts)
  const cutoff = now.getTime() - MISS_RETURN_DAYS * DAY_MS
  return questions
    .map((question, i) => ({ question, i, a: last.get(question.id) }))
    .filter((x) => x.a !== undefined && !x.a.correct && new Date(x.a.timestamp).getTime() <= cutoff)
    .sort((x, y) => (x.a!.timestamp < y.a!.timestamp ? -1 : x.a!.timestamp > y.a!.timestamp ? 1 : x.i - y.i))
    .map((x) => x.question)
}

/**
 * Another question of the same problem type as `question`, not yet served this session. One the
 * student has never answered is preferred. Null when the question has no type or no sibling is left.
 */
export function similarQuestion(args: {
  question: Question
  questionsByType: Map<string, Question[]>
  attempts: Attempt[]
  served: Set<string>
  rng: () => number
}): Question | null {
  const { question, questionsByType, attempts, served, rng } = args
  const seen = new Set<string>([question.id])
  const pool: Question[] = []
  for (const typeId of question.typeIds ?? []) {
    for (const q of questionsByType.get(typeId) ?? []) {
      if (seen.has(q.id) || served.has(q.id)) continue
      seen.add(q.id)
      pool.push(q)
    }
  }
  if (pool.length === 0) return null
  const answered = new Set(attempts.map((a) => a.questionId))
  const fresh = pool.filter((q) => !answered.has(q.id))
  const from = fresh.length > 0 ? fresh : pool
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))]
}

// a problem type counts as missed lately for this many days after a wrong answer on it
export const RECENT_MISS_DAYS = 7

/** The problem types of questions answered wrong in the last RECENT_MISS_DAYS, each once. */
export function recentMissTypes(attempts: Attempt[], questionById: Map<string, Question>, now: Date): string[] {
  const since = now.getTime() - RECENT_MISS_DAYS * DAY_MS
  const types = new Set<string>()
  for (const a of attempts) {
    if (a.correct) continue
    const at = new Date(a.timestamp).getTime()
    if (at < since || at > now.getTime()) continue
    for (const t of questionById.get(a.questionId)?.typeIds ?? []) types.add(t)
  }
  return [...types]
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
