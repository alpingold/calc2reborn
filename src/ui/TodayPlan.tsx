import { Link } from 'react-router'
import type { Content } from '../content'
import { PRACTISE_TARGET, type PlanItem } from '../engine/today'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function reviewText(due: number, fresh: number): string {
  if (due > 0 && fresh > 0) return `Review ${due} due and ${plural(fresh, 'new card', 'new cards')}`
  if (due > 0) return `Review ${plural(due, 'due card', 'due cards')}`
  if (fresh > 0) return `Review ${plural(fresh, 'new card', 'new cards')}`
  return 'Review cards'
}

function describe(item: PlanItem, content: Content): { text: string; to: string; note?: string } {
  switch (item.kind) {
    case 'review':
      return { text: reviewText(item.due, item.fresh), to: '/review' }
    case 'retry':
      return {
        text: item.done ? 'Retry missed questions' : `Retry ${plural(item.count, 'missed question', 'missed questions')}`,
        to: '/practice?retry=1',
      }
    case 'practise': {
      const names = item.typeIds.map((id) => content.typeById.get(id)?.name ?? id)
      return {
        text: `Practise your weakest types: ${names.join(', ')}`,
        to: `/practice?types=${item.typeIds.map(encodeURIComponent).join(',')}&n=${PRACTISE_TARGET}`,
        note: item.done || item.answeredToday === 0 ? undefined : `${item.answeredToday} of ${PRACTISE_TARGET} answered`,
      }
    }
  }
}

/** The Dashboard's checklist for today. A finished item is ticked and no longer a link. */
export function TodayPlan({ items, content }: { items: PlanItem[]; content: Content }) {
  if (items.length === 0) {
    return <p className="plan-empty">Nothing planned yet. Set your current lesson to begin.</p>
  }
  const allDone = items.every((i) => i.done)
  return (
    <div className="plan">
      <h3>Today</h3>
      <ul className="plan-list">
        {items.map((item) => {
          const { text, to, note } = describe(item, content)
          return (
            <li key={item.kind} className={item.done ? 'plan-item done' : 'plan-item'}>
              <span className="plan-mark" aria-hidden="true">
                {item.done ? '✓' : ''}
              </span>
              {item.done ? (
                <span>
                  {text}
                  <span className="visually-hidden"> (done)</span>
                </span>
              ) : (
                <Link to={to}>{text}</Link>
              )}
              {note && <span className="plan-note">{note}</span>}
            </li>
          )
        })}
      </ul>
      {allDone && <p className="plan-done">Done for today</p>}
    </div>
  )
}
