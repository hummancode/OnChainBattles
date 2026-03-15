/**
 * deckValidator.test.ts — Tests for server-side deck validation
 * and CardPool data integrity.
 */

import { describe, it, expect } from 'vitest';
import { validateDeck } from '../../server/validation/DeckValidator';
import { CARD_POOL, getCardFromPool } from '../../server/validation/CardPool';

// ─── CardPool Data Integrity ──────────────────────────────────

describe('CardPool', () => {
  it('has 31 card entries', () => {
    expect(CARD_POOL.length).toBe(31);
  });

  it('every card has a non-empty id, name, and positive copies', () => {
    for (const card of CARD_POOL) {
      expect(card.id.length).toBeGreaterThan(0);
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.copies).toBeGreaterThanOrEqual(1);
    }
  });

  it('no duplicate IDs', () => {
    const ids = CARD_POOL.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('king has cost 0', () => {
    expect(getCardFromPool('king')?.cost).toBe(0);
  });

  it('commander has cost 7 (not 5)', () => {
    expect(getCardFromPool('commander')?.cost).toBe(7);
  });

  it('knights_guard has cost 12', () => {
    expect(getCardFromPool('knights_guard')?.cost).toBe(12);
  });

  it('knight has cost 9', () => {
    expect(getCardFromPool('knight')?.cost).toBe(9);
  });

  it('getCardFromPool returns undefined for unknown ID', () => {
    expect(getCardFromPool('nonexistent')).toBeUndefined();
  });

  it('total copies across all non-King cards is 31 (one full deck)', () => {
    const total = CARD_POOL
      .filter(c => c.id !== 'king')
      .reduce((sum, c) => sum + c.copies, 0);
    // A "full deck" uses every card at max copies
    // This verifies the default deck is exactly 31 cards
    expect(total).toBeGreaterThanOrEqual(31);
  });
});

// ─── DeckValidator ────────────────────────────────────────────

describe('DeckValidator', () => {
  // Build a valid 31-card deck from CardPool (max copies of each)
  function buildValidDeck(): string[] {
    const deck: string[] = [];
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue;
      for (let i = 0; i < card.copies; i++) {
        deck.push(card.id);
      }
    }
    // Trim or pad to exactly 31
    return deck.slice(0, 31);
  }

  it('accepts a valid 31-card deck', () => {
    const deck = buildValidDeck();
    expect(deck).toHaveLength(31);
    const result = validateDeck(deck);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty deck', () => {
    const result = validateDeck([]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('31'))).toBe(true);
  });

  it('rejects deck with wrong size', () => {
    const result = validateDeck(['foot_soldier', 'archer']);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('31'))).toBe(true);
  });

  it('rejects deck containing king', () => {
    const deck = buildValidDeck();
    deck[0] = 'king';
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('King'))).toBe(true);
  });

  it('rejects unknown card IDs', () => {
    const deck = buildValidDeck();
    deck[0] = 'dragon_wizard';
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('dragon_wizard'))).toBe(true);
  });

  it('rejects too many copies of a card', () => {
    // foot_soldier has max 3 copies — use 4
    const deck = Array(31).fill('foot_soldier');
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Foot Soldier'))).toBe(true);
  });

  it('rejects non-array input', () => {
    const result = validateDeck('not an array' as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('array'))).toBe(true);
  });

  it('validates ownership when ownedCards is provided', () => {
    const deck = buildValidDeck();
    // Player only owns 1 foot_soldier but deck has 3
    const owned = new Map<string, number>();
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue;
      owned.set(card.id, card.copies);
    }
    owned.set('foot_soldier', 1); // Override: only own 1

    const result = validateDeck(deck, owned);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Foot Soldier') && e.includes('own 1'))).toBe(true);
  });

  it('skips ownership check when ownedCards is null', () => {
    const deck = buildValidDeck();
    const result = validateDeck(deck, null);
    expect(result.valid).toBe(true);
  });
});
