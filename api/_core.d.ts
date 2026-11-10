export interface SyncRecord {
  version: number
  epoch: string
  data: string
  updatedAt: string
}
export interface SyncStorage {
  get(key: string): Promise<SyncRecord | null>
  put(key: string, baseVersion: number, record: { epoch: string; data: string; updatedAt: string }, ttl?: number): Promise<number | null>
  hit(ip: string, hour: string): Promise<number>
}
export const MAX_DATA_CHARS: number
export const TTL_SECONDS: number
export const HOURLY_LIMIT: number
export function handleSync(
  req: { method?: string; key?: string; body?: unknown; ip?: string; now?: Date },
  storage: SyncStorage,
): Promise<{ status: number; json: Record<string, unknown> }>
export function memoryStorage(): SyncStorage
export function upstashStorage(url: string, token: string, fetchImpl?: typeof fetch): SyncStorage
