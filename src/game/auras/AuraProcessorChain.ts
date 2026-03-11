// ============================================================
// AuraProcessorChain.ts
// Assembles stat and economy processors into an ordered chain.
// Replaces the switch statement from the old evaluateAuras().
// ============================================================

import type { AuraProcessor, EconomyProcessor, StatDelta } from './AuraProcessor';
import type { Unit } from '../types/GameTypes';
import type { IBoard } from '../interfaces/IBoard';

// Stat processors
import { AdjDefProcessor } from './processors/AdjDefProcessor';
import { BoardHalfDefProcessor } from './processors/BoardHalfDefProcessor';
import { BoardHalfAtkProcessor } from './processors/BoardHalfAtkProcessor';
import { VillageSlowProcessor } from './processors/VillageSlowProcessor';
import { PikemanFlankProcessor } from './processors/PikemanFlankProcessor';

// Economy processors
import { RoyalDiscountProcessor } from './processors/RoyalDiscountProcessor';
import { LEGBonusProcessor } from './processors/LEGBonusProcessor';

/** Default stat-aura chain in evaluation order. */
export function createStatChain(): AuraProcessor[] {
  return [
    new AdjDefProcessor(),
    new BoardHalfDefProcessor(),
    new BoardHalfAtkProcessor(),
    new VillageSlowProcessor(),
    new PikemanFlankProcessor(),
  ];
}

/** Default economy-aura chain. */
export function createEconomyChain(): EconomyProcessor[] {
  return [
    new RoyalDiscountProcessor(),
    new LEGBonusProcessor(),
  ];
}

/**
 * Run all stat processors for a single source unit.
 * Each processor checks if the source has the relevant ability.
 */
export function runStatChain(
  chain: AuraProcessor[],
  source: Unit,
  allUnits: Unit[],
  board: IBoard,
  deltas: Map<string, StatDelta>
): void {
  for (const processor of chain) {
    processor.process(source, allUnits, board, deltas);
  }
}
