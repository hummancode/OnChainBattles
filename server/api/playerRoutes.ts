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
    wallet: p.wallet_address ?? null,
    email: p.email ?? null,
    displayName: p.display_name,
    winCount: p.win_count,
    lossCount: p.loss_count,
    eloRating: p.elo_rating,
    activeDeckId: p.active_deck_id,
    accountTier: p.account_tier ?? 1,
    authProvider: p.auth_provider ?? 'wallet',
    createdAt: p.created_at,
  });
});

// GET /api/player/profile — aggregated profile data
playerRouter.get('/profile', requireAuth, (req, res) => {
  const db = getDB();
  const pid = req.player!.playerId;

  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(pid) as Record<string, unknown> | undefined;
  if (!p) { res.status(404).json({ error: 'Player not found.' }); return; }

  // Match history (last 20) with opponent name
  const matches = db.prepare(
    `SELECT mh.id, mh.room_code, mh.winner_id, mh.total_turns, mh.stake_amount, mh.started_at,
            mh.player_a_id, mh.player_b_id,
            CASE WHEN mh.player_a_id = ? THEN pb.display_name ELSE pa.display_name END as opponent_name,
            CASE WHEN mh.player_a_id = ? THEN mh.player_b_id ELSE mh.player_a_id END as opponent_id
     FROM match_history mh
     LEFT JOIN players pa ON mh.player_a_id = pa.id
     LEFT JOIN players pb ON mh.player_b_id = pb.id
     WHERE mh.player_a_id = ? OR mh.player_b_id = ?
     ORDER BY mh.started_at DESC LIMIT 20`
  ).all(pid, pid, pid, pid) as any[];

  // Puzzle stats
  const puzzleStats = db.prepare(
    `SELECT COUNT(*) as total_attempts,
            COUNT(DISTINCT CASE WHEN correct = 1 THEN puzzle_id END) as puzzles_solved
     FROM puzzle_attempts WHERE player_id = ?`
  ).get(pid) as any;

  // Active deck
  let activeDeck: any = null;
  if (p.active_deck_id) {
    const deck = db.prepare('SELECT id, name, card_ids FROM decks WHERE id = ? AND player_id = ?').get(p.active_deck_id, pid) as any;
    if (deck) {
      activeDeck = { id: deck.id, name: deck.name, cardIds: JSON.parse(deck.card_ids || '[]') };
    }
  }

  // Collection stats
  const collStats = db.prepare(
    'SELECT COUNT(*) as total_owned FROM collections WHERE player_id = ? AND owned_copies > 0'
  ).get(pid) as any;

  res.json({
    player: {
      id: p.id,
      displayName: p.display_name,
      email: p.email ?? null,
      wallet: p.wallet_address ?? null,
      accountTier: p.account_tier ?? 1,
      authProvider: p.auth_provider ?? 'wallet',
      eloRating: p.elo_rating ?? 1000,
      winCount: p.win_count ?? 0,
      lossCount: p.loss_count ?? 0,
      foundingPlayer: !!p.founding_player,
      createdAt: p.created_at,
    },
    matchHistory: matches.map((m: any) => ({
      id: m.id,
      roomCode: m.room_code,
      opponentName: m.opponent_name ?? 'Unknown',
      opponentId: m.opponent_id,
      won: m.winner_id === pid,
      totalTurns: m.total_turns,
      stakeAmount: m.stake_amount,
      startedAt: m.started_at,
    })),
    puzzleStats: {
      totalAttempts: puzzleStats.total_attempts ?? 0,
      puzzlesSolved: puzzleStats.puzzles_solved ?? 0,
    },
    activeDeck,
    collectionStats: {
      totalOwned: collStats.total_owned ?? 0,
    },
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
