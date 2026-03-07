// ============================================================
// MovementRules.ts
// Pure functions — no mutation, no imports of engine classes.
// Returns valid squares for movement and attack.
// Called by GameEngine to validate player actions and by
// SelectionManager (via IGameEngineAPI) for UI highlights.
//
// HYBRID PATTERN SYSTEM:
//   - Cards can use enum-based presets (MovementType, AtkPattern)
//   - Cards can also define customMove / customAttack overrides
//   - Custom patterns are checked FIRST; if absent, enum logic runs
//   - This allows new movement/attack shapes without new switch cases
// ============================================================

import { MovementType, AtkPattern, CardFlag } from './types/CardTypes';
import type { CustomPattern, PatternOffset } from './types/CardTypes';
import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import { getCard } from './data/CardDefinitions';

// ═══════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════

/**
 * Returns all squares a unit can legally move to this turn.
 * Checks customMove first, then falls back to enum-based movement.
 */
export function getValidMoves(unit: Unit, board: Board): Position[] {
  if (unit.hasMoved || unit.hasActed || !unit.isActive || unit.isExhausted) return [];

  const movDist = unit.currentMovement;
  if (movDist <= 0) return [];

  const def = getCard(unit.cardId);

  // ── Custom pattern override ──
  if (def.stats?.customMove) {
    return resolveCustomPattern(unit, def.stats.customMove, board, false);
  }

  // ── Enum-based fallback ──
  const { col, row } = unit.position;

  switch (unit.baseMovementType) {
    case MovementType.STATIC:
      return [];

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
 * Checks customAttack first, then falls back to enum-based attacks.
 */
export function getValidAttacks(unit: Unit, board: Board): Position[] {
  if (unit.hasActed || !unit.isActive || unit.isExhausted) return [];

  const def = getCard(unit.cardId);

  // ── Custom pattern override ──
  if (def.stats?.customAttack) {
    return resolveCustomPattern(unit, def.stats.customAttack, board, true);
  }

  // ── Enum-based fallback ──
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
      // Assassin: attack = the jump destination (handled as part of jump move)
      return [];

    case AtkPattern.AREA_ADJ:
      // Castle: attacks all adjacent enemies simultaneously (also used in LEG phase)
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
 * Returns ALL squares in a unit's attack range — occupied or empty.
 * Used for UI only (shows threat zone). Not used for action validation.
 */
export function getAttackRange(unit: Unit, board: Board): Position[] {
  if (!unit.isActive || unit.isExhausted) return [];

  const def = getCard(unit.cardId);

  // Custom pattern override
  if (def.stats?.customAttack) {
    return resolvePatternRange(unit, def.stats.customAttack, board);
  }

  if (unit.baseAtkPattern === AtkPattern.NONE) return [];

  const { col, row } = unit.position;

  switch (unit.baseAtkPattern) {
    case AtkPattern.HV:
      return getAdjacentRange(col, row, [[0,-1],[0,1],[-1,0],[1,0]], board);
    case AtkPattern.OMNI:
    case AtkPattern.AREA_ADJ:
      return getAdjacentRange(col, row, [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]], board);
    case AtkPattern.DIAGONAL_RANGED_2:
      return getRangedRange(col, row, [[-1,-1],[1,-1],[-1,1],[1,1]], 2, board);
    case AtkPattern.STRAIGHT_RANGED_3:
      return getRangedRange(col, row, [[0,-1],[0,1],[-1,0],[1,0]], 3, board);
    case AtkPattern.ON_JUMP:
      return [];
    case AtkPattern.FWD_VERTICAL: {
      const dr = unit.owner === Player.P1 ? 1 : -1;
      const nr = row + dr;
      if (board.isInBounds(col, nr)) return [{ col, row: nr }];
      return [];
    }
    default:
      return [];
  }
}

/** All adjacent squares in given directions (range 1, ignores occupancy). */
function getAdjacentRange(
  col: number, row: number,
  dirs: number[][],
  board: Board
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc, nr = row + dr;
    if (board.isInBounds(nc, nr)) result.push({ col: nc, row: nr });
  }
  return result;
}

/** Ranged squares up to maxRange — stops at any unit but includes that square. */
function getRangedRange(
  col: number, row: number,
  dirs: number[][],
  maxRange: number,
  board: Board
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxRange; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      result.push({ col: nc, row: nr });
      if (board.getUnit(nc, nr) !== null) break; // blocked but included
    }
  }
  return result;
}

/** Custom pattern range — all reachable squares regardless of occupancy. */
function resolvePatternRange(
  unit: Unit,
  pattern: CustomPattern,
  board: Board
): Position[] {
  const results: Position[] = [];
  const range = pattern.range ?? 1;
  const canJump = pattern.canJump ?? false;
  const { col, row } = unit.position;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const nc = col + offset.dx * step;
      const nr = row + offset.dy * step;
      if (!board.isInBounds(nc, nr)) break;
      results.push({ col: nc, row: nr });
      const occupant = board.getUnit(nc, nr);
      if (occupant && !canJump) break;
    }
  }
  return results;
}
/**
 * Returns valid deploy squares for a card being played.
 * Unit: must be placed in own half on a free square.
 * Structure: same. Spell: no position needed (return empty).
 */
export function getValidDeploySquares(player: Player, board: Board): Position[] {
  return board.getFreeSquaresInHalf(player);
}

// ═══════════════════════════════════════════════════════
// CUSTOM PATTERN RESOLVER
// ═══════════════════════════════════════════════════════

/**
 * Resolve a CustomPattern into valid board positions.
 * Works for both movement and attack patterns.
 *
 * For movement (isAttack=false):
 *   - Target square must be empty (unless canJump, then skip over occupied)
 *   - Blocked by any unit unless canJump is true
 *
 * For attack (isAttack=true):
 *   - Target square must have an enemy unit
 *   - Ranged: can pass through empty squares but blocked by occupied (unless canJump)
 */
function resolveCustomPattern(
  unit: Unit,
  pattern: CustomPattern,
  board: Board,
  isAttack: boolean,
): Position[] {
  const results: Position[] = [];
  const range = pattern.range ?? 1;
  const canJump = pattern.canJump ?? false;
  const { col, row } = unit.position;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const nc = col + offset.dx * step;
      const nr = row + offset.dy * step;

      // Out of bounds — stop this direction
      if (!board.isInBounds(nc, nr)) break;

      const occupant = board.getUnit(nc, nr);

      if (isAttack) {
        // Attack mode: looking for enemy targets
        if (occupant) {
          if (occupant.owner !== unit.owner) {
            results.push({ col: nc, row: nr });
          }
          // Blocked by any unit (friend or enemy) unless canJump
          if (!canJump) break;
        }
        // Empty square — ranged can continue through
      } else {
        // Movement mode: looking for empty squares
        if (occupant) {
          if (!canJump) break;  // blocked
          // canJump: skip over occupied, don't add as valid
          continue;
        }
        results.push({ col: nc, row: nr });
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════
// PRESET OFFSET TABLES
// Use these when defining customMove/customAttack on cards.
// ═══════════════════════════════════════════════════════

/** All 8 surrounding squares */
export const OFFSETS_OMNI: PatternOffset[] = [
  { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy:  0 },                     { dx: 1, dy:  0 },
  { dx: -1, dy:  1 }, { dx: 0, dy:  1 }, { dx: 1, dy:  1 },
];

/** Horizontal + Vertical only (4 squares) */
export const OFFSETS_HV: PatternOffset[] = [
  { dx: 0, dy: -1 },
  { dx: 0, dy:  1 },
  { dx: -1, dy: 0 },
  { dx:  1, dy: 0 },
];

/** Diagonal only (4 squares) */
export const OFFSETS_DIAGONAL: PatternOffset[] = [
  { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy:  1 }, { dx: 1, dy:  1 },
];

/** Forward only (toward enemy) */
export const OFFSETS_FORWARD: PatternOffset[] = [
  { dx: 0, dy: -1 },
];

/** L-shaped knight jump (chess-style) */
export const OFFSETS_L_JUMP: PatternOffset[] = [
  { dx: -1, dy: -2 }, { dx: 1, dy: -2 },
  { dx: -2, dy: -1 }, { dx: 2, dy: -1 },
  { dx: -2, dy:  1 }, { dx: 2, dy:  1 },
  { dx: -1, dy:  2 }, { dx: 1, dy:  2 },
];

// ═══════════════════════════════════════════════════════
// ENUM-BASED MOVEMENT HELPERS (existing logic, unchanged)
// ═══════════════════════════════════════════════════════

/** Omni movement up to maxDist squares. BFS — stops at occupied. */
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
      // Friendly or enemy: blocked — don't expand further
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
  const dirs = [-1, 1];
  for (const dr of dirs) {
    for (let d = 1; d <= maxDist; d++) {
      const nr = row + dr * d;
      if (!board.isInBounds(col, nr)) break;
      const occupant = board.getUnit(col, nr);
      if (occupant === null) {
        result.push({ col, row: nr });
      } else {
        break;
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
  const dr = owner === Player.P1 ? 1 : -1;
  const nr = row + dr;
  if (!board.isInBounds(col, nr)) return [];
  if (board.getUnit(col, nr) !== null) return [];
  return [{ col, row: nr }];
}

// ═══════════════════════════════════════════════════════
// ENUM-BASED ATTACK HELPERS (existing logic, unchanged)
// ═══════════════════════════════════════════════════════

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
        break; // Blocked by any unit
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

// ═══════════════════════════════════════════════════════
// VALIDATION HELPERS (used by GameEngine)
// ═══════════════════════════════════════════════════════

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