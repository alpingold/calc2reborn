import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { FormEvent } from 'react'
import type { Choice, Question } from '../../content/schema'
import { lessonMastery } from '../../engine/mastery'
import { coveredLessonIds, pullForward } from '../../engine/queue'
import { RETRY_AFTER, nextRetry, pickPracticeQuestion } from '../../engine/select'
import type { PendingRetry } from '../../engine/select'
import { examScope, lessonRange } from '../../engine/scope'
import { useContent, useNow, useRng, useSettings, useStore } from '../../storage/context'
import type { Attempt } from '../../storage/types'
import { QuestionView } from '../QuestionView'
import { newId } from '../../ids'

const LENGTHS = ['10', '20', '0'] as const

function parseLimit(n: string | null): number | null {
  const v = Number(n)
  return Number.isInteger(v) && v > 0 ? v : null
}

// Route component. With no scope in the address it shows the setup screen. Otherwise every
// navigation, including Practice again to the same address, remounts a fresh session.
export function Practice() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const lessonParam = searchParams.get('lesson')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const n = searchParams.get('n')
  if (!lessonParam && !(from && to)) return <PracticeSetup />
  const scope = lessonParam ? `lesson:${lessonParam}` : `range:${from}:${to}:${n}`
  return (
    <PracticeSession
      key={`${scope}:${location.key}`}
      lessonParam={lessonParam}
      from={from}
      to={to}
      limit={lessonParam ? null : parseLimit(n)}
    />
  )
}

function rangeLabel(ids: string[], content: ReturnType<typeof useContent>): string {
  const a = content.lessonById.get(ids[0] ?? '')
  const b = content.lessonById.get(ids[ids.length - 1] ?? '')
  if (!a || !b) return ''
  return a.id === b.id ? `L${a.number}` : `L${a.number} to L${b.number}`
}

function PracticeSetup() {
  const content = useContent()
  const { settings } = useSettings()
  const now = useNow()
  const navigate = useNavigate()
  const scope = useMemo(() => examScope(settings, content.lessons, now()), [settings, content.lessons, now])
  const covered = useMemo(() => coveredLessonIds(content.lessons, settings.currentLessonId), [content.lessons, settings])
  const planned = useMemo(() => content.lessons.filter((l) => !l.isReview), [content.lessons])
  const [mode, setMode] = useState<'exam' | 'covered' | 'range'>(scope.active ? 'exam' : 'covered')
  const start = scope.active ? scope.lessonIds : covered
  const [from, setFrom] = useState(start[0] ?? '')
  const [to, setTo] = useState(start[start.length - 1] ?? '')
  const [length, setLength] = useState<(typeof LENGTHS)[number]>('20')

  function onStart(e: FormEvent) {
    e.preventDefault()
    const ids = mode === 'exam' ? scope.lessonIds : mode === 'covered' ? covered : [from, to]
    const params = new URLSearchParams({ from: ids[0] ?? '', to: ids[ids.length - 1] ?? '' })
    if (length !== '0') params.set('n', length)
    navigate(`/practice?${params.toString()}`)
  }

  return (
    <section>
      <h2>Practice</h2>
      <form className="panel practice-setup" onSubmit={onStart}>
        <p className="panel-hint">
          Past exam questions with the answer after each one, weighted toward the lessons you miss most.
        </p>
        <fieldset>
          <legend>Lessons</legend>
          {scope.active && (
            <label className="choice-row">
              <input type="radio" name="scope" checked={mode === 'exam'} onChange={() => setMode('exam')} />
              {`Exam lessons (${rangeLabel(scope.lessonIds, content)})`}
            </label>
          )}
          <label className="choice-row">
            <input type="radio" name="scope" checked={mode === 'covered'} onChange={() => setMode('covered')} />
            {`Everything so far (${rangeLabel(covered, content)})`}
          </label>
          <label className="choice-row">
            <input type="radio" name="scope" checked={mode === 'range'} onChange={() => setMode('range')} />
            Choose a range
          </label>
          {mode === 'range' && (
            <div className="range-pickers">
              <label>
                From
                <select value={from} onChange={(e) => setFrom(e.target.value)}>
                  {planned.map((l) => (
                    <option key={l.id} value={l.id}>{`L${l.number}: ${l.title}`}</option>
                  ))}
                </select>
              </label>
              <label>
                To
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  {planned.map((l) => (
                    <option key={l.id} value={l.id}>{`L${l.number}: ${l.title}`}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>Length</legend>
          {LENGTHS.map((v) => (
            <label key={v} className="choice-row">
              <input type="radio" name="length" checked={length === v} onChange={() => setLength(v)} />
              {v === '0' ? 'No limit' : `${v} questions`}
            </label>
          ))}
        </fieldset>
        <p className="exam-controls">
          <button type="submit" className="primary">
            Start
          </button>
        </p>
      </form>
    </section>
  )
}

type Finish = 'limit' | 'exhausted' | 'stopped'

function PracticeSession({
  lessonParam,
  from,
  to,
  limit,
}: {
  lessonParam: string | null
  from: string | null
  to: string | null
  limit: number | null
}) {
  const store = useStore()
  const content = useContent()
  const now = useNow()
  const rng = useRng()
  const location = useLocation()

  const lessonIds = useMemo(
    () => (lessonParam ? [lessonParam] : from && to ? lessonRange(content.lessons, from, to) : []),
    [lessonParam, from, to, content.lessons],
  )

  const served = useRef(new Set<string>())
  // each showing of a question gets a number, so a retry of the same question logs its own attempt
  const showing = useRef(0)
  const logged = useRef<number | null>(null)
  const busy = useRef(false)
  const answered = useRef(0)
  const pending = useRef<PendingRetry[]>([])
  const retried = useRef(new Set<string>())
  const [question, setQuestion] = useState<Question | null | undefined>(undefined)
  const [isRetry, setIsRetry] = useState(false)
  const [chosen, setChosen] = useState<Choice['label'] | undefined>(undefined)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState({ correct: 0, total: 0 })
  const [missed, setMissed] = useState<Set<string>>(new Set())
  const [finished, setFinished] = useState<Finish | null>(null)

  const pick = useCallback(async () => {
    const attempts = await store.listAttempts()
    const mastery = lessonMastery(attempts, content.questionById, lessonIds)
    return pickPracticeQuestion({
      lessonIds,
      questionsByLesson: content.questionsByLesson,
      mastery,
      attempts,
      servedThisSession: served.current,
      now: now(),
      rng,
    })
  }, [store, content, lessonIds, now, rng])

  const show = useCallback((q: Question, retry: boolean) => {
    served.current.add(q.id)
    showing.current++
    setQuestion(q)
    setIsRetry(retry)
    setChosen(undefined)
    setRevealed(false)
    setError(null)
  }, [])

  const takeRetry = useCallback(
    (exhausted: boolean): Question | null => {
      const id = nextRetry(pending.current, answered.current, exhausted)
      if (!id) return null
      pending.current = pending.current.filter((r) => r.questionId !== id)
      return content.questionById.get(id) ?? null
    },
    [content.questionById],
  )

  // the next question: a missed one whose turn has come, else a new pick, else any missed one left
  const advance = useCallback(async () => {
    if (limit !== null && answered.current >= limit) {
      setFinished('limit')
      return
    }
    const due = takeRetry(false)
    if (due) return show(due, true)
    const q = await pick()
    if (q) return show(q, false)
    const last = takeRetry(true)
    if (last) return show(last, true)
    if (answered.current === 0) setQuestion(null)
    setFinished('exhausted')
  }, [limit, takeRetry, pick, show])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const q = await pick()
        if (cancelled) return
        if (q) show(q, false)
        else {
          setQuestion(null)
          setFinished('exhausted')
        }
      } catch {
        if (!cancelled) setError('Could not load a question. Try again.')
      }
    })()
    return () => {
      cancelled = true
    }
    // the first question is picked once on mount; later ones come from next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = useCallback(
    async (label: Choice['label'], seconds: number) => {
      if (busy.current || !question || revealed) return
      busy.current = true
      setError(null)
      const t = now()
      const correct = label === question.answer
      try {
        if (logged.current !== showing.current) {
          const a: Attempt = {
            id: newId(),
            questionId: question.id,
            chosen: label,
            correct,
            seconds,
            timestamp: t.toISOString(),
            mode: lessonParam ? 'lesson' : 'practice',
          }
          await store.logAttempt(a)
          logged.current = showing.current
          answered.current++
          if (!correct && !retried.current.has(question.id)) {
            retried.current.add(question.id)
            pending.current = [...pending.current, { questionId: question.id, after: answered.current + RETRY_AFTER }]
          }
        }
        if (!correct) {
          const states = await store.listCardStates()
          for (const s of pullForward(states, content.cards, question.lessonIds, t)) {
            await store.saveCardState(s)
          }
        }
      } catch {
        setError('Could not save your answer. Try again.')
        busy.current = false
        return
      }
      setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
      if (!correct) setMissed((m) => new Set([...m, ...question.lessonIds]))
      setRevealed(true)
      busy.current = false
    },
    [question, revealed, now, lessonParam, store, content.cards],
  )

  const next = useCallback(async () => {
    if (busy.current || !revealed) return
    busy.current = true
    try {
      await advance()
    } catch {
      setError('Could not load a question. Try again.')
    } finally {
      busy.current = false
    }
  }, [revealed, advance])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (['INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(t.tagName) || t.closest?.('[data-own-enter]'))) return
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || !revealed || finished) return
      // keep a focused Next button from also activating on this Enter
      e.preventDefault()
      void next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, finished, next])

  const scoreLine = <p className="practice-score">{`Correct ${score.correct} of ${score.total}`}</p>
  const errorLine = error && <p role="alert">{error}</p>

  if (finished) {
    const lessonsToRevisit = content.lessons.filter((l) => missed.has(l.id))
    return (
      <section className="practice-summary">
        <h2>Practice</h2>
        {errorLine}
        {scoreLine}
        {finished === 'exhausted' && <p>No more questions in range</p>}
        {lessonsToRevisit.length > 0 ? (
          <>
            <h3>Lessons to revisit</h3>
            <ul>
              {lessonsToRevisit.map((l) => (
                <li key={l.id}>
                  <Link to={`/course/${l.id}`}>{`Lesson ${l.number}: ${l.title}`}</Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          score.total > 0 && <p>No misses this session.</p>
        )}
        <p className="actions">
          {question !== null && (
            <Link to={location.pathname + location.search} className="button primary">
              Practice again
            </Link>
          )}
          <Link to="/" className="button">
            Back to dashboard
          </Link>
        </p>
      </section>
    )
  }

  if (question === undefined || question === null) {
    return (
      <section>
        <h2>Practice</h2>
        {errorLine}
      </section>
    )
  }

  const lessonId = lessonParam && question.lessonIds.includes(lessonParam) ? lessonParam : question.lessonIds[0]
  const lesson = lessonId ? content.lessonById.get(lessonId) : undefined
  const position = score.total + (revealed ? 0 : 1)

  return (
    <section>
      <h2>Practice</h2>
      {errorLine}
      <div className="practice-status">
        {scoreLine}
        {limit !== null && <p>{`Question ${Math.min(position, limit)} of ${limit}`}</p>}
      </div>
      {isRetry && <p className="note">You missed this one earlier in this session. Second try.</p>}
      <QuestionView
        key={showing.current}
        question={question}
        mode="immediate"
        chosen={chosen}
        onChoose={setChosen}
        onSubmit={(label, seconds) => void submit(label, seconds)}
        revealed={revealed}
        lessonTitle={lesson && `Lesson ${lesson.number}: ${lesson.title}`}
        lessonHref={lesson && `/course/${lesson.id}`}
      />
      <p className="exam-controls">
        {revealed && (
          <button type="button" className="primary" onClick={() => void next()}>
            Next
          </button>
        )}
        <button type="button" data-own-enter onClick={() => setFinished('stopped')}>
          Stop
        </button>
      </p>
    </section>
  )
}
