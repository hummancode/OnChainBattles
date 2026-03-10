import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingInteraction } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import { getCard } from '../../data/CardDefinitions';

function coupHandler(ctx: AbilityContext): AbilityResult {
  const opp = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = ctx.board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance === 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Coup: choose an enemy Royal unit to capture or banish.',
    validTargetIds: targets.map(u => u.instanceId),
    resumeCallback: () => {},
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('coupHandler', coupHandler);
