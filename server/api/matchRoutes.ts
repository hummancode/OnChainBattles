// ============================================================
// matchRoutes.ts
// Match history query for authenticated players.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';

export const matchRouter = Router();

// GET /api/matches?limit=20&offset=0
matchRouter.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const pid = req.player!.playerId;
  const db = getDB();

  const rows = db.prepare(`
    SELECT * FROM match_history
    WHERE player_a_id = ? OR player_b_id = ?
    ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(pid, pid, limit, offset);

  res.json({ matches: rows });
});
