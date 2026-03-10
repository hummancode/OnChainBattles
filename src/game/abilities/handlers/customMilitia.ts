import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { AbilityContext, AbilityResult } from '../types';

function militiaDeployHandler(ctx: AbilityContext): AbilityResult {
  const hasMilitiaInDeck = ctx.players[ctx.owner].deck.includes('militia');
  if (!hasMilitiaInDeck) return { events: [] };

  const freeSquares = ctx.board.getFreeSquaresInHalf(ctx.owner);
  if (freeSquares.length === 0) return { events: [] };

  const pos = freeSquares[0];
  return {
    events: [{
      type:        'UNIT_PLACED',
      instanceId:  `militia_summoned_${Date.now()}`,
      cardId:      'militia',
      owner:       ctx.owner,
      col:         pos.col,
      row:         pos.row,
      isActive:    true,
    }]
  };
}

AbilityHandlerRegistry.register('militiaDeployHandler', militiaDeployHandler);
