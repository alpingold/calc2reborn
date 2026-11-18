import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { RouteObject } from 'react-router'
import { App } from './App'
import { routes } from './routes'
import { StoreProvider } from './storage/context'
import { MemoryStore } from './storage/memory'
import { buildContent } from './content'
import { fixtureCard, fixtureLessons } from './test/fixtures'
import { userEvent } from '@testing-library/user-event'
import { DEFAULT_SETTINGS } from './storage/types'
import type { Exam } from './content/schema'

const content = buildContent(fixtureLessons(), [], [])

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string, store?: MemoryStore) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <StoreProvider store={store} content={content}>
      <RouterProvider router={router} />
    </StoreProvider>,
  )
}

test('App renders the title and nav once loaded', { timeout: 20000 }, async () => {
  render(<App />)
  // App loads the whole content chunk first: about 2 MB of JSON, which can take over a second while other test files run
  expect(await screen.findByRole('heading', { name: 'MA 16200' }, { timeout: 15000 })).toBeInTheDocument()
  // four destinations, in order; Settings is a small link outside them
  const nav = screen.getByRole('navigation', { name: 'Main' })
  expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Today', 'Lessons', 'Practice', 'Exams'])
  expect(within(nav).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  expect(within(nav).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
})

test.each([
  ['/', 'Today'],
  ['/course/L19', 'Lessons'],
  ['/practice', 'Practice'],
  // flashcards are reached from Practice, so Practice stays marked while studying them
  ['/review', 'Practice'],
  ['/exams', 'Exams'],
  ['/results/abc', 'Exams'],
])('at %s the nav marks %s as the current destination', async (path, name) => {
  renderAt(path, new MemoryStore())
  const nav = await screen.findByRole('navigation', { name: 'Main' })
  const current = within(nav).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')
  expect(current.map((a) => a.textContent)).toEqual([name])
})

test('Settings marks no destination', async () => {
  renderAt('/settings', new MemoryStore())
  const nav = await screen.findByRole('navigation', { name: 'Main' })
  expect(within(nav).getAllByRole('link').filter((a) => a.hasAttribute('aria-current'))).toHaveLength(0)
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
})

test('no fallback banner when a store is available', async () => {
  renderAt('/', new MemoryStore())
  expect(await screen.findByRole('heading', { name: "Today's session" })).toBeInTheDocument()
  expect(screen.queryByText('Progress will not be saved in this browser')).not.toBeInTheDocument()
})

test('shows the fallback banner when indexedDB is unavailable', async () => {
  vi.stubGlobal('indexedDB', undefined)
  renderAt('/')
  expect(await screen.findByRole('status')).toHaveTextContent('Progress will not be saved in this browser')
})

test.each([
  ['/', "Today's session"],
  ['/course', 'Lessons'],
  ['/course/L19', 'Topic 19'],
  ['/review', 'Flashcards'],
  ['/practice?lesson=L23', 'Practice'],
  ['/exams', 'Exams'],
  ['/exams/F2024-1', 'Exam'],
  ['/exams/mock?from=L19&to=L26', 'Mock exam'],
  ['/results/abc', 'Results'],
  ['/settings', 'Settings'],
  ['/dev/content', 'Content review'],
  ['/nope', 'Not found'],
])('route %s renders %s', async (path, name) => {
  renderAt(path, new MemoryStore())
  // waitFor re-queries: pages swap their h2 element once data loads
  await waitFor(() => expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument())
})

test('a screen that throws shows the error page with a way to reload', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  function Broken(): never {
    throw new Error('boom')
  }
  const withBroken = [{ ...routes[0], children: [{ path: 'broken', element: <Broken /> }] }] as RouteObject[]
  const router = createMemoryRouter(withBroken, { initialEntries: ['/broken'] })
  render(
    <StoreProvider store={new MemoryStore()} content={content}>
      <RouterProvider router={router} />
    </StoreProvider>,
  )
  expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  spy.mockRestore()
})

// ---- focus mode: a session in progress replaces the navigation with its own slim bar

const choices = (['A', 'B', 'C', 'D', 'E'] as const).map((label) => ({ label, text: `choice ${label}` }))
const exam: Exam = {
  id: 'f2025-e1',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: [1, 2].map((n) => ({ id: `f2025-e1-q${n}`, number: n, points: 50, stem: `Stem ${n}`, choices, answer: 'C' as const, lessonIds: ['L19'], status: 'reviewed' as const })),
}
const sessionContent = buildContent(fixtureLessons(), [fixtureCard('L19-c01', 'L19')], [exam])

async function renderSession(path: string) {
  const store = new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentLessonId: 'L19' })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <StoreProvider store={store} content={sessionContent}>
      <RouterProvider router={router} />
    </StoreProvider>,
  )
  return router
}

test('a practice session hides the navigation, and ending it brings the navigation back', async () => {
  await renderSession('/practice?lesson=L19')
  const end = await screen.findByRole('button', { name: 'End session' })
  expect(await screen.findByText(/^Stem [12]$/)).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'MA 16200' })).not.toBeInTheDocument()
  expect(screen.getByText('Practice · L19')).toBeInTheDocument()
  await userEvent.click(end)
  expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to Today' })).toBeInTheDocument()
})

test('the practice setup screen keeps the navigation: nothing is in progress yet', async () => {
  await renderSession('/practice')
  expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
})

test('a flashcard session hides the navigation and offers a way out', async () => {
  await renderSession('/review')
  expect(await screen.findByText('Front of L19-c01')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'End session' }))
  expect(await screen.findByRole('heading', { level: 2, name: 'Practice' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
})

test('a running timed exam shows no navigation and no links at all, while its start screen still does', async () => {
  localStorage.clear()
  await renderSession('/exams/f2025-e1')
  const start = await screen.findByRole('button', { name: 'Start' })
  expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  await userEvent.click(start)
  expect(await screen.findByRole('heading', { name: 'Question 1 of 2' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Leave exam' })).toBeInTheDocument()
  expect(screen.getByRole('timer')).toBeInTheDocument()
  localStorage.clear()
})
