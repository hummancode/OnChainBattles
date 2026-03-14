import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
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
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEPLOY_DRAW,       params: { count: 1 } },
    { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 1 } },
    { type: AbilityType.AURA_SUPPRESS_KING_ATK, params: {} },
  ],
  abilityText: 'On Deploy: draw 1 card. Reveal top 1 card of opponent\'s deck. Aura: adjacent enemy King ATK = 0.',
};
