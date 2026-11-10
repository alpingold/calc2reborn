import { expect, test, vi } from 'vitest'
import { httpApi } from './api'

const key = 'a'.repeat(64)
const answer = (status: number, body: unknown, type = 'application/json') =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type } })) as unknown as typeof fetch

test('get returns the record, or null when the endpoint says nothing is stored', async () => {
  expect(await httpApi(answer(200, { version: 2, epoch: 'e', data: 'd', updatedAt: 't' })).get(key)).toEqual({ version: 2, epoch: 'e', data: 'd' })
  expect(await httpApi(answer(404, { error: 'Not found' })).get(key)).toBeNull()
})

test('a page instead of an answer means the endpoint is not there', async () => {
  // a static host answers every unknown path with the app's own page
  await expect(httpApi(answer(200, '<!doctype html>', 'text/html')).get(key)).rejects.toMatchObject({ kind: 'unavailable' })
  await expect(httpApi(answer(404, 'Not found', 'text/plain')).get(key)).rejects.toMatchObject({ kind: 'unavailable' })
  await expect(httpApi(answer(503, { error: 'Sync is not set up' })).get(key)).rejects.toMatchObject({ kind: 'unavailable' })
})

test('put sends the key and body, and reports a conflict as null', async () => {
  const ok = answer(200, { version: 3 })
  expect(await httpApi(ok).put(key, 2, 'epoch', 'data')).toBe(3)
  const [url, init] = (ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
  expect(url).toBe('/api/sync')
  expect(init.method).toBe('PUT')
  expect(init.headers['x-sync-key']).toBe(key)
  expect(JSON.parse(init.body)).toEqual({ baseVersion: 2, epoch: 'epoch', data: 'data' })
  expect(await httpApi(answer(409, { error: 'Conflict', version: 5 })).put(key, 2, 'epoch', 'data')).toBeNull()
  await expect(httpApi(answer(413, { error: 'Too large' })).put(key, 2, 'epoch', 'data')).rejects.toMatchObject({ kind: 'too-large' })
})

test('no network is reported as offline', async () => {
  const dead = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  }) as unknown as typeof fetch
  await expect(httpApi(dead).get(key)).rejects.toMatchObject({ kind: 'offline' })
})
