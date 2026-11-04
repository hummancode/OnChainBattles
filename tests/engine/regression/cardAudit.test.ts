/**
 * Card-text vs engine audit (2026-11-04): each test pins the engine to what the card says.
 */
import { describe, it, expect } from 'vitest';
import { createTestEngineWithDeck, injectHand, accumulate, skipTurn, Player } from '../helpers/TestHarness';
import { getCard } from '../../../src/game/data/CardRegistry';
import { AbilityHandlerRegistry } from '../../../src/game/abilities/AbilityHandlerRegistry';
import { AbilityType } from '../../../src/game/types/AbilityTypes';

const DECK = Array(31).fill('foot_soldier');

/** Engine on P1's PLAY phase (or P2's when `p2`), plenty of LEG for the active player. */
function setup(p2 = false) {
  const t = createTestEngineWithDeck(DECK);
  accumulate(t.engine, 2);
  if (p2) skipTurn(t.engine);
  const eng: any = t.engine;
  const me = p2 ? Player.P2 : Player.P1;
  eng.mods[me].legOverflow = true; eng.mods[me].legPool = 30;
  /** Place a ready-to-act unit directly on the board. */
  const put = (cardId: string, owner: Player, col: number, row: number) => {
    const u = eng.unitFactory.create(cardId, owner, { col, row });
    u.isJustPlaced = false;
    u.isActive = true;
    eng.board.placeUnit(u);
    eng.auras.evaluateAuras(eng.board, eng.mods);
    return u;
  };
  return { t, eng, me, put };
}

const sq = (ps: Array<{ col: number; row: number }>) => ps.map(p => `${p.col},${p.row}`).sort();

// ─────────────────────────────────────────────
describe('Casus Belli — front row of the enemy half, On Deploy fires', () => {
  it('P1 deploys on row rows-DEPLOY_ROWS (4)', () => {
    const { t } = setup();
    injectHand(t.engine, Player.P1, ['casus_belli', 'pikeman']);
    expect(t.engine.playCard(0)).toBe(true);
    const pend: any = t.engine.getPendingCommand();
    expect(pend.validPositions.length).toBeGreaterThan(0);
    expect(new Set(pend.validPositions.map((p: any) => p.row))).toEqual(new Set([4]));
  });

  it('P2 deploys on row DEPLOY_ROWS-1 (2)', () => {
    const { t } = setup(true);
    injectHand(t.engine, Player.P2, ['casus_belli', 'pikeman']);
    expect(t.engine.playCard(0)).toBe(true);
    const pend: any = t.engine.getPendingCommand();
    expect(pend.validPositions.length).toBeGreaterThan(0);
    expect(new Set(pend.validPositions.map((p: any) => p.row))).toEqual(new Set([2]));
  });

  it("the deployed unit's On Deploy ability resolves (Priest asks for a heal target)", () => {
    const { t, eng } = setup();
    const king = eng.board.getKing(Player.P1);
    king.currentDef = king.maxDef - 3;
    injectHand(t.engine, Player.P1, ['casus_belli', 'priest']);
    t.engine.playCard(0);
    const pos = (t.engine.getPendingCommand() as any).validPositions[0];
    t.engine.selectPosition(pos.col, pos.row);
    t.engine.selectDiscard(eng.players[Player.P1].hand.indexOf('priest'));
    expect(eng.board.getUnit(pos.col, pos.row)?.cardId).toBe('priest');
    expect(t.engine.getPendingKind()).toBe('TARGET');
    const pend: any = t.engine.getPendingCommand();
    expect(pend.validTargetIds).toContain(king.instanceId);
    t.engine.selectTarget(king.instanceId);
    expect(king.currentDef).toBe(king.maxDef);
  });
});

// ─────────────────────────────────────────────
describe('Assassin — jumps diagonally, attacks the landing square', () => {
  it('P1: moves 1 or 2 squares diagonally, jumping over units', () => {
    const { t, eng, put } = setup();
    const a = put('assassin', Player.P1, 3, 2);
    put('foot_soldier', Player.P1, 4, 3);             // blocker in between
    t.engine.endPlayPhase();
    const moves = sq(t.engine.getValidMoveSquares(a.instanceId));
    // (3,0) diag-2 targets: (1,0) (5,0) are on row 0 — both free; (4,3) is occupied by a friendly
    expect(moves).toEqual(sq([
      { col: 2, row: 1 }, { col: 4, row: 1 }, { col: 2, row: 3 },
      { col: 1, row: 0 }, { col: 5, row: 0 }, { col: 1, row: 4 }, { col: 5, row: 4 },
    ]));
    expect(eng.board.getUnit(5, 4)).toBeNull();
  });

  it('P2: same diagonal jumps from its own side', () => {
    const { t, put } = setup(true);
    const a = put('assassin', Player.P2, 3, 4);
    t.engine.endPlayPhase();
    const moves = sq(t.engine.getValidMoveSquares(a.instanceId));
    expect(moves).toEqual(sq([
      { col: 2, row: 3 }, { col: 4, row: 3 }, { col: 2, row: 5 }, { col: 4, row: 5 },
      { col: 1, row: 2 }, { col: 5, row: 2 }, { col: 1, row: 6 }, { col: 5, row: 6 },
    ]));
  });

  it('jumping onto an enemy attacks it with no counter; a kill lands the Assassin there', () => {
    const { t, eng, put } = setup();
    const a = put('assassin', Player.P1, 3, 2);
    const victim = put('swordsman', Player.P2, 5, 4);
    t.engine.endPlayPhase();
    expect(sq(t.engine.getValidMoveSquares(a.instanceId))).toContain('5,4');
    victim.currentDef = 2;
    expect(t.engine.moveUnit(a.instanceId, 5, 4)).toBe(true);
    expect(eng.board.getUnitById(victim.instanceId)).toBeFalsy();
    expect(eng.board.getUnit(5, 4)?.instanceId).toBe(a.instanceId);
    expect(a.currentDef).toBe(a.maxDef);
  });

  it('a surviving target is damaged, the Assassin stays put and takes no counter', () => {
    const { t, eng, put } = setup(true);
    const a = put('assassin', Player.P2, 3, 4);
    const knight = put('knight', Player.P1, 1, 2);
    t.engine.endPlayPhase();
    const hp = knight.currentDef;
    expect(t.engine.moveUnit(a.instanceId, 1, 2)).toBe(true);
    expect(knight.currentDef).toBe(hp - a.currentAtk);
    expect(eng.board.getUnit(3, 4)?.instanceId).toBe(a.instanceId);
    expect(a.currentDef).toBe(a.maxDef);
    expect(t.engine.getValidAttackSquares(a.instanceId)).toEqual([]);   // turn used
  });
});

// ─────────────────────────────────────────────
describe('Village — −1 movement shrinks fixed patterns too', () => {
  it('a slowed Knight loses its 2-square moves', () => {
    const { t, put } = setup();
    const k = put('knight', Player.P1, 3, 2);
    put('village', Player.P2, 3, 3);
    t.engine.endPlayPhase();
    const moves = t.engine.getValidMoveSquares(k.instanceId);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(Math.max(Math.abs(m.col - 3), Math.abs(m.row - 2))).toBe(1);
  });

  it('a slowed movement-1 unit cannot move', () => {
    const { t, put } = setup();
    const p = put('pikeman', Player.P1, 3, 2);
    put('village', Player.P2, 3, 3);
    t.engine.endPlayPhase();
    expect(t.engine.getValidMoveSquares(p.instanceId)).toEqual([]);
  });
});

// ─────────────────────────────────────────────
describe('Castle — attacks only in its LEG phase', () => {
  it('cannot make a normal ACT-phase attack', () => {
    const { t, put } = setup();
    const c = put('castle', Player.P1, 3, 2);
    const e = put('foot_soldier', Player.P2, 3, 3);
    t.engine.endPlayPhase();
    expect(t.engine.getValidAttackSquares(c.instanceId)).toEqual([]);
    expect(t.engine.attackUnit(c.instanceId, e.instanceId)).toBe(false);
  });
});

// ─────────────────────────────────────────────
describe('Pikeman — ×3 vs Cavalry on counter-attacks too', () => {
  it('a Lancer attacking a Pikeman takes 3× counter damage', () => {
    const { t, eng, put } = setup();
    const l = put('lancer', Player.P1, 3, 3);
    const p = put('pikeman', Player.P2, 3, 4);
    t.engine.endPlayPhase();
    expect(t.engine.attackUnit(l.instanceId, p.instanceId)).toBe(true);
    const counter = t.events.filter((e: any) => e.type === 'UNIT_ATTACKED' && e.attackerInstanceId === p.instanceId).pop() as any;
    expect(counter.damage).toBe(p.currentAtk * 3);
    expect(eng.board.getUnitById(l.instanceId)).toBeFalsy();      // 3 dmg ≥ Lancer's 2 DEF
  });
});

// ─────────────────────────────────────────────
describe('Treason — units only; deaths go back to the original owner', () => {
  it('structures are not valid targets', () => {
    const { t, put } = setup();
    const v = put('village', Player.P2, 1, 5);
    const f = put('foot_soldier', Player.P2, 2, 5);
    injectHand(t.engine, Player.P1, ['treason']);
    expect(t.engine.playCard(0)).toBe(true);
    const pend: any = t.engine.getPendingCommand();
    expect(pend.validTargetIds).toContain(f.instanceId);
    expect(pend.validTargetIds).not.toContain(v.instanceId);
  });

  it("a controlled unit that dies goes to its owner's graveyard/discard, and its draw goes to the owner", () => {
    const { t, eng, put } = setup();
    const f = put('foot_soldier', Player.P2, 2, 5);
    injectHand(t.engine, Player.P1, ['treason']);
    t.engine.playCard(0);
    t.engine.selectTarget(f.instanceId);
    expect(f.owner).toBe(Player.P1);
    const p1Hand = eng.players[Player.P1].hand.length;
    const p2Hand = eng.players[Player.P2].hand.length;
    const p1Discard = [...eng.players[Player.P1].discard];
    eng.applyEvent({ type: 'UNIT_DIED', instanceId: f.instanceId, cardId: 'foot_soldier', owner: Player.P1,
      col: 2, row: 5, cause: 'EFFECT' });
    expect(eng.board.getUnitById(f.instanceId)).toBeFalsy();
    expect(eng.players[Player.P1].discard).toEqual(p1Discard);
    expect(eng.players[Player.P2].discard).toContain('foot_soldier');
    expect(eng.players[Player.P2].graveyard).toContain(f.instanceId);
    expect(eng.players[Player.P1].graveyard).not.toContain(f.instanceId);
    expect(eng.players[Player.P1].hand.length).toBe(p1Hand);
    expect(eng.players[Player.P2].hand.length).toBe(p2Hand + 1);
  });

  it('a Treason-controlled unit can act this turn ("fights for you this turn")', () => {
    const { t, put } = setup();
    const f = put('foot_soldier', Player.P2, 3, 3);
    injectHand(t.engine, Player.P1, ['treason']);
    t.engine.playCard(0);
    t.engine.selectTarget(f.instanceId);
    t.engine.endPlayPhase();
    expect(t.engine.getValidMoveSquares(f.instanceId).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
describe('Coup — a captured unit cannot act the turn it is captured', () => {
  it('no moves/attacks this turn, free next turn', () => {
    const { t, eng, put } = setup();
    const v = put('princess', Player.P2, 3, 3);
    put('foot_soldier', Player.P2, 3, 4);
    injectHand(t.engine, Player.P1, ['coup']);
    t.engine.playCard(0);
    t.engine.selectTarget(v.instanceId);
    expect(v.owner).toBe(Player.P1);
    t.engine.endPlayPhase();
    expect(t.engine.getValidMoveSquares(v.instanceId)).toEqual([]);
    expect(t.engine.moveUnit(v.instanceId, 2, 3)).toBe(false);
    t.engine.endActPhase();
    skipTurn(t.engine);                                      // P2 passes → P1 again
    t.engine.endPlayPhase();
    expect(t.engine.getValidMoveSquares(v.instanceId).length).toBeGreaterThan(0);
    expect(eng.board.getUnitById(v.instanceId)?.owner).toBe(Player.P1);
  });
});

// ─────────────────────────────────────────────
describe('Messenger', () => {
  it('its aura has a (no-op) handler and its text mentions Swift', () => {
    expect(AbilityHandlerRegistry.get(AbilityType.AURA_SUPPRESS_KING_ATK)).toBeTruthy();
    expect(getCard('messenger').abilityText).toMatch(/Swift/);
  });
});

// ─────────────────────────────────────────────
describe('Card texts match the rules', () => {
  const text = (id: string) => getCard(id).abilityText;
  it.each([
    ['scout', /Backstab/],
    ['king', /\+1 each turn \(max 10\)/],
    ['disease', /enemy Structure/],
    ['peasant_revolt', /auto-placed/],
    ['mystic', /highest-cost/],
    ['casus_belli', /one unit from your hand/],
    ['castle', /each of your LEG phases/],
  ])('%s', (id, re) => { expect(text(id)).toMatch(re); });

  it('Pikeman flank is continuous (no "this turn")', () => {
    expect(text('pikeman')).not.toMatch(/this turn/);
  });
  it('Militia / Mystic use "a valid deploy square"', () => {
    expect(text('militia')).toMatch(/a valid deploy square/);
    expect(text('mystic')).toMatch(/a valid deploy square/);
  });
});

describe('Refused spell play leaves the engine unchanged', () => {
  it('a targeted spell with no target keeps the hand order (no unlogged state change)', () => {
    const { t } = setup();
    // treason with no enemy non-Royal unit on the board → refused
    injectHand(t.engine, Player.P1, ['foot_soldier', 'treason', 'archer']);
    const before = [...t.engine.getState().players[Player.P1].hand];
    const leg = t.engine.getState().modifiers[Player.P1].legPool;
    expect(t.engine.playCard(1)).toBe(false);
    expect(t.engine.getState().players[Player.P1].hand).toEqual(before);
    expect(t.engine.getState().modifiers[Player.P1].legPool).toBe(leg);
  });
});
