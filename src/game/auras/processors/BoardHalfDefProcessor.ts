// Commander: own-half friendly units +DEF
// Only applies when the Commander itself is on its own half.
// Neutral zone (middle row) = no aura.

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, addDelta } from '../auraHelpers';

export class BoardHalfDefProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_BOARD_HALF_DEF;

  process(source: Unit, allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const p = params(ability);

      // Commander must be on its OWN half for DEF aura to activate
      if (!board.isOwnHalf(source.position.col, source.position.row, source.owner)) continue;

      // Buff all friendly units on own half
      for (const u of allUnits) {
        if (u.owner === source.owner && board.isOwnHalf(u.position.col, u.position.row, source.owner)) {
          addDelta(deltas, u.instanceId, 0, p.amount, 0, `${source.cardId}:BOARD_HALF_DEF`);
        }
      }
    }
  }
}
