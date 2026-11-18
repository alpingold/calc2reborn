import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { applyTheme, readTheme, saveTheme, THEME_KEY } from './theme'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterEach(() => {
  vi.restoreAllMocks()
})

test('the theme is dark until one is chosen', () => {
  expect(readTheme()).toBe('dark')
})

test('a saved choice is read back, and anything else falls back to dark', () => {
  localStorage.setItem(THEME_KEY, 'light')
  expect(readTheme()).toBe('light')
  localStorage.setItem(THEME_KEY, 'system')
  expect(readTheme()).toBe('system')
  localStorage.setItem(THEME_KEY, 'sepia')
  expect(readTheme()).toBe('dark')
})

test('saving applies the theme to the page and stores it', () => {
  saveTheme('light')
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(localStorage.getItem(THEME_KEY)).toBe('light')
  applyTheme('system')
  expect(document.documentElement.dataset.theme).toBe('system')
})

test('without storage the theme still applies and reading falls back to dark', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied')
  })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied')
  })
  expect(() => saveTheme('light')).not.toThrow()
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(readTheme()).toBe('dark')
})
