// Pikeman: +ATK +DEF if friendly units on both horizontal sides

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, addDelta } from '../auraHelpers';

export class PikemanFlankProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_PIKEMAN_FLANK;

  process(source: Unit, _allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const { col, row } = source.position;
      const leftUnit  = board.isInBounds(col - 1, row) ? board.getUnit(col - 1, row) : null;
      const rightUnit = board.isInBounds(col + 1, row) ? board.getUnit(col + 1, row) : null;
      const hasLeft   = leftUnit  !== null && leftUnit.owner  === source.owner;
      const hasRight  = rightUnit !== null && rightUnit.owner === source.owner;
      if (hasLeft && hasRight) {
        const p = params(ability);
        addDelta(deltas, source.instanceId, p.bonusAtk, p.bonusDef, 0);
      }
    }
  }
}
