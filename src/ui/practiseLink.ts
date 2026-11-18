import { PRACTISE_TARGET } from '../engine/today'

/** The address of a practice session on one problem type. */
export function practiseTypeLink(typeId: string): string {
  return `/practice?types=${encodeURIComponent(typeId)}&n=${PRACTISE_TARGET}`
}
