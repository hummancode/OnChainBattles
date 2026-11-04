/** At the hand limit a drawn card is burned, and Motherland overflow is trimmed with
 *  handIndex -1 — incremental events drifted the hand UI. The HUD refresh re-syncs it from state. */
import { describe, it, expect } from 'vitest';
import { reconcileHand } from '../../src/scenes/battle/HUDRefreshCoordinator';
import { createTestEngine } from '../engine/helpers/TestHarness';

function fakeHand(ids: string[]) {
  let cards = ids.map(id => ({ id }));
  let rebuilds = 0;
  return {
    cardIds: () => cards.map(c => c.id),
    setHand: (c: any[]) => { cards = c; rebuilds++; },
    get rebuilds() { return rebuilds; },
  };
}

describe('reconcileHand', () => {
  it('rebuilds the hand when the UI drifted from the engine', () => {
    const { engine } = createTestEngine();
    const real = engine.getState().players[0].hand;
    const hand = fakeHand([...real, real[0]]); // phantom extra card (burned draw)
    expect(reconcileHand(engine, 0, hand)).toBe(true);
    expect(hand.cardIds()).toEqual([...real]);
  });

  it('leaves a matching hand alone (keeps selection / hover)', () => {
    const { engine } = createTestEngine();
    const hand = fakeHand([...engine.getState().players[0].hand]);
    expect(reconcileHand(engine, 0, hand)).toBe(false);
    expect(hand.rebuilds).toBe(0);
  });
});
