// ============================================================
// DeckValidatorClient.ts
// Client-side instant deck validation feedback.
// Uses CardRegistry for card data — no network calls.
// ============================================================

import { getCard } from '../game/data/CardRegistry';

const DECK_SIZE = 31;

export interface ClientValidationResult {
  valid: boolean;
  errors: string[];
  cardCount: number;
  costCurve: Map<number, number>;  // cost → count
}

/**
 * Validate a deck locally for instant UI feedback.
 * Server-side validation is authoritative — this is for UX only.
 */
export function validateDeckClient(cardIds: string[]): ClientValidationResult {
  const errors: string[] = [];
  const costCurve = new Map<number, number>();

  if (!Array.isArray(cardIds)) {
    return { valid: false, errors: ['Invalid deck data.'], cardCount: 0, costCurve };
  }

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck needs exactly ${DECK_SIZE} cards (has ${cardIds.length}).`);
  }

  if (cardIds.includes('king')) {
    errors.push('King is pre-placed and cannot be in the deck.');
  }

  // Check each card exists and count copies
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    try {
      const card = getCard(id);
      costCurve.set(card.cost, (costCurve.get(card.cost) ?? 0) + 1);
    } catch {
      errors.push(`Unknown card: ${id}`);
    }
  }

  // Check copy limits
  for (const [id, count] of counts) {
    try {
      const card = getCard(id);
      if (count > card.copies) {
        errors.push(`${card.name}: ${count} copies (max ${card.copies}).`);
      }
    } catch { /* already reported as unknown */ }
  }

  return {
    valid: errors.length === 0,
    errors,
    cardCount: cardIds.length,
    costCurve,
  };
}
