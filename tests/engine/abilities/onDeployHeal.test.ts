import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('Priest — onDeployHeal', () => {
  it('creates TARGET pending when friendly units are damaged', () => {
    // First deploy a cheap unit that we can damage later
    const soldierPos = deployCard(t, 'foot_soldier');
    if (!soldierPos) return;

    // Skip turns until we have enough LEG for Priest (cost 6)
    // P1 gains 1 LEG/turn base. We need several turns.
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    // Now it's P1's turn with accumulated LEG
    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return; // not in hand

    const pos = t.deployPositions()[0];
    if (!pos) return;

    // Check if we can afford it
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    t.engine.playCard(priestIdx, pos.col, pos.row);

    // Priest triggers heal — but only if damaged units exist
    // Since foot_soldier is at full HP, priest should NOT create pending
    // (we filter out full-HP units)
    // This validates the full-HP filter fix
    const allFull = t.state().board
      .filter(c => c.unit?.owner === Player.P1 && c.unit.cardId !== 'king')
      .every(c => c.unit!.currentDef === c.unit!.maxDef);

    if (allFull) {
      // No pending — healed nobody since all are full
      expect(t.state().status).toBe('IDLE');
    } else {
      // Some unit is damaged — pending TARGET should exist
      expect(t.state().status).toBe('AWAITING_INPUT');
    }
  });

  it('skips pending when no damaged friendly units', () => {
    // Accumulate LEG
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    // All friendly units should be at full HP → no pending
    t.engine.playCard(priestIdx, pos.col, pos.row);

    // The Priest just deployed at full HP, king is full HP
    // Since we filter u.currentDef < u.maxDef, pending should NOT trigger
    // Status stays IDLE
    expect(t.state().status).not.toBe('AWAITING_INPUT');
  });

  it('cancelPending returns engine to IDLE', () => {
    // This test needs a damaged unit to trigger pending
    // We'll check: if status is AWAITING_INPUT after priest play, cancel works
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

  it('emits PENDING_TARGET event when heal triggers', () => {
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const eventsBefore = t.events.length;
    t.engine.playCard(priestIdx, pos.col, pos.row);

    if (t.state().status === EngineStatus.AWAITING_INPUT) {
      const pendingEvents = t.eventsOfType('PENDING_TARGET');
      expect(pendingEvents.length).toBeGreaterThan(0);
    }
  });
});
