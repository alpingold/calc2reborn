export const ARCHIVE_BASE = 'https://www.math.purdue.edu/academic/courses/'
export const ARCHIVE_URL = `${ARCHIVE_BASE}oldexams.php?course=MA16200`
export const MIN_YEAR = 2016

export interface ManifestEntry {
  examId: string
  term: 'Fall' | 'Spring'
  year: number
  exam: string
  examUrl: string
  answersUrl?: string
  solutionsUrl?: string
}

export type FileKind = 'exam' | 'answers' | 'solutions'

const FILE_RE = /^(?:(ans|sol)-)?16200(e\d|fe)-([fs])(\d{4})\.pdf$/i

export function examIdFromFile(name: string): { examId: string; kind: FileKind } | null {
  const m = FILE_RE.exec(name)
  if (!m) return null
  const [, prefix, ex, t, year] = m
  const exam = ex.toLowerCase() === 'fe' ? 'final' : ex.toLowerCase()
  const kind: FileKind = !prefix ? 'exam' : prefix.toLowerCase() === 'ans' ? 'answers' : 'solutions'
  return { examId: `${t.toLowerCase()}${year}-${exam}`, kind }
}

const examOrder = (e: string) => (e === 'final' ? 99 : Number(e))

export function parseArchive(html: string): ManifestEntry[] {
  const byId = new Map<string, ManifestEntry>()
  for (const m of html.matchAll(/href=["']([^"']*past-exams\/([^"'/]+\.pdf))["']/gi)) {
    const parsed = examIdFromFile(m[2])
    if (!parsed) continue
    const year = Number(/-[fs](\d{4})\./i.exec(m[2])![1])
    if (year < MIN_YEAR) continue
    const url = new URL(m[1], ARCHIVE_BASE).href
    const [season, exam] = parsed.examId.split('-')
    let entry = byId.get(parsed.examId)
    if (!entry) {
      entry = {
        examId: parsed.examId,
        term: season.startsWith('f') ? 'Fall' : 'Spring',
        year,
        exam: exam.replace(/^e/, ''),
        examUrl: '',
      }
      byId.set(parsed.examId, entry)
    }
    if (parsed.kind === 'exam') entry.examUrl = url
    else if (parsed.kind === 'answers') entry.answersUrl = url
    else entry.solutionsUrl = url
  }
  return [...byId.values()]
    .filter((e) => e.examUrl)
    .sort(
      (a, b) =>
        b.year - a.year ||
        (a.term === b.term ? 0 : a.term === 'Fall' ? -1 : 1) ||
        examOrder(a.exam) - examOrder(b.exam),
    )
}
