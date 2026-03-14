import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const KING_DEF: CardDefinition = {
  id: 'king', name: 'King',
  flavorText: 'All legitimacy flows from the crown.',
  class: U, allegiance: ROY, subtypes: [], cost: 0, copies: 1,
  stats: { atk: 1, def: 10, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_LEG_BONUS, params: { amount: 1 } },
  ],
  abilityText: 'Pre-placed. Generates +1 LEG/turn. Enemy King in your half: lose 1 LEG this turn. Win condition.',
};
