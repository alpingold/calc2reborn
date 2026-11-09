import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { isPlanned } from '../../content/schema'
import type { Exam, OfficialExam } from '../../content/schema'
import { useContent, useNow, useSettings, useStore } from '../../storage/context'
import { examLabel, loadSession, sessionTitle, sessionUrl, timeIsUp } from '../examSession'
import { examScope } from '../../engine/scope'
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

  const planned = useMemo(() => content.lessons.filter(isPlanned), [content.lessons])
  const current = settings.currentLessonId ? content.lessonById.get(settings.currentLessonId) : undefined
  const defaultTo = current && isPlanned(current) ? current.id : (planned[planned.length - 1]?.id ?? '')
  // the mock range starts on the exam's lessons while an exam is ahead
  const scope = examScope(settings, content.lessons, now())
  const [from, setFrom] = useState(scope.active ? scope.lessonIds[0] : (planned[0]?.id ?? ''))
  const [to, setTo] = useState(scope.active ? scope.lessonIds[scope.lessonIds.length - 1] : defaultTo)
  // best correct counts from timed attempts, and from attempts taken with feedback
  const [best, setBest] = useState<{ timed: Map<string, number>; feedback: Map<string, number> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const attempts = await store.listAttempts({ mode: 'exam' })
        if (!cancelled) {
          setBest({
            timed: bestByExam(attempts.filter((a) => !a.feedback)),
            feedback: bestByExam(attempts.filter((a) => a.feedback)),
          })
        }
      } catch {
        if (!cancelled) setError('Could not load your exam history.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store])

  const byYear = useMemo(() => {
    const years = new Map<number, Map<OfficialExam['term'], OfficialExam[]>>()
    for (const e of content.exams) {
      if (e.unofficial) continue
      const terms = years.get(e.year) ?? new Map<OfficialExam['term'], OfficialExam[]>()
      terms.set(e.term, [...(terms.get(e.term) ?? []), e])
      years.set(e.year, terms)
    }
    return [...years.entries()].sort((a, b) => b[0] - a[0])
  }, [content.exams])
  const extraExams = useMemo(() => content.exams.filter((e) => e.unofficial), [content.exams])

  function onGenerate(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({ from, to })
    navigate(`/exams/mock?${params.toString()}`)
  }

  function bestLine(exam: Exam): string {
    if (!best) return ''
    const timed = best.timed.get(exam.id)
    if (timed !== undefined) return `Best: ${timed}/${exam.questions.length}`
    const withFeedback = best.feedback.get(exam.id)
    if (withFeedback !== undefined) return `Best with feedback: ${withFeedback}/${exam.questions.length}`
    return 'Not taken'
  }

  return (
    <section className="exams">
      <h2>Exams</h2>
      {error && <p role="alert">{error}</p>}
      {inProgress && (
        <p className="note">
          {`In progress: ${sessionTitle(inProgress, content)}${inProgress.feedback ? ' with feedback' : ''}`}
          {!timeIsUp(inProgress, now())
            ? `, ${inProgress.questionIds.filter((id) => inProgress.answers[id]).length} of ${inProgress.questionIds.length} answered. `
            : '. Its time is up; resuming submits it. '}
          <Link to={sessionUrl(inProgress)} state={{ resume: inProgress.sessionId } satisfies ResumeState}>
            Resume
          </Link>
        </p>
      )}
      <form className="panel mock-form" onSubmit={onGenerate}>
        <div className="mock-head">
          <h3>Mock exam</h3>
          <p className="panel-hint">
            Twelve questions from past exams on the lessons you pick, skipping questions from your last two mocks.
          </p>
        </div>
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
        <button type="submit" className="primary">
          Generate mock exam
        </button>
      </form>
      {extraExams.length > 0 && (
        <section className="extra-exams">
          <h3>Extra practice</h3>
          <p className="panel-hint">
            Written for this app in the style of past exams. These are not Purdue exams, and their answers were checked
            independently but may contain errors.
          </p>
          <ul className="exam-cells exam-cells-wide">
            {extraExams.map((exam) => (
              <li key={exam.id}>
                <Link to={`/exams/${exam.id}`}>{examLabel(exam)}</Link> <span className="best">{bestLine(exam)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {byYear.length === 0 && <p>No past exams yet</p>}
      <div className="exam-years">
        {byYear.map(([year, terms]) => (
          <section key={year} className="exam-year">
            <h3>{year}</h3>
            {[...terms.entries()].map(([term, exams]) => (
              <div key={term} className="term-row">
                <h4>{term}</h4>
                <ul className="exam-cells">
                  {exams.map((exam) => (
                    <li key={exam.id}>
                      <Link to={`/exams/${exam.id}`}>{examLabel(exam)}</Link> <span className="best">{bestLine(exam)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}
