import { expect, test } from 'vitest'
import { handleSync, memoryStorage } from '../../api/_core.js'
import { MemoryStore } from '../storage/memory'
import { DEFAULT_SETTINGS } from '../storage/types'
import type { Attempt, CardState, Flag, GuidedResult, SessionRecord, Settings } from '../storage/types'
import { codeKey, formatCode, generateCode, normalizeCode } from './code'
import { pack, unpack } from './codec'
import { SyncError, syncOnce } from './engine'
import type { SyncApi, SyncState } from './engine'

/** The real endpoint rules over memory, reached without HTTP. */
function server() {
  const storage = memoryStorage()
  let failNextPut = false
  const api: SyncApi = {
    async get(key) {
      const out = await handleSync({ method: 'GET', key }, storage)
      return out.status === 200 ? (out.json as never) : null
    },
    async put(key, baseVersion, epoch, data) {
      if (failNextPut) {
        failNextPut = false
        // another device gets its write in first
        await handleSync({ method: 'PUT', key, body: { baseVersion, epoch, data: await pack(await other!()) } }, storage)
      }
      const out = await handleSync({ method: 'PUT', key, body: { baseVersion, epoch, data } }, storage)
      return out.status === 200 ? (out.json.version as number) : null
    },
  }
  let other: (() => Promise<unknown>) | undefined
  return {
    api,
    storage,
    raceWith(snapshot: () => Promise<unknown>) {
      failNextPut = true
      other = snapshot
    },
  }
}

const attempt = (id: string, over: Partial<Attempt> = {}): Attempt => ({
  id,
  questionId: 'e-q1',
  chosen: 'A',
  correct: true,
  seconds: 5,
  timestamp: '2026-11-01T10:00:00.000Z',
  mode: 'practice',
  ...over,
})
const card = (cardId: string, lastReviewAt: string | null, reps = 1): CardState => ({
  cardId,
  introducedAt: '2026-11-01T10:00:00.000Z',
  fsrs: {
    dueAt: '2026-11-05T10:00:00.000Z',
    lastReviewAt,
    stability: 1,
    stabilityFast: 1,
    difficulty: 5,
    state: 2,
    scheduleStatus: 'review',
    reps,
    lapses: 0,
    scheduledDays: 4,
    learningStep: 0,
    cardId,
  },
})
const session = (sessionId: string): SessionRecord => ({
  sessionId,
  kind: 'exam',
  examId: 'e',
  questionIds: ['e-q1'],
  startedAt: '2026-11-01T10:00:00.000Z',
  finishedAt: '2026-11-01T11:00:00.000Z',
  feedback: false,
  correct: 1,
  total: 1,
})
const guided = (problemId: string, completedAt: string, firstTryCorrect = 3): GuidedResult => ({ problemId, completedAt, steps: 5, firstTryCorrect })
const flag: Flag = { id: 'f1', questionId: 'e-q1', reason: 'answer', note: '', timestamp: '2026-11-01T10:00:00.000Z' }

class Device {
  store = new MemoryStore()
  state: SyncState
  key: string
  api: SyncApi
  constructor(api: SyncApi, code: string, key: string) {
    this.api = api
    this.state = { code }
    this.key = key
  }
  async sync(mode?: 'merge' | 'join' | 'replace') {
    const out = await syncOnce({ store: this.store, api: this.api, key: this.key, state: this.state, mode })
    this.state = out.state
    if (out.settings) await this.store.saveSettings(out.settings)
    return out
  }
}

async function pair() {
  const s = server()
  const code = generateCode()
  const key = await codeKey(code)
  return { s, a: new Device(s.api, code, key), b: new Device(s.api, code, key), key }
}
const ids = async (d: Device) => (await d.store.listAttempts()).map((x) => x.id).sort()

test('a code is 16 unambiguous characters and survives being typed with dashes, spaces and lower case', () => {
  const code = generateCode()
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ2-9]{16}$/)
  expect(formatCode('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS')
  expect(normalizeCode(' abcd-efgh jkmn-pqrs ')).toBe('ABCDEFGHJKMNPQRS')
  expect(normalizeCode('ABCD-EFGH-JKMN')).toBeNull()
  expect(normalizeCode('ABCD-EFGH-JKMN-PQR0')).toBeNull()
})

test('the server key is a hash, the same for the same code and different for another', async () => {
  const k = await codeKey('ABCDEFGHJKMNPQRS')
  expect(k).toMatch(/^[0-9a-f]{64}$/)
  expect(await codeKey('ABCDEFGHJKMNPQRS')).toBe(k)
  expect(await codeKey('ABCDEFGHJKMNPQRT')).not.toBe(k)
})

test('packing shrinks a snapshot and unpacking returns it', async () => {
  const value = { attempts: Array.from({ length: 300 }, (_, i) => attempt(`a${i}`)) }
  const packed = await pack(value)
  expect(packed.startsWith('g:')).toBe(true)
  expect(packed.length).toBeLessThan(JSON.stringify(value).length / 4)
  expect(await unpack(packed)).toEqual(value)
  expect(await unpack('j:{"x":1}')).toEqual({ x: 1 })
  await expect(unpack('nonsense')).rejects.toThrow()
})

test('the first device uploads, and a second device joining receives everything', async () => {
  const { a, b } = await pair()
  await a.store.logAttempt(attempt('a1'))
  await a.store.saveCardState(card('c1', '2026-11-02T10:00:00.000Z'))
  await a.store.saveSessionRecord(session('s1'))
  await a.store.saveGuidedResult(guided('L1-g1', '2026-11-02T10:00:00.000Z'))
  await a.store.saveSettings({ ...DEFAULT_SETTINGS, dailyNewCards: 20, currentLessonId: 'L5' })
  expect((await a.sync()).pulled).toBe(false)

  const out = await b.sync('join')
  expect(out.pulled).toBe(true)
  expect(await ids(b)).toEqual(['a1'])
  expect((await b.store.listCardStates()).map((c) => c.cardId)).toEqual(['c1'])
  expect((await b.store.listSessionRecords()).map((r) => r.sessionId)).toEqual(['s1'])
  expect((await b.store.listGuidedResults()).map((g) => g.problemId)).toEqual(['L1-g1'])
  // the joining device had default settings, so it takes the other device's
  expect(out.settings).toMatchObject({ dailyNewCards: 20, currentLessonId: 'L5' })
  expect(b.state.epoch).toBe(a.state.epoch)
})

test('joining with a code nothing is stored under fails and changes nothing', async () => {
  const { b } = await pair()
  await b.store.logAttempt(attempt('b1'))
  await expect(b.sync('join')).rejects.toMatchObject({ kind: 'not-found' })
  expect(await ids(b)).toEqual(['b1'])
})

test('work done on both devices is united, and neither loses anything', async () => {
  const { a, b } = await pair()
  await a.store.logAttempt(attempt('a1'))
  await a.sync()
  await b.store.logAttempt(attempt('b0'))
  await b.sync('join')
  await a.store.logAttempt(attempt('a2'))
  await b.store.logAttempt(attempt('b1'))
  await b.store.saveSessionRecord(session('sb'))
  await a.sync()
  await b.sync()
  await a.sync()
  expect(await ids(a)).toEqual(['a1', 'a2', 'b0', 'b1'])
  expect(await ids(b)).toEqual(['a1', 'a2', 'b0', 'b1'])
  expect((await a.store.listSessionRecords()).map((r) => r.sessionId)).toEqual(['sb'])
})

test('a flashcard and a guided problem keep whichever copy was studied last', async () => {
  const { a, b } = await pair()
  await a.store.saveCardState(card('c1', '2026-11-02T10:00:00.000Z', 1))
  await a.store.saveCardState(card('c2', '2026-11-04T10:00:00.000Z', 3))
  await a.store.saveGuidedResult(guided('L1-g1', '2026-11-02T10:00:00.000Z', 2))
  await a.sync()
  await b.sync('join')
  await b.store.saveCardState(card('c1', '2026-11-03T10:00:00.000Z', 2))
  await b.store.saveGuidedResult(guided('L1-g1', '2026-11-03T10:00:00.000Z', 5))
  await a.store.saveCardState(card('c2', '2026-11-05T10:00:00.000Z', 4))
  await b.sync()
  await a.sync()
  await b.sync()
  for (const d of [a, b]) {
    const cards = new Map((await d.store.listCardStates()).map((c) => [c.cardId, c.fsrs.reps]))
    expect(cards.get('c1')).toBe(2)
    expect(cards.get('c2')).toBe(4)
    expect((await d.store.listGuidedResults())[0].firstTryCorrect).toBe(5)
  }
})

test('settings changed on one device reach the other; a device that changed its own keeps them', async () => {
  const { a, b } = await pair()
  await a.sync()
  await b.sync('join')
  const changed: Settings = { ...DEFAULT_SETTINGS, examDate: '2026-12-01' }
  await a.store.saveSettings(changed)
  await a.sync()
  expect((await b.sync()).settings).toEqual(changed)
  // both change: each device keeps its own on its own sync, and the last to sync is what the server holds
  await a.store.saveSettings({ ...changed, dailyNewCards: 5 })
  await b.store.saveSettings({ ...changed, dailyNewCards: 30 })
  await a.sync()
  expect((await b.sync()).settings).toBeUndefined()
  expect((await b.store.getSettings()).dailyNewCards).toBe(30)
  expect((await a.sync()).settings).toMatchObject({ dailyNewCards: 30 })
})

test('reported problems stay on the device that made them', async () => {
  const { a, b, s, key } = await pair()
  await a.store.saveFlag(flag)
  await a.sync()
  await b.sync('join')
  expect(await b.store.listFlags()).toEqual([])
  const stored = (await unpack((await s.storage.get(key))!.data)) as { flags: unknown[] }
  expect(stored.flags).toEqual([])
})

test('a sync with nothing new writes nothing to the server', async () => {
  const { a, b, s, key } = await pair()
  await a.store.logAttempt(attempt('a1'))
  await a.sync()
  await b.sync('join')
  const version = (await s.storage.get(key))!.version
  await a.sync()
  await b.sync()
  expect((await s.storage.get(key))!.version).toBe(version)
})

test('when another device writes in between, the sync merges with its copy and tries again', async () => {
  const { a, b, s } = await pair()
  await a.sync()
  await b.sync('join')
  await b.store.logAttempt(attempt('b1'))
  await a.store.logAttempt(attempt('a1'))
  s.raceWith(() => b.store.exportAll())
  await a.sync()
  expect(await ids(a)).toEqual(['a1', 'b1'])
  await b.sync()
  expect(await ids(b)).toEqual(['a1', 'b1'])
})

test('a reset on one device replaces the server copy, and the other device takes it whole', async () => {
  const { a, b } = await pair()
  await a.store.logAttempt(attempt('a1'))
  await a.sync()
  await b.sync('join')
  await b.store.saveFlag(flag)
  await b.store.logAttempt(attempt('b1'))
  await a.store.clear()
  await a.sync('replace')
  expect(a.state.epoch).not.toBe(b.state.epoch)
  const out = await b.sync()
  expect(out.pulled).toBe(true)
  expect(await ids(b)).toEqual([])
  // its own reports survive
  expect((await b.store.listFlags()).map((f) => f.id)).toEqual(['f1'])
  expect(b.state.epoch).toBe(a.state.epoch)
  // and nothing flows back to the device that reset
  await a.sync()
  expect(await ids(a)).toEqual([])
})

test('a copy on the server that cannot be read stops the sync and leaves the device alone', async () => {
  const { a, s, key } = await pair()
  await a.store.logAttempt(attempt('a1'))
  await s.storage.put(key, 0, { epoch: 'epoch-0001', data: await pack({ nonsense: true }), updatedAt: 't' })
  await expect(a.sync()).rejects.toBeInstanceOf(SyncError)
  await expect(a.sync()).rejects.toMatchObject({ kind: 'unreadable' })
  expect(await ids(a)).toEqual(['a1'])
})
