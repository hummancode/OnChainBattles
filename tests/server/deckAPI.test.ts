/**
 * deckAPI.test.ts — Deck CRUD integration tests with in-memory SQLite.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { patchGetDB } from './helpers/testDB';
import { validateDeck } from '../../server/validation/DeckValidator';
import { UNITS_ONLY_DECK_IDS } from '../../src/game/data/DeckDefinitions';

describe('Deck CRUD (DB integration)', () => {
  let cleanup: () => void;
  let db: any;
  let playerId: number;

  beforeAll(() => {
    const patched = patchGetDB();
    db = patched.db;
    cleanup = patched.cleanup;

    // Create test player
    const result = db.prepare(
      'INSERT INTO players (display_name, auth_provider) VALUES (?, ?)'
    ).run('DeckTester', 'email');
    playerId = Number(result.lastInsertRowid);

    // Give them a collection with all cards
    for (const cardId of new Set(UNITS_ONLY_DECK_IDS)) {
      const count = UNITS_ONLY_DECK_IDS.filter(id => id === cardId).length;
      db.prepare('INSERT INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, ?)').run(playerId, cardId, count);
    }
  });

  afterAll(() => cleanup());

  it('create a valid deck', () => {
    const cardIds = JSON.stringify(UNITS_ONLY_DECK_IDS);
    const validation = validateDeck(UNITS_ONLY_DECK_IDS);
    const result = db.prepare(
      'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
    ).run(playerId, 'Test Deck', cardIds, validation.valid ? 1 : 0);

    expect(result.lastInsertRowid).toBeGreaterThan(0);
    const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(result.lastInsertRowid);
    expect(deck.name).toBe('Test Deck');
    expect(deck.is_valid).toBe(1);
    expect(JSON.parse(deck.card_ids)).toHaveLength(31);
  });

  it('update a deck', () => {
    // Create first
    const result = db.prepare(
      'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
    ).run(playerId, 'Old Name', JSON.stringify(UNITS_ONLY_DECK_IDS), 1);
    const deckId = result.lastInsertRowid;

    // Update
    db.prepare('UPDATE decks SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run('New Name', deckId);
    const updated = db.prepare('SELECT * FROM decks WHERE id = ?').get(deckId);
    expect(updated.name).toBe('New Name');
  });

  it('delete a deck', () => {
    // Create two decks (can't delete the last one)
    db.prepare('INSERT INTO decks (player_id, name, card_ids) VALUES (?, ?, ?)').run(playerId, 'Keep', '[]');
    const r = db.prepare('INSERT INTO decks (player_id, name, card_ids) VALUES (?, ?, ?)').run(playerId, 'Delete Me', '[]');
    const deleteId = r.lastInsertRowid;

    db.prepare('DELETE FROM decks WHERE id = ?').run(deleteId);
    const deleted = db.prepare('SELECT * FROM decks WHERE id = ?').get(deleteId);
    expect(deleted).toBeUndefined();
  });

  it('activate a deck updates player active_deck_id', () => {
    const r = db.prepare(
      'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
    ).run(playerId, 'Active Deck', JSON.stringify(UNITS_ONLY_DECK_IDS), 1);
    const deckId = r.lastInsertRowid;

    db.prepare('UPDATE players SET active_deck_id = ? WHERE id = ?').run(deckId, playerId);
    const player = db.prepare('SELECT active_deck_id FROM players WHERE id = ?').get(playerId);
    expect(Number(player.active_deck_id)).toBe(Number(deckId));
  });

  it('ownership validation rejects cards not owned', () => {
    const owned = new Map<string, number>();
    owned.set('foot_soldier', 1); // only owns 1, deck needs 3

    const result = validateDeck(UNITS_ONLY_DECK_IDS, owned);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('need'))).toBe(true);
  });

  it('player can have multiple decks tracked in DB', () => {
    const countBefore = (db.prepare('SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?').get(playerId) as any).cnt;
    db.prepare('INSERT INTO decks (player_id, name, card_ids) VALUES (?, ?, ?)').run(playerId, 'Extra', '[]');
    const countAfter = (db.prepare('SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?').get(playerId) as any).cnt;
    expect(countAfter).toBe(countBefore + 1);
  });

  it('deck with invalid cards stored as is_valid=0', () => {
    const badDeck = ['fake_card', ...UNITS_ONLY_DECK_IDS.slice(0, 30)];
    const validation = validateDeck(badDeck);
    const r = db.prepare(
      'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
    ).run(playerId, 'Bad Deck', JSON.stringify(badDeck), validation.valid ? 1 : 0);

    const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(r.lastInsertRowid);
    expect(deck.is_valid).toBe(0);
  });
});
