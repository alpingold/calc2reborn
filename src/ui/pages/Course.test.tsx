import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Course } from './Course'
import { StoreProvider } from '../../storage/context'
import { MemoryStore } from '../../storage/memory'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { buildContent } from '../../content'
import { fixtureLessons } from '../../test/fixtures'
import type { Scheduler } from '../../engine/fsrs'

const content = buildContent(fixtureLessons(), [], [])

async function setup() {
  const store = new MemoryStore()
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentLessonId: 'L19' })
  render(
    <MemoryRouter>
      <StoreProvider store={store} scheduler={{} as Scheduler} content={content}>
        <Course />
      </StoreProvider>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 2, name: 'Course' })
}

test('lists lessons by unit and marks the current one', async () => {
  await setup()
  const current = screen.getByRole('link', { name: 'L19 Topic 19' }).closest('li')!
  expect(within(current).getByText('Current')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Exam 1 review/ })).not.toBeInTheDocument()
})

test('extra topics come last, in their own group, named by title without a lesson number', async () => {
  await setup()
  const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
  expect(headings[headings.length - 1]).toBe('Other topics')
  const group = screen.getByRole('heading', { level: 3, name: 'Other topics' }).closest('section')!
  expect(within(group).getByText(/not part of Dr\. Chen's Fall 2023 lessons/)).toBeInTheDocument()
  const link = within(group).getByRole('link', { name: '12.1 Parametric Equations' })
  expect(link).toHaveAttribute('href', '/course/X1')
  expect(within(group).queryByText(/^L\d+$/)).not.toBeInTheDocument()
})
