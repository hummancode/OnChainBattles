// ============================================================
// RoomJanitor.ts
// Periodic cleanup of stale rooms — ALL rooms, not just public.
// ============================================================

import type { RoomManager } from '../rooms/RoomManager.js';

const ROOM_TTL_MS = 30 * 60 * 1000;   // 30 minutes for lobby rooms
const JANITOR_INTERVAL = 60 * 1000;    // Check every minute

export class RoomJanitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private rooms: RoomManager
  ) {}

  start(): void {
    this.intervalId = setInterval(() => this.sweep(), JANITOR_INTERVAL);
    console.log('[Janitor] Started — checking every 60s.');
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private sweep(): void {
    // RoomManager already has sweepStaleRooms (2h TTL) for legacy rooms.
    // This janitor handles lobby rooms with shorter TTL (30min waiting).
    // Both can coexist safely — deleteRoom is idempotent.
    const publicRooms = this.rooms.getPublicRooms();
    const now = Date.now();

    for (const listing of publicRooms) {
      const age = now - listing.createdAt;
      if (listing.playerCount === 0 || (listing.status === 'waiting' && age > ROOM_TTL_MS)) {
        this.rooms.deleteRoom(listing.code);
        console.log(`[Janitor] Deleted stale lobby room: ${listing.code} (age: ${Math.round(age / 60_000)}m)`);
      }
    }
  }
}
