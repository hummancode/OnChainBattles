import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingInteraction } from '../../types/AbilityTypes';
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

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Mystic: choose a unit from your graveyard to revive.',
    validTargetIds: graveIds,
    resumeCallback: () => {},
  };

  // Drain applied after resolve — GameEngine emits it after interact resolves
  return { events: [], pending };
}

AbilityHandlerRegistry.register('mysticDeployHandler', mysticDeployHandler);
