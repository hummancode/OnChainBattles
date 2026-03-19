// ============================================================
// adminRoutes.ts
// Admin panel REST endpoints: dashboard, player management,
// puzzle CRUD.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAdmin } from './middleware.js';
import { CARD_POOL } from '../validation/CardPool.js';
import { validatePuzzleInput } from '../validation/PuzzleValidator.js';
import { sanitizeText } from '../utils/sanitize.js';
import type { PuzzlePayoutService } from '../game/PuzzlePayoutService.js';

export const adminRouter = Router();

// All routes require admin
adminRouter.use(requireAdmin);

// ─── Dashboard Stats ────────────────────────────────────────

adminRouter.get('/stats', (_req, res) => {
  const db = getDB();
  const players = (db.prepare('SELECT COUNT(*) as c FROM players').get() as any).c;
  const matches = (db.prepare('SELECT COUNT(*) as c FROM match_history').get() as any).c;
  const puzzles = (db.prepare('SELECT COUNT(*) as c FROM puzzles').get() as any).c;
  const solved = (db.prepare('SELECT COUNT(*) as c FROM puzzles WHERE solved = 1').get() as any).c;
  const attempts = (db.prepare('SELECT COUNT(*) as c FROM puzzle_attempts').get() as any).c;

  res.json({ playerCount: players, matchCount: matches, puzzleCount: puzzles, solvedCount: solved, totalAttempts: attempts });
});

// ─── Card Pool ──────────────────────────────────────────────

adminRouter.get('/card-pool', (_req, res) => {
  res.json({ cards: CARD_POOL });
});

// ─── Player Management ──────────────────────────────────────

adminRouter.get('/players', (req, res) => {
  const db = getDB();
  const search = (req.query.search as string ?? '').trim();
  const page = Math.max(0, parseInt(req.query.page as string) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = page * limit;

  let rows;
  if (search) {
    rows = db.prepare(
      `SELECT id, email, wallet_address, display_name, account_tier, auth_provider,
              founding_player, is_admin, banned_at, elo_rating, win_count, loss_count,
              created_at, last_login
       FROM players
       WHERE display_name LIKE ? OR email LIKE ? OR wallet_address LIKE ?
       ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(`%${search}%`, `%${search}%`, `%${search}%`, limit, offset);
  } else {
    rows = db.prepare(
      `SELECT id, email, wallet_address, display_name, account_tier, auth_provider,
              founding_player, is_admin, banned_at, elo_rating, win_count, loss_count,
              created_at, last_login
       FROM players ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(limit, offset);
  }

  const total = search
    ? (db.prepare('SELECT COUNT(*) as c FROM players WHERE display_name LIKE ? OR email LIKE ? OR wallet_address LIKE ?').get(`%${search}%`, `%${search}%`, `%${search}%`) as any).c
    : (db.prepare('SELECT COUNT(*) as c FROM players').get() as any).c;

  res.json({ players: rows, total, page, limit });
});

adminRouter.get('/players/:id', (req, res) => {
  const db = getDB();
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  if (!p) { res.status(404).json({ error: 'Player not found.' }); return; }

  const deckCount = (db.prepare('SELECT COUNT(*) as c FROM decks WHERE player_id = ?').get(req.params.id) as any).c;
  const matchCount = (db.prepare('SELECT COUNT(*) as c FROM match_history WHERE player_a_id = ? OR player_b_id = ?').get(req.params.id, req.params.id) as any).c;
  const attemptCount = (db.prepare('SELECT COUNT(*) as c FROM puzzle_attempts WHERE player_id = ?').get(req.params.id) as any).c;

  res.json({ player: p, deckCount, matchCount, attemptCount });
});

adminRouter.patch('/players/:id', (req, res) => {
  const db = getDB();
  const p = db.prepare('SELECT id FROM players WHERE id = ?').get(req.params.id);
  if (!p) { res.status(404).json({ error: 'Player not found.' }); return; }

  const { accountTier, foundingPlayer, displayName, ban } = req.body ?? {};

  if (accountTier !== undefined && [0, 1, 2].includes(accountTier)) {
    db.prepare('UPDATE players SET account_tier = ? WHERE id = ?').run(accountTier, req.params.id);
  }
  if (foundingPlayer !== undefined) {
    db.prepare('UPDATE players SET founding_player = ? WHERE id = ?').run(foundingPlayer ? 1 : 0, req.params.id);
  }
  if (displayName) {
    const clean = sanitizeText(displayName, 20);
    if (clean.length >= 2) {
      db.prepare('UPDATE players SET display_name = ? WHERE id = ?').run(clean, req.params.id);
    }
  }
  if (ban === true) {
    db.prepare('UPDATE players SET banned_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  } else if (ban === false) {
    db.prepare('UPDATE players SET banned_at = NULL WHERE id = ?').run(req.params.id);
  }

  const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
  res.json({ player: updated });
});

adminRouter.post('/players/:id/admin', (req, res) => {
  const { grant } = req.body ?? {};
  const targetId = parseInt(req.params.id);

  // Cannot revoke own admin
  if (!grant && targetId === req.player!.playerId) {
    res.status(400).json({ error: 'Cannot revoke your own admin access.' });
    return;
  }

  const db = getDB();
  db.prepare('UPDATE players SET is_admin = ? WHERE id = ?').run(grant ? 1 : 0, targetId);
  res.json({ success: true });
});

// ─── Puzzle CRUD ────────────────────────────────────────────

adminRouter.get('/puzzles', (req, res) => {
  const db = getDB();
  const page = Math.max(0, parseInt(req.query.page as string) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

  const puzzles = db.prepare(
    `SELECT p.*, COUNT(a.id) as attempt_count
     FROM puzzles p LEFT JOIN puzzle_attempts a ON a.puzzle_id = p.id
     GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, page * limit);

  const total = (db.prepare('SELECT COUNT(*) as c FROM puzzles').get() as any).c;
  res.json({ puzzles, total, page, limit });
});

adminRouter.post('/puzzles', async (req, res) => {
  const validation = validatePuzzleInput(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: 'Invalid puzzle data.', errors: validation.errors });
    return;
  }

  const { title, description, difficulty, boardSetup, handCards, solution,
          prizeCardId, attemptFee, requiredCards, showRequiredCards,
          prizePoolAvax } = req.body;

  const feeNum = parseFloat(attemptFee) || 0;
  const seedAvax = parseFloat(prizePoolAvax) || 0;
  const wantOnChain = seedAvax > 0 || feeNum > 0;

  const db = getDB();
  const result = db.prepare(
    `INSERT INTO puzzles (title, description, difficulty, board_setup, hand_cards, solution,
      prize_card_id, prize_pool, attempt_fee, required_cards, show_required_cards, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sanitizeText(title, 100),
    description ?? '',
    difficulty ?? 'medium',
    typeof boardSetup === 'string' ? boardSetup : JSON.stringify(boardSetup),
    typeof handCards === 'string' ? handCards : JSON.stringify(handCards),
    typeof solution === 'string' ? solution : JSON.stringify(solution),
    prizeCardId ?? null,
    seedAvax,
    feeNum,
    typeof requiredCards === 'string' ? requiredCards : JSON.stringify(requiredCards ?? []),
    showRequiredCards !== undefined ? (showRequiredCards ? 1 : 0) : 1,
    req.player!.playerId,
  );

  const puzzleDbId = Number(result.lastInsertRowid);

  // Create on-chain if prize pool or attempt fee is set
  let escrowTxHash: string | null = null;
  if (wantOnChain) {
    const puzzlePayout = req.app?.locals?.puzzlePayout as PuzzlePayoutService | undefined;
    if (puzzlePayout?.isEnabled()) {
      const onChainResult = await puzzlePayout.createPuzzle(
        puzzleDbId,
        seedAvax.toString(),
        feeNum.toString(),
      );
      if (onChainResult.success) {
        escrowTxHash = onChainResult.txHash ?? null;
        db.prepare('UPDATE puzzles SET on_chain = 1, escrow_tx_hash = ? WHERE id = ?')
          .run(escrowTxHash, puzzleDbId);
      } else {
        console.warn(`[Admin] On-chain puzzle creation failed: ${onChainResult.error}`);
      }
    }
  }

  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(puzzleDbId);
  res.status(201).json({ puzzle, escrowTxHash });
});

adminRouter.get('/puzzles/:id', (req, res) => {
  const db = getDB();
  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id);
  if (!puzzle) { res.status(404).json({ error: 'Puzzle not found.' }); return; }

  const attempts = (db.prepare('SELECT COUNT(*) as c FROM puzzle_attempts WHERE puzzle_id = ?').get(req.params.id) as any).c;
  res.json({ puzzle, attemptCount: attempts });
});

adminRouter.put('/puzzles/:id', (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) { res.status(404).json({ error: 'Puzzle not found.' }); return; }
  if (existing.solved) { res.status(400).json({ error: 'Cannot edit a solved puzzle.' }); return; }

  const validation = validatePuzzleInput(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: 'Invalid puzzle data.', errors: validation.errors });
    return;
  }

  const { title, description, difficulty, boardSetup, handCards, solution,
          prizeCardId, attemptFee, requiredCards, showRequiredCards } = req.body;

  db.prepare(
    `UPDATE puzzles SET title=?, description=?, difficulty=?, board_setup=?, hand_cards=?,
      solution=?, prize_card_id=?, attempt_fee=?, required_cards=?, show_required_cards=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(
    sanitizeText(title, 100),
    description ?? '',
    difficulty ?? 'medium',
    typeof boardSetup === 'string' ? boardSetup : JSON.stringify(boardSetup),
    typeof handCards === 'string' ? handCards : JSON.stringify(handCards),
    typeof solution === 'string' ? solution : JSON.stringify(solution),
    prizeCardId ?? null,
    parseFloat(attemptFee) || 0,
    typeof requiredCards === 'string' ? requiredCards : JSON.stringify(requiredCards ?? []),
    showRequiredCards !== undefined ? (showRequiredCards ? 1 : 0) : 1,
    req.params.id,
  );

  const updated = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id);
  res.json({ puzzle: updated });
});

adminRouter.delete('/puzzles/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM puzzle_attempts WHERE puzzle_id = ?').run(req.params.id);
  const r = db.prepare('DELETE FROM puzzles WHERE id = ?').run(req.params.id);
  res.json({ success: r.changes > 0 });
});

adminRouter.post('/puzzles/:id/publish', (req, res) => {
  const { published } = req.body ?? {};
  const db = getDB();
  db.prepare('UPDATE puzzles SET published = ? WHERE id = ?').run(published ? 1 : 0, req.params.id);
  res.json({ success: true, published: !!published });
});

// Close an on-chain puzzle — refunds remaining prize pool to owner
adminRouter.post('/puzzles/:id/close', async (req, res) => {
  const db = getDB();
  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!puzzle) { res.status(404).json({ error: 'Puzzle not found.' }); return; }
  if (puzzle.solved) { res.status(400).json({ error: 'Cannot close a solved puzzle.' }); return; }

  // Close on-chain if applicable
  let closeTxHash: string | null = null;
  if (puzzle.on_chain) {
    const puzzlePayout = req.app?.locals?.puzzlePayout as PuzzlePayoutService | undefined;
    if (puzzlePayout?.isEnabled()) {
      const result = await puzzlePayout.closePuzzle(Number(req.params.id));
      if (result.success) {
        closeTxHash = result.txHash ?? null;
      } else {
        res.status(500).json({ error: `On-chain close failed: ${result.error}` });
        return;
      }
    }
  }

  db.prepare('UPDATE puzzles SET published = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true, closeTxHash });
});
