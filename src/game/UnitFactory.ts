// ============================================================
// UnitFactory.ts
// Creates Unit objects from CardDefinitions.
// Sets all computed properties at creation time.
// Owns the instance counter for unique IDs.
//
// PATCH v0.3:
//   - isJustPlaced = true on creation (can't act on deploy turn)
//   - combatTag derived from AtkPattern or overridden by CardDefinition
//   - Added deriveCombatTag() exported helper
//
// ZERO Phaser imports. Pure TypeScript.
// ============================================================

import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import { MovementType, AtkPattern, CombatTag } from './types/CardTypes';
import { getCard } from './data/CardDefinitions';
import { computeCanAttackAfterMove } from './UnitQuery';

export class UnitFactory {
  private instanceCounter: number = 0;

  /**
   * Create a new Unit from a card definition.
   * All computed properties (canAttackAfterMove, combatTag, etc.) are set here.
   * isJustPlaced is true — unit cannot act on the turn it is deployed.
   * Future status effects default to false.
   */
  create(cardId: string, owner: Player, position: Position): Unit {
    this.instanceCounter++;
    const def = getCard(cardId);
    const stats = def.stats!;
    const movNum = movementToNumber(stats.movement);

    const unit: Unit = {
      instanceId:       `${cardId}_${this.instanceCounter}`,
      cardId,
      owner,
      position:         { ...position },

      // Base stats — from CardDefinition, never change mid-game
      baseAtk:          stats.atk,
      baseDef:          stats.def,
      baseMovement:     movNum,
      baseAtkPattern:   stats.attackPattern,
      baseMovementType: stats.movement,

      // Current stats — base + aura buffs, recalculated each LEG phase
      currentAtk:       stats.atk,
      currentDef:       stats.def,
      maxDef:           stats.def,
      currentMovement:  movNum,

      // Turn flags — reset at START of each owner's turn
      hasMoved:         false,
      hasActed:         false,
      isJustPlaced:     true,    // Can't act on the turn deployed

      // Persistent state
      isActive:         true,    // false during BUILD_DELAY
      isExhausted:      false,   // Treason: returned, can't act this turn

      // Status effects — all false by default
      isStunned:        false,   // Future: stun spells
      isRooted:         false,   // Future: root effects (can attack but not move)
      isSilenced:       false,   // Future: silence (disable abilities + attack)

      // Computed capabilities — set below
      canAttackAfterMove: false,
      combatTag:          null,

      // Treason tracking
      treasonOwner:     null,
      originalPos:      null,

      // Castle-specific
      spawnCounter:     0,
    };

    // Compute derived properties
    unit.canAttackAfterMove = computeCanAttackAfterMove(unit);
    unit.combatTag = deriveCombatTag(unit);

    return unit;
  }

  /** Reset the counter (for new games). */
  reset(): void {
    this.instanceCounter = 0;
  }
}

// ─────────────────────────────────────────────
// COMBAT TAG DERIVATION
// ─────────────────────────────────────────────

/**
 * Derive CombatTag from card definition.
 * Explicit combatTag on CardDefinition takes priority (override).
 * Otherwise derived from AtkPattern:
 *   - DIAGONAL_RANGED_2, STRAIGHT_RANGED_3 → RANGED
 *   - HV, OMNI, AREA_ADJ, ON_JUMP, FWD_VERTICAL → MELEE
 *   - NONE → null (no attack capability)
 */
export function deriveCombatTag(unit: Unit): CombatTag | null {
  const def = getCard(unit.cardId);

  // Explicit override on card definition wins
  if (def.combatTag !== undefined) return def.combatTag;

  // Derive from attack pattern
  const pattern = def.stats?.attackPattern;
  if (!pattern || pattern === AtkPattern.NONE) return null;

  switch (pattern) {
    case AtkPattern.DIAGONAL_RANGED_2:
    case AtkPattern.STRAIGHT_RANGED_3:
      return CombatTag.RANGED;

    case AtkPattern.HV:
    case AtkPattern.OMNI:
    case AtkPattern.AREA_ADJ:
    case AtkPattern.ON_JUMP:
    case AtkPattern.FWD_VERTICAL:
    default:
      return CombatTag.MELEE;
  }
}

// ─────────────────────────────────────────────
// MOVEMENT HELPER
// ─────────────────────────────────────────────

/** Convert MovementType enum to numeric distance. */
export function movementToNumber(movement: MovementType): number {
  switch (movement) {
    case MovementType.OMNI_1:          return 1;
    case MovementType.OMNI_2:          return 2;
    case MovementType.OMNI_3:          return 3;
    case MovementType.VERTICAL_2:      return 2;
    case MovementType.JUMP_DIAGONAL_1: return 1;
    case MovementType.FWD_VERTICAL_1:  return 1;
    case MovementType.STATIC:          return 0;
    default:                           return 1;
  }
}
