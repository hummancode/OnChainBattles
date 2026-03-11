import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function spellDamageStructure(ctx: AbilityContext): AbilityResult {
  const structures = ctx.board.getStructures();
  const validTargetIds = structures.map(u => u.instanceId);

  if (validTargetIds.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ,
    reason:         'Choose an enemy structure to afflict with Disease.',
    validTargetIds,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, spellDamageStructure);
