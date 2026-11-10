import type { Attempt } from '../storage/types'
import type { Question } from '../content/schema'

export const MOCK_QUESTION_COUNT = 12
const EXCLUDED_SESSIONS = 2

export interface MockArgs {
  lessonIds: string[]
  questionsByLesson: Map<string, Question[]>
  attempts: Attempt[]
  count?: number
  rng: () => number
}

export function sampleMockExam(args: MockArgs): Question[] {
  const sessions = new Map<string, { latest: string; questionIds: Set<string> }>()
  for (const a of args.attempts) {
    if (a.mode !== 'mock' || !a.sessionId) continue
    const s = sessions.get(a.sessionId) ?? { latest: a.timestamp, questionIds: new Set<string>() }
    if (a.timestamp > s.latest) s.latest = a.timestamp
    s.questionIds.add(a.questionId)
    sessions.set(a.sessionId, s)
  }
  // questions used by the last two mocks, with the time of the latest mock that used each
  const excluded = new Map<string, string>()
  const recent = [...sessions.values()]
    .sort((x, y) => (x.latest < y.latest ? 1 : x.latest > y.latest ? -1 : 0))
    .slice(0, EXCLUDED_SESSIONS)
  for (const s of recent) {
    for (const id of s.questionIds) {
      const prev = excluded.get(id)
      if (prev === undefined || s.latest > prev) excluded.set(id, s.latest)
    }
  }

  const seen = new Set<string>()
  const pool: Question[] = []
  const held: Question[] = []
  for (const lessonId of args.lessonIds) {
    for (const question of args.questionsByLesson.get(lessonId) ?? []) {
      if (seen.has(question.id)) continue
      seen.add(question.id)
      if (excluded.has(question.id)) held.push(question)
      else pool.push(question)
    }
  }

  const shuffle = (list: Question[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(args.rng() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
  }
  shuffle(pool)
  const count = args.count ?? MOCK_QUESTION_COUNT
  if (pool.length < count && held.length > 0) {
    // a narrow range runs out of unseen questions: fill up with the ones seen longest ago
    shuffle(held)
    const seenAt = (q: Question) => excluded.get(q.id) ?? ''
    held.sort((x, y) => (seenAt(x) < seenAt(y) ? -1 : seenAt(x) > seenAt(y) ? 1 : 0))
    pool.push(...held)
  }
  return pool.slice(0, Math.min(count, pool.length))
}
