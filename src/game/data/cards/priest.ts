import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const PRIEST_DEF: CardDefinition = {
  id: 'priest', name: 'Priest',
  flavorText: 'The wounded are never truly lost.',
  class: U, allegiance: ROY, subtypes: [], cost: 6, copies: 2,
  stats: { atk: 1, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEPLOY_HEAL_FRIENDLY, params: { amount: 'FULL' } },
  ],
  abilityText: 'On Deploy: fully restore one friendly unit\'s HP (including King).',
};
