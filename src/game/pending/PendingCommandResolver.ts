// ============================================================
// PendingCommandResolver.ts — Pure-function command resolution
//
// When the player makes a selection (target, position, column,
// or discard), this resolver produces the GameEvent[] to apply.
// Currently returns deferredEvents carried by the command.
// Per-ability resolution logic can be added here as needed.
// ============================================================

import type { PendingCommand } from './PendingCommand';
import type { GameEvent } from '../types/EventTypes';

export type PendingSelection =
  | { kind: 'TARGET'; instanceId: string }
  | { kind: 'POSITION'; col: number; row: number }
  | { kind: 'COLUMN'; col: number }
  | { kind: 'DISCARD'; handIndex: number };

/**
 * Resolve a pending command with the player's selection.
 * Returns events to apply to game state after resolution.
 */
export function resolvePending(
  command: PendingCommand,
  _selection: PendingSelection,
): GameEvent[] {
  return command.deferredEvents;
}
