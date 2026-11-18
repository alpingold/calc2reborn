import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { isPlanned } from '../../content/schema'
import type { Exam, OfficialExam } from '../../content/schema'
import { useContent, useNow, useSettings, useStore } from '../../storage/context'
import { examLabel, examTitle, loadSession, sessionTitle, sessionUrl, timeIsUp } from '../examSession'
import { daysUntil, examScope } from '../../engine/scope'
import type { ResumeState } from '../examSession'
import type { SessionRecord } from '../../storage/types'
import { MOCK_MINUTES } from '../useExamSession'
import { ModeCards } from '../ModeCards'
import type { BeginState, ExamMode } from '../ModeCards'

/** The best correct count per exam among finished sessions. An exam abandoned part-way has no record and no score. */
function bestByExam(records: SessionRecord[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const r of records) {
    if (r.kind !== 'exam' || !r.examId) continue
    best.set(r.examId, Math.max(best.get(r.examId) ?? 0, r.correct))
  }
  return best
}

const SLOTS: OfficialExam['exam'][] = ['1', '2', '3', 'final']
const SLOT_LABEL: Record<OfficialExam['exam'], string> = { '1': 'Exam 1', '2': 'Exam 2', '3': 'Exam 3', final: 'Final' }
type Filter = 'all' | 'untaken' | 'finals'

interface TermRow {
  key: string
  name: string
  papers: Partial<Record<OfficialExam['exam'], OfficialExam>>
}

export function Exams() {
  const store = useStore()
  const content = useContent()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const now = useNow()
  const [inProgress] = useState(loadSession)

  const planned = useMemo(() => content.lessons.filter(isPlanned), [content.lessons])
  const current = settings.currentLessonId ? content.lessonById.get(settings.currentLessonId) : undefined
  const defaultTo = current && isPlanned(current) ? current.id : (planned[planned.length - 1]?.id ?? '')
  // the mock range starts on the exam's lessons while an exam is ahead
  const scope = examScope(settings, content.lessons, now())
  const [from, setFrom] = useState(scope.active ? scope.lessonIds[0] : (planned[0]?.id ?? ''))
  const [to, setTo] = useState(scope.active ? scope.lessonIds[scope.lessonIds.length - 1] : defaultTo)
  const [mode, setMode] = useState<ExamMode>('timed')
  const [changing, setChanging] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  // best correct counts from timed attempts, and from attempts taken with feedback
  const [best, setBest] = useState<{ timed: Map<string, number>; feedback: Map<string, number> } | null>(null)
  const [past, setPast] = useState<SessionRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const records = await store.listSessionRecords()
        if (!cancelled) {
          setPast(records)
          setBest({
            timed: bestByExam(records.filter((r) => !r.feedback)),
            feedback: bestByExam(records.filter((r) => r.feedback)),
          })
        }
      } catch {
        if (!cancelled) setError('Could not load your exam history.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store])

  // one row per term, newest first; content.exams is already in that order
  const terms = useMemo(() => {
    const rows = new Map<string, TermRow>()
    for (const e of content.exams) {
      if (e.unofficial) continue
      const key = `${e.year}-${e.term}`
      const row = rows.get(key) ?? { key, name: `${e.term} ${e.year}`, papers: {} }
      row.papers[e.exam] = e
      rows.set(key, row)
    }
    return [...rows.values()]
  }, [content.exams])
  const officialCount = useMemo(() => content.exams.filter((e) => !e.unofficial).length, [content.exams])
  const extraExams = useMemo(() => content.exams.filter((e) => e.unofficial), [content.exams])

  function onStartMock(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({ from, to })
    navigate(`/exams/mock?${params.toString()}`, { state: { begin: mode } satisfies BeginState })
  }

  // finished sessions the content can still show: a record for a removed exam is left out
  const pastRows = past
    .filter((r) => r.kind === 'mock' || content.exams.some((e) => e.id === r.examId))
    .map((r) => ({
      record: r,
      title: sessionTitle(r, content),
      date: new Date(r.finishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    }))

  /** The best finished score on an exam, timed if there is one; null if it was never finished. */
  function bestOf(exam: Exam): { correct: number; feedback: boolean } | null {
    const timed = best?.timed.get(exam.id)
    if (timed !== undefined) return { correct: timed, feedback: false }
    const withFeedback = best?.feedback.get(exam.id)
    if (withFeedback !== undefined) return { correct: withFeedback, feedback: true }
    return null
  }

  function bestLine(exam: Exam): string {
    if (!best) return ''
    const b = bestOf(exam)
    if (!b) return 'Not taken'
    return `${b.feedback ? 'Best with feedback' : 'Best'}: ${b.correct} of ${exam.questions.length}`
  }

  const slots = filter === 'finals' ? SLOTS.filter((s) => s === 'final') : SLOTS
  const shownTerms = terms.filter((row) =>
    slots.some((s) => {
      const paper = row.papers[s]
      return paper !== undefined && (filter !== 'untaken' || bestOf(paper) === null)
    }),
  )

  const fromLesson = content.lessonById.get(from)
  const toLesson = content.lessonById.get(to)
  const [lo, hi] =
    fromLesson && toLesson ? (fromLesson.number <= toLesson.number ? [fromLesson, toLesson] : [toLesson, fromLesson]) : [undefined, undefined]
  const rangeText = lo && hi ? (lo.id === hi.id ? `Lesson ${lo.number}` : `Lessons ${lo.number} to ${hi.number}`) : ''
  const days = settings.examDate ? daysUntil(settings.examDate, now()) : null
  const scopeFirst = content.lessonById.get(scope.lessonIds[0] ?? '')
  const scopeLast = content.lessonById.get(scope.lessonIds[scope.lessonIds.length - 1] ?? '')
  const lede =
    scope.active && scopeFirst && scopeLast
      ? `Your exam ${days === null ? '' : days === 0 ? 'is today and ' : `is in ${days} ${days === 1 ? 'day' : 'days'} and `}covers ${
          scopeFirst.id === scopeLast.id ? `Lesson ${scopeFirst.number}` : `Lessons ${scopeFirst.number} to ${scopeLast.number}`
        }.`
      : 'A mock exam on the lessons you choose, or any past Purdue paper.'

  const filters: [Filter, string][] = [
    ['all', `All ${officialCount}`],
    ['untaken', 'Not taken'],
    ['finals', 'Finals only'],
  ]

  return (
    <section className="exams">
      <header className="page-head">
        <h2>Exams</h2>
        <p className="page-lede">{lede}</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {inProgress && (
        <p className="note">
          {`In progress: ${sessionTitle(inProgress, content)}${inProgress.feedback ? ' with feedback' : ''}`}
          {!timeIsUp(inProgress, now())
            ? `, ${inProgress.questionIds.filter((id) => inProgress.answers[id]).length} of ${inProgress.questionIds.length} answered. `
            : '. Its time is up; resuming submits it. '}
          <Link to={sessionUrl(inProgress)} state={{ resume: inProgress.sessionId } satisfies ResumeState}>
            Resume
          </Link>
        </p>
      )}
      <div className="split">
        <form className="card card-strong split-main mock-form" onSubmit={onStartMock}>
          <div>
            <p className="eyebrow eyebrow-accent">{scope.active ? 'Recommended' : 'Mock exam'}</p>
            <h3>{`Mock exam on ${rangeText}`}</h3>
            <p className="hint">
              Up to twelve questions from past exams on these lessons, preferring ones you have not seen in your last
              two mocks.
            </p>
          </div>
          <ModeCards value={mode} onChange={setMode} minutes={MOCK_MINUTES} />
          {changing && (
            <div className="range-pickers" id="mock-range">
              <label>
                From
                <select value={from} onChange={(e) => setFrom(e.target.value)}>
                  {planned.map((l) => (
                    <option key={l.id} value={l.id}>
                      {`Lesson ${l.number}: ${l.title}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  {planned.map((l) => (
                    <option key={l.id} value={l.id}>
                      {`Lesson ${l.number}: ${l.title}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="actions">
            <button type="submit" className="primary button-large">
              Start mock exam
            </button>
            <button type="button" className="link-button" aria-expanded={changing} aria-controls="mock-range" onClick={() => setChanging((c) => !c)}>
              Change the lessons
            </button>
          </div>
        </form>
        <section className="card split-side attempts">
          <h3 className="label">Your attempts</h3>
          {pastRows.length === 0 ? (
            <p className="hint">Nothing finished yet. A finished exam or mock is listed here with its score.</p>
          ) : (
            <ul className="row-list" aria-label="Your attempts">
              {pastRows.map(({ record, title, date }) => (
                <li key={record.sessionId}>
                  <Link to={`/results/${record.sessionId}`}>
                    <span>
                      {title} <span className="row-sub">{`${date} · ${record.feedback ? 'with feedback' : 'timed'}`}</span>
                    </span>
                    <span className="row-value">{`${record.correct} of ${record.total}`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Timed scores are the ones to trust.</p>
        </section>
      </div>

      <section className="papers">
        <div className="papers-head">
          <h3>Past Purdue papers</h3>
          {terms.length > 0 && (
            <div role="group" aria-label="Show" className="filters">
              {filters.map(([id, label]) => (
                <button key={id} type="button" className="filter" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {terms.length === 0 ? (
          <p>No past exams yet</p>
        ) : shownTerms.length === 0 ? (
          <p className="card">{filter === 'untaken' ? 'You have taken every paper.' : 'No papers to show.'}</p>
        ) : (
          <div className="card table-scroll">
            <table className="papers-table">
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  {slots.map((s) => (
                    <th key={s} scope="col">
                      {SLOT_LABEL[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownTerms.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.name}</th>
                    {slots.map((s) => {
                      const paper = row.papers[s]
                      if (!paper) {
                        return (
                          <td key={s} className="paper-none">
                            No paper
                          </td>
                        )
                      }
                      const b = bestOf(paper)
                      if (b && filter === 'untaken') {
                        return (
                          <td key={s} className="paper-none">
                            Taken
                          </td>
                        )
                      }
                      return (
                        <td key={s}>
                          {b ? (
                            <Link to={`/exams/${paper.id}`} className="paper-taken">
                              {`${b.correct} of ${paper.questions.length}`}
                              <span className="visually-hidden">{`, your best on ${examTitle(paper)}`}</span>
                              {b.feedback && (
                                <>
                                  {' '}
                                  <span className="row-sub">with feedback</span>
                                </>
                              )}
                            </Link>
                          ) : (
                            <Link to={`/exams/${paper.id}`} className="paper-start">
                              Start <span className="visually-hidden">{examTitle(paper)}</span>
                            </Link>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {terms.length > 0 && <p className="hint">A score means you have taken that paper; open it to retake it. Your attempts above open the results.</p>}
      </section>

      {extraExams.length > 0 && (
        <section className="extra-exams">
          <h3>Extra practice</h3>
          <p className="hint">
            Written for this app in the style of past exams. These are not Purdue exams, and their answers were checked
            independently but may contain errors.
          </p>
          <ul className="card row-list">
            {extraExams.map((exam) => (
              <li key={exam.id}>
                <span className="row-plain">
                  <Link to={`/exams/${exam.id}`}>{examLabel(exam)}</Link>
                  <span className="row-value row-value-quiet">{bestLine(exam)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
