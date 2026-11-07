import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { lessonMastery } from '../../engine/mastery'
import type { Mastery } from '../../engine/mastery'
import type { CardState } from '../../storage/types'
import { useContent, useNow, useScheduler, useStore } from '../../storage/context'
import { Markdown } from '../Markdown'

export function Lesson() {
  const { lessonId } = useParams()
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const now = useNow()
  const [mastery, setMastery] = useState<Mastery | null>(null)
  const [states, setStates] = useState<Map<string, CardState> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!lessonId) return
    let cancelled = false
    setMastery(null)
    setStates(null)
    ;(async () => {
      try {
        const [attempts, all] = await Promise.all([store.listAttempts(), store.listCardStates()])
        if (cancelled) return
        const m = lessonMastery(attempts, content.questionById, [lessonId])
        setMastery(m.get(lessonId) ?? { score: null, attempts: 0 })
        setStates(new Map(all.map((s) => [s.cardId, s])))
      } catch {
        if (!cancelled) setError('Could not load your progress.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, content, lessonId])

  const lesson = lessonId ? content.lessonById.get(lessonId) : undefined
  if (!lesson) {
    return (
      <section>
        <h2>Lesson not found</h2>
        <Link to="/course">Back to course</Link>
      </section>
    )
  }
  const cards = content.cardsByLesson.get(lesson.id) ?? []
  const questions = content.questionsByLesson.get(lesson.id) ?? []

  function cardStatus(cardId: string): string | null {
    if (!states) return null
    const s = states.get(cardId)
    if (!s) return 'New'
    if (scheduler.isDue(s, now())) return 'Due'
    return new Date(s.fsrs.dueAt).toLocaleDateString()
  }

  return (
    <section>
      <h2>{lesson.title}</h2>
      {error && <p role="alert">{error}</p>}
      <p>{`Sections ${lesson.sections.join(', ')}`}</p>
      <p>
        <a href={lesson.videoUrl} target="_blank" rel="noreferrer">
          Video
        </a>{' '}
        <a href={lesson.notesUrl} target="_blank" rel="noreferrer">
          Notes
        </a>
      </p>
      {mastery && <p>{mastery.score === null ? 'Untested' : `Mastery: ${Math.round(mastery.score * 100)}%`}</p>}
      <Link to={`/practice?lesson=${lesson.id}`}>Practice this lesson</Link>
      <h3>Key ideas</h3>
      {lesson.keyIdeas ? <Markdown text={lesson.keyIdeas} /> : <p>No key ideas yet.</p>}
      <h3>Cards</h3>
      <ul>
        {cards.map((c) => (
          <li key={c.id}>
            <Markdown text={c.front} />
            <span>{cardStatus(c.id)}</span>
          </li>
        ))}
      </ul>
      <h3>Exam questions</h3>
      {questions.length === 0 ? (
        <p>No exam questions yet.</p>
      ) : (
        <ul>
          {questions.map((q) => {
            const exam = content.examByQuestionId.get(q.id)
            if (!exam) return null
            const name = exam.exam === 'final' ? 'Final' : 'Exam'
            return (
              <li key={q.id}>
                <Link to={`/exams/${exam.id}`}>{`${name} ${exam.term} ${exam.year} #${q.number}`}</Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
