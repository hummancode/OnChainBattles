import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, ROY } from './_aliases.js';

export const COUP_DEF: CardDefinition = {
  id: 'coup', name: 'Coup',
  flavorText: 'Power seized in a single night.',
  class: SP, allegiance: ROY, subtypes: [], cost: 12, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_COUP, params: {} },
  ],
  abilityText: 'Target an enemy Royal unit (not King). If your remaining LEG ≥ target\'s base cost: capture it (it joins your side). Otherwise: banish it from the game.',
};
