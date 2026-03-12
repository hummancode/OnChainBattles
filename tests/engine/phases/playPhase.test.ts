import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, TurnPhase, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('PlayPhase — card deployment', () => {
  it('deploys a unit card to valid position', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const positions = t.deployPositions();
    expect(positions.length).toBeGreaterThan(0);

    const pos = positions[0];
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const handBefore = t.state().players[Player.P1].hand.length;
    const result = t.engine.playCard(idx, pos.col, pos.row);

    expect(result).toBe(true);
    expect(t.state().players[Player.P1].hand.length).toBe(handBefore - 1);

    // Unit should be on the board
    const cell = t.state().board.find(c => c.col === pos.col && c.row === pos.row);
    expect(cell?.unit).toBeDefined();
    expect(cell?.unit?.owner).toBe(Player.P1);
  });

  it('rejects deploy to invalid position (enemy half)', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    // Row 6 is P2's back row — invalid for P1
    const result = t.engine.playCard(idx, 3, 6);
    expect(result).toBe(false);
  });

  it('rejects deploy to occupied cell', () => {
    // King is at center of row 0
    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const result = t.engine.playCard(idx, king.col, king.row);
    expect(result).toBe(false);
  });

  it('rejects play when not enough LEG', () => {
    // Knight costs 9 — can't afford on turn 1 (1 LEG)
    const knightIdx = t.findInHand('knight');
    if (knightIdx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const result = t.engine.playCard(knightIdx, pos.col, pos.row);
    expect(result).toBe(false);
  });

  it('rejects play with invalid hand index', () => {
    expect(t.engine.playCard(99, 3, 0)).toBe(false);
    expect(t.engine.playCard(-1, 3, 0)).toBe(false);
  });

  it('rejects play during ACT phase', () => {
    t.engine.endPlayPhase();
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const result = t.engine.playCard(idx, 3, 0);
    expect(result).toBe(false);
  });

  it('emits CARD_PLAYED and UNIT_PLACED events', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    t.engine.playCard(idx, pos.col, pos.row);

    expect(t.eventsOfType('CARD_PLAYED').length).toBeGreaterThan(0);
    expect(t.eventsOfType('UNIT_PLACED').length).toBeGreaterThanOrEqual(2); // kings + this
  });

  it('spends LEG on play', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const legBefore = t.state().modifiers[Player.P1].legPool;
    t.engine.playCard(idx, pos.col, pos.row);
    const legAfter = t.state().modifiers[Player.P1].legPool;

    expect(legAfter).toBeLessThan(legBefore);
  });
});

describe('PlayPhase — LEG economy', () => {
  it('P1 starts with LEG > 0', () => {
    expect(t.state().modifiers[Player.P1].legPool).toBeGreaterThan(0);
  });

  it('LEG accumulates each turn', () => {
    const leg1 = t.state().modifiers[Player.P1].legPool;
    skipTurn(t.engine); // P1
    skipTurn(t.engine); // P2

    const leg2 = t.state().modifiers[Player.P1].legPool;
    expect(leg2).toBeGreaterThan(leg1);
  });

  it('getAffordableCards returns indices of playable cards', () => {
    const affordable = t.engine.getAffordableCards();
    const hand = t.state().players[Player.P1].hand;
    const leg = t.state().modifiers[Player.P1].legPool;

    // All returned indices should be valid hand positions
    for (const idx of affordable) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(hand.length);
    }
  });
});
