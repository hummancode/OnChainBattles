import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const PEASANT_REVOLT_DEF: CardDefinition = {
  id: 'peasant_revolt', name: 'Peasant Revolt',
  flavorText: 'The masses have little to lose.',
  class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_REVOLT, params: {} },
  ],
  abilityText: 'Summon 1 Militia to any free square in your half per Structure on the board (both sides). Permanent penalty to you: −1 LEG rate (min 1) and +2 Royal cost for the rest of the game.',
};
