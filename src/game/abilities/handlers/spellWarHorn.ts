import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function warHornHandler(ctx: AbilityContext): AbilityResult {
  const drawEvents: GameEvent[] = [
    { type: 'CARD_DRAWN', player: ctx.owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
    { type: 'CARD_DRAWN', player: ctx.owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
  ];

  const pending: PendingCommand = {
    kind:           'DISCARD',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_WAR_HORN,
    count:          1,
    reason:         'War Horn: discard 1 card from your hand.',
    deferredEvents: [],
  };

  return { events: drawEvents, pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_WAR_HORN, warHornHandler);
