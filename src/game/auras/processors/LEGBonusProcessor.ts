// Economy: LEG rate bonus from Princess

import type { EconomyProcessor } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IGameModifiers } from '../../interfaces/IGameModifiers';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params } from '../auraHelpers';

export class LEGBonusProcessor implements EconomyProcessor {
  readonly auraType = AbilityType.AURA_LEG_BONUS;

  process(ownUnits: Unit[], _modifiers: IGameModifiers): number {
    let legBonus = 0;
    for (const u of ownUnits) {
      if (!u.isActive) continue;
      const def = getCard(u.cardId);
      for (const ab of def.abilities) {
        if (ab.type === 'CUSTOM') continue;
        if (ab.type === AbilityType.AURA_LEG_BONUS && u.cardId !== 'king') {
          legBonus += params(ab).amount;
        }
      }
    }
    return legBonus;
  }
}
