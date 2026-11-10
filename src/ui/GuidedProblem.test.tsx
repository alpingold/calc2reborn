import { expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { GuidedProblem } from '../content/schema'
import { GuidedProblemView } from './GuidedProblem'

function step(n: number) {
  return {
    prompt: `Prompt ${n}`,
    choices: [
      { label: 'A' as const, text: `Wrong ${n}a`, note: `Note ${n}a` },
      { label: 'B' as const, text: `Right ${n}` },
      { label: 'C' as const, text: `Wrong ${n}c`, note: `Note ${n}c` },
    ],
    answer: 'B' as const,
    explanation: `Explanation ${n}`,
  }
}
const problem: GuidedProblem = {
  id: 'L5-g1',
  lessonId: 'L5',
  typeId: 'L5-a',
  stem: 'The stem',
  steps: [step(1), step(2), step(3)],
  takeaway: 'The takeaway',
}
const choice = (name: RegExp) => screen.getByRole('button', { name })

test('shows the statement and only the first step to begin with', () => {
  render(<GuidedProblemView problem={problem} />)
  expect(screen.getByText('The stem')).toBeInTheDocument()
  expect(screen.getByText('Prompt 1')).toBeInTheDocument()
  expect(screen.queryByText('Prompt 2')).not.toBeInTheDocument()
  expect(screen.queryByText('The takeaway')).not.toBeInTheDocument()
  expect(document.getElementById('guided-L5-g1')).not.toBeNull()
})

test('a wrong choice shows its note, is disabled, and does not reveal the answer or the next step', async () => {
  render(<GuidedProblemView problem={problem} />)
  await userEvent.click(choice(/Wrong 1a/))
  expect(screen.getByRole('status')).toHaveTextContent('Note 1a')
  expect(choice(/Wrong 1a/)).toBeDisabled()
  expect(choice(/Wrong 1a/)).toHaveTextContent('Not this one')
  expect(choice(/Right 1/)).toBeEnabled()
  expect(choice(/Right 1/)).not.toHaveClass('correct')
  expect(screen.queryByText('Explanation 1')).not.toBeInTheDocument()
  expect(screen.queryByText('Prompt 2')).not.toBeInTheDocument()
  // a second wrong choice replaces the note
  await userEvent.click(choice(/Wrong 1c/))
  expect(screen.getByRole('status')).toHaveTextContent('Note 1c')
  expect(screen.queryByText('Note 1a')).not.toBeInTheDocument()
})

test('the right choice shows the explanation, reveals the next step, and keeps the finished step on screen', async () => {
  render(<GuidedProblemView problem={problem} />)
  await userEvent.click(choice(/Wrong 1a/))
  await userEvent.click(choice(/Right 1/))
  expect(screen.getByText('Explanation 1')).toBeInTheDocument()
  expect(screen.queryByText('Note 1a')).not.toBeInTheDocument()
  expect(choice(/Right 1/)).toHaveClass('correct')
  expect(choice(/Right 1/)).toBeDisabled()
  expect(choice(/Wrong 1c/)).toBeDisabled()
  expect(screen.getByText('Prompt 2')).toBeInTheDocument()
  expect(choice(/Right 2/)).toBeEnabled()
})

test('finishing shows the takeaway and reports first-try steps once', async () => {
  const onFinish = vi.fn()
  render(<GuidedProblemView problem={problem} onFinish={onFinish} />)
  await userEvent.click(choice(/Right 1/))
  await userEvent.click(choice(/Wrong 2c/))
  await userEvent.click(choice(/Right 2/))
  expect(onFinish).not.toHaveBeenCalled()
  await userEvent.click(choice(/Right 3/))
  expect(screen.getByText('The takeaway')).toBeInTheDocument()
  expect(screen.getByText('2 of 3 steps right on the first try')).toBeInTheDocument()
  expect(onFinish).toHaveBeenCalledTimes(1)
  expect(onFinish).toHaveBeenCalledWith({ steps: 3, firstTryCorrect: 2 })
  // all three steps are still there as a worked solution
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3)
})

test('working it again starts from the first step and reports again on finishing', async () => {
  const onFinish = vi.fn()
  render(<GuidedProblemView problem={problem} onFinish={onFinish} />)
  for (const n of [1, 2, 3]) await userEvent.click(choice(new RegExp(`Right ${n}`)))
  await userEvent.click(screen.getByRole('button', { name: 'Work it again' }))
  expect(screen.queryByText('Prompt 2')).not.toBeInTheDocument()
  expect(screen.queryByText('The takeaway')).not.toBeInTheDocument()
  expect(choice(/Right 1/)).toBeEnabled()
  for (const n of [1, 2, 3]) await userEvent.click(choice(new RegExp(`Right ${n}`)))
  expect(onFinish).toHaveBeenCalledTimes(2)
  expect(onFinish).toHaveBeenLastCalledWith({ steps: 3, firstTryCorrect: 3 })
})
