import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import type { Attempt, CardState, ProgressStore, SerializedFsrsCard } from './types'

function att(id: string, timestamp: string, extra: Partial<Attempt> = {}): Attempt {
  return { id, questionId: 'q1', chosen: 'A', correct: true, seconds: 30, timestamp, mode: 'practice', ...extra }
}
const BASE_FSRS: SerializedFsrsCard = {
  dueAt: '2026-01-02T00:00:00.000Z',
  lastReviewAt: null,
  stability: 0,
  stabilityFast: 0,
  difficulty: 0,
  state: 0,
  scheduleStatus: 'new',
  reps: 0,
  lapses: 0,
  scheduledDays: 0,
  learningStep: 0,
  cardId: '',
}
function card(cardId: string, extra: Partial<SerializedFsrsCard> = {}): CardState {
  return { cardId, introducedAt: '2026-01-01T00:00:00.000Z', fsrs: { ...BASE_FSRS, cardId, ...extra } }
}

export function storeContract(name: string, make: () => Promise<ProgressStore>): void {
  describe(name, () => {
    let store: ProgressStore
    beforeEach(async () => {
      store = await make()
    })

    test('logAttempt with an id already stored replaces it rather than adding another', async () => {
      await store.logAttempt(att('a1', '2026-01-01T00:00:00.000Z', { chosen: 'A' }))
      await store.logAttempt(att('a1', '2026-01-02T00:00:00.000Z', { chosen: 'B' }))
      const all = await store.listAttempts()
      expect(all).toHaveLength(1)
      expect(all[0].chosen).toBe('B')
    })

    test('getCardState returns undefined for unknown id', async () => {
      expect(await store.getCardState('nope')).toBeUndefined()
    })

    test('saveCardState then getCardState returns it', async () => {
      await store.saveCardState(card('c1'))
      expect(await store.getCardState('c1')).toEqual(card('c1'))
      expect(await store.listCardStates()).toEqual([card('c1')])
    })

    test('saving the same id twice overwrites', async () => {
      await store.saveCardState(card('c1', { reps: 1 }))
      await store.saveCardState(card('c1', { reps: 2 }))
      expect(await store.getCardState('c1')).toEqual(card('c1', { reps: 2 }))
      expect(await store.listCardStates()).toHaveLength(1)
    })

    test('listAttempts returns ascending by timestamp regardless of insertion order', async () => {
      await store.logAttempt(att('b', '2026-01-02T00:00:00.000Z'))
      await store.logAttempt(att('c', '2026-01-03T00:00:00.000Z'))
      await store.logAttempt(att('a', '2026-01-01T00:00:00.000Z'))
      expect((await store.listAttempts()).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    })

    test('listAttempts filters', async () => {
      await store.logAttempt(att('a', '2026-01-01T00:00:00.000Z', { questionId: 'q1', mode: 'practice', sessionId: 's1' }))
      await store.logAttempt(att('b', '2026-01-02T00:00:00.000Z', { questionId: 'q2', mode: 'exam', sessionId: 's2' }))
      await store.logAttempt(att('c', '2026-01-03T00:00:00.000Z', { questionId: 'q3', mode: 'exam', sessionId: 's1' }))
      const ids = async (f: Parameters<ProgressStore['listAttempts']>[0]) => (await store.listAttempts(f)).map((x) => x.id)
      expect(await ids({ questionIds: ['q1', 'q3'] })).toEqual(['a', 'c'])
      expect(await ids({ mode: 'exam' })).toEqual(['b', 'c'])
      expect(await ids({ sessionId: 's1' })).toEqual(['a', 'c'])
      expect(await ids({ since: '2026-01-02T00:00:00.000Z' })).toEqual(['b', 'c'])
      expect(await ids({ mode: 'exam', sessionId: 's1' })).toEqual(['c'])
      expect(await ids({ questionIds: [] })).toEqual([])
    })

    test('getSettings on a fresh store returns defaults', async () => {
      expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
    })

    test('saveSettings round-trips', async () => {
      const s = { currentLessonId: 'l1', examDate: '2026-12-01', examLessonIds: ['l1'], dailyNewCards: 5 }
      await store.saveSettings(s)
      expect(await store.getSettings()).toEqual(s)
    })

    test('exportAll, clear, importAll reproduces data', async () => {
      await store.saveCardState(card('c1'))
      await store.saveCardState(card('c2'))
      await store.logAttempt(att('a', '2026-01-01T00:00:00.000Z', { sessionId: 's1' }))
      await store.logAttempt(att('b', '2026-01-02T00:00:00.000Z', { mode: 'mock', examId: 'e1' }))
      await store.saveSettings({ currentLessonId: 'l1', examDate: null, examLessonIds: ['l1', 'l2'], dailyNewCards: 7 })
      const snap = await store.exportAll()
      expect(snap.version).toBe(1)
      await store.clear()
      expect(await store.listCardStates()).toEqual([])
      expect(await store.listAttempts()).toEqual([])
      expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
      await store.importAll(snap)
      const after = await store.exportAll()
      expect({ ...after, exportedAt: '' }).toEqual({ ...snap, exportedAt: '' })
    })

    test('importAll replaces existing data', async () => {
      await store.logAttempt(att('old', '2026-01-01T00:00:00.000Z'))
      await store.saveCardState(card('old'))
      await store.importAll({
        version: 1,
        exportedAt: '2026-02-01T00:00:00.000Z',
        cardStates: [card('new')],
        attempts: [att('new', '2026-02-01T00:00:00.000Z')],
        settings: DEFAULT_SETTINGS,
      })
      expect((await store.listAttempts()).map((x) => x.id)).toEqual(['new'])
      expect((await store.listCardStates()).map((x) => x.cardId)).toEqual(['new'])
    })
  })
}
