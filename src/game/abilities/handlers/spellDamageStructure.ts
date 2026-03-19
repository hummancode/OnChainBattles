import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../../types/GameTypes';

function spellDamageStructure(ctx: AbilityContext): AbilityResult {
  const enemyPlayer = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const structures = ctx.board.getStructures(enemyPlayer);
  const validTargetIds = structures.map(u => u.instanceId);

  if (validTargetIds.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ,
    reason:         'Choose an enemy structure to afflict with Disease.',
    validTargetIds,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, spellDamageStructure);
