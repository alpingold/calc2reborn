import { z } from 'zod'
import { CHOICE_LABELS } from '../content/schema'
import type { ProgressSnapshot } from './types'

export const SNAPSHOT_VERSION = 1

const iso = z.iso.datetime()
const FsrsCardSchema = z.object({
  dueAt: z.iso.datetime(),
  lastReviewAt: z.iso.datetime().nullable(),
  stability: z.number(),
  stabilityFast: z.number(),
  difficulty: z.number(),
  state: z.number(),
  scheduleStatus: z.string(),
  reps: z.number(),
  lapses: z.number(),
  scheduledDays: z.number(),
  learningStep: z.number(),
  cardId: z.string(),
})
const SnapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  exportedAt: iso,
  cardStates: z.array(
    z.object({ cardId: z.string(), introducedAt: iso, fsrs: FsrsCardSchema }),
  ),
  attempts: z.array(
    z.object({
      id: z.string(),
      questionId: z.string(),
      chosen: z.enum(CHOICE_LABELS),
      correct: z.boolean(),
      seconds: z.number(),
      timestamp: iso,
      mode: z.enum(['practice', 'lesson', 'exam', 'mock']),
      sessionId: z.string().optional(),
      examId: z.string().optional(),
      feedback: z.boolean().optional(),
    }),
  ),
  settings: z.object({
    currentLessonId: z.string().nullable(),
    examDate: z.iso.date().nullable(),
    examLessonIds: z.array(z.string()),
    // the same bound the Settings form enforces
    dailyNewCards: z.number().int().min(0).max(100),
  }),
  flags: z
    .array(
      z.object({
        id: z.string(),
        questionId: z.string(),
        reason: z.enum(['answer', 'display', 'unclear']),
        note: z.string(),
        timestamp: iso,
      }),
    )
    .optional(),
  sessions: z
    .array(
      z.object({
        sessionId: z.string().min(1),
        kind: z.enum(['exam', 'mock']),
        examId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        questionIds: z.array(z.string()),
        startedAt: iso,
        finishedAt: iso,
        feedback: z.boolean(),
        correct: z.number().int().min(0),
        total: z.number().int().min(0),
      }),
    )
    .optional(),
  guided: z
    .array(
      z.object({
        problemId: z.string().min(1),
        completedAt: iso,
        steps: z.number().int().min(0),
        firstTryCorrect: z.number().int().min(0),
      }),
    )
    .optional(),
})

function formatPath(path: PropertyKey[]): string {
  let out = ''
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`
    else out += out ? `.${String(seg)}` : String(seg)
  }
  return out
}

export function parseSnapshot(
  raw: unknown,
): { ok: true; snapshot: ProgressSnapshot } | { ok: false; error: string } {
  const r = SnapshotSchema.safeParse(raw)
  if (r.success) {
    // IndexedDB rejects a repeated key mid-import, so a file with one must fail here, before anything changes
    const attemptIds = new Set<string>()
    for (const a of r.data.attempts) {
      if (attemptIds.has(a.id)) return { ok: false, error: `Duplicate attempt id ${a.id}` }
      attemptIds.add(a.id)
    }
    const cardIds = new Set<string>()
    for (const c of r.data.cardStates) {
      if (cardIds.has(c.cardId)) return { ok: false, error: `Duplicate card state ${c.cardId}` }
      cardIds.add(c.cardId)
    }
    const flagIds = new Set<string>()
    for (const f of r.data.flags ?? []) {
      if (flagIds.has(f.id)) return { ok: false, error: `Duplicate report ${f.id}` }
      flagIds.add(f.id)
    }
    const sessionIds = new Set<string>()
    for (const s of r.data.sessions ?? []) {
      if (sessionIds.has(s.sessionId)) return { ok: false, error: `Duplicate session ${s.sessionId}` }
      sessionIds.add(s.sessionId)
    }
    const problemIds = new Set<string>()
    for (const g of r.data.guided ?? []) {
      if (problemIds.has(g.problemId)) return { ok: false, error: `Duplicate guided result ${g.problemId}` }
      problemIds.add(g.problemId)
    }
    return { ok: true, snapshot: r.data as ProgressSnapshot }
  }
  const issue = r.error.issues[0]
  const path = formatPath(issue.path)
  return { ok: false, error: `${path || '(root)'}: ${issue.message}` }
}
