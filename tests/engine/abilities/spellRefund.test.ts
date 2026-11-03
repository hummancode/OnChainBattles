/**
 * Targeted spells (Roadmap 4.3):
 *  - cancelling the target choice refunds the spell (card back to hand, LEG back)
 *  - a targeted spell with no valid target cannot be played at all (was: card + LEG wasted)
 *  - a UNIT's optional on-deploy target (Priest heal) just fizzles — unit stays, no refund
 */
import { describe, it, expect } from 'vitest';
import { createTestEngineWithDeck, injectHand, accumulate, deployCard, skipTurn, Player } from '../helpers/TestHarness';

const DECK = [
  'foot_soldier', 'foot_soldier', 'foot_soldier', 'pikeman', 'pikeman', 'archer', 'archer',
  'swordsman', 'swordsman', 'castle', 'village', 'disease', 'coup', 'priest', 'priest',
  'lancer', 'lancer', 'scout', 'scout', 'messenger', 'militia', 'knight', 'commander',
  'foot_soldier', 'foot_soldier', 'pikeman', 'pikeman', 'archer', 'archer', 'swordsman', 'swordsman',
];
const st = (t: any) => t.engine.getState();
const leg = (t: any, p: Player) => st(t).modifiers[p].legPool;
const hand = (t: any, p: Player) => [...st(t).players[p].hand];

describe('Targeted spell refund', () => {
  it('cancelling Disease returns the card to hand and refunds its LEG', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 3);
    skipTurn(t.engine);                                    // P2's turn: build an enemy structure
    injectHand(t.engine, Player.P2, ['village']);
    expect(deployCard(t, 'village')).not.toBeNull();
    skipTurn(t.engine);                                    // back to P1

    injectHand(t.engine, Player.P1, ['disease', 'pikeman']);
    const legBefore = leg(t, Player.P1);
    expect(t.engine.playCard(0)).toBe(true);
    expect(t.engine.getPendingKind()).toBe('TARGET');
    expect(leg(t, Player.P1)).toBeLessThan(legBefore);

    t.events.length = 0;
    t.engine.cancelPending();
    expect(t.engine.getPendingKind()).toBeNull();
    expect(leg(t, Player.P1)).toBe(legBefore);
    expect(hand(t, Player.P1).sort()).toEqual(['disease', 'pikeman']);
    expect((t.engine as any).players[Player.P1].discard).not.toContain('disease');
    expect(t.eventsOfType('CARD_RETURNED')).toHaveLength(1);
  });

  it('a targeted spell with no valid target is refused and costs nothing', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 8);
    injectHand(t.engine, Player.P1, ['coup']);              // no enemy Royal units on board
    (t.engine as any).mods[Player.P1].legOverflow = true;   // allow a pool above the CROWN cap in this test
    (t.engine as any).mods[Player.P1].legPool = 15;         // affordable (cost 12) — refusal must be about targets
    const legBefore = leg(t, Player.P1);
    expect(legBefore).toBe(15);
    expect(t.engine.playCard(0)).toBe(false);
    expect(leg(t, Player.P1)).toBe(legBefore);
    expect(hand(t, Player.P1)).toEqual(['coup']);
    expect((t.engine as any).players[Player.P1].discard).not.toContain('coup');
    expect(st(t).status).toBe('IDLE');
  });

  it("a unit's cancelled on-deploy target fizzles: unit stays, cost is not refunded", () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 8);
    // damage the king so Priest has a heal target
    const k = (t.engine as any).board.getKing(Player.P1); k.currentDef = 5;
    injectHand(t.engine, Player.P1, ['priest']);
    const legBefore = leg(t, Player.P1);
    expect(deployCard(t, 'priest')).not.toBeNull();
    expect(t.engine.getPendingKind()).toBe('TARGET');
    t.engine.cancelPending();
    expect(leg(t, Player.P1)).toBeLessThan(legBefore);
    expect(hand(t, Player.P1)).toEqual([]);
    expect(t.findUnit('priest', Player.P1)).not.toBeNull();
  });
});
