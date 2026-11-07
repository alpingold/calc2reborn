import { afterEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { StoreProvider, useNow, useRng, useSettings, useStorageFallback, useStore } from './context'
import { MemoryStore } from './memory'
import { DEFAULT_SETTINGS } from './types'
import type { ProgressStore } from './types'
import { buildContent } from '../content'
import type { Scheduler } from '../engine/fsrs'

const content = buildContent([], [], [])
const fakeScheduler = {} as Scheduler

afterEach(() => {
  vi.unstubAllGlobals()
})

function Probe(props: { onStore: (s: ProgressStore) => void }) {
  const store = useStore()
  const fallback = useStorageFallback()
  props.onStore(store)
  return <p>fallback:{String(fallback)}</p>
}

test('useStore returns the store passed as a prop', async () => {
  const store = new MemoryStore()
  let seen: ProgressStore | undefined
  render(
    <StoreProvider store={store} scheduler={fakeScheduler} content={content}>
      <Probe onStore={(s) => (seen = s)} />
    </StoreProvider>,
  )
  expect(await screen.findByText('fallback:false')).toBeInTheDocument()
  expect(seen).toBe(store)
})

test('falls back to a MemoryStore when indexedDB is unavailable', async () => {
  vi.stubGlobal('indexedDB', undefined)
  let seen: ProgressStore | undefined
  render(
    <StoreProvider scheduler={fakeScheduler} content={content}>
      <Probe onStore={(s) => (seen = s)} />
    </StoreProvider>,
  )
  expect(await screen.findByText('fallback:true')).toBeInTheDocument()
  expect(seen).toBeInstanceOf(MemoryStore)
})

test('renders Loading until the store and scheduler are ready', async () => {
  render(
    <StoreProvider store={new MemoryStore()} content={content}>
      <p>ready</p>
    </StoreProvider>,
  )
  expect(screen.getByText('Loading')).toBeInTheDocument()
  expect(await screen.findByText('ready')).toBeInTheDocument()
  expect(screen.queryByText('Loading')).not.toBeInTheDocument()
})

function SettingsProbe() {
  const { settings, save } = useSettings()
  return (
    <div>
      <p>daily:{settings.dailyNewCards}</p>
      <button onClick={() => save({ ...settings, dailyNewCards: settings.dailyNewCards + 1 })}>bump</button>
    </div>
  )
}

test('useSettings loads settings from the store and saves through it', async () => {
  const store = new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, dailyNewCards: 7 })
  render(
    <StoreProvider store={store} scheduler={fakeScheduler} content={content}>
      <SettingsProbe />
    </StoreProvider>,
  )
  expect(await screen.findByText('daily:7')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'bump' }))
  expect(await screen.findByText('daily:8')).toBeInTheDocument()
  expect((await store.getSettings()).dailyNewCards).toBe(8)
})

function DeterminismProbe() {
  const rng = useRng()
  const now = useNow()
  return (
    <p>
      {rng()}|{now().toISOString()}
    </p>
  )
}

test('useRng and useNow return injected functions', async () => {
  render(
    <StoreProvider
      store={new MemoryStore()}
      scheduler={fakeScheduler}
      content={content}
      rng={() => 0.25}
      now={() => new Date('2026-01-02T03:04:05.000Z')}
    >
      <DeterminismProbe />
    </StoreProvider>,
  )
  expect(await screen.findByText('0.25|2026-01-02T03:04:05.000Z')).toBeInTheDocument()
})
