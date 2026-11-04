import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const DISEASE_DEF: CardDefinition = {
  id: 'disease', name: 'Disease',
  flavorText: 'The rot spreads from stone to stone.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, params: { damage: 2, duration: 3 } },
  ],
  abilityText: 'Target an enemy Structure. It takes 2 damage at the start of your turn for 3 turns. Units adjacent to it (both sides) take 1 damage per tick.',
};
