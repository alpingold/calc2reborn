import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Lesson } from './Lesson'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { buildContent } from '../../content'
import { fixtureCard, fixtureGuided, fixtureLesson, fixtureLessons, fixtureTypes } from '../../test/fixtures'
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
  typeIds: ['L19-a'],
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
  ...fixtureLessons().map((l) => (l.id === 'L19' ? { ...l, keyIdeas: 'Compare **terms**.', problemTypes: fixtureTypes('L19') } : l)),
  // no key ideas, cards, or questions
  fixtureLesson(100, { id: 'L-empty' }),
]
const content = buildContent(
  lessons,
  [fixtureCard('L19-c01', 'L19'), fixtureCard('L19-c02', 'L19'), fixtureCard('L19-c03', 'L19')],
  [seedExam, secondExam, finalExam],
  [fixtureGuided('L19-g1', 'L19', 'L19-a'), fixtureGuided('L19-g2', 'L19', 'L19-b')],
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

  expect(await screen.findByText('3 flashcards: 1 due today, 1 scheduled later, 1 not started yet')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Open Review' })).toHaveAttribute('href', '/review')
  // the list starts collapsed
  const toggle = screen.getByRole('button', { name: 'Show the cards' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Front of L19-c01')).not.toBeInTheDocument()
  await userEvent.click(toggle)
  expect(screen.getByRole('button', { name: 'Hide the cards' })).toHaveAttribute('aria-expanded', 'true')
  const list = screen.getByRole('list', { name: 'Flashcards' })
  const items = within(list).getAllByRole('listitem')
  expect(items).toHaveLength(cards.length)
  expect(within(items[0]).getByText('Due today')).toBeInTheDocument()
  const later = new Date(2026, 10, 20).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  expect(within(items[1]).getByText(`Next review ${later}`)).toBeInTheDocument()
  expect(within(items[2]).getByText('Not started')).toBeInTheDocument()
  // a card flips to show its answer, and flips back
  const card = within(items[0]).getByRole('button', { name: /Front of L19-c01/ })
  expect(card).toHaveAttribute('aria-expanded', 'false')
  expect(within(items[0]).queryByText('Back of L19-c01')).not.toBeInTheDocument()
  await userEvent.click(card)
  expect(card).toHaveAttribute('aria-expanded', 'true')
  expect(within(items[0]).getByText('Back of L19-c01')).toBeInTheDocument()
  await userEvent.click(card)
  expect(within(items[0]).queryByText('Back of L19-c01')).not.toBeInTheDocument()

  expect(screen.getByRole('link', { name: 'Fall 2025 Exam 1 #3' })).toHaveAttribute('href', '/exams/f2025-e1')
  expect(screen.getByRole('link', { name: 'Fall 2025 Exam 2 #7' })).toHaveAttribute('href', '/exams/f2025-e2')
  expect(screen.getByRole('link', { name: 'Spring 2024 Final #5' })).toHaveAttribute('href', '/exams/s2024-final')
})

test('shows empty states and unknown lesson', async () => {
  await setup('/course/L-empty')
  expect(await screen.findByText('No key ideas yet.')).toBeInTheDocument()
  expect(screen.getByText('No flashcards for this lesson yet.')).toBeInTheDocument()
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

test('with nothing due, the summary leaves out due cards and there is no Review link', async () => {
  await setup('/course/L19')
  expect(await screen.findByText('3 flashcards: 3 not started yet')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Open Review' })).not.toBeInTheDocument()
})

test('lists the lesson\'s problem types with a practice link for each that has questions', async () => {
  await setup('/course/L19', async (store) => {
    for (const [i, correct] of [true, true, true].entries()) {
      await store.logAttempt({
        id: `a${i}`,
        questionId: 't-q3',
        chosen: 'A',
        correct,
        seconds: 5,
        timestamp: new Date(2026, 10, 1, 10, i).toISOString(),
        mode: 'practice',
      })
    }
  })
  const section = (await screen.findByRole('heading', { name: 'Problem types' })).parentElement as HTMLElement
  const items = within(section).getAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(await within(items[0]).findByText('3 questions, 100%')).toBeInTheDocument()
  expect(within(items[0]).getByRole('link', { name: 'Practise this type: L19 type A' })).toHaveAttribute(
    'href',
    '/practice?types=L19-a&n=10',
  )
  expect(within(items[1]).getByText('0 questions, untested')).toBeInTheDocument()
  expect(within(items[1]).queryByRole('link')).not.toBeInTheDocument()
})

test('a lesson with no problem types has no such section', async () => {
  await setup('/course/L-empty')
  await screen.findByRole('heading', { level: 2 })
  expect(screen.queryByRole('heading', { name: 'Problem types' })).not.toBeInTheDocument()
})

test('guided problems are shown ready to work, and are marked done and saved once finished', async () => {
  let saved: MemoryStore | undefined
  await setup('/course/L19', async (store) => {
    saved = store
    await store.saveGuidedResult({ problemId: 'L19-g2', completedAt: NOW.toISOString(), steps: 3, firstTryCorrect: 1 })
  })
  const section = (await screen.findByRole('heading', { name: 'Check your understanding' })).parentElement as HTMLElement
  expect(within(section).getByText(/These are not Purdue problems/)).toBeInTheDocument()
  const items = [...section.querySelectorAll<HTMLElement>('.guided-card')]
  expect(items).toHaveLength(2)
  expect(within(items[0]).getByRole('heading', { name: 'Problem 1' })).toBeInTheDocument()
  expect(within(items[0]).getByText('L19 type A')).toBeInTheDocument()
  expect(within(items[0]).queryByText('Done')).not.toBeInTheDocument()
  expect(await within(items[1]).findByText('Done')).toBeInTheDocument()
  // both problems are open from the start, each at its first step
  expect(within(items[0]).getByText('Stem of L19-g1')).toBeInTheDocument()
  expect(within(items[1]).getByText('Stem of L19-g2')).toBeInTheDocument()
  expect(within(items[0]).getByText('Step 1 of 3')).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: 'Guided problems: 1 of 2 done' })).toHaveAttribute('href', '/course/L19#guided')
  for (const n of [1, 2, 3]) await userEvent.click(within(items[0]).getByRole('button', { name: new RegExp(`Right ${n}`) }))
  expect(await within(items[0]).findByText('Done')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Guided problems: 2 of 2 done' })).toBeInTheDocument()
  const results = await saved!.listGuidedResults()
  expect(results.find((r) => r.problemId === 'L19-g1')).toMatchObject({
    steps: 3,
    firstTryCorrect: 3,
    completedAt: NOW.toISOString(),
  })
})

test('the page lists its sections as links', async () => {
  await setup('/course/L19')
  const nav = await screen.findByRole('navigation', { name: 'On this page' })
  expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
    'Key ideas',
    'Check your understanding',
    'Flashcards',
    'Problem types',
    'Exam questions',
  ])
  expect(within(nav).getByRole('link', { name: 'Flashcards' })).toHaveAttribute('href', '/course/L19#flashcards')
})

test('a lesson with no guided problems has no such section', async () => {
  await setup('/course/L-empty')
  await screen.findByRole('heading', { level: 2 })
  expect(screen.queryByRole('heading', { name: 'Check your understanding' })).not.toBeInTheDocument()
})
