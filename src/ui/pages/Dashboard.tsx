import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { lessonMastery, typeMastery } from '../../engine/mastery'
import type { Mastery } from '../../engine/mastery'
import { todayPlan, type PlanItem } from '../../engine/today'
import type { SessionRecord } from '../../storage/types'
import { isPlanned } from '../../content/schema'
import { useContent, useNow, useScheduler, useSettings, useStore } from '../../storage/context'
import { MasteryGrid } from '../MasteryGrid'
import { ReadinessPanel } from '../ReadinessPanel'
import { TodayPlan } from '../TodayPlan'

export function Dashboard() {
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const { settings, save } = useSettings()
  const now = useNow()
  const [mastery, setMastery] = useState<Map<string, Mastery> | null>(null)
  const [byType, setByType] = useState<Map<string, Mastery>>(new Map())
  const [plan, setPlan] = useState<PlanItem[] | null>(null)
  const [records, setRecords] = useState<SessionRecord[]>([])
  const [pick, setPick] = useState('')
  const [error, setError] = useState<string | null>(null)

  const planned = useMemo(() => content.lessons.filter(isPlanned), [content.lessons])

  useEffect(() => {
    let cancelled = false
    setError(null)
    ;(async () => {
      try {
        const [attempts, states, guided, sessions] = await Promise.all([
          store.listAttempts(),
          store.listCardStates(),
          store.listGuidedResults(),
          store.listSessionRecords(),
        ])
        if (cancelled) return
        setMastery(
          lessonMastery(
            attempts,
            content.questionById,
            planned.map((l) => l.id),
          ),
        )
        setByType(typeMastery(attempts, content.questionById, [...content.typeById.keys()]))
        setRecords(sessions)
        setPlan(todayPlan({ now: now(), attempts, states, guided, settings, content, isDue: scheduler.isDue }))
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

  const current = settings.currentLessonId ? content.lessonById.get(settings.currentLessonId) : undefined

  return (
    <section className="dashboard">
      <h2>Dashboard</h2>
      {error && <p role="alert">{error}</p>}
      {settings.currentLessonId === null && (
        <form className="panel onboarding" onSubmit={(e) => void onSave(e)}>
          <p>Where are you in the course?</p>
          <label>
            Current lesson
            <select value={pick || planned[0]?.id} onChange={(e) => setPick(e.target.value)}>
              {planned.map((l) => (
                <option key={l.id} value={l.id}>{`L${l.number}: ${l.title}`}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">
            Save
          </button>
        </form>
      )}
      <div className="today">
        <div className="today-main">
          {plan && <TodayPlan items={plan} content={content} />}
          {current && <p className="today-where">{`You are on Lesson ${current.number}: ${current.title}.`}</p>}
        </div>
        {(settings.examDate || settings.examLessonIds.length > 0) && (
          <ReadinessPanel settings={settings} content={content} mastery={byType} records={records} now={now()} />
        )}
      </div>
      <MasteryGrid lessons={content.lessons} mastery={mastery ?? new Map()} currentLessonId={settings.currentLessonId} />
    </section>
  )
}
