import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { TakeExam } from './TakeExam'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { buildContent } from '../../content'
import { fixtureCard, fixtureLessons } from '../../test/fixtures'
import { createScheduler } from '../../engine/fsrs'
import type { Scheduler } from '../../engine/fsrs'
import type { Choice, Exam, Question } from '../../content/schema'
import { SESSION_KEY } from '../examSession'

const NOW = new Date('2026-11-06T12:00:00Z')

const choices: Choice[] = [
  { label: 'A', text: 'alpha' },
  { label: 'B', text: 'beta' },
  { label: 'C', text: 'gamma' },
  { label: 'D', text: 'delta' },
  { label: 'E', text: 'epsilon' },
]

// the first three questions belong to L19, the rest to L20
function q(n: number): Question {
  return {
    id: `f2025-e1-q${n}`,
    number: n,
    points: n <= 10 ? 8 : 10,
    stem: `Stem ${n}`,
    choices,
    answer: 'C',
    lessonIds: [n <= 3 ? 'L19' : 'L20'],
    status: 'reviewed',
  }
}

const seedExam: Exam = {
  id: 'f2025-e1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: Array.from({ length: 12 }, (_, i) => q(i + 1)),
}

const content = buildContent(fixtureLessons(), [fixtureCard('L19-c01', 'L19')], [seedExam])
const now = () => new Date()
const rng = () => 0

let scheduler: Scheduler

beforeEach(async () => {
  scheduler = await createScheduler()
  sessionStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

function ResultsStub() {
  const { sessionId } = useParams()
  return <p>{`results:${sessionId}`}</p>
}

function renderAt(url: string, store: MemoryStore) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <StoreProvider store={store} scheduler={scheduler} content={content} rng={rng} now={now}>
        <Routes>
          <Route path="/exams/mock" element={<TakeExam mode="mock" />} />
          <Route path="/exams/:examId" element={<TakeExam />} />
          <Route path="/results/:sessionId" element={<ResultsStub />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

function user() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

async function start(url = '/exams/f2025-e1', store = new MemoryStore()) {
  const view = renderAt(url, store)
  await screen.findByRole('heading', { name: /Question 1 of/ })
  return { store, view }
}

test('renders question 1 and a timer that counts down', async () => {
  await start()
  expect(screen.getByRole('heading', { level: 2, name: 'Fall 2025 Exam 1' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Question 1 of 12' })).toBeInTheDocument()
  expect(screen.getByText('Stem 1')).toBeInTheDocument()
  expect(screen.getByRole('timer')).toHaveTextContent('60:00')
  await act(async () => {
    vi.advanceTimersByTime(61_000)
  })
  expect(screen.getByRole('timer')).toHaveTextContent('58:59')
})

test('navigator moves between questions and marks answered and flagged ones', async () => {
  await start()
  const u = user()
  const nav = screen.getByRole('navigation', { name: 'Questions' })
  expect(within(nav).getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'true')
  await u.keyboard('b')
  expect(within(nav).getByRole('button', { name: '1' })).toHaveClass('answered')
  await u.click(screen.getByRole('button', { name: 'Mark for review' }))
  expect(within(nav).getByRole('button', { name: '1' })).toHaveClass('marked')
  expect(screen.getByRole('button', { name: 'Unmark' })).toBeInTheDocument()
  await u.click(within(nav).getByRole('button', { name: '5' }))
  expect(screen.getByRole('heading', { name: 'Question 5 of 12' })).toBeInTheDocument()
  expect(screen.getByText('Stem 5')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mark for review' })).toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Prev' }))
  expect(screen.getByRole('heading', { name: 'Question 4 of 12' })).toBeInTheDocument()
})

test('Review Focus 3: reloading restores the saved answers', async () => {
  const store = new MemoryStore()
  const { view } = await start('/exams/f2025-e1', store)
  const u = user()
  await u.keyboard('b')
  await u.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('heading', { name: 'Question 2 of 12' })).toBeInTheDocument()
  view.unmount()

  renderAt('/exams/f2025-e1', store)
  expect(await screen.findByRole('heading', { name: 'Question 2 of 12' })).toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Prev' }))
  expect(screen.getByRole('heading', { name: 'Question 1 of 12' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /beta/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('timer')).toHaveTextContent('60:00')
})

test('Review Focus 2: time running out submits the answered questions exactly once', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store)
  const u = user()
  await u.keyboard('b')
  await u.click(screen.getByRole('button', { name: 'Next' }))
  await u.keyboard('c')
  await act(async () => {
    vi.advanceTimersByTime(60 * 60 * 1000 + 5000)
  })
  const line = await screen.findByText(/^results:/)
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(2)
  expect(attempts.every((a) => a.mode === 'exam' && a.examId === 'f2025-e1')).toBe(true)
  const ids = new Set(attempts.map((a) => a.sessionId))
  expect(ids.size).toBe(1)
  const [sessionId] = [...ids]
  expect(sessionId).toBeTruthy()
  expect(line).toHaveTextContent(`results:${sessionId}`)
  expect(attempts.map((a) => [a.questionId, a.chosen, a.correct])).toEqual([
    ['f2025-e1-q1', 'B', false],
    ['f2025-e1-q2', 'C', true],
  ])
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

test('Submit with all 12 answered logs 12 attempts and clears sessionStorage', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store)
  const confirm = vi.spyOn(window, 'confirm')
  const u = user()
  for (let i = 1; i <= 12; i++) {
    await u.keyboard('c')
    if (i < 12) await u.click(screen.getByRole('button', { name: 'Next' }))
  }
  expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull()
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect(confirm).not.toHaveBeenCalled()
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(12)
  expect(attempts.every((a) => a.correct && a.mode === 'exam')).toBe(true)
  expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
})

test('Submit with unanswered questions asks first and stays when cancelled', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  expect(confirm).toHaveBeenCalledWith('You have 11 unanswered questions. Submit anyway?')
  expect(screen.getByRole('heading', { name: 'Question 1 of 12' })).toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(0)
})

test('wrong answers pull the lesson cards forward', async () => {
  const store = new MemoryStore()
  const st = scheduler.newState('L19-c01', new Date('2026-11-01T00:00:00Z'))
  await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: '2026-11-20T00:00:00.000Z' } })
  await start('/exams/f2025-e1', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect((await store.getCardState('L19-c01'))!.fsrs.dueAt).toBe(NOW.toISOString())
})

test('a save failure shows an alert and a retry logs each attempt once', async () => {
  const store = new MemoryStore()
  const real = store.logAttempt.bind(store)
  let calls = 0
  store.logAttempt = async (a) => {
    calls++
    if (calls === 2) throw new Error('boom')
    return real(a)
  }
  await start('/exams/f2025-e1', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Next' }))
  await u.keyboard('c')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your exam. Try again.')
  expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull()
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect(await store.listAttempts()).toHaveLength(2)
})

test('mock mode samples questions from the lesson range', async () => {
  await start('/exams/mock?from=L19&to=L19')
  expect(screen.getByRole('heading', { level: 2, name: 'Mock exam' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Question 1 of 3' })).toBeInTheDocument()
  expect(screen.getByRole('timer')).toHaveTextContent('60:00')
})

test('mock mode with an empty range says so', async () => {
  renderAt('/exams/mock?from=L1&to=L2', new MemoryStore())
  expect(await screen.findByText('No questions available for that range')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to exams' })).toHaveAttribute('href', '/exams')
})

test('mock submit logs mock attempts without an examId', async () => {
  const store = new MemoryStore()
  await start('/exams/mock?from=L19&to=L19', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0].mode).toBe('mock')
  expect(attempts[0].examId).toBeUndefined()
})

test('an unknown exam id shows not found', async () => {
  renderAt('/exams/nope', new MemoryStore())
  expect(await screen.findByText('Exam not found')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to exams' })).toHaveAttribute('href', '/exams')
})
