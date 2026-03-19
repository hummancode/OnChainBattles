// ============================================================
// puzzleRoutes.ts
// Public puzzle endpoints: list, detail, attempt.
// Anyone can view; wallet required for paid attempt submissions.
// ============================================================

import { Router } from 'express';
import { verifyMessage } from 'ethers';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { normalizePlacement } from '../validation/PuzzleValidator.js';
import type { PuzzlePayoutService } from '../game/PuzzlePayoutService.js';

export const puzzleRouter = Router();

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Get PuzzlePayoutService from app.locals (set in app.ts). */
function getPuzzlePayout(req: any): PuzzlePayoutService | null {
  return req.app?.locals?.puzzlePayout ?? null;
}

// GET /api/puzzles — list published puzzles (no solution!)
puzzleRouter.get('/', (_req, res) => {
  const db = getDB();
  const puzzles = db.prepare(
    `SELECT id, title, description, difficulty, board_setup, hand_cards,
            prize_card_id, prize_pool, attempt_fee, required_cards, show_required_cards,
            on_chain, published, solved, solved_by_id, solved_at, created_at
     FROM puzzles WHERE published = 1 ORDER BY created_at DESC`
  ).all();

  res.json({
    puzzles: puzzles.map((p: any) => {
      const handCards = JSON.parse(p.hand_cards || '[]');
      const showRequired = !!p.show_required_cards;
      return {
        ...p,
        boardSetup: JSON.parse(p.board_setup || '{}'),
        handCards: showRequired ? handCards : [],
        hasRequiredCards: handCards.length > 0,
        showRequiredCards: showRequired,
      };
    }),
  });
});

// GET /api/puzzles/:id/solution — view solution of a solved puzzle
// IMPORTANT: must be before /:id so Express doesn't match "solution" as an id
puzzleRouter.get('/:id/solution', (req, res) => {
  const db = getDB();
  const p = db.prepare(
    'SELECT id, title, description, difficulty, board_setup, hand_cards, solution, solved, solved_by_id, solved_at FROM puzzles WHERE id = ? AND published = 1'
  ).get(req.params.id) as Record<string, unknown> | undefined;

  if (!p) { res.status(404).json({ error: 'Puzzle not found.' }); return; }
  if (!p.solved) { res.status(403).json({ error: 'Puzzle has not been solved yet.' }); return; }

  let solverName: string | null = null;
  if (p.solved_by_id) {
    const solver = db.prepare('SELECT display_name FROM players WHERE id = ?').get(p.solved_by_id) as Record<string, unknown> | undefined;
    solverName = (solver?.display_name as string) ?? null;
  }

  res.json({
    puzzle: {
      id: p.id,
      title: p.title,
      description: p.description,
      difficulty: p.difficulty,
      boardSetup: JSON.parse((p.board_setup as string) || '{}'),
      handCards: JSON.parse((p.hand_cards as string) || '[]'),
      solution: JSON.parse((p.solution as string) || '[]'),
      solvedBy: solverName,
      solvedAt: p.solved_at,
    },
  });
});

// GET /api/puzzles/:id — single puzzle detail (no solution!)
puzzleRouter.get('/:id', (req, res) => {
  const db = getDB();
  const p = db.prepare(
    `SELECT id, title, description, difficulty, board_setup, hand_cards,
            prize_card_id, prize_pool, attempt_fee, required_cards, show_required_cards,
            on_chain, published, solved, solved_by_id, solved_at, created_at
     FROM puzzles WHERE id = ? AND published = 1`
  ).get(req.params.id) as Record<string, unknown> | undefined;

  if (!p) { res.status(404).json({ error: 'Puzzle not found.' }); return; }

  const totalAttempts = (db.prepare('SELECT COUNT(*) as c FROM puzzle_attempts WHERE puzzle_id = ?').get(req.params.id) as any).c;

  const handCards = JSON.parse((p.hand_cards as string) || '[]');
  const showRequired = !!p.show_required_cards;
  res.json({
    puzzle: {
      ...p,
      boardSetup: JSON.parse((p.board_setup as string) || '{}'),
      handCards: showRequired ? handCards : [],
      hasRequiredCards: handCards.length > 0,
      showRequiredCards: showRequired,
    },
    totalAttempts,
  });
});

// POST /api/puzzles/:id/attempt — submit solution attempt
// Wallet + on-chain tx required for paid puzzles; free puzzles just need auth.
puzzleRouter.post('/:id/attempt', requireAuth, async (req, res) => {
  const db = getDB();
  const playerId = req.player!.playerId;

  // Load puzzle
  const puzzle = db.prepare('SELECT * FROM puzzles WHERE id = ? AND published = 1').get(req.params.id) as Record<string, unknown> | undefined;
  if (!puzzle) { res.status(404).json({ error: 'Puzzle not found.' }); return; }
  if (puzzle.solved) { res.status(400).json({ error: 'Puzzle already solved.' }); return; }

  const attemptFee = Number(puzzle.attempt_fee) || 0;
  const isOnChain = !!puzzle.on_chain;
  const isPaid = isOnChain && attemptFee > 0;

  const { placement, txHash, signature, walletAddress } = req.body ?? {};

  // All puzzle attempts require a wallet signature
  if (!signature || !walletAddress) {
    res.status(400).json({ error: 'Wallet signature required to submit solutions.' });
    return;
  }

  // Verify wallet signature
  const expectedMessage = `Puzzle attempt: puzzle #${req.params.id} by ${walletAddress}`;
  try {
    const recovered = verifyMessage(expectedMessage, signature);
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      res.status(403).json({ error: 'Invalid wallet signature.' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Invalid wallet signature.' });
    return;
  }

  // Paid puzzles additionally require on-chain tx hash
  if (isPaid) {
    if (!txHash || typeof txHash !== 'string') {
      res.status(400).json({ error: 'Wallet transaction required for paid puzzles.' });
      return;
    }
  }

  // Check cooldown
  const lastAttempt = db.prepare(
    'SELECT attempted_at FROM puzzle_attempts WHERE puzzle_id = ? AND player_id = ? ORDER BY attempted_at DESC LIMIT 1'
  ).get(req.params.id, playerId) as Record<string, unknown> | undefined;

  if (lastAttempt) {
    const lastTime = new Date(lastAttempt.attempted_at as string).getTime();
    const retryAt = lastTime + COOLDOWN_MS;
    if (Date.now() < retryAt) {
      res.status(429).json({
        error: 'Cooldown active. Try again later.',
        retryAfter: new Date(retryAt).toISOString(),
      });
      return;
    }
  }

  // Validate placement
  if (!Array.isArray(placement)) {
    res.status(400).json({ error: 'placement must be an array of {cardId, col, row}.' });
    return;
  }

  // Compare with solution
  const solution = JSON.parse(puzzle.solution as string);
  const correct = normalizePlacement(placement) === normalizePlacement(solution);

  // Use the verified wallet address from signature (not DB — this is the wallet that signed)
  // Record attempt with wallet and optional tx hash
  db.prepare(
    'INSERT INTO puzzle_attempts (puzzle_id, player_id, placement, correct, tx_hash, wallet_address) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, playerId, JSON.stringify(placement), correct ? 1 : 0, txHash ?? null, walletAddress);

  if (correct) {
    // Mark puzzle as solved
    db.prepare(
      'UPDATE puzzles SET solved = 1, solved_by_id = ?, solved_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(playerId, req.params.id);

    // On-chain payout if puzzle is on-chain and solver has a wallet
    let payoutTxHash: string | undefined;
    if (isOnChain && walletAddress) {
      const puzzlePayout = getPuzzlePayout(req);
      if (puzzlePayout?.isEnabled()) {
        const puzzleDbId = Number(req.params.id);
        const result = await puzzlePayout.claimPrize(puzzleDbId, walletAddress);
        if (result.success) {
          payoutTxHash = result.txHash;
          console.log(`[Puzzle] Prize claimed on-chain for puzzle #${puzzleDbId}, tx: ${payoutTxHash}`);
        } else {
          console.error(`[Puzzle] On-chain payout failed for puzzle #${puzzleDbId}: ${result.error}`);
        }
      }
    }

    // TODO: Award prize card to player's collection (future NFT support)

    res.json({
      correct: true,
      message: 'Congratulations! You solved the puzzle!',
      prizeCardId: puzzle.prize_card_id,
      payoutTxHash,
    });
  } else {
    res.json({
      correct: false,
      message: 'Incorrect placement. Try again after 24 hours.',
    });
  }
});
