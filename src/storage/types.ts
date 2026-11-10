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
export type FlagReason = 'answer' | 'display' | 'unclear'
/** A problem a student reported with a question, kept in this browser and carried in the export. */
export interface Flag {
  id: string
  questionId: string
  reason: FlagReason
  note: string
  timestamp: string
}
/** A finished exam or mock, kept so its results can be reopened and listed under Past attempts. */
export interface SessionRecord {
  sessionId: string
  kind: 'exam' | 'mock'
  examId?: string
  /** a mock's lesson range */
  from?: string
  to?: string
  /** in the order shown, including questions left unanswered */
  questionIds: string[]
  startedAt: string
  finishedAt: string
  /** taken with feedback after each answer */
  feedback: boolean
  correct: number
  total: number
}
/** A guided problem the student has worked through; finishing it again replaces the record. */
export interface GuidedResult {
  problemId: string
  completedAt: string
  steps: number
  firstTryCorrect: number
}
export interface ProgressSnapshot {
  version: 1
  exportedAt: string
  cardStates: CardState[]
  attempts: Attempt[]
  settings: Settings
  /** absent in files exported before reports existed */
  flags?: Flag[]
  /** absent in files exported before version 2.0 */
  sessions?: SessionRecord[]
  guided?: GuidedResult[]
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
  saveFlag(f: Flag): Promise<void>
  /** oldest first */
  listFlags(): Promise<Flag[]>
  deleteFlag(id: string): Promise<void>
  saveSessionRecord(r: SessionRecord): Promise<void>
  /** newest first */
  listSessionRecords(): Promise<SessionRecord[]>
  saveGuidedResult(r: GuidedResult): Promise<void>
  listGuidedResults(): Promise<GuidedResult[]>
  exportAll(): Promise<ProgressSnapshot>
  importAll(s: ProgressSnapshot): Promise<void>
  clear(): Promise<void>
}
