import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { handleSync, memoryStorage } from '../../api/_core.js'
import { Settings } from './pages/Settings'
import { StoreProvider } from '../storage/context'
import { MemoryStore } from '../storage/memory'
import { DEFAULT_SETTINGS } from '../storage/types'
import type { Attempt } from '../storage/types'
import { buildContent } from '../content'
import { fixtureLessons } from '../test/fixtures'
import type { Scheduler } from '../engine/fsrs'
import { SyncProvider } from '../sync/context'
import { codeKey, normalizeCode } from '../sync/code'
import { unpack } from '../sync/codec'
import { SyncError } from '../sync/engine'
import type { SyncApi } from '../sync/engine'
import { watchStore } from '../sync/writes'

const content = buildContent(fixtureLessons(), [], [])
const scheduler = {} as Scheduler

function server() {
  const storage = memoryStorage()
  const api: SyncApi = {
    async get(key) {
      const out = await handleSync({ method: 'GET', key }, storage)
      return out.status === 200 ? (out.json as never) : null
    },
    async put(key, baseVersion, epoch, data) {
      const out = await handleSync({ method: 'PUT', key, body: { baseVersion, epoch, data } }, storage)
      return out.status === 200 ? (out.json.version as number) : null
    },
  }
  return { api, storage }
}
type Server = ReturnType<typeof server>

const attempt = (id: string): Attempt => ({
  id,
  questionId: 'e-q1',
  chosen: 'A',
  correct: true,
  seconds: 5,
  timestamp: '2026-11-01T10:00:00.000Z',
  mode: 'practice',
})

async function device(s: Server, store = new MemoryStore(), api: SyncApi = s.api) {
  const view = render(
    <StoreProvider store={watchStore(store)} scheduler={scheduler} content={content}>
      <SyncProvider api={api} quietMs={20}>
        <Settings />
      </SyncProvider>
    </StoreProvider>,
  )
  await screen.findByLabelText('Current lesson')
  return { store, view }
}

async function stored(s: Server, code: string) {
  const record = await s.storage.get(await codeKey(code))
  return record && ((await unpack(record.data)) as { attempts: Attempt[]; settings: typeof DEFAULT_SETTINGS })
}

async function shownCode(): Promise<string> {
  const el = await screen.findByText(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
  return normalizeCode(el.textContent!)!
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

test('turning sync on shows a code and uploads this device\'s progress', async () => {
  const s = server()
  const store = new MemoryStore()
  await store.logAttempt(attempt('a1'))
  await device(s, store)
  expect(screen.getByText(/Progress lives in this browser only/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Turn on sync' }))
  const code = await shownCode()
  expect(await screen.findByText(/^Last synced today at/)).toBeInTheDocument()
  expect((await stored(s, code))!.attempts.map((a) => a.id)).toEqual(['a1'])
  expect(screen.getByText(/while sync is on, on the app's server/)).toBeInTheDocument()
})

test('a code that nothing is stored under is refused and sync stays off', async () => {
  const s = server()
  await device(s)
  await userEvent.type(screen.getByLabelText('Code from another device'), 'ABCD-EFGH-JKMN-PQRS')
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No progress is stored under that code')
  expect(screen.getByRole('button', { name: 'Turn on sync' })).toBeInTheDocument()
  expect(localStorage.getItem('ma16200-sync')).toBeNull()
})

test('something that is not a code is refused without asking the server', async () => {
  const s = server()
  const get = vi.spyOn(s.api, 'get')
  await device(s)
  await userEvent.type(screen.getByLabelText('Code from another device'), 'hello')
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No progress is stored under that code')
  expect(get).not.toHaveBeenCalled()
})

test('a second device entering the code receives the progress and the settings, and stays on after a reload', async () => {
  const s = server()
  const first = new MemoryStore()
  await first.logAttempt(attempt('a1'))
  await first.saveSettings({ ...DEFAULT_SETTINGS, dailyNewCards: 25 })
  const a = await device(s, first)
  await userEvent.click(screen.getByRole('button', { name: 'Turn on sync' }))
  const code = await shownCode()
  await screen.findByText(/^Last synced/)
  a.view.unmount()
  localStorage.clear()

  const b = await device(s)
  await userEvent.type(screen.getByLabelText('Code from another device'), code.toLowerCase())
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }))
  expect(await shownCode()).toBe(code)
  expect((await b.store.listAttempts()).map((x) => x.id)).toEqual(['a1'])
  await waitFor(() => expect(screen.getByLabelText('Daily new cards')).toHaveValue(25))
  expect((await b.store.getSettings()).dailyNewCards).toBe(25)

  b.view.unmount()
  await device(s, b.store)
  expect(await shownCode()).toBe(code)
})

test('a saved change is sent on its own shortly afterwards', async () => {
  const s = server()
  await device(s)
  await userEvent.click(screen.getByRole('button', { name: 'Turn on sync' }))
  const code = await shownCode()
  await screen.findByText(/^Last synced/)
  const input = screen.getByLabelText('Daily new cards')
  await userEvent.clear(input)
  await userEvent.type(input, '40')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(async () => expect((await stored(s, code))!.settings.dailyNewCards).toBe(40))
})

test('resetting with sync on empties the synced copy too, after a warning that says so', async () => {
  const s = server()
  const store = new MemoryStore()
  await store.logAttempt(attempt('a1'))
  await device(s, store)
  await userEvent.click(screen.getByRole('button', { name: 'Turn on sync' }))
  const code = await shownCode()
  await screen.findByText(/^Last synced/)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
  await screen.findByText('Progress reset')
  expect(confirm).toHaveBeenCalledWith('Delete all progress, here and on your synced devices? This cannot be undone.')
  expect((await stored(s, code))!.attempts).toEqual([])
})

test('stopping keeps the progress here and forgets the code', async () => {
  const s = server()
  const store = new MemoryStore()
  await store.logAttempt(attempt('a1'))
  await device(s, store)
  await userEvent.click(screen.getByRole('button', { name: 'Turn on sync' }))
  await shownCode()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: 'Stop syncing on this device' }))
  expect(screen.getByRole('button', { name: 'Turn on sync' })).toBeInTheDocument()
  expect(localStorage.getItem('ma16200-sync')).toBeNull()
  expect(await store.listAttempts()).toHaveLength(1)
})

test('when the server cannot be reached, it says so and the progress stays on the device', async () => {
  const s = server()
  const down: SyncApi = {
    get: async () => {
      throw new SyncError('unavailable')
    },
    put: async () => null,
  }
  const store = new MemoryStore()
  await store.logAttempt(attempt('a1'))
  await device(s, store, down)
  await userEvent.click(screen.getByRole('button', { name: 'Turn on sync' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sync is not available right now')
  expect(screen.getByRole('button', { name: 'Turn on sync' })).toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(1)
})

test('a reset pressed while a sync is under way is not undone by that sync', async () => {
  const s = server()
  const store = new MemoryStore()
  await store.logAttempt(attempt('a1'))
  // every read from the server waits until released, as on a slow connection
  let release: (() => void) | undefined
  let hold = false
  const slow: SyncApi = {
    async get(key) {
      const out = await s.api.get(key)
      if (hold) await new Promise<void>((r) => (release = r))
      return out
    },
    put: s.api.put,
  }
  await device(s, store, slow)
  await userEvent.click(screen.getByRole('button', { name: 'Turn on sync' }))
  const code = await shownCode()
  await screen.findByText(/^Last synced/)

  hold = true
  await userEvent.click(screen.getByRole('button', { name: 'Sync now' }))
  await waitFor(() => expect(release).toBeDefined())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
  hold = false
  release!()
  await screen.findByText('Progress reset')
  expect(await store.listAttempts()).toEqual([])
  expect((await stored(s, code))!.attempts).toEqual([])
})
