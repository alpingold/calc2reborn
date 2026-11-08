import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNow, useStore } from '../storage/context'
import type { FlagReason } from '../storage/types'
import { newId } from '../ids'

export const REASON_LABELS: Record<FlagReason, string> = {
  answer: 'Wrong answer',
  display: 'Typo or math display',
  unclear: 'Unclear or other',
}

/** A small form, shown under a revealed answer, that saves a problem report in this browser. */
export function ReportProblem({ questionId }: { questionId: string }) {
  const store = useStore()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<FlagReason | null>(null)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!reason) return
    setError(null)
    try {
      await store.saveFlag({ id: newId(), questionId, reason, note: note.trim(), timestamp: now().toISOString() })
    } catch {
      setError('Could not save the report. Try again.')
      return
    }
    setSaved(true)
    setOpen(false)
  }

  if (saved) {
    return <p className="report-saved">Report saved. Copy your reports from Settings to send them.</p>
  }
  if (!open) {
    return (
      <button type="button" className="link-button" data-own-enter onClick={() => setOpen(true)}>
        Report a problem
      </button>
    )
  }
  return (
    // data-own-enter: Enter in this form must not submit an answer or move to the next question
    <form className="report-form" data-own-enter onSubmit={(e) => void onSave(e)}>
      <fieldset>
        <legend>What is wrong?</legend>
        {(Object.keys(REASON_LABELS) as FlagReason[]).map((r) => (
          <label key={r} className="choice-row">
            <input type="radio" name={`reason-${questionId}`} checked={reason === r} onChange={() => setReason(r)} />
            {REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <label className="report-note">
        Note (optional)
        <textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <p className="exam-controls">
        <button type="submit" disabled={!reason}>
          Save report
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </p>
    </form>
  )
}
