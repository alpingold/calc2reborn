import { SyncError } from './engine'
import type { SyncApi } from './engine'

/** The app's own /api/sync endpoint. */
export function httpApi(fetchImpl: typeof fetch = (...args) => fetch(...args), url = '/api/sync'): SyncApi {
  async function call(key: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetchImpl(url, { ...init, headers: { 'x-sync-key': key, ...init.headers }, cache: 'no-store' })
    } catch {
      throw new SyncError('offline')
    }
    if (res.status === 413) throw new SyncError('too-large')
    return res
  }
  return {
    async get(key) {
      const res = await call(key, { method: 'GET' })
      if (res.status === 404) {
        // a 404 from the endpoint itself carries JSON; one without means the endpoint is not there
        const body = await res.json().catch(() => null)
        if (body && typeof body === 'object' && 'error' in body) return null
        throw new SyncError('unavailable')
      }
      if (!res.ok) throw new SyncError('unavailable')
      const body = (await res.json().catch(() => null)) as { version?: unknown; epoch?: unknown; data?: unknown } | null
      if (!body || typeof body.version !== 'number' || typeof body.epoch !== 'string' || typeof body.data !== 'string') {
        throw new SyncError('unavailable')
      }
      return { version: body.version, epoch: body.epoch, data: body.data }
    },
    async put(key, baseVersion, epoch, data) {
      const res = await call(key, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion, epoch, data }),
      })
      if (res.status === 409) return null
      if (!res.ok) throw new SyncError('unavailable')
      const body = (await res.json().catch(() => null)) as { version?: unknown } | null
      if (!body || typeof body.version !== 'number') throw new SyncError('unavailable')
      return body.version
    },
  }
}
