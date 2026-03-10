import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';

function spellDrainLeg(ctx: AbilityContext): AbilityResult {
  const { amount } = ctx.params as { amount: number; target: string };
  const opp = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const oldRate = ctx.mods[opp].getEffectiveLEGRate();
  return {
    events: [{
      type:    'LEG_RATE_CHANGED',
      player:   opp,
      oldRate,
      newRate:  Math.max(1, oldRate - amount),
      reason:   'CASUS_BELLI',
    }]
  };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DRAIN_LEG_RATE_PERM, spellDrainLeg);
