import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';
import { getCard } from '../../data/CardRegistry';
import { CardClass } from '../../types/CardTypes';
import { getValidDeploySquares } from '../../MovementRules';

function mysticDeployHandler(ctx: AbilityContext): AbilityResult {
  // The LEG-rate cost is unconditional — applied now, not deferred (cancelling used to skip it).
  const drainEvent: GameEvent = {
    type:    'LEG_RATE_CHANGED',
    player:   ctx.owner,
    oldRate:  ctx.mods[ctx.owner].getEffectiveLEGRate(),
    newRate:  Math.max(1, ctx.mods[ctx.owner].getEffectiveLEGRate() - 1),
    reason:   'MYSTIC',
  };

  // Revive the strongest dead unit (the old TARGET-by-instanceId flow could never resolve:
  // dead units aren't on the board, so selectTarget always refused).
  const dead = ctx.players[ctx.owner].graveyardCards
    .filter(id => id !== 'king' && getCard(id).class === CardClass.UNIT);
  if (dead.length === 0) return { events: [drainEvent] };
  const revive = [...dead].sort((a, b) => getCard(b).cost - getCard(a).cost)[0];

  const validPositions = getValidDeploySquares(ctx.owner, ctx.board);
  if (validPositions.length === 0) return { events: [drainEvent] };

  const pending: PendingCommand = {
    kind:           'POSITION',
    owner:          ctx.owner,
    sourceCardId:   revive,
    sourceAbility:  'mysticDeployHandler',
    reason:         `Mystic: place the revived ${getCard(revive).name} on your half.`,
    validPositions,
    deferredEvents: [],
  };
  return { events: [drainEvent], pending };
}

AbilityHandlerRegistry.register('mysticDeployHandler', mysticDeployHandler);
