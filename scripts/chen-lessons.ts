import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PAGE = 'https://drjchen1.github.io/chenflix/courses/ma-16200-f23.html'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'lessons.json')

type Unit =
  | 'Vectors'
  | 'Applications of Integration'
  | 'Integration Techniques'
  | 'Sequences and Series'
  | 'Power and Taylor Series'
  | 'Polar'

interface Lesson {
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

const REVIEW_IDS: Record<string, string> = {
  'Exam 1 Review': 'R-exam1',
  'Exam 2 Review': 'R-exam2',
  'Exam 3 Review': 'R-exam3',
  'Final Exam Review, Part 1': 'R-final1',
  'Final Exam Review, Part 2': 'R-final2',
  'Final Exam Review, Part 3': 'R-final3',
}

function unitFor(n: number): Unit {
  if (n <= 4) return 'Vectors'
  if (n <= 10) return 'Applications of Integration'
  if (n <= 18) return 'Integration Techniques'
  if (n <= 26) return 'Sequences and Series'
  if (n <= 32) return 'Power and Taylor Series'
  return 'Polar'
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const strip = (s: string) => s.replace(/<[^>]*>/g, '')

async function main() {
  const res = await fetch(PAGE)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const html = await res.text()

  const existing = new Map<string, Lesson>()
  if (existsSync(OUT)) {
    for (const l of JSON.parse(readFileSync(OUT, 'utf8')) as Lesson[]) existing.set(l.id, l)
  }

  const items = html.split(/<li class="lecture-item">/).slice(1)
  const lessons: Lesson[] = []
  let reviewCount = 0
  let prevLessonId: string | null = null

  for (const raw of items) {
    const item = raw.split('</li>')[0]
    const hl = /<span class="lec-highlight">([^<]*)<\/span>/.exec(item)
    const titleBlock = /<span class="lecture-title">([\s\S]*?)<\/span>\s*(?:<div|$)/.exec(item)
    if (!hl || !titleBlock) throw new Error('Unparseable entry: ' + item.slice(0, 200))
    const label = decode(hl[1])
    if (/Mario Kart/i.test(item) && label === 'Special Feature') continue

    const rowMatch = /<div class="section-row">([\s\S]*?)<\/div>/.exec(item)
    const row = rowMatch ? rowMatch[1] : ''
    const links = [...row.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({
      href: new URL(decode(m[1]), PAGE).href,
      text: decode(m[2]),
    }))
    const videoUrl = links.find((l) => l.text === 'Video')?.href ?? ''
    const notesUrl = links.find((l) => l.text === 'Notes')?.href ?? ''

    const lessonNum = /^Lesson (\d+)$/.exec(label)
    let lesson: Lesson
    if (lessonNum) {
      const number = Number(lessonNum[1])
      const title = decode(strip(titleBlock[1]).replace(label, ''))
      const id = `L${number}`
      lesson = {
        id,
        number,
        title,
        sections: [...title.matchAll(/\b\d{1,2}\.\d+\b/g)].map((m) => m[0]),
        unit: unitFor(number),
        videoUrl,
        notesUrl,
        prerequisites: prevLessonId ? [prevLessonId] : [],
        keyIdeas: '',
        isReview: false,
      }
      prevLessonId = id
    } else {
      const id = REVIEW_IDS[label]
      if (!id) throw new Error('Unknown entry: ' + label)
      reviewCount++
      lesson = {
        id,
        number: 35 + reviewCount,
        title: label,
        sections: [],
        unit: null,
        videoUrl,
        notesUrl,
        prerequisites: [],
        keyIdeas: '',
        isReview: true,
      }
    }
    const old = existing.get(lesson.id)
    if (old) {
      lesson.keyIdeas = old.keyIdeas
      lesson.prerequisites = old.prerequisites
    }
    lessons.push(lesson)
  }

  if (lessons.length !== 41) throw new Error(`Expected 41 entries, got ${lessons.length}`)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(lessons, null, 2) + '\n')
  console.log(`Wrote ${lessons.length} entries to ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
