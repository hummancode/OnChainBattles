import type { CustomPattern, PatternOffset } from './types/CardTypes';
import type { Unit } from './types/GameTypes';
import type { Board } from './Board';

/**
 * Resolve a custom pattern into valid board positions.
 * Works for both movement and attack patterns.
 */
export function resolveCustomPattern(
  unit: Unit,
  pattern: CustomPattern,
  board: Board,
  isAttack: boolean,
): Array<{ col: number; row: number }> {
  const results: Array<{ col: number; row: number }> = [];
  const range = pattern.range ?? 1;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const col = unit.position.col + offset.dx * step;
      const row = unit.position.row + offset.dy * step;

      // Out of bounds
      if (!board.isInBounds(col, row)) break;

      const occupant = board.getUnit(col, row);

      if (isAttack) {
        // Attack: target must have an enemy
        if (occupant && occupant.owner !== unit.owner) {
          results.push({ col, row });
        }
        // Ranged: can pass through empty squares but not friendlies
        if (occupant && !pattern.canJump) break;
      } else {
        // Movement: cell must be empty (unless canJump)
        if (occupant) {
          if (!pattern.canJump) break;  // blocked
          continue;  // jump over
        }
        results.push({ col, row });
      }
    }
  }

  return results;
}

// ─── Preset offset tables (derived from existing enums) ─────

export const OFFSETS_OMNI: PatternOffset[] = [
  { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy:  0 },                     { dx: 1, dy:  0 },
  { dx: -1, dy:  1 }, { dx: 0, dy:  1 }, { dx: 1, dy:  1 },
];

export const OFFSETS_HV: PatternOffset[] = [
  { dx: 0, dy: -1 },  // up
  { dx: 0, dy:  1 },  // down
  { dx: -1, dy: 0 },  // left
  { dx: 1,  dy: 0 },  // right
];

export const OFFSETS_DIAGONAL: PatternOffset[] = [
  { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy:  1 }, { dx: 1, dy:  1 },
];

export const OFFSETS_FORWARD_ONLY: PatternOffset[] = [
  { dx: 0, dy: -1 },  // toward enemy
];