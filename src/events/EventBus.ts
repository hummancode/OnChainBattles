// ============================================================
// EventBus.ts
// Singleton pub/sub. Decouples GameEngine from all renderers.
// GameEngine emits → EventBus → any subscriber reacts.
// No Phaser dependency. No game logic.
// ============================================================

export type EventHandler<T = any> = (payload: T) => void;

interface Subscription {
  type: string;
  handler: EventHandler;
}

class EventBusClass {
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private static instance: EventBusClass;

  static getInstance(): EventBusClass {
    if (!EventBusClass.instance) {
      EventBusClass.instance = new EventBusClass();
    }
    return EventBusClass.instance;
  }

  /**
   * Subscribe to an event type.
   * Returns an unsubscribe function for easy cleanup.
   */
  on<T = any>(type: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler as EventHandler);

    return () => this.off(type, handler as EventHandler);
  }

  /**
   * Subscribe to an event type, fire once, then auto-unsubscribe.
   */
  once<T = any>(type: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler = (payload: T) => {
      handler(payload);
      this.off(type, wrapper);
    };
    this.on(type, wrapper);
  }

  /**
   * Unsubscribe a specific handler from an event type.
   */
  off(type: string, handler: EventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  /**
   * Emit an event. All subscribers for this type receive the payload.
   * Errors in handlers are caught individually — one bad handler
   * won't prevent others from receiving the event.
   */
  emit<T = any>(type: string, payload?: T): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;

    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${type}":`, err);
      }
    });
  }

  /**
   * Remove all listeners for a specific type.
   * Useful when a scene shuts down.
   */
  clearType(type: string): void {
    this.listeners.delete(type);
  }

  /**
   * Remove ALL listeners. Call when resetting the game.
   */
  clearAll(): void {
    this.listeners.clear();
  }

  /**
   * Debug: list all registered event types and listener counts.
   */
  debug(): void {
    console.log('[EventBus] Registered events:');
    this.listeners.forEach((handlers, type) => {
      console.log(`  ${type}: ${handlers.size} listener(s)`);
    });
  }
}

export const EventBus = EventBusClass.getInstance();

// ─────────────────────────────────────────────
// EVENT TYPE CONSTANTS
// Use these strings everywhere — never raw strings.
// ─────────────────────────────────────────────

export const EV = {
  // Game state
  PHASE_CHANGED:       'PHASE_CHANGED',
  TURN_STARTED:        'TURN_STARTED',
  GAME_OVER:           'GAME_OVER',

  // Cards
  CARD_DRAWN:          'CARD_DRAWN',
  CARD_PLAYED:         'CARD_PLAYED',
  CARD_DISCARDED:      'CARD_DISCARDED',

  // Units / board
  UNIT_PLACED:         'UNIT_PLACED',
  UNIT_MOVED:          'UNIT_MOVED',
  UNIT_ATTACKED:       'UNIT_ATTACKED',
  UNIT_DIED:           'UNIT_DIED',
  UNIT_HEALED:         'UNIT_HEALED',
  UNIT_TRANSFORMED:    'UNIT_TRANSFORMED',
  UNIT_EXHAUSTED:      'UNIT_EXHAUSTED',
  UNIT_REFRESHED:      'UNIT_REFRESHED',

  // LEG economy
  LEG_GAINED:          'LEG_GAINED',
  LEG_SPENT:           'LEG_SPENT',

  // Aura
  AURA_APPLIED:        'AURA_APPLIED',

  // Interaction (engine waiting for player input)
  PENDING_TARGET:      'PENDING_TARGET',
  PENDING_POSITION:    'PENDING_POSITION',
  PENDING_COLUMN:      'PENDING_COLUMN',
  PENDING_DISCARD:     'PENDING_DISCARD',
  INTERACTION_RESOLVED:'INTERACTION_RESOLVED',

  // UI selection (SelectionManager → renderers)
  SELECTION_CHANGED:   'SELECTION_CHANGED',
  HIGHLIGHTS_CHANGED:  'HIGHLIGHTS_CHANGED',
  CARD_HOVERED:        'CARD_HOVERED',
  CARD_HOVER_END:      'CARD_HOVER_END',
  DETAIL_SHOW:         'DETAIL_SHOW',
  DETAIL_HIDE:         'DETAIL_HIDE',

  // HUD refresh
  HUD_REFRESH:         'HUD_REFRESH',

  // Network
  NET_OPPONENT_ACTION: 'NET_OPPONENT_ACTION',
  NET_GAME_STATE_SYNC: 'NET_GAME_STATE_SYNC',
} as const;

export type EVType = typeof EV[keyof typeof EV];
