// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { HOURLY_LIMIT, MAX_DATA_CHARS, handleSync, memoryStorage, upstashStorage } from './_core.js'

const key = 'a'.repeat(64)
const put = (baseVersion: number, data = 'x', epoch = 'epoch-0001') => ({ method: 'PUT', key, body: { baseVersion, epoch, data } })

test('a key with nothing stored answers 404', async () => {
  expect((await handleSync({ method: 'GET', key }, memoryStorage())).status).toBe(404)
})

test('a first write creates version 1 and a read returns it', async () => {
  const s = memoryStorage()
  const now = new Date('2026-11-10T12:00:00Z')
  expect(await handleSync({ ...put(0, 'hello'), now }, s)).toEqual({ status: 200, json: { version: 1 } })
  expect(await handleSync({ method: 'GET', key }, s)).toEqual({
    status: 200,
    json: { version: 1, epoch: 'epoch-0001', data: 'hello', updatedAt: now.toISOString() },
  })
})

test('a write based on an old version is refused and leaves the record alone', async () => {
  const s = memoryStorage()
  await handleSync(put(0, 'one'), s)
  await handleSync(put(1, 'two'), s)
  expect(await handleSync(put(1, 'stale'), s)).toEqual({ status: 409, json: { error: 'Conflict', version: 2 } })
  expect((await handleSync({ method: 'GET', key }, s)).json.data).toBe('two')
})

test('bad keys, methods and bodies are refused', async () => {
  const s = memoryStorage()
  expect((await handleSync({ method: 'GET', key: 'short' }, s)).status).toBe(400)
  expect((await handleSync({ method: 'DELETE', key }, s)).status).toBe(405)
  expect((await handleSync({ method: 'PUT', key, body: { baseVersion: -1, epoch: 'epoch-0001', data: 'x' } }, s)).status).toBe(400)
  expect((await handleSync({ method: 'PUT', key, body: { baseVersion: 0, epoch: 'no', data: 'x' } }, s)).status).toBe(400)
  expect((await handleSync({ method: 'PUT', key, body: { baseVersion: 0, epoch: 'epoch-0001', data: '' } }, s)).status).toBe(400)
  expect((await handleSync({ method: 'PUT', key, body: null }, s)).status).toBe(400)
  expect((await handleSync(put(0, 'x'.repeat(MAX_DATA_CHARS + 1)), s)).status).toBe(413)
})

test('one address is cut off after the hourly limit', async () => {
  const s = memoryStorage()
  const now = new Date('2026-11-10T12:00:00Z')
  for (let i = 0; i < HOURLY_LIMIT; i++) await s.hit('1.2.3.4', '2026-11-10T12')
  expect((await handleSync({ method: 'GET', key, ip: '1.2.3.4', now }, s)).status).toBe(429)
  expect((await handleSync({ method: 'GET', key, ip: '5.6.7.8', now }, s)).status).toBe(404)
})

test('the Upstash storage sends Redis commands over REST and reads the answers', async () => {
  const calls: { url: string; body: unknown }[] = []
  const answers: unknown[] = [{ result: ['3', 'epoch-0001', 'packed', '2026-11-10T12:00:00.000Z'] }, { result: 4 }, { result: -1 }, [{ result: 7 }, { result: 1 }], { result: [null, null, null, null] }]
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    return new Response(JSON.stringify(answers.shift()))
  }) as unknown as typeof fetch
  const s = upstashStorage('https://kv.test/', 'tok', fetchImpl)
  expect(await s.get(key)).toEqual({ version: 3, epoch: 'epoch-0001', data: 'packed', updatedAt: '2026-11-10T12:00:00.000Z' })
  expect(calls[0]).toEqual({ url: 'https://kv.test', body: ['HMGET', `p:${key}`, 'v', 'e', 'd', 't'] })
  expect(await s.put(key, 3, { epoch: 'epoch-0001', data: 'new', updatedAt: 't' }, 60)).toBe(4)
  expect((calls[1].body as string[]).slice(2)).toEqual(['1', `p:${key}`, '3', 'epoch-0001', 'new', 't', '60'])
  expect(await s.put(key, 3, { epoch: 'epoch-0001', data: 'new', updatedAt: 't' }, 60)).toBeNull()
  expect(await s.hit('1.2.3.4', 'h')).toBe(7)
  expect(calls[3].url).toBe('https://kv.test/pipeline')
  expect(await s.get(key)).toBeNull()
})
