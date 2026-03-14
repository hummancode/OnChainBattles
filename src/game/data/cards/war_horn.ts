import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const WAR_HORN_DEF: CardDefinition = {
  id: 'war_horn', name: 'War Horn',
  flavorText: 'The sound of destiny.',
  class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_WAR_HORN, params: {} },
  ],
  abilityText: 'Draw 2 cards, then discard 1. All your units gain +1 movement this turn.',
};
