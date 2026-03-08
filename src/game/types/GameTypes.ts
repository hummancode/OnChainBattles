// ============================================================
// GameTypes.ts
// Runtime game state types. These are NOT card definitions —
// these are the live state objects that change during play.
//
// PATCH v0.3:
//   - Added isJustPlaced to Unit (can't act on deploy turn)
//   - Added combatTag to Unit (MELEE/RANGED for counter-attack)
// ============================================================

import type { MovementType, AtkPattern, CombatTag } from './CardTypes';

// ─────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────

export interface Position {
  col: number; // 0-based, 0 = left
  row: number; // 0-based, 0 = top (enemy side for P1)
}

export enum Player {
  P1 = 0,
  P2 = 1,
}

export enum TurnPhase {
  DRAW  = 'DRAW',
  LEG   = 'LEG',
  PLAY  = 'PLAY',
  ACT   = 'ACT',
  END   = 'END',
}

export enum EngineStatus {
  IDLE            = 'IDLE',
  AWAITING_INPUT  = 'AWAITING_INPUT', // Paused, waiting for selectTarget/etc.
  GAME_OVER       = 'GAME_OVER',
}

// ─────────────────────────────────────────────
// TIMED EFFECTS
// Stored in GameModifiers.timedEffects per player.
// Tick() called at END phase. Duration reaches 0 → remove.
// ─────────────────────────────────────────────

export type TimedEffectType =
  | 'CIVIL_WAR_FREEZE'      // LEG rate frozen
  | 'DISEASE_TICK'          // Structure takes damage each turn
  | 'WAR_HORN_MOVEMENT'     // All units +1 move this turn only
  | 'BUILD_DELAY'           // Structure becomes active next turn
  | 'KINGS_RALLY_DEF'       // Unit +DEF buff for N turns (future)
  | 'PEASANT_REVOLT_COST'   // Permanent Royal cost penalty (duration: -1 = permanent)
  | 'CASUS_BELLI_RATE';     // Permanent LEG rate drain (duration: -1 = permanent)

export interface TimedEffect {
  type: TimedEffectType;
  duration: number;          // Turns remaining. -1 = permanent, never removed.
  targetInstanceId?: string; // For unit-specific effects (Disease target)
  value?: number;            // e.g., damage per tick, movement bonus
}

// ─────────────────────────────────────────────
// UNIT (runtime, not CardDefinition)
// Created when a card is played. Lives on the Board.
// ─────────────────────────────────────────────

export interface Unit {
  instanceId: string;        // Unique per placed unit, e.g. 'foot_soldier_1'
  cardId: string;            // References CARD_DEFINITIONS entry
  owner: Player;
  position: Position;

  // Base stats — from CardDefinition.stats, never change during game
  baseAtk: number;
  baseDef: number;
  baseMovement: number;
  baseAtkPattern: AtkPattern;
  baseMovementType: MovementType;

  // Current stats — base + aura buffs, recalculated fresh each LEG phase
  currentAtk: number;
  currentDef: number;        // = current HP (DEF = HP)
  maxDef: number;            // For heal-to-full calculations
  currentMovement: number;

  // Turn flags — reset at START of each owner turn
  hasMoved: boolean;
  hasActed: boolean;
  isJustPlaced: boolean;     // true on the turn deployed — can't move/attack (except exception cards)

  // Persistent state
  isActive: boolean;         // false during BUILD_DELAY
  isExhausted: boolean;      // Treason: unit returned, can't act this turn

  // Treason tracking
  treasonOwner: Player | null;   // Original owner if under Treason
  originalPos: Position | null;  // Position to return to at END

  // Castle-specific
  spawnCounter: number;      // Increments each turn; spawns at interval

    // ── Status effects (all default false) ──────────────
  isStunned: boolean;         // Cannot move or attack this turn
  isRooted: boolean;          // Cannot move, CAN still attack
  isSilenced: boolean;     

   // ── Computed capability (set at creation by UnitFactory) ──
  canAttackAfterMove: boolean; // Lancer charge, future: Berserker, Swift Strike
  combatTag: CombatTag | null; // MELEE or RANGED — derived or overridden. null = no attack.
}

// ─────────────────────────────────────────────
// BOARD CELL
// ─────────────────────────────────────────────

export interface BoardCell {
  col: number;
  row: number;
  unit: Unit | null;
}

// ─────────────────────────────────────────────
// GAME MODIFIERS (per player)
// ─────────────────────────────────────────────

export interface GameModifiers {
  legRateBase: number;      // Always 1 (King's base generation)
  legRateBonus: number;     // +Princess count while on board
  legRatePenalty: number;   // Casus Belli / Mystic / Inquisitor / Revolt (permanent -1)
  // effectiveLegRate = max(1, base + bonus - penalty)  unless frozen by Civil War

  royalCostDiscount: number; // Castle + Temple + Princess (stack, floor 0)
  royalCostPenalty: number;  // Peasant Revolt +2 (no floor on penalty)
  // effectiveCost(card) = max(0, card.cost - royalCostDiscount + royalCostPenalty)

  legPool: number;           // Current spendable LEG, cap 10 (Motherland: overflow for 1 turn)
  legRateFrozen: boolean;    // Civil War active — rate does not apply this turn

  timedEffects: TimedEffect[];
}

// ─────────────────────────────────────────────
// PLAYER STATE
// ─────────────────────────────────────────────

export interface PlayerStateSnapshot {
  player: Player;
  hand: string[];            // cardIds in hand order
  deckCount: number;
  discardCount: number;
  handLimit: number;         // Base 10
}

// ─────────────────────────────────────────────
// TURN STATE
// ─────────────────────────────────────────────

export interface TurnState {
  turnNumber: number;
  activePlayer: Player;
  phase: TurnPhase;
  unitsActedThisTurn: Set<string>; // instanceIds that have used their action
}

// ─────────────────────────────────────────────
// GAME STATE SNAPSHOT
// Serializable. Used for network sync (SocketManager).
// ─────────────────────────────────────────────

export interface GameStateSnapshot {
  turn: TurnState;
  modifiers: [GameModifiers, GameModifiers]; // [P1, P2]
  players: [PlayerStateSnapshot, PlayerStateSnapshot];
  board: Array<{ col: number; row: number; unit: Unit | null }>;
  status: EngineStatus;
}

// ─────────────────────────────────────────────
// MATCH RESULT
// ─────────────────────────────────────────────

export interface MatchResult {
  winner: Player;
  loser: Player;
  reason: 'KING_DESTROYED' | 'SURRENDER' | 'TIMEOUT' | 'DISCONNECT';
  turns: number;
}
