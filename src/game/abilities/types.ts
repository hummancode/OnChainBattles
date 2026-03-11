import type { Unit, Position } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import type { Board } from '../Board';
import type { PlayerState } from '../PlayerState';
import type { GameModifiers } from '../GameModifiers';
import type { GameEvent } from '../types/EventTypes';
import type { PendingCommand } from '../pending/PendingCommand';

export { Player };

export interface AbilityResult {
  events: GameEvent[];
  pending?: PendingCommand;
}

export interface AbilityContext {
  readonly cardId: string;
  readonly owner: Player;
  readonly position?: Position;
  readonly board: Board;
  readonly players: [PlayerState, PlayerState];
  readonly mods: [GameModifiers, GameModifiers];
  readonly unit?: Unit;
  readonly params: Record<string, any>;
}

export type AbilityHandlerFn = (ctx: AbilityContext) => AbilityResult;
