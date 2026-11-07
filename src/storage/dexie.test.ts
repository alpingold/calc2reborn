import { afterEach, expect, test, vi } from 'vitest'
import { storeContract } from './storeContract'
import { DexieStore } from './dexie'

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
