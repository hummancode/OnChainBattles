/**
 * pendingResolution.test.ts — COLUMN and DISCARD pending resolution tests.
 * BUG-B3: Earthquake COLUMN no-op (PendingCommandResolver has no COLUMN handler)
 * BUG-B4: War Horn DISCARD no-op (PendingCommandResolver has no DISCARD handler)
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngineWithDeck,
  injectHand,
  getPlayerState,
  deployCard,
  skipTurn,
  MIXED_DECK_IDS,
  Player,
  TurnPhase,
  EngineStatus,
} from '../helpers/TestHarness';

/** Accumulate LEG by skipping turns. Each full round ≈ +1 LEG per player. */
function accumulateLEG(t: ReturnType<typeof createTestEngineWithDeck>, rounds: number) {
  for (let i = 0; i < rounds * 2; i++) skipTurn(t.engine);
}

describe('COLUMN pending resolution (Earthquake)', () => {
  it('earthquake creates a COLUMN pending interaction', () => {
    const t = createTestEngineWithDeck(MIXED_DECK_IDS);
    accumulateLEG(t, 5); // Need 5+ LEG for earthquake cost=5

    injectHand(t.engine, Player.P1, ['earthquake']);
    const played = t.engine.playCard(0);
    expect(played).toBe(true);
    expect(t.state().status).toBe(EngineStatus.AWAITING_INPUT);
  });

  it('selectColumn damages units in the selected column', () => {
    const t = createTestEngineWithDeck(MIXED_DECK_IDS);

    // Deploy P2 foot soldier at col 3 row 5
    skipTurn(t.engine); // P1
    injectHand(t.engine, Player.P2, ['foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    deployCard(t, 'foot_soldier', 3, 5);
    t.engine.endPlayPhase();
    t.engine.endActPhase();

    // Accumulate more LEG for earthquake
    accumulateLEG(t, 4);

    // P1 plays earthquake
    injectHand(t.engine, Player.P1, ['earthquake']);
    const played = t.engine.playCard(0);
    expect(played).toBe(true);
    expect(t.state().status).toBe(EngineStatus.AWAITING_INPUT);

    // Select column 3 (where P2's foot soldier is)
    const eventsBefore = t.events.length;
    t.engine.selectColumn(3);

    // Earthquake does 3 damage to all units in column.
    // Foot_soldier (DEF 1) should die. King also in col 3 takes damage.
    const newEvents = t.events.slice(eventsBefore);
    const attackEvents = newEvents.filter(e => e.type === 'UNIT_ATTACKED');
    const deathEvents = newEvents.filter(e => e.type === 'UNIT_DIED');

    // At least the foot_soldier should be hit (may also hit kings in col 3)
    expect(attackEvents.length).toBeGreaterThanOrEqual(1);

    // Engine should return to IDLE
    expect(t.state().status).not.toBe(EngineStatus.AWAITING_INPUT);
  });

  it('selectColumn on empty column resolves without crash', () => {
    const t = createTestEngineWithDeck(MIXED_DECK_IDS);
    accumulateLEG(t, 5);

    injectHand(t.engine, Player.P1, ['earthquake']);
    t.engine.playCard(0);
    expect(t.state().status).toBe(EngineStatus.AWAITING_INPUT);

    // Column 6 should be empty (no deployments)
    t.engine.selectColumn(6);
    expect(t.state().status).not.toBe(EngineStatus.AWAITING_INPUT);
  });
});

describe('DISCARD pending resolution (War Horn)', () => {
  it('war horn draws 2 cards and creates DISCARD pending', () => {
    const t = createTestEngineWithDeck(MIXED_DECK_IDS);
    accumulateLEG(t, 3); // war horn costs 3

    const psBefore = getPlayerState(t.engine, Player.P1);
    injectHand(t.engine, Player.P1, ['war_horn']);
    const played = t.engine.playCard(0);
    expect(played).toBe(true);
    expect(t.state().status).toBe(EngineStatus.AWAITING_INPUT);

    // War horn was played (removed from hand), then 2 cards drawn
    const psAfter = getPlayerState(t.engine, Player.P1);
    expect(psAfter.hand.length).toBe(2);
  });

  it('selectDiscard removes card from hand', () => {
    const t = createTestEngineWithDeck(MIXED_DECK_IDS);
    accumulateLEG(t, 3);

    injectHand(t.engine, Player.P1, ['war_horn']);
    const played = t.engine.playCard(0);
    expect(played).toBe(true);
    expect(t.state().status).toBe(EngineStatus.AWAITING_INPUT);

    const psBefore = getPlayerState(t.engine, Player.P1);
    const handBefore = psBefore.hand.length;
    const discardBefore = psBefore.discard.length;

    // Discard the first card
    t.engine.selectDiscard(0);

    const psAfter = getPlayerState(t.engine, Player.P1);
    // Hand should shrink by 1
    expect(psAfter.hand.length).toBe(handBefore - 1);
    // Discard pile should grow by 1 (the card we just discarded)
    expect(psAfter.discard.length).toBe(discardBefore + 1);
    // Engine should return to IDLE
    expect(t.state().status).not.toBe(EngineStatus.AWAITING_INPUT);
  });

  it('selectDiscard with invalid index is no-op', () => {
    const t = createTestEngineWithDeck(MIXED_DECK_IDS);
    accumulateLEG(t, 3);

    injectHand(t.engine, Player.P1, ['war_horn']);
    t.engine.playCard(0);
    expect(t.state().status).toBe(EngineStatus.AWAITING_INPUT);

    // Invalid index
    t.engine.selectDiscard(99);
    expect(t.state().status).toBe(EngineStatus.AWAITING_INPUT);
  });
});
