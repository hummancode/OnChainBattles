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

describe('War Horn on fixed-pattern movers (Knight, Scout, Lancer, Messenger, Assassin)', () => {
  function setup(cardId: string, col: number, row: number) {
    const t = createTestEngineWithDeck(DECK);
    const eng: any = t.engine;
    const unit = eng.unitFactory.create(cardId, Player.P1, { col, row });
    unit.isJustPlaced = false;
    eng.board.placeUnit(unit);
    return { t, eng, unit };
  }
  const key = (p: { col: number; row: number }) => `${p.col},${p.row}`;

  it('each pattern move reaches one square further along its direction', () => {
    const { eng, unit } = setup('knight', 3, 2);
    const before = new Set(getValidMoves(unit, eng.board).map(key));
    expect(before.has('3,4')).toBe(true);   // (0,+2)
    expect(before.has('3,5')).toBe(false);

    eng.mods[Player.P1].addTimedEffect({ type: 'WAR_HORN_MOVEMENT', duration: 1, value: 1 });
    eng.auras.evaluateAuras(eng.board, eng.mods);
    const after = new Set(getValidMoves(unit, eng.board).map(key));
    expect(after.has('3,5')).toBe(true);    // (0,+2) extended → (0,+3)
    expect(after.has('1,5')).toBe(true);    // (-1,+2) extended → (-2,+3)
    for (const k of before) expect(after.has(k)).toBe(true); // original moves still allowed
  });

  it('extension is player-relative for P2', () => {
    const t = createTestEngineWithDeck(DECK);
    const eng: any = t.engine;
    const unit = eng.unitFactory.create('lancer', Player.P2, { col: 3, row: 4 });
    eng.board.placeUnit(unit);
    eng.mods[Player.P2].addTimedEffect({ type: 'WAR_HORN_MOVEMENT', duration: 1, value: 1 });
    eng.auras.evaluateAuras(eng.board, eng.mods);
    const moves = new Set(getValidMoves(unit, eng.board).map(key));
    expect(moves.has('3,1')).toBe(true);    // lancer (0,+2) forward for P2 = row-2 → extended row-3
  });

  it('without War Horn, fixed patterns are unchanged', () => {
    const { eng, unit } = setup('messenger', 3, 3);
    const moves = new Set(getValidMoves(unit, eng.board).map(key));
    expect(moves.has('6,6')).toBe(false);   // (2,2) would extend to (3,3)
    expect(moves.has('5,5')).toBe(true);
  });
});
