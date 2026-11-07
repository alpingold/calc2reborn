import { afterEach, expect, test, vi } from 'vitest'
import { newId } from './ids'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

test('newId returns distinct version 4 UUIDs', () => {
  const ids = Array.from({ length: 50 }, () => newId())
  for (const id of ids) expect(id).toMatch(UUID)
  expect(new Set(ids).size).toBe(ids.length)
})

test('newId works without crypto.randomUUID, as on a phone over plain http', () => {
  // randomUUID exists only in secure contexts; getRandomValues exists everywhere
  vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
  const ids = Array.from({ length: 50 }, () => newId())
  for (const id of ids) expect(id).toMatch(UUID)
  expect(new Set(ids).size).toBe(ids.length)
})

test('newId works with no Web Crypto at all', () => {
  vi.stubGlobal('crypto', undefined)
  const ids = Array.from({ length: 50 }, () => newId())
  for (const id of ids) expect(id).toMatch(UUID)
  expect(new Set(ids).size).toBe(ids.length)
})
