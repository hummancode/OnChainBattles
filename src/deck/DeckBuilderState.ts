// ============================================================
// DeckBuilderState.ts
// State types and factory for DeckBuilderScene.
// ============================================================

import type { DeckSummary } from './DeckAPI';
import type { CollectionCard } from './CollectionAPI';
import type { ClientValidationResult } from './DeckValidatorClient';
import { CardClass } from '../game/types/CardTypes';
import { AuthManager } from '../auth/AuthManager';
import GameState from '../GameState';

export enum DeckView { DECK_LIST, DECK_EDITOR }

export interface EditorState {
  deckId: number | null;        // null = creating new deck
  deckName: string;
  cardIds: string[];            // mutable working copy
  dirty: boolean;
  validation: ClientValidationResult;
  classFilter: CardClass | 'ALL';
  sortBy: 'cost' | 'name';
  collectionPage: number;
}

export interface DeckBuilderState {
  decks: DeckSummary[];
  collection: CollectionCard[];
  activeDeckId: number | null;
  currentView: DeckView;
  loading: boolean;
  editor: EditorState | null;
  deleteConfirmId: number | null;  // deck id pending delete confirmation
}

export function createInitialState(): DeckBuilderState {
  return {
    decks: [],
    collection: [],
    activeDeckId: AuthManager.getPlayer()?.activeDeckId ?? GameState.activeDeckId,
    currentView: DeckView.DECK_LIST,
    loading: true,
    editor: null,
    deleteConfirmId: null,
  };
}

export interface DeckBuilderCallbacks {
  onEditDeck(deckId: number): void;
  onCreateDeck(): void;
  onDeleteDeck(deckId: number): void;
  onConfirmDelete(deckId: number): void;
  onCancelDelete(): void;
  onActivateDeck(deckId: number): void;
  onAddCard(cardId: string): void;
  onRemoveCard(cardId: string): void;
  onSave(): void;
  onSaveAndActivate(): void;
  onBackToList(): void;
  onBackToHub(): void;
  onShowCardDetail(cardId: string): void;
  onDismissCardDetail(): void;
  onFilterChange(filter: CardClass | 'ALL'): void;
  onSortChange(sort: 'cost' | 'name'): void;
  onPageChange(delta: number): void;
}
