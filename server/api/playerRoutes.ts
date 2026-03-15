// ============================================================
// playerRoutes.ts
// Player profile: read + update display name.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { sanitizeText } from '../utils/sanitize.js';

export const playerRouter = Router();

// GET /api/player/me
playerRouter.get('/me', requireAuth, (req, res) => {
  const db = getDB();
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown> | undefined;
  if (!p) {
    res.status(404).json({ error: 'Player not found.' });
    return;
  }

  res.json({
    id: p.id,
    wallet: p.wallet_address,
    displayName: p.display_name,
    winCount: p.win_count,
    lossCount: p.loss_count,
    eloRating: p.elo_rating,
    activeDeckId: p.active_deck_id,
    createdAt: p.created_at,
  });
});

// PATCH /api/player/me  { displayName }
playerRouter.patch('/me', requireAuth, (req, res) => {
  const { displayName } = req.body ?? {};
  const db = getDB();

  const clean = sanitizeText(displayName, 20);
  if (clean.length >= 2) {
    db.prepare('UPDATE players SET display_name = ? WHERE id = ?')
      .run(clean, req.player!.playerId);
  }

  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown>;
  res.json({ id: p.id, displayName: p.display_name });
});
