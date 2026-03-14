import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const INQUISITOR_DEF: CardDefinition = {
  id: 'inquisitor', name: 'Inquisitor',
  flavorText: 'The guilty always reveal themselves.',
  class: U, allegiance: ROY, subtypes: [], cost: 7, copies: 2,
  stats: { atk: 4, def: 4, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.ON_KILL_LEG_DRAIN, params: { minTargetCost: 4, amount: 1 } },
  ],
  abilityText: 'On Kill: if target\'s base cost >4, permanently −1 opponent\'s LEG rate (min 1).',
};
