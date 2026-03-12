/**
 * TestHarness.ts — Shared test utilities for headless GameEngine testing.
 *
 * Provides deterministic engine setup: startGame → skip to PLAY phase with
 * known deck, known hands, and two kings on the board.
 */

import { GameEngine } from '../../../src/game/GameEngine';
import { Player, TurnPhase, EngineStatus } from '../../../src/game/types/GameTypes';
import type { GameEvent } from '../../../src/game/types/EventTypes';
import type { GameStateSnapshot } from '../../../src/game/types/GameTypes';
import GameState from '../../../src/GameState';

// Ensure all ability handlers are registered before any test runs
import '../../../src/game/abilities/handlers/onDeployDraw';
import '../../../src/game/abilities/handlers/onDeployHeal';
import '../../../src/game/abilities/handlers/onDeployRevive';
import '../../../src/game/abilities/handlers/onDeployScout';
import '../../../src/game/abilities/handlers/customMilitia';
import '../../../src/game/abilities/handlers/customMystic';
import '../../../src/game/abilities/handlers/passiveNoOp';
import '../../../src/game/abilities/handlers/spellCoup';
import '../../../src/game/abilities/handlers/spellDamageStructure';
import '../../../src/game/abilities/handlers/spellDrainLeg';
import '../../../src/game/abilities/handlers/spellDrawStructures';
import '../../../src/game/abilities/handlers/spellEarthquake';
import '../../../src/game/abilities/handlers/spellForwardDeploy';
import '../../../src/game/abilities/handlers/spellFreezeLeg';
import '../../../src/game/abilities/handlers/spellMotherland';
import '../../../src/game/abilities/handlers/spellRevolt';
import '../../../src/game/abilities/handlers/spellTransformAll';
import '../../../src/game/abilities/handlers/spellTreason';
import '../../../src/game/abilities/handlers/spellWarHorn';

export interface TestEngine {
  engine: GameEngine;
  events: GameEvent[];
  /** Current snapshot */
  state(): GameStateSnapshot;
  /** Find a card in P1's hand by cardId prefix */
  findInHand(cardIdPrefix: string, player?: Player): number;
  /** Get first unit on board matching cardId for a player */
  findUnit(cardId: string, player?: Player): { instanceId: string; col: number; row: number } | null;
  /** Get valid deploy positions for current player */
  deployPositions(): Array<{ col: number; row: number }>;
  /** Collect events of a specific type */
  eventsOfType(type: string): GameEvent[];
}

/**
 * Create a fresh engine with startGame() called.
 * Engine is in PLAY phase, P1 active, both kings placed, hands dealt.
 */
const DEFAULT_TEST_SEED = 42;

export function createTestEngine(seed: number = DEFAULT_TEST_SEED): TestEngine {
  GameState.gameSeed = seed;
  const engine = new GameEngine();
  const events: GameEvent[] = [];
  engine.on((ev) => events.push(ev));
  engine.startGame();

  return {
    engine,
    events,
    state: () => engine.getState(),
    findInHand(cardIdPrefix: string, player: Player = Player.P1): number {
      const hand = engine.getState().players[player].hand;
      return hand.findIndex(id => id.startsWith(cardIdPrefix));
    },
    findUnit(cardId: string, player: Player = Player.P1) {
      const cell = engine.getState().board.find(
        c => c.unit?.cardId === cardId && c.unit?.owner === player
      );
      if (!cell?.unit) return null;
      return { instanceId: cell.unit.instanceId, col: cell.col, row: cell.row };
    },
    deployPositions() {
      return engine.getValidDeployPositions().map(p => ({ col: p.col, row: p.row }));
    },
    eventsOfType(type: string) {
      return events.filter(e => e.type === type);
    },
  };
}

/**
 * Advance through a full turn: endPlayPhase → endActPhase.
 * After this, it's the other player's turn in PLAY phase.
 */
export function skipTurn(engine: GameEngine): void {
  engine.endPlayPhase();
  engine.endActPhase();
}

/**
 * Deploy a card from hand onto the board.
 * Finds the card in the active player's hand, picks a valid deploy position.
 * Returns the position used, or null if failed.
 */
export function deployCard(
  t: TestEngine,
  cardIdPrefix: string,
  preferredCol?: number,
  preferredRow?: number,
): { col: number; row: number } | null {
  const handIdx = t.findInHand(cardIdPrefix);
  if (handIdx < 0) return null;

  const positions = t.deployPositions();
  let pos = positions[0];
  if (preferredCol !== undefined && preferredRow !== undefined) {
    const exact = positions.find(p => p.col === preferredCol && p.row === preferredRow);
    if (exact) pos = exact;
  }
  if (!pos) return null;

  const ok = t.engine.playCard(handIdx, pos.col, pos.row);
  return ok ? pos : null;
}

export { Player, TurnPhase, EngineStatus };
