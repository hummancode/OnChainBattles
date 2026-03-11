// ============================================================
// RoomManager.ts
// Room CRUD and player tracking.
// ============================================================

import type { Room } from '../../shared/types/NetworkEvents.js';

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(socketId: string, roomCode: string, playerName: string): Room {
    const room: Room = {
      players: [{ id: socketId, name: playerName, wallet: null }],
      gameSeed: null,
      cryptoReadyCount: 0,
      settled: false,
    };
    this.rooms.set(roomCode, room);
    console.log(`[RoomManager] Room created: ${roomCode} by ${playerName}`);
    return room;
  }

  joinRoom(socketId: string, roomCode: string, playerName: string): Room | string {
    const room = this.rooms.get(roomCode);
    if (!room) return 'Room not found. Check the code.';
    if (room.players.length >= 2) return 'Room is full.';

    room.players.push({ id: socketId, name: playerName, wallet: null });

    // Generate shared shuffle seed
    const seed = Math.floor(Math.random() * 999999);
    room.gameSeed = seed;

    console.log(`[RoomManager] ${playerName} joined room: ${roomCode}, seed: ${seed}`);
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
      console.log(`[RoomManager] Wallet registered for ${player.name}: ${walletAddress}`);
    }
  }

  incrementCryptoReady(roomCode: string): number {
    const room = this.rooms.get(roomCode);
    if (!room) return 0;
    room.cryptoReadyCount += 1;
    console.log(`[RoomManager] cryptoReady: ${room.cryptoReadyCount}/2 in room ${roomCode}`);
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

  deleteRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }
}
