import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingInteraction } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function warHornHandler(ctx: AbilityContext): AbilityResult {
  const drawEvents: GameEvent[] = [
    { type: 'CARD_DRAWN', player: ctx.owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
    { type: 'CARD_DRAWN', player: ctx.owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
  ];

  const pending: PendingInteraction = {
    kind:           'DISCARD',
    reason:         'War Horn: discard 1 card from your hand.',
    count:          1,
    resumeCallback: () => {},
  } as PendingInteraction & { count: number };

  return { events: drawEvents, pending };
}

AbilityHandlerRegistry.register('warHornHandler', warHornHandler);
