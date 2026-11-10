import { beforeEach, describe, expect, test } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import type { Attempt, CardState, Flag, GuidedResult, ProgressStore, SerializedFsrsCard, SessionRecord } from './types'

function att(id: string, timestamp: string, extra: Partial<Attempt> = {}): Attempt {
  return { id, questionId: 'q1', chosen: 'A', correct: true, seconds: 30, timestamp, mode: 'practice', ...extra }
}
function flag(id: string, timestamp: string): Flag {
  return { id, questionId: 'q1', reason: 'answer', note: 'B looks right to me', timestamp }
}
function sess(sessionId: string, finishedAt: string, extra: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId,
    kind: 'exam',
    examId: 'e1',
    questionIds: ['q1', 'q2'],
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt,
    feedback: false,
    correct: 1,
    total: 2,
    ...extra,
  }
}
function guided(problemId: string, firstTryCorrect = 3): GuidedResult {
  return { problemId, completedAt: '2026-01-05T00:00:00.000Z', steps: 4, firstTryCorrect }
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

    test('flags are saved, listed oldest first, and deleted', async () => {
      await store.saveFlag(flag('f2', '2026-01-02T00:00:00.000Z'))
      await store.saveFlag(flag('f1', '2026-01-01T00:00:00.000Z'))
      expect((await store.listFlags()).map((f) => f.id)).toEqual(['f1', 'f2'])
      await store.deleteFlag('f1')
      expect(await store.listFlags()).toEqual([flag('f2', '2026-01-02T00:00:00.000Z')])
    })

    test('flags travel with export and import, and clear removes them', async () => {
      await store.saveFlag(flag('f1', '2026-01-01T00:00:00.000Z'))
      const snap = await store.exportAll()
      expect(snap.flags).toEqual([flag('f1', '2026-01-01T00:00:00.000Z')])
      await store.clear()
      expect(await store.listFlags()).toEqual([])
      await store.importAll(snap)
      expect((await store.listFlags()).map((f) => f.id)).toEqual(['f1'])
    })

    test('importing a file saved before flags existed leaves no flags', async () => {
      await store.saveFlag(flag('old', '2026-01-01T00:00:00.000Z'))
      await store.importAll({ version: 1, exportedAt: '2026-02-01T00:00:00.000Z', cardStates: [], attempts: [], settings: DEFAULT_SETTINGS })
      expect(await store.listFlags()).toEqual([])
    })

    test('session records are saved and listed newest first', async () => {
      await store.saveSessionRecord(sess('s1', '2026-01-02T00:00:00.000Z'))
      await store.saveSessionRecord(sess('s3', '2026-01-04T00:00:00.000Z', { kind: 'mock', examId: undefined, from: 'L1', to: 'L4' }))
      await store.saveSessionRecord(sess('s2', '2026-01-03T00:00:00.000Z'))
      expect((await store.listSessionRecords()).map((r) => r.sessionId)).toEqual(['s3', 's2', 's1'])
      expect((await store.listSessionRecords())[0]).toMatchObject({ kind: 'mock', from: 'L1', to: 'L4', questionIds: ['q1', 'q2'] })
    })

    test('saving a session record again replaces it', async () => {
      await store.saveSessionRecord(sess('s1', '2026-01-02T00:00:00.000Z', { correct: 1 }))
      await store.saveSessionRecord(sess('s1', '2026-01-02T00:00:00.000Z', { correct: 2 }))
      expect(await store.listSessionRecords()).toEqual([sess('s1', '2026-01-02T00:00:00.000Z', { correct: 2 })])
    })

    test('a guided result is kept once per problem, the latest replacing the earlier', async () => {
      await store.saveGuidedResult(guided('L1-g1', 2))
      await store.saveGuidedResult(guided('L1-g2'))
      await store.saveGuidedResult(guided('L1-g1', 4))
      const all = (await store.listGuidedResults()).sort((a, b) => a.problemId.localeCompare(b.problemId))
      expect(all).toEqual([guided('L1-g1', 4), guided('L1-g2')])
    })

    test('a fresh store has no session records or guided results', async () => {
      expect(await store.listSessionRecords()).toEqual([])
      expect(await store.listGuidedResults()).toEqual([])
    })

    test('session records and guided results travel with export and import, and clear removes them', async () => {
      await store.saveSessionRecord(sess('s1', '2026-01-02T00:00:00.000Z'))
      await store.saveGuidedResult(guided('L1-g1'))
      const snap = await store.exportAll()
      expect(snap.sessions).toEqual([sess('s1', '2026-01-02T00:00:00.000Z')])
      expect(snap.guided).toEqual([guided('L1-g1')])
      await store.clear()
      expect(await store.listSessionRecords()).toEqual([])
      expect(await store.listGuidedResults()).toEqual([])
      await store.importAll(snap)
      expect(await store.listSessionRecords()).toEqual([sess('s1', '2026-01-02T00:00:00.000Z')])
      expect(await store.listGuidedResults()).toEqual([guided('L1-g1')])
    })

    test('importing a file from before 2.0 replaces records with none', async () => {
      await store.saveSessionRecord(sess('old', '2026-01-02T00:00:00.000Z'))
      await store.saveGuidedResult(guided('old'))
      await store.importAll({ version: 1, exportedAt: '2026-02-01T00:00:00.000Z', cardStates: [], attempts: [], settings: DEFAULT_SETTINGS })
      expect(await store.listSessionRecords()).toEqual([])
      expect(await store.listGuidedResults()).toEqual([])
    })
  })
}
