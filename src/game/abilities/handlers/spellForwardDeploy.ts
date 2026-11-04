import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import type { Position } from '../../types/GameTypes';
import { getCard } from '../../data/CardRegistry';
import { CardClass } from '../../types/CardTypes';

function spellForwardDeploy(ctx: AbilityContext): AbilityResult {
  const frontRow = ctx.owner === Player.P1 ? ctx.board.rows - 1 : 0;
  const validPositions: Position[] = [];
  for (let c = 0; c < ctx.board.cols; c++) {
    if (ctx.board.isEmpty(c, frontRow)) validPositions.push({ col: c, row: frontRow });
  }
  // Needs a free square AND a unit in hand to deploy there (the spell itself is no longer in hand)
  const hasUnit = ctx.players[ctx.owner].hand.some(id => getCard(id).class === CardClass.UNIT);
  if (validPositions.length === 0 || !hasUnit) return { events: [], noValidTarget: true };

  const pending: PendingCommand = {
    kind:           'POSITION',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_FORWARD_DEPLOY,
    reason:         'Choose an empty square in the enemy front row to deploy a card.',
    validPositions,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_FORWARD_DEPLOY, spellForwardDeploy);
