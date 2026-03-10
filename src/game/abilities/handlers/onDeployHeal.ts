import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType, type PendingInteraction } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';

function onDeployHeal(ctx: AbilityContext): AbilityResult {
  const friendlyUnits = ctx.board.getUnitsOf(ctx.owner);
  const validTargetIds = friendlyUnits.map(u => u.instanceId);

  if (validTargetIds.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Choose a friendly unit to fully restore HP.',
    validTargetIds,
    resumeCallback: () => {},
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_HEAL_FRIENDLY, onDeployHeal);
