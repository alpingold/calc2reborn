import { describe, expect, test } from 'vitest'
import { LessonSchema, QuestionSchema } from './schema'

const q = {
  id: 'Q1', number: 1, points: 6, stem: 'What is $1+1$?',
  choices: ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: label })),
  answer: 'A', lessonIds: ['L1'], status: 'transcribed',
}
const lesson = {
  id: 'L1', number: 1, title: '13.1 Vectors', sections: ['13.1'], unit: 'Vectors',
  videoUrl: 'https://v', notesUrl: 'https://n', prerequisites: [], keyIdeas: '', isReview: false,
}

describe('QuestionSchema', () => {
  test('accepts a valid question', () => {
    expect(QuestionSchema.safeParse(q).success).toBe(true)
  })
  test('rejects four choices', () => {
    expect(QuestionSchema.safeParse({ ...q, choices: q.choices.slice(0, 4) }).success).toBe(false)
  })
  test('rejects labels A,B,C,D,D', () => {
    const choices = q.choices.map((c, i) => (i === 4 ? { ...c, label: 'D' } : c))
    expect(QuestionSchema.safeParse({ ...q, choices }).success).toBe(false)
  })
  test('rejects answer F', () => {
    expect(QuestionSchema.safeParse({ ...q, answer: 'F' }).success).toBe(false)
  })
})

describe('LessonSchema', () => {
  test('accepts a valid lesson', () => {
    expect(LessonSchema.safeParse(lesson).success).toBe(true)
  })
  test('rejects unit Series', () => {
    expect(LessonSchema.safeParse({ ...lesson, unit: 'Series' }).success).toBe(false)
  })
  test('null unit only for reviews', () => {
    expect(LessonSchema.safeParse({ ...lesson, unit: null }).success).toBe(false)
    expect(LessonSchema.safeParse({ ...lesson, unit: null, isReview: true }).success).toBe(true)
  })
  test('a review may still carry a unit', () => {
    expect(LessonSchema.safeParse({ ...lesson, isReview: true }).success).toBe(true)
  })
})
