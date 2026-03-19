/**
 * Disease spell tests.
 *
 * Disease should:
 * 1. Only target ENEMY structures (not own)
 * 2. Create a DISEASE_TICK timed effect (recurring damage, not one-shot)
 * 3. Tick each LEG phase for the specified duration
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

// Deck with structures and disease
const DISEASE_DECK = [
  'foot_soldier', 'foot_soldier', 'foot_soldier',
  'pikeman', 'pikeman',
  'archer', 'archer',
  'swordsman', 'swordsman',
  'castle', 'village',
  'disease',
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
  'foot_soldier', 'foot_soldier',
];

describe('Disease spell', () => {
  it('should only allow targeting enemy structures, not own', () => {
    const t = createTestEngineWithDeck(DISEASE_DECK);

    // Build up LEG
    accumulate(t.engine, 3);

    // P1 places a village (own structure)
    injectHand(t.engine, Player.P1, ['village']);
    const villagePos = deployCard(t, 'village');
    expect(villagePos).not.toBeNull();

    // Skip to P2's turn, P2 places a castle (enemy structure from P1's perspective)
    skipTurn(t.engine); // end P1's turn
    accumulate(t.engine, 2); // build P2's LEG

    injectHand(t.engine, Player.P2, ['castle']);
    const castlePos = deployCard(t, 'castle');
    expect(castlePos).not.toBeNull();

    // Skip back to P1's turn
    skipTurn(t.engine); // end P2's turn

    // Now P1 plays Disease — should only be able to target P2's castle, not own village
    injectHand(t.engine, Player.P1, ['disease']);
    t.events.length = 0; // clear events

    const played = t.engine.playCard(0);
    expect(played).toBe(true);

    // Find the PENDING_TARGET event to see what targets are valid
    const pendingEvent = t.eventsOfType('PENDING_TARGET')[0] as any;
    expect(pendingEvent).toBeDefined();

    // The valid targets should NOT include P1's own village
    const p1Village = t.state().board.find(
      c => c.unit?.cardId === 'village' && c.unit?.owner === Player.P1
    );
    const p2Castle = t.state().board.find(
      c => c.unit?.cardId === 'castle' && c.unit?.owner === Player.P2
    );

    if (p1Village?.unit) {
      expect(pendingEvent.validTargetIds).not.toContain(p1Village.unit.instanceId);
    }
    if (p2Castle?.unit) {
      expect(pendingEvent.validTargetIds).toContain(p2Castle.unit.instanceId);
    }
  });

  it('should create DISEASE_TICK timed effect on target selection', () => {
    const t = createTestEngineWithDeck(DISEASE_DECK);

    // Build up LEG
    accumulate(t.engine, 3);

    // P2 places a castle
    // Switch to P2's turn
    skipTurn(t.engine);
    injectHand(t.engine, Player.P2, ['castle']);
    const castlePos = deployCard(t, 'castle');
    expect(castlePos).not.toBeNull();

    // Skip to P1's turn
    skipTurn(t.engine);

    // P1 plays Disease
    injectHand(t.engine, Player.P1, ['disease']);
    const played = t.engine.playCard(0);
    expect(played).toBe(true);

    // Select the castle as target
    const p2Castle = t.state().board.find(
      c => c.unit?.cardId === 'castle' && c.unit?.owner === Player.P2
    );
    expect(p2Castle?.unit).toBeDefined();

    t.engine.selectTarget(p2Castle!.unit!.instanceId);

    // After target selection, there should be a DISEASE_TICK effect
    // on P1's mods (ticks during P1's LEG phase)
    const p1Mods = t.state().modifiers[Player.P1];
    const diseaseEffect = p1Mods.timedEffects.find(
      (e: any) => e.type === 'DISEASE_TICK'
    );
    expect(diseaseEffect).toBeDefined();
    expect(diseaseEffect!.targetInstanceId).toBe(p2Castle!.unit!.instanceId);
  });
});
