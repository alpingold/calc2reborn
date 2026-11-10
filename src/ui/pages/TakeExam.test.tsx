import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate, useParams } from 'react-router'
import { TakeExam } from './TakeExam'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { buildContent } from '../../content'
import { fixtureCard, fixtureLessons, fixtureTypes } from '../../test/fixtures'
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
    // question 2 has no problem type, as content does while the taxonomy is being applied
    typeIds: n === 2 ? undefined : [n <= 3 ? 'L19-a' : 'L20-a'],
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
  // question 1 has a worked-out answer: its notice must stay hidden while the exam runs
  questions: Array.from({ length: 12 }, (_, i) => (i === 0 ? { ...q(1), answerSource: 'derived' as const } : q(i + 1))),
}

// a second exam, all on L21, for switching between exams
const otherExam: Exam = {
  id: 'f2024-e1',
  term: 'Fall',
  year: 2024,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: Array.from({ length: 4 }, (_, i) => ({
    ...q(i + 1),
    id: `f2024-e1-q${i + 1}`,
    stem: `Other stem ${i + 1}`,
    lessonIds: ['L21'],
  })),
}

// a practice exam written for this app
const extraExam: Exam = {
  id: 'xp-e3-a',
  title: 'Extra Practice Exam 3 (A)',
  unofficial: true,
  durationMinutes: 60,
  questions: [{ ...q(1), id: 'xp-e3-a-q01', lessonIds: ['L21'], answerSource: 'written' }],
}

const lessons = fixtureLessons().map((l) => (['L19', 'L20', 'L21'].includes(l.id) ? { ...l, problemTypes: fixtureTypes(l.id) } : l))
const content = buildContent(
  lessons,
  [
    { ...fixtureCard('L19-c01', 'L19'), typeIds: ['L19-a'] },
    { ...fixtureCard('L19-c02', 'L19'), typeIds: ['L19-b'] },
  ],
  [seedExam, otherExam, extraExam],
)
const now = () => new Date()
const rng = () => 0

let scheduler: Scheduler

beforeEach(async () => {
  scheduler = await createScheduler()
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

function ResultsStub() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  return (
    <>
      <p>{`results:${sessionId}`}</p>
      <button type="button" onClick={() => navigate(-1)}>
        Go back
      </button>
    </>
  )
}

function renderAt(url: string, store: MemoryStore, history: string[] = []) {
  return render(
    <MemoryRouter initialEntries={[...history, url]} initialIndex={history.length}>
      <StoreProvider store={store} scheduler={scheduler} content={content} rng={rng} now={now}>
        <Routes>
          <Route path="/exams/mock" element={<TakeExam mode="mock" />} />
          <Route path="/exams/:examId" element={<TakeExam />} />
          <Route path="/results/:sessionId" element={<ResultsStub />} />
          <Route path="/exams" element={<p>exam list</p>} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

function user() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

async function start(url = '/exams/f2025-e1', store = new MemoryStore(), { feedback = false } = {}) {
  const view = renderAt(url, store)
  await clickStart({ feedback })
  return { store, view }
}

async function clickStart({ feedback = false } = {}) {
  const u = user()
  const button = await screen.findByRole('button', { name: 'Start' })
  if (feedback) await u.click(screen.getByRole('checkbox', { name: /Show feedback after each answer/ }))
  await u.click(button)
  await screen.findByRole('heading', { name: /Question 1 of/ })
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

test('a derived answer shows no notice during the timed exam, even once chosen', async () => {
  expect(content.questionById.get('f2025-e1-q1')?.answerSource).toBe('derived')
  await start()
  expect(screen.getByText('Stem 1')).toBeInTheDocument()
  expect(screen.queryByText(/No official answer key/)).not.toBeInTheDocument()
  await user().click(screen.getByRole('button', { name: /^C\b/ }))
  expect(screen.getByRole('button', { name: /^C\b/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByText(/No official answer key/)).not.toBeInTheDocument()
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
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
})

test('Submit with all 12 answered logs 12 attempts and clears localStorage', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store)
  const confirm = vi.spyOn(window, 'confirm')
  const u = user()
  for (let i = 1; i <= 12; i++) {
    await u.keyboard('c')
    if (i < 12) await u.click(screen.getByRole('button', { name: 'Next' }))
  }
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect(confirm).not.toHaveBeenCalled()
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(12)
  expect(attempts.every((a) => a.correct && a.mode === 'exam')).toBe(true)
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
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

test('a wrong answer brings forward the cards for its problem type, not the whole lesson', async () => {
  const store = new MemoryStore()
  for (const id of ['L19-c01', 'L19-c02']) {
    const st = scheduler.newState(id, new Date('2026-11-01T00:00:00Z'))
    await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: '2026-11-20T00:00:00.000Z' } })
  }
  await start('/exams/f2025-e1', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect((await store.getCardState('L19-c01'))!.fsrs.dueAt).toBe(NOW.toISOString())
  expect((await store.getCardState('L19-c02'))!.fsrs.dueAt).toBe('2026-11-20T00:00:00.000Z')
})

test('a wrong answer on a question with no problem type moves no card', async () => {
  const store = new MemoryStore()
  const st = scheduler.newState('L19-c01', new Date('2026-11-01T00:00:00Z'))
  await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: '2026-11-20T00:00:00.000Z' } })
  await start('/exams/f2025-e1', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.click(screen.getByRole('button', { name: 'Next' }))
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect((await store.getCardState('L19-c01'))!.fsrs.dueAt).toBe('2026-11-20T00:00:00.000Z')
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
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
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

async function conflictAt(url: string, store = new MemoryStore()) {
  const view = renderAt(url, store)
  await screen.findByRole('button', { name: 'Discard and start this one' })
  return { store, view }
}

test('(a) a mock for another lesson range does not silently serve the saved mock', async () => {
  const { view } = await start('/exams/mock?from=L19&to=L19')
  expect(screen.getByRole('heading', { name: 'Question 1 of 3' })).toBeInTheDocument()
  view.unmount()

  await conflictAt('/exams/mock?from=L20&to=L20')
  expect(screen.queryByRole('heading', { name: /Question 1 of/ })).not.toBeInTheDocument()
  expect(screen.getByText(/Mock exam, Lesson 19/)).toHaveTextContent('0 of 3 answered')
  expect(screen.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', '/exams/mock?from=L19&to=L19')

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user().click(screen.getByRole('button', { name: 'Discard and start this one' }))
  expect(confirm).toHaveBeenCalledWith('Discard your answers to Mock exam, Lesson 19? This cannot be undone.')
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  await clickStart()
  expect(screen.getByRole('heading', { name: 'Question 1 of 9' })).toBeInTheDocument()
  expect(screen.getByText(/^Stem (\d+)$/).textContent).toMatch(/^Stem ([4-9]|1[0-2])$/)
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toMatchObject({ kind: 'mock', from: 'L20', to: 'L20' })
})

test('declining the discard keeps the saved session', async () => {
  const { view } = await start('/exams/mock?from=L19&to=L19')
  const saved = localStorage.getItem(SESSION_KEY)
  view.unmount()
  await conflictAt('/exams/mock?from=L20&to=L20')
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await user().click(screen.getByRole('button', { name: 'Discard and start this one' }))
  expect(screen.getByRole('button', { name: 'Discard and start this one' })).toBeInTheDocument()
  expect(localStorage.getItem(SESSION_KEY)).toBe(saved)
})

test('(b) an expired saved mock does not jump to results for a new request', async () => {
  const store = new MemoryStore()
  const { view } = await start('/exams/mock?from=L19&to=L19', store)
  await user().keyboard('a')
  view.unmount()
  vi.setSystemTime(new Date(NOW.getTime() + 61 * 60 * 1000))

  const other = renderAt('/exams/mock?from=L20&to=L20', store)
  await screen.findByRole('button', { name: 'Discard and start this one' })
  expect(screen.getByText(/ran out of time/)).toHaveTextContent('Mock exam, Lesson 19 ran out of time before it was submitted')
  expect(screen.queryByText(/^results:/)).not.toBeInTheDocument()
  other.unmount()

  // the same range is a new request too: it asks rather than submitting a score of zero
  renderAt('/exams/mock?from=L19&to=L19', store)
  await screen.findByRole('button', { name: 'Discard and start this one' })
  expect(screen.queryByText(/^results:/)).not.toBeInTheDocument()
  expect(await store.listAttempts()).toHaveLength(0)
})

test('resuming an expired session submits it', async () => {
  const store = new MemoryStore()
  const { view } = await start('/exams/mock?from=L19&to=L19', store)
  await user().keyboard('a')
  view.unmount()
  vi.setSystemTime(new Date(NOW.getTime() + 61 * 60 * 1000))
  await conflictAt('/exams/mock?from=L20&to=L20', store)
  await user().click(screen.getByRole('link', { name: 'Resume' }))
  await screen.findByText(/^results:/)
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0]).toMatchObject({ mode: 'mock', chosen: 'A' })
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
})

test('(c) opening another exam keeps the answers of the one in progress', async () => {
  const { view } = await start('/exams/f2025-e1')
  await user().keyboard('b')
  view.unmount()

  await conflictAt('/exams/f2024-e1')
  expect(screen.getByRole('heading', { level: 2, name: 'Fall 2024 Exam 1' })).toBeInTheDocument()
  expect(screen.getByText(/Fall 2025 Exam 1/)).toHaveTextContent('1 of 12 answered')
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toMatchObject({
    examId: 'f2025-e1',
    answers: { 'f2025-e1-q1': 'B' },
  })
})

test('Resume returns to the session in progress with its answers', async () => {
  const { view } = await start('/exams/f2025-e1')
  await user().keyboard('b')
  view.unmount()

  await conflictAt('/exams/f2024-e1')
  await user().click(screen.getByRole('link', { name: 'Resume' }))
  expect(await screen.findByRole('heading', { name: 'Question 1 of 12' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Fall 2025 Exam 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /beta/ })).toHaveAttribute('aria-pressed', 'true')
})

test('Discard and start this one replaces the exam in progress', async () => {
  const { view } = await start('/exams/f2025-e1')
  await user().keyboard('b')
  view.unmount()

  await conflictAt('/exams/f2024-e1')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user().click(screen.getByRole('button', { name: 'Discard and start this one' }))
  await clickStart()
  expect(screen.getByRole('heading', { name: 'Question 1 of 4' })).toBeInTheDocument()
  expect(screen.getByText('Other stem 1')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toMatchObject({ examId: 'f2024-e1', answers: {} })
})

test('an older saved mock with no lesson range asks instead of being restored, and can resume', async () => {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      sessionId: 'old-mock',
      kind: 'mock',
      questionIds: ['f2025-e1-q1', 'f2025-e1-q2'],
      answers: { 'f2025-e1-q2': 'D' },
      marked: [],
      startedAt: NOW.toISOString(),
      durationMinutes: 60,
    }),
  )
  await conflictAt('/exams/mock?from=L19&to=L19')
  expect(screen.getByText(/Mock exam/, { selector: 'p' })).toHaveTextContent('1 of 2 answered')
  const resume = screen.getByRole('link', { name: 'Resume' })
  expect(resume).toHaveAttribute('href', '/exams/mock')
  await user().click(resume)
  expect(await screen.findByRole('heading', { name: 'Question 1 of 2' })).toBeInTheDocument()
})

test('the start screen describes the exam and starts nothing until Start', async () => {
  renderAt('/exams/f2025-e1', new MemoryStore())
  const startButton = await screen.findByRole('button', { name: 'Start' })
  expect(screen.getByRole('heading', { level: 2, name: 'Fall 2025 Exam 1' })).toBeInTheDocument()
  expect(screen.getByText('12 questions, 60 minutes')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Show feedback after each answer \(untimed\)/ })).not.toBeChecked()
  expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  await user().click(startButton)
  expect(await screen.findByRole('heading', { name: 'Question 1 of 12' })).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).not.toHaveProperty('feedback', true)
})

test('the mock start screen names the lesson range', async () => {
  renderAt('/exams/mock?from=L19&to=L20', new MemoryStore())
  await screen.findByRole('button', { name: 'Start' })
  expect(screen.getByText('Lessons 19 to 20, 60 minutes')).toBeInTheDocument()
})

test('feedback mode: Check reveals the answer and locks it, with an elapsed clock', async () => {
  await start('/exams/f2025-e1', new MemoryStore(), { feedback: true })
  const u = user()
  const timer = screen.getByRole('timer', { name: 'Time elapsed' })
  expect(timer).toHaveTextContent('00:00')
  const check = screen.getByRole('button', { name: 'Check' })
  expect(check).toBeDisabled()
  await u.click(screen.getByRole('button', { name: /^B\b/ }))
  await u.click(screen.getByRole('button', { name: 'Check' }))
  expect(screen.getByRole('status')).toHaveTextContent('Not quite')
  expect(screen.getByRole('button', { name: /Correct answer$/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /Your answer$/ })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Check' })).not.toBeInTheDocument()
  await u.keyboard('c')
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toMatchObject({
    feedback: true,
    checked: ['f2025-e1-q1'],
    answers: { 'f2025-e1-q1': 'B' },
  })
  await act(async () => {
    vi.advanceTimersByTime(61_000)
  })
  expect(screen.getByRole('timer', { name: 'Time elapsed' })).toHaveTextContent('01:01')
  await u.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled()
})

test('feedback mode: a reload keeps checked questions revealed', async () => {
  const store = new MemoryStore()
  const { view } = await start('/exams/f2025-e1', store, { feedback: true })
  const u = user()
  await u.keyboard('c')
  await u.click(screen.getByRole('button', { name: 'Check' }))
  view.unmount()
  renderAt('/exams/f2025-e1', store)
  expect(await screen.findByRole('heading', { name: 'Question 1 of 12' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Correct')
  expect(screen.getByRole('timer', { name: 'Time elapsed' })).toBeInTheDocument()
})

test('feedback mode never runs out of time and submits attempts marked as feedback', async () => {
  const store = new MemoryStore()
  const { view } = await start('/exams/f2025-e1', store, { feedback: true })
  const u = user()
  await u.keyboard('c')
  await u.click(screen.getByRole('button', { name: 'Check' }))
  await act(async () => {
    vi.advanceTimersByTime(2 * 60 * 60 * 1000)
  })
  expect(screen.queryByText(/^results:/)).not.toBeInTheDocument()
  // the checked answer is already saved, so nothing is lost if the tab closes here
  expect(await store.listAttempts()).toHaveLength(1)
  view.unmount()

  // two hours later, a reload still restores it instead of asking
  renderAt('/exams/f2025-e1', store)
  expect(await screen.findByRole('heading', { name: 'Question 1 of 12' })).toBeInTheDocument()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  const attempts = await store.listAttempts()
  expect(attempts).toHaveLength(1)
  expect(attempts[0]).toMatchObject({ questionId: 'f2025-e1-q1', chosen: 'C', correct: true, feedback: true })
})

test('a saved feedback session blocking another exam is described without a deadline', async () => {
  const { view } = await start('/exams/f2025-e1', new MemoryStore(), { feedback: true })
  view.unmount()
  vi.setSystemTime(new Date(NOW.getTime() + 3 * 60 * 60 * 1000))
  await conflictAt('/exams/f2024-e1')
  expect(screen.getByText(/Fall 2025 Exam 1/)).toHaveTextContent(
    'You have Fall 2025 Exam 1 in progress with feedback, 0 of 12 answered.',
  )
})

test('after a submit fails partway, a reload and resubmit logs each answer once', async () => {
  const store = new MemoryStore()
  const real = store.logAttempt.bind(store)
  let calls = 0
  store.logAttempt = async (a) => {
    calls++
    if (calls === 2) throw new Error('boom')
    return real(a)
  }
  const { view } = await start('/exams/f2025-e1', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Next' }))
  await u.keyboard('c')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByRole('alert')
  expect(await store.listAttempts()).toHaveLength(1)
  view.unmount()

  // the reload restores the saved session; submitting again must not add a second copy of answer 1
  renderAt('/exams/f2025-e1', store)
  await screen.findByRole('heading', { name: /Question \d+ of 12/ })
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  const attempts = await store.listAttempts()
  expect(attempts.map((a) => a.questionId).sort()).toEqual(['f2025-e1-q1', 'f2025-e1-q2'])
})

test('once Submit starts, answers can no longer change', async () => {
  const store = new MemoryStore()
  const real = store.logAttempt.bind(store)
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  store.logAttempt = async (a) => {
    await gate
    return real(a)
  }
  await start('/exams/f2025-e1', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await u.keyboard('b')
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).answers['f2025-e1-q1']).toBe('A')
  await act(async () => release())
  await screen.findByText(/^results:/)
  expect((await store.listAttempts())[0].chosen).toBe('A')
})

test('the results page replaces the exam in history, so Back skips the finished exam', async () => {
  const store = new MemoryStore()
  renderAt('/exams/f2025-e1', store, ['/exams'])
  await clickStart()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  await u.click(screen.getByRole('button', { name: 'Go back' }))
  expect(await screen.findByText('exam list')).toBeInTheDocument()
})

test('feedback mode logs the time spent on each question, not the session average', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store, { feedback: true })
  const u = user()
  await act(async () => {
    vi.advanceTimersByTime(30_000)
  })
  await u.keyboard('c')
  await u.click(screen.getByRole('button', { name: 'Check' }))
  // ten minutes reading the solution must not count toward the next question or this one
  await act(async () => {
    vi.advanceTimersByTime(600_000)
  })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect((await store.listAttempts())[0].seconds).toBe(30)
})

test('the start screen of an unofficial exam says it was written for this app', async () => {
  renderAt('/exams/xp-e3-a', new MemoryStore())
  await screen.findByRole('button', { name: 'Start' })
  expect(screen.getByRole('heading', { level: 2, name: 'Extra Practice Exam 3 (A)' })).toBeInTheDocument()
  expect(screen.getByText(/not a Purdue exam/)).toBeInTheDocument()
})

test('an official exam has no such note', async () => {
  renderAt('/exams/f2025-e1', new MemoryStore())
  await screen.findByRole('button', { name: 'Start' })
  expect(screen.queryByText(/not a Purdue exam/)).not.toBeInTheDocument()
})

test('feedback mode saves each answer when it is checked, and Submit does not add a second copy', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store, { feedback: true })
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Check' }))
  const sessionId = JSON.parse(localStorage.getItem(SESSION_KEY)!).sessionId as string
  expect(await store.listAttempts()).toMatchObject([
    { id: `${sessionId}:f2025-e1-q1`, chosen: 'A', correct: false, feedback: true, mode: 'exam', examId: 'f2025-e1' },
  ])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect(await store.listAttempts()).toHaveLength(1)
})

test('a timed exam logs nothing until it is submitted', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store)
  await user().keyboard('c')
  expect(await store.listAttempts()).toHaveLength(0)
})

test('when saving a checked answer fails, the answer stays unlocked and can be checked again', async () => {
  const store = new MemoryStore()
  const log = vi.spyOn(store, 'logAttempt').mockRejectedValueOnce(new Error('disk full'))
  await start('/exams/f2025-e1', store, { feedback: true })
  const u = user()
  await u.keyboard('c')
  await u.click(screen.getByRole('button', { name: 'Check' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your answer. Try again.')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).checked).toEqual([])
  await u.click(screen.getByRole('button', { name: 'Check' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Correct')
  expect(log).toHaveBeenCalledTimes(2)
  expect(await store.listAttempts()).toHaveLength(1)
})

test('a stored session for an exam that is no longer in the content can be discarded', async () => {
  const gone = {
    sessionId: 'old',
    kind: 'exam',
    examId: 'f2001-e9',
    questionIds: ['f2001-e9-q1'],
    answers: {},
    marked: [],
    startedAt: NOW.toISOString(),
    durationMinutes: 60,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(gone))
  renderAt('/exams/f2025-e1', new MemoryStore())
  expect(await screen.findByText(/You have An exam in progress/)).toBeInTheDocument()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user().click(screen.getByRole('button', { name: 'Discard and start this one' }))
  expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
  expect(localStorage.getItem(SESSION_KEY)).toBeNull()
})

test('resuming a stored session for a removed exam shows a notice instead of crashing', async () => {
  const gone = {
    sessionId: 'old',
    kind: 'exam',
    examId: 'f2001-e9',
    questionIds: ['f2001-e9-q1'],
    answers: {},
    marked: [],
    startedAt: NOW.toISOString(),
    durationMinutes: 60,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(gone))
  render(
    <MemoryRouter initialEntries={[{ pathname: '/exams/f2001-e9', state: { resume: 'old' } }]}>
      <StoreProvider store={new MemoryStore()} scheduler={scheduler} content={content} rng={rng} now={now}>
        <Routes>
          <Route path="/exams/:examId" element={<TakeExam />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
  expect(await screen.findByText('This question is no longer available')).toBeInTheDocument()
})

test.each(['{not json', '{"sessionId":1}', '[]', 'null'])('stored session text %s is ignored', async (raw) => {
  localStorage.setItem(SESSION_KEY, raw)
  renderAt('/exams/f2025-e1', new MemoryStore())
  expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
})

test('Submit saves a record of the session, even when nothing was answered', async () => {
  const store = new MemoryStore()
  await start('/exams/f2025-e1', store)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user().click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect(await store.listAttempts()).toHaveLength(0)
  expect(await store.listSessionRecords()).toMatchObject([
    { kind: 'exam', examId: 'f2025-e1', correct: 0, total: 12, feedback: false, startedAt: NOW.toISOString() },
  ])
  expect((await store.listSessionRecords())[0].questionIds).toHaveLength(12)
})

test('a mock saves its lesson range and question list in its record', async () => {
  const store = new MemoryStore()
  await start('/exams/mock?from=L19&to=L20', store)
  const u = user()
  await u.keyboard('c')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  const [r] = await store.listSessionRecords()
  expect(r).toMatchObject({ kind: 'mock', from: 'L19', to: 'L20', correct: 1, total: 12 })
  expect(r).not.toHaveProperty('examId')
  expect(localStorage.getItem('ma16200-mock-questions')).toBeNull()
})

test('when the record cannot be saved the exam stays open and Submit can be tried again', async () => {
  const store = new MemoryStore()
  vi.spyOn(store, 'saveSessionRecord').mockRejectedValueOnce(new Error('disk full'))
  await start('/exams/f2025-e1', store)
  const u = user()
  await u.keyboard('c')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your exam. Try again.')
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText(/^results:/)
  expect(await store.listAttempts()).toHaveLength(1)
  expect(await store.listSessionRecords()).toHaveLength(1)
})

test('while a checked answer is being saved, the answer cannot change and Submit waits', async () => {
  const store = new MemoryStore()
  let release: () => void = () => {}
  const real = store.logAttempt.bind(store)
  vi.spyOn(store, 'logAttempt').mockImplementationOnce(
    (a) => new Promise<void>((resolve) => (release = () => void real(a).then(resolve))),
  )
  await start('/exams/f2025-e1', store, { feedback: true })
  const u = user()
  await u.keyboard('a')
  await u.click(screen.getByRole('button', { name: 'Check' }))
  // the save is pending: a new choice and a submit are both ignored
  await u.keyboard('c')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await u.click(screen.getByRole('button', { name: 'Submit' }))
  expect(screen.queryByText(/^results:/)).not.toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).answers['f2025-e1-q1']).toBe('A')
  await act(async () => {
    release()
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Not quite')
  expect(await store.listAttempts()).toMatchObject([{ questionId: 'f2025-e1-q1', chosen: 'A' }])
})
