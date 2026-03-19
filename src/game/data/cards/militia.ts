import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const MILITIA_DEF: CardDefinition = {
  id: 'militia', name: 'Militia',
  flavorText: 'Where one falls, another rises.',
  class: U, allegiance: STD, subtypes: [], cost: 2, copies: 2,
  stats: { atk: 1, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [],
  abilities: [
    { type: AbilityType.CUSTOM, handler: 'militiaDeployHandler' },
  ],
  abilityText: 'On Deploy: pull the next Militia copy from your deck to any free square in your half.',
};
