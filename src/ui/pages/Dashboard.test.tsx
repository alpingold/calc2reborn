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
import { fixtureCard, fixtureLessons, PLANNED_LESSON_COUNT } from '../../test/fixtures'
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
  return { id: `t-q${n}`, number: n, points: 6, stem: `s${n}`, choices, answer: 'A', lessonIds: ['L20'], status: 'reviewed' }
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
const content = buildContent(fixtureLessons(), [fixtureCard('L19-c01', 'L19')], [seedExam])

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
  await screen.findByText(/due today/)
  expect(screen.queryByText('Where are you in the course?')).not.toBeInTheDocument()
  expect((await store.getSettings()).currentLessonId).toBe('L23')
})

test('shows due count and practice link', async () => {
  await setup({ currentLessonId: 'L19' }, async (store) => {
    const scheduler = await createScheduler()
    const st = scheduler.newState('L19-c01', new Date(2026, 10, 1))
    await store.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt: new Date(2026, 10, 6).toISOString() } })
  })
  expect(await screen.findByText('1 card due today')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Start smart practice' })).toHaveAttribute('href', '/practice')
  expect(screen.getByRole('link', { name: 'Review cards' })).toHaveAttribute('href', '/review')
  expect(screen.queryByText(/until the exam/)).not.toBeInTheDocument()
})

test('exam block lists weakest covered lessons, untested first', async () => {
  await setup(
    { currentLessonId: 'L23', examDate: '2026-11-12', examLessonIds: ['L19', 'L20'] },
    async (store) => {
      // wrong, correct, correct => 0 -> 0.3 -> 0.51 for L20
      for (const [i, correct] of [false, true, true].entries()) {
        await store.logAttempt({
          id: `a${i}`,
          questionId: `t-q${i + 1}`,
          chosen: 'A',
          correct,
          seconds: 5,
          timestamp: new Date(2026, 10, 1, 10, i).toISOString(),
          mode: 'practice',
        })
      }
    },
  )
  expect(await screen.findByText('5 days until the exam')).toBeInTheDocument()
  const list = screen.getByRole('heading', { name: 'Weakest lessons' }).nextElementSibling as HTMLElement
  // the exam line renders from settings; the list fills in once attempts have loaded
  const items = await within(list).findAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual(['L19: Topic 19', 'L20: Topic 20'])
  expect(await screen.findByTitle('L20: Topic 20, 51%')).toHaveClass('mastery-weak')
  expect(screen.getByTitle('L19: Topic 19, untested')).toHaveClass('mastery-untested')
  // touch and screen reader users get the lesson title too, not only "L19"
  expect(screen.getByRole('link', { name: 'L19 Topic 19, untested' })).toHaveAttribute('href', '/course/L19')
  expect(screen.getByRole('link', { name: 'L20 Topic 20, 51%' })).toHaveTextContent(/^L20/)
})
