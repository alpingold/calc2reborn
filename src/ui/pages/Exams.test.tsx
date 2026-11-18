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
import { sessionsFromAttempts } from '../../storage/backfill'

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
  const state = loc.state as { resume?: string; begin?: string } | null
  return <p>{`at:${loc.pathname}${loc.search}${state?.resume ? ` resume:${state.resume}` : ''}${state?.begin ? ` begin:${state.begin}` : ''}`}</p>
}

/** The cell of the papers table for a term and a column, such as ('Fall 2025', 'Exam 1'). */
function cell(term: string, column: string): HTMLElement {
  const table = screen.getByRole('table')
  const columns = within(table).getAllByRole('columnheader').map((h) => h.textContent)
  const row = within(table).getByRole('rowheader', { name: term }).closest('tr')!
  return within(row).getAllByRole('cell')[columns.indexOf(column) - 1]
}

afterEach(() => {
  localStorage.clear()
})

/** Give every exam session in the store its record, as Submit does. */
async function finishSessions(store: MemoryStore) {
  for (const r of sessionsFromAttempts(await store.listAttempts(), content)) await store.saveSessionRecord(r)
}

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

test('past papers are a grid of terms by exam: the best score if taken, Start if not, No paper where none exists', async () => {
  const store = new MemoryStore()
  // session a: 10 of 12 right; session b: 7 right with the rest unanswered
  for (let n = 1; n <= 12; n++) await store.logAttempt(attempt('a', 'f2025-e1', n, n <= 10))
  for (let n = 1; n <= 7; n++) await store.logAttempt(attempt('b', 'f2025-e1', n, true))
  await finishSessions(store)
  await setup(store)

  const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  expect(headings).toEqual(['Mock exam on Lessons 1 to 26', 'Your attempts', 'Past Purdue papers', 'Extra practice'])
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Term', 'Exam 1', 'Exam 2', 'Exam 3', 'Final'])
  // newest term first
  expect(within(table).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Fall 2025', 'Spring 2024'])

  const e1 = await within(cell('Fall 2025', 'Exam 1')).findByRole('link', { name: '10 of 12, your best on Fall 2025 Exam 1' })
  expect(e1).toHaveAttribute('href', '/exams/f2025-e1')
  expect(within(cell('Fall 2025', 'Final')).getByRole('link', { name: 'Start Fall 2025 Final' })).toHaveAttribute('href', '/exams/f2025-final')
  expect(within(cell('Spring 2024', 'Exam 2')).getByRole('link', { name: 'Start Spring 2024 Exam 2' })).toHaveAttribute('href', '/exams/s2024-e2')
  expect(cell('Fall 2025', 'Exam 2')).toHaveTextContent('No paper')
  expect(within(cell('Fall 2025', 'Exam 2')).queryByRole('link')).not.toBeInTheDocument()
  expect(cell('Spring 2024', 'Final')).toHaveTextContent('No paper')
})

test('the filters show every paper, only those not taken, or only finals', async () => {
  const store = new MemoryStore()
  for (let n = 1; n <= 12; n++) await store.logAttempt(attempt('a', 'f2025-e1', n, n <= 10))
  await finishSessions(store)
  await setup(store)
  const group = screen.getByRole('group', { name: 'Show' })
  const all = within(group).getByRole('button', { name: 'All 3' })
  const untaken = within(group).getByRole('button', { name: 'Not taken' })
  const finals = within(group).getByRole('button', { name: 'Finals only' })
  expect(all).toHaveAttribute('aria-pressed', 'true')
  await within(cell('Fall 2025', 'Exam 1')).findByRole('link')

  await userEvent.click(untaken)
  expect(untaken).toHaveAttribute('aria-pressed', 'true')
  expect(all).toHaveAttribute('aria-pressed', 'false')
  // the paper already taken is no longer offered; the rest of its term stays
  expect(cell('Fall 2025', 'Exam 1')).toHaveTextContent('Taken')
  expect(within(cell('Fall 2025', 'Exam 1')).queryByRole('link')).not.toBeInTheDocument()
  expect(within(cell('Fall 2025', 'Final')).getByRole('link', { name: 'Start Fall 2025 Final' })).toBeInTheDocument()

  await userEvent.click(finals)
  expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Term', 'Final'])
  // a term with no final has no row
  expect(within(screen.getByRole('table')).getAllByRole('rowheader').map((h) => h.textContent)).toEqual(['Fall 2025'])
  expect(within(screen.getByRole('table')).queryByRole('link', { name: /Exam 1/ })).not.toBeInTheDocument()

  await userEvent.click(all)
  expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(2)
})

test('with every paper taken, Not taken says so', async () => {
  const store = new MemoryStore()
  for (const id of ['f2025-e1', 'f2025-final', 's2024-e2']) await store.logAttempt(attempt(`s-${id}`, id, 1, true))
  await finishSessions(store)
  await setup(store)
  await within(cell('Fall 2025', 'Exam 1')).findByRole('link', { name: /your best/ })
  await userEvent.click(screen.getByRole('button', { name: 'Not taken' }))
  expect(screen.getByText('You have taken every paper.')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

test('Start mock exam goes to the chosen lesson range, timed unless feedback is chosen', async () => {
  await setup()
  const u = userEvent.setup()
  expect(screen.getByRole('radio', { name: /Timed, like the real one/ })).toBeChecked()
  expect(screen.getByRole('radio', { name: /Untimed, with feedback/ })).not.toBeChecked()
  // the range is there to change, but out of the way until asked for
  expect(screen.queryByRole('combobox', { name: 'From' })).not.toBeInTheDocument()
  const change = screen.getByRole('button', { name: 'Change the lessons' })
  expect(change).toHaveAttribute('aria-expanded', 'false')
  await u.click(change)
  expect(change).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('L26')
  await u.selectOptions(screen.getByRole('combobox', { name: 'From' }), 'L19')
  expect(screen.getByRole('heading', { level: 3, name: 'Mock exam on Lessons 19 to 26' })).toBeInTheDocument()
  await u.click(screen.getByRole('button', { name: 'Start mock exam' }))
  expect(await screen.findByText('at:/exams/mock?from=L19&to=L26 begin:timed')).toBeInTheDocument()
})

test('choosing Untimed, with feedback starts the mock that way', async () => {
  await setup()
  await userEvent.click(screen.getByRole('radio', { name: /Untimed, with feedback/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Start mock exam' }))
  expect(await screen.findByText('at:/exams/mock?from=L1&to=L26 begin:feedback')).toBeInTheDocument()
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
  await finishSessions(store)
  await setup(store)
  expect(await within(cell('Fall 2025', 'Exam 1')).findByRole('link', { name: '5 of 12, your best on Fall 2025 Exam 1' })).toBeInTheDocument()
  expect(cell('Fall 2025', 'Exam 1')).not.toHaveTextContent('with feedback')
  expect(within(cell('Fall 2025', 'Final')).getByRole('link', { name: /^3 of 20, your best on Fall 2025 Final/ })).toHaveTextContent('with feedback')
})

test('the mock card defaults to the exam lessons while an exam is ahead, and says it is recommended', async () => {
  await setup(new MemoryStore(), { examDate: '2099-01-01', examLessonIds: ['L21', 'L22', 'L23'] })
  expect(screen.getByRole('heading', { level: 3, name: 'Mock exam on Lessons 21 to 23' })).toBeInTheDocument()
  expect(screen.getByText('Recommended')).toBeInTheDocument()
  expect(screen.getByText(/covers Lessons 21 to 23\.$/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Change the lessons' }))
  expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue('L21')
  expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('L23')
})

test('with no exam ahead the mock card runs from the first lesson to the current one', async () => {
  await setup()
  expect(screen.getByRole('heading', { level: 3, name: 'Mock exam on Lessons 1 to 26' })).toBeInTheDocument()
  expect(screen.queryByText('Recommended')).not.toBeInTheDocument()
})

test('unofficial exams have their own section, said to be written for this app, with a best score', async () => {
  const store = new MemoryStore()
  for (let n = 1; n <= 12; n++) await store.logAttempt(attempt('x', 'xp-e3-a', n, n <= 9))
  await finishSessions(store)
  await setup(store)
  const section = screen.getByRole('heading', { level: 3, name: 'Extra practice' }).closest('section')!
  expect(within(section).getByText(/written for this app/i)).toBeInTheDocument()
  const link = within(section).getByRole('link', { name: 'Extra Practice Exam 3 (A)' })
  expect(link).toHaveAttribute('href', '/exams/xp-e3-a')
  expect(await within(link.closest('li')!).findByText('Best: 9 of 12')).toBeInTheDocument()
  // it is not a Purdue paper, so it is not in the grid
  expect(within(screen.getByRole('table')).queryByText(/Extra Practice/)).not.toBeInTheDocument()
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

test('your attempts are listed newest first with score, date and mode, each linking to its results', async () => {
  const store = new MemoryStore()
  await store.saveSessionRecord(record('a', '2026-10-01T15:00:00.000Z'))
  await store.saveSessionRecord(
    record('b', '2026-11-05T15:00:00.000Z', { kind: 'mock', examId: undefined, from: 'L20', to: 'L22', correct: 7, feedback: true }),
  )
  await setup(store)
  const list = await screen.findByRole('list', { name: 'Your attempts' })
  const rows = within(list).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByRole('link', { name: /^Mock exam, Lessons 20 to 22/ })).toHaveAttribute('href', '/results/b')
  expect(rows[0]).toHaveTextContent(/2026 · with feedback\s*7 of 12$/)
  expect(within(rows[1]).getByRole('link', { name: /^Fall 2025 Exam 1/ })).toHaveAttribute('href', '/results/a')
  expect(rows[1]).toHaveTextContent(/2026 · timed\s*9 of 12$/)
})

test('with no finished exams the attempts card says so', async () => {
  await setup()
  expect(screen.getByText(/Nothing finished yet/)).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Your attempts' })).not.toBeInTheDocument()
})

test('a past attempt at an exam that was removed from the content is left out', async () => {
  const store = new MemoryStore()
  await store.saveSessionRecord(record('gone', '2026-10-01T15:00:00.000Z', { examId: 'f1999-e1' }))
  await setup(store)
  await within(cell('Fall 2025', 'Exam 1')).findByRole('link', { name: 'Start Fall 2025 Exam 1' })
  expect(screen.queryByRole('list', { name: 'Your attempts' })).not.toBeInTheDocument()
})

test('answers checked in an exam that was never finished give no best score', async () => {
  const store = new MemoryStore()
  for (let n = 1; n <= 4; n++) await store.logAttempt({ ...attempt('left', 'f2025-e1', n, true), feedback: true })
  await setup(store)
  expect(await within(cell('Fall 2025', 'Exam 1')).findByRole('link', { name: 'Start Fall 2025 Exam 1' })).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Your attempts' })).not.toBeInTheDocument()
})

test('with no past exams in the content, it says so and offers no filters', async () => {
  const store = new MemoryStore()
  render(
    <MemoryRouter initialEntries={['/exams']}>
      <StoreProvider store={store} scheduler={await createScheduler()} content={buildContent(fixtureLessons(), [], [])}>
        <Exams />
      </StoreProvider>
    </MemoryRouter>,
  )
  expect(await screen.findByText('No past exams yet')).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Show' })).not.toBeInTheDocument()
})
