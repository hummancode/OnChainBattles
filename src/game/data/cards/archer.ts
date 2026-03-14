import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, STD } from './_aliases.js';
import { PATTERN_ARCHER_ATTACK } from '../MovementPresets';

export const ARCHER_DEF: CardDefinition = {
  id: 'archer', name: 'Archer',
  flavorText: 'Precision over brute force.',
  class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
  stats: { atk: 3, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.DIAGONAL_RANGED_2,
    customAttack: PATTERN_ARCHER_ATTACK,
  },
  flags: [],
  abilities: [],
  abilityText: 'Ranged attack: targets any unit diagonally within 2 squares. Ignores adjacency.',
};
