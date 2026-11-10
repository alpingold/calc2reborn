import { useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { lessonLabel } from '../../content/schema'
import { useContent, useNow } from '../../storage/context'
import { QuestionView } from '../QuestionView'
import { examTitle, remainingSeconds, sessionTitle, sessionUrl } from '../examSession'
import type { ResumeState } from '../examSession'
import { MOCK_MINUTES, useExamSession } from '../useExamSession'

function formatClock(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Route component: every navigation remounts the session view, so a Resume link to the same URL
// starts over from the saved session and state never carries over between exams.
export function TakeExam({ mode = 'exam' }: { mode?: 'exam' | 'mock' }) {
  const { examId } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const resume = (location.state as Partial<ResumeState> | null)?.resume
  const key = `${mode === 'mock' ? `mock:${from}:${to}` : `exam:${examId}`}:${location.key}`
  return (
    <ExamSessionView
      key={key}
      mode={mode}
      examId={examId}
      from={from}
      to={to}
      resumeId={typeof resume === 'string' ? resume : undefined}
    />
  )
}

function ExamSessionView(props: {
  mode: 'exam' | 'mock'
  examId?: string
  from: string | null
  to: string | null
  resumeId?: string
}) {
  const { mode } = props
  const content = useContent()
  const now = useNow()
  const { status, session, conflict, exam, range, clock, untimed, error, begin, discardConflict, choose, check, goTo, toggleMark, submit } =
    useExamSession(props)
  // the start screen's choice of feedback after each answer
  const [feedback, setFeedback] = useState(false)

  function discardAndStart() {
    if (!conflict) return
    const title = sessionTitle(conflict, content)
    if (!window.confirm(`Discard your answers to ${title}? This cannot be undone.`)) return
    discardConflict()
  }

  function onSubmit() {
    void submit(false, (unanswered) => window.confirm(`You have ${unanswered} unanswered questions. Submit anyway?`))
  }

  const heading = mode === 'mock' ? 'Mock exam' : exam ? examTitle(exam) : 'Exam'

  function mockRangeLabel(): string {
    const a = range?.from ? content.lessonById.get(range.from) : undefined
    const b = range?.to ? content.lessonById.get(range.to) : undefined
    if (!a || !b) return 'Mock exam'
    return a.id === b.id ? `Lesson ${a.number}` : `Lessons ${a.number} to ${b.number}`
  }
  const errorLine = error && <p role="alert">{error}</p>

  if (status === 'conflict' && conflict) {
    const title = sessionTitle(conflict, content)
    const left = remainingSeconds(conflict, now())
    const answered = conflict.questionIds.filter((id) => conflict.answers[id]).length
    const resumeState: ResumeState = { resume: conflict.sessionId }
    return (
      <section>
        <h2>{heading}</h2>
        {errorLine}
        <p>
          {conflict.feedback
            ? `You have ${title} in progress with feedback, ${answered} of ${conflict.questionIds.length} answered.`
            : left > 0
              ? `You have ${title} in progress, ${answered} of ${conflict.questionIds.length} answered, with ${formatClock(left)} left.`
              : `${title} ran out of time before it was submitted. Resuming submits it.`}
        </p>
        <p className="exam-controls">
          <Link to={sessionUrl(conflict)} state={resumeState}>
            Resume
          </Link>
          <button type="button" onClick={discardAndStart}>
            Discard and start this one
          </button>
        </p>
      </section>
    )
  }
  if (status === 'intro') {
    const summary =
      mode === 'exam' && exam
        ? `${exam.questions.length} questions, ${exam.durationMinutes} minutes`
        : `${mockRangeLabel()}, ${MOCK_MINUTES} minutes`
    return (
      <section className="panel exam-intro">
        <h2>{heading}</h2>
        {errorLine}
        <p className="exam-intro-summary">{summary}</p>
        {exam?.unofficial && (
          <p className="panel-hint">Written for this app in the style of past exams. This is not a Purdue exam.</p>
        )}
        <label className="exam-intro-option">
          <input type="checkbox" checked={feedback} onChange={(e) => setFeedback(e.target.checked)} />{' '}
          Show feedback after each answer (untimed)
        </label>
        <p className="exam-intro-hint">
          {feedback
            ? 'Check each answer to see whether it is right and read the solution. Checked answers lock, and there is no time limit.'
            : 'A timed exam like the real one. Answers and solutions appear after you submit.'}
        </p>
        <p className="exam-controls">
          <button type="button" className="primary" onClick={() => void begin(feedback)}>
            Start
          </button>
          <Link to="/exams">Back to exams</Link>
        </p>
      </section>
    )
  }
  if (status === 'notfound' || status === 'empty') {
    return (
      <section>
        <h2>{heading}</h2>
        <p>{status === 'notfound' ? 'Exam not found' : 'No questions available for that range'}</p>
        <Link to="/exams">Back to exams</Link>
      </section>
    )
  }
  if (status === 'loading' || !session) {
    return (
      <section>
        <h2>{heading}</h2>
        {errorLine}
      </section>
    )
  }

  const total = session.questionIds.length
  const index = Math.min(Math.max(session.current ?? 0, 0), total - 1)
  const questionId = session.questionIds[index]
  const question = content.questionById.get(questionId)
  const isMarked = session.marked.includes(questionId)
  const isChecked = untimed && (session.checked ?? []).includes(questionId)
  const lesson = question?.lessonIds[0] ? content.lessonById.get(question.lessonIds[0]) : undefined
  const answeredCount = session.questionIds.filter((id) => session.answers[id]).length

  return (
    <section className="exam">
      <header className="exam-bar">
        <h2>{heading}</h2>
        <div className="exam-clock">
          <span className="exam-clock-label">{untimed ? 'Elapsed' : 'Time left'}</span>
          <p
            className={`exam-timer${!untimed && clock <= 300 ? ' low' : ''}`}
            role="timer"
            aria-label={untimed ? 'Time elapsed' : 'Time remaining'}
          >
            {formatClock(clock)}
          </p>
        </div>
      </header>
      {errorLine}
      <h3>{`Question ${index + 1} of ${total}`}</h3>
      {question ? (
        untimed ? (
          <QuestionView
            key={question.id}
            question={question}
            mode="immediate"
            chosen={session.answers[questionId]}
            onChoose={choose}
            onSubmit={check}
            submitLabel="Check"
            revealed={isChecked}
            lessonTitle={lesson && lessonLabel(lesson)}
            lessonHref={lesson && `/course/${lesson.id}`}
          />
        ) : (
          <QuestionView key={question.id} question={question} mode="deferred" chosen={session.answers[questionId]} onChoose={choose} />
        )
      ) : (
        <p>This question is no longer available</p>
      )}
      <div className="exam-controls exam-actions">
        <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)}>
          Prev
        </button>
        <button type="button" disabled={index === total - 1} onClick={() => goTo(index + 1)}>
          Next
        </button>
        <button type="button" onClick={toggleMark}>
          {isMarked ? 'Unmark' : 'Mark for review'}
        </button>
        <button type="button" className="exam-submit" onClick={onSubmit}>
          Submit
        </button>
      </div>
      <div className="exam-map">
        <p className="exam-map-head">
          <span>{`${answeredCount} of ${total} answered`}</span>
          {session.marked.length > 0 && <span>{`${session.marked.length} marked for review`}</span>}
        </p>
        <nav className="exam-nav" aria-label="Questions">
          {session.questionIds.map((id, i) => {
            const classes = [session.answers[id] ? 'answered' : '', session.marked.includes(id) ? 'marked' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={id}
                type="button"
                className={classes || undefined}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => goTo(i)}
              >
                {i + 1}
              </button>
            )
          })}
        </nav>
        <ul className="exam-legend" aria-hidden="true">
          <li>
            <span className="swatch answered" /> Answered
          </li>
          <li>
            <span className="swatch marked" /> Marked for review
          </li>
        </ul>
      </div>
    </section>
  )
}
