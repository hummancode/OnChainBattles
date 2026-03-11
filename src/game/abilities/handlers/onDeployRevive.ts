import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function onDeployRevive(ctx: AbilityContext): AbilityResult {
  const graveIds = ctx.players[ctx.owner].getGraveyard();
  if (graveIds.length === 0) {
    return {
      events: [{
        type:    'LEG_RATE_CHANGED',
        player:   ctx.owner,
        oldRate:  ctx.mods[ctx.owner].getEffectiveLEGRate(),
        newRate:  Math.max(1, ctx.mods[ctx.owner].getEffectiveLEGRate() - 1),
        reason:   'MYSTIC',
      }]
    };
  }

  const pending: PendingCommand = {
    kind:           'TARGET',
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.ON_DEPLOY_REVIVE,
    reason:         'Choose a unit from your graveyard to revive.',
    validTargetIds: graveIds,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_REVIVE, onDeployRevive);
