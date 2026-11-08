import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { lessonMastery } from '../../engine/mastery'
import type { Mastery } from '../../engine/mastery'
import type { CardState } from '../../storage/types'
import { useContent, useNow, useScheduler, useStore } from '../../storage/context'
import { Markdown } from '../Markdown'
import { examTitle } from '../examSession'

export function Lesson() {
  const { lessonId } = useParams()
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const now = useNow()
  const [mastery, setMastery] = useState<Mastery | null>(null)
  const [states, setStates] = useState<Map<string, CardState> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCards, setShowCards] = useState(false)
  // cards flipped to show their answer
  const [openCards, setOpenCards] = useState<Set<string>>(new Set())

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

  type CardStage = 'due' | 'later' | 'new'
  function stageOf(cardId: string): CardStage | null {
    if (!states) return null
    const s = states.get(cardId)
    if (!s) return 'new'
    return scheduler.isDue(s, now()) ? 'due' : 'later'
  }

  function cardTag(cardId: string): string | null {
    const stage = stageOf(cardId)
    if (stage === 'new') return 'Not started'
    if (stage === 'due') return 'Due today'
    if (stage === 'later') {
      const when = new Date(states!.get(cardId)!.fsrs.dueAt)
      return `Next review ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    }
    return null
  }

  const counts = { due: 0, later: 0, new: 0 }
  for (const c of cards) {
    const stage = stageOf(c.id)
    if (stage) counts[stage]++
  }
  const summaryParts = [
    counts.due > 0 && `${counts.due} due today`,
    counts.later > 0 && `${counts.later} scheduled later`,
    counts.new > 0 && `${counts.new} not started yet`,
  ].filter(Boolean)
  const cardSummary = `${cards.length} ${cards.length === 1 ? 'flashcard' : 'flashcards'}${
    states && summaryParts.length ? `: ${summaryParts.join(', ')}` : ''
  }`

  return (
    <section>
      <h2>{lesson.title}</h2>
      {error && <p role="alert">{error}</p>}
      {lesson.sections.length > 0 && <p>{`Sections ${lesson.sections.join(', ')}`}</p>}
      {lesson.isExtra ? (
        <p className="note">
          This topic is on older MA 16200 exams but is not part of Dr. Chen's Fall 2023 lessons, so it has no video,
          notes, or flashcards, and it doesn't count toward lesson mastery.
        </p>
      ) : (
        <p>
          <a href={lesson.videoUrl} target="_blank" rel="noreferrer">
            Video
          </a>{' '}
          <a href={lesson.notesUrl} target="_blank" rel="noreferrer">
            Notes
          </a>
        </p>
      )}
      {mastery && <p>{mastery.score === null ? 'Untested' : `Mastery: ${Math.round(mastery.score * 100)}%`}</p>}
      <Link to={`/practice?lesson=${lesson.id}`}>{lesson.isExtra ? 'Practice this topic' : 'Practice this lesson'}</Link>
      <h3>Key ideas</h3>
      {lesson.keyIdeas ? <Markdown text={lesson.keyIdeas} /> : <p>No key ideas yet.</p>}
      {!lesson.isExtra && (
        <section className="lesson-cards">
          <h3>Flashcards</h3>
          {cards.length === 0 ? (
            <p>No flashcards for this lesson yet.</p>
          ) : (
            <>
              <p className="cards-summary">
                {cardSummary}
                {counts.due > 0 && (
                  <>
                    {' '}
                    <Link to="/review">Open Review</Link>
                  </>
                )}
              </p>
              <p className="panel-hint">
                Review schedules these cards for you. Opening one here is for reading and does not count as a review.
              </p>
              <button
                type="button"
                className="link-button"
                aria-expanded={showCards}
                onClick={() => setShowCards((v) => !v)}
              >
                {showCards ? 'Hide the cards' : 'Show the cards'}
              </button>
              {showCards && (
                <ul className="flashcard-list" aria-label="Flashcards">
                  {cards.map((c) => {
                    const open = openCards.has(c.id)
                    const tag = cardTag(c.id)
                    return (
                      <li key={c.id} className={open ? 'open' : undefined}>
                        <button
                          type="button"
                          className="flashcard-front"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenCards((prev) => {
                              const next = new Set(prev)
                              if (next.has(c.id)) next.delete(c.id)
                              else next.add(c.id)
                              return next
                            })
                          }
                        >
                          <Markdown text={c.front} className="flashcard-text" />
                          {tag && <span className={`card-tag card-tag-${stageOf(c.id)}`}>{tag}</span>}
                        </button>
                        {open && <Markdown text={c.back} className="flashcard-back" />}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}
      <h3>Exam questions</h3>
      {questions.length === 0 ? (
        <p>No exam questions yet.</p>
      ) : (
        <ul>
          {questions.map((q) => {
            const exam = content.examByQuestionId.get(q.id)
            if (!exam) return null
            return (
              <li key={q.id}>
                <Link to={`/exams/${exam.id}`}>{`${examTitle(exam)} #${q.number}`}</Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
