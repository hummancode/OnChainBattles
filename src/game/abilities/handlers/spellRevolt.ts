import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function peasantRevoltHandler(ctx: AbilityContext): AbilityResult {
  const allStructures = ctx.board.getStructures();
  const count = allStructures.length;

  const events: GameEvent[] = [];

  const freeSquares = ctx.board.getFreeSquaresInHalf(ctx.owner);
  const toSummon = Math.min(count, freeSquares.length);
  for (let i = 0; i < toSummon; i++) {
    events.push({
      type:       'UNIT_PLACED',
      instanceId: `militia_revolt_${i}_${Date.now()}`,
      cardId:     'militia',
      owner:      ctx.owner,
      col:        freeSquares[i].col,
      row:        freeSquares[i].row,
      isActive:   true,
    });
  }

  const oldRate = ctx.mods[ctx.owner].getEffectiveLEGRate();
  events.push({
    type:    'LEG_RATE_CHANGED',
    player:   ctx.owner,
    oldRate,
    newRate:  Math.max(1, oldRate - 1),
    reason:   'REVOLT',
  });

  return { events };
}

AbilityHandlerRegistry.register('peasantRevoltHandler', peasantRevoltHandler);
