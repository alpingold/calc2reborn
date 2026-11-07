import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vitest runs with globals: false, so Testing Library cannot register its own auto-cleanup.
afterEach(() => {
  cleanup()
})
