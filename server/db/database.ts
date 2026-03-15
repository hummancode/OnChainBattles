// ============================================================
// database.ts
// SQLite connection — singleton with WAL mode.
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve('server/data');
const DB_PATH = path.join(DB_DIR, 'ocb.sqlite');

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log(`[DB] Opened: ${DB_PATH}`);
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Closed.');
  }
}
