// ============================================================
// AuraProcessor.ts
// Interface for Chain of Responsibility aura processors.
// Each processor handles one aura type and accumulates deltas.
// ============================================================

import type { Unit } from '../types/GameTypes';
import type { IBoard } from '../interfaces/IBoard';
import type { IGameModifiers } from '../interfaces/IGameModifiers';

export interface StatDelta {
  atkDelta: number;
  defDelta: number;
  moveDelta: number;
}

/**
 * A stat-aura processor: examines a source unit's abilities
 * and accumulates stat deltas for affected units.
 */
export interface AuraProcessor {
  readonly auraType: string;
  process(
    source: Unit,
    allUnits: Unit[],
    board: IBoard,
    deltas: Map<string, StatDelta>
  ): void;
}

/**
 * An economy-aura processor: recalculates modifier values
 * (royal discount, LEG bonus) for a single player's units.
 */
export interface EconomyProcessor {
  readonly auraType: string;
  process(
    ownUnits: Unit[],
    modifiers: IGameModifiers
  ): number;
}
