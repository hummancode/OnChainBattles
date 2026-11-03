// ============================================================
// MatchSimulation.ts
// The server's own copy of the match: the same pure GameEngine the
// clients run, fed the same seed, decks and ordered actions.
//
// It makes the server authoritative:
//   - every action is validated by actually applying it
//     (illegal / out-of-turn / impossible actions are rejected)
//   - the match result comes from the engine, not from client claims
//   - a state hash after every action detects client desyncs
//
// The engine's RNG reads the global GameState.gameSeed at shuffle
// time, so every engine call runs inside withSeed(). Node is single-
// threaded and engine calls are synchronous, so rooms can't interleave.
// ============================================================

import { GameEngine } from '../../src/game/GameEngine.js';
import GameState from '../../src/GameState.js';
import { applyAction } from '../../src/network/ActionApplier.js';
import { engineStateHash } from '../../src/game/utils/stateHash.js';
import type { GameAction } from '../../shared/types/NetworkEvents.js';
import type { GameEvent } from '../../src/game/types/EventTypes.js';

export interface SimResult {
  /** 0 | 1, or -1 for a draw. */
  winnerIndex: number;
  reason: string;
  turns: number;
}

const HASH_HISTORY = 200;

export class MatchSimulation {
  readonly seed: number;
  readonly decks: [string[], string[]];
  private engine: GameEngine;
  private _result: SimResult | null = null;
  /** serverSeq → state hash after that action (bounded). */
  private hashes = new Map<number, string>();

  constructor(seed: number, decks: [string[], string[]]) {
    this.seed = seed;
    this.decks = [[...decks[0]], [...decks[1]]];
    this.engine = this.withSeed(() => {
      const e = new GameEngine();
      e.on((ev: GameEvent) => {
        if (ev.type !== 'GAME_OVER') return;
        const r = ev.result;
        this._result = {
          winnerIndex: r.isDraw || r.winner === null ? -1 : r.winner,
          reason: r.reason,
          turns: r.turns,
        };
      });
      e.startGame(this.decks);
      return e;
    });
  }

  /** Rebuild a simulation from a stored log (server restart). */
  static fromLog(seed: number, decks: [string[], string[]], log: readonly GameAction[]): MatchSimulation {
    const sim = new MatchSimulation(seed, decks);
    for (const a of log) {
      const r = sim.apply(a, a.by ?? sim.activePlayer);
      if (!r.ok) throw new Error(`Stored log diverged at serverSeq=${a.serverSeq}: ${r.reason}`);
      if (a.serverSeq != null) sim.recordHash(a.serverSeq);
    }
    return sim;
  }

  get activePlayer(): number { return this.engine.getState().turn.activePlayer; }
  get phase(): string { return this.engine.getState().turn.phase; }
  get turnNumber(): number { return this.engine.getState().turn.turnNumber; }
  get result(): SimResult | null { return this._result; }
  get isOver(): boolean { return this._result !== null; }

  /** Validate + apply. Never throws; returns why an action was refused. */
  apply(action: GameAction, byPlayer: number): { ok: true } | { ok: false; reason: string } {
    if (this._result) return { ok: false, reason: 'match is over' };
    if (byPlayer !== this.activePlayer) {
      return { ok: false, reason: `not P${byPlayer + 1}'s turn (P${this.activePlayer + 1} to act)` };
    }
    let ok = false;
    try {
      ok = this.withSeed(() => applyAction(this.engine, action));
    } catch (err) {
      return { ok: false, reason: `engine error: ${(err as Error).message}` };
    }
    return ok ? { ok: true } : { ok: false, reason: `illegal ${action.type} in ${this.phase}` };
  }

  hash(): string {
    return engineStateHash(this.engine);
  }

  /** Remember the hash after the action stamped `serverSeq` (for later client comparisons). */
  recordHash(serverSeq: number): string {
    const h = this.hash();
    this.hashes.set(serverSeq, h);
    if (this.hashes.size > HASH_HISTORY) {
      const oldest = this.hashes.keys().next().value;
      if (oldest !== undefined) this.hashes.delete(oldest);
    }
    return h;
  }

  hashAt(serverSeq: number): string | undefined {
    return this.hashes.get(serverSeq);
  }

  /** Test/debug access to the engine (never mutate outside apply()). */
  get engineForTests(): GameEngine { return this.engine; }

  private withSeed<T>(fn: () => T): T {
    const prev = GameState.gameSeed;
    GameState.gameSeed = this.seed;
    try { return fn(); } finally { GameState.gameSeed = prev; }
  }
}
