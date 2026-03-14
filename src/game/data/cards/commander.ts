import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY, CAV } from './_aliases.js';

export const COMMANDER_DEF: CardDefinition = {
  id: 'commander', name: 'Commander',
  flavorText: 'Every soldier fights harder in his shadow.',
  class: U, allegiance: ROY, subtypes: [CAV], cost: 7, copies: 1,
  stats: { atk: 5, def: 5, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_BOARD_HALF_DEF, params: { half: 'OWN',   amount: 1 } },
    { type: AbilityType.AURA_BOARD_HALF_ATK, params: { half: 'ENEMY', amount: 1 } },
  ],
  abilityText: 'Cavalry. Aura: when on your half, friendly units there +1 DEF. When on enemy half, friendly units there +1 ATK. Neutral zone: no aura.',
};
