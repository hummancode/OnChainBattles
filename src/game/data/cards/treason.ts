import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const TREASON_DEF: CardDefinition = {
  id: 'treason', name: 'Treason',
  flavorText: 'Even loyal men have a price.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_TREASON, params: {} },
  ],
  abilityText: 'Target an enemy non-Royal unit. It fights for you this turn only. At end of turn: returns to original position, exhausted.',
};
