import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../../src/game/GameEngine';
import { Player, TurnPhase } from '../../../src/game/types/GameTypes';
import GameState from '../../../src/GameState';

// Register all handlers
import '../helpers/TestHarness';

/**
 * Replay consistency: two engines with identical setup must produce
 * identical state snapshots when fed the same action sequence.
 * This is the multiplayer desync safety net.
 */

const TEST_SEED = 42;

beforeEach(() => {
  GameState.gameSeed = TEST_SEED;
});

function createEngine(): GameEngine {
  const e = new GameEngine();
  e.startGame();
  return e;
}

function snapshotBoard(engine: GameEngine): string {
  const s = engine.getState();
  const board = s.board
    .filter(c => c.unit !== null)
    .map(c => ({
      col: c.col,
      row: c.row,
      id: c.unit!.instanceId,
      cardId: c.unit!.cardId,
      owner: c.unit!.owner,
      hp: c.unit!.currentDef,
      atk: c.unit!.currentAtk,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(board);
}

function snapshotFull(engine: GameEngine): string {
  const s = engine.getState();
  return JSON.stringify({
    turn: s.turn.turnNumber,
    activePlayer: s.turn.activePlayer,
    phase: s.turn.phase,
    status: s.status,
    p1Hand: [...s.players[0].hand].sort(),
    p2Hand: [...s.players[1].hand].sort(),
    p1Deck: s.players[0].deckCount,
    p2Deck: s.players[1].deckCount,
    board: snapshotBoard(engine),
  });
}

describe('Replay Consistency', () => {
  it('two fresh engines produce identical initial state', () => {
    const a = createEngine();
    const b = createEngine();

    // Both use same default deck (UNITS_ONLY_DECK_IDS)
    // Without seeded shuffle, hands may differ
    // But board (two kings) must match
    expect(snapshotBoard(a)).toBe(snapshotBoard(b));
  });

  it('skip-turn sequences produce identical state', () => {
    const a = createEngine();
    const b = createEngine();

    // Both skip 4 turns
    for (let i = 0; i < 4; i++) {
      a.endPlayPhase(); a.endActPhase();
      b.endPlayPhase(); b.endActPhase();
    }

    const sa = a.getState();
    const sb = b.getState();

    expect(sa.turn.turnNumber).toBe(sb.turn.turnNumber);
    expect(sa.turn.activePlayer).toBe(sb.turn.activePlayer);
    expect(sa.turn.phase).toBe(sb.turn.phase);
    // Board should still match (just kings, LEG gained)
    expect(snapshotBoard(a)).toBe(snapshotBoard(b));
  });

  it('playCard at same index+position produces identical board', () => {
    const a = createEngine();
    const b = createEngine();

    // Both engines have same default deck → same starting hands
    const posA = a.getValidDeployPositions();
    const posB = b.getValidDeployPositions();

    // Deploy positions should match
    expect(posA.length).toBe(posB.length);

    // Both play hand[0] at same position
    if (posA.length > 0) {
      const affordable = a.getAffordableCards();
      if (affordable.length > 0) {
        const idx = affordable[0];
        const p = posA[0];

        a.playCard(idx, p.col, p.row);
        b.playCard(idx, p.col, p.row);

        // Skip any pending if both engines hit it
        if (a.getState().status === 'AWAITING_INPUT') a.cancelPending();
        if (b.getState().status === 'AWAITING_INPUT') b.cancelPending();

        expect(snapshotBoard(a)).toBe(snapshotBoard(b));
      }
    }
  });

  it('identical multi-turn action sequence stays in sync', () => {
    const a = createEngine();
    const b = createEngine();

    // Turn 1: P1 skips
    a.endPlayPhase(); a.endActPhase();
    b.endPlayPhase(); b.endActPhase();

    // Turn 1: P2 skips
    a.endPlayPhase(); a.endActPhase();
    b.endPlayPhase(); b.endActPhase();

    // Turn 2: P1 plays affordable card if available
    const affA = a.getAffordableCards();
    const affB = b.getAffordableCards();
    expect(affA).toEqual(affB);

    if (affA.length > 0) {
      const posA = a.getValidDeployPositions();
      if (posA.length > 0) {
        a.playCard(affA[0], posA[0].col, posA[0].row);
        b.playCard(affB[0], posA[0].col, posA[0].row);

        if (a.getState().status === 'AWAITING_INPUT') a.cancelPending();
        if (b.getState().status === 'AWAITING_INPUT') b.cancelPending();
      }
    }

    a.endPlayPhase(); a.endActPhase();
    b.endPlayPhase(); b.endActPhase();

    expect(snapshotFull(a)).toBe(snapshotFull(b));
  });
});
