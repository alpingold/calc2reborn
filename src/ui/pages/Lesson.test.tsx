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
// a final and a second midterm with questions on L19, so each link must name which exam it is
const finalExam: Exam = {
  id: 's2024-final',
  term: 'Spring',
  year: 2024,
  exam: 'final',
  examUrl: '',
  durationMinutes: 120,
  questions: [{ ...question, id: 's2024-final-q05', number: 5 }],
}
const secondExam: Exam = {
  id: 'f2025-e2',
  term: 'Fall',
  year: 2025,
  exam: '2',
  examUrl: '',
  durationMinutes: 60,
  questions: [{ ...question, id: 'f2025-e2-q07', number: 7 }],
}
const lessons = [
  ...fixtureLessons().map((l) => (l.id === 'L19' ? { ...l, keyIdeas: 'Compare **terms**.' } : l)),
  // no key ideas, cards, or questions
  fixtureLesson(100, { id: 'L-empty' }),
]
const content = buildContent(
  lessons,
  [fixtureCard('L19-c01', 'L19'), fixtureCard('L19-c02', 'L19'), fixtureCard('L19-c03', 'L19')],
  [seedExam, secondExam, finalExam],
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

  expect(screen.getByRole('link', { name: 'Fall 2025 Exam 1 #3' })).toHaveAttribute('href', '/exams/f2025-e1')
  expect(screen.getByRole('link', { name: 'Fall 2025 Exam 2 #7' })).toHaveAttribute('href', '/exams/f2025-e2')
  expect(screen.getByRole('link', { name: 'Spring 2024 Final #5' })).toHaveAttribute('href', '/exams/s2024-final')
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

test('an extra topic says it is outside the lessons, has no video or notes, and offers practice', async () => {
  await setup('/course/X1')
  expect(await screen.findByRole('heading', { level: 2, name: '12.1 Parametric Equations' })).toBeInTheDocument()
  expect(screen.getByText(/not part of Dr\. Chen's Fall 2023 lessons/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Video' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Notes' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Practice this topic' })).toHaveAttribute('href', '/practice?lesson=X1')
  expect(screen.queryByRole('heading', { name: 'Cards' })).not.toBeInTheDocument()
})
