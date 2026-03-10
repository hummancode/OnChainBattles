import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';

function spellFreezeLeg(ctx: AbilityContext): AbilityResult {
  const p1Rate = ctx.mods[Player.P1].getEffectiveLEGRate();
  const p2Rate = ctx.mods[Player.P2].getEffectiveLEGRate();
  return {
    events: [
      { type: 'LEG_RATE_CHANGED', player: Player.P1, oldRate: p1Rate, newRate: 0, reason: 'CIVIL_WAR' },
      { type: 'LEG_RATE_CHANGED', player: Player.P2, oldRate: p2Rate, newRate: 0, reason: 'CIVIL_WAR' },
    ]
  };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_FREEZE_LEG_RATE, spellFreezeLeg);
