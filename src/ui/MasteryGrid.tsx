import { Link } from 'react-router'
import { isPlanned } from '../content/schema'
import type { Lesson } from '../content/schema'
import type { Mastery } from '../engine/mastery'

export function masteryState(score: number | null): 'untested' | 'weak' | 'ok' | 'strong' {
  if (score === null) return 'untested'
  if (score < 0.7) return 'weak'
  if (score < 0.9) return 'ok'
  return 'strong'
}

export function MasteryGrid({
  lessons,
  mastery,
  currentLessonId,
}: {
  lessons: Lesson[]
  mastery: Map<string, Mastery>
  currentLessonId: string | null
}) {
  const units = new Map<string, Lesson[]>()
  for (const l of lessons) {
    if (!isPlanned(l) || l.unit === null) continue
    const list = units.get(l.unit) ?? []
    list.push(l)
    units.set(l.unit, list)
  }
  return (
    <div className="mastery-grid">
      <div className="mastery-head">
        <h3>Mastery by lesson</h3>
        <ul className="mastery-legend" aria-label="Legend">
          <li>
            <span className="swatch mastery-untested" /> Not enough attempts
          </li>
          <li>
            <span className="swatch mastery-weak" /> Below 70%
          </li>
          <li>
            <span className="swatch mastery-ok" /> 70 to 89%
          </li>
          <li>
            <span className="swatch mastery-strong" /> 90% and up
          </li>
        </ul>
      </div>
      {[...units].map(([unit, ls]) => (
        <section key={unit} className="mastery-unit">
          <h4>{unit}</h4>
          <div className="tiles">
            {ls.map((l) => {
              const score = mastery.get(l.id)?.score ?? null
              const label = score === null ? 'untested' : `${Math.round(score * 100)}%`
              const cls = `tile mastery-${masteryState(score)}${l.id === currentLessonId ? ' current' : ''}`
              return (
                // the tooltip is mouse-only, so the link's name also carries the title and score
                <Link
                  key={l.id}
                  to={`/course/${l.id}`}
                  className={cls}
                  title={`L${l.number}: ${l.title}, ${label}`}
                  aria-label={`L${l.number} ${l.title}, ${label}`}
                >
                  {`L${l.number}`}
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
