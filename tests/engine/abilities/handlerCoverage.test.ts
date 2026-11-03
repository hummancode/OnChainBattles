/**
 * Every active ability in the card pool must resolve to a registered handler.
 * Regression: Coup, Treason and Peasant Revolt were registered under 'coupHandler' /
 * 'treasonHandler' / 'peasantRevoltHandler' while their cards use SPELL_COUP /
 * SPELL_TREASON / SPELL_REVOLT — the dispatcher found nothing and the spells did nothing.
 */
import { describe, it, expect } from 'vitest';
import { createTestEngineWithDeck, injectHand, accumulate, Player } from '../helpers/TestHarness';
import { CARD_DEFINITIONS } from '../../../src/game/data/CardDefinitions';
import { AbilityHandlerRegistry } from '../../../src/game/abilities/AbilityHandlerRegistry';

describe('Ability handler coverage', () => {
  it('no active (non-aura, non-passive) ability is missing a handler', () => {
    const missing: string[] = [];
    for (const d of CARD_DEFINITIONS) {
      for (const a of d.abilities as any[]) {
        const key = a.type === 'CUSTOM' ? a.handler : a.type;
        if (/^(AURA_|PASSIVE_)/.test(key)) continue; // processed by AuraSystem / phases
        if (!AbilityHandlerRegistry.get(key)) missing.push(`${d.id}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

const DECK = Array(31).fill('foot_soldier');

describe('Previously dead spells now work', () => {
  function withEnemyRoyal() {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 2);
    const eng: any = t.engine;
    const victim = eng.unitFactory.create('princess', Player.P2, { col: 1, row: 5 });
    eng.board.placeUnit(victim);
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    return { t, eng, victim };
  }

  it('Coup with enough remaining LEG captures the target permanently', () => {
    const { t, eng, victim } = withEnemyRoyal();             // pool 20, coup 12 → 8 left ≥ princess 5
    injectHand(t.engine, Player.P1, ['coup']);
    expect(t.engine.playCard(0)).toBe(true);
    expect(t.engine.getPendingKind()).toBe('TARGET');
    t.engine.selectTarget(victim.instanceId);
    expect(eng.board.getUnitById(victim.instanceId)?.owner).toBe(Player.P1);
    t.engine.endPlayPhase(); t.engine.endActPhase();      // still ours after the turn
    expect(eng.board.getUnitById(victim.instanceId)?.owner).toBe(Player.P1);
  });

  it('Coup without enough remaining LEG banishes the target from the game', () => {
    const { t, eng, victim } = withEnemyRoyal();
    eng.mods[Player.P1].legPool = 14;                      // 14 − 12 = 2 < princess 5
    injectHand(t.engine, Player.P1, ['coup']);
    t.engine.playCard(0);
    t.engine.selectTarget(victim.instanceId);
    expect(eng.board.getUnitById(victim.instanceId)).toBeFalsy();
    expect(eng.players[Player.P2].discard).not.toContain('princess'); // banished, not discarded
    expect(t.eventsOfType('UNIT_BANISHED')).toHaveLength(1);
  });

  it('Treason steals an enemy non-Royal unit for this turn only', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 2);
    const eng: any = t.engine;
    const victim = eng.unitFactory.create('foot_soldier', Player.P2, { col: 2, row: 5 });
    eng.board.placeUnit(victim);
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    injectHand(t.engine, Player.P1, ['treason']);
    expect(t.engine.playCard(0)).toBe(true);
    expect(t.engine.getPendingKind()).toBe('TARGET');
    t.engine.selectTarget(victim.instanceId);
    expect(eng.board.getUnitById(victim.instanceId).owner).toBe(Player.P1);
    t.engine.endPlayPhase(); t.engine.endActPhase();      // P1's END → returns
    const back = eng.board.getUnitById(victim.instanceId);
    expect(back.owner).toBe(Player.P2);
    expect([back.position.col, back.position.row]).toEqual([2, 5]);
  });

  it('Peasant Revolt applies its penalties', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 3);
    const eng: any = t.engine;
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    const before = { p1: eng.mods[Player.P1].royalCostPenalty, p2: eng.mods[Player.P2].royalCostPenalty,
      r1: eng.mods[Player.P1].getEffectiveLEGRate(), r2: eng.mods[Player.P2].getEffectiveLEGRate() };
    injectHand(t.engine, Player.P1, ['peasant_revolt']);
    expect(t.engine.playCard(0)).toBe(true);
    const after = { p1: eng.mods[Player.P1].royalCostPenalty, p2: eng.mods[Player.P2].royalCostPenalty,
      r1: eng.mods[Player.P1].getEffectiveLEGRate(), r2: eng.mods[Player.P2].getEffectiveLEGRate() };
    expect(after).not.toEqual(before);
  });
});

describe('Treason return edge cases', () => {
  it('a stolen unit that moved returns to its original square; blocked square → stays put', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 2);
    const eng: any = t.engine;
    const victim = eng.unitFactory.create('foot_soldier', Player.P2, { col: 2, row: 3 });
    victim.isJustPlaced = false;
    eng.board.placeUnit(victim);
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    injectHand(t.engine, Player.P1, ['treason']);
    t.engine.playCard(0);
    t.engine.selectTarget(victim.instanceId);
    t.engine.endPlayPhase();
    eng.board.moveUnit(victim.instanceId, 2, 2);             // it walked away…
    const blocker = eng.unitFactory.create('foot_soldier', Player.P1, { col: 2, row: 3 });
    eng.board.placeUnit(blocker);                            // …and its square got taken
    expect(() => t.engine.endActPhase()).not.toThrow();
    const back = eng.board.getUnitById(victim.instanceId);
    expect(back.owner).toBe(Player.P2);
    expect([back.position.col, back.position.row]).toEqual([2, 2]);
  });
});
