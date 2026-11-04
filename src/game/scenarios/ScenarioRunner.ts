// ============================================================
// ScenarioRunner.ts — plays one scenario on a real GameEngine.
//
// Pure + Node-safe: the same runner drives the BattleScene (UI) and the
// tests that prove every scenario is solvable. All actions go through
// applyAction (the path human, bot and network actions take).
//
// Rules on top of the normal game:
//   - the player (P1) has `maxMoves` moves: PLAY_CARD / MOVE_UNIT /
//     ATTACK_UNIT. Pending choices and ending a turn are free.
//   - when the last move is spent, the rest of that turn ends by itself
//     and the goal is checked: not reached → lost (OUT_OF_MOVES).
//   - the opponent replies automatically (script, then Hard bot).
//   - P1 turn `maxTurns` + 1 beginning without a win → lost (OUT_OF_TURNS).
// ============================================================

import { GameEngine } from '../GameEngine';
import GameState from '../../GameState';
import { applyAction } from '../../network/ActionApplier';
import { nextBotAction } from '../ai/SimpleBot';
import { Player } from '../types/GameTypes';
import type { GameAction } from '../../../shared/types/NetworkEvents';
import type { GameEvent } from '../types/EventTypes';
import type { Scenario, ScenarioStatus, LoseReason } from './ScenarioTypes';

const COUNTED = new Set<GameAction['type']>(['PLAY_CARD', 'MOVE_UNIT', 'ATTACK_UNIT']);

export class ScenarioRunner {
  readonly engine: GameEngine;
  readonly scenario: Scenario;
  movesUsed = 0;
  status: ScenarioStatus = 'playing';
  loseReason: LoseReason | null = null;
  /** instanceIds of KILL_UNITS targets (resolved from squares at setup). */
  readonly targetIds: string[] = [];

  private gameOver: { winner: number | null; isDraw: boolean } | null = null;
  private oppTurnIndex = -1;
  private oppScriptPos = 0;
  /** This opponent turn's script broke (illegal reply) → bot for the rest of the turn. */
  private oppOffScript = false;
  private listeners = new Set<() => void>();

  constructor(scenario: Scenario, engine?: GameEngine) {
    this.scenario = scenario;
    this.engine = engine ?? new GameEngine();
    this.withSeed(() => {
      this.engine.on((ev: GameEvent) => {
        if (ev.type === 'GAME_OVER') this.gameOver = { winner: ev.result.winner, isDraw: !!ev.result.isDraw };
        if (ev.type === 'TURN_STARTED' && ev.activePlayer === Player.P2) {
          this.oppTurnIndex++; this.oppScriptPos = 0; this.oppOffScript = false;
        }
      });
      const decks = scenario.setup.decks ?? [[], []];
      this.engine.startGame([[...decks[0]], [...decks[1]]]);
      if (!this.engine.loadPosition(scenario.setup)) throw new Error(`[Scenario ${scenario.id}] loadPosition refused`);
    });
    if (scenario.goal.kind === 'KILL_UNITS') {
      const st = this.engine.getState();
      for (const sq of scenario.goal.squares) {
        const u = st.board.find(c => c.col === sq.col && c.row === sq.row)?.unit;
        if (!u) throw new Error(`[Scenario ${scenario.id}] no target unit at ${sq.col},${sq.row}`);
        this.targetIds.push(u.instanceId);
      }
    }
  }

  get movesLeft(): number { return Math.max(0, this.scenario.maxMoves - this.movesUsed); }
  /** The player's own turn count (1 = first). The engine numbers rounds (P1 + P2 share a number). */
  get playerTurn(): number { return this.engine.getState().turn.turnNumber; }
  get opponentToMove(): boolean {
    return this.status === 'playing' && this.engine.getState().turn.activePlayer === Player.P2;
  }
  /** Targets still alive (KILL_UNITS). */
  get targetsLeft(): number {
    const alive = new Set(this.engine.getState().board.map(c => c.unit?.instanceId).filter(Boolean));
    return this.targetIds.filter(id => alive.has(id)).length;
  }

  /** Called after every state change the runner makes (UI refresh hook). */
  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** A player (P1) action. Returns false if refused (no state change, no move spent). */
  play(action: GameAction): boolean {
    if (this.status !== 'playing' || this.engine.getState().turn.activePlayer !== Player.P1) return false;
    const counted = COUNTED.has(action.type);
    if (counted && this.movesLeft === 0) return false;
    const ok = this.withSeed(() => applyAction(this.engine, action));
    if (!ok) return false;
    if (counted) this.movesUsed++;
    this.evaluate();
    if (this.status === 'playing' && this.movesLeft === 0 && !this.engine.getPendingKind()
        && this.engine.getState().turn.activePlayer === Player.P1) {
      // Last move spent: finish the turn and judge the position.
      this.endPlayerTurn();
      this.evaluate();
      if (this.status === 'playing') this.lose('OUT_OF_MOVES');
    }
    this.notify();
    return true;
  }

  /** One opponent action (UI paces these). Returns what was played, or null if it's not its move. */
  stepOpponent(): GameAction | null {
    if (!this.opponentToMove) return null;
    const action = this.withSeed(() => this.nextOpponentAction());
    this.evaluate();
    this.notify();
    return action;
  }

  /** Let the opponent finish its whole turn (tests / fast-forward). */
  runOpponent(maxSteps = 200): void {
    for (let i = 0; i < maxSteps && this.opponentToMove; i++) this.stepOpponent();
  }

  // ─────────────────────────────────────────────

  private nextOpponentAction(): GameAction {
    const e = this.engine;
    const script = this.scenario.opponentScript?.[this.oppTurnIndex];
    if (script && !this.oppOffScript) {
      const planned = this.oppScriptPos < script.length
        ? script[this.oppScriptPos]
        : { type: e.getState().turn.phase === 'PLAY' ? 'END_PLAY_PHASE' : 'END_ACT_PHASE' } as GameAction;
      if (applyAction(e, planned)) { this.oppScriptPos++; return planned; }
      this.oppOffScript = true; // the player took another line — improvise
    }
    const a = nextBotAction(e, Player.P2, { difficulty: 'hard' });
    if (applyAction(e, a)) return a;
    // Never stall: drop a stuck choice / end the phase.
    if (e.getPendingKind()) applyAction(e, { type: 'CANCEL_PENDING' });
    const end: GameAction = { type: e.getState().turn.phase === 'PLAY' ? 'END_PLAY_PHASE' : 'END_ACT_PHASE' };
    applyAction(e, end);
    return end;
  }

  private endPlayerTurn(): void {
    const e = this.engine;
    for (let i = 0; i < 4 && e.getState().turn.activePlayer === Player.P1 && e.getState().status !== 'GAME_OVER'; i++) {
      if (e.getPendingKind()) applyAction(e, { type: 'CANCEL_PENDING' });
      this.withSeed(() => applyAction(e, { type: e.getState().turn.phase === 'PLAY' ? 'END_PLAY_PHASE' : 'END_ACT_PHASE' }));
    }
  }

  private evaluate(): void {
    if (this.status !== 'playing') return;
    if (this.gameOver) {
      if (!this.gameOver.isDraw && this.gameOver.winner === Player.P1) this.win();
      else this.lose('KING_DIED');
      return;
    }
    const g = this.scenario.goal;
    if (g.kind === 'KILL_UNITS' && this.targetsLeft === 0) { this.win(); return; }
    const st = this.engine.getState();
    if (st.turn.activePlayer === Player.P1) {
      if (g.kind === 'SURVIVE' && this.playerTurn > g.turns) { this.win(); return; }
      if (this.playerTurn > this.scenario.maxTurns) this.lose('OUT_OF_TURNS');
    }
  }

  private win(): void { this.status = 'won'; }
  private lose(r: LoseReason): void { this.status = 'lost'; this.loseReason = r; }
  private notify(): void { for (const fn of this.listeners) fn(); }

  private withSeed<T>(fn: () => T): T {
    const prev = GameState.gameSeed;
    GameState.gameSeed = this.scenario.seed;
    try { return fn(); } finally { GameState.gameSeed = prev; }
  }
}
