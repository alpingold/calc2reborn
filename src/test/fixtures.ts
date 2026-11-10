import type { ConceptCard, Lesson, ProblemType } from '../content/schema'

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

/** Two problem types for a fixture lesson, `L5-a` and `L5-b`; tests that need types pass them to fixtureLesson. */
export function fixtureTypes(lessonId: string): ProblemType[] {
  return [
    { id: `${lessonId}-a`, name: `${lessonId} type A` },
    { id: `${lessonId}-b`, name: `${lessonId} type B` },
  ]
}

/** An exam topic outside Dr. Chen's lessons, in the shape of the real extras. */
export function fixtureExtra(): Lesson {
  return fixtureLesson(PLANNED_LESSON_COUNT + 2, {
    id: 'X1',
    title: '12.1 Parametric Equations',
    sections: ['12.1'],
    unit: 'Other topics',
    videoUrl: '',
    notesUrl: '',
    isExtra: true,
  })
}

/**
 * L1 to L35, one review lesson, and one extra topic, in the shape of the real course list. The extra
 * is here so every test that counts or ranges lessons also checks that extras stay out.
 */
export function fixtureLessons(): Lesson[] {
  const planned = Array.from({ length: PLANNED_LESSON_COUNT }, (_, i) => fixtureLesson(i + 1))
  const review = fixtureLesson(PLANNED_LESSON_COUNT + 1, {
    id: 'R-exam1',
    title: 'Exam 1 review',
    unit: null,
    isReview: true,
  })
  return [...planned, review, fixtureExtra()]
}

export function fixtureCard(id: string, lessonId: string): ConceptCard {
  return { id, lessonId, front: `Front of ${id}`, back: `Back of ${id}` }
}
