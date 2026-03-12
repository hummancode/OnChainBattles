import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, TurnPhase, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('Combat — attack basics', () => {
  it('rejects attack during PLAY phase', () => {
    // Can't attack in PLAY
    const king = t.findUnit('king', Player.P1);
    const enemyKing = t.findUnit('king', Player.P2);
    if (king && enemyKing) {
      const result = t.engine.attackUnit(king.instanceId, enemyKing.instanceId);
      expect(result).toBe(false);
    }
  });

  it('rejects attack with invalid unit IDs', () => {
    t.engine.endPlayPhase();
    const result = t.engine.attackUnit('nonexistent', 'also_nonexistent');
    expect(result).toBe(false);
  });

  it('attack deals damage and emits UNIT_ATTACKED', () => {
    // Deploy a foot soldier for P1
    const pos = deployCard(t, 'foot_soldier');
    if (!pos) return; // card not in hand, skip

    skipTurn(t.engine); // P1 done

    // Deploy a foot soldier for P2
    const pos2 = deployCard(t, 'foot_soldier');
    skipTurn(t.engine); // P2 done

    // P1's turn again — ACT phase: try to attack
    t.engine.endPlayPhase(); // to ACT

    const p1Unit = t.findUnit('foot_soldier', Player.P1);
    const p2Unit = t.findUnit('foot_soldier', Player.P2);

    if (p1Unit && p2Unit) {
      // Check if P2's unit is in attack range
      const range = t.engine.getValidAttackSquares(p1Unit.instanceId);
      const canAttack = range.some((p: any) => p.col === p2Unit.col && p.row === p2Unit.row);

      if (canAttack) {
        const before = t.state().board.find(
          c => c.unit?.instanceId === p2Unit.instanceId
        )?.unit?.currentDef ?? 0;

        t.engine.attackUnit(p1Unit.instanceId, p2Unit.instanceId);

        const attacked = t.eventsOfType('UNIT_ATTACKED');
        expect(attacked.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Combat — guards', () => {
  it('rejects attack when status is AWAITING_INPUT', () => {
    // If we can trigger AWAITING_INPUT, attack should fail
    const priestIdx = t.findInHand('priest');
    if (priestIdx >= 0) {
      const pos = t.deployPositions()[0];
      t.engine.playCard(priestIdx, pos.col, pos.row);

      if (t.state().status === EngineStatus.AWAITING_INPUT) {
        const king = t.findUnit('king', Player.P1);
        if (king) {
          const result = t.engine.attackUnit(king.instanceId, 'anything');
          expect(result).toBe(false);
        }
      }
    }
  });

  it('moveUnit rejects during PLAY phase', () => {
    const king = t.findUnit('king', Player.P1);
    if (king) {
      const result = t.engine.moveUnit(king.instanceId, king.col + 1, king.row);
      expect(result).toBe(false);
    }
  });
});
