import { z } from 'zod'

export const UNITS = [
  'Vectors',
  'Applications of Integration',
  'Integration Techniques',
  'Sequences and Series',
  'Power and Taylor Series',
  'Polar',
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
  figures?: string[]
  lessonIds: string[]
  tags?: string[]
  solution?: string
  status: 'transcribed' | 'reviewed'
  sourcePage?: number
}
export interface Exam {
  id: string
  term: 'Fall' | 'Spring'
  year: number
  exam: '1' | '2' | '3' | 'final'
  examUrl: string
  answersUrl?: string
  solutionsUrl?: string
  durationMinutes: number
  questions: Question[]
}

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
  })
  .superRefine((l, ctx) => {
    if (l.unit === null && !l.isReview) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'unit may be null only for reviews' })
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

export const ExamSchema = z.object({
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
