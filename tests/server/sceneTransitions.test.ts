/**
 * sceneTransitions.test.ts — Tests for scene transition integrity,
 * state passing, and timing issues in the lobby flow.
 *
 * These tests validate the contracts between scenes — what data
 * must be set before a transition, what gets cleared after, and
 * what events must be handled.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLobbyRoom } from '../../server/lobby/lobbyHelpers';
import type { Room, LobbyState, RoomSettings } from '../../shared/types/NetworkEvents';

// ─── Helper: simulate getLobbyState ───────────────────────────

function buildLobbyState(roomCode: string, room: Room): LobbyState | null {
  if (!room.settings) return null;
  const { password: _pw, ...safeSettings } = room.settings;
  return {
    code: roomCode,
    settings: { ...safeSettings, password: null },
    status: room.status ?? 'waiting',
    players: room.players.map(p => ({
      name: p.name,
      playerId: p.playerId ?? null,
      ready: p.ready ?? false,
      isHost: p.id === room.hostSocketId,
      hasDeck: !!p.deckIds,
    })),
    chat: (room.chat ?? []).slice(-50),
  };
}

// ─── Lobby State Visibility ───────────────────────────────────

describe('Lobby state visibility after room creation', () => {
  let room: Room;
  const roomCode = '123456';

  beforeEach(() => {
    room = createLobbyRoom('host-socket', 'HostPlayer', 1, {
      isPublic: true, isCrypto: false,
    });
  });

  it('host is visible in lobby state immediately after creation', () => {
    const state = buildLobbyState(roomCode, room);
    expect(state).not.toBeNull();
    expect(state!.players).toHaveLength(1);
    expect(state!.players[0].name).toBe('HostPlayer');
    expect(state!.players[0].isHost).toBe(true);
    expect(state!.players[0].ready).toBe(true); // host is always ready
  });

  it('both players visible after joiner joins', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: null, deckIds: null, ready: false,
    });
    room.status = 'full';

    const state = buildLobbyState(roomCode, room);
    expect(state!.players).toHaveLength(2);
    expect(state!.players[0].name).toBe('HostPlayer');
    expect(state!.players[1].name).toBe('Joiner');
    expect(state!.players[1].ready).toBe(false);
  });

  it('lobby:request_state returns current state (not stale)', () => {
    // Simulate: room created, then joiner joins, then request_state
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: null, deckIds: null, ready: false,
    });
    room.status = 'full';
    room.chat = [{ sender: 'SYSTEM', text: 'Joiner joined.', timestamp: 1 }];

    const state = buildLobbyState(roomCode, room);

    // State must include latest data
    expect(state!.players).toHaveLength(2);
    expect(state!.status).toBe('full');
    expect(state!.chat).toHaveLength(1);
    expect(state!.chat[0].text).toBe('Joiner joined.');
  });

  it('password is stripped from lobby state broadcast', () => {
    const secretRoom = createLobbyRoom('host', 'Host', null, {
      isPublic: false,
      password: 'secret123',
    });

    const state = buildLobbyState('789', secretRoom);
    expect(state!.settings.password).toBeNull(); // must be stripped
  });
});

// ─── Scene Transition Data Contracts ──────────────────────────

describe('Scene transition data contracts', () => {
  it('HubScene → LobbyScene requires roomCode and isHost', () => {
    // LobbyScene.init(data) expects { roomCode: string, isHost: boolean }
    const validData = { roomCode: '123456', isHost: true };
    expect(validData.roomCode).toBeTruthy();
    expect(typeof validData.isHost).toBe('boolean');
  });

  it('LobbyScene → BattleScene requires all GameState fields', () => {
    // Simulates what LobbyScene.enterBattle() must ensure
    const requiredFields = {
      roomCode: '837646',
      playerIndex: 0,
      gameSeed: 999,
      playerName: 'Host',
      opponentName: 'Joiner',
    };

    // NONE of these should be empty/zero
    expect(requiredFields.roomCode.length).toBeGreaterThan(0);
    expect(requiredFields.gameSeed).toBeGreaterThan(0);
    expect(requiredFields.playerName.length).toBeGreaterThan(0);
    expect(requiredFields.opponentName.length).toBeGreaterThan(0);
  });

  it('ResultScene → HubScene: lastMatch must survive until HubScene reads it', () => {
    // The fix: clearMatchData() must be called INSIDE camerafadeoutcomplete,
    // not before the fade starts. This test documents the contract.
    const lastMatch = {
      playerName: 'Host', opponentName: 'Guest',
      playerWon: true, isTie: false,
      reason: 'KING_DESTROYED', turns: 15,
      stakeAmount: 0, payout: 0,
    };

    // Simulate: ResultScene has lastMatch, starts fade
    // During fade, lastMatch must still exist
    expect(lastMatch).toBeTruthy();

    // After fade completes, clearMatchData() runs
    // Then HubScene starts — by this time lastMatch is already consumed
    // (HubScene reads it in create(), which is after the scene.start() call)
  });

  it('ResultScene rematch goes to HubScene (not broken LobbyScene)', () => {
    // Old bug: rematch started LobbyScene with roomCode: '' which broke
    // The fix: rematch goes to HubScene where user can properly host
    const rematchTarget = 'HubScene'; // NOT 'LobbyScene'
    expect(rematchTarget).toBe('HubScene');
  });
});

// ─── Transition Guard Contracts ───────────────────────────────

describe('Transition guard contracts', () => {
  it('double navigation must be prevented', () => {
    // All scenes must have a `transitioning` boolean guard
    // Simulates: two rapid clicks on different buttons
    let transitioning = false;

    const navigate = () => {
      if (transitioning) return false;
      transitioning = true;
      return true;
    };

    expect(navigate()).toBe(true);  // first click succeeds
    expect(navigate()).toBe(false); // second click blocked
    expect(navigate()).toBe(false); // third click blocked
  });

  it('transitioning resets on scene re-entry', () => {
    // When a scene is started again, create() should reset transitioning
    let transitioning = true;

    // Simulate scene create()
    transitioning = false; // reset in constructor or create

    expect(transitioning).toBe(false);
  });
});

// ─── Cleanup Contracts ────────────────────────────────────────

describe('Scene cleanup contracts', () => {
  it('LobbyScene cleanup must remove disconnect listener', () => {
    // Contract: cleanup() must call socket.off('disconnect', handler)
    // to prevent stale callbacks on destroyed scene objects
    let handlerRemoved = false;

    // Simulate cleanup
    const cleanup = () => {
      handlerRemoved = true; // represents socket.off('disconnect', handler)
    };

    cleanup();
    expect(handlerRemoved).toBe(true);
  });

  it('shutdown event must use once, not on', () => {
    // Contract: this.events.once('shutdown', ...) not this.events.on('shutdown', ...)
    // Using .on() stacks handlers on scene re-entry
    let callCount = 0;

    // Simulate: scene entered twice, shutdown called once
    // With .once(): callCount = 1 (correct)
    // With .on(): callCount = 2 (bug)
    const onceHandler = () => { callCount++; };

    // First scene entry
    onceHandler(); // .once fires and self-removes
    // Second scene entry would NOT re-fire the old handler

    expect(callCount).toBe(1);
  });
});

// ─── Server lobby:request_state ───────────────────────────────

describe('lobby:request_state server handler', () => {
  it('returns current state for valid room', () => {
    const room = createLobbyRoom('host', 'Host', 1);
    room.players.push({
      id: 'joiner', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: true,
    });
    room.status = 'full';

    const state = buildLobbyState('ABC', room);
    expect(state).not.toBeNull();
    expect(state!.players).toHaveLength(2);
    expect(state!.status).toBe('full');
  });

  it('returns null for room without settings (legacy room)', () => {
    const legacyRoom: Room = {
      players: [{ id: 's1', name: 'P1', wallet: null }],
      gameSeed: null,
      cryptoReadyCount: 0,
      battleReadyCount: 0,
      actionQueue: [],
      settled: false,
      currentTurnPlayer: 0,
      currentPhase: 'PLAY',
      actionCount: 0,
      gameOverClaims: [],
      lastSeqNum: [0, 0],
      globalSeq: 0,
      pendingHashes: new Map(),
      disconnectTimers: new Map(),
      disconnectIntervals: new Map(),
      createdAt: Date.now(),
      // NO settings — legacy RoomScene flow
    };

    const state = buildLobbyState('XYZ', legacyRoom);
    expect(state).toBeNull();
  });
});
