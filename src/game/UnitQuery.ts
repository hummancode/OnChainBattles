// ============================================================
// UnitQuery.ts
// On-demand unit capability checks.
// No stored booleans, no refresh cycles.
//
// When anything needs to know "can this unit move/attack/act?",
// it calls these functions. They evaluate the unit's current
// state RIGHT NOW and return a boolean.
//
// Adding new status effects (stun, freeze, silence, root, etc.)
// only requires editing these functions. Nothing else changes.
//
// PATCH v0.3:
//   - canUnitMove / canUnitAttack now check isJustPlaced
//     (units can't act on the turn they are deployed)
//
// ZERO Phaser imports. Pure logic.
// ============================================================

import type { Unit } from './types/GameTypes';
import { MovementType, AtkPattern, CardFlag } from './types/CardTypes';
import { getCard } from './data/CardDefinitions';

// ─────────────────────────────────────────────
// CORE CAPABILITY CHECKS
// ─────────────────────────────────────────────

/**
 * Can this unit move right now?
 * Checks: alive, active, not exhausted, not stunned, not just placed,
 * hasn't moved or acted, has movement range, not static.
 */
export function canUnitMove(unit: Unit): boolean {
  // Dead units can't do anything
  if (unit.currentDef <= 0) return false;

  // Inactive (BUILD_DELAY) units can't act
  if (!unit.isActive) return false;

  // Status effects that prevent movement
  if (unit.isExhausted) return false;
  if (unit.isStunned) return false;
  if (unit.isRooted) return false;

  // Just placed this turn — can't act yet (except exception cards in future)
  if (unit.isJustPlaced) return false;

  // Already used this turn
  if (unit.hasMoved) return false;
  if (unit.hasActed) return false;

  // No movement capacity (Village-slowed to 0)
  if (unit.currentMovement <= 0) return false;

  // Static units (structures) never move
  const def = getCard(unit.cardId);
  if (def.stats?.movement === MovementType.STATIC) return false;

  return true;
}

/**
 * Can this unit attack right now?
 * Checks: alive, active, not exhausted, not stunned, not silenced,
 * not just placed, hasn't already acted, has an attack pattern.
 * If unit has moved: only true if unit has charge ability.
 */
export function canUnitAttack(unit: Unit): boolean {
  if (unit.currentDef <= 0) return false;
  if (!unit.isActive) return false;
  if (unit.isExhausted) return false;
  if (unit.isStunned) return false;
  if (unit.isSilenced) return false;

  // Just placed this turn — can't act yet
  if (unit.isJustPlaced) return false;

  // Already used attack this turn
  if (unit.hasActed) return false;

  // Must have an attack pattern
  const def = getCard(unit.cardId);
  const hasAttackPattern = (def.stats?.attackPattern !== AtkPattern.NONE)
    || !!def.stats?.customAttack;
  if (!hasAttackPattern) return false;

  // If already moved, only charge-type units can still attack
  if (unit.hasMoved && !unit.canAttackAfterMove) return false;

  return true;
}

/**
 * Can this unit perform any action at all this turn?
 * True if it can move OR attack.
 * Used by SelectionManager to decide if clicking a unit does anything.
 */
export function canUnitAct(unit: Unit): boolean {
  return canUnitMove(unit) || canUnitAttack(unit);
}

/**
 * Is this unit alive?
 */
export function isUnitAlive(unit: Unit): boolean {
  return unit.currentDef > 0;
}

/**
 * Is this unit a valid target for abilities?
 * Alive + on the board (has a position).
 */
export function isValidTarget(unit: Unit): boolean {
  return isUnitAlive(unit) && unit.isActive;
}

// ─────────────────────────────────────────────
// COMPUTED PROPERTIES
// These are set once at unit creation time and
// updated by the engine when relevant state changes.
// UnitQuery reads them, doesn't compute them.
// ─────────────────────────────────────────────

/**
 * Compute whether a unit can attack after moving.
 * Called by UnitFactory at creation time.
 * The engine can also call this after flag changes (e.g., War Horn buff).
 */
export function computeCanAttackAfterMove(unit: Unit): boolean {
  const def = getCard(unit.cardId);

  // Lancer charge: can move + attack in same turn
  if (def.flags.includes(CardFlag.LANCER_CHARGE)) return true;

  // Future: BERSERKER, SWIFT_STRIKE, etc. — add here
  // if (def.flags.includes(CardFlag.BERSERKER)) return true;

  return false;
}
