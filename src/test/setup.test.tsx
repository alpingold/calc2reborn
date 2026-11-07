import { afterEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { unstable_NormalPriority, unstable_scheduleCallback } from 'scheduler'

function spin(ms: number) {
  const end = performance.now() + ms
  while (performance.now() < end);
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// Recreates CPU load on demand. The slow render makes Scheduler yield between the commit and its
// passive effects, and the slow setTimeout makes Testing Library's drain timer due before Scheduler's
// next task.
function forceTheRace() {
  const realSetTimeout = globalThis.setTimeout
  vi.stubGlobal('setTimeout', (fn: () => void, ms?: number) => {
    const id = realSetTimeout(fn, ms)
    spin(3)
    return id
  })
}

test('findBy returns only after the passive effects of the commit it found have run', async () => {
  const effects: string[] = []
  function Slow() {
    spin(20)
    useEffect(() => {
      effects.push('effect ran')
    }, [])
    return <p>loaded</p>
  }
  function Host() {
    const [ready, setReady] = useState(false)
    useEffect(() => {
      void Promise.resolve().then(() => setReady(true))
    }, [])
    return ready ? <Slow /> : <p>loading</p>
  }

  forceTheRace()
  render(<Host />)
  await screen.findByText('loaded')
  expect(effects).toEqual(['effect ran'])
})

// These two tests run in order: the second one checks what the first one left behind.
const QUEUED_TASKS = 20
let tasksRun = 0

test('a test can end with Scheduler tasks still queued', () => {
  for (let i = 0; i < QUEUED_TASKS; i++) {
    unstable_scheduleCallback(unstable_NormalPriority, () => {
      spin(6)
      tasksRun++
    })
  }
  expect(tasksRun).toBe(0)
})

test('afterEach waits for queued Scheduler tasks, so none can outlive jsdom', () => {
  expect(tasksRun).toBe(QUEUED_TASKS)
})
