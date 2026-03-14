import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const FOOT_SOLDIER_DEF: CardDefinition = {
  id: 'foot_soldier', name: 'Foot Soldier',
  flavorText: 'Cannon fodder with a silver lining.',
  class: U, allegiance: STD, subtypes: [], cost: 1, copies: 3,
  stats: { atk: 1, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEATH_DRAW, params: { count: 1 } },
  ],
  abilityText: 'On Death: draw 1 card. Reform target: becomes Swordsman.',
};
