import { AbilityType } from '../../types/AbilityTypes';
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import { getCard } from '../../data/CardRegistry';

function coupHandler(ctx: AbilityContext): AbilityResult {
  const opp = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = ctx.board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance === 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [], noValidTarget: true };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  'coupHandler',
    reason:         'Coup: choose an enemy Royal unit to capture or banish.',
    validTargetIds: targets.map(u => u.instanceId),
    deferredEvents: [],
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('coupHandler', coupHandler);
// The card definition references AbilityType.SPELL_COUP — register under that key too
// (it was only reachable as 'coupHandler', so the spell silently did nothing).
AbilityHandlerRegistry.register(AbilityType.SPELL_COUP, coupHandler);
