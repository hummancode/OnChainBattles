import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const REFORM_DEF: CardDefinition = {
  id: 'reform', name: 'Reform',
  flavorText: 'The soldier becomes the knight he always was.',
  class: SP, allegiance: STD, subtypes: [], cost: 2, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_TRANSFORM_ALL, params: { fromCardId: 'foot_soldier', toCardId: 'swordsman' } },
  ],
  abilityText: 'Transform all Foot Soldiers on the board into Swordsmen. HP scales proportionally. Does not trigger Foot Soldier\'s On Death ability.',
};
