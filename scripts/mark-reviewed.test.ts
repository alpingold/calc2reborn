import { expect, test } from 'vitest'
import { markReviewed } from './mark-reviewed'
import type { Exam } from '../src/content/schema'

const exam = {
  id: 'f2025-e1',
  questions: [
    { id: 'f2025-e1-q01', status: 'transcribed' },
    { id: 'f2025-e1-q02', status: 'transcribed' },
  ],
} as unknown as Exam

test('flips status for matching ids without mutating the input', () => {
  const { exam: out, missing } = markReviewed(exam, ['f2025-e1-q02'])
  expect(missing).toEqual([])
  expect(out.questions.map((x) => x.status)).toEqual(['transcribed', 'reviewed'])
  expect(exam.questions[1].status).toBe('transcribed')
})

test('reports ids that are not found', () => {
  const { missing } = markReviewed(exam, ['f2025-e1-q01', 'f2025-e1-q99'])
  expect(missing).toEqual(['f2025-e1-q99'])
})
