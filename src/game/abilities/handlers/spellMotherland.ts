import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function motherlandHandler(ctx: AbilityContext): AbilityResult {
  const count = ctx.board.getStructures(ctx.owner).length;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         ctx.owner,
      cardId:         '__DRAW_OVERFLOW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}

AbilityHandlerRegistry.register('motherlandHandler', motherlandHandler);
