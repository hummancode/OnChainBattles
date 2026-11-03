/**
 * Offline actions: SocketManager buffers game_actions while disconnected.
 * Previously the buffer was CLEARED on reconnect (actions silently lost).
 * Now rejoinSuccess flushes every buffered action the server hasn't seen.
 */
import { describe, it, expect } from 'vitest';
import SocketManager from '../../../src/network/SocketManager';

describe('SocketManager offline buffer', () => {
  it('flushes buffered actions newer than the server\'s lastSeqNum, skips the rest', () => {
    const sm = SocketManager as any;
    const sent: any[] = [];
    const handlers: Record<string, Function> = {};
    sm.socket = {
      connected: false,
      emit: (ev: string, data: any) => sent.push({ ev, data }),
      on: (ev: string, fn: Function) => { handlers[ev] = fn; },
      once: () => {}, off: () => {}, io: { on: () => {} },
    };
    sm.eventsRegistered = false;
    sm.seqCounter = 0;
    sm.actionBuffer = [];
    sm.registerEvents();

    SocketManager.sendGameAction({ type: 'END_PLAY_PHASE' }); // seq 1 — offline
    SocketManager.sendGameAction({ type: 'END_ACT_PHASE' });  // seq 2 — offline
    expect(sent).toHaveLength(0);

    // Reconnect: server says it already got seq 1 (it was in flight when the socket dropped)
    sm.socket.connected = true;
    handlers['rejoinSuccess']({
      roomCode: 'R', playerIndex: 0, gameSeed: 1, decks: null,
      actionLog: [], lastSeqNum: 1, battleStarted: true,
    });

    const actions = sent.filter(s => s.ev === 'game_action').map(s => s.data.action);
    expect(actions.map(a => [a.type, a.seqNum])).toEqual([['END_ACT_PHASE', 2]]);
    expect(sm.actionBuffer).toHaveLength(0);

    // Numbering continues — next action is seq 3, not 1
    SocketManager.sendGameAction({ type: 'END_PLAY_PHASE' });
    expect(sent.at(-1).data.action.seqNum).toBe(3);

    sm.socket = null; sm.eventsRegistered = false;
  });
});
