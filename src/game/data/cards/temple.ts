import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { ST, ROY, STRUC } from './_aliases.js';

export const TEMPLE_DEF: CardDefinition = {
  id: 'temple', name: 'Temple',
  flavorText: 'Legitimacy is granted by the divine.',
  class: ST, allegiance: ROY, subtypes: [STRUC], cost: 3, copies: 2,
  stats: { atk: 0, def: 5, movement: MovementType.STATIC, attackPattern: AtkPattern.NONE },
  flags: [CardFlag.BUILD_DELAY],
  abilities: [
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
    { type: AbilityType.PASSIVE_BUILD_DELAY, params: {} },
  ],
  abilityText: 'Build Delay: inactive 1 turn. −1 Royal card cost while on board.',
};
