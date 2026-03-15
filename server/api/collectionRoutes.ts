// ============================================================
// collectionRoutes.ts
// Card collection query for authenticated players.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { CARD_POOL } from '../validation/CardPool.js';

export const collectionRouter = Router();

// GET /api/collection
collectionRouter.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(req.player!.playerId) as Array<{ card_id: string; owned_copies: number }>;

  const collection = CARD_POOL
    .filter(c => c.id !== 'king')
    .map(card => {
      const owned = rows.find(r => r.card_id === card.id);
      return {
        id: card.id, name: card.name,
        maxCopies: card.copies, ownedCopies: owned?.owned_copies ?? 0,
      };
    });

  res.json({ collection });
});
