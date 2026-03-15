// ============================================================
// DeckValidator.ts
// Pure deck validation. No database access — ownership map
// is passed in by the caller.
// ============================================================

import { getCardFromPool } from './CardPool.js';

const DECK_SIZE = 31;

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a deck of card IDs.
 * @param cardIds    - Array of card ID strings
 * @param ownedCards - Optional ownership map (cardId → copies owned). Null = skip ownership check.
 */
export function validateDeck(
  cardIds: string[],
  ownedCards: Map<string, number> | null = null
): DeckValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(cardIds)) {
    return { valid: false, errors: ['cardIds must be an array.'] };
  }

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck must have exactly ${DECK_SIZE} cards, got ${cardIds.length}.`);
  }

  if (cardIds.includes('king')) {
    errors.push('King cannot be in deck (pre-placed automatically).');
  }

  const unknown = cardIds.filter(id => !getCardFromPool(id));
  if (unknown.length > 0) {
    errors.push(`Unknown card IDs: ${[...new Set(unknown)].join(', ')}`);
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of counts) {
    const card = getCardFromPool(id);
    if (card && count > card.copies) {
      errors.push(`${card.name}: ${count} copies, max ${card.copies}.`);
    }
  }

  if (ownedCards) {
    for (const [id, count] of counts) {
      const owned = ownedCards.get(id) ?? 0;
      if (count > owned) {
        const card = getCardFromPool(id);
        errors.push(`${card?.name ?? id}: need ${count}, own ${owned}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
