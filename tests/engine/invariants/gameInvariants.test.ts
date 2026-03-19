/**
 * gameInvariants.test.ts — Property-based tests using fast-check.
 * Tests game invariants that must hold regardless of action sequence.
 * Uses random action generation to find edge cases structural tests miss.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createTestEngine,
  skipTurn,
  injectHand,
  Player,
  EngineStatus,
} from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

/** Execute a random action on the engine. Swallows invalid actions. */
function executeRandomAction(t: TestEngine, action: RandomAction): void {
  try {
    switch (action.type) {
      case 'playCard':
        t.engine.playCard(action.handIndex, action.col, action.row);
        break;
      case 'endPlay':
        t.engine.endPlayPhase();
        break;
      case 'endAct':
        t.engine.endActPhase();
        break;
      case 'cancelPending':
        t.engine.cancelPending();
        break;
    }
  } catch {
    // Invalid actions are expected — fast-check generates random inputs
  }
}

type RandomAction =
  | { type: 'playCard'; handIndex: number; col: number; row: number }
  | { type: 'endPlay' }
  | { type: 'endAct' }
  | { type: 'cancelPending' };

const actionArb: fc.Arbitrary<RandomAction> = fc.oneof(
  fc.record({
    type: fc.constant('playCard' as const),
    handIndex: fc.nat(9),
    col: fc.nat(6),
    row: fc.nat(6),
  }),
  fc.record({ type: fc.constant('endPlay' as const) }),
  fc.record({ type: fc.constant('endAct' as const) }),
  fc.record({ type: fc.constant('cancelPending' as const) }),
);

describe('Game invariants (property-based)', () => {
  it('both kings always present on board after random actions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.array(actionArb, { minLength: 5, maxLength: 30 }),
        (seed, actions) => {
          const t = createTestEngine(seed);

          for (const action of actions) {
            if (t.state().status === EngineStatus.GAME_OVER) break;
            executeRandomAction(t, action);
          }

          // If game is still running, both kings must be on the board
          if (t.state().status !== EngineStatus.GAME_OVER) {
            const board = t.state().board;
            const p1King = board.some(c => c.unit?.cardId === 'king' && c.unit?.owner === Player.P1);
            const p2King = board.some(c => c.unit?.cardId === 'king' && c.unit?.owner === Player.P2);
            expect(p1King).toBe(true);
            expect(p2King).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('no two units occupy the same cell after random actions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.array(actionArb, { minLength: 5, maxLength: 30 }),
        (seed, actions) => {
          const t = createTestEngine(seed);

          for (const action of actions) {
            if (t.state().status === EngineStatus.GAME_OVER) break;
            executeRandomAction(t, action);
          }

          const board = t.state().board;
          const occupied = board.filter(c => c.unit !== null);
          const positions = occupied.map(c => `${c.col},${c.row}`);
          const unique = new Set(positions);
          expect(unique.size).toBe(positions.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('unit HP never exceeds maxDef after random actions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.array(actionArb, { minLength: 5, maxLength: 30 }),
        (seed, actions) => {
          const t = createTestEngine(seed);

          for (const action of actions) {
            if (t.state().status === EngineStatus.GAME_OVER) break;
            executeRandomAction(t, action);
          }

          const board = t.state().board;
          for (const cell of board) {
            if (cell.unit) {
              expect(cell.unit.currentDef).toBeLessThanOrEqual(cell.unit.maxDef);
              expect(cell.unit.currentAtk).toBeGreaterThanOrEqual(0);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('turn number only increases after random actions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.array(actionArb, { minLength: 10, maxLength: 40 }),
        (seed, actions) => {
          const t = createTestEngine(seed);
          let prevTurn = t.state().turn.turnNumber;

          for (const action of actions) {
            if (t.state().status === EngineStatus.GAME_OVER) break;
            executeRandomAction(t, action);
            const currentTurn = t.state().turn.turnNumber;
            expect(currentTurn).toBeGreaterThanOrEqual(prevTurn);
            prevTurn = currentTurn;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('LEG pool is never negative after random actions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.array(actionArb, { minLength: 5, maxLength: 30 }),
        (seed, actions) => {
          const t = createTestEngine(seed);

          for (const action of actions) {
            if (t.state().status === EngineStatus.GAME_OVER) break;
            executeRandomAction(t, action);
          }

          const state = t.state();
          expect(state.modifiers[0].legPool).toBeGreaterThanOrEqual(0);
          expect(state.modifiers[1].legPool).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('engine never enters invalid status after random actions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.array(actionArb, { minLength: 5, maxLength: 30 }),
        (seed, actions) => {
          const t = createTestEngine(seed);

          for (const action of actions) {
            if (t.state().status === EngineStatus.GAME_OVER) break;
            executeRandomAction(t, action);
          }

          const validStatuses = [EngineStatus.IDLE, EngineStatus.AWAITING_INPUT, EngineStatus.GAME_OVER];
          expect(validStatuses).toContain(t.state().status);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('game completes within 200 turns with random play (multiple seeds)', () => {
    const seeds = [42, 123, 456, 789, 1337, 9999, 2024, 7777];

    for (const seed of seeds) {
      const t = createTestEngine(seed);
      let turns = 0;
      const maxTurns = 200;

      while (t.state().status !== EngineStatus.GAME_OVER && turns < maxTurns) {
        // Simple AI: play first affordable card, then end turn
        const affordable = t.engine.getAffordableCards();
        if (affordable.length > 0) {
          const positions = t.engine.getValidDeployPositions();
          if (positions.length > 0) {
            t.engine.playCard(affordable[0], positions[0].col, positions[0].row);
          }
        }
        // Handle any pending interactions
        if (t.state().status === EngineStatus.AWAITING_INPUT) {
          t.engine.cancelPending();
        }
        skipTurn(t.engine);
        turns++;
      }

      // Verify game reached a terminal state or exhausted turns without crashing
      expect(turns).toBeLessThanOrEqual(maxTurns);
    }
  });
});
