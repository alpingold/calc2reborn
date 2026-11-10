import fs from 'node:fs'
import path from 'node:path'

// Content pass, step 0: for each exam id, write the questions without their keyed answers, for the
// checker's blind solve. See docs/solution-writing-guide.md and docs/plans/2026-11-10-study-app-2.0.md.
for (const examId of process.argv.slice(2)) {
  const exam = JSON.parse(fs.readFileSync(path.join('content/exams', `${examId}.json`), 'utf8'))
  const dir = path.join('.scratch/solutions', examId)
  fs.mkdirSync(dir, { recursive: true })
  const questions = exam.questions.map((q: { id: string; stem: string; choices: unknown; figures?: string[] }) => ({
    questionId: q.id,
    stem: q.stem,
    choices: q.choices,
    ...(q.figures ? { figures: q.figures.map((f) => path.join('public', f)) } : {}),
  }))
  fs.writeFileSync(path.join(dir, 'questions-no-key.json'), JSON.stringify(questions, null, 2))
  console.log(`${examId}: ${questions.length} questions`)
}
