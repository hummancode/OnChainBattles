import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingInteraction } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import { getCard } from '../../data/CardDefinitions';

function treasonHandler(ctx: AbilityContext): AbilityResult {
  const opp = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = ctx.board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance !== 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Treason: choose an enemy non-Royal unit to control this turn.',
    validTargetIds: targets.map(u => u.instanceId),
    resumeCallback: () => {},
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('treasonHandler', treasonHandler);
