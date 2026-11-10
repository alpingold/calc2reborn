import { afterEach, expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Exams } from './Exams'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import type { Attempt, SessionRecord } from '../../storage/types'
import { buildContent } from '../../content'
import { fixtureLessons } from '../../test/fixtures'
import { createScheduler } from '../../engine/fsrs'
import type { Choice, Exam, OfficialExam, Question } from '../../content/schema'
import { saveSession } from '../examSession'

const choices: Choice[] = (['A', 'B', 'C', 'D', 'E'] as const).map((label) => ({ label, text: label }))

function exam(id: string, year: number, term: OfficialExam['term'], which: OfficialExam['exam'], count: number): Exam {
  const questions: Question[] = Array.from({ length: count }, (_, i) => ({
    id: `${id}-q${i + 1}`,
    number: i + 1,
    points: 8,
    stem: `Stem ${i + 1}`,
    choices,
    answer: 'C',
    lessonIds: ['L19'],
    status: 'reviewed',
  }))
  return { id, term, year, exam: which, examUrl: '', durationMinutes: 60, questions }
}

const extraExam: Exam = {
  id: 'xp-e3-a',
  title: 'Extra Practice Exam 3 (A)',
  unofficial: true,
  durationMinutes: 60,
  questions: exam('xp-e3-a', 2025, 'Fall', '3', 12).questions.map((q) => ({ ...q, answerSource: 'written' as const })),
}

const content = buildContent(fixtureLessons(), [], [
  extraExam,
  exam('f2025-e1', 2025, 'Fall', '1', 12),
  exam('f2025-final', 2025, 'Fall', 'final', 20),
  exam('s2024-e2', 2024, 'Spring', '2', 12),
])

function attempt(sessionId: string, examId: string, n: number, correct: boolean, mode: Attempt['mode'] = 'exam'): Attempt {
  return {
    id: `${sessionId}-${n}`,
    questionId: `${examId}-q${n}`,
    chosen: correct ? 'C' : 'A',
    correct,
    seconds: 10,
    timestamp: '2026-11-01T12:00:00.000Z',
    mode,
    sessionId,
    examId,
  }
}

function Where() {
  const loc = useLocation()
  const resume = (loc.state as { resume?: string } | null)?.resume
  return <p>{`at:${loc.pathname}${loc.search}${resume ? ` resume:${resume}` : ''}`}</p>
}

afterEach(() => {
  localStorage.clear()
})

async function setup(store = new MemoryStore(), settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentLessonId: 'L26', ...settings })
  render(
    <MemoryRouter initialEntries={['/exams']}>
      <StoreProvider store={store} scheduler={await createScheduler()} content={content}>
        <Routes>
          <Route path="/exams" element={<Exams />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 2, name: 'Exams' })
}

test('lists exams by year and term with the best score or Not taken', async () => {
  const store = new MemoryStore()
  // session a: 10 of 12 right; session b: 7 right with the rest unanswered
  for (let n = 1; n <= 12; n++) await store.logAttempt(attempt('a', 'f2025-e1', n, n <= 10))
  for (let n = 1; n <= 7; n++) await store.logAttempt(attempt('b', 'f2025-e1', n, true))
  await setup(store)

  const years = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  expect(years).toEqual(['Mock exam', 'Extra practice', '2025', '2024'])
  expect(screen.getByRole('heading', { level: 4, name: 'Fall' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 4, name: 'Spring' })).toBeInTheDocument()

  const e1 = screen.getByRole('link', { name: 'Exam 1' })
  expect(e1).toHaveAttribute('href', '/exams/f2025-e1')
  expect(await within(e1.closest('li')!).findByText('Best: 10/12')).toBeInTheDocument()
  const final = screen.getByRole('link', { name: 'Final' })
  expect(within(final.closest('li')!).getByText('Not taken')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Exam 2' })).toHaveAttribute('href', '/exams/s2024-e2')
})

test('Generate mock exam navigates with the chosen lesson range', async () => {
  await setup()
  const u = userEvent.setup()
  expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('L26')
  await u.selectOptions(screen.getByRole('combobox', { name: 'From' }), 'L19')
  await u.click(screen.getByRole('button', { name: 'Generate mock exam' }))
  expect(await screen.findByText('at:/exams/mock?from=L19&to=L26')).toBeInTheDocument()
})

test('shows no Resume link when no exam is in progress', async () => {
  await setup()
  expect(screen.queryByRole('link', { name: 'Resume' })).not.toBeInTheDocument()
})

test('shows a Resume link for the exam in progress', async () => {
  saveSession({
    sessionId: 's-live',
    kind: 'exam',
    examId: 'f2025-e1',
    questionIds: ['f2025-e1-q1', 'f2025-e1-q2'],
    answers: { 'f2025-e1-q1': 'B' },
    marked: [],
    startedAt: new Date().toISOString(),
    durationMinutes: 60,
  })
  await setup()
  const resume = screen.getByRole('link', { name: 'Resume' })
  expect(resume.closest('p')).toHaveTextContent('In progress: Fall 2025 Exam 1, 1 of 2 answered.')
  expect(resume).toHaveAttribute('href', '/exams/f2025-e1')
  await userEvent.click(resume)
  expect(await screen.findByText('at:/exams/f2025-e1 resume:s-live')).toBeInTheDocument()
})

test('a Resume link for a mock leads back to its lesson range', async () => {
  saveSession({
    sessionId: 's-mock',
    kind: 'mock',
    from: 'L19',
    to: 'L26',
    questionIds: ['f2025-e1-q1'],
    answers: {},
    marked: [],
    startedAt: '2000-01-01T00:00:00.000Z',
    durationMinutes: 60,
  })
  await setup()
  const resume = screen.getByRole('link', { name: 'Resume' })
  expect(resume.closest('p')).toHaveTextContent('In progress: Mock exam, Lessons 19 to 26. Its time is up; resuming submits it.')
  expect(resume).toHaveAttribute('href', '/exams/mock?from=L19&to=L26')
})

test('a feedback session in progress is never described as out of time', async () => {
  saveSession({
    sessionId: 's-fb',
    kind: 'exam',
    examId: 'f2025-e1',
    questionIds: ['f2025-e1-q1', 'f2025-e1-q2'],
    answers: {},
    marked: [],
    startedAt: '2000-01-01T00:00:00.000Z',
    durationMinutes: 60,
    feedback: true,
    checked: [],
  })
  await setup()
  const resume = screen.getByRole('link', { name: 'Resume' })
  expect(resume.closest('p')).toHaveTextContent('In progress: Fall 2025 Exam 1 with feedback, 0 of 2 answered.')
})

test('best scores: timed attempts first, feedback-only exams labelled', async () => {
  const store = new MemoryStore()
  // f2025-e1: a timed run with 5 right and a feedback run with 11 right
  for (let n = 1; n <= 12; n++) await store.logAttempt(attempt('t', 'f2025-e1', n, n <= 5))
  for (let n = 1; n <= 12; n++) await store.logAttempt({ ...attempt('f', 'f2025-e1', n, n <= 11), feedback: true })
  // f2025-final: only a feedback run
  for (let n = 1; n <= 3; n++) await store.logAttempt({ ...attempt('g', 'f2025-final', n, true), feedback: true })
  await setup(store)
  const e1 = screen.getByRole('link', { name: 'Exam 1' })
  expect(await within(e1.closest('li')!).findByText('Best: 5/12')).toBeInTheDocument()
  const final = screen.getByRole('link', { name: 'Final' })
  expect(within(final.closest('li')!).getByText('Best with feedback: 3/20')).toBeInTheDocument()
})

test('the mock form defaults to the exam lessons while an exam is ahead', async () => {
  await setup(new MemoryStore(), { examDate: '2099-01-01', examLessonIds: ['L21', 'L22', 'L23'] })
  expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue('L21')
  expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('L23')
})

test('unofficial exams have their own section, said to be written for this app, with a best score', async () => {
  const store = new MemoryStore()
  for (let n = 1; n <= 12; n++) await store.logAttempt(attempt('x', 'xp-e3-a', n, n <= 9))
  await setup(store)
  const section = screen.getByRole('heading', { level: 3, name: 'Extra practice' }).closest('section')!
  expect(within(section).getByText(/written for this app/i)).toBeInTheDocument()
  const link = within(section).getByRole('link', { name: 'Extra Practice Exam 3 (A)' })
  expect(link).toHaveAttribute('href', '/exams/xp-e3-a')
  expect(await within(link.closest('li')!).findByText('Best: 9/12')).toBeInTheDocument()
})

function record(sessionId: string, finishedAt: string, extra: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId,
    kind: 'exam',
    examId: 'f2025-e1',
    questionIds: [],
    startedAt: finishedAt,
    finishedAt,
    feedback: false,
    correct: 9,
    total: 12,
    ...extra,
  }
}

test('past attempts are listed newest first with score, date and mode, each linking to its results', async () => {
  const store = new MemoryStore()
  await store.saveSessionRecord(record('a', '2026-10-01T15:00:00.000Z'))
  await store.saveSessionRecord(
    record('b', '2026-11-05T15:00:00.000Z', { kind: 'mock', examId: undefined, from: 'L20', to: 'L22', correct: 7, feedback: true }),
  )
  await setup(store)
  const list = await screen.findByRole('list', { name: 'Past attempts' })
  const rows = within(list).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByRole('link', { name: 'Mock exam, Lessons 20 to 22' })).toHaveAttribute('href', '/results/b')
  expect(rows[0]).toHaveTextContent(/7\/12 · .*2026 · with feedback/)
  expect(within(rows[1]).getByRole('link', { name: 'Fall 2025 Exam 1' })).toHaveAttribute('href', '/results/a')
  expect(rows[1]).toHaveTextContent(/9\/12 · .*2026$/)
})

test('with no finished exams there is no Past attempts section', async () => {
  await setup()
  expect(screen.queryByRole('heading', { name: 'Past attempts' })).not.toBeInTheDocument()
})

test('a past attempt at an exam that was removed from the content is left out', async () => {
  const store = new MemoryStore()
  await store.saveSessionRecord(record('gone', '2026-10-01T15:00:00.000Z', { examId: 'f1999-e1' }))
  await setup(store)
  await screen.findByRole('link', { name: 'Exam 1' })
  expect(screen.queryByRole('heading', { name: 'Past attempts' })).not.toBeInTheDocument()
})
