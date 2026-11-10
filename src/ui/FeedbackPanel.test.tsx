import { expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { FeedbackPanel } from './FeedbackPanel'
import type { FeedbackPanelProps } from './FeedbackPanel'
import { StoreProvider } from '../storage/context'
import { MemoryStore } from '../storage/memory'
import { buildContent } from '../content'
import type { Choice, Exam, Question } from '../content/schema'
import { fixtureCard, fixtureGuided, fixtureLesson, fixtureTypes } from '../test/fixtures'
import type { Scheduler } from '../engine/fsrs'

const choices: Choice[] = [
  { label: 'A', text: 'alpha' },
  { label: 'B', text: 'beta' },
]
function q(id: string, extra: Partial<Question> = {}): Question {
  return { id, number: 1, points: 8, stem: id, choices, answer: 'A', lessonIds: ['L1'], status: 'reviewed', ...extra }
}
const typed = q('e-q1', { typeIds: ['L1-a'], solution: 'Worked **solution**.' })
const sibling = q('e-q2', { typeIds: ['L1-a'] })
const lonely = q('e-q3', { typeIds: ['L1-b'], solution: 'Only one of its type.' })
const plain = q('e-q4', { solution: 'No type yet.' })
const official: Exam = {
  id: 'e',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: 'https://exam.test/e.pdf',
  answersUrl: 'https://exam.test/ans.pdf',
  solutionsUrl: 'https://exam.test/sol.pdf',
  durationMinutes: 60,
  questions: [typed, sibling, lonely, plain],
}
const keyOnly: Exam = { ...official, id: 'k', solutionsUrl: undefined, questions: [q('k-q1')] }
const noLinks: Exam = { ...official, id: 'n', answersUrl: undefined, solutionsUrl: undefined, questions: [q('n-q1')] }
const written: Exam = { id: 'xp', title: 'Extra', unofficial: true, durationMinutes: 60, questions: [q('xp-q1', { answerSource: 'written' })] }
const cards = [
  { ...fixtureCard('c1', 'L1'), typeIds: ['L1-a'] },
  { ...fixtureCard('c2', 'L1'), typeIds: ['L1-a', 'L1-b'] },
  fixtureCard('c3', 'L1'),
]
const content = buildContent(
  [fixtureLesson(1, { problemTypes: fixtureTypes('L1') })],
  cards,
  [official, keyOnly, noLinks, written],
  [fixtureGuided('L1-g1', 'L1', 'L1-a')],
)

async function show(props: FeedbackPanelProps) {
  render(
    <MemoryRouter>
      <StoreProvider store={new MemoryStore()} scheduler={{} as Scheduler} content={content}>
        <FeedbackPanel {...props} />
      </StoreProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('status')
}

test('a wrong answer shows the verdict, solution, sources, type, flashcards and a similar question, in that order', async () => {
  await show({ question: typed, chosen: 'B', lessonTitle: 'Lesson 1: Topic 1', lessonHref: '/course/L1', onSimilar: () => {} })
  expect(screen.getByRole('status')).toHaveTextContent('Not quite')
  const order = [
    screen.getByRole('status'),
    screen.getByText('solution'),
    screen.getByRole('link', { name: 'Answer key (PDF)' }),
    screen.getByText('Problem type: L1 type A'),
    screen.getByRole('link', { name: 'Lesson 1: Topic 1' }),
    screen.getByText('Related flashcards (2)'),
    screen.getByRole('button', { name: 'Try a similar question' }),
    screen.getByRole('button', { name: 'Report a problem' }),
  ]
  for (let i = 1; i < order.length; i++) {
    expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `item ${i}`).toBeTruthy()
  }
})

test('the official PDFs open in a new tab', async () => {
  await show({ question: typed, chosen: 'A' })
  const key = screen.getByRole('link', { name: 'Answer key (PDF)' })
  expect(key).toHaveAttribute('href', 'https://exam.test/ans.pdf')
  expect(key).toHaveAttribute('target', '_blank')
  expect(screen.getByRole('link', { name: 'Official solutions (PDF)' })).toHaveAttribute('href', 'https://exam.test/sol.pdf')
})

test('an exam with only an answer key links just that, and one with neither links nothing', async () => {
  await show({ question: keyOnly.questions[0], chosen: 'A' })
  expect(screen.getByRole('link', { name: 'Answer key (PDF)' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Official solutions (PDF)' })).not.toBeInTheDocument()
})

test('an exam with no key or solutions, and one written for the app, link no PDFs', async () => {
  await show({ question: noLinks.questions[0], chosen: 'A' })
  expect(screen.queryByRole('link', { name: /PDF/ })).not.toBeInTheDocument()
})

test('a question written for the app keeps its notice and links no PDFs', async () => {
  await show({ question: written.questions[0], chosen: 'A' })
  expect(screen.getByText(/written for this app/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /PDF/ })).not.toBeInTheDocument()
})

test('a right answer shows the solution and type but no flashcards', async () => {
  await show({ question: typed, chosen: 'A', onSimilar: () => {} })
  expect(screen.getByRole('status')).toHaveTextContent('Correct')
  expect(screen.getByText('Problem type: L1 type A')).toBeInTheDocument()
  expect(screen.queryByText(/Related flashcards/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try a similar question' })).toBeInTheDocument()
})

test('an unanswered question counts as missed', async () => {
  await show({ question: typed })
  expect(screen.getByRole('status')).toHaveTextContent('Not quite')
  expect(screen.getByText('Related flashcards (2)')).toBeInTheDocument()
})

test('the flashcards for the missed type can be read in place, front and back', async () => {
  await show({ question: typed, chosen: 'B' })
  const list = screen.getByText('Related flashcards (2)').closest('details')!
  expect(within(list).getByText('Front of c1')).toBeInTheDocument()
  expect(within(list).getByText('Back of c2')).toBeInTheDocument()
  expect(within(list).queryByText('Front of c3')).not.toBeInTheDocument()
})

test('Try a similar question is a button that calls back in Practice, and a link from results', async () => {
  const onSimilar = vi.fn()
  await show({ question: typed, chosen: 'B', onSimilar })
  await userEvent.click(screen.getByRole('button', { name: 'Try a similar question' }))
  expect(onSimilar).toHaveBeenCalledTimes(1)
})

test('from results it is a link to Practice on the type', async () => {
  await show({ question: typed, chosen: 'B', similarHref: '/practice?types=L1-a&n=10' })
  expect(screen.getByRole('link', { name: 'Try a similar question' })).toHaveAttribute('href', '/practice?types=L1-a&n=10')
  expect(screen.queryByRole('button', { name: 'Try a similar question' })).not.toBeInTheDocument()
})

test('during an exam, with neither given, there is no similar question', async () => {
  await show({ question: typed, chosen: 'B' })
  expect(screen.queryByText('Try a similar question')).not.toBeInTheDocument()
})

test('a type with no other question offers no similar question', async () => {
  await show({ question: lonely, chosen: 'B', onSimilar: () => {}, similarHref: '/practice?types=L1-b' })
  expect(screen.getByText('Problem type: L1 type B')).toBeInTheDocument()
  expect(screen.queryByText('Try a similar question')).not.toBeInTheDocument()
  expect(screen.getByText('Related flashcards (1)')).toBeInTheDocument()
})

test('a question with no problem type shows the solution and nothing that depends on a type', async () => {
  await show({ question: plain, chosen: 'B', onSimilar: () => {}, similarHref: '/x' })
  expect(screen.getByText('No type yet.')).toBeInTheDocument()
  expect(screen.queryByText(/Problem type/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Related flashcards/)).not.toBeInTheDocument()
  expect(screen.queryByText('Try a similar question')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Report a problem' })).toBeInTheDocument()
})

test('a type id that the lessons no longer define is ignored', async () => {
  await show({ question: { ...plain, typeIds: ['L1-gone'] }, chosen: 'B', onSimilar: () => {} })
  expect(screen.queryByText(/Problem type/)).not.toBeInTheDocument()
  expect(screen.queryByText('Try a similar question')).not.toBeInTheDocument()
})

test('a question with two types names both', async () => {
  await show({ question: { ...typed, typeIds: ['L1-a', 'L1-b'] }, chosen: 'A' })
  expect(screen.getByText('Problem types: L1 type A; L1 type B')).toBeInTheDocument()
})

test('after a miss, links to a guided problem of the same type when there is one', async () => {
  await show({ question: typed, chosen: 'B' })
  expect(screen.getByRole('link', { name: 'Walk through a guided problem of this type' })).toHaveAttribute(
    'href',
    '/course/L1#guided-L1-g1',
  )
})

test('no guided link after a correct answer, or for a type with no guided problem', async () => {
  await show({ question: typed, chosen: 'A' })
  expect(screen.queryByRole('link', { name: /guided problem/ })).not.toBeInTheDocument()
})

test('no guided link for a type that has no guided problem', async () => {
  await show({ question: lonely, chosen: 'B' })
  expect(screen.queryByRole('link', { name: /guided problem/ })).not.toBeInTheDocument()
})
