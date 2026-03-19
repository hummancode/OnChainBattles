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

  it('messenger deploy does NOT draw (v0.02 nerf)', () => {
    const msgIdx = t.findInHand('messenger');
    if (msgIdx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(msgIdx)) return;

    const drawsBefore = t.eventsOfType('CARD_DRAWN').length;
    t.engine.playCard(msgIdx, pos.col, pos.row);
    const drawsAfter = t.eventsOfType('CARD_DRAWN').length;

    // Messenger no longer draws on deploy
    expect(drawsAfter).toBe(drawsBefore);
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
