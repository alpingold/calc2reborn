import { afterEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { App } from './App'
import { routes } from './routes'
import { StoreProvider } from './storage/context'
import { MemoryStore } from './storage/memory'

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string, store?: MemoryStore) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <StoreProvider store={store}>
      <RouterProvider router={router} />
    </StoreProvider>,
  )
}

test('App renders the title and nav once loaded', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'MA 16200' })).toBeInTheDocument()
  const nav = screen.getByRole('navigation')
  for (const name of ['Dashboard', 'Course', 'Review', 'Practice', 'Exams', 'Settings']) {
    expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
  }
})

test('no fallback banner when a store is available', async () => {
  renderAt('/', new MemoryStore())
  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  expect(screen.queryByText('Progress will not be saved in this browser')).not.toBeInTheDocument()
})

test('shows the fallback banner when indexedDB is unavailable', async () => {
  vi.stubGlobal('indexedDB', undefined)
  renderAt('/')
  expect(await screen.findByRole('status')).toHaveTextContent('Progress will not be saved in this browser')
})

test.each([
  ['/', 'Dashboard'],
  ['/course', 'Course'],
  ['/course/L19', '10.1 Sequences and Series: An Overview'],
  ['/review', 'Review'],
  ['/practice?lesson=L23', 'Practice'],
  ['/exams', 'Exams'],
  ['/exams/F2024-1', 'TakeExam'],
  ['/exams/mock?from=L19&to=L26', 'TakeExam'],
  ['/results/abc', 'ExamResults'],
  ['/settings', 'Settings'],
  ['/dev/content', 'ContentReview'],
  ['/nope', 'Not found'],
])('route %s renders %s', async (path, name) => {
  renderAt(path, new MemoryStore())
  // waitFor re-queries: pages swap their h2 element once data loads
  await waitFor(() => expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument())
})
