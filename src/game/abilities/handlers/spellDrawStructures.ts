import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function spellDrawStructures(ctx: AbilityContext): AbilityResult {
  const { overflow } = ctx.params as { overflow: boolean };
  const ownStructures = ctx.board.getStructures(ctx.owner);
  const count = ownStructures.length;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         ctx.owner,
      cardId:         overflow ? '__DRAW_OVERFLOW__' : '__DRAW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DRAW_STRUCTURES, spellDrawStructures);
