// ============================================================
// PendingCommandResolver.ts — Pure-function command resolution
//
// When the player makes a selection (target, position, column,
// or discard), this resolver produces the GameEvent[] to apply.
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
  selection: PendingSelection,
): GameEvent[] {
  const events: GameEvent[] = [];

  // POSITION summon — place a unit at the selected position
  if (command.kind === 'POSITION' && selection.kind === 'POSITION') {
    events.push({
      type: 'UNIT_PLACED',
      instanceId: `${command.sourceCardId}_pending_${Date.now()}`,
      cardId: command.sourceCardId,
      owner: command.owner,
      col: selection.col,
      row: selection.row,
      isActive: true,
    } as GameEvent);
  }

  // Append deferred events (e.g., Mystic LEG drain)
  events.push(...command.deferredEvents);
  return events;
}
