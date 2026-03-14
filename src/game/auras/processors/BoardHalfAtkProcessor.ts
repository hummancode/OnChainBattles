// Commander: enemy-half friendly units +ATK
// Only applies when the Commander itself is on the enemy half.
// Neutral zone (middle row) = no aura.

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, otherPlayer, addDelta } from '../auraHelpers';

export class BoardHalfAtkProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_BOARD_HALF_ATK;

  process(source: Unit, allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const p = params(ability);

      const enemyOwner = otherPlayer(source.owner);

      // Commander must be on the ENEMY half for ATK aura to activate
      if (!board.isOwnHalf(source.position.col, source.position.row, enemyOwner)) continue;

      // Buff all friendly units on enemy half
      for (const u of allUnits) {
        if (u.owner === source.owner && board.isOwnHalf(u.position.col, u.position.row, enemyOwner)) {
          addDelta(deltas, u.instanceId, p.amount, 0, 0, `${source.cardId}:BOARD_HALF_ATK`);
        }
      }
    }
  }
}
