import { expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { GuidedProblem } from '../content/schema'
import { GUIDED_START, GuidedProblemView } from './GuidedProblem'
import type { GuidedProgress } from './GuidedProblem'

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

test('a wrong choice shows its note inside the choice, is disabled, and does not reveal the answer or the next step', async () => {
  render(<GuidedProblemView problem={problem} />)
  expect(screen.queryByText(/Choose again/)).not.toBeInTheDocument()
  await userEvent.click(choice(/Wrong 1a/))
  expect(screen.getByRole('status')).toHaveTextContent('Note 1a')
  expect(choice(/Wrong 1a/)).toBeDisabled()
  expect(choice(/Wrong 1a/)).toHaveTextContent('Not this one')
  // the note sits with the choice it explains, not under the whole list
  expect(choice(/Wrong 1a/).parentElement).toHaveTextContent('Note 1a')
  expect(choice(/Wrong 1a/).parentElement).not.toHaveTextContent('Right 1')
  expect(choice(/Right 1/)).toBeEnabled()
  expect(choice(/Right 1/)).not.toHaveClass('correct')
  expect(screen.getByText('Choose again. The answer stays hidden until you find it.')).toBeInTheDocument()
  expect(screen.queryByText('Explanation 1')).not.toBeInTheDocument()
  expect(screen.queryByText('Prompt 2')).not.toBeInTheDocument()
  // a second wrong choice gets its own note, which is the one announced; the first stays with its choice
  await userEvent.click(choice(/Wrong 1c/))
  expect(screen.getByRole('status')).toHaveTextContent('Note 1c')
  expect(choice(/Wrong 1c/).parentElement).toHaveTextContent('Note 1c')
  expect(choice(/Wrong 1a/).parentElement).toHaveTextContent('Note 1a')
})

test('the right choice folds the step to one line with its explanation, and reveals the next step', async () => {
  render(<GuidedProblemView problem={problem} />)
  expect(screen.getByRole('img', { name: 'Step 1 of 3' })).toBeInTheDocument()
  await userEvent.click(choice(/Wrong 1a/))
  await userEvent.click(choice(/Right 1/))
  expect(screen.getByRole('status')).toHaveTextContent('Explanation 1')
  expect(screen.queryByText('Note 1a')).not.toBeInTheDocument()
  // the finished step is a summary line naming the answer; its choices are gone
  const done = screen.getAllByRole('listitem')[0]
  const summary = done.querySelector('summary')!
  expect(summary).toHaveTextContent('Step 1 done: Right 1')
  expect(done.querySelector('details')).toHaveAttribute('open')
  expect(within(done).getByText('Prompt 1')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Right 1/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Wrong 1c/ })).not.toBeInTheDocument()
  expect(screen.getByText('Prompt 2')).toBeInTheDocument()
  expect(choice(/Right 2/)).toBeEnabled()
  expect(screen.getByRole('img', { name: 'Step 2 of 3' })).toBeInTheDocument()
  // once the next step is solved, the earlier one closes and only the latest explanation is open
  await userEvent.click(choice(/Right 2/))
  const steps = screen.getAllByRole('listitem')
  expect(steps[0].querySelector('details')).not.toHaveAttribute('open')
  expect(steps[1].querySelector('details')).toHaveAttribute('open')
  expect(screen.getByRole('status')).toHaveTextContent('Explanation 2')
})

test('a parent can hold the progress, so the work survives the problem leaving the screen', async () => {
  let held: GuidedProgress = GUIDED_START
  const view = () => <GuidedProblemView problem={problem} progress={held} onProgress={(p) => (held = p)} />
  const first = render(view())
  await userEvent.click(choice(/Wrong 1a/))
  first.rerender(view())
  await userEvent.click(choice(/Right 1/))
  first.unmount()
  expect(held).toEqual({ solved: 1, tried: [['A'], []] })
  render(view())
  expect(screen.getByText('Prompt 2')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Step 2 of 3' })).toBeInTheDocument()
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
