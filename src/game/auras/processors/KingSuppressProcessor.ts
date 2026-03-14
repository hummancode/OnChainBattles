// Messenger: adjacent enemy King's ATK = 0

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { addDelta } from '../auraHelpers';

export class KingSuppressProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_SUPPRESS_KING_ATK;

  process(source: Unit, _allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const adjacents = board.getAdjacentUnits(source.position.col, source.position.row);
      for (const adj of adjacents) {
        if (adj.owner !== source.owner && adj.cardId === 'king') {
          // Zero the King's ATK by subtracting its base value
          addDelta(deltas, adj.instanceId, -adj.baseAtk, 0, 0, `${source.cardId}:SUPPRESS_KING_ATK`);
        }
      }
    }
  }
}
