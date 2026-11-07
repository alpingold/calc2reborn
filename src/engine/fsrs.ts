import { DefaultScheduler } from 'ts-fsrs'
import type { CardState, SerializedFsrsCard } from '../storage/types'

export type Rating = 1 | 2 | 3 | 4 // Again, Hard, Good, Easy

export interface Scheduler {
  newState(cardId: string, now: Date): CardState
  review(state: CardState, rating: Rating, now: Date): CardState
  isDue(state: CardState, now: Date): boolean
  preview(state: CardState, now: Date): Record<Rating, Date>
}

const RATINGS: Rating[] = [1, 2, 3, 4]

export async function createScheduler(): Promise<Scheduler> {
  const s = await DefaultScheduler({ enableFuzz: false })

  type FsrsCard = ReturnType<typeof s.newCard>

  const serialize = (c: FsrsCard): SerializedFsrsCard => ({
    dueAt: c.dueAt.toISOString(),
    lastReviewAt: c.lastReviewAt ? c.lastReviewAt.toISOString() : null,
    stability: c.stability,
    stabilityFast: c.stabilityFast,
    difficulty: c.difficulty,
    state: c.state,
    scheduleStatus: String(c.scheduleStatus),
    reps: c.reps,
    lapses: c.lapses,
    scheduledDays: c.scheduledDays,
    learningStep: c.learningStep,
    cardId: String(c.cardId),
  })

  const revive = (f: SerializedFsrsCard) =>
    ({
      ...f,
      dueAt: new Date(f.dueAt),
      lastReviewAt: f.lastReviewAt ? new Date(f.lastReviewAt) : null,
    }) as unknown as FsrsCard

  return {
    newState(cardId, now) {
      return {
        cardId,
        introducedAt: now.toISOString(),
        fsrs: serialize(s.newCard({ now, cardId })),
      }
    },
    review(state, rating, now) {
      const { card } = s.review({ card: revive(state.fsrs), grade: rating, now })
      return { ...state, fsrs: serialize(card) }
    },
    isDue(state, now) {
      return new Date(state.fsrs.dueAt).getTime() <= now.getTime()
    },
    preview(state, now) {
      const out = {} as Record<Rating, Date>
      for (const r of RATINGS) {
        const { card } = s.review({ card: revive(state.fsrs), grade: r, now })
        out[r] = card.dueAt
      }
      return out
    },
  }
}
