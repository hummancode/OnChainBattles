// ============================================================
// GameModifiers.ts
// Per-player LEG economy and timed effect management.
// Pure TypeScript — no Phaser, no EventBus.
// GameEngine owns two instances: [P1, P2].
// ============================================================

import type { GameModifiers as IGameModifiers, TimedEffect } from './types/GameTypes';
import { Player } from './types/GameTypes';

const LEG_CAP = 10;
const LEG_RATE_MIN = 1;

export class GameModifiers {
  readonly player: Player;

  legRateBase: number   = 1;   // King always 1
  legRateBonus: number  = 0;   // Princess +1 per copy on board
  legRatePenalty: number = 0;  // Permanent drains (Casus Belli, Mystic, Inquisitor, Revolt)
  legRateFrozen: boolean = false; // Civil War

  royalCostDiscount: number = 0; // Castle + Temple + Princess (stacks, floor 0)
  royalCostPenalty: number  = 0; // Peasant Revolt +2 (no floor)

  legPool: number = 0;
  legOverflow: boolean = false;  // Motherland: allow >10 for this turn only

  timedEffects: TimedEffect[] = [];

  constructor(player: Player) {
    this.player = player;
  }

  // ─────────────────────────────────────────────
  // COMPUTED RATES
  // ─────────────────────────────────────────────

  /** Effective LEG gained per turn. Minimum 1 unless frozen by Civil War. */
  getEffectiveLEGRate(): number {
    if (this.legRateFrozen) return 0;
    return Math.max(LEG_RATE_MIN, this.legRateBase + this.legRateBonus - this.legRatePenalty);
  }

  /** Effective cost for a card. Royal cards get discount applied, floor 0. */
  getEffectiveCardCost(baseCost: number, isRoyal: boolean): number {
    if (!isRoyal) return baseCost;
    return Math.max(0, baseCost - this.royalCostDiscount + this.royalCostPenalty);
  }

  // ─────────────────────────────────────────────
  // LEG POOL OPERATIONS
  // ─────────────────────────────────────────────

  /** Apply LEG gain at start of LEG phase. Returns amount actually gained. */
  gainLEG(): number {
    const rate = this.getEffectiveLEGRate();
    const cap = this.legOverflow ? Infinity : LEG_CAP;
    const before = this.legPool;
    this.legPool = Math.min(this.legPool + rate, cap);
    return this.legPool - before;
  }

  /** Spend LEG. Returns false if insufficient funds. */
  spendLEG(amount: number): boolean {
    if (this.legPool < amount) return false;
    this.legPool -= amount;
    return true;
  }

  /** Forcibly add LEG (steal, bonus effects). Does not exceed cap unless overflow. */
  addLEG(amount: number): void {
    const cap = this.legOverflow ? Infinity : LEG_CAP;
    this.legPool = Math.min(this.legPool + amount, cap);
  }

  /** Forcibly remove LEG (stolen, penalties). Floored at 0. */
  removeLEG(amount: number): void {
    this.legPool = Math.max(0, this.legPool - amount);
  }

  /** Check affordability without spending. */
  canAfford(baseCost: number, isRoyal: boolean): boolean {
    return this.legPool >= this.getEffectiveCardCost(baseCost, isRoyal);
  }

  // ─────────────────────────────────────────────
  // RATE MODIFIERS
  // ─────────────────────────────────────────────

  /** Add permanent LEG rate penalty. Minimum effective rate always enforced. */
  addLEGRatePenalty(amount: number): void {
    this.legRatePenalty += amount;
  }

  /** Recalculate Royal discount based on structures/units on board. */
  setRoyalDiscount(castle: number, temple: number, princess: number): void {
    this.royalCostDiscount = castle + temple + princess;
  }

  /** Set bonus LEG rate from Princess count on board. */
  setLEGRateBonus(princessCount: number): void {
    this.legRateBonus = princessCount;
  }

  // ─────────────────────────────────────────────
  // TIMED EFFECTS
  // ─────────────────────────────────────────────

  addTimedEffect(effect: TimedEffect): void {
    this.timedEffects.push(effect);
  }

  /** Tick all effects. Call at END phase. Returns list of expired effect types. */
  tickEffects(): TimedEffect[] {
    const expired: TimedEffect[] = [];

    this.timedEffects = this.timedEffects.filter(effect => {
      if (effect.duration === -1) return true; // Permanent — never expire

      effect.duration--;

      if (effect.duration <= 0) {
        expired.push(effect);
        return false;
      }
      return true;
    });

    // Resolve Civil War freeze
    const hasCivilWar = this.timedEffects.some(e => e.type === 'CIVIL_WAR_FREEZE');
    this.legRateFrozen = hasCivilWar;

    return expired;
  }

  /** Returns true if any timed effect of a given type is active. */
  hasEffect(type: TimedEffect['type']): boolean {
    return this.timedEffects.some(e => e.type === type);
  }

  /** Remove all effects of a given type immediately. */
  removeEffect(type: TimedEffect['type']): void {
    this.timedEffects = this.timedEffects.filter(e => e.type !== type);
  }

  /** Clear the one-turn overflow flag. Called at END phase. */
  clearOverflow(): void {
    this.legOverflow = false;
  }

  // ─────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────

  snapshot(): IGameModifiers {
    return {
      legRateBase:      this.legRateBase,
      legRateBonus:     this.legRateBonus,
      legRatePenalty:   this.legRatePenalty,
      royalCostDiscount: this.royalCostDiscount,
      royalCostPenalty:  this.royalCostPenalty,
      legPool:           this.legPool,
      legRateFrozen:     this.legRateFrozen,
      timedEffects:     [...this.timedEffects],
    };
  }
}
