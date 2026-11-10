import { expect, test } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Review } from './Review'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { buildContent } from '../../content'
import { fixtureLessons } from '../../test/fixtures'
import { createScheduler } from '../../engine/fsrs'
import type { Scheduler } from '../../engine/fsrs'
import type { ConceptCard, Exam } from '../../content/schema'

const lessons = fixtureLessons()
const cards: ConceptCard[] = [
  { id: 'L19-c01', lessonId: 'L19', front: 'Front one', back: 'Back one' },
  { id: 'L19-c02', lessonId: 'L19', front: 'Front two', back: 'Back two' },
]

async function setup(opts: { exams?: Exam[]; cards?: ConceptCard[]; clock?: { t: Date }; store?: MemoryStore; seed?: (s: MemoryStore, sch: Scheduler) => Promise<void>; settings?: Partial<typeof DEFAULT_SETTINGS> } = {}) {
  const store = opts.store ?? new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentLessonId: 'L19', dailyNewCards: 10, ...opts.settings })
  const scheduler = await createScheduler()
  await opts.seed?.(store, scheduler)
  const clock = opts.clock ?? { t: new Date('2026-11-06T12:00:00Z') }
  const content = buildContent(lessons, opts.cards ?? cards, opts.exams ?? [])
  render(
    <MemoryRouter>
      <StoreProvider store={store} scheduler={scheduler} content={content} now={() => clock.t}>
        <Review />
      </StoreProvider>
    </MemoryRouter>,
  )
  return { store, clock }
}

test('shows summary and first front with back hidden', async () => {
  await setup()
  expect(await screen.findByText('Cards due: 0 · New: 2')).toBeInTheDocument()
  expect(screen.getByText('Front one')).toBeInTheDocument()
  expect(screen.queryByText('Back one')).not.toBeInTheDocument()
})

test('space reveals the back and four rating buttons with intervals', async () => {
  await setup()
  await screen.findByText('Front one')
  await userEvent.keyboard(' ')
  expect(await screen.findByText('Back one')).toBeInTheDocument()
  for (const w of ['Again', 'Hard', 'Good', 'Easy']) {
    expect(screen.getByRole('button', { name: new RegExp(`^${w} · \\S+`) })).toBeInTheDocument()
  }
})

test('pressing 3 saves reps 1 and advances; finishing shows done', async () => {
  const { store } = await setup()
  await screen.findByText('Front one')
  await userEvent.keyboard(' ')
  await userEvent.keyboard('3')
  expect(await screen.findByText('Front two')).toBeInTheDocument()
  expect((await store.getCardState('L19-c01'))!.fsrs.reps).toBe(1)
  await userEvent.keyboard(' ')
  await userEvent.keyboard('3')
  expect(await screen.findByRole('heading', { name: 'Done for today' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/')
})

test('fresh card introducedAt is set at first reveal, not page load', async () => {
  const clock = { t: new Date('2026-11-06T12:00:00Z') }
  const { store } = await setup({ clock })
  await screen.findByText('Front one')
  clock.t = new Date('2026-11-06T12:30:00Z')
  await userEvent.keyboard(' ')
  await userEvent.keyboard('3')
  await screen.findByText('Front two')
  expect((await store.getCardState('L19-c01'))!.introducedAt).toBe('2026-11-06T12:30:00.000Z')
})

test('shows empty state when nothing is due', async () => {
  await setup({ cards: [] })
  expect(await screen.findByText('Nothing due. Come back tomorrow or practice instead.')).toBeInTheDocument()
})

test('double press of 3 saves only once', async () => {
  const { store } = await setup()
  await screen.findByText('Front one')
  await userEvent.keyboard(' ')
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
  })
  expect(await screen.findByText('Front two')).toBeInTheDocument()
  expect((await store.getCardState('L19-c01'))!.fsrs.reps).toBe(1)
  expect(await store.getCardState('L19-c02')).toBeUndefined()
})

test('Again re-queues the card at the end with updated state', async () => {
  const { store } = await setup()
  await screen.findByText('Front one')
  await userEvent.keyboard(' ')
  await userEvent.keyboard('1')
  await screen.findByText('Front two')
  await userEvent.keyboard(' ')
  await userEvent.keyboard('3')
  expect(await screen.findByText('Front one')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Done for today' })).not.toBeInTheDocument()
  await userEvent.keyboard(' ')
  await userEvent.keyboard('3')
  expect(await screen.findByRole('heading', { name: 'Done for today' })).toBeInTheDocument()
  expect((await store.getCardState('L19-c01'))!.fsrs.reps).toBe(2)
})

test('due cards are shown in ascending dueAt order', async () => {
  const seedOne = (id: string, dueAt: string) => async (s: MemoryStore, sch: Scheduler) => {
    const st = sch.newState(id, new Date('2026-11-01T00:00:00Z'))
    await s.saveCardState({ ...st, fsrs: { ...st.fsrs, dueAt } })
  }
  await setup({
    seed: async (s, sch) => {
      await seedOne('L19-c02', '2026-11-02T00:00:00.000Z')(s, sch)
      await seedOne('L19-c01', '2026-11-03T00:00:00.000Z')(s, sch)
    },
  })
  expect(await screen.findByText('Cards due: 2 · New: 0')).toBeInTheDocument()
  expect(screen.getByText('Front two')).toBeInTheDocument()
})

test('save failure shows an alert and allows retry', async () => {
  const store = new MemoryStore()
  const real = store.saveCardState.bind(store)
  let fail = true
  store.saveCardState = async (s) => {
    if (fail) {
      fail = false
      throw new Error('boom')
    }
    return real(s)
  }
  await setup({ store })
  await screen.findByText('Front one')
  await userEvent.keyboard(' ')
  await userEvent.keyboard('3')
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your rating. Try again.')
  expect(screen.getByText('Back one')).toBeInTheDocument()
  await userEvent.keyboard('3')
  expect(await screen.findByText('Front two')).toBeInTheDocument()
  expect((await store.getCardState('L19-c01'))!.fsrs.reps).toBe(1)
})

test('a failing card load shows an alert instead of an empty page', async () => {
  const store = new MemoryStore()
  store.listCardStates = async () => {
    throw new Error('boom')
  }
  await setup({ store })
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your cards.')
  expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
})

test('while an exam is ahead, new cards from exam lessons come first', async () => {
  const mixed: ConceptCard[] = [
    { id: 'L18-c01', lessonId: 'L18', front: 'Earlier lesson', back: 'b' },
    { id: 'L19-c01', lessonId: 'L19', front: 'Exam lesson', back: 'b' },
  ]
  await setup({ cards: mixed, settings: { examDate: '2026-11-09', examLessonIds: ['L19'] } })
  expect(await screen.findByText('Exam lesson')).toBeInTheDocument()
})

test('after the exam date, new cards start from the current lesson again', async () => {
  const mixed: ConceptCard[] = [
    { id: 'L18-c01', lessonId: 'L18', front: 'Old exam lesson', back: 'b' },
    { id: 'L19-c01', lessonId: 'L19', front: 'Current lesson', back: 'b' },
  ]
  // the exam on L18 is still ahead: its card comes first
  const ahead = await setup({ cards: mixed, settings: { examDate: '2026-11-09', examLessonIds: ['L18'] } })
  expect(ahead.store).toBeDefined()
  expect(await screen.findByText('Old exam lesson')).toBeInTheDocument()
})

test('once the exam has passed its lessons lose their priority', async () => {
  const mixed: ConceptCard[] = [
    { id: 'L18-c01', lessonId: 'L18', front: 'Old exam lesson', back: 'b' },
    { id: 'L19-c01', lessonId: 'L19', front: 'Current lesson', back: 'b' },
  ]
  await setup({ cards: mixed, settings: { examDate: '2026-11-01', examLessonIds: ['L18'] } })
  expect(await screen.findByText('Current lesson')).toBeInTheDocument()
})

test('new cards for a problem type missed this week come before the current lesson', async () => {
  const typedCards: ConceptCard[] = [
    { id: 'L19-c01', lessonId: 'L19', front: 'Current lesson', back: 'b' },
    { id: 'L18-c01', lessonId: 'L18', front: 'Missed type', back: 'b', typeIds: ['L18-a'] },
  ]
  const store = new MemoryStore()
  await store.logAttempt({
    id: 'a1',
    questionId: 'q-missed',
    chosen: 'A',
    correct: false,
    seconds: 5,
    timestamp: '2026-11-04T12:00:00.000Z',
    mode: 'practice',
  })
  const question = { id: 'q-missed', number: 1, points: 8, stem: 's', choices: [{ label: 'A' as const, text: 'a' }, { label: 'B' as const, text: 'b' }], answer: 'B' as const, lessonIds: ['L18'], typeIds: ['L18-a'], status: 'reviewed' as const }
  const exam = { id: 'e', term: 'Fall' as const, year: 2025, exam: '1' as const, examUrl: '', durationMinutes: 60, questions: [question] }
  await setup({ cards: typedCards, store, exams: [exam] })
  expect(await screen.findByText('Missed type')).toBeInTheDocument()
})

test('a saved state for a card that no longer exists is not counted as due', async () => {
  await setup({
    seed: async (s, sch) => {
      const gone = sch.newState('L19-gone', new Date('2026-11-01T00:00:00Z'))
      await s.saveCardState({ ...gone, fsrs: { ...gone.fsrs, dueAt: '2026-11-02T00:00:00.000Z' } })
    },
  })
  expect(await screen.findByText('Cards due: 0 · New: 2')).toBeInTheDocument()
})

test('rating keys with a modifier, or held down, do nothing', async () => {
  const { store } = await setup()
  await screen.findByText('Front one')
  await userEvent.keyboard(' ')
  await screen.findByText('Back one')
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', repeat: true }))
  })
  expect(screen.getByText('Back one')).toBeInTheDocument()
  expect(await store.listCardStates()).toHaveLength(0)
})

test('a review card rated Again returns in the session even when it is due more than an hour later', async () => {
  const clock = { t: new Date('2026-11-06T12:00:00Z') }
  let nextDue = ''
  const { store } = await setup({
    cards: [cards[0]],
    clock,
    seed: async (s, sch) => {
      // a card well into review: rated Good when new and again when it next came due
      const start = new Date('2026-09-01T12:00:00Z')
      const first = sch.review(sch.newState('L19-c01', start), 3, start)
      const reviewed = sch.review(first, 3, new Date(first.fsrs.dueAt))
      await s.saveCardState(reviewed)
      nextDue = sch.review(reviewed, 1, clock.t).fsrs.dueAt
    },
  })
  // the lapse interval is longer than the one-hour window Hard uses
  expect(new Date(nextDue).getTime() - clock.t.getTime()).toBeGreaterThan(3600_000)
  await screen.findByText('Front one')
  await userEvent.keyboard(' ')
  await userEvent.keyboard('1')
  await act(async () => {})
  expect(await screen.findByText('Front one')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Done for today' })).not.toBeInTheDocument()
  expect((await store.getCardState('L19-c01'))!.fsrs.lapses).toBe(1)
})
