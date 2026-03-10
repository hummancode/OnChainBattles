import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType, type PendingInteraction } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';

function spellDamageStructure(ctx: AbilityContext): AbilityResult {
  const structures = ctx.board.getStructures();
  const validTargetIds = structures.map(u => u.instanceId);

  if (validTargetIds.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Choose an enemy structure to afflict with Disease.',
    validTargetIds,
    resumeCallback: () => {},
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, spellDamageStructure);
