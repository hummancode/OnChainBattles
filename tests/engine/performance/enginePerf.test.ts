/**
 * enginePerf.test.ts — Performance benchmarks for engine operations.
 * Measures execution time of operations that run on user clicks
 * (playCard, endPhase, aura recalc, move/attack queries).
 *
 * These are not pass/fail speed gates — they measure and report timings
 * so regressions are visible. Thresholds flag obvious problems.
 *
 * Budget: each user-facing operation should complete in <5ms on test hardware.
 * If any operation consistently exceeds 10ms, investigate.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngine,
  createTestEngineWithDeck,
  deployCard,
  skipTurn,
  injectHand,
  getPlayerState,
  MIXED_DECK_IDS,
  Player,
  TurnPhase,
  EngineStatus,
} from '../helpers/TestHarness';

/** Measure execution time of a function in milliseconds (high-res). */
function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/** Run a function N times and return [avg, max, min] in ms. */
function benchmark(fn: () => void, iterations: number): { avg: number; max: number; min: number } {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    times.push(measure(fn));
  }
  return {
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    max: Math.max(...times),
    min: Math.min(...times),
  };
}

/** Set up a mid-game board with several units deployed. */
function createMidGameEngine() {
  const t = createTestEngine();
  // Accumulate LEG
  for (let i = 0; i < 12; i++) skipTurn(t.engine);

  // Deploy several P1 units
  injectHand(t.engine, Player.P1, ['foot_soldier', 'archer', 'pikeman', 'swordsman']);
  deployCard(t, 'foot_soldier', 1, 2);
  deployCard(t, 'archer', 3, 2);
  deployCard(t, 'pikeman', 5, 2);
  t.engine.endPlayPhase(); t.engine.endActPhase();

  // Deploy several P2 units
  injectHand(t.engine, Player.P2, ['foot_soldier', 'archer', 'pikeman', 'swordsman']);
  deployCard(t, 'foot_soldier', 1, 5);
  deployCard(t, 'archer', 3, 5);
  deployCard(t, 'pikeman', 5, 5);
  t.engine.endPlayPhase(); t.engine.endActPhase();

  // A few more turns for a crowded board
  injectHand(t.engine, Player.P1, ['scout', 'lancer', 'messenger', 'militia']);
  deployCard(t, 'scout', 2, 1);
  deployCard(t, 'lancer', 4, 1);
  t.engine.endPlayPhase(); t.engine.endActPhase();

  injectHand(t.engine, Player.P2, ['scout', 'lancer', 'messenger', 'militia']);
  deployCard(t, 'scout', 2, 6);
  deployCard(t, 'lancer', 4, 6);
  t.engine.endPlayPhase(); t.engine.endActPhase();

  return t;
}

describe('Engine performance benchmarks', () => {
  const PERF_THRESHOLD_MS = 10; // Flag operations slower than this

  describe('playCard (deploy unit)', () => {
    it('should deploy a unit in <5ms', () => {
      const t = createTestEngine();
      for (let i = 0; i < 6; i++) skipTurn(t.engine);

      injectHand(t.engine, Player.P1, ['foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier']);
      const positions = t.deployPositions();

      const ms = measure(() => {
        t.engine.playCard(0, positions[0].col, positions[0].row);
      });

      console.log(`  playCard (deploy): ${ms.toFixed(2)}ms`);
      expect(ms).toBeLessThan(PERF_THRESHOLD_MS);
    });
  });

  describe('endPlayPhase + endActPhase (turn transition)', () => {
    it('should complete phase transitions in <5ms each', () => {
      const t = createMidGameEngine();

      const playMs = measure(() => t.engine.endPlayPhase());
      const actMs = measure(() => t.engine.endActPhase());

      console.log(`  endPlayPhase: ${playMs.toFixed(2)}ms`);
      console.log(`  endActPhase:  ${actMs.toFixed(2)}ms`);
      expect(playMs).toBeLessThan(PERF_THRESHOLD_MS);
      expect(actMs).toBeLessThan(PERF_THRESHOLD_MS);
    });

    it('full turn cycle (DRAW→LEG→PLAY→ACT→END) under 10ms', () => {
      const t = createMidGameEngine();

      const turnMs = measure(() => {
        skipTurn(t.engine);
      });

      console.log(`  full turn cycle: ${turnMs.toFixed(2)}ms`);
      expect(turnMs).toBeLessThan(PERF_THRESHOLD_MS);
    });
  });

  describe('getValidMoveSquares / getValidAttackSquares (per-click queries)', () => {
    it('move query completes in <2ms with crowded board', () => {
      const t = createMidGameEngine();
      // Skip to ACT so we can query moves
      t.engine.endPlayPhase();

      const unit = t.findUnit('foot_soldier', Player.P1);
      expect(unit).not.toBeNull();

      const result = benchmark(
        () => t.engine.getValidMoveSquares(unit!.instanceId),
        100,
      );

      console.log(`  getValidMoveSquares: avg=${result.avg.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);
      expect(result.avg).toBeLessThan(2);
      expect(result.max).toBeLessThan(PERF_THRESHOLD_MS);
    });

    it('attack query completes in <2ms with crowded board', () => {
      const t = createMidGameEngine();
      t.engine.endPlayPhase();

      const unit = t.findUnit('archer', Player.P1);
      expect(unit).not.toBeNull();

      const result = benchmark(
        () => t.engine.getValidAttackSquares(unit!.instanceId),
        100,
      );

      console.log(`  getValidAttackSquares: avg=${result.avg.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);
      expect(result.avg).toBeLessThan(2);
      expect(result.max).toBeLessThan(PERF_THRESHOLD_MS);
    });

    it('deploy positions query in <1ms', () => {
      const t = createMidGameEngine();

      const result = benchmark(
        () => t.engine.getValidDeployPositions(),
        100,
      );

      console.log(`  getValidDeployPositions: avg=${result.avg.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);
      expect(result.avg).toBeLessThan(1);
    });
  });

  describe('getAffordableCards (hand UI query)', () => {
    it('affordable cards query in <1ms with full hand', () => {
      const t = createMidGameEngine();
      injectHand(t.engine, Player.P1, [
        'foot_soldier', 'archer', 'pikeman', 'swordsman', 'knight',
        'priest', 'commander', 'princess', 'scout', 'lancer',
      ]);

      const result = benchmark(
        () => t.engine.getAffordableCards(),
        100,
      );

      console.log(`  getAffordableCards: avg=${result.avg.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);
      expect(result.avg).toBeLessThan(1);
    });
  });

  describe('aura recalculation (runs every phase transition)', () => {
    it('aura recalc with 10+ units completes in <5ms', () => {
      const t = createMidGameEngine();
      // The aura recalc happens during turn transitions.
      // We measure a full skipTurn which includes aura recalc.
      const times: number[] = [];

      for (let i = 0; i < 10; i++) {
        const ms = measure(() => skipTurn(t.engine));
        times.push(ms);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      console.log(`  turn with aura recalc (10+ units): avg=${avg.toFixed(2)}ms, max=${max.toFixed(2)}ms`);
      expect(avg).toBeLessThan(PERF_THRESHOLD_MS);
    });
  });

  describe('getState() snapshot (called every render frame)', () => {
    it('state snapshot in <2ms with crowded board', () => {
      const t = createMidGameEngine();

      const result = benchmark(
        () => t.engine.getState(),
        100,
      );

      console.log(`  getState snapshot: avg=${result.avg.toFixed(3)}ms, max=${result.max.toFixed(3)}ms`);
      expect(result.avg).toBeLessThan(2);
    });
  });

  describe('stress test: full game to completion', () => {
    it('complete game finishes in <500ms', () => {
      const ms = measure(() => {
        const t = createTestEngine(42);
        let turns = 0;

        while (t.state().status !== EngineStatus.GAME_OVER && turns < 200) {
          const affordable = t.engine.getAffordableCards();
          if (affordable.length > 0) {
            const positions = t.engine.getValidDeployPositions();
            if (positions.length > 0) {
              t.engine.playCard(affordable[0], positions[0].col, positions[0].row);
            }
          }
          if (t.state().status === EngineStatus.AWAITING_INPUT) {
            t.engine.cancelPending();
          }
          skipTurn(t.engine);
          turns++;
        }
      });

      console.log(`  full game (to GAME_OVER or 200 turns): ${ms.toFixed(2)}ms`);
      expect(ms).toBeLessThan(500);
    });
  });
});
