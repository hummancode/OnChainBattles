// ============================================================
// collectionHelpers.ts
// Card collection initialization for new players.
// MVP: all cards unlocked at max copies.
// ============================================================

import { getDB } from '../db/database.js';
import { CARD_POOL } from '../validation/CardPool.js';

/** Grant a new player all cards at max copies. */
export function initializeCollection(playerId: number): void {
  const db = getDB();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, ?)'
  );

  const batch = db.transaction(() => {
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue;
      insert.run(playerId, card.id, card.copies);
    }
  });

  batch();
  console.log(`[Collection] Initialized for player #${playerId}`);
}

/**
 * Grant one more copy of a card (puzzle prizes). Returns false for unknown cards.
 * owned_copies can exceed the deck-building copy limit — it records ownership
 * (future NFT support), DeckValidator still enforces per-deck limits.
 */
export function awardCard(playerId: number, cardId: string): boolean {
  if (!CARD_POOL.some(c => c.id === cardId) || cardId === 'king') return false;
  getDB().prepare(`
    INSERT INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, 1)
    ON CONFLICT(player_id, card_id) DO UPDATE SET owned_copies = owned_copies + 1
  `).run(playerId, cardId);
  console.log(`[Collection] Awarded ${cardId} to player #${playerId}`);
  return true;
}

/** cardId → owned copies (deck validation enforces ownership for logged-in players). */
export function getOwnedCards(playerId: number): Map<string, number> {
  const rows = getDB().prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(playerId) as Array<{ card_id: string; owned_copies: number }>;
  return new Map(rows.map(r => [r.card_id, r.owned_copies]));
}
