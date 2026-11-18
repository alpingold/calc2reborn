import type { Question } from '../content/schema'
import type { Attempt } from '../storage/types'

/** Answers counted plainly: how many were right out of how many. */
export interface Tally {
  right: number
  total: number
}

export type MasteryState = 'untested' | 'weak' | 'ok' | 'strong'

/** The word shown wherever a mastery colour is, so the colour never stands alone. */
export const MASTERY_WORDS: Record<MasteryState, string> = {
  untested: 'Not tested',
  weak: 'Weak',
  ok: 'Getting there',
  strong: 'Strong',
}

export function masteryState(score: number | null): MasteryState {
  if (score === null) return 'untested'
  if (score < 0.7) return 'weak'
  if (score < 0.9) return 'ok'
  return 'strong'
}

/** "Weak, 45%", or "Not tested" before there are enough answers for a score. */
export function masteryLabel(score: number | null): string {
  const word = MASTERY_WORDS[masteryState(score)]
  return score === null ? word : `${word}, ${Math.round(score * 100)}%`
}

/** Every answer so far, counted per problem type. A question of two types counts toward both. */
export function typeTallies(attempts: Attempt[], questionById: Map<string, Question>): Map<string, Tally> {
  const out = new Map<string, Tally>()
  for (const a of attempts) {
    for (const typeId of new Set(questionById.get(a.questionId)?.typeIds ?? [])) {
      const t = out.get(typeId) ?? { right: 0, total: 0 }
      t.total++
      if (a.correct) t.right++
      out.set(typeId, t)
    }
  }
  return out
}

/** "1 of 3", or "Not tested" with no answers yet. */
export function tallyText(t: Tally | undefined): string {
  return t && t.total > 0 ? `${t.right} of ${t.total}` : 'Not tested'
}
