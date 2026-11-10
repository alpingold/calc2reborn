import type { ProgressStore } from '../storage/types'

// Lets the sync know that progress changed, without the pages that save it knowing about sync.

const listeners = new Set<() => void>()
let muted = 0
const raw = new WeakMap<ProgressStore, ProgressStore>()

const WRITES = new Set<keyof ProgressStore>(['saveCardState', 'logAttempt', 'saveSettings', 'saveSessionRecord', 'saveGuidedResult'])

export function onWrite(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The same store, announcing each saved answer, card, exam, guided problem or settings change. */
export function watchStore<T extends ProgressStore>(store: T): T {
  const watched = new Proxy(store, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value
      if (!WRITES.has(prop as keyof ProgressStore)) return value.bind(target)
      return async (...args: unknown[]) => {
        const out = await value.apply(target, args)
        if (muted === 0) for (const l of listeners) l()
        return out
      }
    },
  })
  raw.set(watched, store)
  return watched
}

/** The store underneath a watched one: what the sync itself writes through, so it does not announce its own work. */
export function unwatched(store: ProgressStore): ProgressStore {
  return raw.get(store) ?? store
}

export async function quietly<T>(work: () => Promise<T>): Promise<T> {
  muted++
  try {
    return await work()
  } finally {
    muted--
  }
}
