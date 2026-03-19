// ============================================================
// lobbyHelpers.ts
// Lobby room creation helpers — pure functions.
// ============================================================

import type { Room, RoomSettings } from '../../shared/types/NetworkEvents.js';

const DEFAULT_SETTINGS: RoomSettings = {
  isPublic: true,
  isCrypto: false,
  maxPlayers: 2,
  roomName: 'Game Room',
  stakeAmount: 0,
  password: null,
};

/** Create a lobby-enabled room with full settings and all required Room fields. */
export function createLobbyRoom(
  hostSocketId: string,
  hostName: string,
  hostPlayerId: number | null,
  settings: Partial<RoomSettings> = {},
  guestSessionId?: string
): Room {
  const merged: RoomSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    roomName: (settings.roomName ?? `${hostName}'s Room`).slice(0, 40),
  };

  return {
    players: [{
      id: hostSocketId,
      name: hostName,
      wallet: null,
      playerId: hostPlayerId ?? null,
      deckIds: null,
      ready: true,
      guestSessionId: guestSessionId ?? null,
    }],
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
    // Lobby extensions
    hostSocketId,
    hostPlayerId: hostPlayerId ?? null,
    status: 'waiting',
    settings: merged,
    chat: [],
  };
}
