import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { applySolutions, formatExam } from './apply-solutions'

const known = new Set(['L1-a', 'L1-b', 'L2-a'])
const exam = () => ({
  id: 'e',
  durationMinutes: 60,
  questions: [
    { id: 'e-q01', number: 1, answer: 'A', lessonIds: ['L1'], status: 'reviewed' },
    { id: 'e-q02', number: 2, answer: 'B', lessonIds: ['L1', 'L2'], solution: 'Kept as written.', status: 'reviewed' },
  ],
})

describe('applySolutions', () => {
  test('sets the solution and types on the named questions and leaves the rest alone', () => {
    const out = applySolutions(exam(), [{ questionId: 'e-q01', solution: ' Use the formula. ', typeIds: ['L1-a'] }], known)
    expect(out.questions[0]).toMatchObject({ solution: 'Use the formula.', typeIds: ['L1-a'] })
    expect(out.questions[1]).toEqual(exam().questions[1])
  })
  test('places typeIds after lessonIds and the new solution after them', () => {
    const out = applySolutions(exam(), [{ questionId: 'e-q01', solution: 'S', typeIds: ['L1-a'] }], known)
    expect(Object.keys(out.questions[0])).toEqual(['id', 'number', 'answer', 'lessonIds', 'typeIds', 'solution', 'status'])
    const second = applySolutions(exam(), [{ questionId: 'e-q02', solution: 'S', typeIds: ['L1-a'] }], known)
    expect(Object.keys(second.questions[1])).toEqual(['id', 'number', 'answer', 'lessonIds', 'typeIds', 'solution', 'status'])
  })
  test('keeps a solution that is already there and still sets the types', () => {
    const out = applySolutions(exam(), [{ questionId: 'e-q02', solution: 'A new one.', typeIds: ['L1-b', 'L2-a'] }], known)
    expect(out.questions[1]).toMatchObject({ solution: 'Kept as written.', typeIds: ['L1-b', 'L2-a'] })
  })
  test.each([
    ['a question the exam lacks', [{ questionId: 'e-q09', solution: 'S', typeIds: ['L1-a'] }], 'has no question e-q09'],
    ['a type the taxonomy does not list', [{ questionId: 'e-q01', solution: 'S', typeIds: ['L1-zzz'] }], 'unknown problem type L1-zzz'],
    ['a type from another lesson', [{ questionId: 'e-q01', solution: 'S', typeIds: ['L2-a'] }], 'not from one of its lessons'],
    ['no types', [{ questionId: 'e-q01', solution: 'S', typeIds: [] }], 'one or two types'],
    ['three types', [{ questionId: 'e-q02', solution: 'S', typeIds: ['L1-a', 'L1-b', 'L2-a'] }], 'one or two types'],
    ['a repeated type', [{ questionId: 'e-q01', solution: 'S', typeIds: ['L1-a', 'L1-a'] }], 'repeats a type'],
    ['an empty solution', [{ questionId: 'e-q01', solution: '  ', typeIds: ['L1-a'] }], 'empty solution'],
    [
      'two records for one question',
      [
        { questionId: 'e-q01', solution: 'S', typeIds: ['L1-a'] },
        { questionId: 'e-q01', solution: 'T', typeIds: ['L1-b'] },
      ],
      'Two records for e-q01',
    ],
  ])('rejects %s', (_name, records, message) => {
    expect(() => applySolutions(exam(), records, known)).toThrow(message)
  })
})

test('every exam file is already in the format the script writes, so merging causes no stray changes', () => {
  const dir = path.resolve('content/exams')
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    expect(formatExam(JSON.parse(text)), f).toBe(text)
    expect(formatExam(applySolutions(JSON.parse(text), [], known)), f).toBe(text)
  }
})
