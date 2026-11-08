import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useContent, useSettings, useStore } from '../../storage/context'
import { parseSnapshot } from '../../storage/snapshot'
import { DEFAULT_SETTINGS } from '../../storage/types'
import { lessonRange, rangeEnds } from '../../engine/scope'

const DAILY_ERROR = 'Enter a number from 0 to 100'

export function Settings() {
  const { settings, save } = useSettings()
  const store = useStore()
  const content = useContent()
  const lessons = useMemo(() => content.lessons.filter((l) => !l.isReview), [content])

  const [currentLessonId, setCurrentLessonId] = useState(settings.currentLessonId ?? '')
  const [daily, setDaily] = useState(String(settings.dailyNewCards))
  const [examDate, setExamDate] = useState(settings.examDate ?? '')
  const ends = (ids: string[]) => rangeEnds(content.lessons, ids)
  const [examFrom, setExamFrom] = useState(ends(settings.examLessonIds)?.from ?? '')
  const [examTo, setExamTo] = useState(ends(settings.examLessonIds)?.to ?? '')
  const [error, setError] = useState<string | null>(null)
  // the daily-cards value failed the last save; cleared as soon as it is edited
  const [dailyInvalid, setDailyInvalid] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    setCurrentLessonId(settings.currentLessonId ?? '')
    setDaily(String(settings.dailyNewCards))
    setExamDate(settings.examDate ?? '')
    setExamFrom(rangeEnds(content.lessons, settings.examLessonIds)?.from ?? '')
    setExamTo(rangeEnds(content.lessons, settings.examLessonIds)?.to ?? '')
  }, [settings, content.lessons])

  function onExamFrom(id: string) {
    setExamFrom(id)
    // a new start fills an empty end, so one choice is already a valid range
    if (id !== '' && examTo === '') setExamTo(id)
    if (id === '') setExamTo('')
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    const n = Number(daily)
    if (daily.trim() === '' || !Number.isInteger(n) || n < 0 || n > 100) {
      setError(DAILY_ERROR)
      setDailyInvalid(true)
      return
    }
    setError(null)
    try {
      await save({
        currentLessonId: currentLessonId === '' ? null : currentLessonId,
        examDate: examDate === '' ? null : examDate,
        examLessonIds: examFrom && examTo ? lessonRange(content.lessons, examFrom, examTo) : [],
        dailyNewCards: n,
      })
    } catch {
      setError('Could not save your settings.')
      return
    }
    setStatus('Saved')
  }

  async function onExport() {
    setError(null)
    setStatus(null)
    try {
      const snapshot = await store.exportAll()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ma16200-progress-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not export progress.')
    }
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    setStatus(null)
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      setError('Not valid JSON')
      input.value = ''
      return
    }
    input.value = ''
    const parsed = parseSnapshot(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    try {
      // one transaction: a failure leaves the stored progress as it was
      await store.importAll(parsed.snapshot)
    } catch {
      setError('Could not import progress. Your data was not changed.')
      return
    }
    try {
      await save(parsed.snapshot.settings)
    } catch {
      setError('Progress imported, but the settings could not be applied. Reload the page.')
      return
    }
    setStatus('Progress imported')
  }

  async function onReset() {
    if (!window.confirm('Delete all progress? This cannot be undone.')) return
    setError(null)
    setStatus(null)
    try {
      await store.clear()
      await save(DEFAULT_SETTINGS)
    } catch {
      setError('Could not reset progress.')
      return
    }
    setStatus('Progress reset')
  }

  return (
    <section className="settings">
      <h2>Settings</h2>
      <form className="settings-group" onSubmit={onSave} noValidate>
        <h3>Study plan</h3>
        <p>
          <label>
            Current lesson
            <select value={currentLessonId} onChange={(e) => setCurrentLessonId(e.target.value)}>
              <option value="">Not set</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {`${l.id}: ${l.title}`}
                </option>
              ))}
            </select>
          </label>
        </p>
        <p>
          <label>
            Daily new cards
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={daily}
              aria-invalid={dailyInvalid || undefined}
              aria-describedby={dailyInvalid ? 'daily-error' : undefined}
              onChange={(e) => {
                setDaily(e.target.value)
                setDailyInvalid(false)
              }}
            />
            {dailyInvalid && (
              <span id="daily-error" className="field-error">
                {DAILY_ERROR}
              </span>
            )}
          </label>
        </p>
        <p>
          <label>
            Exam date
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </label>
        </p>
        <fieldset className="lesson-range">
          <legend>Lessons on the exam</legend>
          <label>
            From
            <select value={examFrom} onChange={(e) => onExamFrom(e.target.value)}>
              <option value="">No specific exam</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {`${l.id}: ${l.title}`}
                </option>
              ))}
            </select>
          </label>
          {examFrom !== '' && (
            <label>
              To
              <select value={examTo} onChange={(e) => setExamTo(e.target.value)}>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {`${l.id}: ${l.title}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="panel-hint">Practice, Review and the mock-exam form focus on these lessons until the exam date passes.</p>
        </fieldset>
        <button type="submit" className="primary">
          Save
        </button>
      </form>
      <section className="settings-group">
        <h3>Your data</h3>
        <p className="panel-hint">Progress lives in this browser only. Export it to move it to another device or keep a backup.</p>
        <p>
          <button type="button" onClick={onExport}>
            Export progress
          </button>
        </p>
        <p>
          <label>
            Import progress
            <input type="file" accept="application/json" onChange={onImport} />
          </label>
        </p>
        <p className="danger-zone">
          <button type="button" className="danger" onClick={onReset}>
            Reset progress
          </button>
        </p>
      </section>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
    </section>
  )
}
