import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Link } from 'react-router'
import type { Choice, ConceptCard, Question } from '../content/schema'
import { useContent, useStore } from '../storage/context'
import { Markdown } from './Markdown'
import { typeTallies } from './record'
import type { Tally } from './record'
import { ReportProblem } from './ReportProblem'

export interface FeedbackPanelProps {
  question: Question
  chosen?: Choice['label']
  lessonTitle?: string
  lessonHref?: string
  /** results: a link to Practice on the same problem type */
  similarHref?: string
}

/** How many flashcards a missed question shows open; any others are folded away under them. */
const REMEMBER_SHOWN = 2

function useTypes(question: Question) {
  const content = useContent()
  return (question.typeIds ?? []).flatMap((id) => {
    const t = content.typeById.get(id)
    return t ? [t] : []
  })
}

/**
 * The first part of what is shown once a question is answered: the verdict, the worked solution, where
 * the official answer can be read, after a miss a guided problem of the same type, and a way to report
 * a mistake.
 */
export function FeedbackMain({ question, chosen }: Pick<FeedbackPanelProps, 'question' | 'chosen'>): JSX.Element {
  const content = useContent()
  const isCorrect = chosen === question.answer
  const exam = content.examByQuestionId.get(question.id)
  const types = useTypes(question)
  const guided = isCorrect ? undefined : types.flatMap((t) => content.guidedByType.get(t.id) ?? [])[0]
  return (
    <div className="card feedback">
      <p role="status" className={`feedback-verdict ${isCorrect ? 'right' : 'wrong'}`}>
        {isCorrect ? 'Correct' : 'Not quite'}
      </p>
      {question.solution && (
        <>
          <h4 className="label">Worked solution</h4>
          <Markdown text={question.solution} />
        </>
      )}
      {question.answerSource === 'written' && (
        <p className="hint">
          This question was written for this app, not taken from a Purdue exam. Its answer was checked independently
          but may contain errors.
        </p>
      )}
      {question.answerSource === 'derived' && (
        <p className="hint">No official answer key exists for this exam. This answer was worked out independently and may contain errors.</p>
      )}
      {exam && !exam.unofficial && (exam.answersUrl || exam.solutionsUrl) && (
        <p className="feedback-sources">
          {exam.answersUrl && (
            <a href={exam.answersUrl} target="_blank" rel="noreferrer">
              Answer key (PDF)
            </a>
          )}
          {exam.solutionsUrl && (
            <a href={exam.solutionsUrl} target="_blank" rel="noreferrer">
              Official solutions (PDF)
            </a>
          )}
        </p>
      )}
      {guided && (
        <p>
          <Link to={`/course/${guided.lessonId}#guided-${guided.id}`}>Walk through a guided problem of this type</Link>
        </p>
      )}
      <div className="report-row">
        <ReportProblem key={question.id} questionId={question.id} />
      </div>
    </div>
  )
}

function CardList({ cards }: { cards: ConceptCard[] }) {
  return (
    <ul className="remember-list">
      {cards.map((c) => (
        <li key={c.id}>
          <Markdown text={c.front} className="flashcard-text" />
          <Markdown text={c.back} className="flashcard-back" />
        </li>
      ))}
    </ul>
  )
}

/**
 * The second part, beside the first on a wide screen and under it on a phone: after a miss the
 * flashcards for the problem type (two shown, the rest folded), then the type itself with the student's
 * record on it and its lesson. Nothing is drawn for a question without a problem type.
 */
export function FeedbackSide({ question, chosen, lessonTitle, lessonHref, similarHref }: FeedbackPanelProps): JSX.Element | null {
  const content = useContent()
  const store = useStore()
  const isCorrect = chosen === question.answer
  const types = useTypes(question)
  const [tallies, setTallies] = useState<Map<string, Tally> | null>(null)

  const hasTypes = types.length > 0
  useEffect(() => {
    if (!hasTypes) return
    let cancelled = false
    store
      .listAttempts()
      .then((attempts) => {
        if (!cancelled) setTallies(typeTallies(attempts, content.questionById))
      })
      .catch(() => {
        // the record is a convenience: without it the type is still named
      })
    return () => {
      cancelled = true
    }
  }, [store, content.questionById, hasTypes])

  const cards = isCorrect
    ? []
    : [...new Map(types.flatMap((t) => content.cardsByType.get(t.id) ?? []).map((c) => [c.id, c])).values()]
  // the cards about this type alone come first; two are shown, the rest are a click away
  const ranked = [...cards].sort((x, y) => (x.typeIds?.length ?? 0) - (y.typeIds?.length ?? 0))
  const shown = ranked.slice(0, REMEMBER_SHOWN)
  const rest = ranked.slice(REMEMBER_SHOWN)
  const hasSibling = types.some((t) => (content.questionsByType.get(t.id) ?? []).some((q) => q.id !== question.id))
  const lessonLink = lessonTitle && lessonHref ? <Link to={lessonHref}>{lessonTitle}</Link> : null

  if (!hasTypes && !lessonLink) return null
  return (
    <aside className="split-side feedback-side">
      {shown.length > 0 && (
        <section className="card feedback-remember">
          <div className="remember-open">
            <h4 className="label">Remember</h4>
            <CardList cards={shown} />
          </div>
          {rest.length > 0 && (
            // data-own-enter: Enter on the summary opens the list instead of moving to the next question
            <details className="feedback-cards" data-own-enter>
              <summary>{`More flashcards on this (${rest.length})`}</summary>
              <CardList cards={rest} />
            </details>
          )}
        </section>
      )}
      <section className="card feedback-type">
        {hasTypes && <h4 className="label">{types.length === 1 ? 'This problem type' : 'These problem types'}</h4>}
        {types.map((t) => {
          const tally = tallies?.get(t.id)
          return (
            <p key={t.id} className="feedback-type-row">
              <strong>{t.name}</strong>
              {tally && tally.total > 0 && <span className="feedback-record">{`Your record: ${tally.right} of ${tally.total} right`}</span>}
            </p>
          )
        })}
        {lessonLink && <p>{lessonLink}</p>}
        {hasSibling && similarHref && (
          <p>
            <Link to={similarHref}>Try a similar question</Link>
          </p>
        )}
      </section>
    </aside>
  )
}

/** Everything shown once a question is answered, as one block. QuestionView places the two parts itself. */
export function FeedbackPanel(props: FeedbackPanelProps): JSX.Element {
  return (
    <div className="split">
      <div className="split-main">
        <FeedbackMain question={props.question} chosen={props.chosen} />
      </div>
      <FeedbackSide {...props} />
    </div>
  )
}
