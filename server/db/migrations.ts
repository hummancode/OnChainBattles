// ============================================================
// migrations.ts
// Idempotent schema migrations. Run on every server start.
// Each migration has a unique ID — only runs once.
// ============================================================

import { getDB } from './database.js';

interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_players',
    sql: `CREATE TABLE IF NOT EXISTS players (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address  TEXT UNIQUE NOT NULL,
      display_name    TEXT NOT NULL DEFAULT 'Player',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login      DATETIME DEFAULT CURRENT_TIMESTAMP,
      win_count       INTEGER DEFAULT 0,
      loss_count      INTEGER DEFAULT 0,
      elo_rating      INTEGER DEFAULT 1000,
      active_deck_id  INTEGER
    )`,
  },
  {
    id: '002_decks',
    sql: `CREATE TABLE IF NOT EXISTS decks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   INTEGER NOT NULL,
      name        TEXT NOT NULL DEFAULT 'My Deck',
      card_ids    TEXT NOT NULL,
      is_valid    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )`,
  },
  {
    id: '003_collections',
    sql: `CREATE TABLE IF NOT EXISTS collections (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     INTEGER NOT NULL,
      card_id       TEXT NOT NULL,
      owned_copies  INTEGER DEFAULT 0,
      unlocked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE(player_id, card_id)
    )`,
  },
  {
    id: '004_match_history',
    sql: `CREATE TABLE IF NOT EXISTS match_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code     TEXT NOT NULL,
      player_a_id   INTEGER,
      player_b_id   INTEGER,
      winner_id     INTEGER,
      player_a_deck TEXT,
      player_b_deck TEXT,
      stake_amount  REAL DEFAULT 0,
      tx_hash       TEXT,
      game_seed     INTEGER,
      total_turns   INTEGER DEFAULT 0,
      started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at      DATETIME,
      FOREIGN KEY (player_a_id) REFERENCES players(id),
      FOREIGN KEY (player_b_id) REFERENCES players(id)
    )`,
  },
];

export function runMigrations(): void {
  const db = getDB();

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id     TEXT PRIMARY KEY,
    ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const check = db.prepare('SELECT id FROM _migrations WHERE id = ?');
  const mark = db.prepare('INSERT INTO _migrations (id) VALUES (?)');

  for (const m of MIGRATIONS) {
    if (!check.get(m.id)) {
      console.log(`[DB] Running migration: ${m.id}`);
      db.exec(m.sql);
      mark.run(m.id);
    }
  }

  console.log('[DB] Migrations complete.');
}
