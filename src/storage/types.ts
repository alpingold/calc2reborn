import type { Choice } from '../content/schema'

export type SerializedFsrsCard = {
  dueAt: string
  lastReviewAt: string | null
  stability: number
  stabilityFast: number
  difficulty: number
  state: number
  scheduleStatus: string
  reps: number
  lapses: number
  scheduledDays: number
  learningStep: number
  cardId: string
}

export interface CardState {
  cardId: string
  introducedAt: string
  fsrs: SerializedFsrsCard
}
export type AttemptMode = 'practice' | 'lesson' | 'exam' | 'mock'
export interface Attempt {
  id: string
  questionId: string
  chosen: Choice['label']
  correct: boolean
  seconds: number
  timestamp: string
  mode: AttemptMode
  sessionId?: string
  examId?: string
  // set on attempts from an exam taken with feedback after each answer
  feedback?: boolean
}
export interface Settings {
  currentLessonId: string | null
  examDate: string | null
  examLessonIds: string[]
  dailyNewCards: number
}
export const DEFAULT_SETTINGS: Settings = {
  currentLessonId: null,
  examDate: null,
  examLessonIds: [],
  dailyNewCards: 10,
}
export interface ProgressSnapshot {
  version: 1
  exportedAt: string
  cardStates: CardState[]
  attempts: Attempt[]
  settings: Settings
}
export interface AttemptFilter {
  questionIds?: string[]
  mode?: AttemptMode
  sessionId?: string
  since?: string
}
export interface ProgressStore {
  getCardState(cardId: string): Promise<CardState | undefined>
  saveCardState(state: CardState): Promise<void>
  listCardStates(): Promise<CardState[]>
  logAttempt(a: Attempt): Promise<void>
  listAttempts(filter?: AttemptFilter): Promise<Attempt[]>
  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  exportAll(): Promise<ProgressSnapshot>
  importAll(s: ProgressSnapshot): Promise<void>
  clear(): Promise<void>
}
