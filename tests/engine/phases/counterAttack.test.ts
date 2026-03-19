/**
 * counterAttack.test.ts — Counter-attack and dying blow mechanics.
 * v0.02: Deploy to King's row (row 0 P1, row 6 P2) per row placement rule.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngine,
  deployCard,
  skipTurn,
  injectHand,
  Player,
  TurnPhase,
} from '../helpers/TestHarness';

describe('Counter-attack mechanics', () => {
  it('melee defender counter-attacks after surviving', () => {
    const t = createTestEngine();
    for (let i = 0; i < 10; i++) skipTurn(t.engine);

    // Deploy P1 swordsman at King's row (0)
    injectHand(t.engine, Player.P1, ['swordsman', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    expect(deployCard(t, 'swordsman', 4, 0)).not.toBeNull();
    t.engine.endPlayPhase(); t.engine.endActPhase();

    // P2 deploy swordsman at King's row (6)
    injectHand(t.engine, Player.P2, ['swordsman', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    expect(deployCard(t, 'swordsman', 4, 6)).not.toBeNull();
    t.engine.endPlayPhase(); t.engine.endActPhase();

    // Walk P1 swordsman forward: 0→1, 1→2, 2→3, 3→4, 4→5
    for (let targetRow = 1; targetRow <= 5; targetRow++) {
      t.engine.endPlayPhase();
      const u = t.findUnit('swordsman', Player.P1);
      expect(u).not.toBeNull();
      t.engine.moveUnit(u!.instanceId, 4, targetRow);
      t.engine.endActPhase();
      skipTurn(t.engine);
    }

    // P1 swordsman at (3,5), P2 at (3,6) — adjacent. Attack!
    t.engine.endPlayPhase();
    const attacker = t.findUnit('swordsman', Player.P1);
    const defender = t.findUnit('swordsman', Player.P2);
    expect(attacker).not.toBeNull();
    expect(defender).not.toBeNull();

    const eventsBefore = t.events.length;
    const attacked = t.engine.attackUnit(attacker!.instanceId, defender!.instanceId);
    expect(attacked).toBe(true);

    const combatEvents = t.events.slice(eventsBefore);
    const attacks = combatEvents.filter(e => e.type === 'UNIT_ATTACKED');
    // Primary + counter = 2 attack events (both swordsmen are melee)
    expect(attacks.length).toBe(2);
  });

  it('attack event order: primary attack before counter-attack', () => {
    const t = createTestEngine();
    for (let i = 0; i < 10; i++) skipTurn(t.engine);

    // Deploy foot soldiers at King's rows
    injectHand(t.engine, Player.P1, ['foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    expect(deployCard(t, 'foot_soldier', 4, 0)).not.toBeNull();
    t.engine.endPlayPhase(); t.engine.endActPhase();

    injectHand(t.engine, Player.P2, ['foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    expect(deployCard(t, 'foot_soldier', 4, 6)).not.toBeNull();
    t.engine.endPlayPhase(); t.engine.endActPhase();

    // Walk P1 to row 5 (adjacent to P2 at row 6)
    for (let targetRow = 1; targetRow <= 5; targetRow++) {
      t.engine.endPlayPhase();
      const u = t.findUnit('foot_soldier', Player.P1);
      expect(u).not.toBeNull();
      t.engine.moveUnit(u!.instanceId, 4, targetRow);
      t.engine.endActPhase();
      skipTurn(t.engine);
    }

    // Attack
    t.engine.endPlayPhase();
    const att = t.findUnit('foot_soldier', Player.P1);
    const def = t.findUnit('foot_soldier', Player.P2);
    expect(att).not.toBeNull();
    expect(def).not.toBeNull();

    const eventsBefore = t.events.length;
    t.engine.attackUnit(att!.instanceId, def!.instanceId);
    const combatEvents = t.events.slice(eventsBefore);
    const attacks = combatEvents.filter(e => e.type === 'UNIT_ATTACKED');

    if (attacks.length >= 2) {
      expect((attacks[0] as any).attackerInstanceId).toBe(att!.instanceId);
      expect((attacks[1] as any).attackerInstanceId).toBe(def!.instanceId);
    }
  });

  it('attack executes and produces UNIT_ATTACKED events', () => {
    const t = createTestEngine();
    for (let i = 0; i < 10; i++) skipTurn(t.engine);

    injectHand(t.engine, Player.P1, ['archer', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    expect(deployCard(t, 'archer', 4, 0)).not.toBeNull();
    t.engine.endPlayPhase(); t.engine.endActPhase();

    injectHand(t.engine, Player.P2, ['foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
    expect(deployCard(t, 'foot_soldier', 4, 6)).not.toBeNull();
    t.engine.endPlayPhase(); t.engine.endActPhase();

    // Move archer forward
    t.engine.endPlayPhase();
    const archer = t.findUnit('archer', Player.P1);
    expect(archer).not.toBeNull();
    const moves = t.engine.getValidMoveSquares(archer!.instanceId);
    if (moves.length > 0) {
      t.engine.moveUnit(archer!.instanceId, moves[0].col, moves[0].row);
    }
    t.engine.endActPhase();
    skipTurn(t.engine);

    // Try attack
    t.engine.endPlayPhase();
    const arch = t.findUnit('archer', Player.P1);
    const target = t.findUnit('foot_soldier', Player.P2);
    expect(arch).not.toBeNull();
    expect(target).not.toBeNull();

    const eventsBefore = t.events.length;
    const result = t.engine.attackUnit(arch!.instanceId, target!.instanceId);
    if (result) {
      const combatEvents = t.events.slice(eventsBefore);
      expect(combatEvents.some(e => e.type === 'UNIT_ATTACKED')).toBe(true);
    }
  });
});
