// ============================================================
// IGameModifiers.ts
// Interface for per-player LEG economy and timed effects.
// ============================================================

import type { TimedEffect, GameModifiers as GameModifiersSnapshot } from '../types/GameTypes';
import { Player } from '../types/GameTypes';

export interface IGameModifiers {
  readonly player: Player;
  legRateBase: number;
  legRateBonus: number;
  legRatePenalty: number;
  legRateFrozen: boolean;
  royalCostDiscount: number;
  royalCostPenalty: number;
  legPool: number;
  legOverflow: boolean;
  timedEffects: TimedEffect[];

  // COMPUTED RATES
  getEffectiveLEGRate(): number;
  getLEGCap(): number;
  getEffectiveCardCost(baseCost: number, isRoyal: boolean): number;

  // LEG POOL OPERATIONS
  gainLEG(): number;
  spendLEG(amount: number): boolean;
  addLEG(amount: number): void;
  removeLEG(amount: number): void;
  canAfford(baseCost: number, isRoyal: boolean): boolean;

  // RATE MODIFIERS
  addLEGRatePenalty(amount: number): void;
  setRoyalDiscount(castle: number, temple: number, princess: number): void;
  setLEGRateBonus(princessCount: number): void;

  // TIMED EFFECTS
  addTimedEffect(effect: TimedEffect): void;
  tickEffects(): TimedEffect[];
  hasEffect(type: TimedEffect['type']): boolean;
  removeEffect(type: TimedEffect['type']): void;
  clearOverflow(): void;

  // SERIALIZATION
  snapshot(): GameModifiersSnapshot;
}
