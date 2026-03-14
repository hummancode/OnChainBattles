import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { ST, ROY, STRUC } from './_aliases.js';

export const CASTLE_DEF: CardDefinition = {
  id: 'castle', name: 'Castle',
  flavorText: 'Stone and mortar, patience and power.',
  class: ST, allegiance: ROY, subtypes: [STRUC], cost: 4, copies: 1,
  stats: { atk: 3, def: 8, movement: MovementType.STATIC, attackPattern: AtkPattern.AREA_ADJ },
  flags: [CardFlag.BUILD_DELAY],
  abilities: [
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
    { type: AbilityType.AURA_ADJ_DEF,        params: { amount: 1 } },
    { type: AbilityType.PASSIVE_BUILD_DELAY,  params: {} },
    { type: AbilityType.PASSIVE_SPAWN,        params: { cardId: 'foot_soldier', interval: 3 } },
  ],
  abilityText: 'Build Delay: inactive for 1 turn after placement. Attacks all adjacent enemies each LEG phase. Adjacent friendlies +1 DEF. Spawns 1 Foot Soldier every 3 turns. −1 Royal cost.',
};
