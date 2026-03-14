// ============================================================
// AuraSystem.ts
// Recalculates ALL unit stats each LEG phase using a
// Chain of Responsibility pattern.
//
// Algorithm: reset every unit to base stats → run processor
// chain to accumulate deltas → apply deltas → run economy
// processors for modifier recalculation.
//
// Pure TypeScript — no Phaser, no EventBus.
// ============================================================

import type { Unit, StatBuff } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { IBoard } from './interfaces/IBoard';
import type { IGameModifiers } from './interfaces/IGameModifiers';
import type { AuraProcessor, EconomyProcessor, StatDelta } from './auras/AuraProcessor';
import { createStatChain, createEconomyChain, runStatChain } from './auras/AuraProcessorChain';
import { getCard } from './data/CardRegistry';
import { AbilityType } from './types/AbilityTypes';
import { params, beginAuditTrail, endAuditTrail } from './auras/auraHelpers';
import type { EvAuraApplied } from './types/EventTypes';

export class AuraSystem {
  private statChain: AuraProcessor[];
  private economyChain: EconomyProcessor[];

  constructor() {
    this.statChain = createStatChain();
    this.economyChain = createEconomyChain();
  }

  /**
   * Full aura recalculation pass.
   * Call once per LEG phase before any ACT actions.
   * Mutates unit.currentAtk / currentDef / currentMovement in place.
   * Also updates GameModifiers royalCostDiscount and legRateBonus.
   */
  evaluateAuras(board: IBoard, mods: [IGameModifiers, IGameModifiers]): EvAuraApplied {
    const allUnits = board.getAllUnits();

    // ── Step 1: Reset every unit to base stats + clear audit trail ──
    for (const unit of allUnits) {
      unit.currentAtk      = unit.baseAtk;
      unit.maxDef          = unit.baseDef;               // reset max to base (removes old aura DEF buffs)
      unit.currentDef      = Math.min(unit.currentDef, unit.maxDef); // cap HP at new max
      unit.currentMovement = unit.baseMovement;
      unit.activeBuffs     = [];
    }

    // ── Step 2: Collect per-unit deltas ──
    const deltas = new Map<string, StatDelta>();
    const buffMap = new Map<string, StatBuff[]>();
    for (const unit of allUnits) {
      deltas.set(unit.instanceId, { atkDelta: 0, defDelta: 0, moveDelta: 0 });
    }

    // ── Step 3: Run stat processor chain for each active unit ──
    beginAuditTrail(buffMap);
    for (const unit of allUnits) {
      if (!unit.isActive) continue;
      runStatChain(this.statChain, unit, allUnits, board, deltas);
    }
    endAuditTrail();

    // ── Step 4: Apply deltas to currentAtk / currentMovement + copy audit trail ──
    const changes: EvAuraApplied['changes'] = [];

    for (const unit of allUnits) {
      const d = deltas.get(unit.instanceId)!;

      const prevAtk = unit.currentAtk;
      const prevMov = unit.currentMovement;

      unit.currentAtk      = Math.max(0, unit.currentAtk + d.atkDelta);
      if (d.defDelta !== 0) {
        unit.maxDef     += d.defDelta;
        unit.currentDef  = Math.min(unit.currentDef + d.defDelta, unit.maxDef);
      }
      unit.currentMovement = Math.max(0, unit.currentMovement + d.moveDelta);
      unit.activeBuffs     = buffMap.get(unit.instanceId) ?? [];

      if (d.atkDelta !== 0 || d.defDelta !== 0 || d.moveDelta !== 0) {
        changes.push({
          instanceId: unit.instanceId,
          col:        unit.position.col,
          row:        unit.position.row,
          atkDelta:   unit.currentAtk - prevAtk,
          defDelta:   d.defDelta,
          moveDelta:  unit.currentMovement - prevMov,
          buffs:      unit.activeBuffs,
        });
      }
    }

    // ── Step 5: Run economy processors per player ──
    for (const player of [Player.P1, Player.P2] as Player[]) {
      const mod = mods[player];
      const ownUnits = board.getUnitsOf(player);

      for (const processor of this.economyChain) {
        const value = processor.process(ownUnits, mod);
        if (processor.auraType === AbilityType.AURA_ROYAL_DISCOUNT) {
          mod.royalCostDiscount = value;
        } else if (processor.auraType === AbilityType.AURA_LEG_BONUS) {
          mod.setLEGRateBonus(value);
        }
      }
    }

    return { type: 'AURA_APPLIED', changes };
  }

  recalculateModifiers(board: IBoard, mods: [IGameModifiers, IGameModifiers]): void {
    this.evaluateAuras(board, mods);
  }
}

// ─────────────────────────────────────────────
// COMBAT-TIME AURA QUERIES
// Called by CombatResolver / GameEngine at moment of combat.
// These are standalone — not part of the chain.
// ─────────────────────────────────────────────

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

export function getAutoHealAmount(unit: Unit): number {
  const def = getCard(unit.cardId);
  const ab = def.abilities.find(ab => ab.type === AbilityType.AURA_AUTO_HEAL);
  if (!ab) return 0;
  return params(ab).amount;
}
