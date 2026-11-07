import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup, configure, getConfig } from '@testing-library/react'
import { unstable_NormalPriority, unstable_scheduleCallback } from 'scheduler'

// Scheduler runs equal-priority tasks in order, so this resolves after the tasks already queued at normal
// priority or higher, which include React's renders and passive effects. It does not wait for
// lower-priority tasks or for tasks spawned later. setup.test.tsx checks this is the copy React uses.
function schedulerTasksRun(): Promise<void> {
  return new Promise((resolve) => {
    unstable_scheduleCallback(unstable_NormalPriority, resolve)
  })
}

// vitest runs with globals: false, so Testing Library cannot register its own auto-cleanup.
// Unmounting does not cancel queued Scheduler tasks. One left over after the last test of a file runs
// after jsdom is torn down and fails the whole run with "window is not defined", so wait for them here.
afterEach(async () => {
  cleanup()
  await schedulerTasksRun()
})

// A commit made outside act() (any state set after an await) runs its passive effects in a later
// Scheduler task when the render used up the 5 ms frame. findBy*, waitFor, and user-event can return
// from Testing Library's setTimeout(0) drain before that task runs. Under CPU load a test could then go
// on before a timer, listener, or start time was set up, so these helpers wait for the queued tasks too.
const testingLibraryAsyncWrapper = getConfig().asyncWrapper
configure({
  asyncWrapper: (cb) =>
    testingLibraryAsyncWrapper(async () => {
      const result = await cb()
      await schedulerTasksRun()
      return result
    }),
})
