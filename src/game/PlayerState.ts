// ============================================================
// PlayerState.ts
// Hand, deck, discard pile per player.
// Pure TypeScript — no Phaser, no EventBus.
// ============================================================

import { Player } from './types/GameTypes';
import { getCard } from './data/CardRegistry';
import GameState from '../GameState';
import type { IPlayerState } from './interfaces/IPlayerState';

export class PlayerState implements IPlayerState {
  readonly player: Player;

  hand: string[]    = []; // cardIds (may have duplicates per copies rule)
  deck: string[]    = []; // cardIds, deck[0] = top
  discard: string[] = []; // cardIds
  graveyard: string[] = []; // instanceIds of dead units (for Mystic revive)

  handLimit: number = 10;

  constructor(player: Player) {
    this.player = player;
  }

  // ─────────────────────────────────────────────
  // DECK SETUP
  // ─────────────────────────────────────────────

  /** Load and shuffle a deck from an array of card IDs. */
/** Load and shuffle a deck from an array of card IDs. */
loadDeck(cardIds: string[], playerIndex: number = 0): void {
  this.deck = [...cardIds];
  
  // Temporarily offset the seed so P1 and P2 get different shuffles.
  // reshuffleDiscard() calls shuffle() normally and is unaffected.
  const gs = GameState as any;
  const originalSeed = gs.gameSeed;
  if (originalSeed && originalSeed > 0) {
    gs.gameSeed = originalSeed + playerIndex;
  }
  
  this.shuffle(this.deck);          // existing shuffle — unchanged
  
  gs.gameSeed = originalSeed;       // restore immediately after
  
  this.hand      = [];
  this.discard   = [];
  this.graveyard = [];
}

  // ─────────────────────────────────────────────
  // DRAW
  // ─────────────────────────────────────────────

  /**
   * Draw N cards from deck to hand.
   * If deck runs out, auto-shuffles discard in.
   * Respects handLimit — excess goes to discard.
   * Returns array of drawn cardIds.
   */
  drawCards(count: number): string[] {
    const drawn: string[] = [];

    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break; // Both empty — nothing to draw
        this.reshuffleDiscard();
      }

      const cardId = this.deck.shift()!;

      if (this.hand.length < this.handLimit) {
        this.hand.push(cardId);
      } else {
        // Over hand limit — card goes to discard (Motherland overflow handled separately)
        this.discard.push(cardId);
      }

      drawn.push(cardId);
    }

    return drawn;
  }

  /**
   * Draw cards with overflow allowed (Motherland effect).
   * Ignores handLimit for this draw only.
   * Caller is responsible for clearing overflow at END phase.
   */
  drawCardsOverflow(count: number): string[] {
    const drawn: string[] = [];

    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break;
        this.reshuffleDiscard();
      }
      const cardId = this.deck.shift()!;
      this.hand.push(cardId);
      drawn.push(cardId);
    }

    return drawn;
  }

  /**
   * Draw cards matching a filter (Scribe: ROYAL only).
   * Skips non-matching cards and keeps drawing until count met or deck empty.
   * Non-matching skipped cards go back to bottom of deck.
   */
  drawCardsFiltered(count: number, filter: 'ROYAL' | 'STANDARD'): string[] {
    const drawn: string[] = [];
    const skipped: string[] = [];
    let attempts = 0;
    const maxAttempts = this.deck.length + this.discard.length;

    while (drawn.length < count && attempts < maxAttempts) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break;
        this.reshuffleDiscard();
      }

      const cardId = this.deck.shift()!;
      attempts++;

      const def = getCard(cardId);
      const matches = filter === 'ROYAL'
        ? def.allegiance === 'ROYAL'
        : def.allegiance === 'STANDARD';

      if (matches) {
        if (this.hand.length < this.handLimit) {
          this.hand.push(cardId);
        } else {
          this.discard.push(cardId);
        }
        drawn.push(cardId);
      } else {
        skipped.push(cardId);
      }
    }

    // Put skipped cards at bottom of deck
    this.deck.push(...skipped);

    return drawn;
  }

  // ─────────────────────────────────────────────
  // HAND OPERATIONS
  // ─────────────────────────────────────────────

  /** Remove a card from hand by index. Returns the removed cardId. */
  playFromHand(index: number): string {
    if (index < 0 || index >= this.hand.length) {
      throw new Error(`[PlayerState] Invalid hand index ${index}`);
    }
    const [cardId] = this.hand.splice(index, 1);
    return cardId;
  }

  /** Discard a card from hand by index. Goes to discard pile. */
  discardFromHand(index: number): string {
    const cardId = this.playFromHand(index);
    this.discard.push(cardId);
    return cardId;
  }

  /** Add a card directly to hand (e.g., from summon effects). Returns false if over limit. */
  addToHand(cardId: string, overrideLimit = false): boolean {
    if (!overrideLimit && this.hand.length >= this.handLimit) return false;
    this.hand.push(cardId);
    return true;
  }

  /** Trim hand to handLimit, discarding excess from the end. Returns discarded cardIds. */
  trimOverflowHand(): string[] {
    if (this.hand.length <= this.handLimit) return [];
    const overflow = this.hand.splice(this.handLimit);
    this.discard.push(...overflow);
    return overflow;
  }

  // ─────────────────────────────────────────────
  // DECK OPERATIONS
  // ─────────────────────────────────────────────

  /** Pull a specific card by ID from the deck (used by Militia, Scribe). Returns false if not found. */
  findAndPullFromDeck(cardId: string): boolean {
    const idx = this.deck.indexOf(cardId);
    if (idx === -1) return false;
    this.deck.splice(idx, 1);
    return true;
  }

  /** Peek at top N cards of deck without drawing. Returns IDs (does NOT reveal to opponent by default). */
  peekTop(count: number): string[] {
    return this.deck.slice(0, count);
  }

  private reshuffleDiscard(): void {
    this.deck = [...this.discard];
    this.discard = [];
    this.shuffle(this.deck);
  }

private shuffle(arr: string[]): void {
  const seed = GameState.gameSeed;
  if (seed && seed > 0) {
    this.seededShuffle(arr, seed);
  } else {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
private seededShuffle(arr: string[], seed: number): void {
  let s = seed >>> 0;
  const rng = (): number => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) ^ (s + Math.imul(s ^ (s >>> 7), s | 61))) >>> 0;
    return s / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

  // ─────────────────────────────────────────────
  // GRAVEYARD (for Mystic revive)
  // ─────────────────────────────────────────────

  /** Record a dead unit. instanceId → cardId mapping stored externally; here just track instanceIds. */
  addToGraveyard(instanceId: string): void {
    this.graveyard.push(instanceId);
  }

  /** Get all graveyard instanceIds (GameEngine resolves which are revivable). */
  getGraveyard(): string[] {
    return [...this.graveyard];
  }

  // ─────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────

  snapshot() {
    return {
      player:        this.player,
      hand:          [...this.hand],
      deckCount:     this.deck.length,
      discardCount:  this.discard.length,
      handLimit:     this.handLimit,
    };
  }
}
