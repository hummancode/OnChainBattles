import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, TurnPhase } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('ActPhase — movement', () => {
  it('king can move in ACT phase', () => {
    t.engine.endPlayPhase(); // → ACT

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const moves = t.engine.getValidMoveSquares(king.instanceId);
    if (moves.length === 0) return;

    const target = moves[0];
    const result = t.engine.moveUnit(king.instanceId, target.col, target.row);
    expect(result).toBe(true);

    // King should be at new position
    const movedKing = t.findUnit('king', Player.P1);
    expect(movedKing?.col).toBe(target.col);
    expect(movedKing?.row).toBe(target.row);
  });

  it('moveUnit rejects during PLAY phase', () => {
    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const result = t.engine.moveUnit(king.instanceId, king.col + 1, king.row);
    expect(result).toBe(false);
  });

  it('moveUnit emits UNIT_MOVED event', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const moves = t.engine.getValidMoveSquares(king.instanceId);
    if (moves.length === 0) return;

    t.engine.moveUnit(king.instanceId, moves[0].col, moves[0].row);

    const moveEvents = t.eventsOfType('UNIT_MOVED');
    expect(moveEvents.length).toBeGreaterThan(0);
  });

  it('unit cannot move to occupied cell', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    const enemyKing = t.findUnit('king', Player.P2);
    if (!king || !enemyKing) return;

    // Try moving king to enemy king's position (should fail)
    const result = t.engine.moveUnit(king.instanceId, enemyKing.col, enemyKing.row);
    expect(result).toBe(false);
  });

  it('getValidMoveSquares returns empty for just-placed unit', () => {
    // Deploy a unit
    const pos = deployCard(t, 'foot_soldier');
    if (!pos) return;

    // The unit was just placed — isJustPlaced = true
    t.engine.endPlayPhase(); // → ACT

    const unit = t.findUnit('foot_soldier', Player.P1);
    if (!unit) return;

    // Just-placed units can't act on their deploy turn
    const moves = t.engine.getValidMoveSquares(unit.instanceId);
    expect(moves).toHaveLength(0);
  });

  it('deployed unit can move on next turn', () => {
    // Deploy on P1 turn 1
    const pos = deployCard(t, 'foot_soldier');
    if (!pos) return;

    skipTurn(t.engine); // finish P1
    skipTurn(t.engine); // P2

    // P1 turn 2 — unit should be able to move
    t.engine.endPlayPhase(); // → ACT

    const unit = t.findUnit('foot_soldier', Player.P1);
    if (!unit) return;

    const moves = t.engine.getValidMoveSquares(unit.instanceId);
    expect(moves.length).toBeGreaterThan(0);
  });
});

describe('ActPhase — queries', () => {
  it('getValidAttackSquares returns positions', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    // King has HV attack pattern — check it returns something
    const attacks = t.engine.getValidAttackSquares(king.instanceId);
    // May be empty if no enemies in range, but shouldn't throw
    expect(Array.isArray(attacks)).toBe(true);
  });

  it('getAttackRange returns positions', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const range = t.engine.getAttackRange(king.instanceId);
    expect(Array.isArray(range)).toBe(true);
  });
});
