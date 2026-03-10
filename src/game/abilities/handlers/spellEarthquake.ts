import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType, type PendingInteraction } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';

function spellEarthquake(_ctx: AbilityContext): AbilityResult {
  const pending: PendingInteraction = {
    kind:           'COLUMN',
    reason:         'Choose a column (A\u2013F) to strike with the Earthquake.',
    resumeCallback: () => {},
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_EARTHQUAKE, spellEarthquake);
