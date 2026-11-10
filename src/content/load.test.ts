import { afterEach, expect, test, vi } from 'vitest'
import { loadContent } from './load'
import { LessonSchema } from './schema'

afterEach(() => {
  vi.restoreAllMocks()
})

test('loadContent checks every item against its schema when asked to', () => {
  const spy = vi.spyOn(LessonSchema, 'safeParse')
  const content = loadContent(true)
  expect(spy).toHaveBeenCalledTimes(content.lessons.length)
})

test('loadContent(false) trusts the files, as a production page load does', () => {
  const spy = vi.spyOn(LessonSchema, 'safeParse')
  const content = loadContent(false)
  expect(spy).not.toHaveBeenCalled()
  expect(content.lessons.length).toBeGreaterThan(0)
  expect(content.questions.length).toBeGreaterThan(0)
})

test('validated and trusted loads give the same content', () => {
  expect(loadContent(false).questions.map((q) => q.id)).toEqual(loadContent(true).questions.map((q) => q.id))
  expect(loadContent(false).cards).toEqual(loadContent(true).cards)
})

test('a file that breaks its schema is named in the error', () => {
  vi.spyOn(LessonSchema, 'safeParse').mockReturnValue({ success: false, error: { message: 'bad lesson' } } as never)
  expect(() => loadContent(true)).toThrow(/Invalid content in .*lessons\.json\[0\]: bad lesson/)
})
