/**
 * War Horn spell tests.
 *
 * Card text: "Draw 2 cards, then discard 1. All your units gain +1 movement this turn."
 *
 * Regression for open issue: WAR_HORN_MOVEMENT timed effect was never created
 * and the aura system never read it — the +1 movement half of the card did nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngineWithDeck,
  injectHand,
  skipTurn,
  accumulate,
  Player,
} from '../helpers/TestHarness';
import { getValidMoves } from '../../../src/game/MovementRules';

const DECK = [
  'foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier',
  'pikeman', 'pikeman', 'archer', 'archer',
  'swordsman', 'swordsman', 'war_horn', 'war_horn',
  'lancer', 'lancer', 'scout', 'scout',
  'messenger', 'militia', 'knight', 'commander',
  'foot_soldier', 'foot_soldier', 'foot_soldier',
  'pikeman', 'pikeman', 'archer', 'archer',
  'swordsman', 'swordsman', 'foot_soldier', 'foot_soldier',
];

function kingOf(t: ReturnType<typeof createTestEngineWithDeck>, p: Player) {
  return (t.engine as any).board.getAllUnits().find((u: any) => u.cardId === 'king' && u.owner === p);
}

function playWarHorn(t: ReturnType<typeof createTestEngineWithDeck>) {
  injectHand(t.engine, Player.P1, ['war_horn']);
  expect(t.engine.playCard(0)).toBe(true);
  // Resolve the discard step
  t.engine.selectDiscard(0);
}

describe('War Horn spell', () => {
  it('gives all of the caster\'s units +1 movement for the rest of the turn', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 3);

    const king = kingOf(t, Player.P1);
    const before = king.currentMovement;

    playWarHorn(t);

    expect(king.currentMovement).toBe(before + 1);
    expect(king.activeBuffs.some((b: any) => b.source.includes('WAR_HORN'))).toBe(true);

    // OMNI_1 king with +1 movement can now reach 2 squares away
    const moves = getValidMoves(king, (t.engine as any).board);
    const maxDist = Math.max(...moves.map(m =>
      Math.max(Math.abs(m.col - king.position.col), Math.abs(m.row - king.position.row))));
    expect(maxDist).toBe(2);
  });

  it('does not buff the opponent\'s units', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 3);

    const enemyKing = kingOf(t, Player.P2);
    const before = enemyKing.currentMovement;
    playWarHorn(t);
    expect(enemyKing.currentMovement).toBe(before);
  });

  it('expires at the end of the caster\'s turn', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 3);

    const king = kingOf(t, Player.P1);
    const before = king.currentMovement;
    playWarHorn(t);
    skipTurn(t.engine); // end P1's turn

    expect(king.currentMovement).toBe(before);
    expect((t.engine as any).mods[Player.P1].hasEffect('WAR_HORN_MOVEMENT')).toBe(false);
  });
});
