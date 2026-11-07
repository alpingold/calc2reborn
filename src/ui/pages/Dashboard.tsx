import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { lessonMastery } from '../../engine/mastery'
import type { Mastery } from '../../engine/mastery'
import { coveredLessonIds, dailyQueue } from '../../engine/queue'
import { useContent, useNow, useScheduler, useSettings, useStore } from '../../storage/context'
import { MasteryGrid } from '../MasteryGrid'

function daysUntil(examDate: string, now: Date): number {
  const [y, m, d] = examDate.split('-').map(Number)
  const exam = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((exam.getTime() - today.getTime()) / 86400000)
}

function examLine(days: number): string {
  if (days < 0) return 'Exam has passed'
  if (days === 0) return 'Exam is today'
  return `${days} ${days === 1 ? 'day' : 'days'} until the exam`
}

export function Dashboard() {
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const { settings, save } = useSettings()
  const now = useNow()
  const [mastery, setMastery] = useState<Map<string, Mastery> | null>(null)
  const [dueCount, setDueCount] = useState<number | null>(null)
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)

  const planned = useMemo(() => content.lessons.filter((l) => !l.isReview), [content.lessons])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [attempts, states] = await Promise.all([store.listAttempts(), store.listCardStates()])
        if (cancelled) return
        setMastery(
          lessonMastery(
            attempts,
            content.questionById,
            planned.map((l) => l.id),
          ),
        )
        setDueCount(
          dailyQueue({
            now: now(),
            cards: content.cards,
            states,
            lessons: content.lessons,
            settings,
            isDue: scheduler.isDue,
          }).due.length,
        )
      } catch {
        if (!cancelled) setError('Could not load your progress.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, scheduler, content, settings, now, planned])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    const id = pick || planned[0]?.id
    if (!id) return
    try {
      await save({ ...settings, currentLessonId: id })
    } catch {
      setError('Could not save your setting. Try again.')
    }
  }

  const weakest = useMemo(() => {
    if (!mastery) return []
    const allowed = settings.examLessonIds.length ? new Set(settings.examLessonIds) : null
    return coveredLessonIds(content.lessons, settings.currentLessonId)
      .filter((id) => !allowed || allowed.has(id))
      .map((id, i) => ({ id, i, score: mastery.get(id)?.score ?? null }))
      .sort((a, b) => {
        if (a.score === null || b.score === null) {
          return a.score === b.score ? a.i - b.i : a.score === null ? -1 : 1
        }
        return a.score - b.score || a.i - b.i
      })
      .slice(0, 5)
      .map((x) => content.lessonById.get(x.id)!)
  }, [mastery, settings.examLessonIds, settings.currentLessonId, content])

  return (
    <section>
      <h2>Dashboard</h2>
      {error && <p role="alert">{error}</p>}
      {settings.currentLessonId === null && (
        <form onSubmit={(e) => void onSave(e)}>
          <p>Where are you in the course?</p>
          <label>
            Current lesson
            <select value={pick || planned[0]?.id} onChange={(e) => setPick(e.target.value)}>
              {planned.map((l) => (
                <option key={l.id} value={l.id}>{`L${l.number} · ${l.title}`}</option>
              ))}
            </select>
          </label>
          <button type="submit">Save</button>
        </form>
      )}
      {dueCount !== null && <p>{`Cards due today: ${dueCount}`}</p>}
      <p>
        <Link to="/review">Review cards</Link> <Link to="/practice">Start smart practice</Link>
      </p>
      {settings.examDate && (
        <div>
          <p>{examLine(daysUntil(settings.examDate, now()))}</p>
          <h3>Weakest lessons</h3>
          <ul>
            {weakest.map((l) => (
              <li key={l.id}>
                <Link to={`/course/${l.id}`}>{`L${l.number} · ${l.title}`}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <MasteryGrid lessons={content.lessons} mastery={mastery ?? new Map()} currentLessonId={settings.currentLessonId} />
    </section>
  )
}
