import type { ConceptCard, Lesson } from '../content/schema'

// Synthetic content for UI tests, so that they pass with any subset of the files in content/.

export const PLANNED_LESSON_COUNT = 35

export function fixtureLesson(number: number, over: Partial<Lesson> = {}): Lesson {
  return {
    id: `L${number}`,
    number,
    title: `Topic ${number}`,
    sections: [`${number}.1`],
    unit: 'Vectors',
    videoUrl: `https://video.test/L${number}`,
    notesUrl: `https://notes.test/L${number}`,
    prerequisites: [],
    keyIdeas: '',
    isReview: false,
    ...over,
  }
}

/** L1 to L35 plus one review lesson, in the shape of the real course list. */
export function fixtureLessons(): Lesson[] {
  const planned = Array.from({ length: PLANNED_LESSON_COUNT }, (_, i) => fixtureLesson(i + 1))
  const review = fixtureLesson(PLANNED_LESSON_COUNT + 1, {
    id: 'R-exam1',
    title: 'Exam 1 review',
    unit: null,
    isReview: true,
  })
  return [...planned, review]
}

export function fixtureCard(id: string, lessonId: string): ConceptCard {
  return { id, lessonId, front: `Front of ${id}`, back: `Back of ${id}` }
}
