import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { lessonMastery, typeMastery } from '../../engine/mastery'
import type { Mastery } from '../../engine/mastery'
import type { CardState } from '../../storage/types'
import { useContent, useNow, useScheduler, useStore } from '../../storage/context'
import { Markdown } from '../Markdown'
import { examTitle } from '../examSession'
import { practiseTypeLink } from '../TypeTiles'
import { GuidedProblemView, type GuidedOutcome } from '../GuidedProblem'

export function Lesson() {
  const { lessonId } = useParams()
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const now = useNow()
  const [mastery, setMastery] = useState<Mastery | null>(null)
  const [states, setStates] = useState<Map<string, CardState> | null>(null)
  const [byType, setByType] = useState<Map<string, Mastery>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [showCards, setShowCards] = useState(false)
  // cards flipped to show their answer
  const [openCards, setOpenCards] = useState<Set<string>>(new Set())
  const { hash } = useLocation()
  // guided problems finished, now or earlier
  const [doneGuided, setDoneGuided] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!lessonId) return
    let cancelled = false
    setMastery(null)
    setStates(null)
    ;(async () => {
      try {
        const [attempts, all, results] = await Promise.all([
          store.listAttempts(),
          store.listCardStates(),
          store.listGuidedResults(),
        ])
        if (cancelled) return
        const m = lessonMastery(attempts, content.questionById, [lessonId])
        setMastery(m.get(lessonId) ?? { score: null, attempts: 0 })
        setStates(new Map(all.map((s) => [s.cardId, s])))
        setDoneGuided(new Set(results.map((r) => r.problemId)))
        const typeIds = (content.lessonById.get(lessonId)?.problemTypes ?? []).map((t) => t.id)
        setByType(typeMastery(attempts, content.questionById, typeIds))
      } catch {
        if (!cancelled) setError('Could not load your progress.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, content, lessonId])

  // an address ending in #guided, #guided-<problemId> or another section's id scrolls there
  useEffect(() => {
    if (hash.length < 2) return
    const id = hash.slice(1)
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView?.())
    return () => cancelAnimationFrame(frame)
  }, [hash, lessonId])

  async function onGuidedFinish(problemId: string, outcome: GuidedOutcome) {
    setDoneGuided((done) => new Set(done).add(problemId))
    try {
      await store.saveGuidedResult({ problemId, completedAt: now().toISOString(), ...outcome })
    } catch {
      setError('Could not save your progress.')
    }
  }

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
  const types = lesson.problemTypes ?? []
  const guided = content.guidedByLesson.get(lesson.id) ?? []

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

  const guidedDone = guided.filter((g) => doneGuided.has(g.id)).length
  const toc = [
    { id: 'key-ideas', label: 'Key ideas', show: true },
    { id: 'guided', label: 'Check your understanding', show: guided.length > 0 },
    { id: 'flashcards', label: 'Flashcards', show: !lesson.isExtra },
    { id: 'problem-types', label: 'Problem types', show: types.length > 0 },
    { id: 'exam-questions', label: 'Exam questions', show: true },
  ].filter((t) => t.show)

  return (
    <section className="lesson-page">
      <header className="lesson-head">
        <h2>{lesson.title}</h2>
        {error && <p role="alert">{error}</p>}
        <p className="lesson-meta">
          {lesson.sections.length > 0 && <span>{`Sections ${lesson.sections.join(', ')}`}</span>}
          {!lesson.isExtra && (
            <>
              <a href={lesson.videoUrl} target="_blank" rel="noreferrer">
                Video
              </a>
              <a href={lesson.notesUrl} target="_blank" rel="noreferrer">
                Notes
              </a>
            </>
          )}
          {mastery && <span>{mastery.score === null ? 'Untested' : `Mastery: ${Math.round(mastery.score * 100)}%`}</span>}
        </p>
        {lesson.isExtra && (
          <p className="note">
            This topic is on older MA 16200 exams but is not part of Dr. Chen's Fall 2023 lessons, so it has no video,
            notes, or flashcards, and it doesn't count toward lesson mastery.
          </p>
        )}
        <div className="lesson-actions">
          {guided.length > 0 && (
            <Link to={{ hash: '#guided' }} className="button primary">
              {`Guided problems: ${guidedDone} of ${guided.length} done`}
            </Link>
          )}
          <Link to={`/practice?lesson=${lesson.id}`} className={guided.length > 0 ? 'button' : 'button primary'}>
            {lesson.isExtra ? 'Practice this topic' : 'Practice this lesson'}
          </Link>
        </div>
        <nav aria-label="On this page" className="lesson-toc">
          {toc.map((t) => (
            <Link key={t.id} to={{ hash: `#${t.id}` }}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <h3 id="key-ideas">Key ideas</h3>
      {lesson.keyIdeas ? <Markdown text={lesson.keyIdeas} /> : <p>No key ideas yet.</p>}
      {guided.length > 0 && (
        <section className="lesson-guided" id="guided">
          <h3>Check your understanding</h3>
          <p className="panel-hint">
            Work each problem a step at a time. Written for this app in the style of the course. These are not Purdue
            problems.
          </p>
          <ul className="guided-list">
            {guided.map((g, i) => (
              <li key={g.id} className="guided-card">
                <header className="guided-card-head">
                  <h4>{`Problem ${i + 1}`}</h4>
                  <span className="type-meta">{content.typeById.get(g.typeId)?.name}</span>
                  {doneGuided.has(g.id) && <span className="card-tag card-tag-later">Done</span>}
                </header>
                <GuidedProblemView problem={g} onFinish={(o) => void onGuidedFinish(g.id, o)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!lesson.isExtra && (
        <section className="lesson-cards" id="flashcards">
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
      {types.length > 0 && (
        <section className="lesson-types" id="problem-types">
          <h3>Problem types</h3>
          <ul>
            {types.map((t) => {
              const count = content.questionsByType.get(t.id)?.length ?? 0
              const score = byType.get(t.id)?.score ?? null
              return (
                <li key={t.id}>
                  <span className="type-name">{t.name}</span>
                  <span className="type-meta">
                    {`${count} ${count === 1 ? 'question' : 'questions'}, ${score === null ? 'untested' : `${Math.round(score * 100)}%`}`}
                  </span>
                  {count > 0 && (
                    <Link to={practiseTypeLink(t.id)} aria-label={`Practise this type: ${t.name}`}>
                      Practise this type
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <h3 id="exam-questions">Exam questions</h3>
      {questions.length === 0 ? (
        <p>No exam questions yet.</p>
      ) : (
        <ul className="exam-question-list">
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
