import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** A drafted solution and problem types for one question, as the content pass writes them. */
export interface SolutionRecord {
  questionId: string
  solution: string
  typeIds: string[]
}

interface QuestionJson {
  id: string
  lessonIds: string[]
  typeIds?: string[]
  solution?: string
  [key: string]: unknown
}
interface ExamJson {
  id: string
  questions: QuestionJson[]
  [key: string]: unknown
}

/** The lesson a problem type belongs to: everything before the first hyphen of its id. */
function lessonOfType(typeId: string): string {
  return typeId.slice(0, typeId.indexOf('-'))
}

/**
 * Merge records into an exam. A solution already present is kept as it is; the types are always set.
 * Throws, changing nothing, on a record for a question the exam lacks, a repeated record, a type the
 * taxonomy does not list, or a type from a lesson the question is not tagged to.
 */
export function applySolutions(exam: ExamJson, records: SolutionRecord[], knownTypeIds: Set<string>): ExamJson {
  const byId = new Map<string, SolutionRecord>()
  for (const r of records) {
    if (byId.has(r.questionId)) throw new Error(`Two records for ${r.questionId}`)
    byId.set(r.questionId, r)
  }
  const ids = new Set(exam.questions.map((q) => q.id))
  for (const id of byId.keys()) if (!ids.has(id)) throw new Error(`${exam.id} has no question ${id}`)

  const questions = exam.questions.map((q) => {
    const r = byId.get(q.id)
    if (!r) return q
    if (r.typeIds.length < 1 || r.typeIds.length > 2) throw new Error(`${q.id} needs one or two types, got ${r.typeIds.length}`)
    if (new Set(r.typeIds).size !== r.typeIds.length) throw new Error(`${q.id} repeats a type`)
    for (const t of r.typeIds) {
      if (!knownTypeIds.has(t)) throw new Error(`${q.id}: unknown problem type ${t}`)
      if (!q.lessonIds.includes(lessonOfType(t))) throw new Error(`${q.id}: type ${t} is not from one of its lessons (${q.lessonIds.join(', ')})`)
    }
    const solution = q.solution?.trim() ? q.solution : r.solution.trim()
    if (!solution) throw new Error(`${q.id} has an empty solution`)
    // keep the file's key order: typeIds after lessonIds, solution where it was or after typeIds
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(q)) {
      if (k === 'typeIds') continue
      out[k] = k === 'solution' ? solution : v
      if (k === 'lessonIds') {
        out.typeIds = r.typeIds
        if (!('solution' in q)) out.solution = solution
      }
    }
    return out as QuestionJson
  })
  return { ...exam, questions }
}

/** The text an exam file holds: two-space JSON and a final newline. */
export function formatExam(exam: ExamJson): string {
  return JSON.stringify(exam, null, 2) + '\n'
}

function main(argv: string[]): void {
  const files = argv.slice(2)
  if (files.length === 0) {
    console.error('usage: pnpm content:solutions <records.json> [...]')
    process.exit(1)
  }
  const lessons = JSON.parse(fs.readFileSync('content/lessons.json', 'utf8')) as { problemTypes?: { id: string }[] }[]
  const known = new Set(lessons.flatMap((l) => (l.problemTypes ?? []).map((t) => t.id)))
  let failed = false
  for (const file of files) {
    try {
      const records = JSON.parse(fs.readFileSync(file, 'utf8')) as SolutionRecord[]
      const byExam = new Map<string, SolutionRecord[]>()
      for (const r of records) {
        const examId = r.questionId.replace(/-q\d+$/, '')
        byExam.set(examId, [...(byExam.get(examId) ?? []), r])
      }
      for (const [examId, recs] of byExam) {
        const target = path.join('content/exams', `${examId}.json`)
        const exam = JSON.parse(fs.readFileSync(target, 'utf8')) as ExamJson
        fs.writeFileSync(target, formatExam(applySolutions(exam, recs, known)))
        console.log(`${examId}: ${recs.length} questions updated`)
      }
    } catch (e) {
      failed = true
      console.error(`${file}: ${(e as Error).message}`)
    }
  }
  if (failed) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv)
