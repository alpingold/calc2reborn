import { afterEach, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ExamResults } from './ExamResults'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { buildContent } from '../../content'
import { fixtureLessons, fixtureTypes } from '../../test/fixtures'
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
    // 1 to 6 are of one type, 7 to 11 of another, and 12 has none
    typeIds: n <= 6 ? ['L19-a'] : n <= 11 ? ['L19-b'] : undefined,
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
const lessons = fixtureLessons().map((l) => (l.id === 'L19' ? { ...l, problemTypes: fixtureTypes('L19') } : l))
const content = buildContent(lessons, [], [seedExam, fractionalExam])

/** Open a question's row, and return its list item. */
async function expand(n: number): Promise<HTMLElement> {
  const item = await screen.findByRole('listitem', { name: `Question ${n}` })
  await userEvent.click(within(item).getByRole('button', { name: new RegExp(`^Question ${n}\\b`) }))
  return item
}

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

test('the summary comes first: the score, then what was missed by problem type with a link to practise each', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  expect(await screen.findByText('Fall 2025 Exam 1')).toBeInTheDocument()
  expect(screen.getByText('9 correct · 2 missed · 1 left blank')).toBeInTheDocument()
  const breakdown = screen.getByRole('heading', { name: 'What you missed' }).closest('section')!
  const links = within(breakdown).getAllByRole('link')
  // questions 10 and 11 are of type B; the unanswered question 12 has no type, so it counts toward its lesson
  expect(links.map((a) => a.getAttribute('aria-label'))).toEqual([
    'Practise L19 type B, missed 2 of 5',
    'Practise Lesson 19: Topic 19, missed 1 of 1',
  ])
  expect(links[0]).toHaveAttribute('href', '/practice?types=L19-b&n=10')
  expect(links[0]).toHaveTextContent('missed 2 of 5')
  expect(links[1]).toHaveAttribute('href', '/practice?lesson=L19')
  // a type with nothing missed is not listed
  expect(within(breakdown).queryByText(/L19 type A/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'What you missed' }).compareDocumentPosition(screen.getByRole('heading', { name: 'Questions' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('with nothing missed the breakdown says so and there is no filter', async () => {
  await renderResults({ pathname: '/results/s1', state: { session: fractionalSession(12) } })
  expect(await screen.findByText('Nothing. Every question was right.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Show only missed' })).not.toBeInTheDocument()
})

test('questions are listed collapsed, each with its number, its result in words and its type', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  await screen.findByRole('listitem', { name: 'Question 1' })
  const rows = [...document.querySelectorAll<HTMLElement>('.results-list > li')]
  expect(rows).toHaveLength(12)
  expect(within(rows[0]).getByRole('button')).toHaveAccessibleName('Question 1 Correct L19 type A')
  expect(within(rows[9]).getByRole('button')).toHaveAccessibleName('Question 10 Missed L19 type B')
  expect(within(rows[11]).getByRole('button')).toHaveAccessibleName('Question 12 Not answered')
  for (const row of rows) expect(within(row).getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  // nothing of any question is drawn until it is opened
  expect(screen.queryByText('Stem 1')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Correct answer$/ })).not.toBeInTheDocument()
})

test('opening a question shows its stem, choices and solution, and closing hides them again', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  const item = await expand(10)
  const button = within(item).getByRole('button', { name: /^Question 10\b/ })
  expect(button).toHaveAttribute('aria-expanded', 'true')
  expect(within(item).getByText('Stem 10')).toBeInTheDocument()
  expect(within(item).getByRole('status')).toHaveTextContent('Not quite')
  expect(within(item).getByRole('link', { name: 'Try a similar question' })).toHaveAttribute('href', '/practice?types=L19-b&n=10')
  // the others stay closed
  expect(screen.queryByText('Stem 9')).not.toBeInTheDocument()
  await userEvent.click(button)
  expect(button).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Stem 10')).not.toBeInTheDocument()
})

test('Show only missed leaves the wrong and unanswered questions, and turns off again', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  const only = await screen.findByRole('button', { name: 'Show only missed' })
  expect(only).toHaveAttribute('aria-pressed', 'false')
  await userEvent.click(only)
  expect(only).toHaveAttribute('aria-pressed', 'true')
  const names = () => [...document.querySelectorAll('.results-list > li .results-q')].map((el) => el.textContent)
  expect(names()).toEqual(['Question 10', 'Question 11', 'Question 12'])
  await userEvent.click(only)
  expect(names()).toHaveLength(12)
})

test('an unanswered question says Not answered and reveals its correct choice', async () => {
  await renderResults({ pathname: '/results/s1', state: { session } })
  const item = await expand(12)
  expect(within(item).getByText('Not answered')).toBeInTheDocument()
  expect(within(item).getByRole('button', { name: /Correct answer$/ })).toHaveTextContent('gamma')
  expect(screen.getAllByText('Not answered')).toHaveLength(1)
  const wrong = await expand(10)
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
