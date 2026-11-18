import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { lessonMastery, typeMastery } from '../../engine/mastery'
import type { Mastery } from '../../engine/mastery'
import { lessonRange, rangeEnds } from '../../engine/scope'
import { todayPlan, type PlanItem } from '../../engine/today'
import type { SessionRecord } from '../../storage/types'
import { isPlanned } from '../../content/schema'
import { lessonCheckedToday, markLessonChecked } from '../../lessonCheck'
import { useContent, useNow, useScheduler, useSettings, useStore } from '../../storage/context'
import { MasteryGrid } from '../MasteryGrid'
import { ReadinessPanel } from '../ReadinessPanel'
import { typeTallies } from '../record'
import type { Tally } from '../record'
import { TodayPlan } from '../TodayPlan'

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']

export function Dashboard() {
  const store = useStore()
  const scheduler = useScheduler()
  const content = useContent()
  const { settings, save } = useSettings()
  const now = useNow()
  const [mastery, setMastery] = useState<Map<string, Mastery> | null>(null)
  const [byType, setByType] = useState<Map<string, Mastery>>(new Map())
  const [tallies, setTallies] = useState<Map<string, Tally>>(new Map())
  const [plan, setPlan] = useState<PlanItem[] | null>(null)
  const [records, setRecords] = useState<SessionRecord[]>([])
  const [pick, setPick] = useState('')
  // the optional exam fields of the first-launch card
  const [examDate, setExamDate] = useState('')
  const [examFrom, setExamFrom] = useState('')
  const [examTo, setExamTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  // once a day this page asks whether the current lesson is still right
  const [checked, setChecked] = useState(() => lessonCheckedToday(now()))

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
        setTallies(typeTallies(attempts, content.questionById))
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
      await save({
        ...settings,
        currentLessonId: id,
        examDate: examDate === '' ? settings.examDate : examDate,
        examLessonIds: examFrom ? lessonRange(content.lessons, examFrom, examTo || examFrom) : settings.examLessonIds,
      })
      confirmLesson()
    } catch {
      setError('Could not save your setting. Try again.')
    }
  }

  function onExamFrom(id: string) {
    setExamFrom(id)
    // a new start fills an empty end, so one choice is already a valid range
    if (id !== '' && examTo === '') setExamTo(id)
    if (id === '') setExamTo('')
  }

  const current = settings.currentLessonId ? content.lessonById.get(settings.currentLessonId) : undefined
  // the lesson after the current one in Dr. Chen's sequence; none after the last
  const at = current ? planned.findIndex((l) => l.id === current.id) : -1
  const following = at >= 0 ? planned[at + 1] : undefined

  function confirmLesson() {
    markLessonChecked(now())
    setChecked(true)
  }

  /** Makes `id` the current lesson; choosing a lesson also answers today's question. */
  async function setLesson(id: string) {
    try {
      await save({ ...settings, currentLessonId: id })
      confirmLesson()
    } catch {
      setError('Could not save your setting. Try again.')
    }
  }

  async function onAdvance() {
    if (following) await setLesson(following.id)
  }

  const today = now().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const steps = plan?.length ?? 0
  const ends = rangeEnds(content.lessons, settings.examLessonIds)
  const examFromLesson = ends ? content.lessonById.get(ends.from) : undefined
  const examToLesson = ends ? content.lessonById.get(ends.to) : undefined
  const examNote =
    examFromLesson && examToLesson
      ? examFromLesson.id === examToLesson.id
        ? `Lesson ${examFromLesson.number} is on your next exam.`
        : `Lessons ${examFromLesson.number} to ${examToLesson.number} are on your next exam.`
      : undefined

  return (
    <section className="dashboard">
      <div className="split">
        <div className="split-main today-main">
          <header className="page-head">
            <p className="eyebrow">{current ? `${today} · You are on Lesson ${current.number}` : today}</p>
            <h2>Today's session</h2>
            {steps > 0 && (
              <p className="page-lede">
                {steps === 1
                  ? 'One step today.'
                  : `${COUNT_WORDS[steps] ?? steps} steps, in the order that helps most. Stop after any of them.`}
              </p>
            )}
          </header>
          {error && <p role="alert">{error}</p>}
          {settings.currentLessonId === null && (
            <form className="card card-strong onboarding" onSubmit={(e) => void onSave(e)}>
              <p className="onboarding-ask">Where are you in the course?</p>
              <label>
                Current lesson
                <select value={pick || planned[0]?.id} onChange={(e) => setPick(e.target.value)}>
                  {planned.map((l) => (
                    <option key={l.id} value={l.id}>{`L${l.number}: ${l.title}`}</option>
                  ))}
                </select>
              </label>
              <fieldset className="onboarding-exam">
                <legend>Your next exam (optional)</legend>
                <p className="hint">With a date and the lessons it covers, this page shows how ready you are for it.</p>
                <label>
                  Exam date
                  <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                </label>
                <label>
                  First lesson on the exam
                  <select value={examFrom} onChange={(e) => onExamFrom(e.target.value)}>
                    <option value="">Not set</option>
                    {planned.map((l) => (
                      <option key={l.id} value={l.id}>{`L${l.number}: ${l.title}`}</option>
                    ))}
                  </select>
                </label>
                {examFrom !== '' && (
                  <label>
                    Last lesson on the exam
                    <select value={examTo} onChange={(e) => setExamTo(e.target.value)}>
                      {planned.map((l) => (
                        <option key={l.id} value={l.id}>{`L${l.number}: ${l.title}`}</option>
                      ))}
                    </select>
                  </label>
                )}
              </fieldset>
              <button type="submit" className="primary button-large">
                Save
              </button>
            </form>
          )}
          {current && !checked && (
            <section className="card lesson-check" aria-label="Check your current lesson">
              <p className="lesson-check-ask">{`Are you still on Lesson ${current.number}: ${current.title}?`}</p>
              <p className="hint">Today's plan follows the lesson you are on in class.</p>
              <div className="lesson-check-actions">
                <button type="button" className="primary" onClick={confirmLesson}>
                  {`Yes, still on Lesson ${current.number}`}
                </button>
                {following && (
                  <button type="button" onClick={() => void onAdvance()}>
                    {`No, I'm on Lesson ${following.number}`}
                  </button>
                )}
                <label className="lesson-check-other">
                  A different lesson
                  <select value={current.id} onChange={(e) => void setLesson(e.target.value)}>
                    {planned.map((l) => (
                      <option key={l.id} value={l.id}>{`L${l.number}: ${l.title}`}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}
          {plan && <TodayPlan items={plan} content={content} />}
          {current && following && checked && (
            <p className="advance">
              {`Finished Lesson ${current.number} in class? `}
              <button type="button" className="link-button" onClick={() => void onAdvance()}>
                {`Move on to Lesson ${following.number}`}
              </button>
            </p>
          )}
        </div>
        {(settings.examDate || settings.examLessonIds.length > 0) && (
          <div className="split-side">
            <ReadinessPanel settings={settings} content={content} mastery={byType} tallies={tallies} records={records} now={now()} />
          </div>
        )}
      </div>
      <MasteryGrid
        lessons={content.lessons}
        mastery={mastery ?? new Map()}
        currentLessonId={settings.currentLessonId}
        note={examNote}
      />
    </section>
  )
}
