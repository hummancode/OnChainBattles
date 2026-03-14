// ============================================================
// GameLogWriter.ts (Server-side)
// Writes per-session game action logs to logs/ directory.
// One JSON file per room session.
//
// In dev mode (NODE_ENV !== 'production'), also accepts rich
// game state snapshots from clients and writes periodically.
//
// Format: logs/server_<roomCode>_<timestamp>.json
// ============================================================

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_DEV = process.env.NODE_ENV !== 'production';
// __dirname = server/dist/server/game/ when compiled
const LOGS_DIR = IS_DEV
  ? join(__dirname, '..', '..', 'logs')        // server/dist/logs
  : join(__dirname, '..', '..', '..', 'logs'); // project-root/logs

const DEV_WRITE_INTERVAL_MS = 30_000;

interface ServerLogEntry {
  seq: number;
  ts: number;                 // ms since session start
  player: number;             // 0 or 1
  actionType: string;
  detail: string;
  raw: Record<string, any>;
}

interface ServerSessionLog {
  meta: {
    roomCode: string;
    seed: number;
    players: Array<{ name: string; wallet: string | null }>;
    startedAt: string;
    endedAt?: string;
  };
  entries: ServerLogEntry[];
  snapshots: Record<string, any>[];
}

export class GameLogWriter {
  private log: ServerSessionLog;
  private seq = 0;
  private startMs: number;
  private filePath: string;
  private writeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(roomCode: string, seed: number, players: Array<{ name: string; wallet: string | null }>) {
    this.startMs = Date.now();
    this.log = {
      meta: {
        roomCode,
        seed,
        players,
        startedAt: new Date().toISOString(),
      },
      entries: [],
      snapshots: [],
    };

    // Pre-compute file path
    const ts = this.log.meta.startedAt.replace(/[:.]/g, '-');
    const filename = `server_${roomCode}_${ts}.json`;
    try {
      if (!existsSync(LOGS_DIR)) {
        mkdirSync(LOGS_DIR, { recursive: true });
      }
    } catch { /* will fail on write instead */ }
    this.filePath = join(LOGS_DIR, filename);

    // In dev mode, write to disk periodically
    if (IS_DEV) {
      this.writeTimer = setInterval(() => this.writeToDisk(), DEV_WRITE_INTERVAL_MS);
    }
  }

  record(playerIndex: number, action: Record<string, any>): void {
    this.log.entries.push({
      seq: this.seq++,
      ts: Date.now() - this.startMs,
      player: playerIndex,
      actionType: action.type ?? 'UNKNOWN',
      detail: describeAction(playerIndex, action),
      raw: { ...action },
    });
  }

  /** Accept a rich game state snapshot (dev only). */
  recordSnapshot(snapshot: Record<string, any>): void {
    this.log.snapshots.push({
      receivedAt: Date.now() - this.startMs,
      ...snapshot,
    });
  }

  flush(): void {
    this.log.meta.endedAt = new Date().toISOString();
    if (this.writeTimer) {
      clearInterval(this.writeTimer);
      this.writeTimer = null;
    }
    this.writeToDisk();
  }

  private writeToDisk(): void {
    try {
      if (!existsSync(LOGS_DIR)) {
        mkdirSync(LOGS_DIR, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(this.log), 'utf-8');
      console.log(`[GameLogWriter] Written ${this.filePath} (${this.log.entries.length} actions, ${this.log.snapshots.length} snapshots)`);
    } catch (e) {
      console.error('[GameLogWriter] Failed to write log:', e);
    }
  }

  get entryCount(): number { return this.log.entries.length; }
}

function describeAction(player: number, action: Record<string, any>): string {
  const p = `P${player + 1}`;
  switch (action.type) {
    case 'PLAY_CARD':
      return `${p} played hand[${action.handIndex}] at (${action.col},${action.row})`;
    case 'MOVE_UNIT':
      return `${p} moved (${action.fromCol},${action.fromRow}) → (${action.col},${action.row})`;
    case 'ATTACK_UNIT':
      return `${p} attacked (${action.fromCol},${action.fromRow}) → (${action.targetCol},${action.targetRow})`;
    case 'END_PLAY_PHASE':
      return `${p} ended PLAY phase`;
    case 'END_ACT_PHASE':
      return `${p} ended ACT phase`;
    case 'SELECT_TARGET':
      return `${p} selected target at (${action.col},${action.row})`;
    case 'SELECT_POSITION':
      return `${p} selected position at (${action.col},${action.row})`;
    case 'CANCEL_PENDING':
      return `${p} cancelled pending interaction`;
    default:
      return `${p}: ${action.type}`;
  }
}
