import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { lessonLabel } from '../../content/schema'
import { useContent, useStore } from '../../storage/context'
import { sessionsFromAttempts } from '../../storage/backfill'
import { QuestionView } from '../QuestionView'
import { examTitle, formatPoints, scoreSession, sessionFromRecord } from '../examSession'
import type { ExamSession } from '../examSession'

const noop = () => {}

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
  const title = session.kind === 'mock' ? 'Mock exam' : exam ? examTitle(exam) : 'Exam'

  return (
    <section className="results">
      <h2>Results</h2>
      <div className="results-summary">
        <p className="results-title">{title}</p>
        {session.feedback && <p className="results-tag">With feedback</p>}
        <p className="results-score">{`Score: ${score.correct} / ${score.total}`}</p>
        <p className="results-points">{`Points: ${formatPoints(score.points)} / ${formatPoints(score.maxPoints)}`}</p>
      </div>
      <ol className="results-list">
        {session.questionIds.map((id, i) => {
          const question = content.questionById.get(id)
          if (!question) return null
          const chosen = session.answers[id]
          const lesson = question.lessonIds[0] ? content.lessonById.get(question.lessonIds[0]) : undefined
          const headingId = `result-q-${i + 1}`
          return (
            <li key={id} aria-labelledby={headingId}>
              <h3 id={headingId}>{`Question ${i + 1}`}</h3>
              {!chosen && <p>Not answered</p>}
              <QuestionView
                question={question}
                mode="deferred"
                chosen={chosen}
                onChoose={noop}
                revealed
                lessonTitle={lesson && lessonLabel(lesson)}
                lessonHref={lesson && `/course/${lesson.id}`}
                similarHref={question.typeIds?.length ? `/practice?types=${question.typeIds.join(',')}&n=10` : undefined}
              />
            </li>
          )
        })}
      </ol>
      <Link to="/exams">Back to exams</Link>
    </section>
  )
}
