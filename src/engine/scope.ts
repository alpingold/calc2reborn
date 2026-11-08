import type { Lesson } from '../content/schema'
import type { Settings } from '../storage/types'

function planned(lessons: Lesson[]): Lesson[] {
  return lessons.filter((l) => !l.isReview).sort((a, b) => a.number - b.number)
}

/** The planned lessons from one end to the other, inclusive, in course order. Empty if either end is unknown. */
export function lessonRange(lessons: Lesson[], fromId: string, toId: string): string[] {
  const list = planned(lessons)
  const a = list.find((l) => l.id === fromId)
  const b = list.find((l) => l.id === toId)
  if (!a || !b) return []
  const [lo, hi] = a.number <= b.number ? [a.number, b.number] : [b.number, a.number]
  return list.filter((l) => l.number >= lo && l.number <= hi).map((l) => l.id)
}

/** The lowest and highest planned lessons in a list, or null if it has none. */
export function rangeEnds(lessons: Lesson[], ids: string[]): { from: string; to: string } | null {
  const wanted = new Set(ids)
  const inList = planned(lessons).filter((l) => wanted.has(l.id))
  if (inList.length === 0) return null
  return { from: inList[0].id, to: inList[inList.length - 1].id }
}

/** Calendar days from today to a YYYY-MM-DD date, in local time: 0 is today, negative is past. */
export function daysUntil(examDate: string, now: Date): number {
  const [y, m, d] = examDate.split('-').map(Number)
  const exam = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((exam.getTime() - today.getTime()) / 86400000)
}

export interface ExamScope {
  /** the exam's planned lessons, in course order */
  lessonIds: string[]
  /** lessons are set and the exam date, if any, has not passed */
  active: boolean
}

export function examScope(settings: Settings, lessons: Lesson[], now: Date): ExamScope {
  const wanted = new Set(settings.examLessonIds)
  const lessonIds = planned(lessons)
    .filter((l) => wanted.has(l.id))
    .map((l) => l.id)
  const passed = settings.examDate !== null && daysUntil(settings.examDate, now) < 0
  return { lessonIds, active: lessonIds.length > 0 && !passed }
}
