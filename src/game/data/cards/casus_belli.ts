import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const CASUS_BELLI_DEF: CardDefinition = {
  id: 'casus_belli', name: 'Casus Belli',
  flavorText: 'A pretext for war is always found.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_DRAIN_LEG_RATE_PERM, params: { amount: 1, target: 'OPPONENT' } },
    { type: AbilityType.SPELL_FORWARD_DEPLOY,       params: {} },
  ],
  abilityText: 'Permanently −1 opponent\'s LEG rate (min 1). Then deploy one card from your hand to any free square in the front row of enemy half.',
};
