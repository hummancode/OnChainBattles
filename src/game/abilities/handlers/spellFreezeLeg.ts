import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';

function spellFreezeLeg(ctx: AbilityContext): AbilityResult {
  // A timed freeze, not a rate penalty: LEG_RATE_CHANGED → 0 used to become a PERMANENT
  // penalty (clamped to rate 1) and the CIVIL_WAR_FREEZE effect was never created.
  return { events: [{ type: 'CIVIL_WAR_DECLARED', caster: ctx.owner, turns: ctx.params?.duration ?? 3 }] };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_FREEZE_LEG_RATE, spellFreezeLeg);
