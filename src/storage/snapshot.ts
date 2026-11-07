import { z } from 'zod'
import { CHOICE_LABELS } from '../content/schema'
import type { ProgressSnapshot } from './types'

export const SNAPSHOT_VERSION = 1

const iso = z.string()
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
    }),
  ),
  settings: z.object({
    currentLessonId: z.string().nullable(),
    examDate: z.string().nullable(),
    examLessonIds: z.array(z.string()),
    dailyNewCards: z.number(),
  }),
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
  if (r.success) return { ok: true, snapshot: r.data as ProgressSnapshot }
  const issue = r.error.issues[0]
  const path = formatPath(issue.path)
  return { ok: false, error: `${path || '(root)'}: ${issue.message}` }
}
