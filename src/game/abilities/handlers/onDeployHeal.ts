import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function onDeployHeal(ctx: AbilityContext): AbilityResult {
  const friendlyUnits = ctx.board.getUnitsOf(ctx.owner);
  const validTargetIds = friendlyUnits.map(u => u.instanceId);

  if (validTargetIds.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.ON_DEPLOY_HEAL_FRIENDLY,
    reason:         'Choose a friendly unit to fully restore HP.',
    validTargetIds,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_HEAL_FRIENDLY, onDeployHeal);
