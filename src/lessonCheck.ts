/**
 * The day this device last confirmed the current lesson. The Today page asks once per calendar day;
 * kept in localStorage, not in the synced settings, so each device asks on its own first visit.
 */
export const LESSON_CHECK_KEY = 'ma16200-lesson-checked'

/** A local calendar day as YYYY-MM-DD. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Whether the lesson was confirmed (or set) on this device today. False when storage is unavailable. */
export function lessonCheckedToday(now: Date): boolean {
  try {
    return localStorage.getItem(LESSON_CHECK_KEY) === localDay(now)
  } catch {
    return false
  }
}

/** Records that the current lesson was confirmed or set today, so the page does not ask again. */
export function markLessonChecked(now: Date): void {
  try {
    localStorage.setItem(LESSON_CHECK_KEY, localDay(now))
  } catch {
    // private mode or a full quota: the question is only hidden until the page reloads
  }
}
