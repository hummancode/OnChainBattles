import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const PIKEMAN_DEF: CardDefinition = {
  id: 'pikeman', name: 'Pikeman',
  flavorText: 'The cavalry\'s nightmare, the footman\'s wall.',
  class: U, allegiance: STD, subtypes: [], cost: 2, copies: 2,
  stats: { atk: 1, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [CardFlag.CAVALRY_COUNTER],
  abilities: [
    { type: AbilityType.AURA_CAVALRY_COUNTER, params: { multiplier: 3 } },
    { type: AbilityType.AURA_PIKEMAN_FLANK,   params: { bonusAtk: 1, bonusDef: 1 } },
  ],
  abilityText: '×3 ATK vs Cavalry. Flank: if any friendly on left AND right squares, gain +1 ATK +1 DEF this turn.',
};
