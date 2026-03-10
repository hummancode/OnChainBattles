// ============================================================
// GameEventMap.ts
// Typed payload map for every event flowing through EventBus.
// NOTE: These reflect the UI-adapted payloads emitted by
// wireEngineToEventBus in BattleScene, NOT the raw engine events.
// ============================================================

import type { Position, Player } from './GameTypes';
import type { CardRenderData, HUDSnapshot } from './UITypes';
import type {
  EvUnitMoved, EvUnitAttacked,
  EvUnitHealed, EvUnitActivated, EvAuraApplied,
  EvLEGGained, EvLEGSpent, EvLEGStolen, EvLEGRateChanged,
  EvPhaseChanged, EvTurnStarted, EvTurnEnded,
  EvPendingTarget, EvPendingPosition, EvPendingColumn, EvPendingDiscard,
  EvInteractionResolved,
  EvKingThreatened, EvGameOver, EvDeckShuffled, EvScoutResult, EvStructureSpawned,
} from './EventTypes';

export interface GameEventMap {
  // ─── Unit events (UI-adapted by wireEngineToEventBus) ─────

  // Emitted with CardRenderData + position (enriched from engine event)
  UNIT_PLACED:         { data: CardRenderData; col: number; row: number };
  UNIT_MOVED:          { from: Position; to: Position };
  UNIT_ATTACKED:       EvUnitAttacked;
  UNIT_DIED:           { col: number; row: number; instanceId: string };
  UNIT_HEALED:         EvUnitHealed;
  UNIT_TRANSFORMED:    never; // Emitted as UNIT_DIED + UNIT_PLACED pair
  UNIT_EXHAUSTED:      { col: number; row: number };
  UNIT_REFRESHED:      { col: number; row: number };
  UNIT_ACTIVATED:      EvUnitActivated;
  UNIT_STATS_CHANGED:  { instanceId: string; atk?: number; currentHP?: number; maxHP?: number; canAct?: boolean };
  AURA_APPLIED:        EvAuraApplied;

  // ─── Card events (UI-adapted) ─────────────────────────────

  CARD_DRAWN:          { card: CardRenderData; handIndex: number; deckRemaining: number };
  CARD_PLAYED:         { handIndex: number; player: Player; isLocal: boolean };
  CARD_DISCARDED:      { handIndex: number; player: Player; isLocal: boolean };
  OPPONENT_CARD_DRAWN: { handIndex: number };

  // ─── LEG economy (pass-through) ──────────────────────────

  LEG_GAINED:          EvLEGGained;
  LEG_SPENT:           EvLEGSpent;
  LEG_STOLEN:          EvLEGStolen;
  LEG_RATE_CHANGED:    EvLEGRateChanged;

  // ─── Phase / turn (pass-through) ─────────────────────────

  PHASE_CHANGED:       EvPhaseChanged;
  TURN_STARTED:        EvTurnStarted;
  TURN_ENDED:          EvTurnEnded;
  GAME_OVER:           EvGameOver;

  // ─── Pending interactions (pass-through) ──────────────────

  PENDING_TARGET:      EvPendingTarget;
  PENDING_POSITION:    EvPendingPosition;
  PENDING_COLUMN:      EvPendingColumn;
  PENDING_DISCARD:     EvPendingDiscard;
  INTERACTION_RESOLVED: EvInteractionResolved;

  // ─── Other game events (pass-through) ─────────────────────

  KING_THREATENED:     EvKingThreatened;
  DECK_SHUFFLED:       EvDeckShuffled;
  SCOUT_RESULT:        EvScoutResult;
  STRUCTURE_SPAWNED:   EvStructureSpawned;

  // ─── UI Events ────────────────────────────────────────────

  SELECTION_CHANGED:   SelectionChangedPayload;
  HIGHLIGHTS_CHANGED:  HighlightsChangedPayload;
  INPUT_BOARD_CLICK:   { col: number; row: number };
  INPUT_HAND_CLICK:    { index: number | null };
  CARD_HOVERED:        CardHoveredPayload;
  CARD_HOVER_END:      CardHoverEndPayload;
  DETAIL_SHOW:         CardRenderData;
  DETAIL_HIDE:         Record<string, never>;
  HUD_REFRESH:         HUDSnapshot;

  // Network (currently unused — reserved)
  NET_OPPONENT_ACTION: unknown;
  NET_GAME_STATE_SYNC: unknown;
}

// ─── UI Payload Types ───────────────────────────────────────

export type SelectionChangedPayload =
  | { source: 'hand'; index: number; validDeploy: Position[] }
  | { source: 'board'; col: number; row: number; validMoves: Position[]; validAttacks: Position[] }
  | { source: 'clear'; index: null };

export interface HighlightsChangedPayload {
  moves: Position[];
  attacks: Position[];
  attackRange?: Position[];
  deploy?: Position[];
  auras: Position[];
}

export type CardHoveredPayload =
  | { index: number; card: CardRenderData }
  | { col: number; row: number };

export type CardHoverEndPayload =
  | { index: number }
  | { col: number; row: number };

export type GameEventType = keyof GameEventMap;
