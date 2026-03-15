/**
 * lobby.test.ts — Tests for lobby room lifecycle,
 * RoomManager lobby extensions, and lobbyHelpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLobbyRoom } from '../../server/lobby/lobbyHelpers';
import type { Room, RoomSettings } from '../../shared/types/NetworkEvents';

// ─── lobbyHelpers ─────────────────────────────────────────────

describe('createLobbyRoom', () => {
  it('creates a room with all required Room fields', () => {
    const room = createLobbyRoom('socket-1', 'TestHost', 42);

    // Core fields
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe('TestHost');
    expect(room.players[0].id).toBe('socket-1');
    expect(room.players[0].playerId).toBe(42);
    expect(room.players[0].ready).toBe(true); // host is always ready
    expect(room.gameSeed).toBeNull();
    expect(room.cryptoReadyCount).toBe(0);
    expect(room.settled).toBe(false);

    // Required fields that SessionManager depends on
    expect(room.battleReadyCount).toBe(0);
    expect(room.actionQueue).toEqual([]);
    expect(room.currentTurnPlayer).toBe(0);
    expect(room.currentPhase).toBe('PLAY');
    expect(room.actionCount).toBe(0);
    expect(room.gameOverClaims).toEqual([]);
    expect(room.lastSeqNum).toEqual([0, 0]);
    expect(room.globalSeq).toBe(0);
    expect(room.pendingHashes).toBeInstanceOf(Map);
    expect(room.disconnectTimers).toBeInstanceOf(Map);
    expect(room.disconnectIntervals).toBeInstanceOf(Map);
    expect(room.createdAt).toBeGreaterThan(0);

    // Lobby extensions
    expect(room.hostSocketId).toBe('socket-1');
    expect(room.hostPlayerId).toBe(42);
    expect(room.status).toBe('waiting');
    expect(room.settings).toBeDefined();
    expect(room.chat).toEqual([]);
  });

  it('applies default settings when none provided', () => {
    const room = createLobbyRoom('s1', 'Host', null);

    expect(room.settings!.isPublic).toBe(true);
    expect(room.settings!.isCrypto).toBe(false);
    expect(room.settings!.maxPlayers).toBe(2);
    expect(room.settings!.stakeAmount).toBe(0);
    expect(room.settings!.password).toBeNull();
    expect(room.settings!.roomName).toBe("Host's Room");
  });

  it('merges custom settings with defaults', () => {
    const room = createLobbyRoom('s1', 'Host', null, {
      isPublic: false,
      isCrypto: true,
      stakeAmount: 0.01,
      roomName: 'Custom Room',
    });

    expect(room.settings!.isPublic).toBe(false);
    expect(room.settings!.isCrypto).toBe(true);
    expect(room.settings!.stakeAmount).toBe(0.01);
    expect(room.settings!.roomName).toBe('Custom Room');
    expect(room.settings!.maxPlayers).toBe(2); // default preserved
  });

  it('truncates room name to 40 chars', () => {
    const longName = 'A'.repeat(60);
    const room = createLobbyRoom('s1', 'Host', null, { roomName: longName });
    expect(room.settings!.roomName).toHaveLength(40);
  });

  it('handles null playerId for guest host', () => {
    const room = createLobbyRoom('s1', 'Guest', null);
    expect(room.players[0].playerId).toBeNull();
    expect(room.hostPlayerId).toBeNull();
  });
});

// ─── Lobby Room Lifecycle (simulated) ─────────────────────────

describe('Lobby room lifecycle', () => {
  let room: Room;

  beforeEach(() => {
    room = createLobbyRoom('host-socket', 'HostPlayer', 1);
  });

  it('joiner can be added to room', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: false,
    });
    expect(room.players).toHaveLength(2);
    expect(room.players[1].ready).toBe(false);
  });

  it('status transitions: waiting → full → starting → in_progress', () => {
    expect(room.status).toBe('waiting');

    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: false,
    });
    room.status = 'full';
    expect(room.status).toBe('full');

    room.status = 'starting';
    expect(room.status).toBe('starting');

    room.status = 'in_progress';
    expect(room.status).toBe('in_progress');
  });

  it('crypto flow: waiting → depositing → in_progress', () => {
    room.settings!.isCrypto = true;
    room.status = 'depositing';
    room.cryptoReadyCount = 0;

    room.cryptoReadyCount = 1;
    expect(room.cryptoReadyCount).toBe(1);

    room.cryptoReadyCount = 2;
    room.status = 'in_progress';
    expect(room.status).toBe('in_progress');
  });

  it('host transfer on disconnect', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: true,
    });

    // Simulate host leaving
    room.players.splice(0, 1);
    room.hostSocketId = room.players[0].id;
    room.hostPlayerId = room.players[0].playerId ?? null;

    expect(room.hostSocketId).toBe('joiner-socket');
    expect(room.hostPlayerId).toBe(2);
    expect(room.players).toHaveLength(1);
  });

  it('chat message accumulation', () => {
    room.chat = room.chat ?? [];
    room.chat.push({ sender: 'HostPlayer', text: 'Hello!', timestamp: Date.now() });
    room.chat.push({ sender: 'HostPlayer', text: 'Ready?', timestamp: Date.now() });

    expect(room.chat).toHaveLength(2);
    expect(room.chat[0].text).toBe('Hello!');
  });

  it('deck submission tracking', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: true,
    });

    room.players[0].deckIds = ['foot_soldier', 'archer'];
    expect(room.players.every(p => !!p.deckIds)).toBe(false);

    room.players[1].deckIds = ['pikeman', 'scout'];
    expect(room.players.every(p => !!p.deckIds)).toBe(true);
  });
});

// ─── matchService (unit test) ─────────────────────────────────

describe('matchService recordMatch', () => {
  it('skips recording when both players are guests', async () => {
    // Import dynamically to avoid DB init at module level in test
    const { recordMatch } = await import('../../server/api/matchService');

    const guestRoom: Room = createLobbyRoom('s1', 'Guest1', null);
    guestRoom.players.push({
      id: 's2', name: 'Guest2', wallet: null,
      playerId: null, deckIds: null, ready: true,
    });

    // This should NOT throw — it silently skips when both are guests
    expect(() => {
      recordMatch({
        roomCode: 'TEST',
        room: guestRoom,
        winnerIndex: 0,
        totalTurns: 10,
      });
    }).not.toThrow();
  });
});
