import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QuestionView } from './QuestionView'
import type { QuestionViewProps } from './QuestionView'
import { StoreProvider } from '../storage/context'
import { MemoryStore } from '../storage/memory'
import { buildContent, loadContent } from '../content'
import type { Question } from '../content/schema'

const question: Question = {
  id: 'q-test-1',
  number: 7,
  points: 6,
  stem: 'Which series **converges**?',
  choices: [
    { label: 'A', text: 'alpha' },
    { label: 'B', text: 'beta' },
    { label: 'C', text: 'gamma' },
    { label: 'D', text: 'delta' },
    { label: 'E', text: 'epsilon' },
  ],
  answer: 'C',
  figures: ['figures/q7a.png', 'figures/q7b.png'],
  lessonIds: ['L19'],
  solution: 'Use the ratio test.',
  status: 'reviewed',
}

const content = buildContent(loadContent().lessons, [], [])

async function setup(props: Partial<QuestionViewProps> = {}, clock = { t: new Date('2026-11-06T12:00:00Z') }) {
  const onChoose = vi.fn()
  const onSubmit = vi.fn()
  render(
    <MemoryRouter>
      <StoreProvider store={new MemoryStore()} content={content} now={() => clock.t}>
        <QuestionView question={question} mode="immediate" onChoose={onChoose} onSubmit={onSubmit} {...props} />
      </StoreProvider>
    </MemoryRouter>,
  )
  await screen.findByText('converges')
  return { onChoose, onSubmit, clock }
}

test('renders stem through Markdown, one button per choice, and figures', async () => {
  await setup()
  expect(screen.getByText('converges').tagName).toBe('STRONG')
  const choices = screen.getAllByRole('button', { name: /^[A-J]\b/ })
  expect(choices.map((b) => b.textContent?.trim()[0])).toEqual(question.choices.map((c) => c.label))
  expect(screen.getByRole('button', { name: /^B\b/ })).toHaveTextContent('beta')
  const imgs = screen.getAllByRole('img', { name: 'Figure for question 7' })
  expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/figures/q7a.png', '/figures/q7b.png'])
})

test('renders no figures when the question has none', async () => {
  await setup({ question: { ...question, figures: undefined } })
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
})

test('pressing b calls onChoose with B; aria-pressed reflects chosen', async () => {
  const { onChoose } = await setup({ chosen: 'D' })
  await userEvent.keyboard('b')
  expect(onChoose).toHaveBeenCalledWith('B')
  expect(screen.getByRole('button', { name: /^D\b/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /^B\b/ })).toHaveAttribute('aria-pressed', 'false')
})

test('uppercase key chooses too; modifier keys and out-of-range letters are ignored', async () => {
  const { onChoose } = await setup()
  await userEvent.keyboard('E')
  expect(onChoose).toHaveBeenCalledWith('E')
  onChoose.mockClear()
  await userEvent.keyboard('{Control>}a{/Control}')
  await userEvent.keyboard('f')
  expect(onChoose).not.toHaveBeenCalled()
})

test('an eight-choice question renders A..H and pressing h chooses H', async () => {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
  const eight: Question = {
    ...question,
    choices: labels.map((label) => ({ label, text: `option ${label}` })),
    answer: 'H',
  }
  const { onChoose } = await setup({ question: eight })
  const choices = screen.getAllByRole('button', { name: /^[A-J]\b/ })
  expect(choices.map((b) => b.textContent?.trim()[0])).toEqual([...labels])
  await userEvent.keyboard('h')
  expect(onChoose).toHaveBeenCalledWith('H')
  onChoose.mockClear()
  await userEvent.keyboard('i')
  expect(onChoose).not.toHaveBeenCalled()
})

test('clicking a choice calls onChoose', async () => {
  const { onChoose } = await setup()
  await userEvent.click(screen.getByRole('button', { name: /^A\b/ }))
  expect(onChoose).toHaveBeenCalledWith('A')
})

test('Enter in immediate mode with a choice submits with elapsed seconds', async () => {
  const clock = { t: new Date('2026-11-06T12:00:00Z') }
  const { onSubmit } = await setup({ chosen: 'B' }, clock)
  clock.t = new Date('2026-11-06T12:00:12.340Z')
  await userEvent.keyboard('{Enter}')
  expect(onSubmit).toHaveBeenCalledTimes(1)
  const [label, seconds] = onSubmit.mock.calls[0]
  expect(label).toBe('B')
  expect(seconds).toBeGreaterThanOrEqual(0)
  expect(seconds).toBe(12.3)
})

test('Enter without a choice does not submit', async () => {
  const { onSubmit } = await setup()
  await userEvent.keyboard('{Enter}')
  expect(onSubmit).not.toHaveBeenCalled()
})

test('Enter in deferred mode does not submit', async () => {
  const { onSubmit } = await setup({ mode: 'deferred', chosen: 'B' })
  await userEvent.keyboard('{Enter}')
  expect(onSubmit).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
})

test('Submit button submits the chosen answer', async () => {
  const { onSubmit } = await setup({ chosen: 'A' })
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(onSubmit).toHaveBeenCalledWith('A', expect.any(Number))
})

test('revealed marks correct and chosen answers, shows feedback, solution, and lesson link', async () => {
  const { onChoose, onSubmit } = await setup({
    chosen: 'B',
    revealed: true,
    lessonTitle: 'Lesson 19',
    lessonHref: '/course/L19',
  })
  const correct = screen.getByRole('button', { name: 'Correct answer' })
  expect(correct).toHaveTextContent(/^C/)
  expect(correct).toHaveTextContent('gamma')
  const mine = screen.getByRole('button', { name: 'Your answer' })
  expect(mine).toHaveTextContent(/^B/)
  for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Not quite')
  expect(screen.getByText('Use the ratio test.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Lesson 19' })).toHaveAttribute('href', '/course/L19')
  await userEvent.keyboard('a{Enter}')
  expect(onChoose).not.toHaveBeenCalled()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('revealed with the correct choice says Correct and has no Your answer mark', async () => {
  await setup({ chosen: 'C', revealed: true })
  expect(screen.getByRole('status')).toHaveTextContent('Correct')
  expect(screen.getByRole('button', { name: 'Correct answer' })).toHaveTextContent(/^C/)
  expect(screen.queryByRole('button', { name: 'Your answer' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

test('solution is hidden before reveal', async () => {
  await setup({ chosen: 'B' })
  expect(screen.queryByText('Use the ratio test.')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
