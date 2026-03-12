/**
 * gameLoop.test.ts — Full functional game loop smoke test.
 *
 * Plays a complete game from startGame() to GAME_OVER (king death).
 * Both players are driven by a simple AI that deploys, moves toward
 * the enemy king, and attacks when in range.
 *
 * Run after every major update:  npx vitest run tests/engine/gameLoop.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../src/game/GameEngine';
import { Player, TurnPhase, EngineStatus } from '../../src/game/types/GameTypes';
import type { GameEvent } from '../../src/game/types/EventTypes';
import type { GameStateSnapshot, Unit } from '../../src/game/types/GameTypes';
import GameState from '../../src/GameState';

// Register all ability handlers
import './helpers/TestHarness';

// ─── Helpers ───────────────────────────────────────────────

const TEST_SEED = 12345;
const MAX_TURNS = 200; // Safety cap — game should end well before this

interface SimpleUnit {
  instanceId: string;
  cardId: string;
  col: number;
  row: number;
  owner: number;
  currentAtk: number;
  currentDef: number;
}

function getUnits(state: GameStateSnapshot, player: Player): SimpleUnit[] {
  return state.board
    .filter(c => c.unit && c.unit.owner === player)
    .map(c => ({
      instanceId: c.unit!.instanceId,
      cardId: c.unit!.cardId,
      col: c.col,
      row: c.row,
      owner: c.unit!.owner,
      currentAtk: c.unit!.currentAtk,
      currentDef: c.unit!.currentDef,
    }));
}

function getEnemyKing(state: GameStateSnapshot, myPlayer: Player): SimpleUnit | null {
  const enemy = myPlayer === Player.P1 ? Player.P2 : Player.P1;
  const cell = state.board.find(c => c.unit?.cardId === 'king' && c.unit?.owner === enemy);
  if (!cell?.unit) return null;
  return {
    instanceId: cell.unit.instanceId,
    cardId: cell.unit.cardId,
    col: cell.col,
    row: cell.row,
    owner: cell.unit.owner,
    currentAtk: cell.unit.currentAtk,
    currentDef: cell.unit.currentDef,
  };
}

/**
 * Simple AI: plays the PLAY phase.
 * Deploys the first affordable card to the position closest to the enemy king.
 */
function aiPlayPhase(engine: GameEngine): void {
  const state = engine.getState();
  const active = state.turn.activePlayer;
  const enemyKing = getEnemyKing(state, active);
  const enemyRow = enemyKing ? enemyKing.row : (active === Player.P1 ? 6 : 0);

  // Deploy as many affordable cards as possible
  let safety = 20;
  while (safety-- > 0) {
    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }
    if (engine.getState().status === EngineStatus.GAME_OVER) return;

    const affordable = engine.getAffordableCards();
    if (affordable.length === 0) break;

    const positions = engine.getValidDeployPositions();
    if (positions.length === 0) break;

    // Pick deploy position closest to enemy
    const sorted = [...positions].sort((a, b) =>
      Math.abs(a.row - enemyRow) - Math.abs(b.row - enemyRow)
    );

    const ok = engine.playCard(affordable[0], sorted[0].col, sorted[0].row);
    if (!ok) break;

    // Handle any pending interaction from deploy abilities
    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }
  }
}

/**
 * Simple AI: plays the ACT phase.
 * For each unit: move toward enemy king, then attack if possible.
 */
function aiActPhase(engine: GameEngine): void {
  const state = engine.getState();
  const active = state.turn.activePlayer;
  const myUnits = getUnits(state, active);

  for (const unit of myUnits) {
    if (engine.getState().status === EngineStatus.GAME_OVER) return;
    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }

    // Re-read state since board may have changed
    const freshState = engine.getState();
    const enemyKing = getEnemyKing(freshState, active);
    if (!enemyKing) return; // enemy king dead — game should end

    // Try to move toward enemy king
    const moves = engine.getValidMoveSquares(unit.instanceId);
    if (moves.length > 0) {
      // Pick the move closest to enemy king
      const best = [...moves].sort((a, b) => {
        const distA = Math.abs(a.col - enemyKing.col) + Math.abs(a.row - enemyKing.row);
        const distB = Math.abs(b.col - enemyKing.col) + Math.abs(b.row - enemyKing.row);
        return distA - distB;
      })[0];
      engine.moveUnit(unit.instanceId, best.col, best.row);
    }

    // Try to attack
    const attacks = engine.getValidAttackSquares(unit.instanceId);
    if (attacks.length > 0) {
      // Prefer attacking the king
      const kingTarget = attacks.find(a => a.col === enemyKing.col && a.row === enemyKing.row);
      const target = kingTarget || attacks[0];

      const targetCell = freshState.board.find(c => c.col === target.col && c.row === target.row);
      if (targetCell?.unit) {
        engine.attackUnit(unit.instanceId, targetCell.unit.instanceId);
      }
    }

    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }
  }
}

/**
 * Handle any pending interaction by auto-selecting the first valid option,
 * or cancelling if no option is suitable.
 */
function handlePending(engine: GameEngine): void {
  // We can't read the pending from getState(), so try resolvers in order.
  // The engine silently ignores wrong-kind calls, so this is safe.
  const state = engine.getState();
  if (state.status !== EngineStatus.AWAITING_INPUT) return;

  // Try selectTarget: pick first friendly unit on board for heals, etc.
  const active = state.turn.activePlayer;
  const friendlies = getUnits(state, active);
  for (const u of friendlies) {
    engine.selectTarget(u.instanceId);
    if (engine.getState().status !== EngineStatus.AWAITING_INPUT) return;
  }

  // Try selectPosition: pick first valid deploy position
  const positions = engine.getValidDeployPositions();
  for (const p of positions) {
    engine.selectPosition(p.col, p.row);
    if (engine.getState().status !== EngineStatus.AWAITING_INPUT) return;
  }

  // Try selectColumn: try each column
  for (let col = 0; col < 7; col++) {
    engine.selectColumn(col);
    if (engine.getState().status !== EngineStatus.AWAITING_INPUT) return;
  }

  // Try selectDiscard: discard first card
  engine.selectDiscard(0);
  if (engine.getState().status !== EngineStatus.AWAITING_INPUT) {
    return;
  }

  // Last resort: cancel
  engine.cancelPending();
}

/**
 * Run a full game loop. Returns collected events and final state.
 */
function playFullGame(seed: number = TEST_SEED): {
  events: GameEvent[];
  state: GameStateSnapshot;
  turns: number;
} {
  GameState.gameSeed = seed;
  const engine = new GameEngine();
  const events: GameEvent[] = [];
  engine.on(ev => events.push(ev));
  engine.startGame();

  let turns = 0;

  while (turns < MAX_TURNS) {
    const state = engine.getState();
    if (state.status === EngineStatus.GAME_OVER) break;

    // PLAY phase
    if (state.turn.phase === TurnPhase.PLAY) {
      aiPlayPhase(engine);
      if (engine.getState().status === EngineStatus.GAME_OVER) break;
      engine.endPlayPhase();
    }

    // ACT phase
    if (engine.getState().turn.phase === TurnPhase.ACT) {
      aiActPhase(engine);
      if (engine.getState().status === EngineStatus.GAME_OVER) break;
      engine.endActPhase();
    }

    turns++;
  }

  return { events, state: engine.getState(), turns };
}

// ─── Tests ─────────────────────────────────────────────────

describe('Game Loop — full match to completion', () => {
  it('plays a full game to GAME_OVER', () => {
    const { events, state, turns } = playFullGame();

    expect(state.status).toBe(EngineStatus.GAME_OVER);
    expect(turns).toBeLessThan(MAX_TURNS);

    // Should have a GAME_OVER event
    const gameOverEvents = events.filter(e => e.type === 'GAME_OVER');
    expect(gameOverEvents.length).toBe(1);

    const result = (gameOverEvents[0] as any).result;
    expect(result.reason).toBe('KING_DESTROYED');
    expect([Player.P1, Player.P2]).toContain(result.winner);
    expect([Player.P1, Player.P2]).toContain(result.loser);
    expect(result.winner).not.toBe(result.loser);

    console.log(`Game ended in ${turns} half-turns. Winner: P${result.winner + 1}, Reason: ${result.reason}`);
  });

  it('both players deploy units during the game', () => {
    const { events } = playFullGame();

    const p1Deploys = events.filter(
      e => e.type === 'UNIT_PLACED' && (e as any).owner === Player.P1
    );
    const p2Deploys = events.filter(
      e => e.type === 'UNIT_PLACED' && (e as any).owner === Player.P2
    );

    // Kings count as UNIT_PLACED, but we should see more than just kings
    expect(p1Deploys.length).toBeGreaterThan(1);
    expect(p2Deploys.length).toBeGreaterThan(1);
  });

  it('combat occurs during the game', () => {
    const { events } = playFullGame();

    const attacks = events.filter(e => e.type === 'UNIT_ATTACKED');
    expect(attacks.length).toBeGreaterThan(0);
  });

  it('units die during the game', () => {
    const { events } = playFullGame();

    const deaths = events.filter(e => e.type === 'UNIT_DIED');
    // At minimum one king dies (game over condition)
    expect(deaths.length).toBeGreaterThanOrEqual(1);
  });

  it('LEG accumulates over turns', () => {
    const { events } = playFullGame();

    const legEvents = events.filter(e => e.type === 'LEG_GAINED');
    expect(legEvents.length).toBeGreaterThan(0);
  });

  it('cards are drawn each turn', () => {
    const { events } = playFullGame();

    const draws = events.filter(e => e.type === 'CARD_DRAWN');
    expect(draws.length).toBeGreaterThan(2); // More than just opening hands
  });

  it('no engine crash with different seeds', () => {
    // Run 5 games with different seeds — none should throw or stall
    const seeds = [1, 99, 7777, 42424, 100001];
    for (const seed of seeds) {
      const { state, turns } = playFullGame(seed);
      expect(state.status).toBe(EngineStatus.GAME_OVER);
      expect(turns).toBeLessThan(MAX_TURNS);
    }
  });
});

describe('Game Loop — invariants hold throughout', () => {
  it('turn number always increases', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.on(() => {});
    engine.startGame();

    let lastTurn = 0;
    let steps = 0;

    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      expect(state.turn.turnNumber).toBeGreaterThanOrEqual(lastTurn);
      lastTurn = state.turn.turnNumber;

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }

    expect(engine.getState().status).toBe(EngineStatus.GAME_OVER);
  });

  it('active player alternates each full turn', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.startGame();

    const playerSequence: Player[] = [];
    let steps = 0;

    while (steps < MAX_TURNS * 2) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      if (state.turn.phase === TurnPhase.PLAY) {
        playerSequence.push(state.turn.activePlayer);
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        engine.endActPhase();
      }
      steps++;
    }

    // Players should alternate: P1, P2, P1, P2, ...
    for (let i = 1; i < playerSequence.length; i++) {
      expect(playerSequence[i]).not.toBe(playerSequence[i - 1]);
    }
  });

  it('board never has two units in the same cell', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    const events: GameEvent[] = [];
    engine.on(ev => events.push(ev));
    engine.startGame();

    let steps = 0;
    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      // Check board invariant: no duplicate positions
      const occupied = state.board.filter(c => c.unit !== null);
      const positions = occupied.map(c => `${c.col},${c.row}`);
      const unique = new Set(positions);
      expect(unique.size).toBe(positions.length);

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }
  });

  it('unit HP never exceeds maxDef', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.on(() => {}); // keep event pipeline active
    engine.startGame();

    let steps = 0;
    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      // Check all units' HP ≤ maxDef
      for (const cell of state.board) {
        if (cell.unit) {
          expect(cell.unit.currentDef).toBeLessThanOrEqual(cell.unit.maxDef);
        }
      }

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }
  });

  it('dead units are removed from board', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.startGame();

    let steps = 0;
    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      // No unit on board should have 0 or negative HP
      for (const cell of state.board) {
        if (cell.unit) {
          expect(cell.unit.currentDef).toBeGreaterThan(0);
        }
      }

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }
  });
});

describe('Game Loop — replay determinism', () => {
  it('two games with same seed produce identical event sequences', () => {
    const run1 = playFullGame(777);
    const run2 = playFullGame(777);

    // Same number of events
    expect(run1.events.length).toBe(run2.events.length);

    // Same event types in same order
    const types1 = run1.events.map(e => e.type);
    const types2 = run2.events.map(e => e.type);
    expect(types1).toEqual(types2);

    // Same final state
    expect(run1.state.status).toBe(run2.state.status);
    expect(run1.turns).toBe(run2.turns);
  });

  it('different seeds produce different games', () => {
    const run1 = playFullGame(111);
    const run2 = playFullGame(222);

    // Both complete, but likely different turn counts or event sequences
    expect(run1.state.status).toBe(EngineStatus.GAME_OVER);
    expect(run2.state.status).toBe(EngineStatus.GAME_OVER);

    // Very unlikely to be identical with different seeds
    const differentTurns = run1.turns !== run2.turns;
    const differentEvents = run1.events.length !== run2.events.length;
    expect(differentTurns || differentEvents).toBe(true);
  });
});
