// Economy: royal cost discount from Castle, Temple, Princess, Kings Guard

import type { EconomyProcessor } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IGameModifiers } from '../../interfaces/IGameModifiers';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params } from '../auraHelpers';

export class RoyalDiscountProcessor implements EconomyProcessor {
  readonly auraType = AbilityType.AURA_ROYAL_DISCOUNT;

  process(ownUnits: Unit[], _modifiers: IGameModifiers): number {
    let discount = 0;
    for (const u of ownUnits) {
      if (!u.isActive) continue;
      const def = getCard(u.cardId);
      for (const ab of def.abilities) {
        if (ab.type === 'CUSTOM') continue;
        if (ab.type === AbilityType.AURA_ROYAL_DISCOUNT) {
          discount += params(ab).amount;
        }
      }
    }
    return discount;
  }
}
