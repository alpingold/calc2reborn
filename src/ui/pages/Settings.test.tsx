import { afterEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Settings } from './Settings'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { loadContent } from '../../content'
import type { Scheduler } from '../../engine/fsrs'

const content = loadContent()
const scheduler = {} as Scheduler

afterEach(() => {
  vi.unstubAllGlobals()
})

async function setup(store = new MemoryStore()) {
  render(
    <StoreProvider store={store} scheduler={scheduler} content={content}>
      <Settings />
    </StoreProvider>,
  )
  await screen.findByLabelText('Current lesson')
  return store
}

test('lists only non-review lessons and persists the chosen lesson', async () => {
  const store = await setup()
  const select = screen.getByLabelText('Current lesson') as HTMLSelectElement
  const lessonOptions = Array.from(select.options).filter((o) => o.value !== '')
  expect(lessonOptions).toHaveLength(35)
  await userEvent.selectOptions(select, 'L23')
  expect(lessonOptions.find((o) => o.value === 'L23')!.textContent).toMatch(/^L23 · /)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  expect((await store.getSettings()).currentLessonId).toBe('L23')
})

test('daily new cards persists and invalid values are rejected', async () => {
  const store = await setup()
  const input = screen.getByLabelText('Daily new cards')
  await userEvent.clear(input)
  await userEvent.type(input, '15')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  expect((await store.getSettings()).dailyNewCards).toBe(15)

  await userEvent.clear(input)
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number from 0 to 100')
  await userEvent.clear(input)
  await userEvent.type(input, '-3')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a number from 0 to 100')
  expect((await store.getSettings()).dailyNewCards).toBe(15)
})

test('exam date and exam lessons persist', async () => {
  const store = await setup()
  await userEvent.type(screen.getByLabelText('Exam date'), '2026-12-10')
  await userEvent.selectOptions(screen.getByLabelText('Lessons on the exam'), ['L1', 'L2'])
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  const s = await store.getSettings()
  expect(s.examDate).toBe('2026-12-10')
  expect(s.examLessonIds).toEqual(['L1', 'L2'])
})

test('Export progress downloads a version 1 snapshot', async () => {
  const create = vi.fn((_b: Blob) => 'blob:x')
  const revoke = vi.fn()
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await setup()
  await userEvent.click(screen.getByRole('button', { name: 'Export progress' }))
  await vi.waitFor(() => expect(revoke).toHaveBeenCalled())
  const blob = create.mock.calls[0][0]
  expect(blob).toBeInstanceOf(Blob)
  expect(JSON.parse(await blob.text()).version).toBe(1)
})

test('Import progress rejects an invalid snapshot without changing settings', async () => {
  const store = await setup()
  const file = new File([JSON.stringify({ version: 2 })], 'p.json', { type: 'application/json' })
  await userEvent.upload(screen.getByLabelText('Import progress'), file)
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toBeTruthy()
  expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
})

test('Import progress rejects non-JSON', async () => {
  await setup()
  const file = new File(['nope'], 'p.json', { type: 'application/json' })
  await userEvent.upload(screen.getByLabelText('Import progress'), file)
  expect(await screen.findByRole('alert')).toHaveTextContent('Not valid JSON')
})

test('Import progress applies a valid snapshot', async () => {
  const store = await setup()
  const snap = {
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    cardStates: [],
    attempts: [],
    settings: { ...DEFAULT_SETTINGS, dailyNewCards: 33 },
  }
  const file = new File([JSON.stringify(snap)], 'p.json', { type: 'application/json' })
  await userEvent.upload(screen.getByLabelText('Import progress'), file)
  expect(await screen.findByRole('status')).toHaveTextContent('Progress imported')
  expect((await store.getSettings()).dailyNewCards).toBe(33)
  expect(screen.getByLabelText('Daily new cards')).toHaveValue(33)
})

test('Reset progress confirms then clears the store', async () => {
  const store = new MemoryStore()
  await store.logAttempt({
    id: 'a1',
    questionId: 'q1',
    chosen: 'A',
    correct: true,
    seconds: 5,
    timestamp: '2026-01-01T00:00:00.000Z',
    mode: 'practice',
  })
  const confirm = vi.fn(() => false)
  vi.stubGlobal('confirm', confirm)
  await setup(store)
  await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
  expect(confirm).toHaveBeenCalledWith('Delete all progress? This cannot be undone.')
  expect(await store.listAttempts()).toHaveLength(1)
  confirm.mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
  await vi.waitFor(async () => expect(await store.listAttempts()).toHaveLength(0))
})
