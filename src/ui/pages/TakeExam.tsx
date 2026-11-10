import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { isPlanned, lessonLabel } from '../../content/schema'
import type { Choice } from '../../content/schema'
import { sampleMockExam } from '../../engine/mock'
import { pullForward } from '../../engine/queue'
import { useContent, useNow, useRng, useSettings, useStore } from '../../storage/context'
import type { Attempt } from '../../storage/types'
import { QuestionView } from '../QuestionView'
import {
  clearSession,
  elapsedSeconds,
  examTitle,
  finishSession,
  loadSession,
  matchesRequest,
  remainingSeconds,
  rememberMockQuestions,
  saveSession,
  sessionTitle,
  sessionUrl,
  timeIsUp,
} from '../examSession'
import type { ExamSession, ResumeState, SessionRequest } from '../examSession'
import { newId } from '../../ids'

const MOCK_MINUTES = 60

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

type Status = 'loading' | 'intro' | 'ready' | 'notfound' | 'empty' | 'conflict'

function ExamSessionView({
  mode,
  examId,
  from,
  to,
  resumeId,
}: {
  mode: 'exam' | 'mock'
  examId?: string
  from: string | null
  to: string | null
  resumeId?: string
}) {
  const store = useStore()
  const content = useContent()
  const { settings } = useSettings()
  const now = useNow()
  const rng = useRng()
  const navigate = useNavigate()

  const [status, setStatus] = useState<Status>('loading')
  const [session, setSession] = useState<ExamSession | null>(null)
  // seconds left on a timed session, or seconds spent on a feedback session
  const [clock, setClock] = useState(0)
  // the start screen's choice of feedback after each answer
  const [feedback, setFeedback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the saved session in the way of this request, shown with Resume and Discard
  const [conflict, setConflict] = useState<ExamSession | null>(null)
  // set once the attempts are frozen for submission; answers lock from then on
  const [submitting, setSubmitting] = useState(false)
  const alive = useRef(true)
  const sessionRef = useRef<ExamSession | null>(null)
  const busy = useRef(false)
  const autoSubmitted = useRef(false)
  // attempts frozen at the first submit so a retry after a failure logs each one once
  const pending = useRef<{ attempts: Attempt[]; logged: Set<string>; at: Date } | null>(null)

  const exam = useMemo(
    () => (mode === 'exam' ? content.exams.find((e) => e.id === examId) : undefined),
    [mode, content.exams, examId],
  )

  const commit = useCallback((next: ExamSession) => {
    sessionRef.current = next
    setSession(next)
    saveSession(next)
  }, [])

  // the lesson range a mock request resolves to, with the lesson ids of its ends
  const range = useMemo(() => {
    if (mode !== 'mock') return null
    const planned = content.lessons.filter(isPlanned)
    const numberOf = (id: string | null) => {
      const l = id ? content.lessonById.get(id) : undefined
      return l && isPlanned(l) ? l.number : undefined
    }
    const lo = numberOf(from) ?? planned[0]?.number ?? 1
    const hi = numberOf(to) ?? numberOf(settings.currentLessonId) ?? planned[planned.length - 1]?.number ?? lo
    const [a, b] = lo <= hi ? [lo, hi] : [hi, lo]
    const lessons = planned.filter((l) => l.number >= a && l.number <= b)
    return { lessonIds: lessons.map((l) => l.id), from: lessons[0]?.id, to: lessons[lessons.length - 1]?.id }
    // the range is resolved once on mount, like the session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const request: SessionRequest | null =
    mode === 'exam'
      ? exam
        ? { kind: 'exam', examId: exam.id }
        : null
      : range?.from && range.to
        ? { kind: 'mock', from: range.from, to: range.to }
        : null

  const clockFor = useCallback(
    (s: ExamSession) => (s.feedback ? elapsedSeconds(s, now()) : remainingSeconds(s, now())),
    [now],
  )

  const open = useCallback(
    (s: ExamSession) => {
      commit(s)
      setClock(clockFor(s))
      setStatus('ready')
    },
    [commit, clockFor],
  )

  // the start screen, or the empty-range notice for a mock with nothing to sample
  const showIntro = useCallback(() => {
    if (mode === 'mock' && !range?.lessonIds.some((id) => (content.questionsByLesson.get(id) ?? []).length > 0)) {
      setStatus('empty')
    } else {
      setStatus('intro')
    }
  }, [mode, range, content.questionsByLesson])

  const startNew = useCallback(
    async (isCancelled: () => boolean, withFeedback: boolean) => {
      const feedbackFields = withFeedback ? { feedback: true, checked: [] } : {}
      try {
        let s: ExamSession
        if (mode === 'exam') {
          if (!exam) {
            setStatus('notfound')
            return
          }
          s = {
            sessionId: newId(),
            kind: 'exam',
            examId: exam.id,
            questionIds: exam.questions.map((q) => q.id),
            answers: {},
            marked: [],
            startedAt: now().toISOString(),
            durationMinutes: exam.durationMinutes,
            current: 0,
            ...feedbackFields,
          }
        } else {
          const questions = sampleMockExam({
            lessonIds: range?.lessonIds ?? [],
            questionsByLesson: content.questionsByLesson,
            attempts: await store.listAttempts(),
            rng,
          })
          if (isCancelled()) return
          if (questions.length === 0 || !range?.from || !range.to) {
            setStatus('empty')
            return
          }
          s = {
            sessionId: newId(),
            kind: 'mock',
            from: range.from,
            to: range.to,
            questionIds: questions.map((q) => q.id),
            answers: {},
            marked: [],
            startedAt: now().toISOString(),
            durationMinutes: MOCK_MINUTES,
            current: 0,
            ...feedbackFields,
          }
        }
        if (isCancelled()) return
        open(s)
      } catch {
        if (!isCancelled()) setError('Could not start the exam. Try again.')
      }
    },
    [mode, exam, range, content, store, rng, now, open],
  )

  useEffect(() => {
    alive.current = true
    const saved = loadSession()
    if (saved && saved.sessionId === resumeId) {
      // asked for by a Resume link: restore it even if its time is up, which submits it
      open(saved)
    } else if (mode === 'exam' && !exam) {
      setStatus('notfound')
    } else if (saved && request && matchesRequest(saved, request) && !timeIsUp(saved, now())) {
      // a reload of the session in progress
      open(saved)
    } else if (saved) {
      // another session, or this one with its time up: never discard or submit it unasked
      setConflict(saved)
      setStatus('conflict')
    } else {
      showIntro()
    }
    return () => {
      alive.current = false
    }
    // the session is created or restored once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function discardAndStart() {
    if (!conflict) return
    const title = sessionTitle(conflict, content)
    if (!window.confirm(`Discard your answers to ${title}? This cannot be undone.`)) return
    clearSession()
    setConflict(null)
    showIntro()
  }

  async function begin() {
    setStatus('loading')
    await startNew(() => !alive.current, feedback)
  }

  const sessionId = session?.sessionId
  useEffect(() => {
    if (!sessionId) return
    const id = setInterval(() => {
      const s = sessionRef.current
      if (s) setClock(clockFor(s))
    }, 1000)
    return () => clearInterval(id)
  }, [sessionId, clockFor])

  const submit = useCallback(
    async (auto: boolean) => {
      const s = sessionRef.current
      if (busy.current || !s) return
      if (!auto && !pending.current) {
        const unanswered = s.questionIds.filter((id) => !s.answers[id]).length
        if (
          unanswered > 0 &&
          !timeIsUp(s, now()) &&
          !window.confirm(`You have ${unanswered} unanswered questions. Submit anyway?`)
        ) {
          return
        }
      }
      busy.current = true
      setError(null)
      if (!pending.current) {
        const at = now()
        pending.current = { attempts: finishSession(s, content, at), logged: new Set(), at }
        setSubmitting(true)
      }
      const p = pending.current
      try {
        for (const a of p.attempts) {
          if (p.logged.has(a.id)) continue
          await store.logAttempt(a)
          p.logged.add(a.id)
        }
        const missedLessons = new Set<string>()
        for (const a of p.attempts) {
          if (a.correct) continue
          for (const lid of content.questionById.get(a.questionId)?.lessonIds ?? []) missedLessons.add(lid)
        }
        if (missedLessons.size > 0) {
          const states = await store.listCardStates()
          for (const st of pullForward(states, content.cards, [...missedLessons], p.at)) {
            await store.saveCardState(st)
          }
        }
      } catch {
        setError('Could not save your exam. Try again.')
        busy.current = false
        return
      }
      clearSession()
      if (s.kind === 'mock') rememberMockQuestions(s.sessionId, s.questionIds)
      // replace: Back from the results should not land on the finished exam
      navigate('/results/' + s.sessionId, { state: { session: s }, replace: true })
    },
    [now, content, store, navigate],
  )

  const untimed = session?.feedback === true
  useEffect(() => {
    if (status !== 'ready' || untimed || clock > 0 || autoSubmitted.current) return
    autoSubmitted.current = true
    void submit(true)
  }, [status, untimed, clock, submit])

  const locked = submitting || (status === 'ready' && !untimed && clock === 0)

  const choose = useCallback(
    (label: Choice['label']) => {
      const s = sessionRef.current
      // pending is read from the ref: a submit in progress has not re-rendered yet
      if (!s || locked || pending.current !== null) return
      const id = s.questionIds[s.current ?? 0]
      if (s.checked?.includes(id)) return
      commit({ ...s, answers: { ...s.answers, [id]: label } })
    },
    [commit, locked],
  )

  // feedback mode: reveal the current question's answer and lock it
  const check = useCallback(
    (_label: Choice['label'], seconds: number) => {
      const s = sessionRef.current
      if (!s || locked || pending.current !== null) return
      const id = s.questionIds[s.current ?? 0]
      if (!s.answers[id] || s.checked?.includes(id)) return
      commit({ ...s, checked: [...(s.checked ?? []), id], seconds: { ...s.seconds, [id]: seconds } })
    },
    [commit, locked],
  )

  const goTo = useCallback(
    (index: number) => {
      const s = sessionRef.current
      if (!s || index < 0 || index >= s.questionIds.length) return
      commit({ ...s, current: index })
    },
    [commit],
  )

  const toggleMark = useCallback(() => {
    const s = sessionRef.current
    if (!s) return
    const id = s.questionIds[s.current ?? 0]
    const marked = s.marked.includes(id) ? s.marked.filter((m) => m !== id) : [...s.marked, id]
    commit({ ...s, marked })
  }, [commit])

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
          <button type="button" onClick={() => void discardAndStart()}>
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
          <button type="button" className="primary" onClick={() => void begin()}>
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

  return (
    <section className="exam">
      <h2>{heading}</h2>
      {errorLine}
      <p className="exam-timer" role="timer" aria-label={untimed ? 'Time elapsed' : 'Time remaining'}>
        {formatClock(clock)}
      </p>
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
      <div className="exam-controls">
        <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)}>
          Prev
        </button>
        <button type="button" disabled={index === total - 1} onClick={() => goTo(index + 1)}>
          Next
        </button>
        <button type="button" onClick={toggleMark}>
          {isMarked ? 'Unmark' : 'Mark for review'}
        </button>
        <button type="button" onClick={() => void submit(false)}>
          Submit
        </button>
      </div>
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
    </section>
  )
}
