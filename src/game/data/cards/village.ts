import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { ST, STD, STRUC } from './_aliases.js';

export const VILLAGE_DEF: CardDefinition = {
  id: 'village', name: 'Village',
  flavorText: 'The people tire of marching armies.',
  class: ST, allegiance: STD, subtypes: [STRUC], cost: 2, copies: 2,
  stats: { atk: 0, def: 4, movement: MovementType.STATIC, attackPattern: AtkPattern.NONE },
  flags: [CardFlag.BUILD_DELAY],
  abilities: [
    { type: AbilityType.AURA_VILLAGE_SLOW, params: { amount: 1 } },
    { type: AbilityType.PASSIVE_BUILD_DELAY, params: {} },
  ],
  abilityText: 'Build Delay: inactive 1 turn. Aura: all adjacent enemy units −1 movement (min 0). Immobilized units may still attack this structure.',
};
