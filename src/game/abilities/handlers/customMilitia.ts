import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function militiaDeployHandler(ctx: AbilityContext): AbilityResult {
  const hasMilitiaInDeck = ctx.players[ctx.owner].deck.includes('militia');
  if (!hasMilitiaInDeck) return { events: [] };

  const freeSquares = ctx.board.getFreeSquaresInHalf(ctx.owner);
  if (freeSquares.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'POSITION',
    owner:          ctx.owner,
    sourceCardId:   'militia',
    sourceAbility:  'militiaDeployHandler',
    reason:         'Place the summoned Militia on your half of the board.',
    validPositions: freeSquares,
    deferredEvents: [],
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('militiaDeployHandler', militiaDeployHandler);
