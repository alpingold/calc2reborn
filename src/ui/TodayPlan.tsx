import { Link } from 'react-router'
import type { Content } from '../content'
import { PRACTISE_TARGET, type PlanItem } from '../engine/today'
import { CheckIcon } from './shell'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function reviewText(due: number, fresh: number): string {
  if (due > 0 && fresh > 0) return `Review ${due} due and ${plural(fresh, 'new card', 'new cards')}`
  if (due > 0) return `Review ${plural(due, 'due card', 'due cards')}`
  if (fresh > 0) return `Review ${plural(fresh, 'new card', 'new cards')}`
  return 'Review cards'
}

interface Row {
  text: string
  /** a second, quieter line */
  detail?: string
  to: string
}

function describe(item: PlanItem, content: Content): Row {
  switch (item.kind) {
    case 'guided': {
      const lesson = content.lessonById.get(item.lessonId)
      const n = lesson?.number ?? ''
      return {
        text: item.done
          ? `Work through Lesson ${n}`
          : `Work through Lesson ${n}: ${plural(item.remaining, 'guided problem', 'guided problems')} left`,
        detail: lesson ? `${lesson.title} · worked one step at a time` : undefined,
        to: `/course/${item.lessonId}#guided`,
      }
    }
    case 'review':
      return { text: reviewText(item.due, item.fresh), detail: 'Flashcards, scheduled so each comes back just before you forget it', to: '/review' }
    case 'retry':
      return {
        text: item.done ? 'Retry missed questions' : `Retry ${plural(item.count, 'missed question', 'missed questions')}`,
        detail: 'Missed at least a day ago, so the answer is no longer fresh',
        to: '/practice?retry=1',
      }
    case 'practise': {
      const names = item.typeIds.map((id) => content.typeById.get(id)?.name ?? id)
      const progress = item.done || item.answeredToday === 0 ? `${PRACTISE_TARGET} questions` : `${item.answeredToday} of ${PRACTISE_TARGET} answered`
      return {
        text: `Practise your weakest types: ${names.join(', ')}`,
        detail: progress,
        to: `/practice?types=${item.typeIds.map(encodeURIComponent).join(',')}&n=${PRACTISE_TARGET}`,
      }
    }
  }
}

/**
 * Today's steps. The first one not yet finished is the "Up next" card with the page's one Start button;
 * the others are numbered rows, each a link. A finished step is ticked and no longer a link.
 */
export function TodayPlan({ items, content }: { items: PlanItem[]; content: Content }) {
  if (items.length === 0) {
    return <p className="plan-empty">Nothing planned yet. Set your current lesson to begin.</p>
  }
  const nextIndex = items.findIndex((i) => !i.done)
  const next = nextIndex === -1 ? null : describe(items[nextIndex], content)
  const rest = items.map((item, i) => ({ item, i })).filter(({ i }) => i !== nextIndex)
  return (
    <div className="plan">
      {next ? (
        <div className="card card-strong up-next">
          <div className="up-next-text">
            <p className="eyebrow eyebrow-accent">{`Up next · step ${nextIndex + 1} of ${items.length}`}</p>
            <p className="up-next-title">{next.text}</p>
            {next.detail && <p className="up-next-detail">{next.detail}</p>}
          </div>
          <Link to={next.to} className="button primary button-large" aria-label={`Start: ${next.text}`}>
            Start
          </Link>
        </div>
      ) : (
        <div className="card card-strong up-next">
          <p className="plan-done">Done for today</p>
        </div>
      )}
      {rest.length > 0 && (
        <ol className="card plan-list" aria-label="Other steps today">
          {rest.map(({ item, i }) => {
            const { text, detail, to } = describe(item, content)
            const body = (
              <>
                <span className={item.done ? 'plan-num plan-num-done' : 'plan-num'} aria-hidden="true">
                  {item.done ? <CheckIcon /> : i + 1}
                </span>
                <span className="plan-body">
                  <span className="plan-text">
                    {text}
                    {item.done && <span className="visually-hidden"> (done)</span>}
                  </span>
                  {detail && <span className="plan-detail">{detail}</span>}
                </span>
              </>
            )
            return (
              <li key={item.kind} className={item.done ? 'plan-item done' : 'plan-item'}>
                {item.done ? (
                  <span className="plan-row">{body}</span>
                ) : (
                  <Link to={to} className="plan-row">
                    {body}
                    <svg aria-hidden="true" className="plan-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 3l5 5-5 5" />
                    </svg>
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
