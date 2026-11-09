import type { Content } from '../content'
import type { Choice, Exam } from '../content/schema'
import type { Attempt } from '../storage/types'

export interface ExamSession {
  sessionId: string
  kind: 'exam' | 'mock'
  examId?: string
  // a mock's lesson range; sessions saved before ranges were stored have none and match no mock request
  from?: string
  to?: string
  questionIds: string[]
  answers: Record<string, Choice['label']>
  marked: string[]
  startedAt: string
  durationMinutes: number
  // index of the question on screen, so a reload returns to it
  current?: number
  // feedback after each answer: untimed, and checked questions show their answer and lock
  feedback?: boolean
  checked?: string[]
  // seconds spent on each checked question, measured on screen (feedback mode)
  seconds?: Record<string, number>
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
    (s.from === undefined || typeof s.from === 'string') &&
    (s.to === undefined || typeof s.to === 'string') &&
    Array.isArray(s.questionIds) &&
    s.questionIds.every((id) => typeof id === 'string') &&
    !!s.answers &&
    typeof s.answers === 'object' &&
    Array.isArray(s.marked) &&
    typeof s.startedAt === 'string' &&
    !Number.isNaN(Date.parse(s.startedAt)) &&
    typeof s.durationMinutes === 'number' &&
    (s.current === undefined || typeof s.current === 'number') &&
    (s.feedback === undefined || typeof s.feedback === 'boolean') &&
    (s.checked === undefined || (Array.isArray(s.checked) && s.checked.every((id) => typeof id === 'string'))) &&
    (s.seconds === undefined ||
      (!!s.seconds &&
        typeof s.seconds === 'object' &&
        Object.values(s.seconds as Record<string, unknown>).every((v) => typeof v === 'number')))
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

const MOCK_QUESTIONS_KEY = 'ma16200-mock-questions'
const REMEMBERED_MOCKS = 20

function readMockQuestions(): [string, string[]][] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MOCK_QUESTIONS_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as [string, string[]][]) : []
  } catch {
    return []
  }
}

/**
 * Remember which questions a finished mock had. Attempts only record answered questions, so this
 * lets results rebuilt from storage list the unanswered ones too. Kept for the most recent mocks.
 */
export function rememberMockQuestions(sessionId: string, questionIds: string[]): void {
  const kept = readMockQuestions().filter(([id]) => id !== sessionId)
  kept.push([sessionId, questionIds])
  try {
    localStorage.setItem(MOCK_QUESTIONS_KEY, JSON.stringify(kept.slice(-REMEMBERED_MOCKS)))
  } catch {
    // storage unavailable: rebuilt results list only the answered questions
  }
}

export function recallMockQuestions(sessionId: string): string[] | undefined {
  const found = readMockQuestions().find(([id]) => id === sessionId)?.[1]
  return Array.isArray(found) && found.every((q) => typeof q === 'string') ? found : undefined
}

/** Navigation state that resumes the saved session with this id, even one whose time is up. */
export interface ResumeState {
  resume: string
}

export type SessionRequest = { kind: 'exam'; examId: string } | { kind: 'mock'; from: string; to: string }

/** Whether a saved session is the one this request asks for, so it may be restored without asking. */
export function matchesRequest(s: ExamSession, request: SessionRequest): boolean {
  if (request.kind === 'exam') return s.kind === 'exam' && s.examId === request.examId
  return s.kind === 'mock' && s.from !== undefined && s.from === request.from && s.to === request.to
}

/** The page that resumes a session. */
export function sessionUrl(s: ExamSession): string {
  if (s.kind === 'exam') return `/exams/${s.examId ?? ''}`
  if (s.from === undefined || s.to === undefined) return '/exams/mock'
  return `/exams/mock?${new URLSearchParams({ from: s.from, to: s.to }).toString()}`
}

/** A name for a session in progress, such as "Fall 2025 Exam 1" or "Mock exam, Lessons 19 to 26". */
export function sessionTitle(s: ExamSession, content: Content): string {
  if (s.kind === 'exam') {
    const exam = content.exams.find((e) => e.id === s.examId)
    return exam ? examTitle(exam) : 'An exam'
  }
  const from = s.from ? content.lessonById.get(s.from) : undefined
  const to = s.to ? content.lessonById.get(s.to) : undefined
  if (!from || !to) return 'Mock exam'
  return from.id === to.id ? `Mock exam, Lesson ${from.number}` : `Mock exam, Lessons ${from.number} to ${to.number}`
}

export function remainingSeconds(s: ExamSession, now: Date): number {
  const elapsed = Math.floor((now.getTime() - Date.parse(s.startedAt)) / 1000)
  return Math.max(0, s.durationMinutes * 60 - elapsed)
}

export function elapsedSeconds(s: ExamSession, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(s.startedAt)) / 1000))
}

/** Whether a timed session has run out. A feedback session is untimed and never does. */
export function timeIsUp(s: ExamSession, now: Date): boolean {
  return !s.feedback && remainingSeconds(s, now) <= 0
}

export function finishSession(s: ExamSession, content: Content, now: Date): Attempt[] {
  const answered = s.questionIds.filter((id) => s.answers[id] && content.questionById.has(id))
  const elapsed = Math.max(0, (now.getTime() - Date.parse(s.startedAt)) / 1000)
  const average = answered.length ? Math.round((elapsed / answered.length) * 10) / 10 : 0
  const timestamp = now.toISOString()
  return answered.map((questionId) => {
    const chosen = s.answers[questionId]
    const a: Attempt = {
      // fixed per session and question: a resubmit after a partial failure replaces rather than duplicates
      id: `${s.sessionId}:${questionId}`,
      questionId,
      chosen,
      correct: chosen === content.questionById.get(questionId)!.answer,
      seconds: s.seconds?.[questionId] ?? average,
      timestamp,
      mode: s.kind,
      sessionId: s.sessionId,
    }
    if (s.kind === 'exam' && s.examId) a.examId = s.examId
    if (s.feedback) a.feedback = true
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

/** Points to at most one decimal place, with no trailing .0. A sum of 100/12 carries float noise. */
export function formatPoints(points: number): string {
  return String(Math.round(points * 10) / 10)
}

export function examLabel(exam: Exam): string {
  if (exam.unofficial) return exam.title
  return exam.exam === 'final' ? 'Final' : `Exam ${exam.exam}`
}

export function examTitle(exam: Exam): string {
  if (exam.unofficial) return exam.title
  return `${exam.term} ${exam.year} ${examLabel(exam)}`
}
