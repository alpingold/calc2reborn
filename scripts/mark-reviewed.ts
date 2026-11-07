import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Exam } from '../src/content/schema'

export function markReviewed(exam: Exam, ids: string[]): { exam: Exam; missing: string[] } {
  const wanted = new Set(ids)
  const found = new Set<string>()
  const questions = exam.questions.map((q) => {
    if (!wanted.has(q.id)) return q
    found.add(q.id)
    return { ...q, status: 'reviewed' as const }
  })
  return { exam: { ...exam, questions }, missing: ids.filter((id) => !found.has(id)) }
}

function main(ids: string[]): number {
  if (ids.length === 0) {
    console.error('usage: pnpm tsx scripts/mark-reviewed.ts <questionId...>')
    return 1
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'exams')
  const byExam = new Map<string, string[]>()
  for (const id of ids) {
    const m = /^(.+)-q\d+$/.exec(id)
    if (!m) {
      console.error(`Bad question id: ${id}`)
      return 1
    }
    byExam.set(m[1], [...(byExam.get(m[1]) ?? []), id])
  }
  for (const [examId, qids] of byExam) {
    const file = join(root, `${examId}.json`)
    let exam: Exam
    try {
      exam = JSON.parse(readFileSync(file, 'utf8')) as Exam
    } catch {
      console.error(`Cannot read ${file}`)
      return 1
    }
    const res = markReviewed(exam, qids)
    if (res.missing.length > 0) {
      console.error(`Not found in ${examId}: ${res.missing.join(', ')}`)
      return 1
    }
    writeFileSync(file, JSON.stringify(res.exam, null, 2) + '\n')
    console.log(`${examId}: marked ${qids.length} reviewed (${qids.join(', ')})`)
  }
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)))
}
