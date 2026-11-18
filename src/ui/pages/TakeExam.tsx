import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router'
import { lessonLabel } from '../../content/schema'
import { useContent, useNow } from '../../storage/context'
import { QuestionView } from '../QuestionView'
import { examTitle, remainingSeconds, sessionTitle, sessionUrl } from '../examSession'
import type { ResumeState } from '../examSession'
import { MOCK_MINUTES, useExamSession } from '../useExamSession'
import { ModeCards } from '../ModeCards'
import type { BeginState, ExamMode } from '../ModeCards'
import { ExitIcon, ProgressStrip, SessionBar } from '../shell'
import type { SegmentState } from '../shell'

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
  const navigationType = useNavigationType()
  const state = location.state as Partial<ResumeState & BeginState> | null
  const resume = state?.resume
  // Start on the Exams page already chose how to take the mock. Only arriving by that click counts:
  // the state stays in the history entry, and coming Back to it later must not start an exam unasked.
  const begin = navigationType === 'PUSH' && (state?.begin === 'timed' || state?.begin === 'feedback') ? state.begin : undefined
  const key = `${mode === 'mock' ? `mock:${from}:${to}` : `exam:${examId}`}:${location.key}`
  return (
    <ExamSessionView
      key={key}
      mode={mode}
      examId={examId}
      from={from}
      to={to}
      resumeId={typeof resume === 'string' ? resume : undefined}
      autoBegin={begin}
    />
  )
}

function ExamSessionView(props: {
  mode: 'exam' | 'mock'
  examId?: string
  from: string | null
  to: string | null
  resumeId?: string
  /** begin as soon as the start screen would show, in this mode */
  autoBegin?: ExamMode
}) {
  const { mode } = props
  const content = useContent()
  const now = useNow()
  const navigate = useNavigate()
  const { status, session, conflict, exam, range, clock, untimed, error, begin, discardConflict, choose, check, goTo, toggleMark, submit } =
    useExamSession(props)
  // the start screen's choice between a timed exam and feedback after each answer
  const [how, setHow] = useState<ExamMode>('timed')
  // a start asked for on the Exams page, until it has been acted on
  const [auto, setAuto] = useState(props.autoBegin)
  const autoDone = useRef(false)
  useEffect(() => {
    if (status !== 'intro' || !auto || autoDone.current) return
    autoDone.current = true
    setAuto(undefined)
    void begin(auto === 'feedback')
  }, [status, auto, begin])

  function leave() {
    if (!window.confirm('Leave this exam? Your answers are saved and the clock keeps running. You can resume it from Exams until the time runs out.')) return
    navigate('/exams')
  }

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
      <section className="card exam-intro">
        <h2>{heading}</h2>
        {errorLine}
        <p>
          {conflict.feedback
            ? `You have ${title} in progress with feedback, ${answered} of ${conflict.questionIds.length} answered.`
            : left > 0
              ? `You have ${title} in progress, ${answered} of ${conflict.questionIds.length} answered, with ${formatClock(left)} left.`
              : `${title} ran out of time before it was submitted. Resuming submits it.`}
        </p>
        <p className="actions">
          <Link to={sessionUrl(conflict)} state={resumeState} className="button primary">
            Resume
          </Link>
          <button type="button" onClick={discardAndStart}>
            Discard and start this one
          </button>
        </p>
      </section>
    )
  }
  if (status === 'intro' && !auto) {
    const summary =
      mode === 'exam' && exam
        ? `${exam.questions.length} questions, ${exam.durationMinutes} minutes`
        : `${mockRangeLabel()}, ${MOCK_MINUTES} minutes`
    return (
      <section className="card card-strong exam-intro">
        <div>
          <h2>{heading}</h2>
          {errorLine}
          <p className="exam-intro-summary">{summary}</p>
          {exam?.unofficial && <p className="hint">Written for this app in the style of past exams. This is not a Purdue exam.</p>}
        </div>
        <ModeCards value={how} onChange={setHow} minutes={mode === 'exam' && exam ? exam.durationMinutes : MOCK_MINUTES} />
        <p className="actions">
          <button type="button" className="primary button-large" onClick={() => void begin(how === 'feedback')}>
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

  const checked = session.checked ?? []
  // feedback mode: each checked question right or wrong, the rest still to do
  const segments: SegmentState[] = session.questionIds.map((id) =>
    untimed && checked.includes(id) ? (session.answers[id] === content.questionById.get(id)?.answer ? 'right' : 'wrong') : 'todo',
  )
  const rightSoFar = segments.filter((s) => s === 'right').length
  const wrongSoFar = segments.filter((s) => s === 'wrong').length
  const clockView = (
    <div className="exam-clock">
      <span className="exam-clock-label">{untimed ? 'Elapsed' : 'Time left'}</span>
      <p className={`exam-timer${!untimed && clock <= 300 ? ' low' : ''}`} role="timer" aria-label={untimed ? 'Time elapsed' : 'Time remaining'}>
        {formatClock(clock)}
      </p>
    </div>
  )

  return (
    <section className="exam">
      <SessionBar
        exit={
          untimed ? (
            // nothing is lost by leaving an untimed session: it waits under Exams
            <Link to="/exams" className="exit-button">
              <ExitIcon />
              Save and exit
            </Link>
          ) : (
            // a button that asks first: a timed exam offers no link that would walk away from it unnoticed
            <button type="button" className="exit-button" onClick={leave}>
              <ExitIcon />
              Leave exam
            </button>
          )
        }
        title={mode === 'mock' ? mockRangeLabel() === 'Mock exam' ? 'Mock exam' : `Mock exam · ${mockRangeLabel()}` : heading}
        progress={`${answeredCount} of ${total} answered`}
        aside={clockView}
      >
        {untimed && (
          <ProgressStrip
            segments={segments}
            current={index}
            label={`Question ${index + 1} of ${total}: ${rightSoFar} right and ${wrongSoFar} wrong so far`}
          />
        )}
      </SessionBar>
      <h2 className="visually-hidden">{heading}</h2>
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
      <div className="exam-map card">
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
        <ul className="legend" aria-hidden="true">
          <li>
            <span className="swatch answered" /> Answered
          </li>
          <li>
            <span className="swatch marked" /> Marked for review
          </li>
        </ul>
      </div>
      <div className="action-bar">
        <div className="action-bar-inner exam-actions">
          <div className="exam-steps">
            <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)}>
              Prev
            </button>
            <button type="button" disabled={index === total - 1} onClick={() => goTo(index + 1)}>
              Next
            </button>
            <button type="button" onClick={toggleMark}>
              {isMarked ? 'Unmark' : 'Mark for review'}
            </button>
          </div>
          <button type="button" className="primary exam-submit" onClick={onSubmit}>
            Submit
          </button>
        </div>
      </div>
    </section>
  )
}
