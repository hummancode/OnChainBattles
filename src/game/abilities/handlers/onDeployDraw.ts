import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function onDeployDraw(ctx: AbilityContext): AbilityResult {
  const { count, filter } = ctx.params as { count: number; filter?: string };
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         ctx.owner,
      cardId:         filter ? `__DRAW_FILTERED_${filter}__` : '__DRAW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_DRAW, onDeployDraw);
