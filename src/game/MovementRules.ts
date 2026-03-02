// ============================================================
// MovementRules.ts
// Pure functions — no mutation, no imports of engine classes.
// Returns valid squares for movement and attack.
// Called by GameEngine to validate player actions and by
// SelectionManager (via IGameEngineAPI) for UI highlights.
// ============================================================

import { MovementType, AtkPattern, CardFlag } from './types/CardTypes';
import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';

// ─────────────────────────────────────────────
// MOVEMENT
// ─────────────────────────────────────────────

/**
 * Returns all squares a unit can legally move to this turn.
 * Respects: movement type, occupied squares, board bounds,
 * hasMoved flag, isActive (BUILD_DELAY), Village slow.
 */
export function getValidMoves(unit: Unit, board: Board): Position[] {
  if (unit.hasMoved || unit.hasActed || !unit.isActive || unit.isExhausted) return [];

  const movDist = unit.currentMovement;
  if (movDist <= 0) return []; // Village-slowed to 0 = immobilized

  const { col, row } = unit.position;
  const results: Position[] = [];

  switch (unit.baseMovementType) {
    case MovementType.STATIC:
      return []; // Structures never move

    case MovementType.OMNI_1:
    case MovementType.OMNI_2:
    case MovementType.OMNI_3:
      return getOmniMoves(col, row, movDist, board, unit.owner);

    case MovementType.VERTICAL_2:
      return getVerticalMoves(col, row, movDist, unit.owner, board);

    case MovementType.JUMP_DIAGONAL_1:
      return getDiagonalJumpTargets(col, row, unit.owner, board);

    case MovementType.FWD_VERTICAL_1:
      return getForwardVerticalMove(col, row, unit.owner, board);

    default:
      return [];
  }
}

/**
 * Returns all squares a unit can legally attack this turn.
 * Respects: attack pattern, hasActed flag, TAUNT_ROW filter.
 * Lancer: can attack even if it moved this turn (LANCER_CHARGE handled by caller).
 */
export function getValidAttacks(unit: Unit, board: Board): Position[] {
  // Unit must not have already attacked (hasActed)
  // Lancer exception: can move first, then attack (checked by GameEngine)
  if (unit.hasActed || !unit.isActive || unit.isExhausted) return [];
  if (unit.baseAtkPattern === AtkPattern.NONE) return [];

  const { col, row } = unit.position;
  let targets: Position[] = [];

  switch (unit.baseAtkPattern) {
    case AtkPattern.HV:
      targets = getHVAdjacent(col, row, board, unit.owner, true);
      break;

    case AtkPattern.OMNI:
      targets = getOmniAdjacent(col, row, board, unit.owner, true);
      break;

    case AtkPattern.DIAGONAL_RANGED_2:
      targets = getDiagonalRanged(col, row, 2, board, unit.owner);
      break;

    case AtkPattern.ON_JUMP:
      // Assassin: attack = the jump destination (same as movement targets)
      return []; // Handled as part of the jump move in GameEngine

    case AtkPattern.AREA_ADJ:
      // Castle: attacks all adjacent enemies simultaneously — handled in LEG phase
      targets = getOmniAdjacent(col, row, board, unit.owner, true);
      break;

    case AtkPattern.STRAIGHT_RANGED_3:
      targets = getStraightRanged(col, row, 3, board, unit.owner);
      break;

    case AtkPattern.FWD_VERTICAL:
      targets = getForwardVertical(col, row, unit.owner, board, true);
      break;

    default:
      return [];
  }

  // TAUNT_ROW filter: if any adjacent enemy has TAUNT_ROW flag,
  // must attack that unit instead (future expansion hook)
  return targets;
}

/**
 * Returns valid deploy squares for a card being played.
 * Unit: must be placed in own half on a free square.
 * Structure: same. Spell: no position needed (return empty).
 */
export function getValidDeploySquares(player: Player, board: Board): Position[] {
  return board.getFreeSquaresInHalf(player);
}

// ─────────────────────────────────────────────
// MOVEMENT HELPERS
// ─────────────────────────────────────────────

/** Omni movement up to maxDist squares. BFS — stops at friendly, passes through nothing. */
function getOmniMoves(
  col: number, row: number,
  maxDist: number,
  board: Board,
  owner: Player
): Position[] {
  const visited = new Set<string>();
  const result: Position[] = [];
  const queue: Array<{ col: number; row: number; dist: number }> = [
    { col, row, dist: 0 }
  ];
  visited.add(`${col},${row}`);

  const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.dist >= maxDist) continue;

    for (const [dc, dr] of dirs) {
      const nc = curr.col + dc;
      const nr = curr.row + dr;
      const key = `${nc},${nr}`;

      if (!board.isInBounds(nc, nr) || visited.has(key)) continue;
      visited.add(key);

      const occupant = board.getUnit(nc, nr);
      if (occupant === null) {
        result.push({ col: nc, row: nr });
        queue.push({ col: nc, row: nr, dist: curr.dist + 1 });
      }
      // Friendly or enemy: blocked — don't expand further in that direction
    }
  }

  return result;
}

/** Vertical movement (forward and backward along column). */
function getVerticalMoves(
  col: number, row: number,
  maxDist: number,
  owner: Player,
  board: Board
): Position[] {
  const result: Position[] = [];
  const dirs = [-1, 1]; // up and down
  for (const dr of dirs) {
    for (let d = 1; d <= maxDist; d++) {
      const nr = row + dr * d;
      if (!board.isInBounds(col, nr)) break;
      const occupant = board.getUnit(col, nr);
      if (occupant === null) {
        result.push({ col, row: nr });
      } else {
        break; // Blocked
      }
    }
  }
  return result;
}

/** Assassin: diagonal jump squares (ignores path occupants). */
function getDiagonalJumpTargets(
  col: number, row: number,
  owner: Player,
  board: Board
): Position[] {
  const dirs = [[-1,-1],[1,-1],[-1,1],[1,1]];
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc, nr = row + dr;
    if (!board.isInBounds(nc, nr)) continue;
    const occupant = board.getUnit(nc, nr);
    // Can jump to empty squares OR enemy squares (land and attack)
    if (occupant === null || occupant.owner !== owner) {
      result.push({ col: nc, row: nr });
    }
  }
  return result;
}

/** Forward vertical 1 (future: Vanguard). */
function getForwardVerticalMove(
  col: number, row: number,
  owner: Player,
  board: Board
): Position[] {
  const dr = owner === Player.P1 ? 1 : -1; // P1 moves down (toward P2 half)
  const nr = row + dr;
  if (!board.isInBounds(col, nr)) return [];
  if (board.getUnit(col, nr) !== null) return [];
  return [{ col, row: nr }];
}

// ─────────────────────────────────────────────
// ATTACK HELPERS
// ─────────────────────────────────────────────

function getHVAdjacent(
  col: number, row: number,
  board: Board,
  owner: Player,
  enemiesOnly: boolean
): Position[] {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  return getSquaresInDirs(col, row, dirs, board, owner, enemiesOnly);
}

function getOmniAdjacent(
  col: number, row: number,
  board: Board,
  owner: Player,
  enemiesOnly: boolean
): Position[] {
  const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  return getSquaresInDirs(col, row, dirs, board, owner, enemiesOnly);
}

function getSquaresInDirs(
  col: number, row: number,
  dirs: number[][],
  board: Board,
  owner: Player,
  enemiesOnly: boolean
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc, nr = row + dr;
    if (!board.isInBounds(nc, nr)) continue;
    const u = board.getUnit(nc, nr);
    if (u !== null && (!enemiesOnly || u.owner !== owner)) {
      result.push({ col: nc, row: nr });
    }
  }
  return result;
}

/**
 * Diagonal ranged attack up to maxRange squares.
 * Can attack through empty squares (ranged) but not through occupied ones.
 */
function getDiagonalRanged(
  col: number, row: number,
  maxRange: number,
  board: Board,
  owner: Player
): Position[] {
  const dirs = [[-1,-1],[1,-1],[-1,1],[1,1]];
  const result: Position[] = [];

  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxRange; d++) {
      const nc = col + dc * d;
      const nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      const u = board.getUnit(nc, nr);
      if (u !== null) {
        if (u.owner !== owner) result.push({ col: nc, row: nr });
        break; // Blocked by any unit (friendly or enemy)
      }
    }
  }

  return result;
}

/**
 * Straight (HV) ranged attack up to maxRange squares.
 * Future: Siege Tower.
 */
function getStraightRanged(
  col: number, row: number,
  maxRange: number,
  board: Board,
  owner: Player
): Position[] {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  const result: Position[] = [];

  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxRange; d++) {
      const nc = col + dc * d;
      const nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      const u = board.getUnit(nc, nr);
      if (u !== null) {
        if (u.owner !== owner) result.push({ col: nc, row: nr });
        break;
      }
    }
  }

  return result;
}

function getForwardVertical(
  col: number, row: number,
  owner: Player,
  board: Board,
  enemiesOnly: boolean
): Position[] {
  const dr = owner === Player.P1 ? 1 : -1;
  const nr = row + dr;
  if (!board.isInBounds(col, nr)) return [];
  const u = board.getUnit(col, nr);
  if (u && (!enemiesOnly || u.owner !== owner)) return [{ col, row: nr }];
  return [];
}

// ─────────────────────────────────────────────
// VALIDATION HELPERS (used by GameEngine)
// ─────────────────────────────────────────────

/** Check if a specific move is legal. */
export function isMoveValid(unit: Unit, toCol: number, toRow: number, board: Board): boolean {
  return getValidMoves(unit, board).some(p => p.col === toCol && p.row === toRow);
}

/** Check if a specific attack is legal. */
export function isAttackValid(unit: Unit, targetCol: number, targetRow: number, board: Board): boolean {
  return getValidAttacks(unit, board).some(p => p.col === targetCol && p.row === targetRow);
}

/** Lancer forward charge check: move must be toward enemy half. */
export function isLancerForwardMove(unit: Unit, toRow: number): boolean {
  const dr = unit.owner === Player.P1 ? 1 : -1;
  return (toRow - unit.position.row) * dr > 0;
}
