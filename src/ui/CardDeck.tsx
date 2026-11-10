import { useState } from 'react'
import type { ConceptCard } from '../content/schema'
import { Markdown } from './Markdown'

export interface CardTag {
  text: string
  /** styles the tag: due today, scheduled later, or not started */
  stage: 'due' | 'later' | 'new'
}

/**
 * A lesson's flashcards, one large card at a time. The card flips to show its answer, and Previous and
 * Next move through the deck. Reading here is not a review: nothing is scheduled or saved.
 */
export function CardDeck({ cards, tagFor }: { cards: ConceptCard[]; tagFor?: (cardId: string) => CardTag | null }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  if (cards.length === 0) return null
  const at = Math.min(index, cards.length - 1)
  const card = cards[at]
  const tag = tagFor?.(card.id) ?? null

  function go(to: number) {
    setIndex((to + cards.length) % cards.length)
    setFlipped(false)
  }

  return (
    <div className="deck">
      <p className="deck-count">
        <span>{`Card ${at + 1} of ${cards.length}`}</span>
        {tag && <span className={`card-tag card-tag-${tag.stage}`}>{tag.text}</span>}
      </p>
      <button type="button" className="deck-card" aria-expanded={flipped} onClick={() => setFlipped((f) => !f)}>
        <Markdown text={card.front} className="deck-front" />
        {flipped ? (
          <Markdown text={card.back} className="deck-back" />
        ) : (
          <span className="deck-hint">Show the answer</span>
        )}
      </button>
      <div className="actions deck-nav">
        <button type="button" onClick={() => go(at - 1)} disabled={cards.length < 2}>
          Previous
        </button>
        <button type="button" onClick={() => go(at + 1)} disabled={cards.length < 2}>
          Next
        </button>
      </div>
    </div>
  )
}
