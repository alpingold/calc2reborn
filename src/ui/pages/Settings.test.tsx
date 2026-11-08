import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Settings } from './Settings'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { buildContent } from '../../content'
import { fixtureLessons, PLANNED_LESSON_COUNT } from '../../test/fixtures'
import type { Scheduler } from '../../engine/fsrs'

const content = buildContent(fixtureLessons(), [], [])
const scheduler = {} as Scheduler

const realCreate = URL.createObjectURL
const realRevoke = URL.revokeObjectURL

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.assign(URL, { createObjectURL: realCreate, revokeObjectURL: realRevoke })
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
  expect(lessonOptions).toHaveLength(PLANNED_LESSON_COUNT)
  await userEvent.selectOptions(select, 'L23')
  expect(lessonOptions.find((o) => o.value === 'L23')!.textContent).toMatch(/^L23: /)
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

test('exam date and an exam lesson range persist', async () => {
  const store = await setup()
  await userEvent.type(screen.getByLabelText('Exam date'), '2026-12-10')
  const exam = screen.getByRole('group', { name: 'Lessons on the exam' })
  expect(within(exam).queryByLabelText('To')).not.toBeInTheDocument()
  await userEvent.selectOptions(within(exam).getByLabelText('From'), 'L19')
  // picking a start fills the end with the same lesson
  expect(within(exam).getByLabelText('To')).toHaveValue('L19')
  await userEvent.selectOptions(within(exam).getByLabelText('To'), 'L21')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  const s = await store.getSettings()
  expect(s.examDate).toBe('2026-12-10')
  expect(s.examLessonIds).toEqual(['L19', 'L20', 'L21'])
})

test('No specific exam clears the exam lessons', async () => {
  const store = new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, examLessonIds: ['L19', 'L20'] })
  await setup(store)
  const exam = screen.getByRole('group', { name: 'Lessons on the exam' })
  await userEvent.selectOptions(within(exam).getByLabelText('From'), '')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Saved')
  expect((await store.getSettings()).examLessonIds).toEqual([])
})

test('lessons saved by the old list show as the span from lowest to highest', async () => {
  const store = new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, examLessonIds: ['L23', 'L19'] })
  await setup(store)
  const exam = screen.getByRole('group', { name: 'Lessons on the exam' })
  expect(within(exam).getByLabelText('From')).toHaveValue('L19')
  expect(within(exam).getByLabelText('To')).toHaveValue('L23')
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
  expect(alert).toHaveTextContent(/version/i)
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
  await store.saveSettings({ ...DEFAULT_SETTINGS, dailyNewCards: 33, currentLessonId: 'L23' })
  const confirm = vi.fn(() => false)
  vi.stubGlobal('confirm', confirm)
  await setup(store)
  await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
  expect(confirm).toHaveBeenCalledWith('Delete all progress? This cannot be undone.')
  expect(await store.listAttempts()).toHaveLength(1)
  confirm.mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
  await vi.waitFor(async () => expect(await store.listAttempts()).toHaveLength(0))
  await vi.waitFor(async () => expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS))
  await vi.waitFor(() => expect(screen.getByLabelText('Daily new cards')).toHaveValue(DEFAULT_SETTINGS.dailyNewCards))
  expect(screen.getByLabelText('Current lesson')).toHaveValue('')
})

const validSnapshot = {
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  cardStates: [],
  attempts: [],
  settings: { ...DEFAULT_SETTINGS, dailyNewCards: 33 },
}
const keptAttempt = {
  id: 'a1',
  questionId: 'q1',
  chosen: 'A' as const,
  correct: true,
  seconds: 5,
  timestamp: '2026-01-01T00:00:00.000Z',
  mode: 'practice' as const,
}

test('a failed export shows an alert', async () => {
  const store = new MemoryStore()
  store.exportAll = async () => {
    throw new Error('boom')
  }
  await setup(store)
  await userEvent.click(screen.getByRole('button', { name: 'Export progress' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not export progress.')
})

test('a failed import shows an alert and leaves progress and settings untouched', async () => {
  const store = new MemoryStore()
  await store.logAttempt(keptAttempt)
  await store.saveSettings({ ...DEFAULT_SETTINGS, dailyNewCards: 12 })
  store.importAll = async () => {
    throw new Error('quota')
  }
  await setup(store)
  const file = new File([JSON.stringify(validSnapshot)], 'p.json', { type: 'application/json' })
  await userEvent.upload(screen.getByLabelText('Import progress'), file)
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not import progress. Your data was not changed.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(await store.listAttempts()).toEqual([keptAttempt])
  expect((await store.getSettings()).dailyNewCards).toBe(12)
  expect(screen.getByLabelText('Daily new cards')).toHaveValue(12)
})

test('an import whose settings cannot be applied says so', async () => {
  const store = new MemoryStore()
  await setup(store)
  store.saveSettings = async () => {
    throw new Error('boom')
  }
  const file = new File([JSON.stringify(validSnapshot)], 'p.json', { type: 'application/json' })
  await userEvent.upload(screen.getByLabelText('Import progress'), file)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Progress imported, but the settings could not be applied. Reload the page.',
  )
})

test('a failed reset shows an alert', async () => {
  const store = new MemoryStore()
  store.clear = async () => {
    throw new Error('boom')
  }
  vi.stubGlobal('confirm', vi.fn(() => true))
  await setup(store)
  await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not reset progress.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('a failed settings save shows an alert', async () => {
  const store = new MemoryStore()
  await setup(store)
  store.saveSettings = async () => {
    throw new Error('boom')
  }
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your settings.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('daily new cards is bounded and an invalid value is flagged on the field', async () => {
  await setup()
  const input = screen.getByLabelText('Daily new cards')
  expect(input).toHaveAttribute('min', '0')
  expect(input).toHaveAttribute('max', '100')
  expect(input).not.toHaveAttribute('aria-invalid')
  await userEvent.clear(input)
  await userEvent.type(input, '500')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription('Enter a number from 0 to 100')
  await userEvent.clear(input)
  await userEvent.type(input, '12')
  expect(input).not.toHaveAttribute('aria-invalid')
})

test('reported problems are listed, copied as text, and removed', async () => {
  const store = new MemoryStore()
  await store.saveFlag({ id: 'f1', questionId: 'x-q1', reason: 'answer', note: 'I get B', timestamp: '2026-11-06T12:00:00.000Z' })
  await store.saveFlag({ id: 'f2', questionId: 'x-q2', reason: 'display', note: '', timestamp: '2026-11-06T13:00:00.000Z' })
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  await setup(store)
  const list = await screen.findByRole('list', { name: 'Reported problems' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  expect(within(list).getByText(/x-q1: Wrong answer\. I get B/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Copy report' }))
  expect(writeText).toHaveBeenCalledWith(
    'MA 16200 study app: 2 reported problems\n- x-q1: Wrong answer. I get B\n- x-q2: Typo or math display.',
  )
  expect(await screen.findByRole('status')).toHaveTextContent('Report copied')
  await userEvent.click(within(list).getAllByRole('button', { name: 'Remove' })[0])
  expect(await store.listFlags()).toHaveLength(1)
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
})

test('with nothing reported, the list is absent', async () => {
  await setup()
  expect(screen.queryByRole('list', { name: 'Reported problems' })).not.toBeInTheDocument()
  expect(screen.getByText('No reported problems.')).toBeInTheDocument()
})
