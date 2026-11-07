import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Review } from './Review'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { buildContent, loadContent } from '../../content'
import { createScheduler } from '../../engine/fsrs'
import type { ConceptCard } from '../../content/schema'

const lessons = loadContent().lessons
const cards: ConceptCard[] = [
  { id: 'L19-c01', lessonId: 'L19', front: 'Front one', back: 'Back one' },
  { id: 'L19-c02', lessonId: 'L19', front: 'Front two', back: 'Back two' },
]

async function setup(opts: { cards?: ConceptCard[]; clock?: { t: Date } } = {}) {
  const store = new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentLessonId: 'L19', dailyNewCards: 10 })
  const scheduler = await createScheduler()
  const clock = opts.clock ?? { t: new Date('2026-11-06T12:00:00Z') }
  const content = buildContent(lessons, opts.cards ?? cards, [])
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
