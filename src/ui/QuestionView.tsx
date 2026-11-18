import { useCallback, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { CHOICE_LABELS } from '../content/schema'
import type { Choice, Question } from '../content/schema'
import { useContent, useNow } from '../storage/context'
import { examTitle } from './examSession'
import { Markdown } from './Markdown'
import { FeedbackMain, FeedbackSide } from './FeedbackPanel'
import { CheckIcon, CrossIcon } from './shell'

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
  /** once revealed, on results: a link to Practice on the same problem type */
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
  similarHref,
}: QuestionViewProps): JSX.Element {
  const now = useNow()
  const content = useContent()
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

  // where the question is from and its problem type, shown only with the answer: the type's name can
  // give the method away, and a timed exam never reveals anything
  const exam = content.examByQuestionId.get(question.id)
  const chips = revealed
    ? [
        exam ? `${examTitle(exam)}, question ${question.number}` : null,
        ...(question.typeIds ?? []).map((id) => {
          const type = content.typeById.get(id)
          const lesson = type ? content.lessonById.get(type.lessonId) : undefined
          if (!type) return null
          return lesson && !lesson.isExtra ? `Lesson ${lesson.number} · ${type.name}` : type.name
        }),
      ].filter((c) => c !== null)
    : []

  return (
    <article className={revealed ? 'question split' : 'question'}>
      <div className="split-main question-main">
        {chips.length > 0 && (
          <ul className="chips" aria-label="About this question">
            {chips.map((c) => (
              <li key={c} className="chip">
                {c}
              </li>
            ))}
          </ul>
        )}
        <Markdown text={question.stem} className="question-stem" />
        {question.figures?.map((path) => (
          <img key={path} className="figure" src={'/' + path} alt={`Figure for question ${question.number}`} />
        ))}
        <div className="choices">
          {question.choices.map((c) => {
            const mark = choiceMark(c.label)
            return (
              <button
                key={c.label}
                type="button"
                className={choiceClass(c.label)}
                aria-pressed={chosen === c.label}
                disabled={revealed}
                onClick={() => onChoose(c.label)}
              >
                <strong className="choice-label">{c.label}</strong> <Markdown text={c.text} className="choice-text" />
                {mark && (
                  <span className="choice-mark">
                    {' '}
                    {mark === 'Correct answer' ? <CheckIcon /> : <CrossIcon />}
                    {mark}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {mode === 'immediate' && onSubmit && !revealed && (
          <button type="button" className="primary button-large question-submit" disabled={!chosen} onClick={submit}>
            {submitLabel}
          </button>
        )}
        {revealed && <FeedbackMain question={question} chosen={chosen} />}
      </div>
      {revealed && (
        <FeedbackSide question={question} chosen={chosen} lessonTitle={lessonTitle} lessonHref={lessonHref} similarHref={similarHref} />
      )}
    </article>
  )
}
