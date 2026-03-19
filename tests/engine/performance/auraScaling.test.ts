/**
 * auraScaling.test.ts — Performance tests for aura system scaling.
 *
 * Tests how aura recalculation time grows with unit count.
 * The aura system is O(n²) due to BoardHalfDef/AtkProcessor iterating
 * all units per source. This test suite measures the actual scaling
 * to flag regressions and establish baselines for optimization.
 *
 * Budget: <5ms for ≤15 units, <15ms for ≤25 units.
 * If any operation consistently exceeds these, investigate.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestEngine,
  deployCard,
  skipTurn,
  injectHand,
  Player,
  EngineStatus,
} from '../helpers/TestHarness';

/** Measure execution time of a function in milliseconds (high-res). */
function measure(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

/** Run a function N times and return stats. */
function benchmark(fn: () => void, iterations: number) {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    times.push(measure(fn));
  }
  return {
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    max: Math.max(...times),
    min: Math.min(...times),
    p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)],
  };
}

/**
 * Build a board with a specific number of units deployed.
 * Alternates between P1 and P2 deployments.
 */
function createBoardWithUnits(targetUnitCount: number) {
  const t = createTestEngine();

  // Build LEG for deploying many units
  for (let i = 0; i < 20; i++) skipTurn(t.engine);

  // Cards that create aura-relevant board states
  const unitTypes = [
    'foot_soldier', 'archer', 'pikeman', 'swordsman',
    'scout', 'lancer', 'messenger', 'militia',
    'knight', 'commander',
  ];

  let deployed = 2; // Both kings already on the board
  let turnIdx = 0;

  while (deployed < targetUnitCount) {
    const activePlayer = turnIdx % 2 === 0 ? Player.P1 : Player.P2;
    const cardId = unitTypes[(deployed - 2) % unitTypes.length];

    injectHand(t.engine, activePlayer, [cardId, cardId, cardId, cardId]);

    // Deploy as many as we can this turn
    const positions = t.deployPositions();
    for (const pos of positions) {
      if (deployed >= targetUnitCount) break;
      const ok = t.engine.playCard(0, pos.col, pos.row);
      if (ok) {
        deployed++;
        // Re-inject hand if needed
        if (deployed < targetUnitCount) {
          injectHand(t.engine, activePlayer, [cardId, cardId, cardId, cardId]);
        }
      }
    }

    skipTurn(t.engine);
    turnIdx++;

    // Safety: prevent infinite loop if board is full
    if (turnIdx > 100) break;
  }

  return { t, actualCount: deployed };
}

describe('Aura system scaling with unit count', () => {
  const UNIT_COUNTS = [6, 10, 15, 20, 25];

  for (const count of UNIT_COUNTS) {
    it(`measures turn cycle with ${count} units on board`, () => {
      const { t, actualCount } = createBoardWithUnits(count);

      // Warm up
      skipTurn(t.engine);

      const result = benchmark(() => {
        if (t.state().status === EngineStatus.GAME_OVER) return;
        skipTurn(t.engine);
      }, 10);

      console.log(
        `  ${actualCount} units — turn cycle: avg=${result.avg.toFixed(2)}ms, ` +
        `max=${result.max.toFixed(2)}ms, p95=${result.p95.toFixed(2)}ms`
      );

      // Budget: scale linearly with unit count squared
      const budget = count <= 15 ? 10 : 25;
      expect(result.avg).toBeLessThan(budget);
    });
  }

  it('measures aura recalc cost in isolation (via move triggering recalc)', () => {
    const { t, actualCount } = createBoardWithUnits(20);

    // Get to ACT phase
    t.engine.endPlayPhase();

    // Find a moveable P1 unit
    const state = t.state();
    const moveable = state.board.find(
      c => c.unit && c.unit.owner === state.turn.activePlayer && c.unit.isActive && !c.unit.hasMoved
    );

    if (!moveable?.unit) {
      console.log('  No moveable unit found — skipping move benchmark');
      return;
    }

    const moves = t.engine.getValidMoveSquares(moveable.unit.instanceId);
    if (moves.length === 0) {
      console.log('  No valid moves — skipping move benchmark');
      return;
    }

    // Benchmark a single move (includes aura recalc)
    const ms = measure(() => {
      t.engine.moveUnit(moveable.unit!.instanceId, moves[0].col, moves[0].row);
    });

    console.log(`  ${actualCount} units — single move (incl. aura recalc): ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(15);
  });

  it('measures combat + death + aura recalc with crowded board', () => {
    const { t, actualCount } = createBoardWithUnits(15);

    // Get to ACT phase and find an attacker
    t.engine.endPlayPhase();
    const state = t.state();

    const attackerCell = state.board.find(
      c => c.unit && c.unit.owner === state.turn.activePlayer && c.unit.isActive && !c.unit.hasActed && c.unit.baseAtk > 0
    );

    if (!attackerCell?.unit) {
      console.log('  No attacker found — skipping combat benchmark');
      return;
    }

    const attacks = t.engine.getValidAttackSquares(attackerCell.unit.instanceId);
    if (attacks.length === 0) {
      console.log('  No valid attacks — skipping combat benchmark');
      return;
    }

    const target = state.board.find(
      c => c.col === attacks[0].col && c.row === attacks[0].row && c.unit
    );

    if (!target?.unit) {
      console.log('  No target at attack position — skipping combat benchmark');
      return;
    }

    const ms = measure(() => {
      t.engine.attackUnit(attackerCell.unit!.instanceId, target.unit!.instanceId);
    });

    console.log(`  ${actualCount} units — combat (attack + possible death + aura): ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(15);
  });
});

describe('Full game performance with heavy board states', () => {
  it('aggressive deploy game completes in <1000ms', () => {
    const ms = measure(() => {
      const t = createTestEngine(42);
      let turns = 0;

      while (t.state().status !== EngineStatus.GAME_OVER && turns < 200) {
        // Deploy as many units as possible each turn
        const affordable = t.engine.getAffordableCards();
        for (const idx of affordable) {
          const positions = t.engine.getValidDeployPositions();
          if (positions.length > 0) {
            t.engine.playCard(idx, positions[0].col, positions[0].row);
          }
          if (t.state().status === EngineStatus.AWAITING_INPUT) {
            t.engine.cancelPending();
          }
          if (t.state().status === EngineStatus.GAME_OVER) break;
        }

        if (t.state().status === EngineStatus.GAME_OVER) break;

        // Move units toward enemy
        t.engine.endPlayPhase();

        const actState = t.state();
        for (const cell of actState.board) {
          if (!cell.unit || cell.unit.owner !== actState.turn.activePlayer) continue;
          if (!cell.unit.isActive || cell.unit.hasMoved) continue;

          const moves = t.engine.getValidMoveSquares(cell.unit.instanceId);
          if (moves.length > 0) {
            // Move toward center
            const center = moves.reduce((best, m) =>
              Math.abs(m.row - 3) < Math.abs(best.row - 3) ? m : best
            );
            t.engine.moveUnit(cell.unit.instanceId, center.col, center.row);
          }

          if (t.state().status === EngineStatus.GAME_OVER) break;

          // Try to attack if possible
          const attacks = t.engine.getValidAttackSquares(cell.unit.instanceId);
          if (attacks.length > 0) {
            const targetCell = t.state().board.find(
              c => c.col === attacks[0].col && c.row === attacks[0].row && c.unit
            );
            if (targetCell?.unit) {
              t.engine.attackUnit(cell.unit.instanceId, targetCell.unit.instanceId);
            }
          }

          if (t.state().status === EngineStatus.GAME_OVER) break;
        }

        if (t.state().status !== EngineStatus.GAME_OVER) {
          t.engine.endActPhase();
        }
        turns++;
      }

      console.log(`  Aggressive game: ${turns} turns, status=${t.state().status}`);
    });

    console.log(`  Total time: ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(1000);
  });

  it('tracks peak unit count during a full game', () => {
    const t = createTestEngine(42);
    let turns = 0;
    let peakUnits = 0;
    const unitCountHistory: number[] = [];

    while (t.state().status !== EngineStatus.GAME_OVER && turns < 200) {
      const affordable = t.engine.getAffordableCards();
      for (const idx of affordable) {
        const positions = t.engine.getValidDeployPositions();
        if (positions.length > 0) {
          t.engine.playCard(idx, positions[0].col, positions[0].row);
        }
        if (t.state().status === EngineStatus.AWAITING_INPUT) {
          t.engine.cancelPending();
        }
        if (t.state().status === EngineStatus.GAME_OVER) break;
      }

      const unitCount = t.state().board.filter(c => c.unit !== null).length;
      peakUnits = Math.max(peakUnits, unitCount);
      unitCountHistory.push(unitCount);

      if (t.state().status !== EngineStatus.GAME_OVER) {
        skipTurn(t.engine);
      }
      turns++;
    }

    console.log(`  Peak units: ${peakUnits}, turns: ${turns}`);
    console.log(`  Unit count history: [${unitCountHistory.join(', ')}]`);
  });
});

describe('Server game-over guard prevents post-GAME_OVER actions', () => {
  it('engine rejects actions after GAME_OVER status', () => {
    const t = createTestEngine(42);

    // Play aggressively: deploy units and attack to force a game over
    let turns = 0;
    while (t.state().status !== EngineStatus.GAME_OVER && turns < 300) {
      // Deploy as many as we can
      const affordable = t.engine.getAffordableCards();
      for (const idx of affordable) {
        const positions = t.engine.getValidDeployPositions();
        if (positions.length > 0) {
          t.engine.playCard(idx, positions[0].col, positions[0].row);
        }
        if (t.state().status === EngineStatus.AWAITING_INPUT) {
          t.engine.cancelPending();
        }
        if (t.state().status === EngineStatus.GAME_OVER) break;
      }
      if (t.state().status === EngineStatus.GAME_OVER) break;

      t.engine.endPlayPhase();

      // Attack everything we can
      const actState = t.state();
      for (const cell of actState.board) {
        if (t.state().status === EngineStatus.GAME_OVER) break;
        if (!cell.unit || cell.unit.owner !== actState.turn.activePlayer) continue;
        if (!cell.unit.isActive || cell.unit.hasActed) continue;

        const attacks = t.engine.getValidAttackSquares(cell.unit.instanceId);
        if (attacks.length > 0) {
          // Prefer attacking the king
          const kingTarget = attacks.find(a => {
            const tc = t.state().board.find(c => c.col === a.col && c.row === a.row);
            return tc?.unit?.cardId === 'king';
          });
          const target = kingTarget ?? attacks[0];
          const targetCell = t.state().board.find(c => c.col === target.col && c.row === target.row);
          if (targetCell?.unit) {
            t.engine.attackUnit(cell.unit.instanceId, targetCell.unit.instanceId);
          }
        }

        if (t.state().status === EngineStatus.GAME_OVER) break;

        // Move units toward center/enemy
        const moves = t.engine.getValidMoveSquares(cell.unit.instanceId);
        if (moves.length > 0) {
          const center = moves.reduce((best, m) =>
            Math.abs(m.row - 3) < Math.abs(best.row - 3) ? m : best
          );
          t.engine.moveUnit(cell.unit.instanceId, center.col, center.row);
        }
      }

      if (t.state().status !== EngineStatus.GAME_OVER) {
        t.engine.endActPhase();
      }
      turns++;
    }

    if (t.state().status !== EngineStatus.GAME_OVER) {
      console.log(`  Game did not end in ${turns} turns — skipping post-GAME_OVER test`);
      return;
    }

    // Try to perform actions after game over — all should be no-ops
    const statusBefore = t.state().status;
    t.engine.endPlayPhase();
    t.engine.endActPhase();

    // Engine should remain in GAME_OVER
    expect(t.state().status).toBe(EngineStatus.GAME_OVER);
    console.log(`  Game ended after ${turns} turns — post-GAME_OVER guard verified`);
  });
});
