import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { Choice } from '../../content/schema'
import { sampleMockExam } from '../../engine/mock'
import { pullForward } from '../../engine/queue'
import { useContent, useNow, useRng, useSettings, useStore } from '../../storage/context'
import type { Attempt } from '../../storage/types'
import { QuestionView } from '../QuestionView'
import {
  clearSession,
  examTitle,
  finishSession,
  loadSession,
  remainingSeconds,
  saveSession,
} from '../examSession'
import type { ExamSession } from '../examSession'

const MOCK_MINUTES = 60

function formatClock(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Route component: a different exam or mock range remounts the session view.
export function TakeExam({ mode = 'exam' }: { mode?: 'exam' | 'mock' }) {
  const { examId } = useParams()
  const [searchParams] = useSearchParams()
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const key = mode === 'mock' ? `mock:${from}:${to}` : `exam:${examId}`
  return <ExamSessionView key={key} mode={mode} examId={examId} from={from} to={to} />
}

type Status = 'loading' | 'ready' | 'notfound' | 'empty'

function ExamSessionView({
  mode,
  examId,
  from,
  to,
}: {
  mode: 'exam' | 'mock'
  examId?: string
  from: string | null
  to: string | null
}) {
  const store = useStore()
  const content = useContent()
  const { settings } = useSettings()
  const now = useNow()
  const rng = useRng()
  const navigate = useNavigate()

  const [status, setStatus] = useState<Status>('loading')
  const [session, setSession] = useState<ExamSession | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const saved = loadSession()
        const matches =
          saved &&
          (mode === 'mock' ? saved.kind === 'mock' : saved.kind === 'exam' && saved.examId === examId)
        let s: ExamSession
        if (saved && matches) {
          s = saved
        } else if (mode === 'exam') {
          if (!exam) {
            setStatus('notfound')
            return
          }
          s = {
            sessionId: crypto.randomUUID(),
            kind: 'exam',
            examId: exam.id,
            questionIds: exam.questions.map((q) => q.id),
            answers: {},
            marked: [],
            startedAt: now().toISOString(),
            durationMinutes: exam.durationMinutes,
            current: 0,
          }
        } else {
          const planned = content.lessons.filter((l) => !l.isReview)
          const numberOf = (id: string | null) => {
            const l = id ? content.lessonById.get(id) : undefined
            return l && !l.isReview ? l.number : undefined
          }
          const lo = numberOf(from) ?? planned[0]?.number ?? 1
          const hi = numberOf(to) ?? numberOf(settings.currentLessonId) ?? planned[planned.length - 1]?.number ?? lo
          const [a, b] = lo <= hi ? [lo, hi] : [hi, lo]
          const lessonIds = planned.filter((l) => l.number >= a && l.number <= b).map((l) => l.id)
          const questions = sampleMockExam({
            lessonIds,
            questionsByLesson: content.questionsByLesson,
            attempts: await store.listAttempts(),
            rng,
          })
          if (cancelled) return
          if (questions.length === 0) {
            setStatus('empty')
            return
          }
          s = {
            sessionId: crypto.randomUUID(),
            kind: 'mock',
            questionIds: questions.map((q) => q.id),
            answers: {},
            marked: [],
            startedAt: now().toISOString(),
            durationMinutes: MOCK_MINUTES,
            current: 0,
          }
        }
        if (cancelled) return
        commit(s)
        setRemaining(remainingSeconds(s, now()))
        setStatus('ready')
      } catch {
        if (!cancelled) setError('Could not start the exam. Try again.')
      }
    })()
    return () => {
      cancelled = true
    }
    // the session is created or restored once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sessionId = session?.sessionId
  useEffect(() => {
    if (!sessionId) return
    const id = setInterval(() => {
      const s = sessionRef.current
      if (s) setRemaining(remainingSeconds(s, now()))
    }, 1000)
    return () => clearInterval(id)
  }, [sessionId, now])

  const submit = useCallback(
    async (auto: boolean) => {
      const s = sessionRef.current
      if (busy.current || !s) return
      if (!auto && !pending.current) {
        const unanswered = s.questionIds.filter((id) => !s.answers[id]).length
        if (
          unanswered > 0 &&
          remainingSeconds(s, now()) > 0 &&
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
      navigate('/results/' + s.sessionId, { state: { session: s } })
    },
    [now, content, store, navigate],
  )

  useEffect(() => {
    if (status !== 'ready' || remaining > 0 || autoSubmitted.current) return
    autoSubmitted.current = true
    void submit(true)
  }, [status, remaining, submit])

  const locked = pending.current !== null || (status === 'ready' && remaining === 0)

  const choose = useCallback(
    (label: Choice['label']) => {
      const s = sessionRef.current
      if (!s || locked) return
      const id = s.questionIds[s.current ?? 0]
      commit({ ...s, answers: { ...s.answers, [id]: label } })
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
  const errorLine = error && <p role="alert">{error}</p>

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

  return (
    <section className="exam">
      <h2>{heading}</h2>
      {errorLine}
      <p className="exam-timer" role="timer" aria-label="Time remaining">
        {formatClock(remaining)}
      </p>
      <h3>{`Question ${index + 1} of ${total}`}</h3>
      {question ? (
        <QuestionView key={question.id} question={question} mode="deferred" chosen={session.answers[questionId]} onChoose={choose} />
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
