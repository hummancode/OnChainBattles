// Commander: enemy-half friendly units +ATK

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
      const targetHalfOwner = p.half === 'ENEMY' ? otherPlayer(source.owner) : source.owner;
      for (const u of allUnits) {
        if (u.owner === source.owner && board.isOwnHalf(u.position.col, u.position.row, targetHalfOwner)) {
          addDelta(deltas, u.instanceId, p.amount, 0, 0);
        }
      }
    }
  }
}
