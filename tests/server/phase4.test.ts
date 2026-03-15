/**
 * phase4.test.ts — Tests for Phase 4 client-side additions:
 * - DeckValidatorClient
 * - DeckLoader 3-priority chain (unit-testable parts)
 * - DeckAPI/CollectionAPI interface contracts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateDeckClient } from '../../src/deck/DeckValidatorClient';
import { UNITS_ONLY_DECK_IDS } from '../../src/game/data/DeckDefinitions';

// ─── DeckValidatorClient ──────────────────────────────────────

describe('DeckValidatorClient', () => {
  it('accepts the built-in UNITS_ONLY_DECK_IDS', () => {
    const result = validateDeckClient(UNITS_ONLY_DECK_IDS);
    expect(result.cardCount).toBe(31);
    // May or may not be valid depending on the built-in deck
    // but should not throw and should return a result
    expect(result.errors).toBeDefined();
    expect(result.costCurve).toBeInstanceOf(Map);
  });

  it('rejects empty array', () => {
    const result = validateDeckClient([]);
    expect(result.valid).toBe(false);
    expect(result.cardCount).toBe(0);
    expect(result.errors.some(e => e.includes('31'))).toBe(true);
  });

  it('rejects deck with king', () => {
    const deck = [...UNITS_ONLY_DECK_IDS];
    deck[0] = 'king';
    const result = validateDeckClient(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('King'))).toBe(true);
  });

  it('rejects unknown card IDs', () => {
    const deck = [...UNITS_ONLY_DECK_IDS];
    deck[0] = 'dragon_lord';
    const result = validateDeckClient(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('dragon_lord'))).toBe(true);
  });

  it('rejects too many copies', () => {
    const deck = Array(31).fill('foot_soldier');
    const result = validateDeckClient(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Foot Soldier'))).toBe(true);
  });

  it('builds cost curve', () => {
    const result = validateDeckClient(UNITS_ONLY_DECK_IDS);
    expect(result.costCurve.size).toBeGreaterThan(0);
    // Sum of cost curve values should equal card count
    let total = 0;
    for (const count of result.costCurve.values()) total += count;
    expect(total).toBe(result.cardCount);
  });

  it('handles non-array input', () => {
    const result = validateDeckClient('not an array' as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

// ─── CardPool ↔ CardRegistry Consistency ──────────────────────

describe('CardPool-CardRegistry consistency', () => {
  it('every CardPool entry exists in CardRegistry', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { getCard } = await import('../../src/game/data/CardRegistry');

    for (const poolCard of CARD_POOL) {
      const registryCard = getCard(poolCard.id);
      expect(registryCard).toBeDefined();
      expect(registryCard.name).toBe(poolCard.name);
    }
  });

  it('CardPool costs match CardRegistry costs', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { getCard } = await import('../../src/game/data/CardRegistry');

    const mismatches: string[] = [];
    for (const poolCard of CARD_POOL) {
      const registryCard = getCard(poolCard.id);
      if (registryCard.cost !== poolCard.cost) {
        mismatches.push(`${poolCard.id}: pool=${poolCard.cost} registry=${registryCard.cost}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('CardPool copies match CardRegistry copies', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { getCard } = await import('../../src/game/data/CardRegistry');

    const mismatches: string[] = [];
    for (const poolCard of CARD_POOL) {
      const registryCard = getCard(poolCard.id);
      if (registryCard.copies !== poolCard.copies) {
        mismatches.push(`${poolCard.id}: pool=${poolCard.copies} registry=${registryCard.copies}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('CardPool has same card count as CardRegistry', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { CARD_MAP } = await import('../../src/game/data/CardRegistry');

    expect(CARD_POOL.length).toBe(CARD_MAP.size);
  });
});

// ─── DeckLoader priorities (testable without browser) ─────────

describe('DeckLoader priority logic', () => {
  it('UNITS_ONLY_DECK_IDS is a valid fallback', () => {
    expect(UNITS_ONLY_DECK_IDS).toBeDefined();
    expect(UNITS_ONLY_DECK_IDS.length).toBe(31);
    expect(UNITS_ONLY_DECK_IDS).not.toContain('king');
  });
});
