// ============================================================
// GameContext.ts
// Shared context object passed to all phase modules and queries.
// Contains references to all game subsystems.
// Phase modules and UnitQuery never import GameEngine directly.
// ============================================================

import type { Board } from './Board';
import type { GameModifiers } from './GameModifiers';
import type { PlayerState } from './PlayerState';
import type { AuraSystem } from './AuraSystem';
import type { Unit, Position } from './types/GameTypes';
import type { GameEvent } from './types/EventTypes';
import type { PendingCommand } from './pending/PendingCommand';
import { Player, TurnPhase, EngineStatus } from './types/GameTypes';

/**
 * Immutable reference bag — every subsystem the engine owns.
 * Passed by reference, so phases can mutate board/mods/players directly.
 * Events are collected via emit(), which the engine wires to its subscriber list.
 */
export interface GameContext {
  // Core subsystems
  readonly board: Board;
  readonly mods: [GameModifiers, GameModifiers];
  readonly players: [PlayerState, PlayerState];
  readonly auras: AuraSystem;

  // Turn state (mutable by engine only)
  activePlayer: Player;
  turnNumber: number;
  phase: TurnPhase;
  status: EngineStatus;

  // Graveyard registry (instanceId → cardId)
  readonly graveyard: Map<string, string>;

  // Pending command set by phase modules when ability needs player input
  pending?: PendingCommand;

  // Unit factory — engine provides this so phases don't need the counter
  createUnit(cardId: string, owner: Player, position: Position): Unit;

  // Event emitter — phases push events through this
  emit(event: GameEvent): void;

  // Apply events to state + emit (for ability results that produce events)
  applyEvents(events: GameEvent[]): void;
}

/**
 * Helper: get the opponent of a player.
 * Used throughout phases — exported here to avoid duplication.
 */
export function opponent(player: Player): Player {
  return player === Player.P1 ? Player.P2 : Player.P1;
}
