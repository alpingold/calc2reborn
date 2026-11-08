import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import type { Content } from '../../content'
import type { Choice } from '../../content/schema'
import { useContent, useStore } from '../../storage/context'
import type { Attempt } from '../../storage/types'
import { QuestionView } from '../QuestionView'
import { examTitle, formatPoints, scoreSession } from '../examSession'
import type { ExamSession } from '../examSession'

const noop = () => {}

function rebuild(sessionId: string, attempts: Attempt[], content: Content): ExamSession | null {
  const first = attempts[0]
  if (!first || (first.mode !== 'exam' && first.mode !== 'mock')) return null
  const exam = first.examId ? content.exams.find((e) => e.id === first.examId) : undefined
  const answers: Record<string, Choice['label']> = {}
  for (const a of attempts) answers[a.questionId] = a.chosen
  const questionIds = exam ? exam.questions.map((q) => q.id) : [...new Set(attempts.map((a) => a.questionId))]
  return {
    sessionId,
    kind: first.mode,
    examId: first.examId,
    questionIds,
    answers,
    marked: [],
    startedAt: first.timestamp,
    durationMinutes: exam?.durationMinutes ?? 60,
    ...(attempts.some((a) => a.feedback) ? { feedback: true } : {}),
  }
}

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
        const attempts = await store.listAttempts({ sessionId })
        if (!cancelled) setSession(rebuild(sessionId, attempts, content))
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
      <p>{title}</p>
      {session.feedback && <p>With feedback</p>}
      <p>{`Score: ${score.correct} / ${score.total}`}</p>
      <p>{`Points: ${formatPoints(score.points)} / ${formatPoints(score.maxPoints)}`}</p>
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
                lessonTitle={lesson && `Lesson ${lesson.number}: ${lesson.title}`}
                lessonHref={lesson && `/course/${lesson.id}`}
              />
            </li>
          )
        })}
      </ol>
      <Link to="/exams">Back to exams</Link>
    </section>
  )
}
