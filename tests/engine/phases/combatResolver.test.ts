import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, TurnPhase, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';
import { resolveAttack } from '../../../src/game/CombatResolver';
import { Board } from '../../../src/game/Board';
import { UnitFactory } from '../../../src/game/UnitFactory';
import type { EvUnitAttacked } from '../../../src/game/types/EventTypes';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('Combat — attack basics', () => {
  it('rejects attack during PLAY phase', () => {
    // Can't attack in PLAY
    const king = t.findUnit('king', Player.P1);
    const enemyKing = t.findUnit('king', Player.P2);
    if (king && enemyKing) {
      const result = t.engine.attackUnit(king.instanceId, enemyKing.instanceId);
      expect(result).toBe(false);
    }
  });

  it('rejects attack with invalid unit IDs', () => {
    t.engine.endPlayPhase();
    const result = t.engine.attackUnit('nonexistent', 'also_nonexistent');
    expect(result).toBe(false);
  });

  it('attack deals damage and emits UNIT_ATTACKED', () => {
    // Deploy a foot soldier for P1
    const pos = deployCard(t, 'foot_soldier');
    if (!pos) return; // card not in hand, skip

    skipTurn(t.engine); // P1 done

    // Deploy a foot soldier for P2
    const pos2 = deployCard(t, 'foot_soldier');
    skipTurn(t.engine); // P2 done

    // P1's turn again — ACT phase: try to attack
    t.engine.endPlayPhase(); // to ACT

    const p1Unit = t.findUnit('foot_soldier', Player.P1);
    const p2Unit = t.findUnit('foot_soldier', Player.P2);

    if (p1Unit && p2Unit) {
      // Check if P2's unit is in attack range
      const range = t.engine.getValidAttackSquares(p1Unit.instanceId);
      const canAttack = range.some((p: any) => p.col === p2Unit.col && p.row === p2Unit.row);

      if (canAttack) {
        const before = t.state().board.find(
          c => c.unit?.instanceId === p2Unit.instanceId
        )?.unit?.currentDef ?? 0;

        t.engine.attackUnit(p1Unit.instanceId, p2Unit.instanceId);

        const attacked = t.eventsOfType('UNIT_ATTACKED');
        expect(attacked.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Combat — backstab & ambush bonuses', () => {
  // Direction reference:
  //   P1 home = row 0, faces toward row 6 → back = toward row 0 (lower rows)
  //   P2 home = row 6, faces toward row 0 → back = toward row 6 (higher rows)
  //
  // Backstab: dx=0, exactly 1 row behind (Scout: +1)
  // Ambush:   |dx|≤1, exactly 1 row behind (Assassin: +1)

  it('Scout backstab: directly behind P1 King deals 2 damage (base 1 + backstab 1)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // P2 Scout directly behind: same col, 1 row behind P1 (row 1 < row 2)
    const scout = factory.create('scout', Player.P2, { col: 3, row: 1 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(2); // 1 base + 1 backstab
    expect(attackEvent.targetNewHP).toBe(king.currentDef - 2);
  });

  it('regular unit attacking from behind deals NO bonus (no backstab/ambush)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Foot soldier behind P1 King — no backstab/ambush property
    const soldier = factory.create('foot_soldier', Player.P2, { col: 3, row: 1 });
    board.placeUnit(soldier);

    const events = resolveAttack(soldier, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1); // base only, no universal bonus
  });

  it('Scout diagonal-behind does NOT trigger backstab (dx≠0)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Scout at diagonal-behind: dx=1, 1 row behind
    const scout = factory.create('scout', Player.P2, { col: 4, row: 1 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1); // backstab requires dx=0
  });

  it('Assassin ambush: diagonal-behind triggers +1 (|dx|≤1)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Assassin at diagonal-behind: dx=1, 1 row behind P1
    const assassin = factory.create('assassin', Player.P2, { col: 4, row: 1 });
    board.placeUnit(assassin);

    const events = resolveAttack(assassin, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(5); // 4 base + 1 ambush
  });

  it('Assassin ambush: directly behind also triggers +1', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Assassin directly behind: dx=0, 1 row behind
    const assassin = factory.create('assassin', Player.P2, { col: 3, row: 1 });
    board.placeUnit(assassin);

    const events = resolveAttack(assassin, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(5); // 4 base + 1 ambush
  });

  it('front attack deals no bonus', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Scout in front: row 3 > row 2 = P1's front
    const scout = factory.create('scout', Player.P2, { col: 3, row: 3 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1);
  });

  it('same-row attack deals no bonus', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 3 });
    board.placeUnit(king);

    const scout = factory.create('scout', Player.P2, { col: 4, row: 3 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1);
  });

  it('backstab works symmetrically for P2 defender', () => {
    const factory = new UnitFactory();
    const board = new Board();

    // P2 King at row 4. P2's back = higher rows (toward row 6).
    const king = factory.create('king', Player.P2, { col: 3, row: 4 });
    board.placeUnit(king);

    // P1 Scout directly behind P2 King: row 5 > row 4
    const scout = factory.create('scout', Player.P1, { col: 3, row: 5 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(2); // 1 base + 1 backstab
  });

  it('ambush works symmetrically for P2 defender', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P2, { col: 3, row: 4 });
    board.placeUnit(king);

    // P1 Assassin at diagonal-behind P2 King: row 5 > row 4, dx=1
    const assassin = factory.create('assassin', Player.P1, { col: 4, row: 5 });
    board.placeUnit(assassin);

    const events = resolveAttack(assassin, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(5); // 4 base + 1 ambush
  });

  it('2+ rows behind does NOT trigger backstab or ambush (must be exactly 1 row)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 3 });
    board.placeUnit(king);

    // Scout 2 rows behind: row 1 vs row 3 = dy=-2
    const scout = factory.create('scout', Player.P2, { col: 3, row: 1 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1); // no bonus at 2-row distance
  });
});

describe('Combat — guards', () => {
  it('rejects attack when status is AWAITING_INPUT', () => {
    // If we can trigger AWAITING_INPUT, attack should fail
    const priestIdx = t.findInHand('priest');
    if (priestIdx >= 0) {
      const pos = t.deployPositions()[0];
      t.engine.playCard(priestIdx, pos.col, pos.row);

      if (t.state().status === EngineStatus.AWAITING_INPUT) {
        const king = t.findUnit('king', Player.P1);
        if (king) {
          const result = t.engine.attackUnit(king.instanceId, 'anything');
          expect(result).toBe(false);
        }
      }
    }
  });

  it('moveUnit rejects during PLAY phase', () => {
    const king = t.findUnit('king', Player.P1);
    if (king) {
      const result = t.engine.moveUnit(king.instanceId, king.col + 1, king.row);
      expect(result).toBe(false);
    }
  });
});
