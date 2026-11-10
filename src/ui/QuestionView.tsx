import { useCallback, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { CHOICE_LABELS } from '../content/schema'
import type { Choice, Question } from '../content/schema'
import { useNow } from '../storage/context'
import { Markdown } from './Markdown'
import { FeedbackPanel } from './FeedbackPanel'

export interface QuestionViewProps {
  question: Question
  mode: 'immediate' | 'deferred' // immediate: submit reveals feedback; deferred (exams): only records the choice
  chosen?: Choice['label']
  onChoose(label: Choice['label']): void
  onSubmit?(label: Choice['label'], seconds: number): void
  revealed?: boolean
  lessonTitle?: string
  lessonHref?: string
  // the label of the button that reveals feedback in immediate mode
  submitLabel?: string
  /** once revealed: serve a similar question next (Practice), or link to one (results) */
  onSimilar?: () => void
  similarHref?: string
}

const KEY_TO_LABEL: Record<string, Choice['label']> = Object.fromEntries(
  CHOICE_LABELS.map((label) => [label.toLowerCase(), label]),
)

function isFormField(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function QuestionView({
  question,
  mode,
  chosen,
  onChoose,
  onSubmit,
  revealed = false,
  lessonTitle,
  lessonHref,
  submitLabel = 'Submit',
  onSimilar,
  similarHref,
}: QuestionViewProps): JSX.Element {
  const now = useNow()
  const startedAt = useRef(0)

  useEffect(() => {
    startedAt.current = now().getTime()
    // the timer restarts only when a different question appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id])

  const submit = useCallback(() => {
    if (mode !== 'immediate' || !onSubmit || !chosen || revealed) return
    const seconds = Math.max(0, Math.round((now().getTime() - startedAt.current) / 100) / 10)
    onSubmit(chosen, seconds)
  }, [mode, onSubmit, chosen, revealed, now])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isFormField(e.target) || revealed) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') {
        // a focused link, or a control marked data-own-enter, keeps its own Enter behavior
        const target = e.target as HTMLElement | null
        if (target?.tagName === 'A' || target?.closest?.('[data-own-enter]')) return
        if (mode === 'immediate' && chosen) {
          // keep a focused button from also activating on this Enter
          e.preventDefault()
          submit()
        }
        return
      }
      const label = KEY_TO_LABEL[e.key.toLowerCase()]
      if (label && question.choices.some((c) => c.label === label)) onChoose(label)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, mode, chosen, submit, onChoose, question.choices])

  // read after the choice's own text, which stays in the button's accessible name
  function choiceMark(label: Choice['label']): string | undefined {
    if (!revealed) return undefined
    if (label === question.answer) return 'Correct answer'
    if (label === chosen) return 'Your answer'
    return undefined
  }

  function choiceClass(label: Choice['label']): string {
    if (!revealed) return 'choice'
    if (label === question.answer) return 'choice correct'
    if (label === chosen) return 'choice wrong'
    return 'choice'
  }

  return (
    <article className="question">
      <Markdown text={question.stem} />
      {question.figures?.map((path) => (
        <img key={path} src={'/' + path} alt={`Figure for question ${question.number}`} />
      ))}
      <div className="choices">
        {question.choices.map((c) => (
          <button
            key={c.label}
            type="button"
            className={choiceClass(c.label)}
            aria-pressed={chosen === c.label}
            disabled={revealed}
            onClick={() => onChoose(c.label)}
          >
            <strong className="choice-label">{c.label}</strong> <Markdown text={c.text} className="choice-text" />
            {choiceMark(c.label) && <span className="visually-hidden"> {choiceMark(c.label)}</span>}
          </button>
        ))}
      </div>
      {mode === 'immediate' && onSubmit && !revealed && (
        <button type="button" disabled={!chosen} onClick={submit}>
          {submitLabel}
        </button>
      )}
      {revealed && (
        <FeedbackPanel
          question={question}
          chosen={chosen}
          lessonTitle={lessonTitle}
          lessonHref={lessonHref}
          onSimilar={onSimilar}
          similarHref={similarHref}
        />
      )}
    </article>
  )
}
