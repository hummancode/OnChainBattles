/**
 * testHarness.test.ts — Validates the TestHarness infrastructure helpers.
 * Ensures injectHand, createTestEngineWithDeck, getPlayerState, and MIXED_DECK_IDS work correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngine,
  createTestEngineWithDeck,
  injectHand,
  getPlayerState,
  MIXED_DECK_IDS,
  Player,
  TurnPhase,
} from './TestHarness';

describe('TestHarness — infrastructure helpers', () => {
  describe('MIXED_DECK_IDS', () => {
    it('has exactly 31 cards', () => {
      expect(MIXED_DECK_IDS).toHaveLength(31);
    });

    it('contains spells', () => {
      expect(MIXED_DECK_IDS).toContain('earthquake');
      expect(MIXED_DECK_IDS).toContain('war_horn');
      expect(MIXED_DECK_IDS).toContain('coup');
      expect(MIXED_DECK_IDS).toContain('treason');
    });

    it('contains structures', () => {
      expect(MIXED_DECK_IDS).toContain('castle');
      expect(MIXED_DECK_IDS).toContain('village');
      expect(MIXED_DECK_IDS).toContain('temple');
    });

    it('contains units', () => {
      expect(MIXED_DECK_IDS).toContain('foot_soldier');
      expect(MIXED_DECK_IDS).toContain('lancer');
      expect(MIXED_DECK_IDS).toContain('archer');
    });
  });

  describe('createTestEngineWithDeck', () => {
    it('creates an engine in PLAY phase', () => {
      const t = createTestEngineWithDeck(MIXED_DECK_IDS);
      expect(t.state().turn.phase).toBe(TurnPhase.PLAY);
      expect(t.state().turn.activePlayer).toBe(Player.P1);
    });

    it('uses the provided deck (mixed deck has spells in card pool)', () => {
      const t = createTestEngineWithDeck(MIXED_DECK_IDS, 100);
      const ps = getPlayerState(t.engine, Player.P1);
      // The player's hand + deck + discard should contain cards from the mixed deck
      const allCards = [...ps.hand, ...ps.deck, ...ps.discard];
      // At least one spell or structure should exist somewhere in the pool
      const hasNonUnit = allCards.some(id =>
        ['earthquake', 'war_horn', 'coup', 'treason', 'castle', 'village', 'temple', 'disease', 'casus_belli', 'reform', 'motherland'].includes(id)
      );
      expect(hasNonUnit).toBe(true);
    });

    it('does not affect subsequent createTestEngine calls', () => {
      // First create a mixed deck engine
      createTestEngineWithDeck(MIXED_DECK_IDS);
      // Then create a normal engine — should use UNITS_ONLY
      const t2 = createTestEngine();
      const ps = getPlayerState(t2.engine, Player.P1);
      const allCards = [...ps.hand, ...ps.deck];
      const hasSpell = allCards.some(id =>
        ['earthquake', 'war_horn', 'coup', 'treason'].includes(id)
      );
      expect(hasSpell).toBe(false);
    });
  });

  describe('injectHand', () => {
    it('replaces the hand with specified cards', () => {
      const t = createTestEngine();
      injectHand(t.engine, Player.P1, ['foot_soldier', 'archer', 'lancer']);
      const ps = getPlayerState(t.engine, Player.P1);
      expect(ps.hand).toEqual(['foot_soldier', 'archer', 'lancer']);
    });

    it('can inject an empty hand', () => {
      const t = createTestEngine();
      injectHand(t.engine, Player.P1, []);
      const ps = getPlayerState(t.engine, Player.P1);
      expect(ps.hand).toHaveLength(0);
    });

    it('can inject spell cards into hand', () => {
      const t = createTestEngineWithDeck(MIXED_DECK_IDS);
      injectHand(t.engine, Player.P1, ['earthquake', 'war_horn']);
      const ps = getPlayerState(t.engine, Player.P1);
      expect(ps.hand).toEqual(['earthquake', 'war_horn']);
    });
  });

  describe('getPlayerState', () => {
    it('returns hand, deck, discard, graveyard', () => {
      const t = createTestEngine();
      const ps = getPlayerState(t.engine, Player.P1);
      expect(ps).toHaveProperty('hand');
      expect(ps).toHaveProperty('deck');
      expect(ps).toHaveProperty('discard');
      expect(ps).toHaveProperty('graveyard');
      expect(ps).toHaveProperty('handLimit');
      expect(Array.isArray(ps.hand)).toBe(true);
      expect(Array.isArray(ps.deck)).toBe(true);
    });

    it('returns defensive copies (mutations do not affect engine)', () => {
      const t = createTestEngine();
      const ps = getPlayerState(t.engine, Player.P1);
      const originalHand = [...ps.hand];
      ps.hand.push('fake_card');
      const ps2 = getPlayerState(t.engine, Player.P1);
      expect(ps2.hand).toEqual(originalHand);
    });

    it('hand + deck should total 31 for P1 at game start', () => {
      const t = createTestEngine();
      const ps = getPlayerState(t.engine, Player.P1);
      // 31-card deck: some drawn into hand, rest remain in deck
      expect(ps.hand.length + ps.deck.length).toBe(31);
      expect(ps.hand.length).toBeGreaterThan(0);
      expect(ps.deck.length).toBeGreaterThan(0);
    });
  });
});
