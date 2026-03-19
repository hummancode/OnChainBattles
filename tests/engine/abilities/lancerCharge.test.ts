/**
 * lancerCharge.test.ts — Lancer charge mechanic tests.
 *
 * v0.02 rules: Lancer can MOVE + ATTACK in the same turn.
 * After moving, can ONLY attack in the direction of movement.
 * No forward-only movement restriction.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngine,
  deployCard,
  skipTurn,
  injectHand,
  Player,
  TurnPhase,
} from '../helpers/TestHarness';

/**
 * Helper: deploy a lancer at King's row (row 0 for P1) and advance to ACT phase.
 */
function setupLancerOnBoard() {
  const t = createTestEngine();

  // Accumulate LEG — lancer costs 4
  for (let i = 0; i < 8; i++) skipTurn(t.engine);

  // Deploy lancer to row 0 (King's row — always valid)
  injectHand(t.engine, Player.P1, ['lancer', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
  const pos = deployCard(t, 'lancer', 4, 0);
  expect(pos).not.toBeNull();

  // End P1 turn, P2 turn, back to P1 ACT (so lancer isn't isJustPlaced)
  t.engine.endPlayPhase();
  t.engine.endActPhase();
  skipTurn(t.engine);
  t.engine.endPlayPhase();
  expect(t.state().turn.phase).toBe(TurnPhase.ACT);

  const lancer = t.findUnit('lancer', Player.P1);
  expect(lancer).not.toBeNull();

  return { t, lancer: lancer! };
}

describe('Lancer charge', () => {
  it('forward move preserves attack ability (charge works)', () => {
    const { t, lancer } = setupLancerOnBoard();

    // Move forward (higher row = toward enemy for P1)
    const moved = t.engine.moveUnit(lancer.instanceId, 4, 1);
    expect(moved).toBe(true);

    const lancerUnit = t.state().board.find(c => c.unit?.instanceId === lancer.instanceId)?.unit;
    expect(lancerUnit).toBeTruthy();
    expect(lancerUnit!.hasActed).toBe(false);
    expect(lancerUnit!.hasMoved).toBe(true);
    expect(lancerUnit!.canAttackAfterMove).toBe(true);
    // Direction should be recorded
    expect(lancerUnit!.lastMoveDirection).toEqual({ dx: 0, dy: 1 });
  });

  it('after move, attack is limited to move direction only', () => {
    const { t, lancer } = setupLancerOnBoard();

    // Move forward
    const moved = t.engine.moveUnit(lancer.instanceId, 4, 1);
    expect(moved).toBe(true);

    const lancerUnit = t.state().board.find(c => c.unit?.instanceId === lancer.instanceId)?.unit;
    expect(lancerUnit!.lastMoveDirection).toEqual({ dx: 0, dy: 1 });

    // Attack should be restricted to dy=+1 direction only (forward)
    const attacks = t.engine.getValidAttackSquares(lancer.instanceId);
    for (const atk of attacks) {
      const ady = Math.sign(atk.row - lancerUnit!.position.row);
      const adx = Math.sign(atk.col - lancerUnit!.position.col);
      expect(adx).toBe(0);
      expect(ady).toBe(1);
    }
  });

  it('backward move still allows attack (in backward direction)', () => {
    const { t, lancer } = setupLancerOnBoard();

    // Move lancer forward first to have room to go back
    t.engine.moveUnit(lancer.instanceId, 4, 1);
    t.engine.endActPhase(); // end P1 ACT
    skipTurn(t.engine);     // P2 turn
    t.engine.endPlayPhase(); // back to P1 ACT

    const lancerUnit = t.findUnit('lancer', Player.P1);
    expect(lancerUnit).not.toBeNull();

    // Now move backward
    const moved = t.engine.moveUnit(lancerUnit!.instanceId, 4, 0);
    expect(moved).toBe(true);

    const state = t.state().board.find(c => c.unit?.instanceId === lancerUnit!.instanceId)?.unit;
    // v0.02: backward move no longer forfeits attack — just limits direction
    expect(state!.hasActed).toBe(false);
    expect(state!.lastMoveDirection).toEqual({ dx: 0, dy: -1 });
  });

  it('non-charge unit always ends turn after any move', () => {
    const t = createTestEngine();

    // Deploy foot_soldier to King's row
    injectHand(t.engine, Player.P1, ['foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    const pos = deployCard(t, 'foot_soldier', 4, 0);
    expect(pos).not.toBeNull();

    // Skip to next P1 ACT
    t.engine.endPlayPhase();
    t.engine.endActPhase();
    skipTurn(t.engine);
    t.engine.endPlayPhase();

    const unit = t.findUnit('foot_soldier', Player.P1);
    expect(unit).not.toBeNull();

    const moved = t.engine.moveUnit(unit!.instanceId, 4, 1);
    expect(moved).toBe(true);
    const unitState = t.state().board.find(c => c.unit?.instanceId === unit!.instanceId)?.unit;
    expect(unitState).not.toBeNull();
    expect(unitState!.hasActed).toBe(true);
  });
});
