import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const KNIGHTS_GUARD_DEF: CardDefinition = {
  id: 'knights_guard', name: "King's Guard",
  flavorText: 'Sworn in blood. Unwavering in duty.',
  class: U, allegiance: ROY, subtypes: [], cost: 12, copies: 1,
  stats: { atk: 6, def: 12, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_AUTO_HEAL,      params: { amount: 2 } },
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
  ],
  abilityText: 'Auto-heal +2 HP at start of your LEG phase. While on board: −1 Royal card cost.',
};
