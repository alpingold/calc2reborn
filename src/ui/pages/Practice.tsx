import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Choice, Question } from '../../content/schema'
import { lessonMastery } from '../../engine/mastery'
import { coveredLessonIds, pullForward } from '../../engine/queue'
import { pickPracticeQuestion } from '../../engine/select'
import { useContent, useNow, useRng, useSettings, useStore } from '../../storage/context'
import type { Attempt } from '../../storage/types'
import { QuestionView } from '../QuestionView'

// Route component: a change of `?lesson=` remounts the session so the question,
// served set, and score never carry over between scopes.
export function Practice() {
  const [searchParams] = useSearchParams()
  const lessonParam = searchParams.get('lesson')
  return <PracticeSession key={lessonParam === null ? 'covered' : `lesson:${lessonParam}`} lessonParam={lessonParam} />
}

function PracticeSession({ lessonParam }: { lessonParam: string | null }) {
  const store = useStore()
  const content = useContent()
  const { settings } = useSettings()
  const now = useNow()
  const rng = useRng()

  const lessonIds = useMemo(
    () => (lessonParam ? [lessonParam] : coveredLessonIds(content.lessons, settings.currentLessonId)),
    [lessonParam, content.lessons, settings.currentLessonId],
  )

  const served = useRef(new Set<string>())
  const logged = useRef<string | null>(null)
  const busy = useRef(false)
  const [question, setQuestion] = useState<Question | null | undefined>(undefined)
  const [chosen, setChosen] = useState<Choice['label'] | undefined>(undefined)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState({ correct: 0, total: 0 })

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

  const show = useCallback((q: Question | null) => {
    if (q) served.current.add(q.id)
    setQuestion(q)
    setChosen(undefined)
    setRevealed(false)
    setError(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const q = await pick()
        if (!cancelled) show(q)
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
        if (logged.current !== question.id) {
          const a: Attempt = {
            id: crypto.randomUUID(),
            questionId: question.id,
            chosen: label,
            correct,
            seconds,
            timestamp: t.toISOString(),
            mode: lessonParam ? 'lesson' : 'practice',
          }
          await store.logAttempt(a)
          logged.current = question.id
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
      setRevealed(true)
      busy.current = false
    },
    [question, revealed, now, lessonParam, store, content.cards],
  )

  const next = useCallback(async () => {
    if (busy.current || !revealed) return
    busy.current = true
    try {
      show(await pick())
    } catch {
      setError('Could not load a question. Try again.')
    } finally {
      busy.current = false
    }
  }, [revealed, pick, show])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(t.tagName)) return
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || !revealed) return
      // keep a focused Next button from also activating on this Enter
      e.preventDefault()
      void next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, next])

  const scoreLine = <p>{`Correct ${score.correct} of ${score.total}`}</p>
  const errorLine = error && <p role="alert">{error}</p>

  if (question === undefined) {
    return (
      <section>
        <h2>Practice</h2>
        {errorLine}
      </section>
    )
  }
  if (question === null) {
    return (
      <section>
        <h2>Practice</h2>
        {scoreLine}
        <p>No more questions in range</p>
        <Link to="/">Back to dashboard</Link>
      </section>
    )
  }

  const lessonId = lessonParam && question.lessonIds.includes(lessonParam) ? lessonParam : question.lessonIds[0]
  const lesson = lessonId ? content.lessonById.get(lessonId) : undefined

  return (
    <section>
      <h2>Practice</h2>
      {errorLine}
      {scoreLine}
      <QuestionView
        question={question}
        mode="immediate"
        chosen={chosen}
        onChoose={setChosen}
        onSubmit={(label, seconds) => void submit(label, seconds)}
        revealed={revealed}
        lessonTitle={lesson && `Lesson ${lesson.number}: ${lesson.title}`}
        lessonHref={lesson && `/course/${lesson.id}`}
      />
      {revealed && (
        <button type="button" onClick={() => void next()}>
          Next
        </button>
      )}
      <Link to="/">Stop</Link>
    </section>
  )
}
