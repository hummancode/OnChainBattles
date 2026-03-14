import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const CIVIL_WAR_DEF: CardDefinition = {
  id: 'civil_war', name: 'Civil War',
  flavorText: 'When the kingdom turns on itself, all suffer.',
  class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_FREEZE_LEG_RATE, params: { duration: 3 } },
  ],
  abilityText: 'Both players\' LEG rates are frozen at 0 for 3 turns. Existing pools are unaffected.',
};
