import { describe, expect, it } from 'vitest'
import type { Settings } from '../storage/types'
import { DEFAULT_SETTINGS } from '../storage/types'
import { fixtureLessons } from '../test/fixtures'
import { daysUntil, examScope, lessonRange, rangeEnds } from './scope'

const lessons = fixtureLessons()
const now = new Date(2026, 10, 7, 12, 0)
const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over })

describe('lessonRange', () => {
  it('lists planned lessons between two ends, in either order', () => {
    expect(lessonRange(lessons, 'L19', 'L21')).toEqual(['L19', 'L20', 'L21'])
    expect(lessonRange(lessons, 'L21', 'L19')).toEqual(['L19', 'L20', 'L21'])
    expect(lessonRange(lessons, 'L5', 'L5')).toEqual(['L5'])
  })
  it('is empty for an unknown or review lesson', () => {
    expect(lessonRange(lessons, 'nope', 'L3')).toEqual([])
    expect(lessonRange(lessons, 'R-exam1', 'L3')).toEqual([])
  })
})

describe('rangeEnds', () => {
  it('gives the lowest and highest lesson of a list', () => {
    expect(rangeEnds(lessons, ['L23', 'L19', 'L26'])).toEqual({ from: 'L19', to: 'L26' })
  })
  it('is null for an empty or unknown list', () => {
    expect(rangeEnds(lessons, [])).toBeNull()
    expect(rangeEnds(lessons, ['nope'])).toBeNull()
  })
})

describe('daysUntil', () => {
  it('counts local calendar days', () => {
    expect(daysUntil('2026-11-09', now)).toBe(2)
    expect(daysUntil('2026-11-07', now)).toBe(0)
    expect(daysUntil('2026-11-06', now)).toBe(-1)
  })
})

describe('examScope', () => {
  it('is inactive with no exam lessons', () => {
    expect(examScope(settings({ examDate: '2026-11-09' }), lessons, now)).toEqual({ lessonIds: [], active: false })
  })
  it('is active with lessons and a future, same-day, or blank date', () => {
    const ids = ['L19', 'L20']
    expect(examScope(settings({ examLessonIds: ids, examDate: '2026-11-09' }), lessons, now).active).toBe(true)
    expect(examScope(settings({ examLessonIds: ids, examDate: '2026-11-07' }), lessons, now).active).toBe(true)
    expect(examScope(settings({ examLessonIds: ids, examDate: null }), lessons, now)).toEqual({ lessonIds: ids, active: true })
  })
  it('is inactive once the exam date has passed', () => {
    expect(examScope(settings({ examLessonIds: ['L19'], examDate: '2026-11-06' }), lessons, now).active).toBe(false)
  })
  it('drops ids that are not planned lessons, in course order', () => {
    expect(examScope(settings({ examLessonIds: ['L20', 'nope', 'R-exam1', 'L19'] }), lessons, now).lessonIds).toEqual([
      'L19',
      'L20',
    ])
  })
})
