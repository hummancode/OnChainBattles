import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function mysticDeployHandler(ctx: AbilityContext): AbilityResult {
  const graveIds = ctx.players[ctx.owner].getGraveyard();

  const drainEvent: GameEvent = {
    type:    'LEG_RATE_CHANGED',
    player:   ctx.owner,
    oldRate:  ctx.mods[ctx.owner].getEffectiveLEGRate(),
    newRate:  Math.max(1, ctx.mods[ctx.owner].getEffectiveLEGRate() - 1),
    reason:   'MYSTIC',
  };

  if (graveIds.length === 0) return { events: [drainEvent] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  'mysticDeployHandler',
    reason:         'Mystic: choose a unit from your graveyard to revive.',
    validTargetIds: graveIds,
    deferredEvents: [drainEvent],
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('mysticDeployHandler', mysticDeployHandler);
