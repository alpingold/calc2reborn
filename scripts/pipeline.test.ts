import { expect, test } from 'vitest'
import { examIdFromFile, parseArchive } from './pipeline'

const html = `
<a href="past-exams/16200e1-f2025.pdf">Exam 1</a>
<a href="past-exams/ans-16200e1-f2025.pdf">Answers</a>
<a href="past-exams/16200fe-s2024.pdf">Final</a>
<a href="past-exams/sol-16200e2-s2008.pdf">Solutions</a>
`

test('parseArchive groups files by exam and drops years before 2016', () => {
  const out = parseArchive(html)
  expect(out.map((e) => e.examId)).toEqual(['f2025-e1', 's2024-final'])
  expect(out[0]).toMatchObject({ term: 'Fall', year: 2025, exam: '1' })
  expect(out[0].examUrl).toBe(
    'https://www.math.purdue.edu/academic/courses/past-exams/16200e1-f2025.pdf',
  )
  expect(out[0].answersUrl).toContain('ans-16200e1-f2025.pdf')
  expect(out[1].answersUrl).toBeUndefined()
})

test('examIdFromFile parses exam, answers, and solutions names', () => {
  expect(examIdFromFile('16200fe-s2024.pdf')).toEqual({ examId: 's2024-final', kind: 'exam' })
  expect(examIdFromFile('ans-16200e3-f2019.pdf')).toEqual({ examId: 'f2019-e3', kind: 'answers' })
  expect(examIdFromFile('sol-16200e2-s2008.pdf')).toEqual({ examId: 's2008-e2', kind: 'solutions' })
  expect(examIdFromFile('readme.pdf')).toBeNull()
})
