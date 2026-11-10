import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Content } from '../content'
import { createScheduler } from '../engine/fsrs'
import type { Scheduler } from '../engine/fsrs'
import { sessionsFromAttempts } from './backfill'
import { DexieStore } from './dexie'
import { MemoryStore } from './memory'
import { DEFAULT_SETTINGS } from './types'
import type { ProgressStore, Settings } from './types'
import { watchStore } from '../sync/writes'

interface StoreContextValue {
  store: ProgressStore
  scheduler: Scheduler
  content: Content
  fallback: boolean
  settings: Settings
  save(s: Settings): Promise<void>
  rng: () => number
  now: () => Date
}

const StoreContext = createContext<StoreContextValue | null>(null)

const defaultNow = () => new Date()

export interface StoreProviderProps {
  store?: ProgressStore
  scheduler?: Scheduler
  content?: Content
  rng?: () => number
  now?: () => Date
  children: ReactNode
}

interface Ready {
  store: ProgressStore
  scheduler: Scheduler
  content: Content
  fallback: boolean
}

// a dynamic import, so the content is fetched as its own chunk while the scheduler starts
async function loadDefaultContent(): Promise<Content> {
  return (await import('../content/load')).loadContent()
}

async function openDefaultStore(content: Content): Promise<{ store: ProgressStore; fallback: boolean }> {
  try {
    // an older database is upgraded on open; its exam history is rebuilt from the attempts it holds
    const db = new DexieStore(undefined, (attempts) => sessionsFromAttempts(attempts, content))
    await db.open()
    // watched, so sync hears of each saved answer
    return { store: watchStore(db), fallback: false }
  } catch {
    return { store: new MemoryStore(), fallback: true }
  }
}

export function StoreProvider({ store, scheduler, content, rng = Math.random, now = defaultNow, children }: StoreProviderProps) {
  const [ready, setReady] = useState<Ready | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let opened: DexieStore | undefined
    ;(async () => {
      try {
        // content and the scheduler load side by side; the database opens once content is in
        const [loadedContent, sch] = await Promise.all([
          content ?? loadDefaultContent(),
          scheduler ?? createScheduler(),
        ])
        if (cancelled) return
        const { store: s, fallback } = store ? { store, fallback: false } : await openDefaultStore(loadedContent)
        if (!store && s instanceof DexieStore) opened = s
        if (cancelled) {
          // cleanup ran while open() was pending (e.g. StrictMode remount): release the connection
          opened?.close()
          return
        }
        let loaded: Settings = DEFAULT_SETTINGS
        try {
          loaded = await s.getSettings()
        } catch {
          // keep defaults if the store cannot read settings
        }
        if (cancelled) return
        setSettings(loaded)
        setReady({ store: s, scheduler: sch, content: loadedContent, fallback })
      } catch {
        // without a scheduler or store the app cannot run; say so rather than show Loading forever
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      opened?.close()
    }
  }, [store, scheduler, content])

  const activeStore = ready?.store
  const save = useCallback(
    async (s: Settings) => {
      if (!activeStore) throw new Error('Store is not ready')
      await activeStore.saveSettings(s)
      setSettings(s)
    },
    [activeStore],
  )

  const value = useMemo<StoreContextValue | null>(
    () =>
      ready && {
        store: ready.store,
        scheduler: ready.scheduler,
        fallback: ready.fallback,
        content: ready.content,
        settings,
        save,
        rng,
        now,
      },
    [ready, settings, save, rng, now],
  )

  if (failed) return <p role="alert" className="banner">Could not start the app. Reload the page to try again.</p>
  if (!value) return <p className="loading">Loading</p>
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function useCtx(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('StoreProvider is missing')
  return ctx
}

export function useStore(): ProgressStore {
  return useCtx().store
}
export function useScheduler(): Scheduler {
  return useCtx().scheduler
}
export function useContent(): Content {
  return useCtx().content
}
export function useSettings(): { settings: Settings; save(s: Settings): Promise<void> } {
  const { settings, save } = useCtx()
  return useMemo(() => ({ settings, save }), [settings, save])
}
export function useStorageFallback(): boolean {
  return useCtx().fallback
}
export function useRng(): () => number {
  return useCtx().rng
}
export function useNow(): () => Date {
  return useCtx().now
}
