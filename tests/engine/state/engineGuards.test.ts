/**
 * Engine guard tests — idempotency, dead target selection, state machine safety.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngine,
  createTestEngineWithDeck,
  injectHand,
  skipTurn,
  deployCard,
  accumulate,
  Player,
} from '../helpers/TestHarness';

describe('startGame idempotency', () => {
  it('calling startGame() twice does not crash or duplicate kings', () => {
    const t = createTestEngine();

    // Count kings before
    const kingsBefore = t.state().board.filter(c => c.unit?.cardId === 'king').length;
    expect(kingsBefore).toBe(2); // P1 + P2

    // Calling startGame again should be a no-op
    t.engine.startGame();

    const kingsAfter = t.state().board.filter(c => c.unit?.cardId === 'king').length;
    expect(kingsAfter).toBe(2); // Still 2, not 4
  });
});

describe('selectTarget on dead unit', () => {
  it('rejects target selection when unit no longer exists on board', () => {
    const t = createTestEngineWithDeck([
      'foot_soldier', 'foot_soldier', 'foot_soldier',
      'pikeman', 'pikeman',
      'archer', 'archer',
      'swordsman', 'swordsman',
      'priest',
      'lancer', 'lancer',
      'scout', 'scout',
      'messenger',
      'militia',
      'knight',
      'commander',
      'foot_soldier', 'foot_soldier', 'foot_soldier',
      'pikeman', 'pikeman',
      'archer', 'archer',
      'swordsman', 'swordsman',
      'foot_soldier', 'foot_soldier', 'foot_soldier',
      'pikeman',
    ]);

    // Build up LEG
    accumulate(t.engine, 2);

    // Deploy a priest to trigger heal pending
    injectHand(t.engine, Player.P1, ['priest']);
    const pos = deployCard(t, 'priest');

    // The test verifies the guard works at the API level:
    // selectTarget with a non-existent instanceId should do nothing
    const statesBefore = t.state();
    t.engine.selectTarget('nonexistent_unit_id');
    const statesAfter = t.state();

    // Engine state should be unchanged (no crash, no side effects)
    expect(statesAfter.status).toBe(statesBefore.status);
  });
});
