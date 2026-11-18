import { Link } from 'react-router'
import { isPlanned } from '../content/schema'
import type { Lesson } from '../content/schema'
import type { Mastery } from '../engine/mastery'
import { masteryLabel, masteryState } from './record'

/**
 * The course map: one row per unit, one tile per lesson. A tile shows the lesson's number, its colour
 * repeats the mastery named in its label and in the legend, and the current lesson is outlined.
 */
export function MasteryGrid({
  lessons,
  mastery,
  currentLessonId,
  note,
}: {
  lessons: Lesson[]
  mastery: Map<string, Mastery>
  currentLessonId: string | null
  /** a line under the map, such as which lessons are on the exam */
  note?: string
}) {
  const units = new Map<string, Lesson[]>()
  for (const l of lessons) {
    if (!isPlanned(l) || l.unit === null) continue
    const list = units.get(l.unit) ?? []
    list.push(l)
    units.set(l.unit, list)
  }
  return (
    <section className="course-map">
      <div className="course-map-head">
        <h3>Course map</h3>
        <ul className="legend" aria-label="Legend">
          <li>
            <span className="swatch mastery-weak" /> Weak, under 70%
          </li>
          <li>
            <span className="swatch mastery-ok" /> Getting there
          </li>
          <li>
            <span className="swatch mastery-strong" /> Strong, 90% and up
          </li>
          <li>
            <span className="swatch mastery-untested" /> Not tested
          </li>
        </ul>
      </div>
      <div className="card course-map-rows">
        {[...units].map(([unit, ls]) => (
          <section key={unit} className="course-map-row">
            <h4>{unit}</h4>
            <div className="tiles">
              {ls.map((l) => {
                const score = mastery.get(l.id)?.score ?? null
                const label = `Lesson ${l.number}: ${l.title}, ${masteryLabel(score)}${l.id === currentLessonId ? ', your current lesson' : ''}`
                return (
                  // the tooltip is mouse-only, so the link's name carries the title and mastery too
                  <Link
                    key={l.id}
                    to={`/course/${l.id}`}
                    className={`tile mastery-${masteryState(score)}${l.id === currentLessonId ? ' current' : ''}`}
                    title={label}
                    aria-label={label}
                  >
                    {l.number}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="hint">
        {currentLessonId ? 'The outlined tile is the lesson you are on. ' : ''}
        {note}
      </p>
    </section>
  )
}
