import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { applyReform } from '../../CombatResolver';

function spellTransformAll(ctx: AbilityContext): AbilityResult {
  const { fromCardId, toCardId } = ctx.params as { fromCardId: string; toCardId: string };
  const events = applyReform(fromCardId, toCardId, ctx.board);
  return { events };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_TRANSFORM_ALL, spellTransformAll);
