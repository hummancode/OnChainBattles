/**
 * playerState.test.ts — Hand, deck, discard pile management.
 */

import { describe, it, expect } from 'vitest';
import { PlayerState } from '../../../src/game/PlayerState';
import { Player } from '../../../src/game/types/GameTypes';
import GameState from '../../../src/GameState';

const TEST_DECK = [
  'foot_soldier', 'foot_soldier', 'foot_soldier',
  'pikeman', 'pikeman',
  'archer', 'archer',
  'swordsman', 'swordsman',
  'militia', 'militia',
  'scout', 'scout',
  'lancer', 'lancer',
  'messenger', 'messenger',
  'mystic',
  'priest', 'priest',
  'inquisitor', 'inquisitor',
  'knight', 'knight',
  'scribe', 'scribe',
  'princess',
  'commander',
  'knights_guard',
  'assassin', 'assassin',
]; // 31 cards

describe('PlayerState', () => {
  beforeEach(() => {
    GameState.gameSeed = 42;
  });

  describe('loadDeck + drawCards', () => {
    it('loadDeck sets deck and clears hand', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([...TEST_DECK], 0);
      expect(ps.deck.length + ps.hand.length).toBe(31);
      expect(ps.hand).toHaveLength(0); // no draw yet
      expect(ps.discard).toHaveLength(0);
    });

    it('drawCards moves cards from deck to hand', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([...TEST_DECK], 0);
      const drawn = ps.drawCards(4);
      expect(drawn).toHaveLength(4);
      expect(ps.hand).toHaveLength(4);
      expect(ps.deck).toHaveLength(27);
    });

    it('drawCards overflow sends excess to discard', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([...TEST_DECK], 0);
      ps.handLimit = 3;
      ps.drawCards(5);
      expect(ps.hand).toHaveLength(3);
      expect(ps.discard).toHaveLength(2);
    });

    it('drawCardsOverflow ignores hand limit', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([...TEST_DECK], 0);
      ps.handLimit = 3;
      ps.drawCardsOverflow(5);
      expect(ps.hand).toHaveLength(5);
      expect(ps.discard).toHaveLength(0);
    });
  });

  describe('drawCardsFiltered', () => {
    it('draws only matching cards', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([...TEST_DECK], 0);
      const drawn = ps.drawCardsFiltered(2, 'ROYAL');
      expect(drawn.length).toBeGreaterThanOrEqual(1); // at least 1 royal should be drawn
      // Royal cards in the deck: swordsman, priest, inquisitor, knight, scribe, princess, commander, knights_guard
      const royalIds = ['swordsman', 'priest', 'inquisitor', 'knight', 'scribe', 'princess', 'commander', 'knights_guard'];
      for (const id of drawn) {
        expect(royalIds).toContain(id);
      }
    });
  });

  describe('discard and reshuffle', () => {
    it('reshuffleDiscard moves discard to deck', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([...TEST_DECK], 0);
      // Manually put cards in discard
      ps.discard = ['foot_soldier', 'archer', 'pikeman'];
      const discardCount = ps.discard.length;
      ps.reshuffleDiscard();
      expect(ps.deck.length).toBeGreaterThanOrEqual(discardCount);
      expect(ps.discard).toHaveLength(0);
    });

    it('drawCards auto-reshuffles when deck empty', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([...TEST_DECK], 0);
      ps.drawCards(31); // empty deck
      ps.discard.push('foot_soldier', 'archer');
      const drawn = ps.drawCards(1);
      expect(drawn).toHaveLength(1);
      expect(ps.discard).toHaveLength(1); // one left after reshuffle+draw
    });

    it('empty deck + empty discard = draws nothing', () => {
      const ps = new PlayerState(Player.P1);
      ps.loadDeck([], 0);
      const drawn = ps.drawCards(5);
      expect(drawn).toHaveLength(0);
      expect(ps.hand).toHaveLength(0);
    });
  });

  describe('playFromHand', () => {
    it('removes card at index from hand', () => {
      const ps = new PlayerState(Player.P1);
      ps.hand = ['a', 'b', 'c'];
      const removed = ps.playFromHand(1);
      expect(removed).toBe('b');
      expect(ps.hand).toEqual(['a', 'c']);
    });
  });

  describe('graveyard', () => {
    it('addToGraveyard tracks dead unit instance IDs', () => {
      const ps = new PlayerState(Player.P1);
      ps.addToGraveyard('foot_1');
      ps.addToGraveyard('archer_2');
      expect(ps.graveyard).toEqual(['foot_1', 'archer_2']);
    });
  });
});
