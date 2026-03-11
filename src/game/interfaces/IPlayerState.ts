// ============================================================
// IPlayerState.ts
// Interface for player hand/deck/discard management.
// ============================================================

import { Player } from '../types/GameTypes';

export interface IPlayerState {
  readonly player: Player;
  hand: string[];
  deck: string[];
  discard: string[];
  graveyard: string[];
  handLimit: number;

  // DECK SETUP
  loadDeck(cardIds: string[], playerIndex?: number): void;

  // DRAW
  drawCards(count: number): string[];
  drawCardsOverflow(count: number): string[];
  drawCardsFiltered(count: number, filter: 'ROYAL' | 'STANDARD'): string[];

  // HAND OPERATIONS
  playFromHand(index: number): string;
  discardFromHand(index: number): string;
  addToHand(cardId: string, overrideLimit?: boolean): boolean;
  trimOverflowHand(): string[];

  // DECK OPERATIONS
  findAndPullFromDeck(cardId: string): boolean;
  peekTop(count: number): string[];

  // GRAVEYARD
  addToGraveyard(instanceId: string): void;
  getGraveyard(): string[];

  // SERIALIZATION
  snapshot(): {
    player: Player;
    hand: string[];
    deckCount: number;
    discardCount: number;
    handLimit: number;
  };
}
