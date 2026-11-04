/**
 * Bugs found by bot-vs-bot fuzzing over the whole card pool (2026-11-04).
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../src/game/GameEngine';
import GameState from '../../../src/GameState';
import { Board } from '../../../src/game/Board';
import { createTestEngineWithDeck, injectHand, accumulate, skipTurn, Player } from '../helpers/TestHarness';
import { handleUnitDeath } from '../../../src/game/phases/ActPhase';
import { engineStateHash } from '../../../src/game/utils/stateHash';
import { applyAction } from '../../../src/network/ActionApplier';

const DECK = Array(31).fill('foot_soldier');

describe('Board index integrity', () => {
  it('a unit whose instanceId changes (Reform transform) is still found by its new id', () => {
    const t = createTestEngineWithDeck(DECK);
    const eng: any = t.engine;
    const u = eng.unitFactory.create('foot_soldier', Player.P2, { col: 1, row: 4 });
    eng.board.placeUnit(u);
    eng.board.updateUnitStats(u.instanceId, { instanceId: 'foot_soldier_x_reformed', cardId: 'swordsman' });
    expect(eng.board.getUnitById('foot_soldier_x_reformed')).not.toBeNull();
    expect(eng.board.getUnitById(u.instanceId === 'foot_soldier_x_reformed' ? '__none__' : 'foot_soldier_1')).toBeFalsy();
  });

  it('ownership changes are reflected by getUnitsOf (no stale cache)', () => {
    const b = new Board();
    const t = createTestEngineWithDeck(DECK);
    const u = (t.engine as any).unitFactory.create('foot_soldier', Player.P2, { col: 1, row: 4 });
    b.placeUnit(u);
    expect(b.getUnitsOf(Player.P2)).toHaveLength(1);   // primes the cache
    b.setOwner(u.instanceId, Player.P1);
    expect(b.getUnitsOf(Player.P2)).toHaveLength(0);
    expect(b.getUnitsOf(Player.P1).map(x => x.instanceId)).toEqual([u.instanceId]);
  });
});

describe('Deterministic summons', () => {
  function militiaGame() {
    GameState.gameSeed = 77;
    const e = new GameEngine();
    e.startGame([Array(31).fill('militia'), Array(31).fill('militia')]);
    const eng: any = e;
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 10;
    return e;
  }

  it('Militia pull: same instanceIds on every engine, and the copy leaves the deck', () => {
    const a = militiaGame(), b = militiaGame();
    const deckBefore = (a as any).players[Player.P1].deck.length;
    for (const e of [a, b]) {
      expect(applyAction(e, { type: 'PLAY_CARD', handIndex: 0, col: 0, row: 0 })).toBe(true);
      expect(e.getPendingKind()).toBe('POSITION');
      const pos = e.getPendingCommand() as any;
      expect(applyAction(e, { type: 'SELECT_POSITION', col: pos.validPositions[0].col, row: pos.validPositions[0].row })).toBe(true);
    }
    expect(engineStateHash(a)).toBe(engineStateHash(b));
    expect((a as any).players[Player.P1].deck.length).toBe(deckBefore - 1);
  });
});

describe('Casus Belli', () => {
  function casusGame() {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 2);
    const eng: any = t.engine;
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 10;
    injectHand(t.engine, Player.P1, ['casus_belli', 'pikeman', 'disease']);
    return { t, eng };
  }

  it('deploys a UNIT chosen from hand (not the spell itself) and does not crash', () => {
    const { t, eng } = casusGame();
    expect(t.engine.playCard(0)).toBe(true);
    expect(t.engine.getPendingKind()).toBe('POSITION');
    const pos = (t.engine.getPendingCommand() as any).validPositions[0];
    expect(() => t.engine.selectPosition(pos.col, pos.row)).not.toThrow();
    expect(t.engine.getPendingKind()).toBe('DISCARD');           // now: choose which hand card
    const pend: any = t.engine.getPendingCommand();
    const hand = eng.players[Player.P1].hand as string[];
    expect(pend.validHandIndices).toEqual([hand.indexOf('pikeman')]); // the spell isn't deployable
    t.engine.selectDiscard(hand.indexOf('disease'));            // not allowed
    expect(t.engine.getPendingKind()).toBe('DISCARD');
    t.engine.selectDiscard(hand.indexOf('pikeman'));
    expect(t.engine.getPendingKind()).toBeNull();
    expect(eng.board.getUnit(pos.col, pos.row)?.cardId).toBe('pikeman');
    expect(eng.players[Player.P1].hand).toEqual(['disease']);
  });

  it('cancelling after its immediate effect does NOT refund the card (no free LEG-rate drain)', () => {
    const { t, eng } = casusGame();
    const oppRate = eng.mods[Player.P2].getEffectiveLEGRate();
    t.engine.playCard(0);
    t.engine.cancelPending();
    expect(eng.players[Player.P1].hand).not.toContain('casus_belli');
    expect(eng.mods[Player.P2].getEffectiveLEGRate()).toBeLessThanOrEqual(oppRate);
  });

  it('with no unit in hand it still drains (the deploy part is skipped, no pending)', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 2);
    const eng: any = t.engine;
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 10;
    injectHand(t.engine, Player.P1, ['casus_belli', 'disease']);
    const pen = eng.mods[Player.P2].legRatePenalty;
    expect(t.engine.playCard(0)).toBe(true);
    expect(t.engine.getPendingKind()).toBeNull();
    expect(eng.mods[Player.P2].legRatePenalty).toBeGreaterThan(pen);
  });
});

describe('Deaths from effects (spells, Disease, Castle)', () => {
  function withMana(deck = DECK) {
    const t = createTestEngineWithDeck(deck);
    accumulate(t.engine, 2);
    const eng: any = t.engine;
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    return { t, eng };
  }

  it('Earthquake kills: the unit leaves the board, goes to discard, and On Death fires', () => {
    const { t, eng } = withMana();
    const fs = eng.unitFactory.create('foot_soldier', Player.P2, { col: 0, row: 4 });
    eng.board.placeUnit(fs);
    const p2Hand = eng.players[Player.P2].hand.length;
    injectHand(t.engine, Player.P1, ['earthquake']);
    expect(t.engine.playCard(0)).toBe(true);
    t.engine.selectColumn(0);
    expect(eng.board.getUnitById(fs.instanceId)).toBeNull();
    expect(eng.players[Player.P2].discard).toContain('foot_soldier');
    expect(eng.players[Player.P2].hand.length).toBe(p2Hand + 1); // Foot Soldier: On Death draw
  });

  it('an effect that drops a King to 0 ends the game immediately', () => {
    const { t, eng } = withMana();
    eng.board.getKing(Player.P2).currentDef = 3;
    injectHand(t.engine, Player.P1, ['earthquake']);
    t.engine.playCard(0);
    t.engine.selectColumn(eng.board.getKing(Player.P2).position.col === 3 && eng.board.getKing(Player.P1).position.col === 3 ? 3 : eng.board.getKing(Player.P2).position.col);
    expect(t.engine.getState().status).toBe('GAME_OVER');
  });

  it('Earthquake through both Kings at low HP is a draw', () => {
    const { t, eng } = withMana();
    const k1 = eng.board.getKing(Player.P1), k2 = eng.board.getKing(Player.P2);
    expect(k1.position.col).toBe(k2.position.col);             // both start in the centre column
    k1.currentDef = 2; k2.currentDef = 2;
    injectHand(t.engine, Player.P1, ['earthquake']);
    t.engine.playCard(0);
    t.engine.selectColumn(k1.position.col);
    const over = t.eventsOfType('GAME_OVER');
    expect(over).toHaveLength(1);
    expect((over[0] as any).result.isDraw).toBe(true);
  });

  it('a unit killed by an effect is not revived to 1 HP by the next aura pass', () => {
    const { t, eng } = withMana();
    const fs = eng.unitFactory.create('foot_soldier', Player.P2, { col: 0, row: 4 });
    eng.board.placeUnit(fs);
    injectHand(t.engine, Player.P1, ['earthquake']);
    t.engine.playCard(0);
    t.engine.selectColumn(0);
    eng.auras.evaluateAuras(eng.board, eng.mods);
    expect(eng.board.getAllUnits().some((u: any) => u.instanceId === fs.instanceId)).toBe(false);
  });
});

describe('Treason unit flags', () => {
  function stealPikeman(prepare?: (u: any) => void) {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 2);
    const eng: any = t.engine;
    const v = eng.unitFactory.create('pikeman', Player.P2, { col: 2, row: 3 });
    v.isJustPlaced = false;
    eng.board.placeUnit(v);
    prepare?.(v);
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    injectHand(t.engine, Player.P1, ['treason']);
    t.engine.playCard(0);
    t.engine.selectTarget(v.instanceId);
    return { t, eng, v };
  }

  it('a stolen unit can act this turn even if its owner used it last turn', () => {
    const { t, eng, v } = stealPikeman(u => { u.hasMoved = true; u.hasActed = true; });
    t.engine.endPlayPhase();
    expect(eng.board.getUnitById(v.instanceId).owner).toBe(Player.P1);
    expect(t.engine.getValidMoveSquares(v.instanceId).length).toBeGreaterThan(0);
  });

  it('after being handed back it is exhausted for one turn only, not forever', () => {
    const { t, eng, v } = stealPikeman();
    t.engine.endPlayPhase(); t.engine.endActPhase();     // P1 END → back to P2, exhausted
    t.engine.endPlayPhase(); t.engine.endActPhase();     // P2's turn passes
    t.engine.endPlayPhase(); t.engine.endActPhase();     // P1
    t.engine.endPlayPhase();                             // P2's next ACT
    expect(eng.board.getUnitById(v.instanceId).isExhausted).toBe(false);
    expect(t.engine.getValidMoveSquares(v.instanceId).length).toBeGreaterThan(0);
  });
});

describe('Civil War', () => {
  it('freezes both LEG rates at 0 for 3 turns each, then they come back (no permanent penalty)', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 4);
    const eng: any = t.engine;
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    const pen = [eng.mods[0].legRatePenalty, eng.mods[1].legRatePenalty];
    injectHand(t.engine, Player.P1, ['civil_war']);
    expect(t.engine.playCard(0)).toBe(true);
    expect(eng.mods[0].getEffectiveLEGRate()).toBe(0);
    expect(eng.mods[1].getEffectiveLEGRate()).toBe(0);
    const gains: number[][] = [[], []];
    t.engine.on((ev: any) => { if (ev.type === 'LEG_GAINED') gains[ev.player].push(ev.amount); });
    for (let i = 0; i < 8; i++) skipTurn(t.engine);       // 4 turns each
    expect(gains[0].slice(0, 3)).toEqual([0, 0, 0]);
    expect(gains[1].slice(0, 3)).toEqual([0, 0, 0]);
    expect(gains[0][3]).toBeGreaterThan(0);
    expect(gains[1][3]).toBeGreaterThan(0);
    expect([eng.mods[0].legRatePenalty, eng.mods[1].legRatePenalty]).toEqual(pen);
  });
});

describe('Mystic revive', () => {
  it('revives a unit from the graveyard onto your half and always applies its LEG-rate cost', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 6);
    const eng: any = t.engine;
    // kill a P1 swordsman for real so it is in the graveyard + discard
    const sw = eng.unitFactory.create('swordsman', Player.P1, { col: 1, row: 0 });
    eng.board.placeUnit(sw);
    const ctxDeath = (eng as any).buildContext();
    handleUnitDeath(ctxDeath, sw.instanceId, 'swordsman', Player.P1, 'COMBAT');
    expect(eng.players[Player.P1].discard).toContain('swordsman');
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    const penBefore = eng.mods[Player.P1].legRatePenalty;
    injectHand(t.engine, Player.P1, ['mystic']);
    expect(t.engine.playCard(0, 2, 0)).toBe(true);
    expect(eng.mods[Player.P1].legRatePenalty).toBeGreaterThan(penBefore);  // cost paid up front
    expect(t.engine.getPendingKind()).toBe('POSITION');
    const pos = (t.engine.getPendingCommand() as any).validPositions[0];
    t.engine.selectPosition(pos.col, pos.row);
    expect(eng.board.getUnit(pos.col, pos.row)?.cardId).toBe('swordsman');
    expect(eng.players[Player.P1].discard).not.toContain('swordsman');
  });
});

describe('Disease', () => {
  it('ticks 3 times as the card says', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 3);
    const eng: any = t.engine;
    const castle = eng.unitFactory.create('castle', Player.P2, { col: 5, row: 6 });
    castle.currentDef = 50; castle.maxDef = 50; castle.baseDef = 50;
    eng.board.placeUnit(castle);
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 20;
    injectHand(t.engine, Player.P1, ['disease']);
    t.engine.playCard(0);
    t.engine.selectTarget(castle.instanceId);
    for (let i = 0; i < 10; i++) skipTurn(t.engine);
    expect(50 - eng.board.getUnitById(castle.instanceId).currentDef).toBe(6); // 3 × 2
  });
});
