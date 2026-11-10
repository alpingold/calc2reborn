import type { Content } from '../content'
import type { Attempt, SessionRecord } from './types'

/**
 * Session records rebuilt from attempts, for progress saved before records existed. One record per
 * exam or mock session; practice attempts give none. An exam lists all of its questions; a mock, whose
 * question list was never stored, lists the ones that were answered. Newest first.
 */
export function sessionsFromAttempts(attempts: Attempt[], content: Content): SessionRecord[] {
  const groups = new Map<string, Attempt[]>()
  for (const a of attempts) {
    if (!a.sessionId || (a.mode !== 'exam' && a.mode !== 'mock')) continue
    const list = groups.get(a.sessionId)
    if (list) list.push(a)
    else groups.set(a.sessionId, [a])
  }
  const records: SessionRecord[] = []
  for (const [sessionId, list] of groups) {
    const first = list[0]
    const kind = first.mode === 'mock' ? 'mock' : 'exam'
    const examId = list.find((a) => a.examId)?.examId
    const exam = examId ? content.exams.find((e) => e.id === examId) : undefined
    const answered = [...new Set(list.map((a) => a.questionId))]
    const questionIds = exam ? exam.questions.map((q) => q.id) : answered
    // the last answer logged for a question is the one that counts
    const last = new Map<string, Attempt>()
    for (const a of list) {
      const prev = last.get(a.questionId)
      if (!prev || a.timestamp >= prev.timestamp) last.set(a.questionId, a)
    }
    const times = list.map((a) => a.timestamp).sort()
    const record: SessionRecord = {
      sessionId,
      kind,
      questionIds,
      startedAt: times[0],
      finishedAt: times[times.length - 1],
      feedback: list.some((a) => a.feedback === true),
      correct: [...last.values()].filter((a) => a.correct).length,
      total: questionIds.length,
    }
    if (kind === 'exam' && examId) record.examId = examId
    records.push(record)
  }
  return records.sort((x, y) => (x.finishedAt < y.finishedAt ? 1 : x.finishedAt > y.finishedAt ? -1 : 0))
}
