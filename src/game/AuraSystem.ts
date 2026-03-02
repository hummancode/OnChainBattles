// ============================================================
// AuraSystem.ts
// Recalculates ALL unit stats each LEG phase.
// Algorithm: reset every unit to base stats → apply each
// active aura in sequence → write final values back.
// Pure TypeScript — no Phaser, no EventBus.
//
// Auras are never stored incrementally; they are re-derived
// from scratch each turn so stale state is impossible.
// ============================================================

import type { Unit } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import type { GameModifiers } from './GameModifiers';
import { getCard } from './data/CardDefinitions';
import { AbilityType } from './types/AbilityTypes';
import type { EvAuraApplied } from './types/EventTypes';

interface StatDelta {
  atkDelta: number;
  defDelta: number;
  moveDelta: number;
}

// Convenience: safely read params from any ability (CommonAbility or CustomAbility).
// CustomAbility has no params — casting to any avoids the union type error.
function params(ab: any): any {
  return ab.params ?? {};
}

// ─────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────

/**
 * Full aura recalculation pass.
 * Call once per LEG phase before any ACT actions.
 * Mutates unit.currentAtk / currentDef / currentMovement in place.
 * Also updates GameModifiers royalCostDiscount and legRateBonus.
 *
 * Returns an EvAuraApplied event for the renderer (so it can
 * show stat-change indicators on cards that gained/lost buffs).
 */
export function evaluateAuras(
  board: Board,
  mods: [GameModifiers, GameModifiers]
): EvAuraApplied {
  const allUnits = board.getAllUnits();

  // ── Step 1: Reset every unit to base stats ──
  for (const unit of allUnits) {
    unit.currentAtk      = unit.baseAtk;
    unit.currentDef      = Math.min(unit.currentDef, unit.maxDef);
    unit.currentMovement = unit.baseMovement;
  }

  // ── Step 2: Collect per-unit deltas ──
  const deltas = new Map<string, StatDelta>();
  for (const unit of allUnits) {
    deltas.set(unit.instanceId, { atkDelta: 0, defDelta: 0, moveDelta: 0 });
  }

  // ── Step 3: Apply each aura source ──
  for (const unit of allUnits) {
    if (!unit.isActive) continue; // BUILD_DELAY units have no aura
    const def = getCard(unit.cardId);

    for (const ability of def.abilities) {
      if (ability.type === 'CUSTOM') continue;
      const p = params(ability);

      switch (ability.type) {

        // ── Castle: adjacent friendly +DEF ──
        case AbilityType.AURA_ADJ_DEF: {
          const adjacents = board.getAdjacentUnits(unit.position.col, unit.position.row);
          for (const adj of adjacents) {
            if (adj.owner === unit.owner) {
              addDelta(deltas, adj.instanceId, 0, p.amount, 0);
            }
          }
          break;
        }

        // ── Commander: own-half +DEF ──
        case AbilityType.AURA_BOARD_HALF_DEF: {
          const benefitOwner = p.half === 'OWN' ? unit.owner : otherPlayer(unit.owner);
          for (const u of allUnits) {
            if (u.owner === unit.owner && board.isOwnHalf(u.position.col, u.position.row, benefitOwner)) {
              addDelta(deltas, u.instanceId, 0, p.amount, 0);
            }
          }
          break;
        }

        // ── Commander: enemy-half +ATK ──
        case AbilityType.AURA_BOARD_HALF_ATK: {
          const targetHalfOwner = p.half === 'ENEMY' ? otherPlayer(unit.owner) : unit.owner;
          for (const u of allUnits) {
            if (u.owner === unit.owner && board.isOwnHalf(u.position.col, u.position.row, targetHalfOwner)) {
              addDelta(deltas, u.instanceId, p.amount, 0, 0);
            }
          }
          break;
        }

        // ── Village: adjacent enemies −movement ──
        case AbilityType.AURA_VILLAGE_SLOW: {
          const adjacents = board.getAdjacentUnits(unit.position.col, unit.position.row);
          for (const adj of adjacents) {
            if (adj.owner !== unit.owner) {
              addDelta(deltas, adj.instanceId, 0, 0, -p.amount);
            }
          }
          break;
        }

        // ── Pikeman flank: +ATK +DEF if friendly on both sides ──
        case AbilityType.AURA_PIKEMAN_FLANK: {
          const { col, row } = unit.position;
          const leftUnit  = board.isInBounds(col - 1, row) ? board.getUnit(col - 1, row) : null;
          const rightUnit = board.isInBounds(col + 1, row) ? board.getUnit(col + 1, row) : null;
          const hasLeft   = leftUnit  !== null && leftUnit.owner  === unit.owner;
          const hasRight  = rightUnit !== null && rightUnit.owner === unit.owner;
          if (hasLeft && hasRight) {
            addDelta(deltas, unit.instanceId, p.bonusAtk, p.bonusDef, 0);
          }
          break;
        }

        // CAVALRY_COUNTER → combat-time only (CombatResolver)
        // AURA_AUTO_HEAL  → LEG phase only (GameEngine.runLEGPhase)
        // AURA_ROYAL_DISCOUNT / AURA_LEG_BONUS → Step 5 below
        default:
          break;
      }
    }
  }

  // ── Step 4: Apply deltas to currentAtk / currentMovement ──
  const changes: EvAuraApplied['changes'] = [];

  for (const unit of allUnits) {
    const d = deltas.get(unit.instanceId)!;

    const prevAtk = unit.currentAtk;
    const prevMov = unit.currentMovement;

    unit.currentAtk      = Math.max(0, unit.currentAtk + d.atkDelta);
    unit.currentMovement = Math.max(0, unit.currentMovement + d.moveDelta);

    if (d.atkDelta !== 0 || d.defDelta !== 0 || d.moveDelta !== 0) {
      changes.push({
        instanceId: unit.instanceId,
        col:        unit.position.col,
        row:        unit.position.row,
        atkDelta:   unit.currentAtk - prevAtk,
        defDelta:   d.defDelta,
        moveDelta:  unit.currentMovement - prevMov,
      });
    }
  }

  // ── Step 5: Recalculate economy modifiers ──
  for (const player of [Player.P1, Player.P2] as Player[]) {
    const mod = mods[player];
    const ownUnits = board.getUnitsOf(player);

    // Royal discount from Castle, Temple, Princess
    let discount = 0;
    for (const u of ownUnits) {
      if (!u.isActive) continue;
      const def = getCard(u.cardId);
      for (const ab of def.abilities) {
        if (ab.type === 'CUSTOM') continue;
        if (ab.type === AbilityType.AURA_ROYAL_DISCOUNT) {
          discount += params(ab).amount;
        }
      }
    }
    mod.royalCostDiscount = discount;

    // LEG rate bonus from Princess
    let legBonus = 0;
    for (const u of ownUnits) {
      if (!u.isActive) continue;
      const def = getCard(u.cardId);
      for (const ab of def.abilities) {
        if (ab.type === 'CUSTOM') continue;
        if (ab.type === AbilityType.AURA_LEG_BONUS && u.cardId !== 'king') {
          legBonus += params(ab).amount;
        }
      }
    }
    mod.setLEGRateBonus(legBonus);
  }

  return { type: 'AURA_APPLIED', changes };
}

// ─────────────────────────────────────────────
// COMBAT-TIME AURA QUERIES
// Called by CombatResolver / GameEngine at moment of combat.
// ─────────────────────────────────────────────

/**
 * Check if the Pikeman cavalry counter applies for this attack.
 */
export function getCavalryCounterMultiplier(attacker: Unit, defender: Unit): number {
  const attDef = getCard(attacker.cardId);
  const defDef = getCard(defender.cardId);

  const attackerHasCounter = attDef.abilities.some(
    ab => ab.type === AbilityType.AURA_CAVALRY_COUNTER
  );
  const defenderIsCavalry = defDef.subtypes.includes('CAVALRY' as any);

  if (attackerHasCounter && defenderIsCavalry) {
    const ab = attDef.abilities.find(ab => ab.type === AbilityType.AURA_CAVALRY_COUNTER)!;
    return params(ab).multiplier;
  }
  return 1;
}

/**
 * Returns Kings Guard auto-heal amount if unit has the aura.
 */
export function getAutoHealAmount(unit: Unit): number {
  const def = getCard(unit.cardId);
  const ab = def.abilities.find(ab => ab.type === AbilityType.AURA_AUTO_HEAL);
  if (!ab) return 0;
  return params(ab).amount;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function addDelta(
  deltas: Map<string, StatDelta>,
  instanceId: string,
  atk: number,
  def: number,
  mov: number
): void {
  const d = deltas.get(instanceId);
  if (!d) return;
  d.atkDelta += atk;
  d.defDelta += def;
  d.moveDelta += mov;
}

function otherPlayer(p: Player): Player {
  return p === Player.P1 ? Player.P2 : Player.P1;
}

// ─────────────────────────────────────────────
// CLASS WRAPPER
// GameEngine uses `new AuraSystem()` with instance methods.
// ─────────────────────────────────────────────

export class AuraSystem {
  evaluateAuras(board: Board, mods: [GameModifiers, GameModifiers]): EvAuraApplied {
    return evaluateAuras(board, mods);
  }

  recalculateModifiers(board: Board, mods: [GameModifiers, GameModifiers]): void {
    evaluateAuras(board, mods);
  }
}