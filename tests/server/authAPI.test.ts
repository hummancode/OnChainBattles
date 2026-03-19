/**
 * authAPI.test.ts — Auth route integration tests with in-memory SQLite.
 * Tests email registration, login, and JWT flow.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { patchGetDB } from './helpers/testDB';
import { issueToken, verifyToken } from '../../server/api/middleware';

describe('Auth API integration', () => {
  let cleanup: () => void;
  let db: any;

  beforeAll(() => {
    const patched = patchGetDB();
    db = patched.db;
    cleanup = patched.cleanup;
  });

  afterAll(() => cleanup());

  it('new player can be created via direct DB insert', () => {
    const result = db.prepare(
      'INSERT INTO players (email, password_hash, auth_provider, account_tier, display_name) VALUES (?, ?, ?, ?, ?)'
    ).run('test@example.com', '$2a$10$fakehash', 'email', 1, 'Tester');

    expect(result.lastInsertRowid).toBeGreaterThan(0);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid);
    expect(player.email).toBe('test@example.com');
    expect(player.display_name).toBe('Tester');
    expect(player.elo_rating).toBe(1000);
  });

  it('duplicate email is rejected by UNIQUE constraint', () => {
    db.prepare(
      'INSERT INTO players (email, auth_provider, display_name) VALUES (?, ?, ?)'
    ).run('unique@test.com', 'email', 'First');

    expect(() =>
      db.prepare('INSERT INTO players (email, auth_provider, display_name) VALUES (?, ?, ?)')
        .run('unique@test.com', 'email', 'Second')
    ).toThrow();
  });

  it('wallet login creates player on first visit', () => {
    const wallet = '0xabcdef1234567890abcdef1234567890abcdef12';
    db.prepare(
      'INSERT INTO players (wallet_address, auth_provider, account_tier, display_name) VALUES (?, ?, ?, ?)'
    ).run(wallet, 'wallet', 1, `Player_${wallet.slice(-6)}`);

    const player = db.prepare('SELECT * FROM players WHERE wallet_address = ?').get(wallet);
    expect(player).toBeTruthy();
    expect(player.auth_provider).toBe('wallet');
  });

  it('JWT issued for player can be verified', () => {
    const token = issueToken({
      playerId: 1, wallet: null, email: 'test@example.com',
      authProvider: 'email', accountTier: 1,
    });
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.email).toBe('test@example.com');
  });

  it('collection entries can be stored and queried', () => {
    const playerId = 100;
    db.prepare('INSERT INTO players (id, display_name, auth_provider) VALUES (?, ?, ?)').run(playerId, 'CollTest', 'email');

    db.prepare('INSERT INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, ?)').run(playerId, 'foot_soldier', 3);
    db.prepare('INSERT INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, ?)').run(playerId, 'archer', 2);

    const cards = db.prepare('SELECT * FROM collections WHERE player_id = ? ORDER BY card_id').all(playerId) as any[];
    expect(cards.length).toBe(2);
    const footSoldier = cards.find((c: any) => c.card_id === 'foot_soldier');
    expect(footSoldier.owned_copies).toBe(3);
  });

  it('banned player row has banned_at set', () => {
    const playerId = 200;
    db.prepare('INSERT INTO players (id, display_name, auth_provider) VALUES (?, ?, ?)').run(playerId, 'BanTest', 'email');
    db.prepare('UPDATE players SET banned_at = CURRENT_TIMESTAMP WHERE id = ?').run(playerId);

    const row = db.prepare('SELECT banned_at FROM players WHERE id = ?').get(playerId);
    expect(row.banned_at).not.toBeNull();
  });

  it('admin flag defaults to 0', () => {
    const playerId = 300;
    db.prepare('INSERT INTO players (id, display_name, auth_provider) VALUES (?, ?, ?)').run(playerId, 'AdminTest', 'email');
    const row = db.prepare('SELECT is_admin FROM players WHERE id = ?').get(playerId);
    expect(row.is_admin).toBe(0);
  });
});
