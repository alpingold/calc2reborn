import { Link } from 'react-router'
import type { Content } from '../content'
import type { Mastery } from '../engine/mastery'
import { daysUntil, rangeEnds } from '../engine/scope'
import type { SessionRecord, Settings } from '../storage/types'
import { TypeTiles } from './TypeTiles'

function examLine(days: number): string {
  if (days < 0) return 'Exam has passed'
  if (days === 0) return 'Exam is today'
  return `${days} ${days === 1 ? 'day' : 'days'} until the exam`
}

/**
 * How ready the student is for the exam in their settings: the countdown, each exam lesson's problem
 * types, and the latest timed mock on exactly the exam's lessons. `mastery` is by problem type.
 */
export function ReadinessPanel({
  settings,
  content,
  mastery,
  records,
  now,
}: {
  settings: Settings
  content: Content
  mastery: Map<string, Mastery>
  /** newest first */
  records: SessionRecord[]
  now: Date
}) {
  const ends = rangeEnds(content.lessons, settings.examLessonIds)
  const rows = settings.examLessonIds
    .map((id) => content.lessonById.get(id))
    .filter((l) => l !== undefined && (l.problemTypes?.length ?? 0) > 0)
    .map((l) => l!)
    .sort((a, b) => a.number - b.number)
  const all = rows.flatMap((l) => l.problemTypes ?? [])
  const tested = all.filter((t) => (mastery.get(t.id)?.score ?? null) !== null).length
  const mock = ends
    ? records.find((r) => r.kind === 'mock' && !r.feedback && r.from === ends.from && r.to === ends.to)
    : undefined
  const mockLink = ends ? `/exams/mock?${new URLSearchParams(ends).toString()}` : '/exams'
  return (
    <aside className="exam-countdown" aria-label="Next exam">
      {settings.examDate && <p className="countdown-line">{examLine(daysUntil(settings.examDate, now))}</p>}
      {rows.length > 0 && (
        <>
          <h3>Problem types on the exam</h3>
          <ul className="readiness-rows">
            {rows.map((l) => (
              <li key={l.id}>
                <Link to={`/course/${l.id}`} title={l.title}>{`L${l.number}`}</Link>
                <TypeTiles types={l.problemTypes ?? []} mastery={mastery} />
              </li>
            ))}
          </ul>
          <p className="readiness-count">{`${tested} of ${all.length} problem types tested`}</p>
        </>
      )}
      {ends && (
        <p className="readiness-mock">
          {mock
            ? `Latest timed mock: ${mock.correct} of ${mock.total} on ${new Date(mock.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : 'No timed mock on these lessons yet'}
        </p>
      )}
      <Link to={mockLink}>Take a mock exam</Link>
    </aside>
  )
}
