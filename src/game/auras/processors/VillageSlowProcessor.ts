// Village: adjacent enemies -movement

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, addDelta } from '../auraHelpers';

export class VillageSlowProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_VILLAGE_SLOW;

  process(source: Unit, _allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const adjacents = board.getAdjacentUnits(source.position.col, source.position.row);
      for (const adj of adjacents) {
        if (adj.owner !== source.owner) {
          addDelta(deltas, adj.instanceId, 0, 0, -params(ability).amount);
        }
      }
    }
  }
}
