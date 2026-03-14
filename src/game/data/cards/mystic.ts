import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const MYSTIC_DEF: CardDefinition = {
  id: 'mystic', name: 'Mystic',
  flavorText: 'She sees beyond death. The cost is paid in kind.',
  class: U, allegiance: STD, subtypes: [], cost: 6, copies: 1,
  stats: { atk: 2, def: 5, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.CUSTOM, handler: 'mysticDeployHandler' },
  ],
  abilityText: 'On Deploy: revive one unit from your graveyard to any free square in your half. Permanently −1 your LEG rate (min 1).',
};
