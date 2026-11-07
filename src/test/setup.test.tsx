import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEffect, useLayoutEffect, useState } from 'react'
import { unstable_ImmediatePriority, unstable_NormalPriority, unstable_scheduleCallback } from 'scheduler'

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

// The waits in setup.ts mean nothing if they use a different copy of scheduler from React's. package.json
// pins an exact version while react-dom declares a range, so a React upgrade can split them silently.
test('setup.ts resolves the same scheduler package as react-dom', () => {
  const fromSetup = createRequire(path.resolve('src/test/setup.ts'))
  // resolved first so the lookup starts from react-dom's real folder, not the node_modules symlink
  const fromReactDom = createRequire(fromSetup.resolve('react-dom/package.json'))
  expect(realpathSync(fromSetup.resolve('scheduler'))).toBe(realpathSync(fromReactDom.resolve('scheduler')))
})

// Catches a split that package resolution cannot see, such as a bundler alias. In one queue an immediate
// task runs ahead of React's waiting render. With two copies, each runs in the order it was posted.
test('the scheduler imported here is the queue React renders from', async () => {
  const order: string[] = []
  let turnOn = () => {}
  function Probe() {
    const [on, setOn] = useState(false)
    turnOn = () => setOn(true)
    useLayoutEffect(() => {
      if (on) order.push('render')
    }, [on])
    return <p>{on ? 'on' : 'off'}</p>
  }
  render(<Probe />)
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const priorActEnvironment = env.IS_REACT_ACT_ENVIRONMENT
  env.IS_REACT_ACT_ENVIRONMENT = false
  try {
    turnOn()
    // React hands the render to its Scheduler in a microtask, and our task must be posted after that for
    // two copies to show up. Scheduler only runs on a macrotask, so extra ticks cannot change one queue's order.
    for (let tick = 0; tick < 20; tick++) await Promise.resolve()
    unstable_scheduleCallback(unstable_ImmediatePriority, () => order.push('immediate'))
    await screen.findByText('on')
  } finally {
    env.IS_REACT_ACT_ENVIRONMENT = priorActEnvironment
  }
  expect(order).toEqual(['immediate', 'render'])
})
