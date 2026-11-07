import type { Content } from '../content'
import type { Choice, Exam } from '../content/schema'
import type { Attempt } from '../storage/types'

export interface ExamSession {
  sessionId: string
  kind: 'exam' | 'mock'
  examId?: string
  questionIds: string[]
  answers: Record<string, Choice['label']>
  marked: string[]
  startedAt: string
  durationMinutes: number
  // index of the question on screen, so a reload returns to it
  current?: number
}

export const SESSION_KEY = 'ma16200-exam-in-progress'

export function saveSession(s: ExamSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    // quota or private mode: the session simply will not survive a reload
  }
}

function isSession(v: unknown): v is ExamSession {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    typeof s.sessionId === 'string' &&
    (s.kind === 'exam' || s.kind === 'mock') &&
    (s.examId === undefined || typeof s.examId === 'string') &&
    Array.isArray(s.questionIds) &&
    s.questionIds.every((id) => typeof id === 'string') &&
    !!s.answers &&
    typeof s.answers === 'object' &&
    Array.isArray(s.marked) &&
    typeof s.startedAt === 'string' &&
    !Number.isNaN(Date.parse(s.startedAt)) &&
    typeof s.durationMinutes === 'number' &&
    (s.current === undefined || typeof s.current === 'number')
  )
}

export function loadSession(): ExamSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // nothing to clear if storage is unavailable
  }
}

export function remainingSeconds(s: ExamSession, now: Date): number {
  const elapsed = Math.floor((now.getTime() - Date.parse(s.startedAt)) / 1000)
  return Math.max(0, s.durationMinutes * 60 - elapsed)
}

export function finishSession(s: ExamSession, content: Content, now: Date): Attempt[] {
  const answered = s.questionIds.filter((id) => s.answers[id] && content.questionById.has(id))
  const elapsed = Math.max(0, (now.getTime() - Date.parse(s.startedAt)) / 1000)
  const seconds = answered.length ? Math.round((elapsed / answered.length) * 10) / 10 : 0
  const timestamp = now.toISOString()
  return answered.map((questionId) => {
    const chosen = s.answers[questionId]
    const a: Attempt = {
      id: crypto.randomUUID(),
      questionId,
      chosen,
      correct: chosen === content.questionById.get(questionId)!.answer,
      seconds,
      timestamp,
      mode: s.kind,
      sessionId: s.sessionId,
    }
    if (s.kind === 'exam' && s.examId) a.examId = s.examId
    return a
  })
}

export function scoreSession(
  s: ExamSession,
  content: Content,
): { correct: number; total: number; points: number; maxPoints: number } {
  let correct = 0
  let points = 0
  let maxPoints = 0
  for (const id of s.questionIds) {
    const question = content.questionById.get(id)
    if (!question) continue
    maxPoints += question.points
    if (s.answers[id] === question.answer) {
      correct++
      points += question.points
    }
  }
  return { correct, total: s.questionIds.length, points, maxPoints }
}

export function examLabel(exam: Exam): string {
  return exam.exam === 'final' ? 'Final' : `Exam ${exam.exam}`
}

export function examTitle(exam: Exam): string {
  return `${exam.term} ${exam.year} ${examLabel(exam)}`
}
