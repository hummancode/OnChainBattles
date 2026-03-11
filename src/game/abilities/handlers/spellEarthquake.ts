import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function spellEarthquake(ctx: AbilityContext): AbilityResult {
  const pending: PendingCommand = {
    kind:           'COLUMN',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_EARTHQUAKE,
    reason:         'Choose a column (A\u2013F) to strike with the Earthquake.',
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_EARTHQUAKE, spellEarthquake);
