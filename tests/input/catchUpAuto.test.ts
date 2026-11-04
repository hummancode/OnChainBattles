/** Turn-timeout actions are stamped with the timed-out player's index (by = us) but we never
 *  applied them locally — catching up after a socket drop must include them. */
import { describe, it, expect } from 'vitest';
import { catchUpFromLog, resetNetworkSyncState } from '../../src/scenes/battle/NetworkCoordinator';
import { createTestEngine } from '../engine/helpers/TestHarness';

describe('catchUpFromLog', () => {
  it('applies server auto actions for the local player', () => {
    const { engine } = createTestEngine();
    resetNetworkSyncState(0);
    const deps = { engine, scene: {} as any, playerName: 'A', opponentName: 'B', localPlayerIndex: 0 };
    const n = catchUpFromLog(deps, [
      { type: 'END_PLAY_PHASE', by: 0, serverSeq: 1, auto: true },
      { type: 'END_ACT_PHASE', by: 0, serverSeq: 2, auto: true },
    ]);
    expect(n).toBe(2);
    expect(engine.getState().turn.activePlayer).toBe(1);
  });

  it('still skips our own (already applied) actions', () => {
    const { engine } = createTestEngine();
    resetNetworkSyncState(0);
    const deps = { engine, scene: {} as any, playerName: 'A', opponentName: 'B', localPlayerIndex: 0 };
    expect(catchUpFromLog(deps, [{ type: 'END_PLAY_PHASE', by: 0, serverSeq: 1 }])).toBe(0);
  });
});
