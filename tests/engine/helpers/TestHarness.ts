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
import { DeckLoader } from '../../../src/config/DeckLoader';
import { UNITS_ONLY_DECK_IDS } from '../../../src/game/data/DeckDefinitions';

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
 * Deploy a card from the ACTIVE player's hand onto the board.
 * Automatically detects the active player and searches their hand.
 * Returns the position used, or null if failed.
 */
export function deployCard(
  t: TestEngine,
  cardIdPrefix: string,
  preferredCol?: number,
  preferredRow?: number,
): { col: number; row: number } | null {
  // Use the active player's hand, not hardcoded P1
  const activePlayer = t.state().turn.activePlayer;
  const handIdx = t.findInHand(cardIdPrefix, activePlayer);
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

/**
 * Accumulate LEG by skipping turns. Each call skips one full round (P1 + P2).
 */
export function accumulate(engine: GameEngine, rounds: number): void {
  for (let i = 0; i < rounds * 2; i++) skipTurn(engine);
}

// ─────────────────────────────────────────────
// DECK HELPERS — unlock spell/structure testing
// ─────────────────────────────────────────────

/**
 * A deck with spells and structures mixed in (replaces some units).
 * 31 cards total — includes earthquake, war_horn, coup, treason,
 * castle, village, temple, disease, and other spells.
 */
export const MIXED_DECK_IDS: string[] = [
  // Units (18)
  'foot_soldier', 'foot_soldier', 'foot_soldier',
  'pikeman', 'pikeman',
  'archer', 'archer',
  'swordsman', 'swordsman',
  'priest',
  'lancer', 'lancer',
  'assassin',
  'scout',
  'messenger',
  'militia',
  'knight',
  'commander',
  // Spells (8)
  'earthquake',
  'war_horn', 'war_horn',
  'coup',
  'treason',
  'disease',
  'casus_belli',
  'reform',
  // Structures (5)
  'castle',
  'village', 'village',
  'temple',
  'motherland',
];

// Sanity check
if (MIXED_DECK_IDS.length !== 31) {
  throw new Error(`[TestHarness] MIXED_DECK_IDS has ${MIXED_DECK_IDS.length} entries, expected 31`);
}

/**
 * Create an engine with a custom deck instead of UNITS_ONLY.
 * Both players use the same deck (shuffled differently via seed offset).
 */
export function createTestEngineWithDeck(
  deckIds: string[],
  seed: number = DEFAULT_TEST_SEED,
): TestEngine {
  // Temporarily override DeckLoader to return our custom deck
  const originalGet = DeckLoader.get.bind(DeckLoader);
  (DeckLoader as any).get = () => [...deckIds];

  const result = createTestEngine(seed);

  // Restore original DeckLoader
  (DeckLoader as any).get = originalGet;

  return result;
}

/**
 * Inject specific cards into a player's hand, bypassing normal draw.
 * Replaces the current hand contents.
 * Use this to guarantee a specific card is available for testing
 * (eliminates the "silent-skip" pattern where tests pass vacuously).
 */
export function injectHand(
  engine: GameEngine,
  player: Player,
  cardIds: string[],
): void {
  const state = engine.getState();
  const ps = state.players[player];

  // Access internal PlayerState via engine internals
  // We need to set hand directly — this is test-only, acceptable breach of encapsulation
  const engineAny = engine as any;
  const playerState = engineAny.players[player];
  playerState.hand = [...cardIds];
}

/**
 * Get the internal PlayerState for direct inspection in tests.
 * Returns hand, deck, discard, graveyard arrays.
 */
export function getPlayerState(engine: GameEngine, player: Player = Player.P1) {
  const engineAny = engine as any;
  const ps = engineAny.players[player];
  return {
    hand: [...ps.hand] as string[],
    deck: [...ps.deck] as string[],
    discard: [...ps.discard] as string[],
    graveyard: [...ps.graveyard] as string[],
    handLimit: ps.handLimit as number,
  };
}

export { Player, TurnPhase, EngineStatus };
