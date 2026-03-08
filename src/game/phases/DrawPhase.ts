// ============================================================
// phases/DrawPhase.ts
// DRAW phase: active player draws 1 card.
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { TurnPhase } from '../types/GameTypes';

/**
 * Execute the DRAW phase.
 * Active player draws 1 card from their deck.
 * If deck is empty, discard pile is reshuffled in (handled by PlayerState).
 */
export function runDrawPhase(ctx: GameContext): void {
  ctx.phase = TurnPhase.DRAW;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.DRAW, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });

  const ps = ctx.players[ctx.activePlayer];
  const deckBefore = ps.deck.length;
  const drawn = ps.drawCards(1);

  if (drawn.length > 0) {
    ctx.emit({
      type: 'CARD_DRAWN',
      player: ctx.activePlayer,
      cardId: drawn[0],
      handIndex: ps.hand.length - 1,
      deckRemaining: ps.deck.length,
    });
  }

  // Deck reshuffled (discard pile recycled)
  if (ps.deck.length > deckBefore) {
    ctx.emit({ type: 'DECK_SHUFFLED', player: ctx.activePlayer, newDeckCount: ps.deck.length });
  }
}
