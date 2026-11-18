import { Link } from 'react-router'
import type { Content } from '../content'
import type { Mastery } from '../engine/mastery'
import { daysUntil, rangeEnds } from '../engine/scope'
import { weakestTypes } from '../engine/today'
import type { SessionRecord, Settings } from '../storage/types'
import { practiseTypeLink } from './practiseLink'
import { MASTERY_WORDS, masteryState, tallyText } from './record'
import type { MasteryState, Tally } from './record'

/** How many named types "Weakest right now" lists. */
const WEAKEST_SHOWN = 3
const ORDER: MasteryState[] = ['strong', 'ok', 'weak', 'untested']

function examDay(examDate: string): string {
  const [y, m, d] = examDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

/**
 * How ready the student is for the exam in their settings: the countdown, one bar of the exam's problem
 * types by mastery, the weakest of them by name, and the latest timed mock on exactly the exam's
 * lessons. `mastery` and `tallies` are by problem type.
 */
export function ReadinessPanel({
  settings,
  content,
  mastery,
  tallies,
  records,
  now,
}: {
  settings: Settings
  content: Content
  mastery: Map<string, Mastery>
  tallies: Map<string, Tally>
  /** newest first */
  records: SessionRecord[]
  now: Date
}) {
  const ends = rangeEnds(content.lessons, settings.examLessonIds)
  const lessons = settings.examLessonIds
    .map((id) => content.lessonById.get(id))
    .filter((l) => l !== undefined)
    .sort((a, b) => a.number - b.number)
  const all = lessons.flatMap((l) => l.problemTypes ?? [])
  const counts: Record<MasteryState, number> = { strong: 0, ok: 0, weak: 0, untested: 0 }
  for (const t of all) counts[masteryState(mastery.get(t.id)?.score ?? null)]++
  const tested = all.length - counts.untested
  const summary = ORDER.map((s) => `${counts[s]} ${MASTERY_WORDS[s].toLowerCase()}`)

  // tested types that are not yet strong, weakest first
  const current = settings.currentLessonId ? content.lessonById.get(settings.currentLessonId) : undefined
  const weakest = weakestTypes({
    mastery,
    scopeTypeIds: all.map((t) => t.id),
    currentLessonTypeIds: (current?.problemTypes ?? []).map((t) => t.id),
    count: all.length,
  })
    .filter((id) => {
      const state = masteryState(mastery.get(id)?.score ?? null)
      return state === 'weak' || state === 'ok'
    })
    .slice(0, WEAKEST_SHOWN)

  const mock = ends
    ? records.find((r) => r.kind === 'mock' && !r.feedback && r.from === ends.from && r.to === ends.to)
    : undefined
  const mockLink = ends ? `/exams/mock?${new URLSearchParams(ends).toString()}` : '/exams'
  const from = ends ? content.lessonById.get(ends.from) : undefined
  const to = ends ? content.lessonById.get(ends.to) : undefined
  const range = from && to ? (from.id === to.id ? `Lesson ${from.number}` : `Lessons ${from.number} to ${to.number}`) : null
  const days = settings.examDate ? daysUntil(settings.examDate, now) : null

  return (
    <aside className="card readiness" aria-label="Next exam">
      <div className="readiness-head">
        <div>
          <p className="eyebrow">Your next exam</p>
          <p className="readiness-when">{[settings.examDate && examDay(settings.examDate), range].filter(Boolean).join(' · ')}</p>
        </div>
        {days !== null && days > 0 && (
          <p className="countdown">
            <span className="countdown-num">{days}</span>{' '}
            <span className="countdown-unit">{`${days === 1 ? 'day' : 'days'} until the exam`}</span>
          </p>
        )}
        {days !== null && days <= 0 && <p className="countdown-line">{days === 0 ? 'Exam is today' : 'Exam has passed'}</p>}
      </div>
      {all.length > 0 && (
        <div className="readiness-types">
          <p className="readiness-count">
            <strong>{`${all.length} problem ${all.length === 1 ? 'type' : 'types'} on this exam`}</strong>
            <span>{`${tested} tested`}</span>
          </p>
          <div className="segbar" role="img" aria-label={summary.join(', ')}>
            {ORDER.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className={`mastery-${s}`} style={{ flexGrow: counts[s] }} />
            ))}
          </div>
          <ul className="legend" aria-hidden="true">
            {ORDER.map((s, i) => (
              <li key={s}>
                <span className={`swatch mastery-${s}`} /> {s === 'untested' ? `${summary[i]} yet` : summary[i]}
              </li>
            ))}
          </ul>
        </div>
      )}
      {weakest.length > 0 && (
        <div className="readiness-weakest">
          <h3 className="label">Weakest right now</h3>
          <ul className="row-list">
            {weakest.map((id) => {
              const type = content.typeById.get(id)
              const lesson = type ? content.lessonById.get(type.lessonId) : undefined
              if (!type) return null
              return (
                <li key={id}>
                  <Link to={practiseTypeLink(id)} aria-label={`Practise ${type.name}, ${tallyText(tallies.get(id))} right`}>
                    <span>
                      {type.name} {lesson && !lesson.isExtra && <span className="row-tag">{`L${lesson.number}`}</span>}
                    </span>
                    <span className="row-value row-value-weak">{tallyText(tallies.get(id))}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div className="readiness-mock">
        {ends && (
          <p>
            {mock ? (
              <>
                Latest timed mock: <strong>{`${mock.correct} of ${mock.total}`}</strong>
                {` on ${new Date(mock.finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
              </>
            ) : (
              'No timed mock on these lessons yet'
            )}
          </p>
        )}
        <Link to={mockLink} className="button button-wide">
          Take a timed mock exam
        </Link>
      </div>
    </aside>
  )
}
