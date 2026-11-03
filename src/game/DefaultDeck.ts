// ============================================================
// DefaultDeck.ts
// Where GameEngine gets a deck when startGame() is called without
// explicit decks (local play). The browser registers DeckLoader as
// the provider; the server never needs one (it always passes decks).
//
// Keeps the pure engine free of browser-only imports (fetch,
// import.meta.env, AuthManager → wallet) so it runs in Node.
// ============================================================

import { UNITS_ONLY_DECK_IDS } from './data/DeckDefinitions';

let provider: () => string[] = () => [...UNITS_ONLY_DECK_IDS];

export function setDefaultDeckProvider(fn: () => string[]): void {
  provider = fn;
}

export function getDefaultDeck(): string[] {
  return provider();
}
