import type { Attempt, AttemptFilter } from './types'

export function filterAttempts(all: Attempt[], f: AttemptFilter = {}): Attempt[] {
  return all
    .filter(
      (a) =>
        (!f.questionIds || f.questionIds.includes(a.questionId)) &&
        (!f.mode || a.mode === f.mode) &&
        (!f.sessionId || a.sessionId === f.sessionId) &&
        (!f.since || a.timestamp >= f.since),
    )
    .sort((x, y) => (x.timestamp < y.timestamp ? -1 : x.timestamp > y.timestamp ? 1 : 0))
}
