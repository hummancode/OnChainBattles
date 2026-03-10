import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';

function onDeployScout(ctx: AbilityContext): AbilityResult {
  const { count } = ctx.params as { count: number };
  const opponentPs = ctx.players[ctx.owner === Player.P1 ? Player.P2 : Player.P1];
  const topCards = opponentPs.peekTop(count);
  return {
    events: [{
      type:     'SCOUT_RESULT',
      player:   ctx.owner,
      topCards,
    }]
  };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_SCOUT_DECK, onDeployScout);
