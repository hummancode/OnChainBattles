import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const MESSENGER_DEF: CardDefinition = {
  id: 'messenger', name: 'Messenger',
  flavorText: 'Swift enough to carry news before it matters.',
  class: U, allegiance: STD, subtypes: [], cost: 1, copies: 2,
  stats: { atk: 0, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.NONE,
      customMove: {
        offsets: [
          { dx: -2, dy: -2 }, { dx: 2, dy: -2 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 },
          { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 1 },
          { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: -2, dy: 2 }, { dx: 2, dy: 2 },
        ],
      },
    },
  flags: [CardFlag.SWIFT],
  abilities: [
    { type: AbilityType.AURA_SUPPRESS_KING_ATK, params: {} },
  ],
  abilityText: 'Aura: adjacent enemy King ATK = 0.',
};
