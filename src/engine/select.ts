import type { Attempt } from '../storage/types'
import type { Question } from '../content/schema'
import { isWeak, type Mastery } from './mastery'

export const MISSED_RECENCY_DAYS = 7
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
  const cutoff = now.getTime() - MISSED_RECENCY_DAYS * DAY_MS
  const ranked = available(lessonId).map((question) => {
    const a = last.get(question.id)
    let tier = 2
    if (!a) tier = 0
    else if (!a.correct && new Date(a.timestamp).getTime() < cutoff) tier = 1
    return { question, tier, ts: a?.timestamp ?? '', key: rng() }
  })
  ranked.sort((x, y) => {
    if (x.tier !== y.tier) return x.tier - y.tier
    if (x.tier === 2) return x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : x.key - y.key
    return x.key - y.key
  })
  return ranked[0].question
}
