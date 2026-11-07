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
const content = buildContent(fixtureLessons(), [], [seedExam])

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
  sessionStorage.clear()
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

test('an unanswered question says Not answered and reveals its correct choice', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  const item = await screen.findByRole('listitem', { name: 'Question 12' })
  expect(within(item).getByText('Not answered')).toBeInTheDocument()
  expect(within(item).getByRole('button', { name: 'Correct answer' })).toHaveTextContent('gamma')
  expect(screen.getAllByText('Not answered')).toHaveLength(1)
  const wrong = screen.getByRole('listitem', { name: 'Question 10' })
  expect(within(wrong).getByRole('button', { name: 'Your answer' })).toHaveTextContent('alpha')
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

test('an unknown session says there are no results', async () => {
  await renderResults('/results/zzz')
  expect(await screen.findByText('No results for this session')).toBeInTheDocument()
})
