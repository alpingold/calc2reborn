import { parseSnapshot, SNAPSHOT_VERSION } from '../storage/snapshot'
import { DEFAULT_SETTINGS } from '../storage/types'
import type { ProgressSnapshot, ProgressStore, Settings } from '../storage/types'
import { pack, unpack } from './codec'
import { mergeProgress, mergeSettings, sameSettings } from './merge'

export interface RemoteRecord {
  version: number
  epoch: string
  data: string
}

/** The server, as the engine sees it. Both calls throw a SyncError when the server cannot be reached. */
export interface SyncApi {
  get(key: string): Promise<RemoteRecord | null>
  /** null: another device wrote first */
  put(key: string, baseVersion: number, epoch: string, data: string): Promise<number | null>
}

export type SyncFailure = 'offline' | 'unavailable' | 'not-found' | 'unreadable' | 'too-large' | 'busy'

export class SyncError extends Error {
  readonly kind: SyncFailure
  constructor(kind: SyncFailure) {
    super(kind)
    this.kind = kind
  }
}

/** What a device remembers between syncs. */
export interface SyncState {
  code: string
  /** which copy on the server this device last agreed with; a different one there means progress was replaced */
  epoch?: string
  /** this device's settings after its last sync */
  settingsBase?: Settings
  lastSyncedAt?: string
}

export interface SyncOutcome {
  state: SyncState
  /** the local store changed */
  pulled: boolean
  /** the settings the device should now use, when they changed */
  settings?: Settings
}

export interface SyncRun {
  store: ProgressStore
  api: SyncApi
  key: string
  state: SyncState
  /**
   * merge: the normal case. join: the code came from another device, so it must already exist.
   * replace: this device's progress was reset or imported and must replace the server's copy.
   */
  mode?: 'merge' | 'join' | 'replace'
  now?: () => Date
  newEpoch?: () => string
}

const TRIES = 4

async function readRemote(record: RemoteRecord): Promise<ProgressSnapshot> {
  let raw: unknown
  try {
    raw = await unpack(record.data)
  } catch {
    throw new SyncError('unreadable')
  }
  const parsed = parseSnapshot(raw)
  if (!parsed.ok) throw new SyncError('unreadable')
  return parsed.snapshot
}

function payload(parts: Pick<ProgressSnapshot, 'attempts' | 'cardStates' | 'sessions' | 'guided'>, settings: Settings, now: Date) {
  const snapshot: ProgressSnapshot = { version: SNAPSHOT_VERSION, exportedAt: now.toISOString(), ...parts, settings, flags: [] }
  return pack(snapshot)
}

export async function syncOnce(run: SyncRun): Promise<SyncOutcome> {
  const { store, api, key, mode = 'merge' } = run
  const now = run.now ?? (() => new Date())
  const newEpoch = run.newEpoch ?? (() => crypto.randomUUID())
  const done = (epoch: string, settings: Settings, pulled: boolean, changed: boolean): SyncOutcome => ({
    state: { code: run.state.code, epoch, settingsBase: settings, lastSyncedAt: now().toISOString() },
    pulled,
    settings: changed ? settings : undefined,
  })

  let pulled = false
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const record = await api.get(key)
    const local = await store.exportAll()

    if (!record || mode === 'replace') {
      if (!record && mode === 'join') throw new SyncError('not-found')
      // nothing there yet, or this device's copy is to stand: start a new epoch so other devices take it whole
      const epoch = mode === 'replace' || !run.state.epoch ? newEpoch() : run.state.epoch
      const version = await api.put(key, record?.version ?? 0, epoch, await payload(local, local.settings, now()))
      if (version === null) continue
      return done(epoch, local.settings, pulled, false)
    }

    const remote = await readRemote(record)

    if (run.state.epoch && record.epoch !== run.state.epoch) {
      // progress was reset or imported on another device: take its copy whole, keeping this device's reports
      await store.importAll({ ...remote, flags: local.flags ?? [] })
      return done(record.epoch, remote.settings, true, !sameSettings(remote.settings, local.settings))
    }

    const merge = mergeProgress(local, remote)
    // a device joining with untouched settings takes the other device's
    const settings = mergeSettings(local.settings, remote.settings, run.state.settingsBase ?? DEFAULT_SETTINGS)
    const { toLocal } = merge
    for (const a of toLocal.attempts) await store.logAttempt(a)
    for (const s of toLocal.sessions) await store.saveSessionRecord(s)
    for (const c of toLocal.cardStates) await store.saveCardState(c)
    for (const g of toLocal.guided) await store.saveGuidedResult(g)
    const settingsChanged = !sameSettings(settings, local.settings)
    if (toLocal.attempts.length + toLocal.sessions.length + toLocal.cardStates.length + toLocal.guided.length > 0) pulled = true

    if (merge.remoteBehind || !sameSettings(settings, remote.settings)) {
      const version = await api.put(key, record.version, record.epoch, await payload(merge.merged, settings, now()))
      // another device wrote in between: what was pulled stays, and the next pass merges with its copy
      if (version === null) continue
    }
    return done(record.epoch, settings, pulled, settingsChanged)
  }
  throw new SyncError('busy')
}
