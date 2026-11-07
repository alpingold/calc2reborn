import { Link } from 'react-router'
import type { Lesson } from '../content/schema'
import type { Mastery } from '../engine/mastery'

function stateOf(score: number | null): 'untested' | 'weak' | 'ok' | 'strong' {
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
    if (l.isReview || l.unit === null) continue
    const list = units.get(l.unit) ?? []
    list.push(l)
    units.set(l.unit, list)
  }
  return (
    <div className="mastery-grid">
      {[...units].map(([unit, ls]) => (
        <section key={unit}>
          <h3>{unit}</h3>
          <div className="tiles">
            {ls.map((l) => {
              const score = mastery.get(l.id)?.score ?? null
              const label = score === null ? 'untested' : `${Math.round(score * 100)}%`
              const cls = `tile mastery-${stateOf(score)}${l.id === currentLessonId ? ' current' : ''}`
              return (
                <Link key={l.id} to={`/course/${l.id}`} className={cls} title={`L${l.number} · ${l.title} · ${label}`}>
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
