import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, ROY, CAV } from './_aliases.js';

export const KNIGHT_DEF: CardDefinition = {
  id: 'knight', name: 'Knight',
  flavorText: 'Heavy, fast, devastating.',
  class: U, allegiance: ROY, subtypes: [CAV], cost: 9, copies: 2,
  stats: { atk: 5, def: 8, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [],
  abilityText: 'Cavalry. Requires Royal discount engine to play before late game.',
};
