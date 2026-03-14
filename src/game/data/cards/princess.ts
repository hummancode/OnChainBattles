import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const PRINCESS_DEF: CardDefinition = {
  id: 'princess', name: 'Princess',
  flavorText: 'Her mere presence commands the court.',
  class: U, allegiance: ROY, subtypes: [], cost: 5, copies: 1,
  stats: { atk: 0, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.NONE },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_LEG_BONUS,      params: { amount: 1 } },
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
  ],
  abilityText: '+1 LEG/turn while on board. −1 Royal card cost while on board.',
};
