/**
 * Losing OUR connection (all reconnect attempts failed) must not be scored as a win.
 * Previously onReconnectFailed → handleFinalDisconnect → "Opponent disconnected, you win"
 * + GameState.recordWin(), e.g. whenever the server restarted for longer than the retries.
 */
import { describe, it, expect } from 'vitest';
import SocketManager from '../../../src/network/SocketManager';
import GameState from '../../../src/GameState';
import { setupSocketCallbacks } from '../../../src/scenes/battle/NetworkCoordinator';

function fakeScene() {
  const texts: string[] = [];
  const obj = () => ({ setOrigin() { return this; }, setDepth() { return this; }, setInteractive() { return this; }, on() { return this; }, destroy() {} });
  return {
    texts,
    add: {
      rectangle: () => obj(),
      text: (_x: number, _y: number, t: string) => { texts.push(t); return obj(); },
    },
    time: { delayedCall: () => {} },
    cameras: { main: { fadeOut() {}, once() {} } },
    scene: { start() {}, restart() {} },
    sys: { settings: { data: {} } },
  } as any;
}

describe('Own connection lost', () => {
  it('does not record a win or claim the opponent left', () => {
    const scene = fakeScene();
    const before = GameState.winCount;
    setupSocketCallbacks({ engine: { getState: () => ({ turn: { turnNumber: 3 } }) } as any, scene, playerName: 'A', opponentName: 'B', localPlayerIndex: 0 });
    (SocketManager as any).callbacks.onReconnectFailed();
    expect(GameState.winCount).toBe(before);
    expect(scene.texts.join(' ')).not.toMatch(/you win/i);
    expect(scene.texts.join(' ')).toMatch(/connection/i);
  });
});

describe('Lobby-flow socket (connectOnly) reconnect during a battle', () => {
  it('re-emits rejoin_room and signals connection lost/restored', () => {
    const sm = SocketManager as any;
    const sent: any[] = []; const handlers: Record<string, Function[]> = {};
    sm.socket = {
      connected: true,
      emit: (ev: string, data: any) => sent.push({ ev, data }),
      on: (ev: string, fn: Function) => { (handlers[ev] ??= []).push(fn); },
      once: (ev: string, fn: Function) => { (handlers[ev] ??= []).push(fn); },
      off: () => {}, io: { on: () => {} },
    };
    sm.eventsRegistered = false; sm.lobbyReconnectHook = false;
    const lost: string[] = [];
    SocketManager.connectOnly({ onConnectionLost: () => lost.push('lost'), onReconnected: () => lost.push('back') });
    GameState.roomCode = 'R9';
    SocketManager.setHashSource(() => 'h'); // a battle is running

    handlers['disconnect']?.forEach(f => f());
    handlers['connect']?.forEach(f => f());

    expect(sent.some(s => s.ev === 'rejoin_room' && s.data.roomCode === 'R9')).toBe(true);
    expect(lost).toEqual(['lost', 'back']);

    SocketManager.setHashSource(null);
    sm.socket = null; sm.eventsRegistered = false; sm.lobbyReconnectHook = false; sm.callbacks = null;
  });
});

describe('Server-decided result (match_settled)', () => {
  it('shows the forfeit once and records a loss for the timed-out player', () => {
    const scene = fakeScene();
    const losses = GameState.lossCount;
    setupSocketCallbacks({ engine: { getState: () => ({ status: 'IDLE', turn: { turnNumber: 4 } }) } as any, scene, playerName: 'A', opponentName: 'B', localPlayerIndex: 0 });
    const cb = (SocketManager as any).callbacks;
    cb.onMatchSettled({ winnerIndex: 1, reason: 'TIMEOUT', turns: 4 });
    cb.onMatchSettled({ winnerIndex: 1, reason: 'TIMEOUT', turns: 4 });
    cb.onOpponentAbandon?.();
    expect(GameState.lossCount).toBe(losses + 1);
    expect(scene.texts.filter(t => /ran out of time/.test(t))).toHaveLength(1);
    expect(GameState.lastMatch?.reason).toBe('TIMEOUT');
  });

  it('is ignored when our own engine already ended the game', () => {
    const scene = fakeScene();
    const wins = GameState.winCount;
    setupSocketCallbacks({ engine: { getState: () => ({ status: 'GAME_OVER', turn: { turnNumber: 4 } }) } as any, scene, playerName: 'A', opponentName: 'B', localPlayerIndex: 0 });
    (SocketManager as any).callbacks.onMatchSettled({ winnerIndex: 0, reason: 'KING_DESTROYED', turns: 4 });
    expect(GameState.winCount).toBe(wins);
    expect(scene.texts).toHaveLength(0);
  });
});

describe('Callbacks do not outlive their BattleScene', () => {
  it('clearCallbacks() stops a finished battle from drawing on the (reused) scene', () => {
    const scene = fakeScene();
    setupSocketCallbacks({ engine: { getState: () => ({ status: 'GAME_OVER', turn: { turnNumber: 1 } }) } as any, scene, playerName: 'A', opponentName: 'B', localPlayerIndex: 0 });
    SocketManager.clearCallbacks();
    expect((SocketManager as any).callbacks).toBeNull();
  });
});
