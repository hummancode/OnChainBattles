// ============================================================
// ScenarioTypes.ts — data model for story puzzles ("scenarios").
//
// A scenario is a hand-made position + a goal + a move budget, like a
// multi-move chess puzzle. The player (always P1, bottom) gets 3–5
// "moves" (card plays, unit moves, attacks). The opponent answers
// automatically: its scripted reply first, the Hard bot if the script
// no longer fits the position. Card reactions (counter-attacks, On
// Death draws, Castle volleys, auras…) come from the engine itself.
// Pure data — Node-safe, verified by tests/engine/scenarios.
// ============================================================

import type { GameAction } from '../../../shared/types/NetworkEvents';
import type { PositionSetup } from '../GameEngine';

export type ScenarioGoal =
  /** Destroy the enemy King. */
  | { kind: 'KILL_KING' }
  /** Destroy every unit standing on these squares at the start. */
  | { kind: 'KILL_UNITS'; squares: Array<{ col: number; row: number }> }
  /** Keep your King alive until your turn number `turns` + 1 begins (counted in your turns). */
  | { kind: 'SURVIVE'; turns: number };

export interface ScenarioText {
  /** Shown before the first move — the story, one paragraph per entry. */
  intro: string[];
  /** One-line objective shown in the HUD the whole time. */
  objective: string;
  /** Optional nudge behind a HINT button. */
  hint: string;
  /** Narration after the player's Nth move (1-based) — keyed by move count. */
  afterMove?: Record<number, string>;
  /** Shown when the opponent starts answering (each of its turns, by index). */
  opponentTurn?: string[];
  win: string;
  lose: string;
}

export interface Scenario {
  id: string;
  title: string;
  difficulty: 1 | 2 | 3;
  /** Engine RNG seed (deck shuffles; draws are usually scripted via `setup.decks`). */
  seed: number;
  setup: PositionSetup;
  goal: ScenarioGoal;
  /** Player moves allowed in total (PLAY_CARD / MOVE_UNIT / ATTACK_UNIT). Ending a turn is free. */
  maxMoves: number;
  /** The player loses when their turn number `maxTurns` + 1 would begin without a win. */
  maxTurns: number;
  /** Opponent's replies, one list per opponent turn. A reply that has become illegal
   *  (the player took another line) falls back to the Hard bot for the rest of that turn. */
  opponentScript?: GameAction[][];
  text: ScenarioText;
  /** A known winning line (player actions only, incl. pending selections and turn ends).
   *  Required: tests replay it and must reach WON. */
  solution: GameAction[];
}

export type ScenarioStatus = 'playing' | 'won' | 'lost';

export type LoseReason = 'KING_DIED' | 'OUT_OF_MOVES' | 'OUT_OF_TURNS';
