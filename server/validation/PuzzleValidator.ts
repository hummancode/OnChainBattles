// ============================================================
// PuzzleValidator.ts
// Validates puzzle board setup, hand cards, and solution.
// ============================================================

import { getCardFromPool } from './CardPool.js';

interface Placement { cardId: string; col: number; row: number }
interface BoardSetup { blockedSquares: number[][]; preplacedCards: Placement[] }

export function validatePuzzleInput(body: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Title
  const title = body.title;
  if (typeof title !== 'string' || title.trim().length === 0) errors.push('Title is required.');
  if (typeof title === 'string' && title.length > 100) errors.push('Title max 100 chars.');

  // Difficulty
  const diff = body.difficulty;
  if (!['easy', 'medium', 'hard', 'legendary'].includes(diff as string)) {
    errors.push('Difficulty must be easy/medium/hard/legendary.');
  }

  // Board setup
  let boardSetup: BoardSetup = { blockedSquares: [], preplacedCards: [] };
  try {
    boardSetup = typeof body.boardSetup === 'string' ? JSON.parse(body.boardSetup) : body.boardSetup as BoardSetup;
  } catch { errors.push('Invalid boardSetup JSON.'); }

  if (boardSetup) {
    const bs = boardSetup.blockedSquares ?? [];
    for (const sq of bs) {
      if (!Array.isArray(sq) || sq.length !== 2 || sq[0] < 0 || sq[0] > 6 || sq[1] < 0 || sq[1] > 6) {
        errors.push(`Invalid blocked square: [${sq}]`);
      }
    }
    const pp = boardSetup.preplacedCards ?? [];
    for (const p of pp) {
      if (!getCardFromPool(p.cardId)) errors.push(`Unknown pre-placed card: ${p.cardId}`);
      if (p.col < 0 || p.col > 6 || p.row < 0 || p.row > 6) errors.push(`Pre-placed card out of bounds: ${p.col},${p.row}`);
    }
  }

  // Hand cards
  let handCards: string[] = [];
  try {
    handCards = typeof body.handCards === 'string' ? JSON.parse(body.handCards) : body.handCards as string[];
  } catch { errors.push('Invalid handCards JSON.'); }

  if (Array.isArray(handCards)) {
    for (const id of handCards) {
      if (!getCardFromPool(id)) errors.push(`Unknown hand card: ${id}`);
    }
  }

  // Solution
  let solution: Placement[] = [];
  try {
    solution = typeof body.solution === 'string' ? JSON.parse(body.solution) : body.solution as Placement[];
  } catch { errors.push('Invalid solution JSON.'); }

  if (Array.isArray(solution) && boardSetup) {
    const blockedSet = new Set((boardSetup.blockedSquares ?? []).map(s => `${s[0]},${s[1]}`));
    const preplacedSet = new Set((boardSetup.preplacedCards ?? []).map(p => `${p.col},${p.row}`));
    const usedPositions = new Set<string>();

    for (const p of solution) {
      if (p.col < 0 || p.col > 6 || p.row < 0 || p.row > 6) {
        errors.push(`Solution placement out of bounds: ${p.col},${p.row}`);
      }
      const key = `${p.col},${p.row}`;
      if (blockedSet.has(key)) errors.push(`Solution placed on blocked square: ${key}`);
      if (preplacedSet.has(key)) errors.push(`Solution placed on pre-placed card square: ${key}`);
      if (usedPositions.has(key)) errors.push(`Duplicate solution position: ${key}`);
      usedPositions.add(key);
    }
  }

  // Prize card
  if (body.prizeCardId && typeof body.prizeCardId === 'string') {
    if (!getCardFromPool(body.prizeCardId)) errors.push(`Unknown prize card: ${body.prizeCardId}`);
  }

  return { valid: errors.length === 0, errors };
}

/** Normalize a placement array for comparison (sorted JSON string). */
export function normalizePlacement(arr: Placement[]): string {
  return JSON.stringify(
    arr.map(p => ({ cardId: p.cardId, col: p.col, row: p.row }))
      .sort((a, b) => a.col - b.col || a.row - b.row || a.cardId.localeCompare(b.cardId))
  );
}
