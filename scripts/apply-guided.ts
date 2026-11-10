import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { GuidedProblemSchema, type GuidedProblem } from '../src/content/schema'

/** One lesson's guided problems and the problem types each of its flashcards supports. */
export interface GuidedFile {
  lessonId: string
  guided: unknown[]
  cardTypes: Record<string, string[]>
}
interface CardJson {
  id: string
  lessonId: string
  typeIds?: string[]
  [key: string]: unknown
}

// a card supports at most this many problem types
export const MAX_CARD_TYPES = 2

/**
 * Check one lesson's file against the lesson's types and cards. Returns the problems and the cards with
 * their types set. Throws, changing nothing, on anything that does not fit.
 */
/** Every Markdown string of a problem, with where it is. */
function guidedTexts(g: GuidedProblem): [string, string][] {
  return [
    ['stem', g.stem],
    ['takeaway', g.takeaway],
    ...g.steps.flatMap((st, i): [string, string][] => [
      [`step ${i + 1} prompt`, st.prompt],
      [`step ${i + 1} explanation`, st.explanation],
      ...st.choices.flatMap((c): [string, string][] => [
        [`step ${i + 1} choice ${c.label}`, c.text],
        ...(c.note ? [[`step ${i + 1} note ${c.label}`, c.note] as [string, string]] : []),
      ]),
    ]),
  ]
}

/** A fault in how a string marks its mathematics, or null: an unclosed `$`, or `$$` not alone on its line. */
export function mathFault(text: string): string | null {
  const lines = text.split('\n')
  let fences = 0
  let inline = ''
  for (const line of lines) {
    if (line.trim() === '$$') {
      fences++
      continue
    }
    if (line.includes('$$')) return 'display math needs $$ alone on its own line'
    if (fences % 2 === 0) inline += line + '\n'
  }
  if (fences % 2 !== 0) return 'a $$ block is not closed'
  if ((inline.replace(/\\\$/g, '').match(/\$/g) ?? []).length % 2 !== 0) return 'a $ is not closed'
  return null
}

export function applyGuided(
  file: GuidedFile,
  typeIds: Set<string>,
  cards: CardJson[],
): { guided: GuidedProblem[]; cards: CardJson[] } {
  const { lessonId } = file
  if (file.guided.length < 2 || file.guided.length > 3) throw new Error(`${lessonId} needs two or three problems, got ${file.guided.length}`)
  const guided = file.guided.map((raw, i) => {
    const r = GuidedProblemSchema.safeParse(raw)
    if (!r.success) throw new Error(`${lessonId} problem ${i + 1}: ${r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`)
    return r.data as GuidedProblem
  })
  guided.forEach((g, i) => {
    if (g.lessonId !== lessonId) throw new Error(`${g.id} belongs to ${g.lessonId}, not ${lessonId}`)
    if (g.id !== `${lessonId}-g${i + 1}`) throw new Error(`problem ${i + 1} should have the id ${lessonId}-g${i + 1}, not ${g.id}`)
    if (!typeIds.has(g.typeId)) throw new Error(`${g.id}: unknown problem type ${g.typeId}`)
    if (g.figures?.length) throw new Error(`${g.id}: guided problems have no figures`)
    for (const [where, text] of guidedTexts(g)) {
      const fault = mathFault(text)
      if (fault) throw new Error(`${g.id} ${where}: ${fault}`)
    }
    const text = JSON.stringify(g)
    if (/\b(choice|option|answer) [A-D]\b/.test(text)) throw new Error(`${g.id} refers to a choice by its letter`)
  })
  if (new Set(guided.map((g) => g.typeId)).size !== guided.length) throw new Error(`${lessonId}: two problems share a problem type`)

  const cardIds = new Set(cards.map((c) => c.id))
  for (const id of Object.keys(file.cardTypes)) if (!cardIds.has(id)) throw new Error(`${lessonId} has no card ${id}`)
  const outCards = cards.map((c) => {
    const types = file.cardTypes[c.id]
    if (types === undefined) throw new Error(`cardTypes has no entry for ${c.id}`)
    if (types.length > MAX_CARD_TYPES) throw new Error(`${c.id} lists more than ${MAX_CARD_TYPES} types`)
    if (new Set(types).size !== types.length) throw new Error(`${c.id} repeats a type`)
    for (const t of types) if (!typeIds.has(t)) throw new Error(`${c.id}: ${t} is not a problem type of ${lessonId}`)
    const { typeIds: _old, ...rest } = c
    void _old
    return (types.length > 0 ? { ...rest, typeIds: types } : rest) as CardJson
  })
  return { guided, cards: outCards }
}

function main(argv: string[]): void {
  const args = argv.slice(2)
  const check = args.includes('--check')
  const files = args.filter((a) => a !== '--check')
  if (files.length === 0) {
    console.error('usage: pnpm content:guided <file.json> [...] [--check]')
    process.exit(1)
  }
  const lessons = JSON.parse(fs.readFileSync('content/lessons.json', 'utf8')) as { id: string; problemTypes?: { id: string }[] }[]
  let failed = false
  for (const f of files) {
    try {
      const file = JSON.parse(fs.readFileSync(f, 'utf8')) as GuidedFile
      const lesson = lessons.find((l) => l.id === file.lessonId)
      if (!lesson) throw new Error(`unknown lesson ${file.lessonId}`)
      const cardsPath = path.join('content/cards', `${file.lessonId}.json`)
      const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8')) as CardJson[]
      const out = applyGuided(file, new Set((lesson.problemTypes ?? []).map((t) => t.id)), cards)
      const typed = out.cards.filter((c) => c.typeIds).length
      if (check) {
        console.log(`${file.lessonId}: ok, ${out.guided.length} problems, ${typed} of ${cards.length} cards typed`)
        continue
      }
      fs.mkdirSync('content/guided', { recursive: true })
      fs.writeFileSync(path.join('content/guided', `${file.lessonId}.json`), JSON.stringify(out.guided, null, 2) + '\n')
      fs.writeFileSync(cardsPath, JSON.stringify(out.cards, null, 2) + '\n')
      console.log(`${file.lessonId}: ${out.guided.length} problems written, ${typed} of ${cards.length} cards typed`)
    } catch (e) {
      failed = true
      console.error(`${f}: ${(e as Error).message}`)
    }
  }
  if (failed) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv)
