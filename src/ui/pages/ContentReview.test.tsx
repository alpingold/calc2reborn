import { afterEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { buildRoutes } from '../../routes'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { buildContent } from '../../content'
import { fixtureLessons } from '../../test/fixtures'
import { createScheduler } from '../../engine/fsrs'
import type { Choice, Exam, Question } from '../../content/schema'

const choices: Choice[] = [
  { label: 'A', text: 'alpha' },
  { label: 'B', text: 'beta' },
  { label: 'C', text: 'gamma' },
  { label: 'D', text: 'delta' },
  { label: 'E', text: 'epsilon' },
]

function q(n: number, extra: Partial<Question> = {}): Question {
  return {
    id: `f2025-e1-q0${n}`,
    number: n,
    points: 8,
    stem: `Stem ${n}`,
    choices,
    answer: 'C',
    lessonIds: ['L5', 'L10'],
    tags: ['series'],
    status: 'transcribed',
    ...extra,
  }
}

const exam: Exam = {
  id: 'f2025-e1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: [q(1), q(2), q(3, { sourcePage: 3 }), q(4, { tags: undefined })],
}
const lessons = fixtureLessons()
const content = buildContent(lessons, [], [exam])

afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderAt(path: string, dev = true, c = content) {
  const scheduler = await createScheduler()
  const router = createMemoryRouter(buildRoutes(dev), { initialEntries: [path] })
  render(
    <StoreProvider store={new MemoryStore()} scheduler={scheduler} content={c}>
      <RouterProvider router={router} />
    </StoreProvider>,
  )
  return router
}

test('route is absent when dev is false', async () => {
  await renderAt('/dev/content', false)
  expect(await screen.findByRole('heading', { level: 2, name: 'Not found' })).toBeInTheDocument()
})

test('in dev renders question, correct answer, metadata and source image', async () => {
  await renderAt('/dev/content?exam=f2025-e1&q=3')
  expect(await screen.findByRole('heading', { level: 2, name: 'Content review' })).toBeInTheDocument()
  expect(screen.getByText('Stem 3')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Correct answer' })).toHaveTextContent('gamma')
  expect(screen.getByText('Lessons: L5, L10')).toBeInTheDocument()
  expect(screen.getByText('Tags: series')).toBeInTheDocument()
  expect(screen.getByText('Status: transcribed')).toBeInTheDocument()
  expect(screen.getByText('Answer: C')).toBeInTheDocument()
  expect(screen.getByText('Source page: 3')).toBeInTheDocument()
  const img = screen.getByRole('img', { name: 'Source page 3 of f2025-e1' })
  expect(img.getAttribute('src')).toMatch(/\/raw-pages\/f2025-e1\/p3\.png$/)
})

test('page falls back to the position guess and tags show none', async () => {
  await renderAt('/dev/content?q=4')
  const img = await screen.findByRole('img', { name: 'Source page 4 of f2025-e1' })
  expect(img.getAttribute('src')).toBe('/raw-pages/f2025-e1/p4.png')
  expect(screen.getByText('Tags: none')).toBeInTheDocument()
})

test('Prev and Next change q and disable at the ends', async () => {
  const user = userEvent.setup()
  const router = await renderAt('/dev/content')
  expect(await screen.findByText('Stem 1')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Stem 2')).toBeInTheDocument()
  expect(router.state.location.search).toContain('q=2')
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Stem 4')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('Mark reviewed copies the JSON line and shows Copied', async () => {
  const user = userEvent.setup()
  await renderAt('/dev/content?q=3')
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))
  expect(await screen.findByText('Copied')).toHaveAttribute('role', 'status')
  expect(writeText).toHaveBeenCalledWith('{"id":"f2025-e1-q03","status":"reviewed"}')
})

test('empty state when there are no exams', async () => {
  await renderAt('/dev/content', true, buildContent(lessons, [], []))
  expect(await screen.findByText('No exams transcribed yet.')).toBeInTheDocument()
})
