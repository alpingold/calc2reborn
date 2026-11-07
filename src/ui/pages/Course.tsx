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
    <section>
      <h2>Course</h2>
      {[...units].map(([unit, ls]) => (
        <div key={unit}>
          <h3>{unit}</h3>
          <ol>
            {ls.map((l) => (
              <li key={l.id}>
                <Link to={`/course/${l.id}`}>{`L${l.number} · ${l.title}`}</Link>
                {l.id === settings.currentLessonId && <> <span>Current</span></>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
