// ============================================================
// DeckLoader.ts
// Fetches deck card IDs from /public/deck.config.json at runtime.
// Developer edits the JSON file to change the deck — no code changes needed.
// Falls back to UNITS_ONLY_DECK_IDS if the file is missing or invalid.
// ============================================================

import { UNITS_ONLY_DECK_IDS } from '../game/data/DeckDefinitions';
import { getCard } from '../game/data/CardRegistry';

class DeckLoaderClass {
  private deckIds: string[] | null = null;
  private readonly CONFIG_PATH = '/deck.config.json';

  /**
   * Load deck from /public/deck.config.json.
   * Call once during PreloadScene. Result is cached.
   * Safe to call multiple times — returns cache after first load.
   */
  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;

    try {
      const res = await fetch(this.CONFIG_PATH);
      if (!res.ok) {
        console.warn('[DeckLoader] deck.config.json not found — using built-in deck');
        return this.useFallback();
      }

      const json = await res.json();

      if (!Array.isArray(json.deckIds)) {
        console.error('[DeckLoader] deck.config.json missing "deckIds" array — using built-in deck');
        return this.useFallback();
      }

      const ids: string[] = json.deckIds;

      // Validate every card ID exists in CardDefinitions
      const invalid = ids.filter(id => {
        try { getCard(id); return false; }
        catch { return true; }
      });

      if (invalid.length > 0) {
        console.error(`[DeckLoader] Unknown card IDs in deck.config.json: ${invalid.join(', ')} — using built-in deck`);
        return this.useFallback();
      }

      if (ids.length !== 31) {
        console.warn(`[DeckLoader] deck.config.json has ${ids.length} cards, expected 31. Loading anyway.`);
      }

      console.log(`[DeckLoader] Loaded ${ids.length} cards from deck.config.json`);
      this.deckIds = ids;
      return this.deckIds;

    } catch (err) {
      console.warn('[DeckLoader] Failed to fetch deck.config.json — using built-in deck', err);
      return this.useFallback();
    }
  }

  /** Synchronous get — only works after load() has been called. Returns fallback if not yet loaded. */
  get(): string[] {
    return this.deckIds ?? UNITS_ONLY_DECK_IDS;
  }

  /** Clear cache — forces re-fetch on next load() call. */
  invalidate(): void {
    this.deckIds = null;
  }

  private useFallback(): string[] {
    this.deckIds = [...UNITS_ONLY_DECK_IDS];
    return this.deckIds;
  }
}

export const DeckLoader = new DeckLoaderClass();