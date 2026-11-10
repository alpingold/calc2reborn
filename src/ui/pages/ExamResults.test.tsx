import { afterEach, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ExamResults } from './ExamResults'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { buildContent } from '../../content'
import { fixtureLessons } from '../../test/fixtures'
import { createScheduler } from '../../engine/fsrs'
import type { Choice, Exam, Question } from '../../content/schema'
import type { Attempt } from '../../storage/types'
import type { ExamSession } from '../examSession'

const choices: Choice[] = [
  { label: 'A', text: 'alpha' },
  { label: 'B', text: 'beta' },
  { label: 'C', text: 'gamma' },
  { label: 'D', text: 'delta' },
  { label: 'E', text: 'epsilon' },
]

function q(n: number): Question {
  return {
    id: `f2025-e1-q${n}`,
    number: n,
    points: n <= 10 ? 8 : 10,
    stem: `Stem ${n}`,
    choices,
    answer: 'C',
    lessonIds: ['L19'],
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
const fractionalExam: Exam = {
  ...seedExam,
  id: 'f2016-e1',
  questions: Array.from({ length: 12 }, (_, i) => ({
    ...q(i + 1),
    id: `f2016-e1-q${i + 1}`,
    points: 100 / 12,
  })),
}
const content = buildContent(fixtureLessons(), [], [seedExam, fractionalExam])

function fractionalSession(correct: number): ExamSession {
  const questionIds = fractionalExam.questions.map((x) => x.id)
  return {
    ...session,
    examId: fractionalExam.id,
    questionIds,
    answers: Object.fromEntries(questionIds.map((id, i) => [id, i < correct ? 'C' : 'A'])),
  }
}

// 1 to 9 right, 10 and 11 wrong, 12 unanswered
const answers: Record<string, Choice['label']> = {}
for (let n = 1; n <= 11; n++) answers[`f2025-e1-q${n}`] = n <= 9 ? 'C' : 'A'

const session: ExamSession = {
  sessionId: 's1',
  kind: 'exam',
  examId: 'f2025-e1',
  questionIds: seedExam.questions.map((x) => x.id),
  answers,
  marked: [],
  startedAt: '2026-11-06T12:00:00.000Z',
  durationMinutes: 60,
}

afterEach(() => {
  localStorage.clear()
})

async function renderResults(entry: string | { pathname: string; state: unknown }, store = new MemoryStore()) {
  const scheduler = await createScheduler()
  render(
    <MemoryRouter initialEntries={[entry]}>
      <StoreProvider store={store} scheduler={scheduler} content={content}>
        <Routes>
          <Route path="/results/:sessionId" element={<ExamResults />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

test('shows score and points from the session in location state', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  expect(await screen.findByText('Score: 9 / 12')).toBeInTheDocument()
  expect(screen.getByText('Points: 72 / 100')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Results' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to exams' })).toHaveAttribute('href', '/exams')
})

test('twelve correct at 100/12 each shows whole points, without float noise', async () => {
  await renderResults({ pathname: '/results/s1', state: { session: fractionalSession(12) } })
  expect(await screen.findByText('Points: 100 / 100')).toBeInTheDocument()
})

test('four correct at 100/12 each shows points to one decimal place', async () => {
  await renderResults({ pathname: '/results/s1', state: { session: fractionalSession(4) } })
  expect(await screen.findByText('Points: 33.3 / 100')).toBeInTheDocument()
})

test('an unanswered question says Not answered and reveals its correct choice', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  const item = await screen.findByRole('listitem', { name: 'Question 12' })
  expect(within(item).getByText('Not answered')).toBeInTheDocument()
  expect(within(item).getByRole('button', { name: /Correct answer$/ })).toHaveTextContent('gamma')
  expect(screen.getAllByText('Not answered')).toHaveLength(1)
  const wrong = screen.getByRole('listitem', { name: 'Question 10' })
  expect(within(wrong).getByRole('button', { name: /Your answer$/ })).toHaveTextContent('alpha')
  expect(within(wrong).getByRole('link', { name: 'Lesson 19: Topic 19' })).toHaveAttribute(
    'href',
    '/course/L19',
  )
})

test('rebuilds the summary from attempts when location state is missing', async () => {
  const store = new MemoryStore()
  for (const [questionId, chosen] of Object.entries(answers)) {
    const a: Attempt = {
      id: `a-${questionId}`,
      questionId,
      chosen,
      correct: chosen === 'C',
      seconds: 30,
      timestamp: '2026-11-06T12:30:00.000Z',
      mode: 'exam',
      sessionId: 's1',
      examId: 'f2025-e1',
    }
    await store.logAttempt(a)
  }
  await renderResults('/results/s1', store)
  expect(await screen.findByText('Score: 9 / 12')).toBeInTheDocument()
  expect(screen.getByText('Points: 72 / 100')).toBeInTheDocument()
  const item = screen.getByRole('listitem', { name: 'Question 12' })
  expect(within(item).getByText('Not answered')).toBeInTheDocument()
})

test('a feedback session is labelled With feedback, from state or rebuilt from attempts', async () => {
  await renderResults({ pathname: '/results/s1', state: { session: { ...session, feedback: true } } })
  expect(await screen.findByText('With feedback')).toBeInTheDocument()
})

test('a rebuilt feedback session keeps its label', async () => {
  const store = new MemoryStore()
  await store.logAttempt({
    id: 'a1',
    questionId: 'f2025-e1-q1',
    chosen: 'C',
    correct: true,
    seconds: 30,
    timestamp: '2026-11-06T12:30:00.000Z',
    mode: 'exam',
    sessionId: 's1',
    examId: 'f2025-e1',
    feedback: true,
  })
  await renderResults('/results/s1', store)
  expect(await screen.findByText('With feedback')).toBeInTheDocument()
})

test('a timed session has no feedback label', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  await screen.findByText('Score: 9 / 12')
  expect(screen.queryByText('With feedback')).not.toBeInTheDocument()
})

test('a mock reopened later lists its unanswered questions too, from its record', async () => {
  const store = new MemoryStore()
  await store.saveSessionRecord({
    sessionId: 'm1',
    kind: 'mock',
    from: 'L19',
    to: 'L20',
    questionIds: ['f2025-e1-q1', 'f2025-e1-q2', 'f2025-e1-q3'],
    startedAt: '2026-11-06T12:00:00.000Z',
    finishedAt: '2026-11-06T12:30:00.000Z',
    feedback: false,
    correct: 1,
    total: 3,
  })
  await store.logAttempt({
    id: 'm1:f2025-e1-q2',
    questionId: 'f2025-e1-q2',
    chosen: 'C',
    correct: true,
    seconds: 30,
    timestamp: '2026-11-06T12:30:00.000Z',
    mode: 'mock',
    sessionId: 'm1',
  })
  await renderResults('/results/m1', store)
  expect(await screen.findByText('Score: 1 / 3')).toBeInTheDocument()
  expect(screen.getAllByText('Not answered')).toHaveLength(2)
})

test('an exam submitted with nothing answered can still be reopened', async () => {
  const store = new MemoryStore()
  await store.saveSessionRecord({
    sessionId: 'blank',
    kind: 'exam',
    examId: 'f2025-e1',
    questionIds: seedExam.questions.map((x) => x.id),
    startedAt: '2026-11-06T12:00:00.000Z',
    finishedAt: '2026-11-06T13:00:00.000Z',
    feedback: false,
    correct: 0,
    total: 12,
  })
  await renderResults('/results/blank', store)
  expect(await screen.findByText('Score: 0 / 12')).toBeInTheDocument()
  expect(screen.getAllByText('Not answered')).toHaveLength(12)
})

test('a record for an exam that was removed from the content says there are no results', async () => {
  const store = new MemoryStore()
  await store.saveSessionRecord({
    sessionId: 'old',
    kind: 'exam',
    examId: 'f1999-e1',
    questionIds: ['f1999-e1-q1'],
    startedAt: '2026-11-06T12:00:00.000Z',
    finishedAt: '2026-11-06T13:00:00.000Z',
    feedback: false,
    correct: 0,
    total: 1,
  })
  await renderResults('/results/old', store)
  expect(await screen.findByText('No results for this session')).toBeInTheDocument()
})

test('an unknown session says there are no results', async () => {
  await renderResults('/results/zzz')
  expect(await screen.findByText('No results for this session')).toBeInTheDocument()
})
