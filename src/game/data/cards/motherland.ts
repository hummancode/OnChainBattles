import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const MOTHERLAND_DEF: CardDefinition = {
  id: 'motherland', name: 'Motherland',
  flavorText: 'The homeland always gives more.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_DRAW_STRUCTURES, params: { overflow: true } },
  ],
  abilityText: 'Draw 1 card per Structure you control. Can overflow hand limit this turn. Overflow cards are lost at end of turn.',
};
