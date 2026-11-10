import fs from 'node:fs'
import path from 'node:path'

// Writes .scratch/guided/<lessonId>/brief.json: everything a writer or checker needs for one lesson.

interface LessonJson {
  id: string
  number: number
  title: string
  keyIdeas: string
  problemTypes?: { id: string; name: string }[]
}
interface QuestionJson {
  id: string
  stem: string
  lessonIds: string[]
  typeIds?: string[]
  solution?: string
}

const lessonId = process.argv[2]
if (!lessonId) {
  console.error('usage: pnpm content:guided-prepare <lessonId>')
  process.exit(1)
}
const lessons = JSON.parse(fs.readFileSync('content/lessons.json', 'utf8')) as LessonJson[]
const lesson = lessons.find((l) => l.id === lessonId)
if (!lesson || !lesson.problemTypes?.length) {
  console.error(`${lessonId} is not a lesson with problem types`)
  process.exit(1)
}
const questions: QuestionJson[] = []
for (const f of fs.readdirSync('content/exams').filter((f) => f.endsWith('.json'))) {
  const exam = JSON.parse(fs.readFileSync(path.join('content/exams', f), 'utf8')) as { questions: QuestionJson[] }
  questions.push(...exam.questions.filter((q) => q.lessonIds.includes(lessonId)))
}
const cardsFile = path.join('content/cards', `${lessonId}.json`)
const cards = fs.existsSync(cardsFile)
  ? (JSON.parse(fs.readFileSync(cardsFile, 'utf8')) as { id: string; front: string; back: string }[])
  : []
const brief = {
  lessonId,
  title: `Lesson ${lesson.number}: ${lesson.title}`,
  keyIdeas: lesson.keyIdeas,
  problemTypes: lesson.problemTypes.map((t) => ({
    ...t,
    examQuestions: questions.filter((q) => q.typeIds?.includes(t.id)).length,
  })),
  examQuestions: questions.map((q) => ({ id: q.id, typeIds: (q.typeIds ?? []).filter((t) => t.startsWith(`${lessonId}-`)), stem: q.stem, solution: q.solution ?? '' })),
  cards: cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
}
const dir = path.join('.scratch/guided', lessonId)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief, null, 2) + '\n')
console.log(`${lessonId}: ${brief.problemTypes.length} types, ${brief.examQuestions.length} exam questions, ${brief.cards.length} cards`)
