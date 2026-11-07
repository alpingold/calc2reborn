import { z } from 'zod'
import {
  ConceptCardSchema,
  ExamSchema,
  LessonSchema,
  type ConceptCard,
  type Exam,
  type Lesson,
  type Question,
} from './schema'

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
  const sortedExams = [...exams].sort(
    (a, b) =>
      b.year - a.year || TERM_ORDER[a.term] - TERM_ORDER[b.term] || EXAM_ORDER[a.exam] - EXAM_ORDER[b.exam],
  )
  const questions = sortedExams.flatMap((e) => e.questions)

  const cardsByLesson = new Map<string, ConceptCard[]>()
  for (const c of cards) pushTo(cardsByLesson, c.lessonId, c)

  const questionsByLesson = new Map<string, Question[]>()
  const examByQuestionId = new Map<string, Exam>()
  for (const e of sortedExams) {
    for (const q of e.questions) {
      examByQuestionId.set(q.id, e)
      for (const lid of q.lessonIds) pushTo(questionsByLesson, lid, q)
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
  }
}

function parse<T>(schema: z.ZodType<T>, mods: Record<string, unknown>, many: boolean): T[] {
  const out: T[] = []
  const entries = Object.keys(mods).sort()
  for (const path of entries) {
    const m = mods[path] as { default?: unknown }
    const raw = m && typeof m === 'object' && 'default' in m ? m.default : m
    const items = many ? (raw as unknown[]) : [raw]
    items.forEach((item, i) => {
      const r = schema.safeParse(item)
      if (!r.success) throw new Error(`Invalid content in ${path}[${i}]: ${r.error.message}`)
      out.push(r.data)
    })
  }
  return out
}

export function loadContent(): Content {
  const lessonMods = import.meta.glob('../../content/lessons.json', { eager: true })
  const cardMods = import.meta.glob('../../content/cards/*.json', { eager: true })
  const examMods = import.meta.glob('../../content/exams/*.json', { eager: true })
  return buildContent(
    parse(LessonSchema, lessonMods, true) as Lesson[],
    parse(ConceptCardSchema, cardMods, true) as ConceptCard[],
    parse(ExamSchema, examMods, false) as Exam[],
  )
}
