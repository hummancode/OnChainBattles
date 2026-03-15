// ============================================================
// DeckBuilderHelpers.ts
// Pure functions for deck builder: filter, sort, cost curve.
// No Phaser dependency — easy to unit test.
// ============================================================

import type { CollectionCard } from './CollectionAPI';
import { getCard } from '../game/data/CardRegistry';
import { CardClass } from '../game/types/CardTypes';

export interface DeckCardEntry {
  cardId: string;
  name: string;
  cost: number;
  count: number;
}

/** Group a flat cardIds array into sorted entries with counts. */
export function groupDeckCards(cardIds: string[], sortBy: 'cost' | 'name'): DeckCardEntry[] {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const entries: DeckCardEntry[] = [];
  for (const [cardId, count] of counts) {
    try {
      const card = getCard(cardId);
      entries.push({ cardId, name: card.name, cost: card.cost, count });
    } catch {
      entries.push({ cardId, name: cardId, cost: 0, count });
    }
  }

  if (sortBy === 'cost') {
    entries.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  } else {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  return entries;
}

/** Filter collection cards by class and sort. */
export function filterCollection(
  collection: CollectionCard[],
  classFilter: CardClass | 'ALL',
  sortBy: 'cost' | 'name',
): CollectionCard[] {
  let filtered = collection;

  if (classFilter !== 'ALL') {
    filtered = filtered.filter(c => {
      try {
        return getCard(c.id).class === classFilter;
      } catch { return false; }
    });
  }

  // Exclude king
  filtered = filtered.filter(c => c.id !== 'king');

  const sorted = [...filtered];
  if (sortBy === 'cost') {
    sorted.sort((a, b) => {
      try {
        return getCard(a.id).cost - getCard(b.id).cost || a.name.localeCompare(b.name);
      } catch { return 0; }
    });
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
}

/** How many more copies of this card can be added to the deck? */
export function availableCopies(
  cardId: string,
  currentDeckIds: string[],
  collection: CollectionCard[],
): number {
  const inDeck = currentDeckIds.filter(id => id === cardId).length;

  let maxPerDeck = 1;
  try { maxPerDeck = getCard(cardId).copies; } catch { /* default 1 */ }

  const owned = collection.find(c => c.id === cardId)?.ownedCopies ?? 0;

  // Can add up to min(maxPerDeck, owned) total, minus what's already in deck
  return Math.max(0, Math.min(maxPerDeck, owned) - inDeck);
}

/** Build compact ASCII cost curve string lines for display. */
export function buildCostCurveLines(costCurve: Map<number, number>): string[] {
  if (costCurve.size === 0) return ['  (empty)'];

  const maxCost = Math.max(...costCurve.keys(), 6);
  const maxCount = Math.max(...costCurve.values(), 1);
  const barScale = 10 / maxCount;

  const lines: string[] = [];
  for (let cost = 1; cost <= maxCost; cost++) {
    const count = costCurve.get(cost) ?? 0;
    const barLen = Math.round(count * barScale);
    const bar = '\u2588'.repeat(barLen);
    const padCount = String(count).padStart(2, ' ');
    lines.push(`${cost}: ${bar} ${padCount}`);
  }
  return lines;
}
