import { AbilityType } from '../../types/AbilityTypes';
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';
import { getValidDeploySquares } from '../../MovementRules';

function peasantRevoltHandler(ctx: AbilityContext): AbilityResult {
  const allStructures = ctx.board.getStructures();
  const count = allStructures.length;

  const events: GameEvent[] = [];

  const freeSquares = getValidDeploySquares(ctx.owner, ctx.board);
  const toSummon = Math.min(count, freeSquares.length);
  for (let i = 0; i < toSummon; i++) {
    events.push({
      type:       'UNIT_PLACED',
      instanceId: '', // engine assigns a deterministic id
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

  // Permanent +2 Royal cost penalty
  ctx.mods[ctx.owner].royalCostPenalty += 2;

  return { events };
}

AbilityHandlerRegistry.register('peasantRevoltHandler', peasantRevoltHandler);
// The card definition references AbilityType.SPELL_REVOLT — register under that key too
// (it was only reachable as 'peasantRevoltHandler', so the spell silently did nothing).
AbilityHandlerRegistry.register(AbilityType.SPELL_REVOLT, peasantRevoltHandler);
