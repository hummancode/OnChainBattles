// ============================================================
// PendingCommand.ts — Serializable interaction commands
//
// Replaces the old PendingInteraction callback anti-pattern.
// Each variant is pure data — no functions, fully serializable.
// The engine pauses on a PendingCommand and resumes when the
// player makes a selection, resolved via PendingCommandResolver.
// ============================================================

import type { Position } from '../types/GameTypes';
import type { Player } from '../types/GameTypes';
import type { GameEvent } from '../types/EventTypes';

/** Present when the pending came from a SPELL: cancelling it refunds the card + LEG. */
export interface PendingRefund {
  cardId: string;
  legCost: number;
}

export type PendingCommand = ({
  refund?: PendingRefund;
}) & (
  | {
      kind: 'TARGET';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      validTargetIds: string[];
      reason: string;
      deferredEvents: GameEvent[];
    }
  | {
      kind: 'POSITION';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      validPositions: Position[];
      reason: string;
      deferredEvents: GameEvent[];
    }
  | {
      kind: 'COLUMN';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      reason: string;
      deferredEvents: GameEvent[];
    }
  | {
      kind: 'DISCARD';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      count: number;
      reason: string;
      deferredEvents: GameEvent[];
    });
