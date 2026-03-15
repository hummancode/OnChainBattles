// ============================================================
// matchService.ts
// Match recording logic — used by SessionManager on game_over.
// Separate from matchRoutes to avoid circular dependency.
// ============================================================

import { getDB } from '../db/database.js';
import type { Room } from '../../shared/types/NetworkEvents.js';

export interface RecordMatchOptions {
  roomCode: string;
  room: Room;
  winnerIndex: number;
  totalTurns: number;
  txHash?: string;
}

/** Record a finished match to database. Safe for guests (null playerIds). */
export function recordMatch(opts: RecordMatchOptions): void {
  const { roomCode, room, winnerIndex, totalTurns, txHash } = opts;
  const pA = room.players[0];
  const pB = room.players[1];
  const winnerId = room.players[winnerIndex]?.playerId ?? null;

  // Skip recording if both players are guests
  if (!pA?.playerId && !pB?.playerId) return;

  const db = getDB();
  db.prepare(`
    INSERT INTO match_history
    (room_code, player_a_id, player_b_id, winner_id,
     player_a_deck, player_b_deck, tx_hash, game_seed, total_turns, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    roomCode,
    pA?.playerId ?? null,
    pB?.playerId ?? null,
    winnerId,
    pA?.deckIds ? JSON.stringify(pA.deckIds) : null,
    pB?.deckIds ? JSON.stringify(pB.deckIds) : null,
    txHash ?? null,
    room.gameSeed ?? 0,
    totalTurns,
  );

  // Update win/loss
  if (winnerId) {
    db.prepare('UPDATE players SET win_count = win_count + 1 WHERE id = ?').run(winnerId);
    const loserId = winnerIndex === 0 ? pB?.playerId : pA?.playerId;
    if (loserId) {
      db.prepare('UPDATE players SET loss_count = loss_count + 1 WHERE id = ?').run(loserId);
    }
  }

  console.log(`[MatchService] Recorded match in ${roomCode}, winner: ${winnerId ?? 'guest'}`);
}
