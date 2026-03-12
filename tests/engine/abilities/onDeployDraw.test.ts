import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, deployCard, Player } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('onDeployDraw — Scout and Messenger', () => {
  it('scout deploy emits SCOUT_RESULT (reveal opponent top cards)', () => {
    const scoutIdx = t.findInHand('scout');
    if (scoutIdx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(scoutIdx)) return;

    t.engine.playCard(scoutIdx, pos.col, pos.row);

    const scoutEvents = t.eventsOfType('SCOUT_RESULT');
    expect(scoutEvents.length).toBeGreaterThan(0);
    const ev = scoutEvents[0] as any;
    expect(ev.topCards).toBeDefined();
  });

  it('messenger deploy draws 1 card', () => {
    const msgIdx = t.findInHand('messenger');
    if (msgIdx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(msgIdx)) return;

    const handBefore = t.state().players[Player.P1].hand.length;
    const deckBefore = t.state().players[Player.P1].deckCount;

    t.engine.playCard(msgIdx, pos.col, pos.row);

    const handAfter = t.state().players[Player.P1].hand.length;
    const deckAfter = t.state().players[Player.P1].deckCount;

    // Played 1, drew 1 → net hand change = 0
    expect(handAfter).toBe(handBefore - 1 + 1);
    expect(deckAfter).toBe(deckBefore - 1);
  });

  it('foot_soldier has no on-deploy draw (it draws on death)', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const drawsBefore = t.eventsOfType('CARD_DRAWN').length;
    t.engine.playCard(idx, pos.col, pos.row);

    // foot_soldier has ON_DEATH_DRAW, not ON_DEPLOY_DRAW
    // No draw events should fire from deploy
    const drawsAfter = t.eventsOfType('CARD_DRAWN').length;
    expect(drawsAfter).toBe(drawsBefore);
  });
});
