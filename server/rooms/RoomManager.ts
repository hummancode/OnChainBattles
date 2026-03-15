// ============================================================
// RoomManager.ts
// Room CRUD and player tracking.
// ============================================================

import { randomInt } from 'crypto';
import type { Room, RoomPlayer, PublicRoomListing, LobbyState } from '../../shared/types/NetworkEvents.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('RoomManager');

export class RoomManager {
  private rooms = new Map<string, Room>();
  private static readonly STALE_ROOM_MS = 2 * 60 * 60 * 1000; // 2 hours
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Sweep stale rooms every 10 minutes
    this.cleanupTimer = setInterval(() => this.sweepStaleRooms(), 10 * 60 * 1000);
  }

  private sweepStaleRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > RoomManager.STALE_ROOM_MS) {
        log.info(`Sweeping stale room: ${code} (age: ${Math.round((now - room.createdAt) / 60_000)}m)`);
        this.deleteRoom(code);
      }
    }
  }

  createRoom(socketId: string, roomCode: string, playerName: string): Room {
    const room: Room = {
      players: [{ id: socketId, name: playerName, wallet: null }],
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
    };
    this.rooms.set(roomCode, room);
    log.info(` Room created: ${roomCode} by ${playerName}`);
    return room;
  }

  joinRoom(socketId: string, roomCode: string, playerName: string): Room | string {
    const room = this.rooms.get(roomCode);
    if (!room) return 'Room not found. Check the code.';
    if (room.players.length >= 2) return 'Room is full.';

    room.players.push({ id: socketId, name: playerName, wallet: null });

    // Generate shared shuffle seed (32-bit, cryptographically random)
    const seed = randomInt(0, 2 ** 32);
    room.gameSeed = seed;

    log.info(` ${playerName} joined room: ${roomCode}, seed: ${seed}`);
    return room;
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  registerWallet(socketId: string, roomCode: string, walletAddress: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socketId);
    if (player) {
      player.wallet = walletAddress;
      log.info(` Wallet registered for ${player.name}: ${walletAddress}`);
    }
  }

  incrementCryptoReady(roomCode: string): number {
    const room = this.rooms.get(roomCode);
    if (!room) return 0;
    room.cryptoReadyCount += 1;
    log.info(` cryptoReady: ${room.cryptoReadyCount}/2 in room ${roomCode}`);
    return room.cryptoReadyCount;
  }

  markSettled(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.settled) return false;
    room.settled = true;
    return true;
  }

  /** Find room + player index by socket ID. Returns null if not found. */
  findBySocket(socketId: string): { roomCode: string; room: Room; playerIndex: number } | null {
    for (const [code, room] of this.rooms) {
      const idx = room.players.findIndex(p => p.id === socketId);
      if (idx !== -1) return { roomCode: code, room, playerIndex: idx };
    }
    return null;
  }

  /** Reassign a player's socket ID (after reconnection). Returns player index or -1. */
  reassignSocket(roomCode: string, playerName: string, newSocketId: string): number {
    const room = this.rooms.get(roomCode);
    if (!room) return -1;
    const idx = room.players.findIndex(p => p.name === playerName);
    if (idx === -1) return -1;
    room.players[idx].id = newSocketId;
    log.info(` Reassigned ${playerName} in ${roomCode} → socket ${newSocketId}`);
    return idx;
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }

  deleteRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      for (const timer of room.disconnectTimers.values()) {
        clearTimeout(timer);
      }
      room.disconnectTimers.clear();
      for (const interval of room.disconnectIntervals.values()) {
        clearInterval(interval);
      }
      room.disconnectIntervals.clear();
    }
    this.rooms.delete(roomCode);
  }

  /** Insert a pre-built room (used by LobbyManager). */
  setRoom(roomCode: string, room: Room): void {
    this.rooms.set(roomCode, room);
  }

  // ─── Auth / Deck Extensions ──────────────────────────────

  /** Associate a DB player ID with a socket in a room. */
  setPlayerAuth(socketId: string, roomCode: string, playerId: number): void {
    const player = this.findPlayer(socketId, roomCode);
    if (player) player.playerId = playerId;
  }

  /** Store validated deck IDs for a player. */
  setPlayerDeck(socketId: string, roomCode: string, deckIds: string[]): boolean {
    const player = this.findPlayer(socketId, roomCode);
    if (!player) return false;
    player.deckIds = deckIds;
    return true;
  }

  /** Check if all players in a room have submitted decks. */
  allDecksReady(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.players.length < 2) return false;
    return room.players.every(p => !!p.deckIds);
  }

  // ─── Lobby Extensions ────────────────────────────────────

  /** Get all waiting public rooms for the room browser. */
  getPublicRooms(): PublicRoomListing[] {
    const result: PublicRoomListing[] = [];
    for (const [code, room] of this.rooms) {
      if (room.settings?.isPublic && room.status === 'waiting') {
        result.push({
          code,
          roomName: room.settings.roomName,
          hostName: room.players[0]?.name ?? 'Unknown',
          playerCount: room.players.length,
          maxPlayers: room.settings.maxPlayers,
          isCrypto: room.settings.isCrypto,
          stakeAmount: room.settings.stakeAmount,
          hasPassword: !!room.settings.password,
          status: room.status,
          createdAt: room.createdAt ?? Date.now(),
        });
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  }

  /** Build lobby state for players inside a room. */
  getLobbyState(roomCode: string): LobbyState | null {
    const room = this.rooms.get(roomCode);
    if (!room || !room.settings) return null;
    // Strip password from broadcast — only expose hasPassword flag
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

  /** Generate a unique 6-digit room code. */
  generateUniqueCode(): string {
    let code: string;
    let attempts = 0;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      attempts++;
    } while (this.rooms.has(code) && attempts < 100);
    return code;
  }

  /** Remove a player from all rooms (prevent multi-room). Returns codes left. */
  removeFromAllRooms(socketId: string): string[] {
    const leftCodes: string[] = [];
    for (const [code, room] of this.rooms) {
      const idx = room.players.findIndex(p => p.id === socketId);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        leftCodes.push(code);
        if (room.players.length === 0) {
          this.rooms.delete(code);
        } else if (room.hostSocketId === socketId) {
          room.hostSocketId = room.players[0].id;
          room.hostPlayerId = room.players[0].playerId ?? null;
        }
      }
    }
    return leftCodes;
  }

  // ─── Private Helpers ─────────────────────────────────────

  private findPlayer(socketId: string, roomCode: string): RoomPlayer | undefined {
    const room = this.rooms.get(roomCode);
    return room?.players.find(p => p.id === socketId);
  }
}
