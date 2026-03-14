// ============================================================
// MovementRules.ts
// Pure pattern resolvers. ZERO capability checks here.
//
// GameEngine gates access via UnitQuery.canUnitMove/canUnitAttack
// BEFORE calling these functions. By the time we get here, the
// unit is confirmed capable — we just need to find which squares
// match the movement/attack pattern.
//
// HYBRID PATTERN SYSTEM:
//   - Cards with customMove/customAttack → resolveCustomPattern()
//   - Cards with enum only → existing switch-case logic
//   - Both paths produce Position[] of valid squares
//
// ZERO Phaser imports. Pure TypeScript.
// ============================================================

import { MovementType, AtkPattern } from './types/CardTypes';
import type { CustomPattern, PatternOffset } from './types/CardTypes';
import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import { getCard } from './data/CardRegistry';

// ═══════════════════════════════════════════════════════
// PUBLIC API — called by GameEngine (after UnitQuery gate)
// ═══════════════════════════════════════════════════════

/**
 * All squares a unit can move to.
 * No capability checks — caller must verify canUnitMove() first.
 */
export function getValidMoves(unit: Unit, board: Board): Position[] {
  const def = getCard(unit.cardId);

  // Custom pattern takes priority
  if (def.stats?.customMove) {
    return resolveCustomPattern(unit, def.stats.customMove, board, false);
  }

  // Enum-based fallback
  const { col, row } = unit.position;
  const dist = unit.currentMovement;

  switch (unit.baseMovementType) {
    case MovementType.STATIC:          return [];
    case MovementType.OMNI_1:
    case MovementType.OMNI_2:
    case MovementType.OMNI_3:          return getOmniMoves(col, row, dist, board);
    case MovementType.VERTICAL_2:      return getLinearMoves(col, row, DIRS_VERTICAL, dist, board);
    case MovementType.JUMP_DIAGONAL_1: return getJumpTargets(col, row, DIRS_DIAGONAL, board, unit.owner);
    case MovementType.FWD_VERTICAL_1:  return getForwardMove(col, row, unit.owner, board);
    default:                           return [];
  }
}

/**
 * All squares a unit can attack (must have enemy occupant).
 * No capability checks — caller must verify canUnitAttack() first.
 */
export function getValidAttacks(unit: Unit, board: Board): Position[] {
  const def = getCard(unit.cardId);

  if (def.stats?.customAttack) {
    return resolveCustomPattern(unit, def.stats.customAttack, board, true);
  }

  if (unit.baseAtkPattern === AtkPattern.NONE) return [];
  const { col, row } = unit.position;

  switch (unit.baseAtkPattern) {
    case AtkPattern.HV:               return getEnemiesInDirs(col, row, DIRS_HV, board, unit.owner);
    case AtkPattern.OMNI:
    case AtkPattern.AREA_ADJ:         return getEnemiesInDirs(col, row, DIRS_OMNI, board, unit.owner);
    case AtkPattern.DIAGONAL_RANGED_2: return getRangedEnemies(col, row, DIRS_DIAGONAL, 2, board, unit.owner);
    case AtkPattern.STRAIGHT_RANGED_3: return getRangedEnemies(col, row, DIRS_HV, 3, board, unit.owner);
    case AtkPattern.ON_JUMP:           return []; // Assassin: attack is part of move
    case AtkPattern.FWD_VERTICAL:      return getForwardEnemy(col, row, unit.owner, board);
    default:                           return [];
  }
}

/**
 * All squares in a unit's attack RANGE — occupied or empty.
 * UI-only: shows threat zone. Not used for action validation.
 */
export function getAttackRange(unit: Unit, board: Board): Position[] {
  const def = getCard(unit.cardId);

  if (def.stats?.customAttack) {
    return resolvePatternRange(unit, def.stats.customAttack, board);
  }

  if (unit.baseAtkPattern === AtkPattern.NONE) return [];
  const { col, row } = unit.position;

  switch (unit.baseAtkPattern) {
    case AtkPattern.HV:                return getAllInDirs(col, row, DIRS_HV, 1, board);
    case AtkPattern.OMNI:
    case AtkPattern.AREA_ADJ:          return getAllInDirs(col, row, DIRS_OMNI, 1, board);
    case AtkPattern.DIAGONAL_RANGED_2: return getAllRanged(col, row, DIRS_DIAGONAL, 2, board);
    case AtkPattern.STRAIGHT_RANGED_3: return getAllRanged(col, row, DIRS_HV, 3, board);
    case AtkPattern.ON_JUMP:           return [];
    case AtkPattern.FWD_VERTICAL: {
      const dr = unit.owner === Player.P1 ? 1 : -1;
      const nr = row + dr;
      return board.isInBounds(col, nr) ? [{ col, row: nr }] : [];
    }
    default: return [];
  }
}

/**
 * Valid deploy squares (own half, unoccupied).
 */
export function getValidDeploySquares(player: Player, board: Board): Position[] {
  return board.getFreeSquaresInHalf(player);
}

// ─────────────────────────────────────────────
// VALIDATION HELPERS (used by phase modules)
// ─────────────────────────────────────────────

export function isMoveValid(unit: Unit, toCol: number, toRow: number, board: Board): boolean {
  return getValidMoves(unit, board).some(p => p.col === toCol && p.row === toRow);
}

export function isAttackValid(unit: Unit, targetCol: number, targetRow: number, board: Board): boolean {
  return getValidAttacks(unit, board).some(p => p.col === targetCol && p.row === targetRow);
}

export function isLancerForwardMove(unit: Unit, toRow: number): boolean {
  const dr = unit.owner === Player.P1 ? 1 : -1;
  return (toRow - unit.position.row) * dr > 0;
}

// ═══════════════════════════════════════════════════════
// CUSTOM PATTERN RESOLVER
//
// Path-blocking rules (when canJump = false):
//   - Adjacent offsets (|dx|≤1 AND |dy|≤1): no intermediates to check.
//   - Decomposable offsets (gcd(|dx|,|dy|) ≥ 2, e.g. {-2,-2}, {0,-2}):
//     Single clear path exists. Trace step-by-step along {dx/gcd, dy/gcd}.
//     Blocked if ANY intermediate is occupied.
//   - L-shaped offsets (gcd=1, distance > 1, e.g. {-1,-2}, {2,-1}):
//     Multiple paths through the bounding rectangle. Check ALL cells in
//     the rectangle (excluding start + destination). Blocked only if
//     EVERY intermediate cell is occupied — meaning no path exists.
//     Example: (0,0)→(1,2) checks (0,1),(1,0),(1,1),(0,2).
// ═══════════════════════════════════════════════════════

/**
 * GCD for decomposing offsets into traceable steps.
 * gcd(0, n) = n, gcd(a, b) = gcd(b, a%b).
 */
function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * Check if the path from (col, row) to (col+dx, row+dy) is clear.
 * Only checks intermediate squares — NOT the destination itself.
 * Returns true if the path is clear.
 */
function isPathClear(col: number, row: number, dx: number, dy: number, board: Board): boolean {
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (dist <= 1) return true; // adjacent — no intermediates

  const g = gcd(dx, dy);

  if (g >= 2) {
    // Decomposable (straight/diagonal): single path, ANY blocker stops it
    const sdx = dx / g;
    const sdy = dy / g;
    for (let s = 1; s < g; s++) {
      const ic = col + sdx * s;
      const ir = row + sdy * s;
      if (board.isInBounds(ic, ir) && board.getUnit(ic, ir) !== null) {
        return false;
      }
    }
    return true;
  }

  // L-shaped: multiple paths through bounding rectangle.
  // Blocked only if ALL intermediate cells are occupied.
  const minC = Math.min(0, dx), maxC = Math.max(0, dx);
  const minR = Math.min(0, dy), maxR = Math.max(0, dy);

  for (let dc = minC; dc <= maxC; dc++) {
    for (let dr = minR; dr <= maxR; dr++) {
      if (dc === 0 && dr === 0) continue;       // skip origin
      if (dc === dx && dr === dy) continue;      // skip destination
      const ic = col + dc;
      const ir = row + dr;
      if (!board.isInBounds(ic, ir)) continue;
      if (board.getUnit(ic, ir) === null) {
        return true; // at least one cell is free — path exists
      }
    }
  }
  return false; // every intermediate cell is occupied — fully blocked
}

function resolveCustomPattern(
  unit: Unit, pattern: CustomPattern, board: Board, isAttack: boolean,
): Position[] {
  const results: Position[] = [];
  const range = pattern.range ?? 1;
  const canJump = pattern.canJump ?? false;
  const { col, row } = unit.position;
  // Pattern offsets are defined from P1's perspective (dy>0 = toward enemy).
  // Flip dy for P2 so patterns are player-relative.
  const dySign = unit.owner === Player.P1 ? 1 : -1;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const dx = offset.dx * step;
      const dy = (offset.dy * dySign) * step;
      const nc = col + dx;
      const nr = row + dy;
      if (!board.isInBounds(nc, nr)) break;

      // Path blocking: check intermediate squares (unless canJump)
      if (!canJump && !isPathClear(col, row, dx, dy, board)) break;

      const occupant = board.getUnit(nc, nr);

      if (isAttack) {
        if (occupant) {
          if (occupant.owner !== unit.owner) results.push({ col: nc, row: nr });
          if (!canJump) break;
        }
      } else {
        if (occupant) {
          if (!canJump) break;
          continue;
        }
        results.push({ col: nc, row: nr });
      }
    }
  }
  return results;
}

/** Custom pattern range — all reachable squares regardless of occupancy. */
function resolvePatternRange(unit: Unit, pattern: CustomPattern, board: Board): Position[] {
  const results: Position[] = [];
  const range = pattern.range ?? 1;
  const canJump = pattern.canJump ?? false;
  const { col, row } = unit.position;
  // Flip dy for P2 (same as resolveCustomPattern)
  const dySign = unit.owner === Player.P1 ? 1 : -1;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const dx = offset.dx * step;
      const dy = (offset.dy * dySign) * step;
      const nc = col + dx;
      const nr = row + dy;
      if (!board.isInBounds(nc, nr)) break;
      // For range display: show square but stop extending if path blocked
      if (!canJump && !isPathClear(col, row, dx, dy, board)) break;
      results.push({ col: nc, row: nr });
      if (board.getUnit(nc, nr) && !canJump) break;
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════
// PRESET OFFSET TABLES
// ═══════════════════════════════════════════════════════

const DIRS_OMNI: number[][] = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const DIRS_HV: number[][] = [[0,-1],[0,1],[-1,0],[1,0]];
const DIRS_DIAGONAL: number[][] = [[-1,-1],[1,-1],[-1,1],[1,1]];
const DIRS_VERTICAL: number[][] = [[0,-1],[0,1]];

/** Exported presets for use in card definitions */
export const OFFSETS_OMNI: PatternOffset[] = DIRS_OMNI.map(([dx,dy]) => ({ dx, dy }));
export const OFFSETS_HV: PatternOffset[] = DIRS_HV.map(([dx,dy]) => ({ dx, dy }));
export const OFFSETS_DIAGONAL: PatternOffset[] = DIRS_DIAGONAL.map(([dx,dy]) => ({ dx, dy }));
export const OFFSETS_FORWARD: PatternOffset[] = [{ dx: 0, dy: -1 }];
export const OFFSETS_L_JUMP: PatternOffset[] = [
  { dx:-1, dy:-2 }, { dx:1, dy:-2 }, { dx:-2, dy:-1 }, { dx:2, dy:-1 },
  { dx:-2, dy:1 },  { dx:2, dy:1 },  { dx:-1, dy:2 },  { dx:1, dy:2 },
];

// ═══════════════════════════════════════════════════════
// ENUM-BASED HELPERS
// ═══════════════════════════════════════════════════════

/** BFS omni-directional movement up to maxDist. */
function getOmniMoves(col: number, row: number, maxDist: number, board: Board): Position[] {
  // Use numeric keys (col * 100 + row) instead of string interpolation
  const visited = new Set<number>([col * 100 + row]);
  const result: Position[] = [];
  const queue = [{ col, row, dist: 0 }];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.dist >= maxDist) continue;

    for (const [dc, dr] of DIRS_OMNI) {
      const nc = curr.col + dc, nr = curr.row + dr;
      const key = nc * 100 + nr;
      if (!board.isInBounds(nc, nr) || visited.has(key)) continue;
      visited.add(key);
      if (board.getUnit(nc, nr) === null) {
        result.push({ col: nc, row: nr });
        queue.push({ col: nc, row: nr, dist: curr.dist + 1 });
      }
    }
  }
  return result;
}

/** Linear movement along given directions up to maxDist. Stops at occupied. */
function getLinearMoves(
  col: number, row: number, dirs: number[][], maxDist: number, board: Board,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxDist; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      if (board.getUnit(nc, nr) !== null) break;
      result.push({ col: nc, row: nr });
    }
  }
  return result;
}

/** Jump targets: land on empty or enemy (ignores path). */
function getJumpTargets(
  col: number, row: number, dirs: number[][], board: Board, owner: Player,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc, nr = row + dr;
    if (!board.isInBounds(nc, nr)) continue;
    const occ = board.getUnit(nc, nr);
    if (occ === null || occ.owner !== owner) result.push({ col: nc, row: nr });
  }
  return result;
}

/** Forward 1 square (P1 moves down, P2 moves up). */
function getForwardMove(col: number, row: number, owner: Player, board: Board): Position[] {
  const dr = owner === Player.P1 ? 1 : -1;
  const nr = row + dr;
  if (!board.isInBounds(col, nr) || board.getUnit(col, nr) !== null) return [];
  return [{ col, row: nr }];
}

/** Adjacent enemies in given directions (range 1). */
function getEnemiesInDirs(
  col: number, row: number, dirs: number[][], board: Board, owner: Player,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc, nr = row + dr;
    if (!board.isInBounds(nc, nr)) continue;
    const u = board.getUnit(nc, nr);
    if (u && u.owner !== owner) result.push({ col: nc, row: nr });
  }
  return result;
}

/** Ranged enemies along directions up to maxRange. Stops at any unit. */
function getRangedEnemies(
  col: number, row: number, dirs: number[][], maxRange: number, board: Board, owner: Player,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxRange; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      const u = board.getUnit(nc, nr);
      if (u) {
        if (u.owner !== owner) result.push({ col: nc, row: nr });
        break;
      }
    }
  }
  return result;
}

/** Forward enemy (range 1, forward only). */
function getForwardEnemy(col: number, row: number, owner: Player, board: Board): Position[] {
  const dr = owner === Player.P1 ? 1 : -1;
  const nr = row + dr;
  if (!board.isInBounds(col, nr)) return [];
  const u = board.getUnit(col, nr);
  if (u && u.owner !== owner) return [{ col, row: nr }];
  return [];
}

/** All squares in given directions (range N), regardless of occupancy. For attack range UI. */
function getAllInDirs(col: number, row: number, dirs: number[][], range: number, board: Board): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= range; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (board.isInBounds(nc, nr)) result.push({ col: nc, row: nr });
    }
  }
  return result;
}

/** All ranged squares — stops at occupied but includes that square. For attack range UI. */
function getAllRanged(col: number, row: number, dirs: number[][], maxRange: number, board: Board): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxRange; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      result.push({ col: nc, row: nr });
      if (board.getUnit(nc, nr) !== null) break;
    }
  }
  return result;
}
