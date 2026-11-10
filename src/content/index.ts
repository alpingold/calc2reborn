import type { ConceptCard, Exam, Lesson, ProblemType, Question } from './schema'

export interface Content {
  lessons: Lesson[]
  cards: ConceptCard[]
  exams: Exam[]
  questions: Question[]
  lessonById: Map<string, Lesson>
  cardById: Map<string, ConceptCard>
  questionById: Map<string, Question>
  cardsByLesson: Map<string, ConceptCard[]>
  questionsByLesson: Map<string, Question[]>
  examByQuestionId: Map<string, Exam>
  /** every problem type, with the lesson it belongs to */
  typeById: Map<string, ProblemType & { lessonId: string }>
  questionsByType: Map<string, Question[]>
  cardsByType: Map<string, ConceptCard[]>
}

const TERM_ORDER = { Fall: 0, Spring: 1 } as const
const EXAM_ORDER = { '1': 0, '2': 1, '3': 2, final: 3 } as const

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export function buildContent(lessons: Lesson[], cards: ConceptCard[], exams: Exam[]): Content {
  const sortedLessons = [...lessons].sort((a, b) => a.number - b.number)
  // official exams newest first, then unofficial practice exams by id
  const sortedExams = [...exams].sort((a, b) => {
    if (a.unofficial || b.unofficial) {
      if (a.unofficial && b.unofficial) return a.id.localeCompare(b.id)
      return a.unofficial ? 1 : -1
    }
    return b.year - a.year || TERM_ORDER[a.term] - TERM_ORDER[b.term] || EXAM_ORDER[a.exam] - EXAM_ORDER[b.exam]
  })
  const questions = sortedExams.flatMap((e) => e.questions)

  const typeById = new Map<string, ProblemType & { lessonId: string }>()
  for (const l of sortedLessons) {
    for (const t of l.problemTypes ?? []) typeById.set(t.id, { ...t, lessonId: l.id })
  }

  // a type id that no lesson defines is left out of the type maps, so stale tags never surface
  const cardsByLesson = new Map<string, ConceptCard[]>()
  const cardsByType = new Map<string, ConceptCard[]>()
  for (const c of cards) {
    pushTo(cardsByLesson, c.lessonId, c)
    for (const tid of c.typeIds ?? []) if (typeById.has(tid)) pushTo(cardsByType, tid, c)
  }

  const questionsByType = new Map<string, Question[]>()
  const questionsByLesson = new Map<string, Question[]>()
  const examByQuestionId = new Map<string, Exam>()
  for (const e of sortedExams) {
    for (const q of e.questions) {
      examByQuestionId.set(q.id, e)
      for (const lid of q.lessonIds) pushTo(questionsByLesson, lid, q)
      for (const tid of new Set(q.typeIds ?? [])) if (typeById.has(tid)) pushTo(questionsByType, tid, q)
    }
  }

  return {
    lessons: sortedLessons,
    cards,
    exams: sortedExams,
    questions,
    lessonById: new Map(sortedLessons.map((l) => [l.id, l])),
    cardById: new Map(cards.map((c) => [c.id, c])),
    questionById: new Map(questions.map((q) => [q.id, q])),
    cardsByLesson,
    questionsByLesson,
    examByQuestionId,
    typeById,
    questionsByType,
    cardsByType,
  }
}
