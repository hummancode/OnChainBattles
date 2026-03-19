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
  {
    id: '005_auth_tiers',
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE players_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet_address  TEXT UNIQUE,
        email           TEXT UNIQUE,
        password_hash   TEXT,
        auth_provider   TEXT NOT NULL DEFAULT 'wallet',
        account_tier    INTEGER NOT NULL DEFAULT 1,
        founding_player INTEGER NOT NULL DEFAULT 0,
        display_name    TEXT NOT NULL DEFAULT 'Player',
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login      DATETIME DEFAULT CURRENT_TIMESTAMP,
        win_count       INTEGER DEFAULT 0,
        loss_count      INTEGER DEFAULT 0,
        elo_rating      INTEGER DEFAULT 1000,
        active_deck_id  INTEGER
      );

      INSERT INTO players_new
        (id, wallet_address, auth_provider, account_tier, display_name,
         created_at, last_login, win_count, loss_count, elo_rating, active_deck_id)
      SELECT id, wallet_address, 'wallet', 1, display_name,
        created_at, last_login, win_count, loss_count, elo_rating, active_deck_id
      FROM players;

      DROP TABLE players;
      ALTER TABLE players_new RENAME TO players;

      PRAGMA foreign_keys = ON;
    `,
  },
  {
    id: '006_admin_puzzles',
    sql: `
      ALTER TABLE players ADD COLUMN is_admin INTEGER DEFAULT 0;
      ALTER TABLE players ADD COLUMN banned_at DATETIME;

      CREATE TABLE IF NOT EXISTS puzzles (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        difficulty      TEXT NOT NULL DEFAULT 'medium',
        board_setup     TEXT NOT NULL DEFAULT '{}',
        hand_cards      TEXT NOT NULL DEFAULT '[]',
        solution        TEXT NOT NULL DEFAULT '[]',
        prize_card_id   TEXT,
        prize_pool      REAL DEFAULT 0,
        attempt_fee     REAL DEFAULT 0,
        required_cards  TEXT NOT NULL DEFAULT '[]',
        published       INTEGER DEFAULT 0,
        solved          INTEGER DEFAULT 0,
        solved_by_id    INTEGER,
        solved_at       DATETIME,
        created_by_id   INTEGER NOT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (solved_by_id) REFERENCES players(id)
      );

      CREATE TABLE IF NOT EXISTS puzzle_attempts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        puzzle_id    INTEGER NOT NULL,
        player_id    INTEGER NOT NULL,
        placement    TEXT NOT NULL,
        correct      INTEGER DEFAULT 0,
        attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (puzzle_id) REFERENCES puzzles(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      );

      CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_lookup
        ON puzzle_attempts(player_id, puzzle_id, attempted_at);
    `,
  },
  {
    id: '007_puzzle_show_required',
    sql: `ALTER TABLE puzzles ADD COLUMN show_required_cards INTEGER DEFAULT 1`,
  },
  {
    id: '008_puzzle_escrow',
    sql: `
      ALTER TABLE puzzles ADD COLUMN escrow_tx_hash TEXT;
      ALTER TABLE puzzles ADD COLUMN on_chain INTEGER DEFAULT 0;
      ALTER TABLE puzzle_attempts ADD COLUMN tx_hash TEXT;
      ALTER TABLE puzzle_attempts ADD COLUMN wallet_address TEXT;
    `,
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
