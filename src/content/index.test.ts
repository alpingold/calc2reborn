import { expect, test } from 'vitest'
import { buildContent } from './index'
import type { Exam, Question } from './schema'
import { fixtureCard, fixtureLesson, fixtureTypes } from '../test/fixtures'

function q(id: string, lessonIds: string[], typeIds?: string[]): Question {
  return {
    id,
    number: 1,
    points: 8,
    stem: id,
    choices: [
      { label: 'A', text: 'a' },
      { label: 'B', text: 'b' },
    ],
    answer: 'A',
    lessonIds,
    typeIds,
    status: 'reviewed',
  }
}
const lessons = [
  fixtureLesson(1, { problemTypes: fixtureTypes('L1') }),
  fixtureLesson(2, { problemTypes: fixtureTypes('L2') }),
  fixtureLesson(3),
]
const exam: Exam = {
  id: 'e',
  term: 'Fall',
  year: 2025,
  exam: '1',
  examUrl: '',
  durationMinutes: 60,
  questions: [q('q1', ['L1'], ['L1-a']), q('q2', ['L1', 'L2'], ['L1-a', 'L2-b']), q('q3', ['L1']), q('q4', ['L1'], ['L1-gone'])],
}
const cards = [{ ...fixtureCard('c1', 'L1'), typeIds: ['L1-a', 'L1-b'] }, fixtureCard('c2', 'L1'), { ...fixtureCard('c3', 'L2'), typeIds: ['L9-x'] }]
const content = buildContent(lessons, cards, [exam])

test('typeById names every type with its lesson', () => {
  expect([...content.typeById.keys()]).toEqual(['L1-a', 'L1-b', 'L2-a', 'L2-b'])
  expect(content.typeById.get('L2-b')).toEqual({ id: 'L2-b', name: 'L2 type B', lessonId: 'L2' })
})

test('questionsByType groups questions, and a question with two types sits under both', () => {
  expect(content.questionsByType.get('L1-a')!.map((x) => x.id)).toEqual(['q1', 'q2'])
  expect(content.questionsByType.get('L2-b')!.map((x) => x.id)).toEqual(['q2'])
  expect(content.questionsByType.get('L1-b')).toBeUndefined()
})

test('cardsByType groups cards by the types they support', () => {
  expect(content.cardsByType.get('L1-a')!.map((c) => c.id)).toEqual(['c1'])
  expect(content.cardsByType.get('L1-b')!.map((c) => c.id)).toEqual(['c1'])
})

test('a type id no lesson defines is left out, and untagged items are simply absent', () => {
  expect(content.questionsByType.has('L1-gone')).toBe(false)
  expect(content.cardsByType.has('L9-x')).toBe(false)
  expect([...content.questionsByType.values()].flat().map((x) => x.id)).not.toContain('q3')
  // the questions themselves are all still there
  expect(content.questions).toHaveLength(4)
})

test('content with no types at all has empty type maps', () => {
  const plain = buildContent([fixtureLesson(1)], [fixtureCard('c1', 'L1')], [])
  expect(plain.typeById.size).toBe(0)
  expect(plain.questionsByType.size).toBe(0)
  expect(plain.cardsByType.size).toBe(0)
})
