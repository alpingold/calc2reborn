import type { JSX } from 'react'
import { Link } from 'react-router'
import type { Choice, Question } from '../content/schema'
import { useContent } from '../storage/context'
import { Markdown } from './Markdown'
import { ReportProblem } from './ReportProblem'

export interface FeedbackPanelProps {
  question: Question
  chosen?: Choice['label']
  lessonTitle?: string
  lessonHref?: string
  /** Practice: serve another question of the same problem type next */
  onSimilar?: () => void
  /** results: a link to Practice on the same problem type */
  similarHref?: string
}

/**
 * Everything shown once a question is answered: the verdict, the solution, where the official answer
 * can be read, the problem type, and after a miss the flashcards for that type and a way to try a
 * similar question. The parts that depend on problem types are left out for a question without any.
 */
export function FeedbackPanel({ question, chosen, lessonTitle, lessonHref, onSimilar, similarHref }: FeedbackPanelProps): JSX.Element {
  const content = useContent()
  const isCorrect = chosen === question.answer
  const exam = content.examByQuestionId.get(question.id)
  const types = (question.typeIds ?? []).flatMap((id) => {
    const t = content.typeById.get(id)
    return t ? [t] : []
  })

  const cards = isCorrect
    ? []
    : [...new Map(types.flatMap((t) => content.cardsByType.get(t.id) ?? []).map((c) => [c.id, c])).values()]
  const hasSibling = types.some((t) => (content.questionsByType.get(t.id) ?? []).some((q) => q.id !== question.id))

  return (
    <div className="feedback">
      <p role="status">{isCorrect ? 'Correct' : 'Not quite'}</p>
      {question.answerSource === 'written' && (
        <p>
          This question was written for this app, not taken from a Purdue exam. Its answer was checked independently
          but may contain errors.
        </p>
      )}
      {question.answerSource === 'derived' && (
        <p>No official answer key exists for this exam. This answer was worked out independently and may contain errors.</p>
      )}
      {question.solution && <Markdown text={question.solution} />}
      {exam && !exam.unofficial && (exam.answersUrl || exam.solutionsUrl) && (
        <p className="feedback-sources">
          {exam.answersUrl && (
            <a href={exam.answersUrl} target="_blank" rel="noreferrer">
              Answer key (PDF)
            </a>
          )}
          {exam.answersUrl && exam.solutionsUrl && ' '}
          {exam.solutionsUrl && (
            <a href={exam.solutionsUrl} target="_blank" rel="noreferrer">
              Official solutions (PDF)
            </a>
          )}
        </p>
      )}
      {types.length > 0 && (
        <p className="feedback-type">{`${types.length === 1 ? 'Problem type' : 'Problem types'}: ${types.map((t) => t.name).join('; ')}`}</p>
      )}
      {lessonTitle && lessonHref && <Link to={lessonHref}>{lessonTitle}</Link>}
      {cards.length > 0 && (
        // data-own-enter: Enter on the summary opens the list instead of moving to the next question
        <details className="feedback-cards" data-own-enter>
          <summary>{`Related flashcards (${cards.length})`}</summary>
          <ul>
            {cards.map((c) => (
              <li key={c.id}>
                <Markdown text={c.front} className="flashcard-text" />
                <Markdown text={c.back} className="flashcard-back" />
              </li>
            ))}
          </ul>
        </details>
      )}
      {hasSibling && onSimilar && (
        <p>
          <button type="button" data-own-enter onClick={onSimilar}>
            Try a similar question
          </button>
        </p>
      )}
      {hasSibling && !onSimilar && similarHref && (
        <p>
          <Link to={similarHref}>Try a similar question</Link>
        </p>
      )}
      <div className="report-row">
        <ReportProblem key={question.id} questionId={question.id} />
      </div>
    </div>
  )
}
