import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Exam } from '../../content/schema'
import { useContent, useNow, useSettings, useStore } from '../../storage/context'
import { examLabel, loadSession, remainingSeconds, sessionTitle, sessionUrl } from '../examSession'
import type { ResumeState } from '../examSession'

function bestByExam(attempts: { examId?: string; sessionId?: string; correct: boolean }[]): Map<string, number> {
  const perSession = new Map<string, { examId: string; correct: number }>()
  for (const a of attempts) {
    if (!a.examId || !a.sessionId) continue
    const s = perSession.get(a.sessionId) ?? { examId: a.examId, correct: 0 }
    if (a.correct) s.correct++
    perSession.set(a.sessionId, s)
  }
  const best = new Map<string, number>()
  for (const s of perSession.values()) best.set(s.examId, Math.max(best.get(s.examId) ?? 0, s.correct))
  return best
}

export function Exams() {
  const store = useStore()
  const content = useContent()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const now = useNow()
  const [inProgress] = useState(loadSession)

  const planned = useMemo(() => content.lessons.filter((l) => !l.isReview), [content.lessons])
  const current = settings.currentLessonId ? content.lessonById.get(settings.currentLessonId) : undefined
  const defaultTo = current && !current.isReview ? current.id : (planned[planned.length - 1]?.id ?? '')
  const [from, setFrom] = useState(planned[0]?.id ?? '')
  const [to, setTo] = useState(defaultTo)
  const [best, setBest] = useState<Map<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const attempts = await store.listAttempts({ mode: 'exam' })
        if (!cancelled) setBest(bestByExam(attempts))
      } catch {
        if (!cancelled) setError('Could not load your exam history.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store])

  const byYear = useMemo(() => {
    const years = new Map<number, Map<Exam['term'], Exam[]>>()
    for (const e of content.exams) {
      const terms = years.get(e.year) ?? new Map<Exam['term'], Exam[]>()
      terms.set(e.term, [...(terms.get(e.term) ?? []), e])
      years.set(e.year, terms)
    }
    return [...years.entries()].sort((a, b) => b[0] - a[0])
  }, [content.exams])

  function onGenerate(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({ from, to })
    navigate(`/exams/mock?${params.toString()}`)
  }

  function bestLine(exam: Exam): string {
    if (!best) return ''
    const n = best.get(exam.id)
    return n === undefined ? 'Not taken' : `Best: ${n}/${exam.questions.length}`
  }

  return (
    <section className="exams">
      <h2>Exams</h2>
      {error && <p role="alert">{error}</p>}
      {inProgress && (
        <p>
          {`In progress: ${sessionTitle(inProgress, content)}`}
          {remainingSeconds(inProgress, now()) > 0
            ? `, ${inProgress.questionIds.filter((id) => inProgress.answers[id]).length} of ${inProgress.questionIds.length} answered. `
            : '. Its time is up; resuming submits it. '}
          <Link to={sessionUrl(inProgress)} state={{ resume: inProgress.sessionId } satisfies ResumeState}>
            Resume
          </Link>
        </p>
      )}
      <form className="mock-form" onSubmit={onGenerate}>
        <h3>Mock exam</h3>
        <label>
          From{' '}
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {planned.map((l) => (
              <option key={l.id} value={l.id}>
                {`Lesson ${l.number}: ${l.title}`}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          To{' '}
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {planned.map((l) => (
              <option key={l.id} value={l.id}>
                {`Lesson ${l.number}: ${l.title}`}
              </option>
            ))}
          </select>
        </label>{' '}
        <button type="submit">Generate mock exam</button>
      </form>
      {byYear.length === 0 && <p>No past exams yet</p>}
      {byYear.map(([year, terms]) => (
        <section key={year}>
          <h3>{year}</h3>
          {[...terms.entries()].map(([term, exams]) => (
            <div key={term}>
              <h4>{term}</h4>
              <ul>
                {exams.map((exam) => (
                  <li key={exam.id}>
                    <Link to={`/exams/${exam.id}`}>{examLabel(exam)}</Link> <span>{bestLine(exam)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </section>
  )
}
