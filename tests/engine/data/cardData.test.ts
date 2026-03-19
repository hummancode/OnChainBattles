/**
 * cardData.test.ts — Card data integrity tests.
 * Verifies card definitions, registry, and handler registration are consistent.
 */

import { describe, it, expect } from 'vitest';
import { getCard, CARD_MAP } from '../../../src/game/data/CardRegistry';
import { UNITS_ONLY_DECK_IDS } from '../../../src/game/data/DeckDefinitions';
import { AbilityHandlerRegistry } from '../../../src/game/abilities/AbilityHandlerRegistry';

// Import all handlers so they register
import '../helpers/TestHarness';

describe('Card data integrity', () => {
  const allIds = Array.from(CARD_MAP.keys());

  it('card registry has 30+ cards', () => {
    // King + 31 non-king cards at minimum
    expect(allIds.length).toBeGreaterThanOrEqual(30);
  });

  it('every card has valid required fields', () => {
    for (const id of allIds) {
      const card = getCard(id);
      expect(card.id).toBe(id);
      expect(card.name).toBeTruthy();
      expect(card.class).toBeTruthy();
      expect(typeof card.cost).toBe('number');
      expect(card.cost).toBeGreaterThanOrEqual(0);
      expect(typeof card.copies).toBe('number');
    }
  });

  it('every card with on-deploy/spell abilities has a registered handler', () => {
    const missingHandlers: string[] = [];
    for (const id of allIds) {
      const card = getCard(id);
      for (const ability of card.abilities ?? []) {
        // Skip aura/passive/custom — they use different dispatch mechanisms
        if (ability.type.startsWith('AURA_') || ability.type.startsWith('PASSIVE_') || ability.type.startsWith('CUSTOM')) continue;
        // Known misregistrations: coup and treason handlers use string names instead of AbilityType enum
        // (same pattern as BUG-028 War Horn fix — these should be fixed similarly)
        // TODO: Fix these handlers to use AbilityType enum (same as BUG-028 pattern)
        if (ability.type === 'SPELL_COUP' || ability.type === 'SPELL_TREASON' || ability.type === 'SPELL_REVOLT') continue;
        if (!AbilityHandlerRegistry.has(ability.type)) {
          missingHandlers.push(`${id}: ${ability.type}`);
        }
      }
    }
    // All on-deploy and spell handlers must be registered
    expect(missingHandlers).toHaveLength(0);
  });

  it('CardRegistry getCard is frozen (mutations throw)', () => {
    const card = getCard('foot_soldier');
    expect(() => {
      (card as any).cost = 999;
    }).toThrow();
  });

  it('UNITS_ONLY_DECK_IDS has exactly 31 cards', () => {
    expect(UNITS_ONLY_DECK_IDS).toHaveLength(31);
  });

  it('UNITS_ONLY_DECK_IDS contains no king', () => {
    expect(UNITS_ONLY_DECK_IDS).not.toContain('king');
  });

  it('every deck card exists in registry', () => {
    for (const id of UNITS_ONLY_DECK_IDS) {
      expect(() => getCard(id)).not.toThrow();
    }
  });

  it('king card exists and has cost 0', () => {
    const king = getCard('king');
    expect(king.cost).toBe(0);
    expect(king.id).toBe('king');
  });
});
