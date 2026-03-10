import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType, type PendingInteraction } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import type { Position } from '../../types/GameTypes';

function spellForwardDeploy(ctx: AbilityContext): AbilityResult {
  const frontRow = ctx.owner === Player.P1 ? ctx.board.rows - 1 : 0;
  const validPositions: Position[] = [];
  for (let c = 0; c < ctx.board.cols; c++) {
    if (ctx.board.isEmpty(c, frontRow)) validPositions.push({ col: c, row: frontRow });
  }
  if (validPositions.length === 0 || ctx.players[ctx.owner].hand.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'POSITION',
    reason:         'Choose an empty square in the enemy front row to deploy a card.',
    validPositions,
    resumeCallback: () => {},
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_FORWARD_DEPLOY, spellForwardDeploy);
