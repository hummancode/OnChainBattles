// ============================================================
// GameModifiers.ts
// Per-player LEG economy and timed effect management.
// Pure TypeScript — no Phaser, no EventBus.
// GameEngine owns two instances: [P1, P2].
//
// CROWN = CROWN determines both LEG gained AND LEG cap each turn.
// LEG pool can never exceed current CROWN value (unless Motherland overflow).
// This keeps the economy tight: turn 3 → CROWN 3, cap 3. No hoarding.
// ============================================================

import type { GameModifiers as IGameModifiers, TimedEffect } from './types/GameTypes';
import { Player } from './types/GameTypes';

const LEG_RATE_MIN = 1;

export class GameModifiers {
  readonly player: Player;

  legRateBase: number   = 0;   // Grows +1 each turn via GameEngine.runLEGPhase
  legRateBonus: number  = 0;   // Princess +1 per copy on board
  legRatePenalty: number = 0;  // Permanent drains (Casus Belli, Mystic, Inquisitor, Revolt)
  legRateFrozen: boolean = false; // Civil War

  royalCostDiscount: number = 0; // Castle + Temple + Princess (stacks, floor 0)
  royalCostPenalty: number  = 0; // Peasant Revolt +2 (no floor)

  legPool: number = 0;
  legOverflow: boolean = false;  // Motherland: allow exceeding CROWN cap for this turn only

  timedEffects: TimedEffect[] = [];

  constructor(player: Player) {
    this.player = player;
  }

  // ─────────────────────────────────────────────
  // COMPUTED RATES
  // ─────────────────────────────────────────────

  /** Effective LEG gained per turn (= CROWN). Minimum 1 unless frozen by Civil War. */
  getEffectiveLEGRate(): number {
    if (this.legRateFrozen) return 0;
    return Math.max(LEG_RATE_MIN, this.legRateBase + this.legRateBonus - this.legRatePenalty);
  }

  /**
   * Dynamic LEG pool cap = current CROWN value.
   * Pool can never exceed this unless Motherland overflow is active.
   * When Civil War freezes CROWN to 0, cap is still based on the
   * unfrozen rate so existing LEG isn't wiped — only gain is blocked.
   */
  getLEGCap(): number {
    if (this.legOverflow) return Infinity;
    // Use the unfrozen rate for cap so Civil War doesn't destroy existing pool
    const unfrozenRate = Math.max(LEG_RATE_MIN, this.legRateBase + this.legRateBonus - this.legRatePenalty);
    return unfrozenRate;
  }

  /** Effective cost for a card. Royal cards get discount applied, floor 0. */
  getEffectiveCardCost(baseCost: number, isRoyal: boolean): number {
    if (!isRoyal) return baseCost;
    return Math.max(0, baseCost - this.royalCostDiscount + this.royalCostPenalty);
  }

  // ─────────────────────────────────────────────
  // LEG POOL OPERATIONS
  // ─────────────────────────────────────────────

  /**
   * Apply LEG gain at start of LEG phase. Returns amount actually gained.
   * Cap = CROWN (effective rate), so pool tops out at CROWN value.
   * Example: CROWN 5, pool was 2 → gain 5 → pool = min(7, 5) = 5.
   * Effectively you always refill to CROWN each turn.
   */
  gainLEG(): number {
    const rate = this.getEffectiveLEGRate();
    const cap = this.getLEGCap();
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

  /** Forcibly add LEG (steal, bonus effects). Does not exceed CROWN cap unless overflow. */
  addLEG(amount: number): void {
    const cap = this.getLEGCap();
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
    // Clamp pool to new (lower) cap immediately
    this.clampPool();
  }

  /** Recalculate Royal discount based on structures/units on board. */
  setRoyalDiscount(castle: number, temple: number, princess: number): void {
    this.royalCostDiscount = castle + temple + princess;
  }

  /** Set bonus LEG rate from Princess count on board. */
  setLEGRateBonus(princessCount: number): void {
    const oldBonus = this.legRateBonus;
    this.legRateBonus = princessCount;
    // If Princess died and bonus dropped, cap may have lowered — clamp pool
    if (princessCount < oldBonus) {
      this.clampPool();
    }
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

  /**
   * Clear the one-turn overflow flag. Called at END phase.
   * After clearing, clamp pool back to CROWN cap.
   */
  clearOverflow(): void {
    this.legOverflow = false;
    this.clampPool();
  }

  // ─────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────

  /**
   * Clamp legPool to current cap.
   * Called whenever cap might have decreased (penalty added, Princess died, overflow cleared).
   */
  private clampPool(): void {
    const cap = this.getLEGCap();
    if (this.legPool > cap) {
      this.legPool = cap;
    }
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