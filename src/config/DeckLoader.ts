// ============================================================
// DeckLoader.ts
// 4-priority deck loading chain:
//   1. Server active deck (if authenticated + has active deck)
//   2. /public/default-deck.json (beginner's deck, easily editable)
//   3. /public/deck.config.json (legacy runtime config)
//   4. UNITS_ONLY_DECK_IDS (hardcoded fallback)
//
// Call load() once during PreloadScene. Result is cached.
// ============================================================

import { UNITS_ONLY_DECK_IDS } from '../game/data/DeckDefinitions';
import { getCard } from '../game/data/CardRegistry';
import GameState from '../GameState';
import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class DeckLoaderClass {
  private deckIds: string[] | null = null;

  /**
   * Load deck using 4-priority chain.
   * Safe to call multiple times — returns cache after first load.
   */
  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;

    // Priority 1: Server active deck (authenticated player with active deck)
    if (GameState.hasActiveDeck()) {
      console.log(`[DeckLoader] Using GameState active deck (${GameState.activeDeckCardIds.length} cards)`);
      this.deckIds = [...GameState.activeDeckCardIds];
      return this.deckIds;
    }

    if (AuthManager.isLoggedIn()) {
      try {
        const serverDeck = await this.fetchServerActiveDeck();
        if (serverDeck) {
          console.log(`[DeckLoader] Loaded ${serverDeck.length} cards from server active deck`);
          this.deckIds = serverDeck;
          GameState.setActiveDeck(AuthManager.getPlayer()?.activeDeckId ?? null, serverDeck);
          return this.deckIds;
        }
      } catch (err) {
        console.warn('[DeckLoader] Failed to fetch server deck:', err);
      }
    }

    // Priority 2: default-deck.json (beginner's deck)
    try {
      const defaultDeck = await this.fetchJsonDeck('/default-deck.json');
      if (defaultDeck) {
        console.log(`[DeckLoader] Loaded ${defaultDeck.length} cards from default-deck.json`);
        this.deckIds = defaultDeck;
        return this.deckIds;
      }
    } catch (err) {
      console.warn('[DeckLoader] Failed to fetch default-deck.json:', err);
    }

    // Priority 3: deck.config.json (legacy)
    try {
      const configDeck = await this.fetchJsonDeck('/deck.config.json');
      if (configDeck) {
        console.log(`[DeckLoader] Loaded ${configDeck.length} cards from deck.config.json`);
        this.deckIds = configDeck;
        return this.deckIds;
      }
    } catch (err) {
      console.warn('[DeckLoader] Failed to fetch deck.config.json:', err);
    }

    // Priority 4: hardcoded fallback
    return this.useFallback();
  }

  /** Synchronous get — only works after load(). Returns fallback if not yet loaded. */
  get(): string[] {
    return this.deckIds ?? UNITS_ONLY_DECK_IDS;
  }

  /** Clear cache — forces re-fetch on next load() call. */
  invalidate(): void {
    this.deckIds = null;
  }

  // ─── Private loaders ──────────────────────────────────────

  private async fetchServerActiveDeck(): Promise<string[] | null> {
    const player = AuthManager.getPlayer();
    if (!player?.activeDeckId) return null;

    const res = await fetch(`${API_BASE}/decks`, {
      headers: AuthManager.authHeaders(),
    });
    if (!res.ok) return null;

    const { decks } = await res.json();
    const active = decks.find((d: any) => d.id === player.activeDeckId);
    if (!active?.cardIds || !Array.isArray(active.cardIds)) return null;

    return this.validateCardIds(active.cardIds) ? active.cardIds : null;
  }

  private async fetchJsonDeck(path: string): Promise<string[] | null> {
    const res = await fetch(path);
    if (!res.ok) return null;

    const json = await res.json();
    if (!Array.isArray(json.deckIds)) return null;

    return this.validateCardIds(json.deckIds) ? json.deckIds : null;
  }

  private validateCardIds(ids: string[]): boolean {
    const invalid = ids.filter(id => {
      try { getCard(id); return false; }
      catch { return true; }
    });

    if (invalid.length > 0) {
      console.error(`[DeckLoader] Unknown card IDs: ${invalid.join(', ')}`);
      return false;
    }

    if (ids.length !== 31) {
      console.warn(`[DeckLoader] Deck has ${ids.length} cards, expected 31. Loading anyway.`);
    }

    return true;
  }

  private useFallback(): string[] {
    console.log('[DeckLoader] Using built-in fallback deck');
    this.deckIds = [...UNITS_ONLY_DECK_IDS];
    return this.deckIds;
  }
}

export const DeckLoader = new DeckLoaderClass();
