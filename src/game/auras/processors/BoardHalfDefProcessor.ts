// Commander: own-half friendly units +DEF

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, otherPlayer, addDelta } from '../auraHelpers';

export class BoardHalfDefProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_BOARD_HALF_DEF;

  process(source: Unit, allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const p = params(ability);
      const benefitOwner = p.half === 'OWN' ? source.owner : otherPlayer(source.owner);
      for (const u of allUnits) {
        if (u.owner === source.owner && board.isOwnHalf(u.position.col, u.position.row, benefitOwner)) {
          addDelta(deltas, u.instanceId, 0, p.amount, 0);
        }
      }
    }
  }
}
