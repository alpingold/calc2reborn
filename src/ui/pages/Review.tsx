import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { dailyQueue } from '../../engine/queue'
import { examScope } from '../../engine/scope'
import type { Rating } from '../../engine/fsrs'
import type { ConceptCard } from '../../content/schema'
import type { CardState } from '../../storage/types'
import { useContent, useNow, useScheduler, useSettings, useStore } from '../../storage/context'
import { Markdown } from '../Markdown'

interface Item {
  card: ConceptCard
  state?: CardState
}

const HOUR = 3600_000
const LABELS: [Rating, string][] = [
  [1, 'Again'],
  [2, 'Hard'],
  [3, 'Good'],
  [4, 'Easy'],
]

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

  const [items, setItems] = useState<Item[] | null>(null)
  const [summary, setSummary] = useState({ due: 0, fresh: 0 })
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let states: CardState[]
      try {
        states = await store.listCardStates()
      } catch {
        if (!cancelled) setError('Could not load your cards.')
        return
      }
      const scope = examScope(settings, content.lessons, now())
      const q = dailyQueue({
        focusLessonIds: scope.active ? scope.lessonIds : undefined,
        now: now(),
        cards: content.cards,
        states,
        lessons: content.lessons,
        settings,
        isDue: scheduler.isDue,
      })
      if (cancelled) return
      const due: Item[] = []
      for (const s of q.due) {
        const card = content.cardById.get(s.cardId)
        if (card) due.push({ card, state: s })
      }
      setSummary({ due: q.due.length, fresh: q.fresh.length })
      setItems([...due, ...q.fresh.map((card) => ({ card }))])
    })()
    return () => {
      cancelled = true
    }
    // session is built once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        if (rating <= 2 && new Date(next.fsrs.dueAt).getTime() <= t.getTime() + HOUR) {
          out.push({ card: current.card, state: next })
        }
        return out
      })
      setIndex((i) => i + 1)
      busy.current = false
    },
    [current, revealed, scheduler, store, now],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.key === ' ') {
        if (!revealed) {
          e.preventDefault()
          reveal()
        }
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        void rate(Number(e.key) as Rating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, reveal, rate])

  if (!items) {
    return (
      <section>
        <h2>Review</h2>
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }
  if (items.length === 0) {
    return (
      <section>
        <h2>Review</h2>
        <p>Nothing due. Come back tomorrow or practice instead.</p>
      </section>
    )
  }
  if (!current) {
    return (
      <section>
        <h2>Done for today</h2>
        <Link to="/">Back to dashboard</Link>
      </section>
    )
  }

  const t = now()
  const preview = revealed && current.state ? scheduler.preview(current.state, t) : null

  return (
    <section>
      <h2>Review</h2>
      {error && <p role="alert">{error}</p>}
      <p>{`Cards due: ${summary.due} · New: ${summary.fresh}`}</p>
      <Markdown text={current.card.front} />
      {!revealed ? (
        <button type="button" onClick={reveal}>
          Show answer
        </button>
      ) : (
        <>
          <hr />
          <Markdown text={current.card.back} />
          <div>
            {LABELS.map(([r, name]) => (
              <button key={r} type="button" onClick={() => void rate(r)}>
                {`${name} · ${formatInterval(preview![r].getTime() - t.getTime())}`}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
