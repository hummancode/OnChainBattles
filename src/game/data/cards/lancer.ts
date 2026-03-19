import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD, CAV } from './_aliases.js';

export const LANCER_DEF: CardDefinition = {
  id: 'lancer', name: 'Lancer',
  flavorText: 'At full gallop, nothing stops the charge.',
  class: U, allegiance: STD, subtypes: [CAV], cost: 4, copies: 2,
  stats: { atk: 3, def: 2, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV,
      customAttack: {
        offsets: [
          { dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 },
        ],
      },
      customMove: {
        offsets: [
          { dx: 0, dy: -2 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
          { dx: -2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
          { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 },
        ],
      },
    },
  flags: [CardFlag.LANCER_CHARGE],
  abilities: [
    { type: AbilityType.PASSIVE_LANCER_CHARGE, params: {} },
  ],
  abilityText: 'Cavalry. Charge: may MOVE and ATTACK in the same turn. After moving, can only attack in the direction of movement.',
};
