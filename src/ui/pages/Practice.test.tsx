import { expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { Practice } from './Practice'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { buildContent, loadContent } from '../../content'
import { createScheduler } from '../../engine/fsrs'
import type { Choice, Exam, Question } from '../../content/schema'

const NOW = new Date('2026-11-06T12:00:00Z')
const TOMORROW = '2026-11-07T12:00:00.000Z'

const choices: Choice[] = [
  { label: 'A', text: 'alpha' },
  { label: 'B', text: 'beta' },
  { label: 'C', text: 'gamma' },
  { label: 'D', text: 'delta' },
  { label: 'E', text: 'epsilon' },
]

function q(n: number, stem: string, answer: Choice['label']): Question {
  return { id: `t-q${n}`, number: n, points: 6, stem, choices, answer, lessonIds: ['L19'], status: 'reviewed' }
}

const seedExam: Exam = {
  id: 'test-fall-2025-2',
  term: 'Fall',
  year: 2025,
  exam: '2',
  examUrl: '',
  durationMinutes: 60,
  questions: [q(1, 'Stem one', 'C'), q(2, 'Stem two', 'A'), q(3, 'Stem three', 'E')],
}
const STEMS = ['Stem one', 'Stem two', 'Stem three']

const base = loadContent()
const content = buildContent(base.lessons, base.cards, [seedExam])

async function setup(opts: { url?: string; store?: MemoryStore; extra?: ReactNode } = {}) {
  const store = opts.store ?? new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentLessonId: 'L19' })
  const scheduler = await createScheduler()
  const st = scheduler.newState('L19-c01', new Date('2026-11-01T00:00:00Z'))
  await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: TOMORROW } })
  const clock = { t: NOW }
  render(
    <MemoryRouter initialEntries={[opts.url ?? '/practice']}>
      <StoreProvider store={store} scheduler={scheduler} content={content} rng={() => 0} now={() => clock.t}>
        <Practice />
        {opts.extra}
      </StoreProvider>
    </MemoryRouter>,
  )
  await screen.findByText('Stem one')
  return { store, clock }
}

test('answering wrong logs a practice attempt and pulls the L19 card forward to now', async () => {
  const { store, clock } = await setup()
  clock.t = new Date(NOW.getTime() + 8000)
  await userEvent.keyboard('a{Enter}')
  expect(await screen.findByRole('status')).toHaveTextContent('Not quite')
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0]).toMatchObject({
    questionId: 't-q1',
    chosen: 'A',
    correct: false,
    mode: 'practice',
    seconds: 8,
    timestamp: clock.t.toISOString(),
  })
  expect(typeof attempts[0].id).toBe('string')
  expect((await store.getCardState('L19-c01'))!.fsrs.dueAt).toBe(clock.t.toISOString())
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
})

test('answering right logs a correct attempt and leaves the card state untouched', async () => {
  const { store } = await setup()
  await userEvent.keyboard('c{Enter}')
  expect(await screen.findByRole('status')).toHaveTextContent('Correct')
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0]).toMatchObject({ questionId: 't-q1', chosen: 'C', correct: true, mode: 'practice' })
  expect((await store.getCardState('L19-c01'))!.fsrs.dueAt).toBe(TOMORROW)
  expect(screen.getByText('Correct 1 of 1')).toBeInTheDocument()
})

test('revealed answer shows the lesson link', async () => {
  await setup()
  await userEvent.keyboard('a{Enter}')
  await screen.findByRole('status')
  expect(screen.getByRole('link', { name: /Sequences and Series: An Overview/ })).toHaveAttribute(
    'href',
    '/course/L19',
  )
})

test('no question repeats within a session; then shows No more questions in range', async () => {
  await setup()
  const seen: string[] = []
  for (let i = 0; i < 3; i++) {
    const stem = STEMS.find((s) => screen.queryByText(s))!
    expect(stem).toBeDefined()
    seen.push(stem)
    await userEvent.keyboard('a{Enter}')
    await screen.findByRole('status')
    if (i < 2) {
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByRole('button', { name: 'Submit' })
    } else {
      await userEvent.keyboard('{Enter}')
    }
  }
  expect(new Set(seen).size).toBe(3)
  expect(await screen.findByText('No more questions in range')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/')
})

test('Enter after reveal advances exactly one question', async () => {
  await setup()
  await userEvent.keyboard('a{Enter}')
  await screen.findByRole('status')
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByText('Stem two')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
})

test('?lesson=L19 logs mode lesson', async () => {
  const { store } = await setup({ url: '/practice?lesson=L19' })
  await userEvent.keyboard('b{Enter}')
  await screen.findByRole('status')
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0].mode).toBe('lesson')
})

test('Stop links to the dashboard', async () => {
  await setup()
  expect(screen.getByRole('link', { name: 'Stop' })).toHaveAttribute('href', '/')
})

test('Enter on the focused Stop link does not submit', async () => {
  const { store } = await setup()
  await userEvent.keyboard('a')
  screen.getByRole('link', { name: 'Stop' }).focus()
  await act(async () => {
    screen.getByRole('link', { name: 'Stop' }).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(0)
})

test('double Enter logs only one attempt', async () => {
  const { store } = await setup()
  await userEvent.keyboard('a')
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  })
  await screen.findByRole('status')
  expect(screen.getByText('Stem one')).toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(1)
})

test('save failure shows an alert and allows retry', async () => {
  const store = new MemoryStore()
  const real = store.logAttempt.bind(store)
  let fail = true
  store.logAttempt = async (a) => {
    if (fail) {
      fail = false
      throw new Error('boom')
    }
    return real(a)
  }
  await setup({ store })
  await userEvent.keyboard('a{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your answer. Try again.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await userEvent.keyboard('{Enter}')
  expect(await screen.findByRole('status')).toHaveTextContent('Not quite')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(1)
  expect(screen.getByText('Correct 0 of 1')).toBeInTheDocument()
})

test('changing the lesson param starts a fresh session', async () => {
  await setup({ url: '/practice?lesson=L19', extra: <Link to="/practice">All lessons</Link> })
  for (let i = 0; i < 3; i++) {
    await userEvent.keyboard('a{Enter}')
    await screen.findByRole('status')
    await userEvent.keyboard('{Enter}')
    if (i < 2) await screen.findByRole('button', { name: 'Submit' })
  }
  expect(await screen.findByText('No more questions in range')).toBeInTheDocument()
  expect(screen.getByText('Correct 1 of 3')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'All lessons' }))
  expect(await screen.findByText('Stem one')).toBeInTheDocument()
  expect(screen.getByText('Correct 0 of 0')).toBeInTheDocument()
  expect(screen.queryByText('No more questions in range')).not.toBeInTheDocument()
})
