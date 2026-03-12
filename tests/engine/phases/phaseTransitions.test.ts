import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, Player, TurnPhase, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('Phase transitions', () => {
  it('starts in PLAY phase, P1 active', () => {
    const s = t.state();
    expect(s.turn.phase).toBe(TurnPhase.PLAY);
    expect(s.turn.activePlayer).toBe(Player.P1);
    expect(s.turn.turnNumber).toBe(1);
  });

  it('PLAY → ACT via endPlayPhase', () => {
    t.engine.endPlayPhase();
    expect(t.state().turn.phase).toBe(TurnPhase.ACT);
    expect(t.state().turn.activePlayer).toBe(Player.P1);
  });

  it('ACT → next player PLAY via endActPhase', () => {
    t.engine.endPlayPhase();
    t.engine.endActPhase();
    const s = t.state();
    expect(s.turn.activePlayer).toBe(Player.P2);
    expect(s.turn.phase).toBe(TurnPhase.PLAY);
  });

  it('full round: P1 turn + P2 turn → turn 2', () => {
    skipTurn(t.engine); // P1
    skipTurn(t.engine); // P2
    const s = t.state();
    expect(s.turn.turnNumber).toBe(2);
    expect(s.turn.activePlayer).toBe(Player.P1);
  });

  it('endPlayPhase is no-op during ACT', () => {
    t.engine.endPlayPhase();
    t.engine.endPlayPhase(); // no-op
    expect(t.state().turn.phase).toBe(TurnPhase.ACT);
  });

  it('endActPhase is no-op during PLAY', () => {
    t.engine.endActPhase(); // no-op
    expect(t.state().turn.phase).toBe(TurnPhase.PLAY);
  });

  it('emits PHASE_CHANGED events', () => {
    t.engine.endPlayPhase();
    const phaseEvents = t.eventsOfType('PHASE_CHANGED');
    expect(phaseEvents.length).toBeGreaterThanOrEqual(1);
    const last = phaseEvents[phaseEvents.length - 1] as any;
    expect(last.phase).toBe(TurnPhase.ACT);
  });

  it('emits TURN_STARTED on turn change', () => {
    skipTurn(t.engine);
    const turnEvents = t.eventsOfType('TURN_STARTED');
    // At least 2: initial + P2's turn
    expect(turnEvents.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase guards with AWAITING_INPUT', () => {
  it('endPlayPhase blocked during AWAITING_INPUT', () => {
    // Play a Priest to trigger pending TARGET
    const priestIdx = t.findInHand('priest');
    if (priestIdx >= 0) {
      const pos = t.deployPositions()[0];
      t.engine.playCard(priestIdx, pos.col, pos.row);

      if (t.state().status === EngineStatus.AWAITING_INPUT) {
        t.engine.endPlayPhase(); // should be no-op
        expect(t.state().turn.phase).toBe(TurnPhase.PLAY);
      }
    }
  });
});
