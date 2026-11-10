import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { coveredLessonIds, dailyQueue, lessonQueue } from '../../engine/queue'
import { examScope } from '../../engine/scope'
import type { Rating } from '../../engine/fsrs'
import type { ConceptCard } from '../../content/schema'
import type { Attempt, CardState } from '../../storage/types'
import { recentMissTypes } from '../../engine/select'
import { useContent, useNow, useScheduler, useSettings, useStore } from '../../storage/context'
import { Markdown } from '../Markdown'

interface Item {
  card: ConceptCard
  state?: CardState
}

const HOUR = 3600_000
/** Three choices, on keys 1 to 3. FSRS's "Hard" is left out: students could not tell it from "Good". */
const LABELS: [Rating, string][] = [
  [1, 'Forgot'],
  [3, 'Got it'],
  [4, 'Easy'],
]
/** How many new cards "study ahead" adds. */
export const STUDY_AHEAD = 10

function formatInterval(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return '<1m'
  if (min < 60) return `${min}m`
  const h = Math.round(ms / HOUR)
  if (h < 24) return `${h}h`
  return `${Math.round(ms / (24 * HOUR))}d`
}

export function Review() {
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const { settings } = useSettings()
  const now = useNow()

  const [params] = useSearchParams()
  const lessonParam = params.get('lesson')
  const examParam = params.get('exam') === '1'
  const more = Math.max(0, Math.min(100, Number(params.get('more')) || 0))
  const scope = examScope(settings, content.lessons, now())
  // a session on one lesson, or on the exam's lessons, in place of the daily queue
  const scopedLesson = lessonParam ? content.lessonById.get(lessonParam) : undefined
  const scopedIds = scopedLesson ? [scopedLesson.id] : examParam && scope.active ? scope.lessonIds : null
  const sessionKey = `${lessonParam ?? ''}|${examParam}|${more}`

  const [items, setItems] = useState<Item[] | null>(null)
  const [summary, setSummary] = useState({ due: 0, fresh: 0 })
  // new cards not yet started that a "study ahead" session could add
  const [ahead, setAhead] = useState(0)
  const [tally, setTally] = useState({ rated: 0, forgot: 0 })
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setIndex(0)
    setRevealed(false)
    setTally({ rated: 0, forgot: 0 })
    ;(async () => {
      let states: CardState[]
      let attempts: Attempt[]
      try {
        ;[states, attempts] = await Promise.all([store.listCardStates(), store.listAttempts()])
      } catch {
        if (!cancelled) setError('Could not load your cards.')
        return
      }
      const shared = { now: now(), cards: content.cards, states, lessons: content.lessons, isDue: scheduler.isDue }
      const q = scopedIds
        ? lessonQueue({ ...shared, lessonIds: scopedIds })
        : dailyQueue({
            ...shared,
            focusLessonIds: scope.active ? scope.lessonIds : undefined,
            recentMissTypeIds: recentMissTypes(attempts, content.questionById, now()),
            settings,
            extraNew: more,
          })
      if (cancelled) return
      const due: Item[] = []
      for (const s of q.due) {
        const card = content.cardById.get(s.cardId)
        if (card) due.push({ card, state: s })
      }
      // a saved state whose card was removed from the content is skipped, so it is not counted either
      setSummary({ due: due.length, fresh: q.fresh.length })
      setItems([...due, ...q.fresh.map((card) => ({ card }))])
      const covered = new Set(coveredLessonIds(content.lessons, settings.currentLessonId))
      const started = new Set(states.map((s) => s.cardId))
      const queued = new Set(q.fresh.map((c) => c.id))
      setAhead(content.cards.filter((c) => covered.has(c.lessonId) && !started.has(c.id) && !queued.has(c.id)).length)
    })()
    return () => {
      cancelled = true
    }
    // a session is built once, and again only when the address asks for a different one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  const current = items?.[index]

  const reveal = useCallback(() => {
    if (!current || revealed) return
    if (!current.state) {
      const state = scheduler.newState(current.card.id, now())
      setItems((prev) => prev && prev.map((it, i) => (i === index ? { ...it, state } : it)))
    }
    setRevealed(true)
  }, [current, revealed, scheduler, now, index])

  const rate = useCallback(
    async (rating: Rating) => {
      if (busy.current || !current?.state || !revealed) return
      busy.current = true
      setError(null)
      setRevealed(false)
      const t = now()
      const next = scheduler.review(current.state, rating, t)
      try {
        await store.saveCardState(next)
      } catch {
        setError('Could not save your rating. Try again.')
        setRevealed(true)
        busy.current = false
        return
      }
      setItems((prev) => {
        if (!prev) return prev
        const out = [...prev]
        // a forgotten card comes back before the session ends
        if (rating === 1) out.push({ card: current.card, state: next })
        return out
      })
      setTally((c) => ({ rated: c.rated + 1, forgot: c.forgot + (rating === 1 ? 1 : 0) }))
      setIndex((i) => i + 1)
      busy.current = false
    },
    [current, revealed, scheduler, store, now],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (e.key === ' ') {
        if (!revealed) {
          e.preventDefault()
          reveal()
        }
      } else if (revealed && ['1', '2', '3'].includes(e.key)) {
        void rate(LABELS[Number(e.key) - 1][0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, reveal, rate])

  const title = 'Flashcards'
  const scopeLine = scopedLesson
    ? `Lesson ${scopedLesson.number}: ${scopedLesson.title}`
    : scopedIds
      ? 'The lessons on your exam'
      : null
  // ways to keep going once the queue is empty
  const moreLinks = (
    <div className="actions review-more">
      {!scopedIds && ahead > 0 && (
        <Link to={`/review?more=${more + STUDY_AHEAD}`} className="button">
          {`Study ${Math.min(STUDY_AHEAD, ahead)} more new ${Math.min(STUDY_AHEAD, ahead) === 1 ? 'card' : 'cards'}`}
        </Link>
      )}
      {!scopedIds && scope.active && (
        <Link to="/review?exam=1" className="button">
          Study all exam cards
        </Link>
      )}
      {scopedLesson && (
        <Link to={`/course/${scopedLesson.id}`} className="button">
          Back to the lesson
        </Link>
      )}
      <Link to="/" className="button">
        Back to dashboard
      </Link>
    </div>
  )

  if (!items) {
    return (
      <section>
        <h2>{title}</h2>
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }
  if (items.length === 0) {
    return (
      <section>
        <h2>{title}</h2>
        {scopeLine && <p className="review-count">{scopeLine}</p>}
        <p>
          {scopedIds
            ? 'No cards here are due or new. The ones you have started will come back on their review dates.'
            : 'Nothing due. Come back tomorrow or practice instead.'}
        </p>
        {moreLinks}
      </section>
    )
  }
  if (!current) {
    return (
      <section>
        <h2>{scopedIds ? 'Session finished' : 'Done for today'}</h2>
        <p>
          {`You went through ${tally.rated - tally.forgot} ${tally.rated - tally.forgot === 1 ? 'card' : 'cards'}`}
          {tally.forgot > 0 ? `, and forgot ${tally.forgot === 1 ? 'one' : tally.forgot} along the way.` : ' without forgetting any.'}
        </p>
        {moreLinks}
      </section>
    )
  }

  const t = now()
  const preview = revealed && current.state ? scheduler.preview(current.state, t) : null
  const cardLesson = content.lessonById.get(current.card.lessonId)

  return (
    <section className="review-page">
      <h2>{title}</h2>
      {error && <p role="alert">{error}</p>}
      {scopeLine && <p className="review-count">{scopeLine}</p>}
      <p className="review-count">
        <span>{`Card ${index + 1} of ${items.length}`}</span> <span>{`Cards due: ${summary.due} · New: ${summary.fresh}`}</span>
      </p>
      <div className="panel review-card">
        {cardLesson && !scopedLesson && (
          <p className="review-lesson">
            <Link to={`/course/${cardLesson.id}`}>{`Lesson ${cardLesson.number}: ${cardLesson.title}`}</Link>
          </p>
        )}
        <Markdown text={current.card.front} className="review-front" />
        {!revealed ? (
          <button type="button" className="primary" onClick={reveal}>
            Show answer
          </button>
        ) : (
          <>
            <hr />
            <Markdown text={current.card.back} />
            <p className="review-ask">How well did you know it?</p>
            <div className="review-ratings">
              {LABELS.map(([r, name]) => (
                <button key={r} type="button" onClick={() => void rate(r)}>
                  <strong>{name}</strong>
                  <span className="review-interval">{`next in ${formatInterval(preview![r].getTime() - t.getTime())}`}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="panel-hint review-keys">Keyboard: Space shows the answer, then 1, 2 or 3 rates it.</p>
    </section>
  )
}
