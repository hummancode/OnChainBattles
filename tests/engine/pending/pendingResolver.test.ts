import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, Player, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('PendingResolver — cancelPending', () => {
  it('cancelPending on IDLE engine is safe no-op', () => {
    expect(t.state().status).toBe(EngineStatus.IDLE);
    t.engine.cancelPending();
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('cancelPending clears AWAITING_INPUT back to IDLE', () => {
    // Accumulate LEG for priest
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;
    t.engine.playCard(priestIdx, pos.col, pos.row);

    if (t.state().status === EngineStatus.AWAITING_INPUT) {
      t.engine.cancelPending();
      expect(t.state().status).toBe(EngineStatus.IDLE);
    }
  });

  it('after cancel, player can still end phase', () => {
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;
    t.engine.playCard(priestIdx, pos.col, pos.row);

    if (t.state().status === EngineStatus.AWAITING_INPUT) {
      t.engine.cancelPending();
    }

    // Should be able to proceed normally
    t.engine.endPlayPhase();
    expect(t.state().turn.phase).toBe('ACT');
  });
});

describe('PendingResolver — selectTarget', () => {
  it('selectTarget with invalid instanceId is ignored', () => {
    t.engine.selectTarget('nonexistent_id');
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('selectTarget when no pending is a no-op', () => {
    const king = t.findUnit('king', Player.P1);
    if (king) {
      t.engine.selectTarget(king.instanceId);
    }
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});

describe('PendingResolver — selectColumn', () => {
  it('selectColumn when no pending is a no-op', () => {
    t.engine.selectColumn(3);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('selectColumn with out-of-bounds is ignored', () => {
    t.engine.selectColumn(-1);
    t.engine.selectColumn(99);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});

describe('PendingResolver — selectPosition', () => {
  it('selectPosition when no pending is a no-op', () => {
    t.engine.selectPosition(3, 3);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});

describe('PendingResolver — selectDiscard', () => {
  it('selectDiscard when no pending is a no-op', () => {
    t.engine.selectDiscard(0);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('selectDiscard with invalid index is ignored', () => {
    t.engine.selectDiscard(-1);
    t.engine.selectDiscard(999);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});
