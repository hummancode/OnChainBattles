import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const SCRIBE_DEF: CardDefinition = {
  id: 'scribe', name: 'Scribe',
  flavorText: 'The pen shapes the future of the crown.',
  class: U, allegiance: ROY, subtypes: [], cost: 5, copies: 2,
  stats: { atk: 0, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.NONE },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEPLOY_DRAW, params: { count: 2, filter: 'ROYAL' } },
  ],
  abilityText: 'On Deploy: draw 2 Royal cards from your deck (skip non-Royal until count met or deck empty).',
};
