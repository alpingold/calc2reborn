import { Link } from 'react-router'
import type { ProblemType } from '../content/schema'
import type { Mastery } from '../engine/mastery'
import { PRACTISE_TARGET } from '../engine/today'
import { masteryState } from './MasteryGrid'

export function practiseTypeLink(typeId: string): string {
  return `/practice?types=${encodeURIComponent(typeId)}&n=${PRACTISE_TARGET}`
}

/** One small square per problem type, coloured like the lesson tiles; each opens practice on that type. */
export function TypeTiles({ types, mastery }: { types: ProblemType[]; mastery: Map<string, Mastery> }) {
  return (
    <span className="type-tiles">
      {types.map((t) => {
        const score = mastery.get(t.id)?.score ?? null
        const label = score === null ? 'untested' : `${Math.round(score * 100)}%`
        return (
          <Link
            key={t.id}
            to={practiseTypeLink(t.id)}
            className={`type-tile mastery-${masteryState(score)}`}
            title={`${t.name}, ${label}`}
            aria-label={`${t.name}, ${label}`}
          />
        )
      })}
    </span>
  )
}
