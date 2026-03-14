import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, ROY } from './_aliases.js';

export const SWORDSMAN_DEF: CardDefinition = {
  id: 'swordsman', name: 'Swordsman',
  flavorText: 'A knight in all but title.',
  class: U, allegiance: ROY, subtypes: [], cost: 3, copies: 2,
  stats: { atk: 3, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [],
  abilityText: 'Reform result. Requires Royal cost engine to play economically.',
};
