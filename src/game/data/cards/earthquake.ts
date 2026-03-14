import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const EARTHQUAKE_DEF: CardDefinition = {
  id: 'earthquake', name: 'Earthquake',
  flavorText: 'The earth itself takes sides.',
  class: SP, allegiance: STD, subtypes: [], cost: 5, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_EARTHQUAKE, params: {} },
  ],
  abilityText: 'Choose a column (A–F). All units in that column take 3 damage. Triggers Foot Soldier On Death.',
};
