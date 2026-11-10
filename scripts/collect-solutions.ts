import fs from 'node:fs'
import path from 'node:path'

// Content pass, last step: combine a drafter's records with the checker's grades. Writes
// .scratch/solutions/<examId>/final.json (records safe to merge with `pnpm content:solutions`) and
// escalations.json (questions held back for the owner, and lesson-tag notes that do not block).

interface Draft {
  questionId: string
  solution: string
  typeIds: string[]
  flag?: string
}
interface Grade {
  questionId: string
  verdict: 'pass' | 'fix' | 'reject'
  quality?: number
  reason?: string
  fixedSolution?: string
  fixedTypeIds?: string[]
  /** set when the question must not be merged without the owner looking at it */
  escalate?: string | null
  /** a suggestion about the question's lesson tags; does not block the merge */
  lessonNote?: string | null
}

let failed = false
for (const examId of process.argv.slice(2)) {
  const dir = path.join('.scratch/solutions', examId)
  const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as T
  try {
    const exam = JSON.parse(fs.readFileSync(path.join('content/exams', `${examId}.json`), 'utf8')) as {
      questions: { id: string; answer: string }[]
    }
    const drafts = new Map(read<Draft[]>('draft.json').map((d) => [d.questionId, d]))
    const grades = new Map(read<{ grades: Grade[] }>('grades.json').grades.map((g) => [g.questionId, g]))
    const blind = new Map(read<{ questionId: string; answer: string }[]>('blind.json').map((b) => [b.questionId, b.answer]))

    const final: Draft[] = []
    const held: { questionId: string; why: string }[] = []
    const notes: { questionId: string; note: string }[] = []
    for (const q of exam.questions) {
      const d = drafts.get(q.id)
      const g = grades.get(q.id)
      if (!d || !g) {
        held.push({ questionId: q.id, why: !d ? 'no draft' : 'not graded' })
        continue
      }
      if (g.lessonNote) notes.push({ questionId: q.id, note: g.lessonNote })
      if (g.escalate) held.push({ questionId: q.id, why: g.escalate })
      else if (g.verdict === 'reject') held.push({ questionId: q.id, why: `rejected: ${g.reason ?? 'no reason given'}` })
      else if (blind.get(q.id) !== q.answer) held.push({ questionId: q.id, why: `blind answer ${blind.get(q.id)} differs from key ${q.answer} and was not resolved` })
      else {
        final.push({
          questionId: q.id,
          solution: g.verdict === 'fix' && g.fixedSolution ? g.fixedSolution : d.solution,
          typeIds: g.verdict === 'fix' && g.fixedTypeIds?.length ? g.fixedTypeIds : d.typeIds,
        })
      }
    }
    fs.writeFileSync(path.join(dir, 'final.json'), JSON.stringify(final, null, 2))
    fs.writeFileSync(path.join(dir, 'escalations.json'), JSON.stringify({ examId, held, notes }, null, 2))
    const counts = { pass: 0, fix: 0, reject: 0 }
    for (const g of grades.values()) counts[g.verdict]++
    console.log(`${examId}: ${final.length}/${exam.questions.length} to merge, ${held.length} held, ${notes.length} notes; pass ${counts.pass} fix ${counts.fix} reject ${counts.reject}`)
  } catch (e) {
    failed = true
    console.error(`${examId}: ${(e as Error).message}`)
  }
}
if (failed) process.exit(1)
