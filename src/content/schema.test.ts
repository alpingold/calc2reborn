import { describe, expect, test } from 'vitest'
import { CHOICE_LABELS, LessonSchema, QuestionSchema } from './schema'

const labeled = (n: number) => CHOICE_LABELS.slice(0, n).map((label) => ({ label, text: label }))

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
  test('accepts two to ten choices labeled from A', () => {
    expect(QuestionSchema.safeParse({ ...q, choices: q.choices.slice(0, 2) }).success).toBe(true)
    expect(QuestionSchema.safeParse({ ...q, choices: q.choices.slice(0, 4) }).success).toBe(true)
    expect(QuestionSchema.safeParse({ ...q, choices: labeled(10) }).success).toBe(true)
  })
  test('accepts eight choices A..H with answer H', () => {
    expect(QuestionSchema.safeParse({ ...q, choices: labeled(8), answer: 'H' }).success).toBe(true)
  })
  test('rejects one choice', () => {
    expect(QuestionSchema.safeParse({ ...q, choices: q.choices.slice(0, 1) }).success).toBe(false)
  })
  test('rejects eleven choices', () => {
    const choices = [...labeled(10), { label: 'K', text: 'K' }]
    expect(QuestionSchema.safeParse({ ...q, choices }).success).toBe(false)
  })
  test('rejects labels A,B,D out of sequence', () => {
    const choices = ['A', 'B', 'D'].map((label) => ({ label, text: label }))
    expect(QuestionSchema.safeParse({ ...q, choices }).success).toBe(false)
  })
  test('rejects labels A,B,C,D,D', () => {
    const choices = q.choices.map((c, i) => (i === 4 ? { ...c, label: 'D' } : c))
    expect(QuestionSchema.safeParse({ ...q, choices }).success).toBe(false)
  })
  test('rejects answer F on a five-choice question', () => {
    expect(QuestionSchema.safeParse({ ...q, answer: 'F' }).success).toBe(false)
  })
  test('rejects answer H on a five-choice question', () => {
    expect(QuestionSchema.safeParse({ ...q, answer: 'H' }).success).toBe(false)
  })
  test('rejects answer K outside the label set', () => {
    expect(QuestionSchema.safeParse({ ...q, choices: labeled(10), answer: 'K' }).success).toBe(false)
  })
})

describe('QuestionSchema answerSource', () => {
  test('keeps key and derived', () => {
    for (const answerSource of ['key', 'derived']) {
      const parsed = QuestionSchema.safeParse({ ...q, answerSource })
      expect(parsed.success && parsed.data.answerSource).toBe(answerSource)
    }
  })
  test('is optional, and absent means nothing is added', () => {
    const parsed = QuestionSchema.safeParse(q)
    expect(parsed.success && 'answerSource' in parsed.data).toBe(false)
  })
  test('rejects any other value', () => {
    expect(QuestionSchema.safeParse({ ...q, answerSource: 'guessed' }).success).toBe(false)
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
