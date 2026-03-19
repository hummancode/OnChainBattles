/**
 * BUILD_DELAY activation tests.
 *
 * Structures with BUILD_DELAY (Castle, Village, Temple) should be
 * inactive on the turn they're placed and activate on the owner's
 * next LEG phase.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngineWithDeck,
  injectHand,
  skipTurn,
  deployCard,
  accumulate,
  Player,
} from '../helpers/TestHarness';

describe('BUILD_DELAY activation', () => {
  it('structure placed with BUILD_DELAY becomes active on next turn', () => {
    // Use a deck with castle in it
    const deckIds = [
      'foot_soldier', 'foot_soldier', 'foot_soldier',
      'pikeman', 'pikeman',
      'archer', 'archer',
      'swordsman', 'swordsman',
      'castle',
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
    ];

    const t = createTestEngineWithDeck(deckIds);

    // Accumulate enough LEG to play a Castle (cost 4)
    accumulate(t.engine, 3); // ~6 rounds to build up LEG

    // Inject castle into P1's hand
    injectHand(t.engine, Player.P1, ['castle']);

    // Deploy castle
    const pos = deployCard(t, 'castle');
    expect(pos).not.toBeNull();

    // Find the castle unit on the board — should be inactive
    const castleCell = t.state().board.find(
      c => c.unit?.cardId === 'castle' && c.unit?.owner === Player.P1
    );
    expect(castleCell).toBeDefined();
    expect(castleCell!.unit!.isActive).toBe(false);

    // Skip P1's remaining phases + P2's full turn
    skipTurn(t.engine); // End P1's turn (Act→End), starts P2's turn
    skipTurn(t.engine); // P2's full turn (Play→Act→End), starts P1's turn

    // Now P1's LEG phase has run — castle should be active
    const castleAfter = t.state().board.find(
      c => c.unit?.cardId === 'castle' && c.unit?.owner === Player.P1
    );
    expect(castleAfter).toBeDefined();
    expect(castleAfter!.unit!.isActive).toBe(true); // THIS SHOULD PASS AFTER FIX

    // Verify UNIT_ACTIVATED event was emitted
    const activatedEvents = t.eventsOfType('UNIT_ACTIVATED');
    expect(activatedEvents.length).toBeGreaterThanOrEqual(1);
    const castleActivated = activatedEvents.find(
      (e: any) => e.instanceId === castleCell!.unit!.instanceId
    );
    expect(castleActivated).toBeDefined();
  });
});
