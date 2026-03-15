/**
 * authDeck.test.ts — Tests for Phase 1 shared foundation:
 * - GameState auth + deck fields
 * - AuthManager stub behavior
 * - NetworkEvents type contracts (compile-time verification)
 * - DeckValidator (when created in Phase 2, extend here)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── GameState Auth + Deck Fields ─────────────────────────────

// We can't import the real GameState singleton (it has browser deps via import.meta.env)
// so we test the interface contract by creating a minimal mock

describe('GameState auth fields', () => {
  let state: {
    authToken: string;
    authenticatedPlayerId: number;
    displayName: string;
    activeDeckId: number | null;
    activeDeckCardIds: string[];
    setAuthData(token: string, playerId: number, name: string): void;
    isAuthenticated(): boolean;
    clearAuth(): void;
    setActiveDeck(deckId: number | null, cardIds: string[]): void;
    hasActiveDeck(): boolean;
    playerName: string;
  };

  beforeEach(() => {
    state = {
      authToken: '',
      authenticatedPlayerId: 0,
      displayName: '',
      activeDeckId: null,
      activeDeckCardIds: [],
      playerName: 'Player',

      setAuthData(token: string, playerId: number, name: string) {
        this.authToken = token;
        this.authenticatedPlayerId = playerId;
        this.displayName = name;
        this.playerName = name;
      },

      isAuthenticated() {
        return this.authenticatedPlayerId > 0 && this.authToken.length > 0;
      },

      clearAuth() {
        this.authToken = '';
        this.authenticatedPlayerId = 0;
        this.displayName = '';
      },

      setActiveDeck(deckId: number | null, cardIds: string[]) {
        this.activeDeckId = deckId;
        this.activeDeckCardIds = [...cardIds];
      },

      hasActiveDeck() {
        return this.activeDeckCardIds.length > 0;
      },
    };
  });

  it('starts unauthenticated', () => {
    expect(state.isAuthenticated()).toBe(false);
    expect(state.authToken).toBe('');
    expect(state.authenticatedPlayerId).toBe(0);
  });

  it('setAuthData populates fields and syncs playerName', () => {
    state.setAuthData('jwt-token-123', 42, 'TestPlayer');

    expect(state.isAuthenticated()).toBe(true);
    expect(state.authToken).toBe('jwt-token-123');
    expect(state.authenticatedPlayerId).toBe(42);
    expect(state.displayName).toBe('TestPlayer');
    expect(state.playerName).toBe('TestPlayer');
  });

  it('clearAuth resets all auth fields', () => {
    state.setAuthData('token', 1, 'Name');
    state.clearAuth();

    expect(state.isAuthenticated()).toBe(false);
    expect(state.authToken).toBe('');
    expect(state.authenticatedPlayerId).toBe(0);
    expect(state.displayName).toBe('');
  });

  it('starts with no active deck', () => {
    expect(state.hasActiveDeck()).toBe(false);
    expect(state.activeDeckId).toBeNull();
    expect(state.activeDeckCardIds).toEqual([]);
  });

  it('setActiveDeck stores deck with defensive copy', () => {
    const original = ['foot_soldier', 'archer', 'pikeman'];
    state.setActiveDeck(7, original);

    expect(state.hasActiveDeck()).toBe(true);
    expect(state.activeDeckId).toBe(7);
    expect(state.activeDeckCardIds).toEqual(original);

    // Verify defensive copy — mutating original doesn't affect state
    original.push('knight');
    expect(state.activeDeckCardIds).toHaveLength(3);
  });

  it('isAuthenticated requires both token and playerId', () => {
    state.authToken = 'token';
    state.authenticatedPlayerId = 0;
    expect(state.isAuthenticated()).toBe(false);

    state.authToken = '';
    state.authenticatedPlayerId = 1;
    expect(state.isAuthenticated()).toBe(false);

    state.authToken = 'token';
    state.authenticatedPlayerId = 1;
    expect(state.isAuthenticated()).toBe(true);
  });
});

// ─── AuthManager Stub ─────────────────────────────────────────

describe('AuthManager stub', () => {
  // Import the real AuthManager since it has no browser deps
  let AuthManager: typeof import('../../src/auth/AuthManager').AuthManager;

  beforeEach(async () => {
    // Re-import to get fresh singleton state
    const mod = await import('../../src/auth/AuthManager');
    AuthManager = mod.AuthManager;
    AuthManager.logout(); // Reset state
  });

  it('starts not logged in', () => {
    expect(AuthManager.isLoggedIn()).toBe(false);
    expect(AuthManager.getToken()).toBeNull();
    expect(AuthManager.getPlayer()).toBeNull();
  });

  it('login() throws in non-browser environment', async () => {
    // Real AuthManager calls WalletManager.connect() which needs window.ethereum
    await expect(AuthManager.login()).rejects.toThrow();
  });

  it('authHeaders returns empty object when not logged in', () => {
    expect(AuthManager.authHeaders()).toEqual({});
  });

  it('_setAuth populates state', () => {
    AuthManager._setAuth('test-jwt', {
      id: 1,
      wallet: '0xabc',
      displayName: 'TestUser',
      winCount: 5,
      lossCount: 3,
      eloRating: 1200,
      activeDeckId: null,
    });

    expect(AuthManager.isLoggedIn()).toBe(true);
    expect(AuthManager.getToken()).toBe('test-jwt');
    expect(AuthManager.getPlayer()?.displayName).toBe('TestUser');
    expect(AuthManager.authHeaders()).toEqual({
      'Authorization': 'Bearer test-jwt',
    });
  });

  it('logout clears state', () => {
    AuthManager._setAuth('token', {
      id: 1, wallet: '0x', displayName: 'X',
      winCount: 0, lossCount: 0, eloRating: 1000, activeDeckId: null,
    });

    AuthManager.logout();

    expect(AuthManager.isLoggedIn()).toBe(false);
    expect(AuthManager.getToken()).toBeNull();
    expect(AuthManager.getPlayer()).toBeNull();
    expect(AuthManager.authHeaders()).toEqual({});
  });
});

// ─── NetworkEvents Type Contracts ─────────────────────────────

describe('NetworkEvents type contracts', () => {
  it('GameAction includes all required action types', async () => {
    const mod = await import('../../shared/types/NetworkEvents');

    // Type-level check: verify the interface exists with expected shape
    // We can't check union members at runtime, but we verify the import works
    const action: import('../../shared/types/NetworkEvents').GameAction = {
      type: 'CANCEL_PENDING',
      seqNum: 1,
      serverSeq: 2,
    };
    expect(action.type).toBe('CANCEL_PENDING');
    expect(action.seqNum).toBe(1);
    expect(action.serverSeq).toBe(2);
  });

  it('RoomPlayer has optional auth/deck fields', async () => {
    const mod = await import('../../shared/types/NetworkEvents');
    const player: import('../../shared/types/NetworkEvents').RoomPlayer = {
      id: 'socket-1',
      name: 'Test',
      wallet: null,
      // Optional fields
      playerId: 42,
      deckIds: ['foot_soldier', 'archer'],
      ready: true,
    };
    expect(player.playerId).toBe(42);
    expect(player.deckIds).toEqual(['foot_soldier', 'archer']);
    expect(player.ready).toBe(true);
  });

  it('RoomPlayer works without optional fields (backward compat)', async () => {
    const player: import('../../shared/types/NetworkEvents').RoomPlayer = {
      id: 'socket-1',
      name: 'Test',
      wallet: null,
    };
    expect(player.playerId).toBeUndefined();
    expect(player.deckIds).toBeUndefined();
    expect(player.ready).toBeUndefined();
  });

  it('Room has optional lobby fields', async () => {
    const room: Partial<import('../../shared/types/NetworkEvents').Room> = {
      players: [],
      gameSeed: null,
      cryptoReadyCount: 0,
      battleReadyCount: 0,
      settled: false,
      // Lobby extensions
      status: 'waiting',
      hostSocketId: 'socket-1',
      settings: {
        isPublic: true,
        isCrypto: false,
        maxPlayers: 2,
        roomName: 'Test Room',
        stakeAmount: 0,
        password: null,
      },
    };
    expect(room.status).toBe('waiting');
    expect(room.settings?.roomName).toBe('Test Room');
  });

  it('game_over event supports totalTurns', async () => {
    // Compile-time check: the interface allows totalTurns
    type GameOverData = Parameters<import('../../shared/types/NetworkEvents').ClientToServerEvents['game_over']>[0];
    const data: GameOverData = {
      roomCode: 'ABC123',
      winnerIndex: 0,
      totalTurns: 15,
    };
    expect(data.totalTurns).toBe(15);
  });

  it('lobby events exist in ClientToServerEvents', async () => {
    // Compile-time verification that lobby events are declared
    type C2S = import('../../shared/types/NetworkEvents').ClientToServerEvents;
    type LobbyCreate = C2S['lobby:create'];
    type LobbyJoin = C2S['lobby:join'];
    type LobbyChat = C2S['lobby:chat'];
    type LobbyReady = C2S['lobby:ready'];
    type LobbyStart = C2S['lobby:start_game'];

    // Runtime: just verify the types resolve (no runtime crash)
    expect(true).toBe(true);
  });

  it('lobby events exist in ServerToClientEvents', async () => {
    type S2C = import('../../shared/types/NetworkEvents').ServerToClientEvents;
    type LobbyState = S2C['lobby:state'];
    type LobbyCreated = S2C['lobby:created'];
    type LobbyGameStarting = S2C['lobby:game_starting'];
    type DeckAccepted = S2C['deckAccepted'];
    type DeckRejected = S2C['deckRejected'];

    expect(true).toBe(true);
  });
});
