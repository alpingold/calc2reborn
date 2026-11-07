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
  const excluded = new Set<string>()
  const recent = [...sessions.values()]
    .sort((x, y) => (x.latest < y.latest ? 1 : x.latest > y.latest ? -1 : 0))
    .slice(0, EXCLUDED_SESSIONS)
  for (const s of recent) for (const id of s.questionIds) excluded.add(id)

  const seen = new Set<string>()
  const pool: Question[] = []
  for (const lessonId of args.lessonIds) {
    for (const question of args.questionsByLesson.get(lessonId) ?? []) {
      if (seen.has(question.id) || excluded.has(question.id)) continue
      seen.add(question.id)
      pool.push(question)
    }
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(args.rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(args.count ?? MOCK_QUESTION_COUNT, pool.length))
}
