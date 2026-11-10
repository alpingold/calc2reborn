import { afterEach, expect, test, vi } from 'vitest'
import { storeContract } from './storeContract'
import Dexie from 'dexie'
import { DexieStore } from './dexie'
import type { Attempt, SessionRecord } from './types'

storeContract('DexieStore', async () => {
  const s = new DexieStore('test-' + crypto.randomUUID())
  return s
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('open() rejects when indexedDB is unavailable', async () => {
  vi.stubGlobal('indexedDB', undefined)
  const s = new DexieStore('test-' + crypto.randomUUID())
  await expect(s.open()).rejects.toThrow('IndexedDB is not available')
})

const oldAttempt: Attempt = {
  id: 's1:q1',
  questionId: 'q1',
  chosen: 'A',
  correct: true,
  seconds: 30,
  timestamp: '2026-01-01T10:00:00.000Z',
  mode: 'exam',
  sessionId: 's1',
  examId: 'e1',
}
const rebuilt: SessionRecord = {
  sessionId: 's1',
  kind: 'exam',
  examId: 'e1',
  questionIds: ['q1'],
  startedAt: oldAttempt.timestamp,
  finishedAt: oldAttempt.timestamp,
  feedback: false,
  correct: 1,
  total: 1,
}

/** A database as version 2 of the app left it, holding one exam attempt and one card state. */
async function seedVersion2(name: string) {
  const old = new Dexie(name)
  old.version(1).stores({ cardStates: 'cardId', attempts: 'id, questionId, timestamp, sessionId, mode', settings: 'key' })
  old.version(2).stores({ flags: 'id, timestamp' })
  await old.table('attempts').add(oldAttempt)
  await old.table('settings').add({ key: 'settings', currentLessonId: 'L7', examDate: null, examLessonIds: [], dailyNewCards: 12 })
  old.close()
}

test('upgrading a version 2 database rebuilds session records and keeps everything else', async () => {
  const name = 'test-' + crypto.randomUUID()
  await seedVersion2(name)
  const backfill = vi.fn((attempts: Attempt[]) => (attempts.length === 1 ? [rebuilt] : []))
  const s = new DexieStore(name, backfill)
  expect(await s.listSessionRecords()).toEqual([rebuilt])
  expect(backfill).toHaveBeenCalledTimes(1)
  expect(await s.listAttempts()).toEqual([oldAttempt])
  expect((await s.getSettings()).dailyNewCards).toBe(12)
  expect(await s.listGuidedResults()).toEqual([])
  s.close()

  // opening it again does not run the backfill a second time
  const again = new DexieStore(name, backfill)
  expect(await again.listSessionRecords()).toEqual([rebuilt])
  expect(backfill).toHaveBeenCalledTimes(1)
  again.close()
})

test('a brand new database starts with no session records and never calls the backfill', async () => {
  const backfill = vi.fn(() => [rebuilt])
  const s = new DexieStore('test-' + crypto.randomUUID(), backfill)
  expect(await s.listSessionRecords()).toEqual([])
  expect(backfill).not.toHaveBeenCalled()
  s.close()
})

test('upgrading without a backfill function leaves the new tables empty', async () => {
  const name = 'test-' + crypto.randomUUID()
  await seedVersion2(name)
  const s = new DexieStore(name)
  expect(await s.listSessionRecords()).toEqual([])
  expect(await s.listAttempts()).toEqual([oldAttempt])
  s.close()
})
