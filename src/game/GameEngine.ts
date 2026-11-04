// ============================================================
// GameEngine.ts — Thin Orchestrator
//
// Responsibilities (and ONLY these):
//   - Own subsystem instances (Board, Mods, Players, Auras)
//   - Manage turn state machine (phase transitions)
//   - Provide public API facade for UI layer
//   - Route actions to the correct phase module
//   - Manage pending interactions
//   - Manage event subscribers
//
// All game logic lives in:
//   phases/DrawPhase.ts   — card draw
//   phases/LEGPhase.ts    — CROWN/LEG economy + passive effects
//   phases/PlayPhase.ts   — card play from hand
//   phases/ActPhase.ts    — unit move/attack + combat
//   phases/EndPhase.ts    — turn cleanup + win check
//   UnitQuery.ts          — on-demand capability checks
//   UnitFactory.ts        — unit creation
//   MovementRules.ts      — pattern resolution (pure)
//
// ZERO Phaser imports. Pure TypeScript state machine.
// ============================================================

import { Board } from './Board';
import { GameModifiers } from './GameModifiers';
import { PlayerState } from './PlayerState';
import { AuraSystem } from './AuraSystem';
import { UnitFactory, movementToNumber } from './UnitFactory';
import { getDefaultDeck } from './DefaultDeck';
import { getCard } from './data/CardRegistry';

import { Player, TurnPhase, EngineStatus } from './types/GameTypes';
import type { Position, GameStateSnapshot } from './types/GameTypes';
import type { GameEvent } from './types/EventTypes';
import type { PendingCommand } from './pending/PendingCommand';
import { resolvePending } from './pending/PendingCommandResolver';
import { Allegiance, CardClass } from './types/CardTypes';
import { AbilityType } from './types/AbilityTypes';
import type { GameContext } from './GameContext';
import { opponent } from './GameContext';

// Phase modules
import { runDrawPhase } from './phases/DrawPhase';
import { runLEGPhase } from './phases/LEGPhase';
import { executePlayCard, returnSpellToHand, deployUnitWithAbilities } from './phases/PlayPhase';
import { executeMove, executeAttack, handleUnitDeath } from './phases/ActPhase';
import { runEndPhase } from './phases/EndPhase';

// Query + pattern modules
import { canUnitMove, canUnitAttack } from './UnitQuery';
import { getValidMoves, getValidAttacks, getAttackRange, getValidDeploySquares } from './MovementRules';

// ─────────────────────────────────────────────
// PUBLIC API INTERFACE (consumed by SelectionManager)
// ─────────────────────────────────────────────

export interface IGameEngineAPI {
  getValidMoveSquares(unitId: string): Position[];
  getValidAttackSquares(unitId: string): Position[];
  getAttackRange(unitId: string): Position[];
  getValidDeployPositions(): Position[];
  getAffordableCards(): number[];
  playCard(handIndex: number, col?: number, row?: number): boolean;
  moveUnit(unitId: string, col: number, row: number): boolean;
  attackUnit(unitId: string, targetId: string): boolean;
  endPlayPhase(): void;
  endActPhase(): void;
  selectTarget(instanceId: string): void;
  selectPosition(col: number, row: number): void;
  selectColumn(col: number): void;
  selectDiscard(handIndex: number): void;
  cancelPending(): void;
  getState(): GameStateSnapshot;
  /** Kind of the interaction the engine is waiting on, or null. */
  getPendingKind(): 'TARGET' | 'POSITION' | 'COLUMN' | 'DISCARD' | null;
  /** Read-only copy of the pending interaction (valid targets/positions) — for AI and tools. */
  getPendingCommand(): PendingCommand | null;
  on(handler: (event: GameEvent) => void): void;
  off(handler: (event: GameEvent) => void): void;
}

// ─────────────────────────────────────────────
// GAME ENGINE
// ─────────────────────────────────────────────

export class GameEngine implements IGameEngineAPI {
  // Core subsystems
  private board: Board;
  private mods: [GameModifiers, GameModifiers];
  private players: [PlayerState, PlayerState];
  private auras: AuraSystem;
  private unitFactory: UnitFactory;

  // Turn state
  private turnNumber: number = 1;
  private activePlayer: Player = Player.P1;
  private phase: TurnPhase = TurnPhase.DRAW;
  private status: EngineStatus = EngineStatus.IDLE;

  // Interaction pause state
  private pending: PendingCommand | null = null;

  // Dead unit registry (instanceId → cardId)
  private graveyard: Map<string, string> = new Map();

  // Event subscribers
  private subscribers: Set<(event: GameEvent) => void> = new Set();

  // ─────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────

    constructor(cols = 7, rows = 7) {
    this.board       = new Board(cols, rows);
    this.mods        = [new GameModifiers(Player.P1), new GameModifiers(Player.P2)];
    this.players     = [new PlayerState(Player.P1), new PlayerState(Player.P2)];
    this.auras       = new AuraSystem();
    this.unitFactory = new UnitFactory();
  }

  /** Start a new game. Deals opening hands and pre-places Kings. */
  /**
   * @param decks  [P1 deck, P2 deck] from the server in multiplayer. Both clients MUST use
   *               the same pair or their simulations diverge. Omit for local play
   *               (both players use the locally loaded deck).
   */
  startGame(decks?: [string[] | null, string[] | null]): void {
    // Idempotency guard: if kings already exist, game has started
    if (this.board.getKing(Player.P1) || this.board.getKing(Player.P2)) {
      console.warn('[GameEngine] startGame() called on already-started engine — ignoring');
      return;
    }

    const localDeck = getDefaultDeck();

    this.players[Player.P1].loadDeck([...(decks?.[0] ?? localDeck)], Player.P1);
    this.players[Player.P2].loadDeck([...(decks?.[1] ?? localDeck)], Player.P2);

    this.prePlaceKing(Player.P1);
    this.prePlaceKing(Player.P2);
    this.drawOpeningHand(Player.P1);
    this.drawOpeningHand(Player.P2);
    this.auras.recalculateModifiers(this.board, this.mods);
    this.status = EngineStatus.IDLE;
    this.startTurn();
  }

  // ─────────────────────────────────────────────
  // QUERIES — gated by UnitQuery, delegated to MovementRules
  // ─────────────────────────────────────────────

  getValidMoveSquares(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    if (!canUnitMove(unit)) return [];
    return getValidMoves(unit, this.board);
  }

  getValidAttackSquares(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    if (!canUnitAttack(unit)) return [];
    return getValidAttacks(unit, this.board);
  }

  getAttackRange(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    if (!canUnitAttack(unit)) return [];
    return getAttackRange(unit, this.board);
  }

  /**
   * Squares any unit (either side, ignoring turn/exhaustion) could hit from where it stands.
   * Read-only threat query for the AI and UI hints — never use it to validate an action.
   */
  getThreatRange(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.currentAtk <= 0) return [];
    return getAttackRange(unit, this.board);
  }

  getValidDeployPositions(): Position[] {
    return getValidDeploySquares(this.activePlayer, this.board);
  }

  getAffordableCards(): number[] {
    if (this.phase !== TurnPhase.PLAY) return [];
    const hand = this.players[this.activePlayer].hand;
    const mod  = this.mods[this.activePlayer];
    return hand.map((cardId, i) => {
      const def = getCard(cardId);
      const isRoyal = def.allegiance === Allegiance.ROYAL;
      return mod.canAfford(def.cost, isRoyal) ? i : -1;
    }).filter(i => i >= 0);
  }

  getPendingKind(): 'TARGET' | 'POSITION' | 'COLUMN' | 'DISCARD' | null {
    return this.pending?.kind ?? null;
  }

  getPendingCommand(): PendingCommand | null {
    return this.pending ? structuredClone(this.pending) : null;
  }

  getState(): GameStateSnapshot {
    // Lazily computed — only build the acted set when accessed
    let actedSet: Set<string> | null = null;
    const board = this.board;

    return {
      turn: {
        turnNumber: this.turnNumber,
        activePlayer: this.activePlayer,
        phase: this.phase,
        get unitsActedThisTurn(): Set<string> {
          if (!actedSet) {
            actedSet = new Set<string>();
            for (const u of board.getAllUnits()) {
              if (u.hasActed || u.hasMoved) actedSet.add(u.instanceId);
            }
          }
          return actedSet;
        },
      },
      modifiers: [this.mods[0].snapshot(), this.mods[1].snapshot()],
      players:   [this.players[0].snapshot(), this.players[1].snapshot()],
      board:     this.board.serialize(),
      status:    this.status,
    };
  }

  // ─────────────────────────────────────────────
  // ACTIONS — routed to phase modules
  // ─────────────────────────────────────────────

  playCard(handIndex: number, col?: number, row?: number): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.PLAY) return false;

    const ctx = this.buildContext();
    const success = executePlayCard(ctx, handIndex, col, row);

    if (ctx.pending) {
      this.pending = ctx.pending;
    }
    this.syncFromContext(ctx);

    return success;
  }

  moveUnit(unitId: string, col: number, row: number): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const ctx = this.buildContext();
    const success = executeMove(ctx, unitId, col, row);

    if (ctx.pending) {
      this.pending = ctx.pending;
    }
    this.syncFromContext(ctx);

    return success;
  }

  attackUnit(unitId: string, targetId: string): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const ctx = this.buildContext();
    const success = executeAttack(ctx, unitId, targetId);

    if (ctx.pending) {
      this.pending = ctx.pending;
    }
    this.syncFromContext(ctx);

    return success;
  }

  endPlayPhase(): void {
    if (this.phase !== TurnPhase.PLAY) return;
    if (this.status === EngineStatus.AWAITING_INPUT) return;
    this.phase = TurnPhase.ACT;
    this.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.ACT, activePlayer: this.activePlayer, turn: this.turnNumber });
  }

  endActPhase(): void {
    if (this.phase !== TurnPhase.ACT) return;
    if (this.status === EngineStatus.AWAITING_INPUT) return;
    const ctx = this.buildContext();
    const gameOver = runEndPhase(ctx);
    this.syncFromContext(ctx);

    if (!gameOver) {
      // Swap player and start next turn
      if (this.activePlayer === Player.P2) this.turnNumber++;
      this.activePlayer = opponent(this.activePlayer);
      this.startTurn();
    }
  }

  // ─────────────────────────────────────────────
  // PENDING INTERACTION RESOLVERS
  // ─────────────────────────────────────────────

  selectTarget(instanceId: string): void {
    if (!this.pending || this.pending.kind !== 'TARGET') return;
    if (!this.pending.validTargetIds.includes(instanceId)) return;
    // Verify target still exists on board (may have died since pending was created)
    if (!this.board.getUnitById(instanceId)) return;
    const cmd = this.pending;
    this.clearPending();
    const events = resolvePending(cmd, { kind: 'TARGET', instanceId }, { board: this.board, mods: this.mods });
    for (const e of events) { this.applyEvent(e); this.emit(e); }
    this.checkKingDeaths();
    // Ownership changes / removals change auras (state-driven UI re-syncs from AURA_APPLIED)
    if (events.some(e => e.type === 'UNIT_CAPTURED' || e.type === 'UNIT_BANISHED')) {
      this.emit(this.auras.evaluateAuras(this.board, this.mods));
    }
  }

  selectPosition(col: number, row: number): void {
    if (!this.pending || this.pending.kind !== 'POSITION') return;
    if (!this.pending.validPositions.some(p => p.col === col && p.row === row)) return;
    const cmd = this.pending;
    this.clearPending();
    if (cmd.sourceAbility === AbilityType.SPELL_FORWARD_DEPLOY) {
      // Casus Belli step 2: which UNIT from hand goes on the chosen square.
      const hand = this.players[cmd.owner].hand;
      const validHandIndices = hand.map((id, i) => getCard(id).class === CardClass.UNIT ? i : -1).filter(i => i >= 0);
      if (validHandIndices.length === 0) return; // nothing to deploy (hand changed) — spell fizzles
      this.pending = {
        kind: 'DISCARD', owner: cmd.owner, sourceCardId: cmd.sourceCardId, sourceAbility: cmd.sourceAbility,
        count: 1, reason: 'Casus Belli: choose a unit from your hand to deploy on that square.',
        deferredEvents: [], deployAt: { col, row }, validHandIndices,
      };
      this.status = EngineStatus.AWAITING_INPUT;
      this.emit({ type: 'PENDING_DISCARD', reason: this.pending.reason, count: 1 } as GameEvent);
      return;
    }
    const events = resolvePending(cmd, { kind: 'POSITION', col, row });
    for (const e of events) { this.applyEvent(e); this.emit(e); }
  }

  selectColumn(col: number): void {
    if (!this.pending || this.pending.kind !== 'COLUMN') return;
    if (col < 0 || col >= this.board.cols) return;
    const cmd = this.pending;
    this.clearPending();
    const events = resolvePending(cmd, { kind: 'COLUMN', col }, { board: this.board });
    for (const e of events) { this.applyEvent(e); this.emit(e); }
    this.checkKingDeaths();
  }

  selectDiscard(handIndex: number): void {
    if (!this.pending || this.pending.kind !== 'DISCARD') return;
    const ps = this.players[this.activePlayer];
    if (handIndex < 0 || handIndex >= ps.hand.length) return;
    if (this.pending.validHandIndices && !this.pending.validHandIndices.includes(handIndex)) return;
    const cmd = this.pending;
    this.clearPending();

    if (cmd.deployAt) {
      // Casus Belli: deploy the picked unit for free on the chosen square — through the same
      // placement + On Deploy path as a normal deploy (its own On Deploy ability fires).
      const cardId = ps.hand.splice(handIndex, 1)[0];
      this.emit({ type: 'CARD_PLAYED', player: this.activePlayer, cardId, handIndex, legCost: 0 } as GameEvent);
      const ctx = this.buildContext();
      deployUnitWithAbilities(ctx, cardId, this.activePlayer, cmd.deployAt);
      this.syncFromContext(ctx);
      return;
    }

    // Actually discard the card from hand
    const cardId = ps.hand.splice(handIndex, 1)[0];
    ps.discard.push(cardId);
    this.emit({
      type: 'CARD_DISCARDED',
      player: this.activePlayer,
      cardId,
      handIndex,
    } as GameEvent);

    // Apply deferred events (e.g., War Horn movement buff)
    for (const e of cmd.deferredEvents) { this.applyEvent(e); this.emit(e); }
  }

  /** Cancel the current pending interaction (e.g., user pressed Cancel / ESC).
   *  Does NOT emit INTERACTION_RESOLVED — the UI-initiated cancel already
   *  emitted it, so clearPending()'s extra emit would cause a double-fire. */
  cancelPending(): void {
    if (!this.pending) return;
    // DISCARD is a cost (War Horn: draw 2, THEN discard 1) — not skippable.
    if (this.pending.kind === 'DISCARD') return;
    console.log('[GameEngine] Pending interaction cancelled');
    const refund = this.pending.refund;
    this.pending = null;
    this.status  = EngineStatus.IDLE;
    if (refund) {
      // Spell: take it back out of the discard pile and refund it.
      const discard = this.players[this.activePlayer].discard;
      const i = discard.lastIndexOf(refund.cardId);
      if (i !== -1) discard.splice(i, 1);
      returnSpellToHand(
        { players: this.players, mods: this.mods, activePlayer: this.activePlayer, emit: (e) => this.emit(e) },
        refund.cardId, refund.legCost, 'CANCELLED',
      );
    }
  }

  // ─────────────────────────────────────────────
  // EVENT BUS
  // ─────────────────────────────────────────────

  on(handler: (event: GameEvent) => void): void {
    this.subscribers.add(handler);
  }

  off(handler: (event: GameEvent) => void): void {
    this.subscribers.delete(handler);
  }

  private emit(event: GameEvent): void {
    for (const sub of this.subscribers) {
      try { sub(event); } catch (e) { console.error('[GameEngine] Subscriber error:', e); }
    }
  }

  // ─────────────────────────────────────────────
  // TURN LOOP — wires phase modules in sequence
  // ─────────────────────────────────────────────

  private startTurn(): void {
    this.emit({ type: 'TURN_STARTED', turn: this.turnNumber, activePlayer: this.activePlayer });
    this.board.resetTurnFlags(this.activePlayer);

    const ctx = this.buildContext();

    // DRAW → LEG → lands on PLAY (LEGPhase advances to PLAY internally)
    runDrawPhase(ctx);
    runLEGPhase(ctx);

    this.syncFromContext(ctx);
  }

  // ─────────────────────────────────────────────
  // CONTEXT BRIDGE
  // ─────────────────────────────────────────────

  /**
   * Build a GameContext from current engine state.
   * Phase modules receive this instead of the engine itself.
   * This is the ONLY coupling point between engine and phases.
   */
  private buildContext(): GameContext {
    const ctx: GameContext = {
      board:        this.board,
      mods:         this.mods,
      players:      this.players,
      auras:        this.auras,
      activePlayer: this.activePlayer,
      turnNumber:   this.turnNumber,
      phase:        this.phase,
      status:       this.status,
      graveyard:    this.graveyard,
      pending:      undefined,

      createUnit: (cardId, owner, pos) => this.unitFactory.create(cardId, owner, pos),

      emit: (event) => this.emit(event),

      applyEvents: (events) => {
        for (const event of events) {
          this.applyEvent(event);
          this.emit(event);
        }
        // Effects (Castle, Disease, Earthquake…) can drop a King to 0 mid-phase.
        if (this.checkKingDeaths()) ctx.status = EngineStatus.GAME_OVER;
      },
    };
    return ctx;
  }

  /**
   * A King at 0 HP (or gone) outside combat ends the game right away — draw if both fell
   * in the same batch (e.g. Earthquake through the centre column). Combat has its own
   * check (ActPhase); END phase double-checks. Returns true if the game is (now) over.
   */
  private checkKingDeaths(): boolean {
    if (this.status === EngineStatus.GAME_OVER) return true;
    const dead = (p: Player) => { const k = this.board.getKing(p); return !k || k.currentDef <= 0; };
    const d1 = dead(Player.P1), d2 = dead(Player.P2);
    if (!d1 && !d2) return false;
    this.status = EngineStatus.GAME_OVER;
    this.pending = null;
    this.emit({
      type: 'GAME_OVER',
      result: d1 && d2
        ? { winner: null, loser: null, isDraw: true, reason: 'KING_DESTROYED', turns: this.turnNumber }
        : { winner: d1 ? Player.P2 : Player.P1, loser: d1 ? Player.P1 : Player.P2, reason: 'KING_DESTROYED', turns: this.turnNumber },
    });
    return true;
  }

  /**
   * Sync engine state back from context after phase execution.
   * Phase modules may have changed phase/status.
   */
  private syncFromContext(ctx: GameContext): void {
    this.phase  = ctx.phase;
    this.status = ctx.status;
    if (ctx.pending) {
      this.pending = ctx.pending;
    }
  }

  // ─────────────────────────────────────────────
  // EVENT APPLICATION — central state mutation
  // ─────────────────────────────────────────────

  private applyEvent(event: GameEvent): void {
    switch (event.type) {
      case 'UNIT_PLACED': {
        const exists = this.board.getUnitById(event.instanceId);
        if (!exists) {
          // Create unit with the event's instanceId to avoid post-emit mutation.
          // UnitFactory generates a new ID, but we override it to match the event
          // so subscribers already holding this event object see a consistent ID.
          const newUnit = this.unitFactory.create(event.cardId, event.owner, { col: event.col, row: event.row });
          newUnit.isActive = event.isActive;
          // '' → keep the factory's deterministic id and write it back (applied before emit)
          if (event.instanceId) newUnit.instanceId = event.instanceId;
          else event.instanceId = newUnit.instanceId;
          this.board.placeUnit(newUnit);
          if (event.fromGraveyard) this.players[event.owner].takeFromGraveyard(event.cardId);
          if (event.fromDeck) {
            const deck = this.players[event.owner].deck;
            const i = deck.indexOf(event.cardId);
            if (i !== -1) deck.splice(i, 1);
          }
        }
        break;
      }

      case 'UNIT_ATTACKED': {
        const target = this.board.getUnitById(event.targetInstanceId);
        if (target) {
          this.board.updateUnitStats(target.instanceId, { currentDef: event.targetNewHP });
        }
        break;
      }

      case 'UNIT_DIED': {
        // Deaths from effects (spells, Disease, Castle) arrive here; combat deaths are handled
        // in ActPhase before emitting and never reach applyEvent. Without this the unit
        // stayed on the board at 0 HP and the next aura pass revived it to 1.
        if (!this.board.getUnitById(event.instanceId)) break;
        const ctx = this.buildContext();
        handleUnitDeath(ctx, event.instanceId, event.cardId, event.owner, event.cause);
        if (ctx.pending) { this.pending = ctx.pending; this.status = EngineStatus.AWAITING_INPUT; }
        break;
      }

      case 'UNIT_HEALED': {
        const u = this.board.getUnitById(event.instanceId);
        if (u) {
          this.board.updateUnitStats(u.instanceId, { currentDef: event.newHP });
        }
        break;
      }

      case 'UNIT_TRANSFORMED': {
        const old = this.board.getUnitById(event.oldInstanceId);
        if (!old) break;
        const newDef = getCard(event.toCardId);
        const newStats = newDef.stats!;
        this.board.updateUnitStats(event.oldInstanceId, {
          cardId:           event.toCardId,
          instanceId:       event.newInstanceId,
          baseAtk:          newStats.atk,
          baseDef:          newStats.def,
          currentAtk:       newStats.atk,
          currentDef:       event.newHP,
          maxDef:           event.newMaxHP,
          baseMovement:     movementToNumber(newStats.movement),
          currentMovement:  movementToNumber(newStats.movement),
          baseMovementType: newStats.movement,
          baseAtkPattern:   newStats.attackPattern,
        });
        break;
      }

      case 'CARD_DRAWN': {
        const ps = this.players[event.player];
        if (event.cardId === '__DRAW__') {
          const drawn = ps.drawCards(1);
          if (drawn.length > 0) {
            event.cardId = drawn[0];
            event.handIndex = ps.hand.length - 1;
            event.deckRemaining = ps.deck.length;
          }
        } else if (event.cardId.startsWith('__DRAW_FILTERED_')) {
          const filter = event.cardId.replace('__DRAW_FILTERED_', '').replace('__', '');
          const drawn = ps.drawCardsFiltered(1, filter as 'ROYAL' | 'STANDARD');
          if (drawn.length > 0) {
            event.cardId = drawn[0];
            event.handIndex = ps.hand.length - 1;
            event.deckRemaining = ps.deck.length;
          }
        } else if (event.cardId === '__DRAW_OVERFLOW__') {
          const drawn = ps.drawCardsOverflow(1);
          if (drawn.length > 0) {
            event.cardId = drawn[0];
            event.handIndex = ps.hand.length - 1;
            event.deckRemaining = ps.deck.length;
          }
        }
        break;
      }

      case 'LEG_RATE_CHANGED': {
        const mod = this.mods[event.player];
        const oldRate = mod.getEffectiveLEGRate();
        if (event.newRate < oldRate) {
          mod.addLEGRatePenalty(oldRate - event.newRate);
        }
        break;
      }

      case 'LEG_STOLEN': {
        const fromMod = this.mods[event.from];
        const toMod   = this.mods[event.to];
        const actual  = Math.min(event.amount, fromMod.legPool);
        fromMod.removeLEG(actual);
        toMod.addLEG(actual);
        break;
      }

      case 'CIVIL_WAR_DECLARED': {
        // Timed effects tick at their owner's END. The caster already collected LEG this
        // turn, so its effect lasts one tick longer → both players skip exactly `turns` gains.
        for (const p of [Player.P1, Player.P2]) {
          const mod = this.mods[p];
          mod.removeEffect('CIVIL_WAR_FREEZE');
          mod.addTimedEffect({ type: 'CIVIL_WAR_FREEZE', duration: event.turns + (p === event.caster ? 1 : 0) });
          mod.legRateFrozen = true;
        }
        break;
      }

      case 'DISEASE_APPLIED': {
        // Add DISEASE_TICK timed effect to the caster's mods.
        // Ticks during caster's LEG phase via runDiseaseTicks().
        this.mods[event.caster].addTimedEffect({
          type: 'DISEASE_TICK',
          // +1: applied in PLAY, the caster's END tick runs before the first damage tick
          duration: event.duration + 1,
          value: event.damage,
          targetInstanceId: event.targetInstanceId,
        });
        break;
      }

      case 'UNIT_CAPTURED': {
        const u = this.board.getUnitById(event.instanceId);
        if (!u) break;
        if (event.permanent) {
          u.treasonOwner = null;
          u.originalPos = null;
          // Coup: joins its new side like a fresh deploy — can't act until its new owner's next turn
          u.isJustPlaced = true;
        } else {
          u.treasonOwner = event.from;                     // returned at the caster's END phase
          u.originalPos = { ...u.position };
          // Fresh for its new controller this turn (its owner may have used it last turn)
          u.hasMoved = false; u.hasActed = false; u.lastMoveDirection = null; u.isJustPlaced = false;
        }
        this.board.setOwner(u.instanceId, event.to); // invalidates getUnitsOf caches
        break;
      }

      case 'UNIT_BANISHED': {
        // Gone from the game: no graveyard, no discard, no on-death triggers.
        this.board.removeUnit(event.instanceId);
        break;
      }

      case 'WAR_HORN_SOUNDED': {
        // Duration 1: added during PLAY, removed by the caster's END-phase tick.
        this.mods[event.player].addTimedEffect({
          type: 'WAR_HORN_MOVEMENT',
          duration: 1,
          value: event.moveBonus,
        });
        break;
      }

      // Informational events — no state mutation needed
      default:
        break;
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private clearPending(): void {
    this.pending = null;
    this.status  = EngineStatus.IDLE;
    this.emit({ type: 'INTERACTION_RESOLVED' });
  }

 private prePlaceKing(player: Player): void {
    const row = player === Player.P1 ? 0 : this.board.rows - 1;
    const col = Math.floor(this.board.cols / 2);  // Center: col 3 on 7-wide board
    const unit = this.unitFactory.create('king', player, { col, row });
    unit.isJustPlaced = false;  // Kings are pre-placed, they can act from turn 1
    this.board.placeUnit(unit);
    this.emit({ type: 'UNIT_PLACED', instanceId: unit.instanceId, cardId: 'king', owner: player, col, row, isActive: true });
  }
  private drawOpeningHand(player: Player): void {
    const ps = this.players[player];
    const drawn = ps.drawCards(4);
    for (let i = 0; i < drawn.length; i++) {
      this.emit({ type: 'CARD_DRAWN', player, cardId: drawn[i], handIndex: i, deckRemaining: ps.deck.length });
    }
  }
}
