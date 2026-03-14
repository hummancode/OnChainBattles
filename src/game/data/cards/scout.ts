import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD, CAV } from './_aliases.js';

export const SCOUT_DEF: CardDefinition = {
  id: 'scout', name: 'Scout',
  flavorText: 'Knowledge is the first casualty of ignorance.',
  class: U, allegiance: STD, subtypes: [CAV], cost: 2, copies: 2,
  stats: { atk: 1, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV,
      customAttack: {
        offsets: [
          { dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 },
        ],
      },
      customMove: {
        offsets: [
          { dx: -1, dy: -2 }, { dx: 0, dy: -2 }, { dx: 1, dy: -2 }, { dx: -2, dy: -1 },
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 2, dy: -1 },
          { dx: -2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
          { dx: -2, dy: 1 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
          { dx: 2, dy: 1 }, { dx: -1, dy: 2 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 },
        ],
      },},
  flags: [],
  backstabBonus: 1,
  abilities: [
    { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 2 } },
  ],
  abilityText: 'Cavalry. On Deploy: reveal the top 2 cards of opponent\'s deck (visible to you only).',
};
