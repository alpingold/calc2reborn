import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSettings, useStore } from '../storage/context'
import { httpApi } from './api'
import { codeKey, generateCode, normalizeCode } from './code'
import { SyncError, syncOnce } from './engine'
import type { SyncApi, SyncFailure, SyncState } from './engine'
import { onWrite, quietly, unwatched } from './writes'

const STORAGE_KEY = 'ma16200-sync'
/** how long after the last saved answer a sync starts, and the longest a change waits while answers keep coming */
export const QUIET_MS = 15_000
export const MAX_WAIT_MS = 60_000
/** coming back to the tab syncs if the last one is older than this */
const STALE_MS = 60_000

export interface SyncValue {
  /** null while sync is off on this device */
  code: string | null
  busy: boolean
  error: SyncFailure | null
  lastSyncedAt: string | null
  /** goes up each time a sync brings in progress from another device */
  dataVersion: number
  /** turn sync on with a new code for this device's progress */
  start(): Promise<boolean>
  /** turn sync on with a code from another device */
  join(input: string): Promise<boolean>
  /** stop syncing here; progress stays on this device and on the server */
  stop(): void
  syncNow(): Promise<boolean>
  /**
   * A reset or an import: `change` replaces this device's progress, and the result then replaces the
   * server's copy. The two happen together, after any sync already under way, so that sync cannot
   * bring the old progress back in between. Rejects if `change` fails; resolves false if only the upload did.
   */
  replaceRemote(change: () => Promise<void>): Promise<boolean>
}

const SyncContext = createContext<SyncValue | null>(null)

function readState(): SyncState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw) as SyncState
    return typeof state?.code === 'string' && normalizeCode(state.code) ? state : null
  } catch {
    return null
  }
}

function writeState(state: SyncState | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // without storage the code lasts until the page closes
  }
}

export function SyncProvider({ api, quietMs = QUIET_MS, children }: { api?: SyncApi; quietMs?: number; children: ReactNode }) {
  const store = useStore()
  const { save } = useSettings()
  const client = useMemo(() => api ?? httpApi(), [api])
  const [state, setState] = useState<SyncState | null>(readState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SyncFailure | null>(null)
  const [dataVersion, setDataVersion] = useState(0)

  const stateRef = useRef(state)
  // one sync at a time: each waits for the one before it
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const run = useCallback(
    (mode: 'merge' | 'join' | 'replace', from?: SyncState, before?: () => Promise<void>): Promise<boolean> => {
      const next = queue.current.then(async () => {
        if (before) await quietly(before)
        const current = from ?? stateRef.current
        if (!current) return false
        setBusy(true)
        try {
          const out = await syncOnce({ store: unwatched(store), api: client, key: await codeKey(current.code), state: current, mode })
          // sync was stopped, or another code entered, while this ran
          if (!from && stateRef.current?.code !== current.code) return false
          stateRef.current = out.state
          writeState(out.state)
          setState(out.state)
          if (out.settings) await quietly(() => save(out.settings!))
          if (out.pulled || out.settings) setDataVersion((v) => v + 1)
          setError(null)
          return true
        } catch (e) {
          setError(e instanceof SyncError ? e.kind : 'unavailable')
          return false
        } finally {
          setBusy(false)
        }
      })
      queue.current = next.catch(() => {})
      return next
    },
    [store, client, save],
  )

  const start = useCallback(() => run('merge', { code: generateCode() }), [run])
  const join = useCallback(
    async (input: string) => {
      const code = normalizeCode(input)
      if (!code) {
        setError('not-found')
        return false
      }
      return run('join', { code })
    },
    [run],
  )
  const stop = useCallback(() => {
    stateRef.current = null
    writeState(null)
    setState(null)
    setError(null)
  }, [])
  const syncNow = useCallback(() => run('merge'), [run])
  const replaceRemote = useCallback((change: () => Promise<void>) => run('replace', undefined, change), [run])

  const on = state !== null
  useEffect(() => {
    if (!on) return
    let quiet: ReturnType<typeof setTimeout> | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    const fire = () => {
      clearTimeout(quiet)
      clearTimeout(deadline)
      quiet = deadline = undefined
      void run('merge')
    }
    const offWrite = onWrite(() => {
      clearTimeout(quiet)
      quiet = setTimeout(fire, quietMs)
      deadline ??= setTimeout(fire, MAX_WAIT_MS)
    })
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // leaving the tab: send what is waiting now
        if (quiet !== undefined) fire()
        return
      }
      const last = stateRef.current?.lastSyncedAt
      if (!last || Date.now() - Date.parse(last) > STALE_MS) fire()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', fire)
    // once when the app opens
    void run('merge')
    return () => {
      offWrite()
      clearTimeout(quiet)
      clearTimeout(deadline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', fire)
    }
  }, [on, run, quietMs])

  const value = useMemo<SyncValue>(
    () => ({
      code: state?.code ?? null,
      busy,
      error,
      lastSyncedAt: state?.lastSyncedAt ?? null,
      dataVersion,
      start,
      join,
      stop,
      syncNow,
      replaceRemote,
    }),
    [state, busy, error, dataVersion, start, join, stop, syncNow, replaceRemote],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

/** null where the app runs without sync (tests of single pages) */
export function useSync(): SyncValue | null {
  return useContext(SyncContext)
}
