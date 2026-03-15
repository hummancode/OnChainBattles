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
