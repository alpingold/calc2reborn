import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { lessonLabel } from '../../content/schema'
import { useContent, useStore } from '../../storage/context'
import { sessionsFromAttempts } from '../../storage/backfill'
import { QuestionView } from '../QuestionView'
import { examTitle, formatPoints, scoreSession, sessionFromRecord, sessionTitle } from '../examSession'
import type { ExamSession } from '../examSession'
import { practiseTypeLink } from '../practiseLink'
import { CheckIcon, CrossIcon } from '../shell'

const noop = () => {}

type Verdict = 'right' | 'wrong' | 'blank'
const VERDICT_WORD: Record<Verdict, string> = { right: 'Correct', wrong: 'Missed', blank: 'Not answered' }

// Route component: a different session id remounts the view so state never carries over.
export function ExamResults() {
  const { sessionId = '' } = useParams()
  return <ResultsView key={sessionId} sessionId={sessionId} />
}

function ResultsView({ sessionId }: { sessionId: string }) {
  const location = useLocation()
  const store = useStore()
  const content = useContent()

  const fromState = (location.state as { session?: ExamSession } | null)?.session
  const given = fromState && fromState.sessionId === sessionId ? fromState : undefined
  const [session, setSession] = useState<ExamSession | null | undefined>(given)
  const [error, setError] = useState<string | null>(null)
  // the questions opened to show their stem, choices and solution
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [onlyMissed, setOnlyMissed] = useState(false)

  useEffect(() => {
    if (given) return
    let cancelled = false
    ;(async () => {
      try {
        const [records, attempts] = await Promise.all([store.listSessionRecords(), store.listAttempts({ sessionId })])
        // a session with attempts but no record (saved by an older version) is rebuilt from the attempts
        const record = records.find((r) => r.sessionId === sessionId) ?? sessionsFromAttempts(attempts, content)[0]
        if (!cancelled) setSession(record ? sessionFromRecord(record, attempts, content) : null)
      } catch {
        if (!cancelled) setError('Could not load results. Try again.')
      }
    })()
    return () => {
      cancelled = true
    }
    // runs once per mount; the route remounts this view when the session id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (session === undefined || session === null) {
    return (
      <section>
        <h2>Results</h2>
        {error && <p role="alert">{error}</p>}
        {session === null && <p>No results for this session</p>}
        <Link to="/exams">Back to exams</Link>
      </section>
    )
  }

  const score = scoreSession(session, content)
  const exam = session.examId ? content.exams.find((e) => e.id === session.examId) : undefined
  const title = session.kind === 'mock' ? sessionTitle(session, content) : exam ? examTitle(exam) : 'Exam'

  const rows = session.questionIds.flatMap((id, i) => {
    const question = content.questionById.get(id)
    if (!question) return []
    const chosen = session.answers[id]
    const verdict: Verdict = !chosen ? 'blank' : chosen === question.answer ? 'right' : 'wrong'
    const types = (question.typeIds ?? []).flatMap((t) => content.typeById.get(t) ?? [])
    return [{ id, number: i + 1, question, chosen, verdict, types }]
  })
  const missed = rows.filter((r) => r.verdict !== 'right')
  const blank = rows.filter((r) => r.verdict === 'blank').length

  // what was missed, by problem type; a question with no type counts toward its lesson instead
  const groups = new Map<string, { name: string; tag?: string; to: string; missed: number; total: number }>()
  for (const r of rows) {
    const lesson = r.question.lessonIds[0] ? content.lessonById.get(r.question.lessonIds[0]) : undefined
    const keys =
      r.types.length > 0
        ? r.types.map((t) => {
            const l = content.lessonById.get(t.lessonId)
            return { key: `type:${t.id}`, name: t.name, tag: l && !l.isExtra ? `L${l.number}` : undefined, to: practiseTypeLink(t.id) }
          })
        : lesson
          ? [{ key: `lesson:${lesson.id}`, name: lessonLabel(lesson), tag: undefined, to: `/practice?lesson=${lesson.id}` }]
          : []
    for (const k of keys) {
      const g = groups.get(k.key) ?? { name: k.name, tag: k.tag, to: k.to, missed: 0, total: 0 }
      g.total++
      if (r.verdict !== 'right') g.missed++
      groups.set(k.key, g)
    }
  }
  const missedGroups = [...groups.values()].filter((g) => g.missed > 0).sort((a, b) => b.missed - a.missed)

  const shown = onlyMissed ? missed : rows
  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section className="results">
      <header className="page-head">
        <p className="eyebrow">
          <span className="results-title">{title}</span>
          {session.feedback && (
            <>
              {' · '}
              <span className="results-tag">With feedback</span>
            </>
          )}
        </p>
        <h2>Results</h2>
      </header>
      <div className="split">
        <div className="card card-strong split-main results-summary">
          <p className="results-score">{`Score: ${score.correct} / ${score.total}`}</p>
          <p className="results-points">{`Points: ${formatPoints(score.points)} / ${formatPoints(score.maxPoints)}`}</p>
          <p className="results-counts">
            {[`${score.correct} correct`, `${missed.length - blank} missed`, blank > 0 ? `${blank} left blank` : null].filter(Boolean).join(' · ')}
          </p>
          <p className="actions">
            <Link to="/exams" className="button">
              Back to exams
            </Link>
          </p>
        </div>
        <section className="card split-side results-breakdown">
          <h3 className="label">What you missed</h3>
          {missedGroups.length === 0 ? (
            <p className="hint">{missed.length === 0 ? 'Nothing. Every question was right.' : 'The questions you missed are listed below.'}</p>
          ) : (
            <>
              <ul className="row-list">
                {missedGroups.map((g) => (
                  <li key={g.to}>
                    <Link to={g.to} aria-label={`Practise ${g.name}, missed ${g.missed} of ${g.total}`}>
                      <span>
                        {g.name} {g.tag && <span className="row-tag">{g.tag}</span>}
                      </span>
                      <span className="row-value row-value-weak">{`missed ${g.missed} of ${g.total}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="hint">Choose one to practise more questions like it.</p>
            </>
          )}
        </section>
      </div>
      <section className="results-questions">
        <div className="results-questions-head">
          <h3>Questions</h3>
          {missed.length > 0 && missed.length < rows.length && (
            <button type="button" className="filter" aria-pressed={onlyMissed} onClick={() => setOnlyMissed((v) => !v)}>
              Show only missed
            </button>
          )}
        </div>
        <ol className="card results-list">
          {shown.map((r) => {
            const isOpen = open.has(r.id)
            const lesson = r.question.lessonIds[0] ? content.lessonById.get(r.question.lessonIds[0]) : undefined
            const nameId = `result-q-${r.number}`
            const bodyId = `result-body-${r.number}`
            return (
              <li key={r.id} aria-labelledby={nameId} className="results-item">
                <h4>
                  <button type="button" className="results-row" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggle(r.id)}>
                    <span id={nameId} className="results-q">{`Question ${r.number}`}</span>{' '}
                    <span className={`results-verdict ${r.verdict}`}>
                      {r.verdict === 'right' ? <CheckIcon /> : r.verdict === 'wrong' ? <CrossIcon /> : null}
                      {VERDICT_WORD[r.verdict]}
                    </span>{' '}
                    <span className="results-type">{r.types.map((t) => t.name).join('; ')}</span>
                    <svg aria-hidden="true" className="results-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6l5 5 5-5" />
                    </svg>
                  </button>
                </h4>
                {isOpen && (
                  <div id={bodyId} className="results-body">
                    <QuestionView
                      question={r.question}
                      mode="deferred"
                      chosen={r.chosen}
                      onChoose={noop}
                      revealed
                      lessonTitle={lesson && lessonLabel(lesson)}
                      lessonHref={lesson && `/course/${lesson.id}`}
                      similarHref={r.question.typeIds?.length ? `/practice?types=${r.question.typeIds.join(',')}&n=10` : undefined}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </section>
    </section>
  )
}
