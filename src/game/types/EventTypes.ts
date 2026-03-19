// ============================================================
// EventTypes.ts
// All events the GameEngine emits via EventBus.
// Phaser subscribes to these — never reads GameState directly.
// Each event carries the exact data the renderer needs.
// ============================================================

import type { Player, TurnPhase, Position, MatchResult, StatBuff } from './GameTypes';

// ─────────────────────────────────────────────
// UNIT EVENTS
// ─────────────────────────────────────────────

export interface EvUnitPlaced {
  type: 'UNIT_PLACED';
  instanceId: string;
  cardId: string;
  owner: Player;
  col: number;
  row: number;
  isActive: boolean;         // false = BUILD_DELAY — render as inactive
}

export interface EvUnitMoved {
  type: 'UNIT_MOVED';
  instanceId: string;
  cardId: string;
  owner: Player;
  from: Position;
  to: Position;
}

/** Breakdown of how damage was calculated — for audit trail / game log. */
export interface DamageBreakdown {
  baseAtk: number;           // unit.currentAtk (already includes aura buffs)
  cavalryCounter: number;    // additional ATK from x3 multiplier (0 if N/A)
  backstabBonus: number;     // from card definition (0 if N/A)
  ambushBonus: number;       // from card definition (0 if N/A)
  totalDamage: number;       // final clamped value
  auraBuffs: StatBuff[];     // aura buffs active on the attacker at time of attack
}

export interface EvUnitAttacked {
  type: 'UNIT_ATTACKED';
  attackerInstanceId: string;
  targetInstanceId: string;
  attackerCol: number;
  attackerRow: number;
  targetCol: number;
  targetRow: number;
  damage: number;
  targetNewHP: number;
  targetPlayer: Player;
  isKingHit: boolean;
  newHP?: number;
  maxHP?: number;
  /** Full damage calculation breakdown — present for unit-on-unit combat, absent for EFFECT damage. */
  breakdown?: DamageBreakdown;
}

export interface EvUnitDied {
  type: 'UNIT_DIED';
  instanceId: string;
  cardId: string;
  owner: Player;
  col: number;
  row: number;
  cause: 'COMBAT' | 'EARTHQUAKE' | 'DISEASE' | 'COUP_BANISH';
}

export interface EvUnitHealed {
  type: 'UNIT_HEALED';
  instanceId: string;
  cardId: string;
  col: number;
  row: number;
  amount: number;
  newHP: number;
  maxHP: number;
  player: Player;
  isKing: boolean;
}

export interface EvUnitTransformed {
  type: 'UNIT_TRANSFORMED';
  oldInstanceId: string;
  newInstanceId: string;
  fromCardId: string;
  toCardId: string;
  col: number;
  row: number;
  owner: Player;
  newHP: number;
  newMaxHP: number;
}

export interface EvUnitExhausted {
  type: 'UNIT_EXHAUSTED';
  instanceId: string;
  col: number;
  row: number;
}

export interface EvUnitRefreshed {
  type: 'UNIT_REFRESHED';
  instanceId: string;
  col: number;
  row: number;
}

export interface EvUnitActivated {
  type: 'UNIT_ACTIVATED';  // BUILD_DELAY resolved
  instanceId: string;
  col: number;
  row: number;
}

export interface EvAuraApplied {
  type: 'AURA_APPLIED';
  // Full list of stat changes this turn. Renderer uses for animation hints.
  changes: Array<{
    instanceId: string;
    col: number;
    row: number;
    atkDelta: number;
    defDelta: number;
    moveDelta: number;
    /** Per-source breakdown of stat modifications. */
    buffs?: StatBuff[];
  }>;
}

// ─────────────────────────────────────────────
// CARD EVENTS
// ─────────────────────────────────────────────

export interface EvCardDrawn {
  type: 'CARD_DRAWN';
  player: Player;
  cardId: string;
  handIndex: number;
  deckRemaining: number;
}

export interface EvCardPlayed {
  type: 'CARD_PLAYED';
  player: Player;
  cardId: string;
  handIndex: number;
  legCost: number;
}

export interface EvCardDiscarded {
  type: 'CARD_DISCARDED';
  player: Player;
  cardId: string;
  handIndex: number;
}

// ─────────────────────────────────────────────
// LEG / ECONOMY EVENTS
// ─────────────────────────────────────────────

export interface EvLEGGained {
  type: 'LEG_GAINED';
  player: Player;
  amount: number;
  total: number;
  rate: number;
}

export interface EvLEGSpent {
  type: 'LEG_SPENT';
  player: Player;
  amount: number;
  remaining: number;
  rate: number;
}

export interface EvLEGStolen {
  type: 'LEG_STOLEN';
  from: Player;
  to: Player;
  amount: number;
}

export interface EvLEGRateChanged {
  type: 'LEG_RATE_CHANGED';
  player: Player;
  oldRate: number;
  newRate: number;
  reason: string;  // 'CASUS_BELLI' | 'MYSTIC' | 'INQUISITOR' | 'REVOLT' | 'CIVIL_WAR'
}

// ─────────────────────────────────────────────
// PHASE / TURN EVENTS
// ─────────────────────────────────────────────

export interface EvPhaseChanged {
  type: 'PHASE_CHANGED';
  phase: TurnPhase;
  activePlayer: Player;
  turn: number;
}

export interface EvTurnStarted {
  type: 'TURN_STARTED';
  turn: number;
  activePlayer: Player;
}

export interface EvTurnEnded {
  type: 'TURN_ENDED';
  turn: number;
  activePlayer: Player;
}

// ─────────────────────────────────────────────
// PENDING INTERACTION EVENTS (engine paused, awaiting input)
// ─────────────────────────────────────────────

export interface EvPendingTarget {
  type: 'PENDING_TARGET';
  reason: string;
  validTargetIds: string[];  // Unit instanceIds the player may pick
}

export interface EvPendingPosition {
  type: 'PENDING_POSITION';
  reason: string;
  validPositions: Position[];
}

export interface EvPendingColumn {
  type: 'PENDING_COLUMN';
  reason: string;
}

export interface EvPendingDiscard {
  type: 'PENDING_DISCARD';
  reason: string;
  count: number;             // Number of cards the player must discard
}

export interface EvInteractionResolved {
  type: 'INTERACTION_RESOLVED';
  cancelled?: boolean;
}

// ─────────────────────────────────────────────
// GAME STATE EVENTS
// ─────────────────────────────────────────────

export interface EvKingThreatened {
  type: 'KING_THREATENED';
  kingInstanceId: string;
  kingPlayer: Player;
  attackerInstanceIds: string[];
}

export interface EvGameOver {
  type: 'GAME_OVER';
  result: MatchResult;
}

export interface EvDeckShuffled {
  type: 'DECK_SHUFFLED';
  player: Player;
  newDeckCount: number;
}

export interface EvScoutResult {
  type: 'SCOUT_RESULT';
  player: Player;           // Which player gets to see
  topCards: string[];       // Top N cardIds of opponent deck
}

export interface EvStructureSpawned {
  type: 'STRUCTURE_SPAWNED';
  structureInstanceId: string;
  spawnedCardId: string;
  spawnedInstanceId: string;
  col: number;
  row: number;
  owner: Player;
}

export interface EvDiseaseApplied {
  type: 'DISEASE_APPLIED';
  caster: Player;            // Disease ticks on caster's LEG phase
  targetInstanceId: string;
  damage: number;
  duration: number;
}

// ─────────────────────────────────────────────
// UNION TYPE
// EventBus.emit() and .on() are typed against this union.
// ─────────────────────────────────────────────

export type GameEvent =
  | EvUnitPlaced
  | EvUnitMoved
  | EvUnitAttacked
  | EvUnitDied
  | EvUnitHealed
  | EvUnitTransformed
  | EvUnitExhausted
  | EvUnitRefreshed
  | EvUnitActivated
  | EvAuraApplied
  | EvCardDrawn
  | EvCardPlayed
  | EvCardDiscarded
  | EvLEGGained
  | EvLEGSpent
  | EvLEGStolen
  | EvLEGRateChanged
  | EvPhaseChanged
  | EvTurnStarted
  | EvTurnEnded
  | EvPendingTarget
  | EvPendingPosition
  | EvPendingColumn
  | EvPendingDiscard
  | EvInteractionResolved
  | EvKingThreatened
  | EvGameOver
  | EvDeckShuffled
  | EvScoutResult
  | EvStructureSpawned
  | EvDiseaseApplied;

export type GameEventType = GameEvent['type'];
