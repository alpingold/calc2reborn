import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Dashboard } from './Dashboard'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import type { Settings } from '../../storage/types'
import { buildContent } from '../../content'
import { fixtureCard, fixtureLessons, fixtureTypes, PLANNED_LESSON_COUNT } from '../../test/fixtures'
import { createScheduler } from '../../engine/fsrs'
import type { Choice, Exam, Question } from '../../content/schema'

const NOW = new Date(2026, 10, 7, 12, 0)

const choices: Choice[] = [
  { label: 'A', text: 'a' },
  { label: 'B', text: 'b' },
  { label: 'C', text: 'c' },
  { label: 'D', text: 'd' },
  { label: 'E', text: 'e' },
]
function q(n: number): Question {
  return {
    id: `t-q${n}`,
    number: n,
    points: 6,
    stem: `s${n}`,
    choices,
    answer: 'A',
    lessonIds: ['L20'],
    typeIds: [n === 3 ? 'L20-b' : 'L20-a'],
    status: 'reviewed',
  }
}
const seedExam: Exam = {
  id: 'test-fall-2025-1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: [q(1), q(2), q(3)],
}
const lessons = fixtureLessons().map((l) => (l.id === 'L20' ? { ...l, problemTypes: fixtureTypes('L20') } : l))
const content = buildContent(lessons, [fixtureCard('L19-c01', 'L19')], [seedExam])

async function setup(settings: Partial<Settings>, seed?: (s: MemoryStore) => Promise<void>) {
  const store = new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, ...settings })
  await seed?.(store)
  const scheduler = await createScheduler()
  render(
    <MemoryRouter>
      <StoreProvider store={store} scheduler={scheduler} content={content} now={() => NOW}>
        <Dashboard />
      </StoreProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 2, name: 'Dashboard' })
  return { store }
}

test('first launch asks for the current lesson and hides the prompt after saving', async () => {
  const { store } = await setup({})
  expect(screen.getByText('Where are you in the course?')).toBeInTheDocument()
  const select = screen.getByLabelText('Current lesson')
  expect(within(select).getAllByRole('option')).toHaveLength(PLANNED_LESSON_COUNT)
  await userEvent.selectOptions(select, 'L23')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('heading', { name: 'Today' })
  expect(screen.queryByText('Where are you in the course?')).not.toBeInTheDocument()
  expect((await store.getSettings()).currentLessonId).toBe('L23')
})

test('the plan lists due and new cards and the weakest types, each as a link', async () => {
  await setup({ currentLessonId: 'L20' }, async (store) => {
    const scheduler = await createScheduler()
    const st = scheduler.newState('L19-c01', new Date(2026, 10, 1))
    await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: new Date(2026, 10, 6).toISOString() } })
  })
  expect(await screen.findByRole('link', { name: 'Review 1 due card' })).toHaveAttribute('href', '/review')
  expect(screen.getByRole('link', { name: 'Practise your weakest types: L20 type A, L20 type B' })).toHaveAttribute(
    'href',
    '/practice?types=L20-a,L20-b&n=10',
  )
  expect(screen.queryByText(/until the exam/)).not.toBeInTheDocument()
  expect(screen.queryByText('Done for today')).not.toBeInTheDocument()
})

test('a missed question from an earlier day is offered for retry', async () => {
  await setup({ currentLessonId: 'L20' }, async (store) => {
    await store.logAttempt({
      id: 'a1',
      questionId: 't-q1',
      chosen: 'B',
      correct: false,
      seconds: 5,
      timestamp: new Date(2026, 10, 5, 10).toISOString(),
      mode: 'practice',
    })
  })
  expect(await screen.findByRole('link', { name: 'Retry 1 missed question' })).toHaveAttribute('href', '/practice?retry=1')
})

test('a finished item is ticked and no longer a link, and the plan says so when all are done', async () => {
  await setup({ currentLessonId: 'L20', dailyNewCards: 0 }, async (store) => {
    for (let i = 0; i < 10; i++) {
      await store.logAttempt({
        id: `a${i}`,
        questionId: 't-q1',
        chosen: 'A',
        correct: true,
        seconds: 5,
        timestamp: new Date(2026, 10, 7, 9, i).toISOString(),
        mode: 'practice',
      })
    }
  })
  expect(await screen.findByText('Done for today')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Practise your weakest types/ })).not.toBeInTheDocument()
  expect(screen.getByText(/Practise your weakest types/)).toBeInTheDocument()
})

test('with nothing to plan, it says how to begin', async () => {
  const store = new MemoryStore()
  const scheduler = await createScheduler()
  render(
    <MemoryRouter>
      <StoreProvider store={store} scheduler={scheduler} content={buildContent(fixtureLessons(), [], [])} now={() => NOW}>
        <Dashboard />
      </StoreProvider>
    </MemoryRouter>,
  )
  expect(await screen.findByText('Nothing planned yet. Set your current lesson to begin.')).toBeInTheDocument()
})

test('the exam block shows the countdown, type tiles, and the latest timed mock on the exam lessons', async () => {
  await setup(
    { currentLessonId: 'L23', examDate: '2026-11-12', examLessonIds: ['L19', 'L20'] },
    async (store) => {
      // wrong, correct, correct on type A => 0 -> 0.3 -> 0.51; the same three answers score L20
      for (const [i, correct] of [false, true, true].entries()) {
        await store.logAttempt({
          id: `a${i}`,
          questionId: `t-q${(i % 2) + 1}`,
          chosen: 'A',
          correct,
          seconds: 5,
          timestamp: new Date(2026, 10, 1, 10, i).toISOString(),
          mode: 'practice',
        })
      }
      const base = { questionIds: [], startedAt: '', feedback: false, total: 12 }
      // a mock on other lessons, and one taken with feedback, do not count
      await store.saveSessionRecord({ ...base, sessionId: 's1', kind: 'mock', from: 'L1', to: 'L20', finishedAt: new Date(2026, 10, 6).toISOString(), correct: 12 })
      await store.saveSessionRecord({ ...base, sessionId: 's2', kind: 'mock', from: 'L19', to: 'L20', finishedAt: new Date(2026, 10, 5).toISOString(), correct: 11, feedback: true })
      await store.saveSessionRecord({ ...base, sessionId: 's3', kind: 'mock', from: 'L19', to: 'L20', finishedAt: new Date(2026, 10, 4).toISOString(), correct: 9 })
    },
  )
  expect(await screen.findByText('5 days until the exam')).toBeInTheDocument()
  const panel = screen.getByRole('complementary', { name: 'Next exam' })
  expect(await within(panel).findByRole('link', { name: 'L20 type A, 51%' })).toHaveClass('mastery-weak')
  expect(within(panel).getByRole('link', { name: 'L20 type B, untested' })).toHaveAttribute('href', '/practice?types=L20-b&n=10')
  expect(within(panel).getByText('1 of 2 problem types tested')).toBeInTheDocument()
  expect(within(panel).getByText(/^Latest timed mock: 9 of 12 on /)).toBeInTheDocument()
  expect(within(panel).getByRole('link', { name: 'Take a mock exam' })).toHaveAttribute('href', '/exams/mock?from=L19&to=L20')
  expect(screen.queryByRole('heading', { name: 'Weakest lessons' })).not.toBeInTheDocument()
  expect(await screen.findByTitle('L20: Topic 20, 51%')).toHaveClass('mastery-weak')
  // touch and screen reader users get the lesson title too, not only "L19"
  expect(screen.getByRole('link', { name: 'L19 Topic 19, untested' })).toHaveAttribute('href', '/course/L19')
})

test('with no timed mock on the exam lessons, the exam block says so', async () => {
  await setup({ currentLessonId: 'L23', examDate: '2026-11-12', examLessonIds: ['L19', 'L20'] })
  expect(await screen.findByText('No timed mock on these lessons yet')).toBeInTheDocument()
})

test('a load error clears once progress loads after a settings change', async () => {
  let fail = true
  await setup({}, async (s) => {
    const real = s.listAttempts.bind(s)
    s.listAttempts = async (f) => {
      if (fail) throw new Error('boom')
      return real(f)
    }
  })
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your progress.')
  fail = false
  await userEvent.selectOptions(screen.getByLabelText('Current lesson'), 'L20')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByRole('heading', { name: 'Today' })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the mastery grid leaves out extra topics', async () => {
  await setup({ currentLessonId: 'L19' })
  await screen.findByRole('heading', { name: 'Today' })
  expect(screen.queryByRole('heading', { name: 'Other topics' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Parametric/ })).not.toBeInTheDocument()
})
