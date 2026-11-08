import { Link } from 'react-router'
import type { Lesson } from '../../content/schema'
import { useContent, useSettings } from '../../storage/context'

export function Course() {
  const { lessons } = useContent()
  const { settings } = useSettings()
  const units = new Map<string, Lesson[]>()
  for (const l of lessons) {
    if (l.isReview || l.unit === null) continue
    units.set(l.unit, [...(units.get(l.unit) ?? []), l])
  }
  return (
    <section className="course">
      <h2>Course</h2>
      <p className="page-lede">Dr. Chen's Fall 2023 lessons, with notes, videos and practice for each.</p>
      <div className="units">
        {[...units].map(([unit, ls]) => (
          <section key={unit} className="unit">
            <h3>{unit}</h3>
            <ol className="lesson-list">
              {ls.map((l) => (
                <li key={l.id} className={l.id === settings.currentLessonId ? 'current' : undefined}>
                  <Link to={`/course/${l.id}`}>
                    <span className="lesson-num">{`L${l.number}`}</span> <span className="lesson-title">{l.title}</span>
                  </Link>
                  {l.id === settings.currentLessonId && <span className="current-tag">Current</span>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  )
}
