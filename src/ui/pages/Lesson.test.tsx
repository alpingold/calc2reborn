import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { useLocation } from 'react-router'
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
// a question on the extra topic, so its page has something to practise
const extraTopicExam: Exam = {
  id: 's2019-e3',
  term: 'Spring',
  year: 2019,
  exam: '3',
  examUrl: '',
  durationMinutes: 60,
  questions: [{ ...question, id: 's2019-e3-q02', number: 2, lessonIds: ['X1'], typeIds: undefined }],
}
const lessons = [
  ...fixtureLessons().map((l) => (l.id === 'L19' ? { ...l, keyIdeas: 'Compare **terms**.', problemTypes: fixtureTypes('L19') } : l)),
  // no key ideas, cards, or questions
  fixtureLesson(100, { id: 'L-empty' }),
]
const content = buildContent(
  lessons,
  [fixtureCard('L19-c01', 'L19'), fixtureCard('L19-c02', 'L19'), fixtureCard('L19-c03', 'L19')],
  [seedExam, secondExam, finalExam, extraTopicExam],
  [fixtureGuided('L19-g1', 'L19', 'L19-a'), fixtureGuided('L19-g2', 'L19', 'L19-b')],
)

function Where() {
  const l = useLocation()
  return <p>{`at:${l.pathname}${l.search}${l.hash}`}</p>
}

const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
const openTab = (name: RegExp) => userEvent.click(tab(name))

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
        <Where />
      </StoreProvider>
    </MemoryRouter>,
  )
}

test('shows lesson details in the header and the key ideas first', async () => {
  const lesson = content.lessonById.get('L19')!
  await setup('/course/L19')
  expect(await screen.findByRole('heading', { level: 2, name: 'Topic 19' })).toBeInTheDocument()
  expect(screen.getByText('Lesson 19 · Sections 19.1')).toBeInTheDocument()
  const video = screen.getByRole('link', { name: "Dr. Chen's video" })
  expect(video).toHaveAttribute('href', lesson.videoUrl)
  expect(video).toHaveAttribute('target', '_blank')
  expect(screen.getByRole('link', { name: "Dr. Chen's notes" })).toHaveAttribute('href', lesson.notesUrl)
  expect(screen.getByText('terms').tagName).toBe('STRONG')
  // mastery is a chip in words
  expect(await screen.findByText('Not tested', { selector: '.chip' })).toBeInTheDocument()
  // where the lesson sits: the list it belongs to and its neighbours
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Lessons' })).toHaveAttribute('href', '/course')
  const neighbours = screen.getByRole('navigation', { name: 'Neighbouring lessons' })
  expect(within(neighbours).getByRole('link', { name: 'Lesson 18' })).toHaveAttribute('href', '/course/L18')
  expect(within(neighbours).getByRole('link', { name: 'Lesson 20' })).toHaveAttribute('href', '/course/L20')
})

test('the mastery chip names the level and the score once the lesson is tested', async () => {
  await setup('/course/L19', async (store) => {
    for (const [i, correct] of [false, true, true].entries()) {
      await store.logAttempt({ id: `a${i}`, questionId: 't-q3', chosen: 'A', correct, seconds: 5, timestamp: new Date(2026, 10, 1, 10, i).toISOString(), mode: 'practice' })
    }
  })
  expect(await screen.findByText('Weak · 51%')).toHaveClass('chip', 'chip-weak')
})

test('the first and last lessons link only to the neighbour they have', async () => {
  await setup('/course/L1')
  const neighbours = await screen.findByRole('navigation', { name: 'Neighbouring lessons' })
  expect(within(neighbours).getAllByRole('link').map((a) => a.textContent)).toEqual(['Lesson 2'])
})

test('four tabs in order, each saying what is in it, and only the open one is drawn', async () => {
  await setup('/course/L19')
  await screen.findByRole('heading', { level: 2 })
  const tabs = within(screen.getByRole('tablist', { name: 'Lesson steps' })).getAllByRole('tab')
  expect(tabs.map((t) => t.querySelector('.tab-label')!.textContent)).toEqual(['Key ideas', 'Guided problems', 'Flashcards', 'Exam questions'])
  expect(tab(/Key ideas/)).toHaveAttribute('aria-selected', 'true')
  expect(tab(/Guided problems/)).toHaveAttribute('aria-selected', 'false')
  expect(await screen.findByRole('tab', { name: /Guided problems 0 of 2 done/ })).toBeInTheDocument()
  expect(tab(/Flashcards/)).toHaveTextContent('3 cards, none started')
  expect(tab(/Exam questions/)).toHaveTextContent('3 questions in 2 types')
  const panel = screen.getByRole('tabpanel', { name: /Key ideas/ })
  expect(within(panel).getByRole('heading', { name: 'Key ideas' })).toBeInTheDocument()
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  expect(screen.queryByText('Stem of L19-g1')).not.toBeInTheDocument()
  expect(document.querySelector('.deck')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Fall 2025 Exam 1 #3' })).not.toBeInTheDocument()

  await openTab(/Exam questions/)
  expect(tab(/Exam questions/)).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('at:/course/L19?tab=exam')).toBeInTheDocument()
  expect(screen.getByRole('tabpanel', { name: /Exam questions/ })).toBeInTheDocument()
  expect(screen.queryByText('terms')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Practice this lesson' })).toHaveAttribute('href', '/practice?lesson=L19')
  expect(screen.getByRole('link', { name: 'Fall 2025 Exam 1 #3' })).toHaveAttribute('href', '/exams/f2025-e1')
  expect(screen.getByRole('link', { name: 'Fall 2025 Exam 2 #7' })).toHaveAttribute('href', '/exams/f2025-e2')
  expect(screen.getByRole('link', { name: 'Spring 2024 Final #5' })).toHaveAttribute('href', '/exams/s2024-final')
})

test('the arrow, Home and End keys move between tabs, and only the open tab is in the tab order', async () => {
  await setup('/course/L19')
  await screen.findByRole('heading', { level: 2 })
  expect(tab(/Key ideas/)).toHaveAttribute('tabindex', '0')
  expect(tab(/Flashcards/)).toHaveAttribute('tabindex', '-1')
  tab(/Key ideas/).focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(tab(/Guided problems/)).toHaveAttribute('aria-selected', 'true')
  expect(tab(/Guided problems/)).toHaveFocus()
  expect(screen.getByText('Stem of L19-g1')).toBeInTheDocument()
  await userEvent.keyboard('{End}')
  expect(tab(/Exam questions/)).toHaveFocus()
  expect(tab(/Exam questions/)).toHaveAttribute('aria-selected', 'true')
  await userEvent.keyboard('{ArrowRight}')
  expect(tab(/Key ideas/)).toHaveFocus()
  await userEvent.keyboard('{ArrowLeft}')
  expect(tab(/Exam questions/)).toHaveAttribute('aria-selected', 'true')
  await userEvent.keyboard('{Home}')
  expect(tab(/Key ideas/)).toHaveAttribute('aria-selected', 'true')
})

test.each([
  ['/course/L19?tab=cards', /Flashcards/],
  ['/course/L19?tab=guided', /Guided problems/],
  ['/course/L19#guided', /Guided problems/],
  ['/course/L19#flashcards', /Flashcards/],
  ['/course/L19#exam-questions', /Exam questions/],
  ['/course/L19#problem-types', /Exam questions/],
  ['/course/L19#key-ideas', /Key ideas/],
  ['/course/L19?tab=nonsense', /Key ideas/],
])('the address %s opens the right tab', async (path, name) => {
  await setup(path)
  await screen.findByRole('heading', { level: 2 })
  expect(tab(name)).toHaveAttribute('aria-selected', 'true')
})

test('a link to one guided problem opens the guided tab on that problem', async () => {
  await setup('/course/L19#guided-L19-g2')
  await screen.findByRole('heading', { level: 2 })
  expect(tab(/Guided problems/)).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { name: 'Problem 2 of 2' })).toBeInTheDocument()
  expect(screen.getByText('Stem of L19-g2')).toBeInTheDocument()
  expect(document.getElementById('guided-L19-g2')).not.toBeNull()
  // Previous still works from there
  await userEvent.click(screen.getByRole('button', { name: 'Previous problem' }))
  expect(screen.getByRole('heading', { name: 'Problem 1 of 2' })).toBeInTheDocument()
})

test('the flashcards tab shows the cards with their status', async () => {
  const cards = content.cardsByLesson.get('L19')!
  await setup('/course/L19?tab=cards', async (store) => {
    const scheduler = await createScheduler()
    const due = scheduler.newState(cards[0].id, new Date(2026, 10, 1))
    await store.saveCardState({ ...due, fsrs: { ...due.fsrs, dueAt: new Date(2026, 10, 6).toISOString() } })
    const later = scheduler.newState(cards[1].id, new Date(2026, 10, 1))
    await store.saveCardState({ ...later, fsrs: { ...later.fsrs, dueAt: new Date(2026, 10, 20).toISOString() } })
  })
  expect(await screen.findByText('3 flashcards: 1 due today, 1 scheduled later, 1 not started yet')).toBeInTheDocument()
  expect(tab(/Flashcards/)).toHaveTextContent('3 cards, 1 due')
  // the due and the new cards are what a study session would cover
  expect(screen.getByRole('link', { name: 'Study these cards (2)' })).toHaveAttribute('href', '/review?lesson=L19')
  // the deck shows one card at a time, front only until it is flipped
  const deck = document.querySelector('.deck') as HTMLElement
  expect(within(deck).getByText('Card 1 of 3')).toBeInTheDocument()
  expect(within(deck).getByText('Due today')).toBeInTheDocument()
  const card = within(deck).getByRole('button', { name: /Front of L19-c01/ })
  expect(card).toHaveAttribute('aria-expanded', 'false')
  expect(within(deck).queryByText('Back of L19-c01')).not.toBeInTheDocument()
  await userEvent.click(card)
  expect(card).toHaveAttribute('aria-expanded', 'true')
  expect(within(deck).getByText('Back of L19-c01')).toBeInTheDocument()
  // moving on shows the next card unflipped, with its own status; the deck wraps round
  await userEvent.click(within(deck).getByRole('button', { name: 'Next' }))
  expect(within(deck).getByText('Card 2 of 3')).toBeInTheDocument()
  expect(within(deck).getByText('Front of L19-c02')).toBeInTheDocument()
  expect(within(deck).queryByText('Back of L19-c02')).not.toBeInTheDocument()
  const later = new Date(2026, 10, 20).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  expect(within(deck).getByText(`Next review ${later}`)).toBeInTheDocument()
  await userEvent.click(within(deck).getByRole('button', { name: 'Next' }))
  expect(within(deck).getByText('Not started')).toBeInTheDocument()
  await userEvent.click(within(deck).getByRole('button', { name: 'Next' }))
  expect(within(deck).getByText('Card 1 of 3')).toBeInTheDocument()
  await userEvent.click(within(deck).getByRole('button', { name: 'Previous' }))
  expect(within(deck).getByText('Card 3 of 3')).toBeInTheDocument()
})

test('shows empty states and unknown lesson', async () => {
  await setup('/course/L-empty')
  expect(await screen.findByText('No key ideas yet.')).toBeInTheDocument()
  await openTab(/Flashcards/)
  expect(screen.getByText('No flashcards for this lesson yet.')).toBeInTheDocument()
  await openTab(/Exam questions/)
  expect(screen.getByText('No exam questions yet.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Practice this lesson' })).not.toBeInTheDocument()
})

test('unknown lesson id', async () => {
  await setup('/course/nope')
  expect(await screen.findByText('Lesson not found')).toBeInTheDocument()
})

test('an extra topic says it is outside the lessons, has no video, notes or flashcards, and offers practice', async () => {
  await setup('/course/X1?tab=exam')
  expect(await screen.findByRole('heading', { level: 2, name: '12.1 Parametric Equations' })).toBeInTheDocument()
  expect(screen.getByText(/not part of Dr\. Chen's Fall 2023 lessons/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /video/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /notes/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: /Flashcards/ })).not.toBeInTheDocument()
  // practice is offered with the topic's exam questions
  expect(screen.getByRole('link', { name: 'Practice this topic' })).toHaveAttribute('href', '/practice?lesson=X1')
  expect(screen.getByRole('link', { name: 'Spring 2019 Exam 3 #2' })).toHaveAttribute('href', '/exams/s2019-e3')
  expect(screen.queryByRole('navigation', { name: 'Neighbouring lessons' })).not.toBeInTheDocument()
  expect(document.querySelector('.chip')).toBeNull()
})

test('with nothing due, the summary leaves out due cards and there is no Review link', async () => {
  await setup('/course/L19?tab=cards')
  expect(await screen.findByText('3 flashcards: 3 not started yet')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Open Review' })).not.toBeInTheDocument()
})

test('the side column lists how exams ask the lesson, with the record and a practice link for each type that has questions', async () => {
  await setup('/course/L19', async (store) => {
    for (const [i, correct] of [true, false, true].entries()) {
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
  const section = (await screen.findByRole('heading', { name: 'How exams ask this lesson' })).parentElement as HTMLElement
  const items = within(section).getAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(items[0]).toHaveTextContent('L19 type A 3 questions')
  expect(await within(items[0]).findByText('2 of 3')).toBeInTheDocument()
  const link = within(items[0]).getByRole('link', { name: 'Practise L19 type A, 2 of 3 right' })
  expect(link).toHaveAttribute('href', '/practice?types=L19-a&n=10')
  expect(items[1]).toHaveTextContent('L19 type B 0 questions')
  expect(within(items[1]).getByText('Not tested')).toBeInTheDocument()
  expect(within(items[1]).queryByRole('link')).not.toBeInTheDocument()
  // it stays beside every tab
  await openTab(/Flashcards/)
  expect(screen.getByRole('heading', { name: 'How exams ask this lesson' })).toBeInTheDocument()
})

test('a lesson with no problem types has no such section', async () => {
  await setup('/course/L-empty')
  await screen.findByRole('heading', { level: 2 })
  expect(screen.queryByRole('heading', { name: 'How exams ask this lesson' })).not.toBeInTheDocument()
})

test('guided problems are worked one at a time, and are marked done and saved once finished', async () => {
  let saved: MemoryStore | undefined
  await setup('/course/L19?tab=guided', async (store) => {
    saved = store
    await store.saveGuidedResult({ problemId: 'L19-g2', completedAt: NOW.toISOString(), steps: 3, firstTryCorrect: 1 })
  })
  const panel = await screen.findByRole('tabpanel', { name: /Guided problems/ })
  expect(within(panel).getByText(/These are not Purdue problems/)).toBeInTheDocument()
  expect(within(panel).getByRole('heading', { name: 'Problem 1 of 2' })).toBeInTheDocument()
  expect(within(panel).getByText('L19 type A')).toBeInTheDocument()
  expect(within(panel).queryByText('Done')).not.toBeInTheDocument()
  // one problem at a time, at its first step
  expect(within(panel).getByText('Stem of L19-g1')).toBeInTheDocument()
  expect(within(panel).queryByText('Stem of L19-g2')).not.toBeInTheDocument()
  expect(within(panel).getByText('Step 1 of 3')).toBeInTheDocument()
  expect(await screen.findByRole('tab', { name: /Guided problems 1 of 2 done/ })).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: 'Previous problem' })).toBeDisabled()
  for (const n of [1, 2, 3]) await userEvent.click(within(panel).getByRole('button', { name: new RegExp(`Right ${n}`) }))
  expect(await within(panel).findByText('Done')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /Guided problems 2 of 2 done/ })).toBeInTheDocument()
  const results = await saved!.listGuidedResults()
  expect(results.find((r) => r.problemId === 'L19-g1')).toMatchObject({
    steps: 3,
    firstTryCorrect: 3,
    completedAt: NOW.toISOString(),
  })
  await userEvent.click(within(panel).getByRole('button', { name: 'Next problem' }))
  expect(within(panel).getByRole('heading', { name: 'Problem 2 of 2' })).toBeInTheDocument()
  expect(within(panel).getByText('Stem of L19-g2')).toBeInTheDocument()
  expect(within(panel).getByText('Done')).toBeInTheDocument()
  expect(within(panel).getByRole('button', { name: 'Next problem' })).toBeDisabled()
})

test('a guided problem half worked is still half worked after a look at another tab or problem', async () => {
  await setup('/course/L19?tab=guided')
  await screen.findByText('Stem of L19-g1')
  await userEvent.click(screen.getByRole('button', { name: /Wrong 1/ }))
  await userEvent.click(screen.getByRole('button', { name: /Right 1/ }))
  expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
  await openTab(/Key ideas/)
  expect(screen.queryByText('Stem of L19-g1')).not.toBeInTheDocument()
  await openTab(/Guided problems/)
  expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
  expect(screen.getByText('L19-g1 prompt 2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Next problem' }))
  expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Previous problem' }))
  expect(screen.getByText('L19-g1 prompt 2')).toBeInTheDocument()
})

test('a lesson with no guided problems has no such tab', async () => {
  await setup('/course/L-empty')
  await screen.findByRole('heading', { level: 2 })
  expect(screen.queryByRole('tab', { name: /Guided problems/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(3)
})

test('an address asking for a tab the lesson does not have opens the key ideas', async () => {
  await setup('/course/L-empty#guided')
  await screen.findByRole('heading', { level: 2 })
  expect(tab(/Key ideas/)).toHaveAttribute('aria-selected', 'true')
})
