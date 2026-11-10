import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { isPlanned } from '../content/schema'
import type { Choice, Exam } from '../content/schema'
import { sampleMockExam } from '../engine/mock'
import { pullForward } from '../engine/queue'
import { useContent, useNow, useRng, useSettings, useStore } from '../storage/context'
import type { Attempt } from '../storage/types'
import {
  attemptFor,
  clearSession,
  elapsedSeconds,
  finishSession,
  loadSession,
  matchesRequest,
  remainingSeconds,
  recordFor,
  saveSession,
  timeIsUp,
} from './examSession'
import type { ExamSession, SessionRequest } from './examSession'
import { newId } from '../ids'

export const MOCK_MINUTES = 60

export type ExamStatus = 'loading' | 'intro' | 'ready' | 'notfound' | 'empty' | 'conflict'

export interface ExamSessionArgs {
  mode: 'exam' | 'mock'
  examId?: string
  from: string | null
  to: string | null
  /** the id of a saved session a Resume link asked for */
  resumeId?: string
}

export interface ExamSessionApi {
  status: ExamStatus
  session: ExamSession | null
  /** the saved session in the way of this request, shown with Resume and Discard */
  conflict: ExamSession | null
  exam: Exam | undefined
  /** the lesson range a mock request resolves to, with the lesson ids of its ends */
  range: { lessonIds: string[]; from?: string; to?: string } | null
  /** seconds left on a timed session, or seconds spent on a feedback session */
  clock: number
  untimed: boolean
  /** answers can no longer change: time is up or the attempts are frozen for submission */
  locked: boolean
  error: string | null
  begin(withFeedback: boolean): Promise<void>
  /** drop the saved session in the way and show the start screen */
  discardConflict(): void
  choose(label: Choice['label']): void
  /** feedback mode: reveal the current question's answer and lock it */
  check(label: Choice['label'], seconds: number): void
  goTo(index: number): void
  toggleMark(): void
  /** confirmUnanswered is asked before a manual submit that leaves questions blank */
  submit(auto: boolean, confirmUnanswered?: (unanswered: number) => boolean): Promise<void>
}

/**
 * One exam or mock session: it is created or restored once on mount, saved on every change, timed, and
 * submitted with its attempts frozen so a retry after a failed save logs each one once.
 */
export function useExamSession({ mode, examId, from, to, resumeId }: ExamSessionArgs): ExamSessionApi {
  const store = useStore()
  const content = useContent()
  const { settings } = useSettings()
  const now = useNow()
  const rng = useRng()
  const navigate = useNavigate()

  const [status, setStatus] = useState<ExamStatus>('loading')
  const [session, setSession] = useState<ExamSession | null>(null)
  // seconds left on a timed session, or seconds spent on a feedback session
  const [clock, setClock] = useState(0)
  const [error, setError] = useState<string | null>(null)
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

  const discardConflict = useCallback(() => {
    clearSession()
    setConflict(null)
    showIntro()
  }, [showIntro])

  const begin = useCallback(
    async (withFeedback: boolean) => {
      setStatus('loading')
      await startNew(() => !alive.current, withFeedback)
    },
    [startNew],
  )

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
    async (auto: boolean, confirmUnanswered?: (unanswered: number) => boolean) => {
      const s = sessionRef.current
      if (busy.current || !s) return
      if (!auto && !pending.current && confirmUnanswered) {
        const unanswered = s.questionIds.filter((id) => !s.answers[id]).length
        if (unanswered > 0 && !timeIsUp(s, now()) && !confirmUnanswered(unanswered)) return
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
        // the record lists every question, so results and Past attempts work even with nothing answered
        await store.saveSessionRecord(recordFor(s, content, p.at))
      } catch {
        setError('Could not save your exam. Try again.')
        busy.current = false
        return
      }
      clearSession()
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

  // feedback mode: log the current question's answer, then reveal it and lock it. The answer is saved
  // first, so closing the tab afterwards loses nothing that was shown as checked.
  const checking = useRef(false)
  const check = useCallback(
    (_label: Choice['label'], seconds: number) => {
      const s = sessionRef.current
      if (!s || locked || pending.current !== null || checking.current) return
      const id = s.questionIds[s.current ?? 0]
      if (!s.answers[id] || s.checked?.includes(id)) return
      checking.current = true
      setError(null)
      void (async () => {
        try {
          if (content.questionById.has(id)) await store.logAttempt(attemptFor(s, id, content, now(), seconds))
        } catch {
          if (alive.current) setError('Could not save your answer. Try again.')
          return
        } finally {
          checking.current = false
        }
        if (!alive.current) return
        // the session may have moved on (another question on screen) while the save was pending
        const latest = sessionRef.current ?? s
        if (latest.checked?.includes(id)) return
        commit({ ...latest, checked: [...(latest.checked ?? []), id], seconds: { ...latest.seconds, [id]: seconds } })
      })()
    },
    [commit, locked, content, store, now],
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

  return {
    status,
    session,
    conflict,
    exam,
    range,
    clock,
    untimed,
    locked,
    error,
    begin,
    discardConflict,
    choose,
    check,
    goTo,
    toggleMark,
    submit,
  }
}
