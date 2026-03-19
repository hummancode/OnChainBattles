/**
 * board.test.ts — Board data structure tests.
 * Tests place, remove, move, queries, and serialization.
 */

import { describe, it, expect } from 'vitest';
import { Board } from '../../../src/game/Board';
import { Player } from '../../../src/game/types/GameTypes';
import type { Unit } from '../../../src/game/types/GameTypes';

function makeUnit(id: string, owner: Player, col: number, row: number): Unit {
  return {
    instanceId: id,
    cardId: id.split('_')[0],
    owner,
    position: { col, row },
    baseAtk: 2, currentAtk: 2,
    baseDef: 3, currentDef: 3, maxDef: 3,
    baseMovement: 1, currentMovement: 1,
    baseAtkPattern: 'HV' as any,
    isActive: true, isJustPlaced: false,
    hasActed: false, hasMoved: false,
    isExhausted: false, isStunned: false, isRooted: false, isSilenced: false,
    canAttackAfterMove: false,
    activeBuffs: [],
    combatTag: undefined as any,
  } as Unit;
}

describe('Board', () => {
  it('placeUnit at empty cell succeeds', () => {
    const board = new Board(7, 7);
    const unit = makeUnit('foot_1', Player.P1, 3, 2);
    board.placeUnit(unit);
    expect(board.getUnit(3, 2)).toBe(unit);
    expect(board.getUnitById('foot_1')).toBe(unit);
  });

  it('placeUnit at occupied cell throws', () => {
    const board = new Board(7, 7);
    board.placeUnit(makeUnit('foot_1', Player.P1, 3, 2));
    expect(() => board.placeUnit(makeUnit('foot_2', Player.P1, 3, 2))).toThrow();
  });

  it('removeUnit returns removed unit', () => {
    const board = new Board(7, 7);
    const unit = makeUnit('foot_1', Player.P1, 3, 2);
    board.placeUnit(unit);
    const removed = board.removeUnit('foot_1');
    expect(removed).toBe(unit);
    expect(board.getUnit(3, 2)).toBeNull();
    expect(board.getUnitById('foot_1')).toBeNull();
  });

  it('removeUnit on non-existent id returns null', () => {
    const board = new Board(7, 7);
    expect(board.removeUnit('nonexistent')).toBeNull();
  });

  it('moveUnit relocates unit correctly', () => {
    const board = new Board(7, 7);
    const unit = makeUnit('foot_1', Player.P1, 3, 2);
    board.placeUnit(unit);
    board.moveUnit('foot_1', 4, 3);
    expect(board.getUnit(3, 2)).toBeNull();
    expect(board.getUnit(4, 3)).toBe(unit);
    expect(unit.position.col).toBe(4);
    expect(unit.position.row).toBe(3);
  });

  it('getAdjacentUnits returns correct neighbors', () => {
    const board = new Board(7, 7);
    board.placeUnit(makeUnit('a', Player.P1, 3, 3));
    board.placeUnit(makeUnit('b', Player.P1, 4, 3)); // east
    board.placeUnit(makeUnit('c', Player.P2, 3, 4)); // south
    board.placeUnit(makeUnit('d', Player.P1, 0, 0)); // far away
    const adj = board.getAdjacentUnits(3, 3);
    const ids = adj.map(u => u.instanceId).sort();
    expect(ids).toEqual(['b', 'c']);
  });

  it('getUnitsInColumn returns all units in column', () => {
    const board = new Board(7, 7);
    board.placeUnit(makeUnit('a', Player.P1, 3, 0));
    board.placeUnit(makeUnit('b', Player.P2, 3, 5));
    board.placeUnit(makeUnit('c', Player.P1, 4, 2)); // different column
    const inCol = board.getUnitsInColumn(3);
    expect(inCol).toHaveLength(2);
    expect(inCol.map(u => u.instanceId).sort()).toEqual(['a', 'b']);
  });

  it('serialize produces deep copy', () => {
    const board = new Board(7, 7);
    board.placeUnit(makeUnit('foot_1', Player.P1, 3, 2));
    const snap1 = board.serialize();
    const cell = snap1.find(c => c.unit?.instanceId === 'foot_1');
    expect(cell).toBeTruthy();
    // Mutate the snapshot
    cell!.unit!.currentDef = 999;
    // Original board should be unaffected
    expect(board.getUnitById('foot_1')!.currentDef).toBe(3);
  });

  it('isOwnHalf correct for both players', () => {
    const board = new Board(7, 7);
    // P1 owns rows 0-2, P2 owns rows 4-6
    expect(board.isOwnHalf(0, 0, Player.P1)).toBe(true);
    expect(board.isOwnHalf(0, 2, Player.P1)).toBe(true);
    expect(board.isOwnHalf(0, 3, Player.P1)).toBe(false); // neutral
    expect(board.isOwnHalf(0, 4, Player.P2)).toBe(true);
    expect(board.isOwnHalf(0, 6, Player.P2)).toBe(true);
    expect(board.isOwnHalf(0, 3, Player.P2)).toBe(false); // neutral
  });

  it('clear removes all units', () => {
    const board = new Board(7, 7);
    board.placeUnit(makeUnit('a', Player.P1, 0, 0));
    board.placeUnit(makeUnit('b', Player.P2, 6, 6));
    board.clear();
    expect(board.getAllUnits()).toHaveLength(0);
  });
});
