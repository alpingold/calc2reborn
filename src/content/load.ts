import { z } from 'zod'
import { buildContent } from './index'
import type { Content } from './index'
import {
  ConceptCardSchema,
  ExamSchema,
  GuidedProblemSchema,
  LessonSchema,
  type ConceptCard,
  type Exam,
  type GuidedProblem,
  type Lesson,
} from './schema'

// This module pulls every content file into the bundle. The app imports it dynamically, so the content
// ships as its own chunk, apart from the code.

function parse<T>(schema: z.ZodType<T>, mods: Record<string, unknown>, many: boolean, validate: boolean): T[] {
  const out: T[] = []
  const entries = Object.keys(mods).sort()
  for (const path of entries) {
    const m = mods[path] as { default?: unknown }
    const raw = m && typeof m === 'object' && 'default' in m ? m.default : m
    const items = many ? (raw as unknown[]) : [raw]
    items.forEach((item, i) => {
      if (!validate) {
        out.push(item as T)
        return
      }
      const r = schema.safeParse(item)
      if (!r.success) throw new Error(`Invalid content in ${path}[${i}]: ${r.error.message}`)
      out.push(r.data)
    })
  }
  return out
}

/**
 * All lessons, cards, exams and guided problems. The schemas are checked in development and by the test suite, which
 * gates every deploy; a production page load trusts the files and skips the check.
 */
export function loadContent(validate: boolean = import.meta.env.DEV): Content {
  const lessonMods = import.meta.glob('../../content/lessons.json', { eager: true })
  const cardMods = import.meta.glob('../../content/cards/*.json', { eager: true })
  const examMods = import.meta.glob('../../content/exams/*.json', { eager: true })
  const guidedMods = import.meta.glob('../../content/guided/*.json', { eager: true })
  return buildContent(
    parse(LessonSchema, lessonMods, true, validate) as Lesson[],
    parse(ConceptCardSchema, cardMods, true, validate) as ConceptCard[],
    parse(ExamSchema, examMods, false, validate) as Exam[],
    parse(GuidedProblemSchema, guidedMods, true, validate) as GuidedProblem[],
  )
}
