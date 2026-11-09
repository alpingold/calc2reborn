import { z } from 'zod'

export const UNITS = [
  'Vectors',
  'Applications of Integration',
  'Integration Techniques',
  'Sequences and Series',
  'Power and Taylor Series',
  'Polar',
  // exam topics outside Dr. Chen's lessons; only extras use it
  'Other topics',
] as const
export type Unit = (typeof UNITS)[number]

/** Choice labels in order; a question uses the first n of them (2 <= n <= 10). */
export const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const
export type ChoiceLabel = (typeof CHOICE_LABELS)[number]

export interface Lesson {
  id: string
  number: number
  title: string
  sections: string[]
  unit: Unit | null
  videoUrl: string
  notesUrl: string
  prerequisites: string[]
  keyIdeas: string
  isReview: boolean
  /** An exam topic outside Dr. Chen's lessons: no video or notes, and kept out of mastery and ranges. */
  isExtra?: boolean
}

/** A lesson in Dr. Chen's planned sequence: not an exam review and not an extra topic. */
export function isPlanned(l: Lesson): boolean {
  return !l.isReview && !l.isExtra
}

/** How a question's lesson is named in links: "Lesson 19: ..." for a lesson, the title for an extra. */
export function lessonLabel(l: Lesson): string {
  return l.isExtra ? l.title : `Lesson ${l.number}: ${l.title}`
}

export interface ConceptCard {
  id: string
  lessonId: string
  front: string
  back: string
  tags?: string[]
}
export interface Choice {
  label: ChoiceLabel
  text: string
}
export interface Question {
  id: string
  number: number
  points: number
  stem: string
  choices: Choice[]
  answer: Choice['label']
  /**
   * Where `answer` came from. Absent means the official key; `derived` was worked out for an exam with no
   * key; `written` belongs to a question written for this app.
   */
  answerSource?: 'key' | 'derived' | 'written'
  figures?: string[]
  lessonIds: string[]
  tags?: string[]
  solution?: string
  status: 'transcribed' | 'reviewed'
  sourcePage?: number
}
/** A past Purdue exam from the department's archive. */
export interface OfficialExam {
  id: string
  term: 'Fall' | 'Spring'
  year: number
  exam: '1' | '2' | '3' | 'final'
  examUrl: string
  answersUrl?: string
  solutionsUrl?: string
  durationMinutes: number
  questions: Question[]
  unofficial?: undefined
}
/** A practice exam written for this app in the style of past exams, not from Purdue. */
export interface UnofficialExam {
  id: string
  title: string
  unofficial: true
  durationMinutes: number
  questions: Question[]
}
export type Exam = OfficialExam | UnofficialExam

export const LessonSchema = z
  .object({
    id: z.string().min(1),
    number: z.number().int().positive(),
    title: z.string().min(1),
    sections: z.array(z.string()),
    unit: z.enum(UNITS).nullable(),
    videoUrl: z.string(),
    notesUrl: z.string(),
    prerequisites: z.array(z.string()),
    keyIdeas: z.string(),
    isReview: z.boolean(),
    isExtra: z.boolean().optional(),
  })
  .superRefine((l, ctx) => {
    if (l.unit === null && !l.isReview) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'unit may be null only for reviews' })
    }
    if (l.isExtra) {
      if (l.isReview) ctx.addIssue({ code: 'custom', path: ['isReview'], message: 'an extra topic is not a review' })
      if (l.unit !== 'Other topics') {
        ctx.addIssue({ code: 'custom', path: ['unit'], message: 'an extra topic belongs to Other topics' })
      }
      if (l.videoUrl || l.notesUrl) {
        ctx.addIssue({ code: 'custom', path: ['videoUrl'], message: 'an extra topic has no video or notes' })
      }
    } else if (l.unit === 'Other topics') {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'only an extra topic belongs to Other topics' })
    }
  })

export const ConceptCardSchema = z.object({
  id: z.string().min(1),
  lessonId: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()).optional(),
})

const ChoiceSchema = z.object({ label: z.enum(CHOICE_LABELS), text: z.string() })

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    number: z.number().int().positive(),
    points: z.number().positive(),
    stem: z.string(),
    choices: z.array(ChoiceSchema).min(2).max(10),
    answer: z.enum(CHOICE_LABELS),
    answerSource: z.enum(['key', 'derived', 'written']).optional(),
    figures: z.array(z.string()).optional(),
    lessonIds: z.array(z.string()),
    tags: z.array(z.string()).optional(),
    solution: z.string().optional(),
    status: z.enum(['transcribed', 'reviewed']),
    sourcePage: z.number().int().positive().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.choices.some((c, i) => c.label !== CHOICE_LABELS[i])) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'choices must be labeled consecutively from A' })
    }
    if (!q.choices.some((c) => c.label === q.answer)) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: 'answer must be one of the choice labels' })
    }
  })

const OfficialExamSchema = z.object({
  id: z.string().min(1),
  term: z.enum(['Fall', 'Spring']),
  year: z.number().int(),
  exam: z.enum(['1', '2', '3', 'final']),
  examUrl: z.string(),
  answersUrl: z.string().optional(),
  solutionsUrl: z.string().optional(),
  durationMinutes: z.number().positive(),
  questions: z.array(QuestionSchema),
})
const UnofficialExamSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  unofficial: z.literal(true),
  durationMinutes: z.number().positive(),
  questions: z.array(QuestionSchema),
})
export const ExamSchema = z.union([OfficialExamSchema, UnofficialExamSchema])
