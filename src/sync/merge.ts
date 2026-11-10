import type { CardState, GuidedResult, ProgressSnapshot, Settings } from '../storage/types'

/**
 * Two copies of one student's progress, joined so that neither loses anything.
 *
 * Answers and finished exams are only ever added, so the two lists are united by id. A flashcard
 * or a guided problem keeps whichever copy was studied last. Reported problems stay on the device
 * that made them and are not part of this.
 */
export interface Merge {
  /** what both sides should hold afterwards (settings are decided separately) */
  merged: Pick<ProgressSnapshot, 'attempts' | 'cardStates' | 'sessions' | 'guided'>
  /** what the local store is missing */
  toLocal: Pick<Required<ProgressSnapshot>, 'attempts' | 'cardStates' | 'sessions' | 'guided'>
  /** the remote copy is missing something the local one has */
  remoteBehind: boolean
}

function time(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : -Infinity
}

/** True when card state `a` was studied after `b`. */
function cardNewer(a: CardState, b: CardState): boolean {
  const ta = time(a.fsrs.lastReviewAt)
  const tb = time(b.fsrs.lastReviewAt)
  if (ta !== tb) return ta > tb
  return a.fsrs.reps > b.fsrs.reps
}

function guidedNewer(a: GuidedResult, b: GuidedResult): boolean {
  return time(a.completedAt) > time(b.completedAt)
}

function union<T>(local: T[], remote: T[], id: (x: T) => string, newer?: (a: T, b: T) => boolean) {
  const byId = new Map(local.map((x) => [id(x), x]))
  const remoteIds = new Set<string>()
  const toLocal: T[] = []
  let remoteBehind = false
  for (const r of remote) {
    const k = id(r)
    remoteIds.add(k)
    const l = byId.get(k)
    if (!l || (newer && newer(r, l))) {
      byId.set(k, r)
      toLocal.push(r)
    } else if (newer && newer(l, r)) {
      remoteBehind = true
    }
  }
  if (local.some((l) => !remoteIds.has(id(l)))) remoteBehind = true
  return { merged: [...byId.values()], toLocal, remoteBehind }
}

export function mergeProgress(local: ProgressSnapshot, remote: ProgressSnapshot): Merge {
  const attempts = union(local.attempts, remote.attempts, (a) => a.id)
  const sessions = union(local.sessions ?? [], remote.sessions ?? [], (s) => s.sessionId)
  const cardStates = union(local.cardStates, remote.cardStates, (c) => c.cardId, cardNewer)
  const guided = union(local.guided ?? [], remote.guided ?? [], (g) => g.problemId, guidedNewer)
  return {
    merged: { attempts: attempts.merged, sessions: sessions.merged, cardStates: cardStates.merged, guided: guided.merged },
    toLocal: { attempts: attempts.toLocal, sessions: sessions.toLocal, cardStates: cardStates.toLocal, guided: guided.toLocal },
    remoteBehind: attempts.remoteBehind || sessions.remoteBehind || cardStates.remoteBehind || guided.remoteBehind,
  }
}

export function sameSettings(a: Settings, b: Settings): boolean {
  return (
    a.currentLessonId === b.currentLessonId &&
    a.examDate === b.examDate &&
    a.dailyNewCards === b.dailyNewCards &&
    a.examLessonIds.length === b.examLessonIds.length &&
    a.examLessonIds.every((id, i) => id === b.examLessonIds[i])
  )
}

/**
 * Settings have no history, so the choice uses `base`, what this device held after its last sync:
 * if the device has changed them since, its settings stand; otherwise the other device's do.
 */
export function mergeSettings(local: Settings, remote: Settings, base: Settings): Settings {
  return sameSettings(local, base) ? remote : local
}
