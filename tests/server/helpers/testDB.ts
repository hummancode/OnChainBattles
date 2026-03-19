/**
 * testDB.ts — In-memory SQLite setup for server integration tests.
 * Creates a fresh :memory: database with all migrations applied.
 * Overrides the database module's internal state to use test DB.
 */

import Database from 'better-sqlite3';
import * as dbModule from '../../../server/db/database';
import { issueToken } from '../../../server/api/middleware';

let testDb: Database.Database | null = null;

/**
 * Create an in-memory SQLite database with the OCB schema.
 */
export function createTestDB(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address  TEXT UNIQUE,
      email           TEXT UNIQUE,
      password_hash   TEXT,
      auth_provider   TEXT NOT NULL DEFAULT 'wallet',
      account_tier    INTEGER NOT NULL DEFAULT 1,
      founding_player INTEGER NOT NULL DEFAULT 0,
      is_admin        INTEGER DEFAULT 0,
      banned_at       DATETIME,
      display_name    TEXT NOT NULL DEFAULT 'Player',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login      DATETIME DEFAULT CURRENT_TIMESTAMP,
      win_count       INTEGER DEFAULT 0,
      loss_count      INTEGER DEFAULT 0,
      elo_rating      INTEGER DEFAULT 1000,
      active_deck_id  INTEGER
    );

    CREATE TABLE IF NOT EXISTS decks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   INTEGER NOT NULL,
      name        TEXT NOT NULL DEFAULT 'My Deck',
      card_ids    TEXT NOT NULL,
      is_valid    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     INTEGER NOT NULL,
      card_id       TEXT NOT NULL,
      owned_copies  INTEGER DEFAULT 0,
      unlocked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE(player_id, card_id)
    );

    CREATE TABLE IF NOT EXISTS match_history (
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
    );
  `);

  return db;
}

/**
 * Patch getDB() to return an in-memory test database.
 * Uses Object.defineProperty to override the module export.
 */
export function patchGetDB(): { db: Database.Database; cleanup: () => void } {
  const db = createTestDB();
  testDb = db;

  const originalGetDB = dbModule.getDB;

  // Override using defineProperty (works with ESM re-exports)
  Object.defineProperty(dbModule, 'getDB', {
    value: () => testDb,
    writable: true,
    configurable: true,
  });

  return {
    db,
    cleanup: () => {
      Object.defineProperty(dbModule, 'getDB', {
        value: originalGetDB,
        writable: true,
        configurable: true,
      });
      db.close();
      testDb = null;
    },
    /** Start a savepoint — call before each test for isolation */
    beginTransaction: () => db.exec('SAVEPOINT test_txn'),
    /** Rollback to savepoint — call after each test to undo changes */
    rollback: () => db.exec('ROLLBACK TO SAVEPOINT test_txn'),
  };
}

/**
 * Insert a test player and return their ID + JWT token.
 */
export function createTestPlayer(
  db: Database.Database,
  overrides: Partial<{
    wallet: string; email: string; displayName: string;
    authProvider: string; accountTier: number;
  }> = {},
): { playerId: number; token: string } {
  const wallet = overrides.wallet ?? null;
  const email = overrides.email ?? null;
  const displayName = overrides.displayName ?? 'TestPlayer';
  const authProvider = overrides.authProvider ?? 'wallet';
  const accountTier = overrides.accountTier ?? 1;

  const result = db.prepare(`
    INSERT INTO players (wallet_address, email, auth_provider, account_tier, display_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(wallet, email, authProvider, accountTier, displayName);

  const playerId = Number(result.lastInsertRowid);
  const token = issueToken({
    playerId, wallet, email, authProvider, accountTier,
  });

  return { playerId, token };
}
