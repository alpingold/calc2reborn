// The sync endpoint's rules, kept apart from Vercel and Redis so they can be tested and run in dev.
//
// One record per sync key: { version, epoch, data, updatedAt }. `data` is an opaque string the app
// packs and unpacks. A write names the version it was based on and is refused if another device
// wrote first; the app then merges and tries again, so no device overwrites another's progress.

export const MAX_DATA_CHARS = 700_000
export const TTL_SECONDS = 400 * 24 * 60 * 60
export const HOURLY_LIMIT = 2000

const KEY = /^[0-9a-f]{64}$/
const EPOCH = /^[A-Za-z0-9-]{8,64}$/

/**
 * @typedef {{ version: number, epoch: string, data: string, updatedAt: string }} SyncRecord
 * @typedef {{
 *   get(key: string): Promise<SyncRecord | null>,
 *   put(key: string, baseVersion: number, record: { epoch: string, data: string, updatedAt: string }, ttl: number): Promise<number | null>,
 *   hit(ip: string, hour: string): Promise<number>,
 * }} SyncStorage
 */

/**
 * @param {{ method?: string, key?: string, body?: unknown, ip?: string, now?: Date }} req
 * @param {SyncStorage} storage
 * @returns {Promise<{ status: number, json: Record<string, unknown> }>}
 */
export async function handleSync(req, storage) {
  const now = req.now ?? new Date()
  const key = typeof req.key === 'string' ? req.key : ''
  if (!KEY.test(key)) return { status: 400, json: { error: 'Bad sync key' } }
  if (req.method !== 'GET' && req.method !== 'PUT') return { status: 405, json: { error: 'Method not allowed' } }

  const hits = await storage.hit(req.ip || 'unknown', now.toISOString().slice(0, 13))
  if (hits > HOURLY_LIMIT) return { status: 429, json: { error: 'Too many requests' } }

  if (req.method === 'GET') {
    const record = await storage.get(key)
    return record ? { status: 200, json: { ...record } } : { status: 404, json: { error: 'Not found' } }
  }

  const body = /** @type {{ baseVersion?: unknown, epoch?: unknown, data?: unknown }} */ (
    req.body && typeof req.body === 'object' ? req.body : {}
  )
  const { baseVersion, epoch, data } = body
  if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion) || baseVersion < 0) {
    return { status: 400, json: { error: 'Bad baseVersion' } }
  }
  if (typeof epoch !== 'string' || !EPOCH.test(epoch)) return { status: 400, json: { error: 'Bad epoch' } }
  if (typeof data !== 'string' || data.length === 0) return { status: 400, json: { error: 'Bad data' } }
  if (data.length > MAX_DATA_CHARS) return { status: 413, json: { error: 'Too large' } }

  const version = await storage.put(key, baseVersion, { epoch, data, updatedAt: now.toISOString() }, TTL_SECONDS)
  if (version === null) {
    const current = await storage.get(key)
    return { status: 409, json: { error: 'Conflict', version: current?.version ?? 0 } }
  }
  return { status: 200, json: { version } }
}

/** For dev and tests: everything in memory, gone when the process ends. @returns {SyncStorage} */
export function memoryStorage() {
  /** @type {Map<string, SyncRecord>} */
  const records = new Map()
  /** @type {Map<string, number>} */
  const hits = new Map()
  return {
    async get(key) {
      const r = records.get(key)
      return r ? { ...r } : null
    },
    async put(key, baseVersion, record) {
      const current = records.get(key)?.version ?? 0
      if (current !== baseVersion) return null
      records.set(key, { version: current + 1, ...record })
      return current + 1
    },
    async hit(ip, hour) {
      const k = `${ip}:${hour}`
      const n = (hits.get(k) ?? 0) + 1
      hits.set(k, n)
      return n
    },
  }
}

const PUT_SCRIPT = `
local cur = redis.call('HGET', KEYS[1], 'v')
if not cur then cur = '0' end
if cur ~= ARGV[1] then return -1 end
local nv = tonumber(cur) + 1
redis.call('HSET', KEYS[1], 'v', nv, 'e', ARGV[2], 'd', ARGV[3], 't', ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
return nv
`

/**
 * Upstash Redis over its REST API, so the function needs no packages.
 * @param {string} url
 * @param {string} token
 * @param {typeof fetch} [fetchImpl]
 * @returns {SyncStorage}
 */
export function upstashStorage(url, token, fetchImpl = fetch) {
  const base = url.replace(/\/+$/, '')
  /** @param {string} path @param {unknown} body */
  async function call(path, body) {
    const res = await fetchImpl(base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Storage answered ${res.status}`)
    return res.json()
  }
  return {
    async get(key) {
      const { result } = await call('', ['HMGET', `p:${key}`, 'v', 'e', 'd', 't'])
      const [v, e, d, t] = result ?? []
      if (v === null || v === undefined || typeof d !== 'string') return null
      return { version: Number(v), epoch: String(e), data: d, updatedAt: String(t) }
    },
    async put(key, baseVersion, record, ttl) {
      const { result } = await call('', [
        'EVAL',
        PUT_SCRIPT,
        '1',
        `p:${key}`,
        String(baseVersion),
        record.epoch,
        record.data,
        record.updatedAt,
        String(ttl),
      ])
      return Number(result) > 0 ? Number(result) : null
    },
    async hit(ip, hour) {
      const k = `rl:${ip}:${hour}`
      const out = await call('/pipeline', [
        ['INCR', k],
        ['EXPIRE', k, '3900'],
      ])
      return Number(out?.[0]?.result ?? 0)
    },
  }
}
