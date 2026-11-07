import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Lesson } from './Lesson'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { buildContent } from '../../content'
import { fixtureCard, fixtureLesson, fixtureLessons } from '../../test/fixtures'
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
const question: Question = {
  id: 't-q3',
  number: 3,
  points: 6,
  stem: 's',
  choices,
  answer: 'A',
  lessonIds: ['L19'],
  status: 'reviewed',
}
const seedExam: Exam = {
  id: 'f2025-e1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: [question],
}
const lessons = [
  ...fixtureLessons().map((l) => (l.id === 'L19' ? { ...l, keyIdeas: 'Compare **terms**.' } : l)),
  // no key ideas, cards, or questions
  fixtureLesson(100, { id: 'L-empty' }),
]
const content = buildContent(
  lessons,
  [fixtureCard('L19-c01', 'L19'), fixtureCard('L19-c02', 'L19'), fixtureCard('L19-c03', 'L19')],
  [seedExam],
)

async function setup(path: string, seed?: (s: MemoryStore) => Promise<void>) {
  const store = new MemoryStore()
  await seed?.(store)
  const scheduler = await createScheduler()
  render(
    <MemoryRouter initialEntries={[path]}>
      <StoreProvider store={store} scheduler={scheduler} content={content} now={() => NOW}>
        <Routes>
          <Route path="/course/:lessonId" element={<Lesson />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

test('shows lesson details, cards with status, and exam questions', async () => {
  const cards = content.cardsByLesson.get('L19')!
  const lesson = content.lessonById.get('L19')!
  await setup('/course/L19', async (store) => {
    const scheduler = await createScheduler()
    const due = scheduler.newState(cards[0].id, new Date(2026, 10, 1))
    await store.saveCardState({ ...due, fsrs: { ...due.fsrs, dueAt: new Date(2026, 10, 6).toISOString() } })
    const later = scheduler.newState(cards[1].id, new Date(2026, 10, 1))
    await store.saveCardState({ ...later, fsrs: { ...later.fsrs, dueAt: new Date(2026, 10, 20).toISOString() } })
  })
  expect(await screen.findByRole('heading', { level: 2, name: 'Topic 19' })).toBeInTheDocument()
  expect(screen.getByText('Sections 19.1')).toBeInTheDocument()
  const video = screen.getByRole('link', { name: 'Video' })
  expect(video).toHaveAttribute('href', lesson.videoUrl)
  expect(video).toHaveAttribute('target', '_blank')
  expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute('href', lesson.notesUrl)
  expect(screen.getByText('terms').tagName).toBe('STRONG')
  expect(screen.getByRole('link', { name: 'Practice this lesson' })).toHaveAttribute('href', '/practice?lesson=L19')
  expect(await screen.findByText('Untested')).toBeInTheDocument()

  const cardList = screen.getByRole('heading', { name: 'Cards' }).nextElementSibling as HTMLElement
  const items = await within(cardList).findAllByRole('listitem')
  expect(items).toHaveLength(cards.length)
  expect(within(items[0]).getByText('Due')).toBeInTheDocument()
  expect(within(items[1]).getByText(new Date(2026, 10, 20).toLocaleDateString())).toBeInTheDocument()
  expect(within(items[2]).getByText('New')).toBeInTheDocument()

  expect(screen.getByRole('link', { name: 'Exam Fall 2025 #3' })).toHaveAttribute('href', '/exams/f2025-e1')
})

test('shows empty states and unknown lesson', async () => {
  await setup('/course/L-empty')
  expect(await screen.findByText('No key ideas yet.')).toBeInTheDocument()
  expect(screen.getByText('No exam questions yet.')).toBeInTheDocument()
})

test('unknown lesson id', async () => {
  await setup('/course/nope')
  expect(await screen.findByText('Lesson not found')).toBeInTheDocument()
})
