/**
 * Live socket reconnect (no page refresh): the local engine is intact but may have
 * missed opponent actions. catchUpFromLog() must apply exactly those — once, in order —
 * and never re-apply our own actions or ones already delivered live.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../../src/game/GameEngine';
import GameState from '../../../src/GameState';
import { catchUpFromLog, replayOpponentAction, resetNetworkSyncState } from '../../../src/scenes/battle/NetworkCoordinator';
import type { GameAction } from '../../../shared/types/NetworkEvents';
import '../helpers/TestHarness';

function engine(): GameEngine {
  GameState.gameSeed = 99;
  const e = new GameEngine();
  e.startGame();
  return e;
}

describe('Reconnect catch-up', () => {
  beforeEach(() => resetNetworkSyncState(0));

  it('applies only missed opponent actions, skipping own + already-delivered ones', () => {
    // Local player is P2 (index 1). P1 (opponent) moves first.
    const local = engine();
    const deps: any = { engine: local, localPlayerIndex: 1 };

    const log: GameAction[] = [
      { type: 'END_PLAY_PHASE', by: 0, serverSeq: 1 },
      { type: 'END_ACT_PHASE',  by: 0, serverSeq: 2 },  // → P2's turn
      { type: 'END_PLAY_PHASE', by: 1, serverSeq: 3 },  // our own
      { type: 'END_ACT_PHASE',  by: 1, serverSeq: 4 },  // our own → P1's turn
      { type: 'END_PLAY_PHASE', by: 0, serverSeq: 5 },  // missed while offline
      { type: 'END_ACT_PHASE',  by: 0, serverSeq: 6 },  // missed while offline
    ];

    // Delivered live before the drop
    replayOpponentAction(deps, log[0]);
    replayOpponentAction(deps, log[1]);
    // Our own actions (applied locally when we clicked)
    local.endPlayPhase(); local.endActPhase();

    expect(catchUpFromLog(deps, log)).toBe(2);
    expect(local.getState().turn.activePlayer).toBe(1); // back to us
    expect(local.getState().turn.phase).toBe('PLAY');

    // A second catch-up (e.g. flapping connection) is a no-op
    expect(catchUpFromLog(deps, log)).toBe(0);
  });

  it('ignores a duplicate live delivery of the same serverSeq', () => {
    const local = engine();
    const deps: any = { engine: local, localPlayerIndex: 1 };
    const a: GameAction = { type: 'END_PLAY_PHASE', by: 0, serverSeq: 1 };
    replayOpponentAction(deps, a);
    replayOpponentAction(deps, a);
    expect(local.getState().turn.phase).toBe('ACT'); // not advanced twice
  });
});
