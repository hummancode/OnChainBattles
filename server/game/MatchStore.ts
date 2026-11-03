// ============================================================
// MatchStore.ts
// SQLite persistence for matches.
//
//   active_matches  — one row per in-progress battle: everything needed
//                     to rebuild the Room + MatchSimulation after a server
//                     restart (seed, decks, players, seq counters, log).
//                     Upserted after every committed action.
//   match_replays   — seed + decks + full action log of finished matches
//                     (guests included), served to the replay viewer.
//
// The action log is the source of truth: the simulation is rebuilt by
// replaying it, never deserialized.
// ============================================================

import type Database from 'better-sqlite3';
import type { Room, RoomPlayer, GameAction } from '../../shared/types/NetworkEvents.js';
import { MatchSimulation } from './MatchSimulation.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('MatchStore');

export const MATCH_STORE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS active_matches (
    room_code   TEXT PRIMARY KEY,
    snapshot    TEXT NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS match_replays (
    room_code     TEXT PRIMARY KEY,
    game_seed     INTEGER NOT NULL,
    decks_json    TEXT NOT NULL,
    log_json      TEXT NOT NULL,
    player_names  TEXT NOT NULL,
    winner_index  INTEGER,
    reason        TEXT,
    total_turns   INTEGER,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

/** What we persist for an active match — plain JSON, no sockets/timers/engine. */
interface ActiveSnapshot {
  v: 1;
  gameSeed: number;
  decks: [string[], string[]];
  players: Array<Pick<RoomPlayer, 'name' | 'wallet' | 'guestSessionId' | 'playerId' | 'deckIds'>>;
  lastSeqNum: [number, number];
  globalSeq: number;
  actionCount: number;
  cryptoReadyCount: number;
  actionLog: GameAction[];
  status?: Room['status'];
  settings?: Room['settings'];
  hostPlayerId?: number | null;
  /** Consecutive turn timeouts — must survive a restart or AFK players get a fresh 3 strikes. */
  timeouts?: [number, number];
}

export interface StoredReplay {
  roomCode: string;
  gameSeed: number;
  decks: [string[], string[]];
  actionLog: GameAction[];
  playerNames: [string, string];
  winnerIndex: number | null;
  reason: string | null;
  totalTurns: number | null;
}

export class MatchStore {
  constructor(private db: Database.Database) {
    db.exec(MATCH_STORE_SCHEMA);
  }

  /** Upsert the active-match snapshot. Call after battle start and every committed action. */
  save(roomCode: string, room: Room): void {
    const sim = room.simulation as MatchSimulation | undefined;
    if (!sim) return;
    const snap: ActiveSnapshot = {
      v: 1,
      gameSeed: sim.seed,
      decks: sim.decks,
      players: room.players.map(p => ({
        name: p.name, wallet: p.wallet, guestSessionId: p.guestSessionId ?? null,
        playerId: p.playerId ?? null, deckIds: p.deckIds ?? null,
      })),
      lastSeqNum: [...room.lastSeqNum] as [number, number],
      globalSeq: room.globalSeq,
      actionCount: room.actionCount,
      cryptoReadyCount: room.cryptoReadyCount,
      actionLog: room.actionLog,
      status: room.status,
      settings: room.settings,
      hostPlayerId: room.hostPlayerId,
      timeouts: room.timeouts,
    };
    try {
      this.db.prepare(`
        INSERT INTO active_matches (room_code, snapshot, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(room_code) DO UPDATE SET snapshot = excluded.snapshot, updated_at = CURRENT_TIMESTAMP
      `).run(roomCode, JSON.stringify(snap));
    } catch (err) {
      log.error(`save(${roomCode}) failed:`, err);
    }
  }

  remove(roomCode: string): void {
    try { this.db.prepare('DELETE FROM active_matches WHERE room_code = ?').run(roomCode); }
    catch (err) { log.error(`remove(${roomCode}) failed:`, err); }
  }

  /**
   * Rebuild a Room (with its MatchSimulation) from the stored snapshot.
   * Players come back disconnected (socket id '') and are matched again on rejoin.
   * Returns null if there is no row or the log no longer replays.
   */
  load(roomCode: string): Room | null {
    const row = this.db.prepare('SELECT snapshot FROM active_matches WHERE room_code = ?').get(roomCode) as { snapshot: string } | undefined;
    if (!row) return null;
    try {
      const snap = JSON.parse(row.snapshot) as ActiveSnapshot;
      const simulation = MatchSimulation.fromLog(snap.gameSeed, snap.decks, snap.actionLog);
      const room: Room = {
        players: snap.players.map(p => ({ ...p, id: '' })) as RoomPlayer[],
        gameSeed: snap.gameSeed,
        cryptoReadyCount: snap.cryptoReadyCount,
        battleReadyCount: 2,
        readyPlayers: new Set([0, 1]),
        actionQueue: [],
        actionLog: snap.actionLog,
        settled: false,
        currentTurnPlayer: simulation.activePlayer,
        currentPhase: simulation.phase === 'ACT' ? 'ACT' : 'PLAY',
        actionCount: snap.actionCount,
        gameOverClaims: [],
        lastSeqNum: snap.lastSeqNum,
        globalSeq: snap.globalSeq,
        pendingHashes: new Map(),
        disconnectTimers: new Map(),
        disconnectIntervals: new Map(),
        createdAt: Date.now(),
        simulation,
        status: snap.status ?? 'in_progress',
        settings: snap.settings,
        hostPlayerId: snap.hostPlayerId,
        timeouts: snap.timeouts ?? [0, 0],
      };
      log.info(`Restored ${roomCode} from disk (${snap.actionLog.length} actions)`);
      return room;
    } catch (err) {
      log.error(`load(${roomCode}) failed — dropping stored match:`, err);
      this.remove(roomCode);
      return null;
    }
  }

  /** Remove snapshots nobody came back for. */
  pruneOlderThan(minutes: number): number {
    const res = this.db.prepare(`DELETE FROM active_matches WHERE updated_at < datetime('now', ?)`).run(`-${minutes} minutes`);
    return res.changes;
  }

  saveReplay(roomCode: string, room: Room, result: { winnerIndex: number; reason: string; turns: number }): void {
    const sim = room.simulation as MatchSimulation | undefined;
    if (!sim) return;
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO match_replays
          (room_code, game_seed, decks_json, log_json, player_names, winner_index, reason, total_turns)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        roomCode, sim.seed, JSON.stringify(sim.decks), JSON.stringify(room.actionLog),
        JSON.stringify(room.players.map(p => p.name)), result.winnerIndex, result.reason, result.turns,
      );
    } catch (err) {
      log.error(`saveReplay(${roomCode}) failed:`, err);
    }
  }

  getReplay(roomCode: string): StoredReplay | null {
    const r = this.db.prepare('SELECT * FROM match_replays WHERE room_code = ?').get(roomCode) as any;
    if (!r) return null;
    return {
      roomCode: r.room_code,
      gameSeed: r.game_seed,
      decks: JSON.parse(r.decks_json),
      actionLog: JSON.parse(r.log_json),
      playerNames: JSON.parse(r.player_names),
      winnerIndex: r.winner_index,
      reason: r.reason,
      totalTurns: r.total_turns,
    };
  }
}
