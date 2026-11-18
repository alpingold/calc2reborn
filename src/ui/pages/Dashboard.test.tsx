import { beforeEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { LESSON_CHECK_KEY, localDay } from '../../lessonCheck'
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

beforeEach(() => localStorage.clear())

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
  await screen.findByRole('heading', { level: 2, name: "Today's session" })
  return { store }
}

test('first launch asks for the current lesson and hides the prompt after saving', async () => {
  const { store } = await setup({})
  expect(screen.getByText('Where are you in the course?')).toBeInTheDocument()
  const select = screen.getByLabelText('Current lesson')
  expect(within(select).getAllByRole('option')).toHaveLength(PLANNED_LESSON_COUNT)
  await userEvent.selectOptions(select, 'L23')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByText('Where are you in the course?')).not.toBeInTheDocument())
  expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentLessonId: 'L23' })
  expect(screen.queryByRole('complementary', { name: 'Next exam' })).not.toBeInTheDocument()
})

test('first launch can also take the exam date and its lessons, and the exam block appears at once', async () => {
  const { store } = await setup({})
  await userEvent.selectOptions(screen.getByLabelText('Current lesson'), 'L20')
  expect(screen.queryByLabelText('Last lesson on the exam')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Exam date'), { target: { value: '2026-11-12' } })
  await userEvent.selectOptions(screen.getByLabelText('First lesson on the exam'), 'L19')
  // one choice is already a range of one lesson
  expect(screen.getByLabelText('Last lesson on the exam')).toHaveValue('L19')
  await userEvent.selectOptions(screen.getByLabelText('Last lesson on the exam'), 'L21')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  const panel = await screen.findByRole('complementary', { name: 'Next exam' })
  expect(within(panel).getByText('5')).toBeInTheDocument()
  expect(await store.getSettings()).toEqual({
    ...DEFAULT_SETTINGS,
    currentLessonId: 'L20',
    examDate: '2026-11-12',
    examLessonIds: ['L19', 'L20', 'L21'],
  })
})

test('"Move on" saves the next planned lesson as the current one', async () => {
  localStorage.setItem(LESSON_CHECK_KEY, localDay(NOW))
  const { store } = await setup({ currentLessonId: 'L20' })
  expect(screen.getByText(/Finished Lesson 20 in class\?/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Move on to Lesson 21' }))
  expect(await screen.findByRole('button', { name: 'Move on to Lesson 22' })).toBeInTheDocument()
  expect((await store.getSettings()).currentLessonId).toBe('L21')
  expect(screen.getByText(/You are on Lesson 21/)).toBeInTheDocument()
})

test('the last lesson has nowhere to move on to', async () => {
  await setup({ currentLessonId: `L${PLANNED_LESSON_COUNT}` })
  expect(screen.getByText(new RegExp(`You are on Lesson ${PLANNED_LESSON_COUNT}`))).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Move on/ })).not.toBeInTheDocument()
})

test('the first unfinished step is the Up next card with the one Start button, and the rest are numbered links', async () => {
  await setup({ currentLessonId: 'L20' }, async (store) => {
    const scheduler = await createScheduler()
    const st = scheduler.newState('L19-c01', new Date(2026, 10, 1))
    await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: new Date(2026, 10, 6).toISOString() } })
  })
  expect(await screen.findByRole('link', { name: 'Start: Review 1 due card' })).toHaveAttribute('href', '/review')
  expect(screen.getByText('Up next · step 1 of 2')).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /^Start/ })).toHaveLength(1)
  const rows = within(screen.getByRole('list', { name: 'Other steps today' })).getAllByRole('listitem')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toHaveTextContent(/^2Practise your weakest types: L20 type A, L20 type B/)
  expect(within(rows[0]).getByRole('link', { name: /^Practise your weakest types: L20 type A, L20 type B/ })).toHaveAttribute(
    'href',
    '/practice?types=L20-a,L20-b&n=10',
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
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
  expect(await screen.findByRole('link', { name: /Retry 1 missed question/ })).toHaveAttribute('href', '/practice?retry=1')
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

test('the exam block shows the countdown, one bar of the problem types, the weakest by name, and the latest timed mock', async () => {
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
  const panel = await screen.findByRole('complementary', { name: 'Next exam' })
  expect(panel).toHaveTextContent('5 days until the exam')
  expect(panel).toHaveTextContent('Lessons 19 to 20')
  // the bar says in words what its colours show, and the same counts are written under it
  expect(await within(panel).findByRole('img', { name: '0 strong, 0 getting there, 1 weak, 1 not tested' })).toBeInTheDocument()
  expect(within(panel).getByText('2 problem types on this exam')).toBeInTheDocument()
  expect(within(panel).getByText('1 tested')).toBeInTheDocument()
  expect(panel).toHaveTextContent('1 weak')
  expect(panel).toHaveTextContent('1 not tested yet')
  // only tested types are named as weakest, with the plain count of right answers
  const weakest = within(panel).getByRole('heading', { name: 'Weakest right now' }).parentElement as HTMLElement
  const links = within(weakest).getAllByRole('link')
  expect(links).toHaveLength(1)
  expect(links[0]).toHaveAccessibleName('Practise L20 type A, 2 of 3 right')
  expect(links[0]).toHaveAttribute('href', '/practice?types=L20-a&n=10')
  expect(links[0]).toHaveTextContent('2 of 3')
  expect(panel).toHaveTextContent(/Latest timed mock: 9 of 12 on /)
  expect(within(panel).getByRole('link', { name: 'Take a timed mock exam' })).toHaveAttribute('href', '/exams/mock?from=L19&to=L20')
  expect(screen.queryByRole('heading', { name: 'Weakest lessons' })).not.toBeInTheDocument()
  const tile = await screen.findByTitle('Lesson 20: Topic 20, Weak, 51%')
  expect(tile).toHaveClass('mastery-weak')
  expect(tile).toHaveTextContent('20')
  // touch and screen reader users get the lesson title and the mastery in words, not only the number
  expect(screen.getByRole('link', { name: 'Lesson 19: Topic 19, Not tested' })).toHaveAttribute('href', '/course/L19')
  expect(screen.getByRole('link', { name: 'Lesson 23: Topic 23, Not tested, your current lesson' })).toHaveClass('current')
  expect(screen.getByText(/Lessons 19 to 20 are on your next exam\./)).toBeInTheDocument()
})

test('with nothing tested, the exam block names no weakest types', async () => {
  await setup({ currentLessonId: 'L23', examDate: '2026-11-12', examLessonIds: ['L19', 'L20'] })
  const panel = await screen.findByRole('complementary', { name: 'Next exam' })
  expect(within(panel).getByRole('img', { name: '0 strong, 0 getting there, 0 weak, 2 not tested' })).toBeInTheDocument()
  expect(within(panel).queryByRole('heading', { name: 'Weakest right now' })).not.toBeInTheDocument()
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
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(screen.getByText(/You are on Lesson 20/)).toBeInTheDocument()
})

test('the mastery grid leaves out extra topics', async () => {
  await setup({ currentLessonId: 'L19' })
  await screen.findByRole('heading', { name: 'Course map' })
  expect(screen.queryByRole('heading', { name: 'Other topics' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Parametric/ })).not.toBeInTheDocument()
})

test('the first visit of a day asks whether the current lesson is still right, and Yes settles it for the day', async () => {
  const { store } = await setup({ currentLessonId: 'L20' })
  expect(screen.getByText(/Are you still on Lesson 20/)).toBeInTheDocument()
  // the quieter "Move on" line waits until the question is answered
  expect(screen.queryByRole('button', { name: /Move on/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Yes, still on Lesson 20' }))
  expect(screen.queryByText(/Are you still on Lesson 20/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Move on to Lesson 21' })).toBeInTheDocument()
  expect((await store.getSettings()).currentLessonId).toBe('L20')
  expect(localStorage.getItem(LESSON_CHECK_KEY)).toBe(localDay(NOW))
})

test('the lesson question is not asked again the same day, and is asked again the next day', async () => {
  localStorage.setItem(LESSON_CHECK_KEY, localDay(NOW))
  await setup({ currentLessonId: 'L20' })
  expect(screen.queryByText(/Are you still on Lesson 20/)).not.toBeInTheDocument()
  cleanup()
  localStorage.setItem(LESSON_CHECK_KEY, localDay(new Date(2026, 10, 6, 23, 0)))
  await setup({ currentLessonId: 'L20' })
  expect(screen.getByText(/Are you still on Lesson 20/)).toBeInTheDocument()
})

test('answering No moves to the next lesson, and another lesson can be picked instead', async () => {
  const { store } = await setup({ currentLessonId: 'L20' })
  await userEvent.click(screen.getByRole('button', { name: "No, I'm on Lesson 21" }))
  await waitFor(async () => expect((await store.getSettings()).currentLessonId).toBe('L21'))
  expect(screen.queryByText(/Are you still on/)).not.toBeInTheDocument()
  cleanup()
  localStorage.clear()
  const second = await setup({ currentLessonId: 'L20' })
  await userEvent.selectOptions(screen.getByLabelText('A different lesson'), 'L23')
  await waitFor(async () => expect((await second.store.getSettings()).currentLessonId).toBe('L23'))
  expect(screen.queryByText(/Are you still on/)).not.toBeInTheDocument()
})

test('first launch does not also ask the daily lesson question', async () => {
  await setup({})
  expect(screen.queryByText(/Are you still on/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.queryByText('Where are you in the course?')).not.toBeInTheDocument())
  expect(screen.queryByText(/Are you still on/)).not.toBeInTheDocument()
})
