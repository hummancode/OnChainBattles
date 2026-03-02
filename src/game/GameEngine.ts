// ============================================================
// GameEngine.ts
// Turn loop orchestration. Phase state machine. Event emitter.
// Public API surface for Phaser (via SelectionManager).
// ZERO Phaser imports. Pure TypeScript state machine.
//
// Turn sequence: DRAW → LEG → PLAY → ACT → END
// Pending interactions pause the engine between PLAY steps.
// Engine ignores all action calls except resolve* until cleared.
// ============================================================

import { Board } from './Board';
import { GameModifiers } from './GameModifiers';
import { PlayerState } from './PlayerState';
import { AuraSystem } from './AuraSystem';
import { resolveOnDeploy, resolveOnDeath, resolveOnKill } from './AbilityResolver';
import {
  resolveAttack, resolveCastleAreaAttack,
  applyDamage, applyFullHeal, applyAutoHeal, applyReform, applyEarthquakeDamage,
} from './CombatResolver';
import { getValidMoves, getValidAttacks, getValidDeploySquares, isMoveValid, isAttackValid, isLancerForwardMove } from './MovementRules';
import { getCard, DEMO_DECK_IDS } from './data/CardDefinitions';
import { Player, TurnPhase, EngineStatus } from './types/GameTypes';
import type { Unit, Position, GameStateSnapshot } from './types/GameTypes';
import type { GameEvent, EvGameOver } from './types/EventTypes';
import type { PendingInteraction } from './types/AbilityTypes';
import { Allegiance, CardClass, CardFlag, SubType } from './types/CardTypes';

// ─────────────────────────────────────────────
// PUBLIC API INTERFACE (consumed by SelectionManager)
// ─────────────────────────────────────────────

export interface IGameEngineAPI {
  getValidMoveSquares(unitId: string): Position[];
  getValidAttackSquares(unitId: string): Position[];
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
  getState(): GameStateSnapshot;
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

  // Turn state
  private turnNumber: number = 1;
  private activePlayer: Player = Player.P1;
  private phase: TurnPhase = TurnPhase.DRAW;
  private status: EngineStatus = EngineStatus.IDLE;

  // Interaction pause state
  private pending: PendingInteraction | null = null;

  // Unit factory counter
  private instanceCounter: number = 0;

  // Card play state (set during PLAY phase to track what was just played)
  private lastPlayedCardId: string | null = null;
  private lastPlayedUnit: Unit | null = null;

  // Dead unit registry (for Mystic revive — instanceId → cardId)
  private graveyard: Map<string, string> = new Map(); // instanceId → cardId

  // Event subscribers
  private subscribers: Set<(event: GameEvent) => void> = new Set();

  // ─────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────

  constructor(cols = 6, rows = 6) {
    this.board   = new Board(cols, rows);
    this.mods    = [new GameModifiers(Player.P1), new GameModifiers(Player.P2)];
    this.players = [new PlayerState(Player.P1), new PlayerState(Player.P2)];
    this.auras   = new AuraSystem();
  }

  /** Start a new game. Deals opening hands and pre-places Kings. */
  startGame(): void {
    // Load decks
    this.players[Player.P1].loadDeck([...DEMO_DECK_IDS]);
    this.players[Player.P2].loadDeck([...DEMO_DECK_IDS]);

    // Pre-place Kings
    this.prePlaceKing(Player.P1);
    this.prePlaceKing(Player.P2);

    // Draw opening hands (4 cards each)
    this.drawOpeningHand(Player.P1);
    this.drawOpeningHand(Player.P2);

    // Recalculate modifiers (Kings on board)
    this.auras.recalculateModifiers(this.board, this.mods);

    // Start turn 1 for P1
    this.status = EngineStatus.IDLE;
    this.startTurn();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API — QUERIES (no state change)
  // ─────────────────────────────────────────────

  getValidMoveSquares(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    return getValidMoves(unit, this.board);
  }

  getValidAttackSquares(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    return getValidAttacks(unit, this.board);
  }

  getValidDeployPositions(): Position[] {
    return getValidDeploySquares(this.activePlayer, this.board);
  }

  /** Returns hand indices of cards the active player can afford this turn. */
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

  getState(): GameStateSnapshot {
    return {
      turn: {
        turnNumber: this.turnNumber,
        activePlayer: this.activePlayer,
        phase: this.phase,
        unitsActedThisTurn: new Set(
          this.board.getAllUnits()
            .filter(u => u.hasActed || u.hasMoved)
            .map(u => u.instanceId)
        ),
      },
      modifiers: [this.mods[0].snapshot(), this.mods[1].snapshot()],
      players:   [this.players[0].snapshot(), this.players[1].snapshot()],
      board:     this.board.serialize(),
      status:    this.status,
    };
  }

  // ─────────────────────────────────────────────
  // PUBLIC API — ACTIONS
  // ─────────────────────────────────────────────

  /**
   * Play a card from hand.
   * Units/Structures require col+row. Spells do not.
   * Returns false if illegal (wrong phase, can't afford, wrong position).
   */
  playCard(handIndex: number, col?: number, row?: number): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.phase !== TurnPhase.PLAY) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;

    const ps   = this.players[this.activePlayer];
    const mod  = this.mods[this.activePlayer];
    const cardId = ps.hand[handIndex];
    if (!cardId) return false;

    const def = getCard(cardId);
    const isRoyal = def.allegiance === Allegiance.ROYAL;
    const cost = mod.getEffectiveCardCost(def.cost, isRoyal);

    // Afford check
    if (!mod.spendLEG(cost)) return false;

    // Remove from hand
    ps.playFromHand(handIndex);
    this.emit({ type: 'CARD_PLAYED', player: this.activePlayer, cardId, handIndex, legCost: cost });
    this.emit({ type: 'LEG_SPENT', player: this.activePlayer, amount: cost, remaining: mod.legPool, rate: mod.getEffectiveLEGRate() });

    let unitInstance: Unit | undefined;

    // ── Place unit/structure on board ──────────────────────
    if (def.class === CardClass.UNIT || def.class === CardClass.STRUCTURE) {
      if (col === undefined || row === undefined) {
        // Roll back — no position provided for a unit card
        mod.addLEG(cost);
        ps.hand.splice(handIndex, 0, cardId);
        return false;
      }

      // Validate deploy position
      const freeSquares = getValidDeploySquares(this.activePlayer, this.board);
      const isValidDeploy = freeSquares.some(p => p.col === col && p.row === row);
      if (!isValidDeploy) {
        mod.addLEG(cost);
        ps.hand.splice(handIndex, 0, cardId);
        return false;
      }

      const isStructure = def.class === CardClass.STRUCTURE;
      const hasBuildDelay = def.flags.includes(CardFlag.BUILD_DELAY);
      const stats = def.stats!;

      unitInstance = this.createUnit(cardId, this.activePlayer, { col, row });
      unitInstance.isActive = !hasBuildDelay;

      if (hasBuildDelay) {
        this.mods[this.activePlayer].addTimedEffect({
          type: 'BUILD_DELAY',
          duration: 1,
          targetInstanceId: unitInstance.instanceId,
        });
      }

      this.board.placeUnit(unitInstance);
      this.emit({
        type: 'UNIT_PLACED',
        instanceId: unitInstance.instanceId,
        cardId,
        owner: this.activePlayer,
        col, row,
        isActive: unitInstance.isActive,
      });

      this.lastPlayedUnit = unitInstance;
    }

    this.lastPlayedCardId = cardId;

    // ── Resolve on-deploy abilities ────────────────────────
    const pos = col !== undefined && row !== undefined ? { col, row } : undefined;
    const result = resolveOnDeploy(
      cardId, this.activePlayer, pos,
      this.board,
      this.players, this.mods,
      unitInstance
    );

    // Apply immediate events
    this.applyEvents(result.events);

    // Recalculate modifiers (new unit may change discounts/rate)
    this.auras.recalculateModifiers(this.board, this.mods);

    // Handle pending interaction (Priest, Mystic, Disease, etc.)
    if (result.pending) {
      this.pending = result.pending;
      this.status  = EngineStatus.AWAITING_INPUT;
      this.emit({
        type: result.pending.kind === 'TARGET'   ? 'PENDING_TARGET'   :
              result.pending.kind === 'POSITION' ? 'PENDING_POSITION' :
              result.pending.kind === 'COLUMN'   ? 'PENDING_COLUMN'   :
                                                   'PENDING_DISCARD',
        reason: result.pending.reason,
        validTargetIds:  result.pending.validTargetIds ?? [],
        validPositions:  result.pending.validPositions ?? [],
        count: 1,
      } as any);
    }

    // Spells go to discard after play
    if (def.class === CardClass.SPELL) {
      ps.discard.push(cardId);
    }

    return true;
  }

  /** Move a unit to a new position. Only valid in ACT phase. */
  moveUnit(unitId: string, col: number, row: number): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return false;

    // Lancer: can move AND attack — check separately
    const def = getCard(unit.cardId);
    const isLancer = def.flags.includes(CardFlag.LANCER_CHARGE);

    if (!isMoveValid(unit, col, row, this.board)) return false;

    // Lancer charge: movement must be forward
    if (isLancer && !isLancerForwardMove(unit, row)) return false;

    const from = { ...unit.position };
    this.board.moveUnit(unitId, col, row);
    unit.hasMoved = true;

    // Non-Lancer: moving ends this unit's turn
    if (!isLancer) unit.hasActed = true;

    this.emit({
      type: 'UNIT_MOVED',
      instanceId: unitId,
      cardId: unit.cardId,
      owner: unit.owner,
      from,
      to: { col, row },
    });

    // Assassin: move + attack landing square simultaneously
    if (unit.baseAtkPattern === 'ON_JUMP' as any) {
      const defender = this.board.getUnit(col, row);
      if (defender && defender.owner !== unit.owner) {
        // Assassin jumped onto an enemy — auto-attack
        this.executeAttack(unit, defender);
      }
    }

    return true;
  }

  /** Attack a target unit. Only valid in ACT phase. */
  attackUnit(unitId: string, targetId: string): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const unit   = this.board.getUnitById(unitId);
    const target = this.board.getUnitById(targetId);
    if (!unit || !target || unit.owner !== this.activePlayer) return false;
    if (target.owner === this.activePlayer) return false;

    // Validate attack legality
    const validTargets = getValidAttacks(unit, this.board);
    const isValid = validTargets.some(p => p.col === target.position.col && p.row === target.position.row);
    if (!isValid) return false;

    this.executeAttack(unit, target);
    return true;
  }

  endPlayPhase(): void {
    if (this.phase !== TurnPhase.PLAY) return;
    this.advancePhase(TurnPhase.ACT);
  }

  endActPhase(): void {
    if (this.phase !== TurnPhase.ACT) return;
    this.runEndPhase();
  }

  // ─────────────────────────────────────────────
  // PENDING INTERACTION RESOLVERS
  // ─────────────────────────────────────────────

  selectTarget(instanceId: string): void {
    if (!this.pending || this.pending.kind !== 'TARGET') return;
    const valid = this.pending.validTargetIds ?? [];
    if (!valid.includes(instanceId)) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb(instanceId);
  }

  selectPosition(col: number, row: number): void {
    if (!this.pending || this.pending.kind !== 'POSITION') return;
    const valid = this.pending.validPositions ?? [];
    if (!valid.some(p => p.col === col && p.row === row)) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb({ col, row });
  }

  selectColumn(col: number): void {
    if (!this.pending || this.pending.kind !== 'COLUMN') return;
    if (col < 0 || col >= this.board.cols) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb(col);
  }

  selectDiscard(handIndex: number): void {
    if (!this.pending || this.pending.kind !== 'DISCARD') return;
    const ps = this.players[this.activePlayer];
    if (handIndex < 0 || handIndex >= ps.hand.length) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb(handIndex);
  }

  // ─────────────────────────────────────────────
  // EVENT BUS (subscribers)
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
  // TURN LOOP
  // ─────────────────────────────────────────────

  private startTurn(): void {
    this.emit({ type: 'TURN_STARTED', turn: this.turnNumber, activePlayer: this.activePlayer });
    this.board.resetTurnFlags(this.activePlayer);
    this.runDrawPhase();
  }

  private runDrawPhase(): void {
    this.advancePhase(TurnPhase.DRAW);

    const ps = this.players[this.activePlayer];
    const drawnBefore = ps.deck.length;
    const drawn = ps.drawCards(1);

    if (drawn.length > 0) {
      const cardId = drawn[0];
      this.emit({
        type: 'CARD_DRAWN',
        player: this.activePlayer,
        cardId,
        handIndex: ps.hand.length - 1,
        deckRemaining: ps.deck.length,
      });
    }

    // Check if deck reshuffled
    if (ps.deck.length > drawnBefore) {
      this.emit({ type: 'DECK_SHUFFLED', player: this.activePlayer, newDeckCount: ps.deck.length });
    }

    this.runLEGPhase();
  }

  private runLEGPhase(): void {
    this.advancePhase(TurnPhase.LEG);
    const ap = this.activePlayer;
    const mod = this.mods[ap];

    // 1. Gain LEG
    const gained = mod.gainLEG();
    this.emit({ type: 'LEG_GAINED', player: ap, amount: gained, total: mod.legPool, rate: mod.getEffectiveLEGRate() });

    // 2. Check enemy King in own half → −1 LEG this turn
    const enemyKing = this.board.getKing(opponent(ap));
    if (enemyKing) {
      if (this.board.isOwnHalf(enemyKing.position.col, enemyKing.position.row, ap)) {
        mod.removeLEG(1);
        this.emit({ type: 'LEG_SPENT', player: ap, amount: 1, remaining: mod.legPool, rate: mod.getEffectiveLEGRate() });
      }
    }

    // 3. Kings Guard auto-heal
    const kingsGuard = this.board.getUnitsOf(ap).find(u => u.cardId === 'knights_guard' && u.isActive);
    if (kingsGuard) {
      const healEvents = applyAutoHeal(kingsGuard, 2);
      this.applyEvents(healEvents);
    }

    // 4. Disease ticks
    this.tickDiseaseEffects(ap);

    // 5. Castle area attacks + spawn check
    const castles = this.board.getUnitsOf(ap).filter(u => u.cardId === 'castle' && u.isActive);
    for (const castle of castles) {
      const atkEvents = resolveCastleAreaAttack(castle, this.board);
      this.applyEvents(atkEvents);

      // Spawn counter
      castle.spawnCounter++;
      const spawnDef = getCard('castle');
      const spawnAbility = spawnDef.abilities.find((a: any) => a.type === 'PASSIVE_SPAWN') as any;
      const interval = spawnAbility?.params?.interval ?? 3;
      if (castle.spawnCounter >= interval) {
        castle.spawnCounter = 0;
        const freeSquares = this.board.getFreeSquaresInHalf(ap);
        if (freeSquares.length > 0) {
          const spawnPos = freeSquares[0];
          const spawnUnit = this.createUnit('foot_soldier', ap, spawnPos);
          this.board.placeUnit(spawnUnit);
          this.emit({ type: 'UNIT_PLACED', instanceId: spawnUnit.instanceId, cardId: 'foot_soldier', owner: ap, col: spawnPos.col, row: spawnPos.row, isActive: true });
          this.emit({ type: 'STRUCTURE_SPAWNED', structureInstanceId: castle.instanceId, spawnedCardId: 'foot_soldier', spawnedInstanceId: spawnUnit.instanceId, col: spawnPos.col, row: spawnPos.row, owner: ap });
        }
      }
    }

    // 6. Activate BUILD_DELAY units
    const buildDelays = mod.timedEffects.filter(e => e.type === 'BUILD_DELAY' && e.duration <= 1);
    for (const effect of buildDelays) {
      if (effect.targetInstanceId) {
        const unit = this.board.getUnitById(effect.targetInstanceId);
        if (unit) {
          unit.isActive = true;
          this.emit({ type: 'UNIT_ACTIVATED', instanceId: unit.instanceId, col: unit.position.col, row: unit.position.row });
        }
      }
    }

    // 7. Recalculate auras — reset to base stats, apply all sources
    const auraEvent = this.auras.evaluateAuras(this.board, this.mods);
    if (auraEvent.changes.length > 0) this.emit(auraEvent);

    // 8. Recalculate modifiers (LEG rate bonus, Royal discount)
    this.auras.recalculateModifiers(this.board, this.mods);

    this.advancePhase(TurnPhase.PLAY);
  }

  private runEndPhase(): void {
    this.advancePhase(TurnPhase.END);
    const ap = this.activePlayer;
    const mod = this.mods[ap];

    // 1. Tick timed effects (duration --)
    mod.tickEffects();

    // 2. Clear War Horn movement buff (expired above naturally)

    // 3. Resolve Treason returns
    for (const unit of this.board.getAllUnits()) {
      if (unit.treasonOwner !== null && unit.treasonOwner !== unit.owner) {
        // Return to original owner and position
        const origPos = unit.originalPos ?? unit.position;
        this.board.moveUnit(unit.instanceId, origPos.col, origPos.row);
        unit.owner = unit.treasonOwner;
        unit.treasonOwner = null;
        unit.originalPos = null;
        unit.isExhausted = true;
        this.emit({ type: 'UNIT_EXHAUSTED', instanceId: unit.instanceId, col: unit.position.col, row: unit.position.row });
      }
    }

    // 4. Trim hand overflow (Motherland)
    const overflow = this.players[ap].trimOverflowHand();
    for (const cardId of overflow) {
      this.emit({ type: 'CARD_DISCARDED', player: ap, cardId, handIndex: -1 });
    }

    // 5. Clear LEG overflow flag
    mod.clearOverflow();

    // 6. Check win condition
    if (this.checkWinCondition()) return;

    // 7. Emit TURN_ENDED and swap player
    this.emit({ type: 'TURN_ENDED', turn: this.turnNumber, activePlayer: ap });

    // Increment turn counter only after P2's turn
    if (ap === Player.P2) this.turnNumber++;

    // Swap active player and start next turn
    this.activePlayer = opponent(ap);
    this.startTurn();
  }

  // ─────────────────────────────────────────────
  // COMBAT EXECUTION
  // ─────────────────────────────────────────────

  private executeAttack(attacker: Unit, defender: Unit): void {
    const events = resolveAttack(attacker, defender, this.board);
    attacker.hasActed = true;

    // Apply the attack events (damage, death)
    for (const event of events) {
      this.emit(event);

      if (event.type === 'UNIT_ATTACKED') {
        // Apply HP change
        const target = this.board.getUnitById(event.targetInstanceId);
        if (target) {
          this.board.updateUnitStats(target.instanceId, { currentDef: event.targetNewHP });
          // King HP update
          if (event.isKingHit) {
            this.board.updateUnitStats(target.instanceId, { currentDef: event.targetNewHP });
          }
        }
      }

      if (event.type === 'UNIT_DIED') {
        this.handleUnitDeath(event.instanceId, event.cardId, event.owner, event.cause);
      }
    }

    // On-kill ability: Inquisitor LEG drain
    const killedTarget = events.find(e => e.type === 'UNIT_DIED');
    if (killedTarget && killedTarget.type === 'UNIT_DIED') {
      const killEvents = resolveOnKill(attacker, killedTarget.cardId, this.board, this.players, this.mods);
      this.applyEvents(killEvents);
    }

    // King death = game over
    if (defender.cardId === 'king' && defender.currentDef <= 0) {
      this.triggerGameOver(attacker.owner, 'KING_DESTROYED');
    }
  }

  private handleUnitDeath(instanceId: string, cardId: string, owner: Player, cause: string): void {
    const unit = this.board.getUnitById(instanceId);
    if (!unit) return;

    // Record in graveyard
    this.graveyard.set(instanceId, cardId);
    this.players[owner].addToGraveyard(instanceId);

    // Remove from board
    this.board.removeUnit(instanceId);

    // Card goes to discard
    this.players[owner].discard.push(cardId);

    // On-death abilities
    const deathResult = resolveOnDeath(unit, cause, this.board, this.players, this.mods);
    this.applyEvents(deathResult.events);
    if (deathResult.pending) {
      this.pending = deathResult.pending;
      this.status  = EngineStatus.AWAITING_INPUT;
    }

    // Recalculate modifiers (unit removed may change discounts)
    this.auras.recalculateModifiers(this.board, this.mods);
  }

  // ─────────────────────────────────────────────
  // EVENT APPLICATION
  // Applies events to game state, then emits them.
  // ─────────────────────────────────────────────

  private applyEvents(events: GameEvent[]): void {
    for (const event of events) {
      this.applyEvent(event);
      this.emit(event);
    }
  }

  private applyEvent(event: GameEvent): void {
    switch (event.type) {

      case 'UNIT_PLACED': {
        // Unit already placed before resolveOnDeploy — this handles spell-spawned units
        const exists = this.board.getUnitById(event.instanceId);
        if (!exists) {
          const newUnit = this.createUnit(event.cardId, event.owner, { col: event.col, row: event.row });
          newUnit.isActive = event.isActive;
          this.board.placeUnit(newUnit);
        }
        break;
      }

      case 'UNIT_DIED': {
        // Only remove if not already removed (handleUnitDeath may have done it)
        const u = this.board.getUnitById(event.instanceId);
        if (u) this.handleUnitDeath(event.instanceId, event.cardId, event.owner, event.cause);
        break;
      }

      case 'UNIT_ATTACKED': {
        const target = this.board.getUnitById(event.targetInstanceId);
        if (target) {
          this.board.updateUnitStats(target.instanceId, { currentDef: event.targetNewHP });
        }
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
        // Reform: replace the unit object with new card data
        const old = this.board.getUnitById(event.oldInstanceId);
        if (!old) break;
        const newDef = getCard(event.toCardId);
        const newStats = newDef.stats!;
        this.board.updateUnitStats(event.oldInstanceId, {
          cardId:          event.toCardId,
          instanceId:      event.newInstanceId,
          baseAtk:         newStats.atk,
          baseDef:         newStats.def,
          currentAtk:      newStats.atk,
          currentDef:      event.newHP,
          maxDef:          event.newMaxHP,
          baseMovement:    this.movementToNumber(newStats.movement),
          currentMovement: this.movementToNumber(newStats.movement),
          baseMovementType: newStats.movement,
          baseAtkPattern:   newStats.attackPattern,
        });
        break;
      }

      case 'CARD_DRAWN': {
        if (event.cardId === '__DRAW_OVERFLOW__') {
          // Motherland overflow draw — actually execute the draw
          const ps = this.players[event.player];
          const drawn = ps.drawCardsOverflow(1);
          if (drawn.length > 0) {
            // Re-emit with real card data
            this.emit({
              type: 'CARD_DRAWN',
              player: event.player,
              cardId: drawn[0],
              handIndex: ps.hand.length - 1,
              deckRemaining: ps.deck.length,
            });
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

      case 'LEG_GAINED': {
        // Already applied in runLEGPhase — skip double-apply
        break;
      }

      case 'LEG_SPENT': {
        // Already applied at playCard call site
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

      // Events that are purely informational (Phaser handles visuals)
      case 'UNIT_MOVED':
      case 'UNIT_EXHAUSTED':
      case 'UNIT_REFRESHED':
      case 'UNIT_ACTIVATED':
      case 'AURA_APPLIED':
      case 'CARD_PLAYED':
      case 'CARD_DISCARDED':
      case 'PHASE_CHANGED':
      case 'TURN_STARTED':
      case 'TURN_ENDED':
      case 'PENDING_TARGET':
      case 'PENDING_POSITION':
      case 'PENDING_COLUMN':
      case 'PENDING_DISCARD':
      case 'INTERACTION_RESOLVED':
      case 'KING_THREATENED':
      case 'GAME_OVER':
      case 'DECK_SHUFFLED':
      case 'SCOUT_RESULT':
      case 'STRUCTURE_SPAWNED':
        break;

      default:
        break;
    }
  }

  // ─────────────────────────────────────────────
  // WIN CONDITION
  // ─────────────────────────────────────────────

  private checkWinCondition(): boolean {
    for (const p of [Player.P1, Player.P2]) {
      const king = this.board.getKing(p);
      if (!king || king.currentDef <= 0) {
        this.triggerGameOver(opponent(p), 'KING_DESTROYED');
        return true;
      }
    }

    // Check King threat (optional warning event)
    for (const p of [Player.P1, Player.P2]) {
      const king = this.board.getKing(p);
      if (!king) continue;
      const threats = this.board.getUnitsOf(opponent(p)).filter(u => {
        const attacks = getValidAttacks(u, this.board);
        return attacks.some(pos => pos.col === king.position.col && pos.row === king.position.row);
      });
      if (threats.length > 0) {
        this.emit({
          type: 'KING_THREATENED',
          kingInstanceId: king.instanceId,
          kingPlayer: p,
          attackerInstanceIds: threats.map(u => u.instanceId),
        });
      }
    }

    return false;
  }

  private triggerGameOver(winner: Player, reason: 'KING_DESTROYED' | 'SURRENDER' | 'TIMEOUT' | 'DISCONNECT'): void {
    this.status = EngineStatus.GAME_OVER;
    this.emit({
      type: 'GAME_OVER',
      result: {
        winner,
        loser: opponent(winner),
        reason,
        turns: this.turnNumber,
      },
    });
  }

  // ─────────────────────────────────────────────
  // DISEASE TICKS
  // ─────────────────────────────────────────────

  private tickDiseaseEffects(activePlayer: Player): void {
    const mod = this.mods[activePlayer];
    const diseaseEffects = mod.timedEffects.filter(e => e.type === 'DISEASE_TICK');

    for (const effect of diseaseEffects) {
      if (!effect.targetInstanceId) continue;
      const target = this.board.getUnitById(effect.targetInstanceId);
      if (!target) continue;

      const dmg = effect.value ?? 2;
      const dmgEvents = applyDamage(target, dmg, 'DISEASE');
      this.applyEvents(dmgEvents);

      // Disease adjacency damage: 1 damage to adjacent units
      const adj = this.board.getAdjacentUnits(target.position.col, target.position.row);
      for (const adjUnit of adj) {
        const adjEvents = applyDamage(adjUnit, 1, 'DISEASE');
        this.applyEvents(adjEvents);
      }
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private advancePhase(phase: TurnPhase): void {
    this.phase = phase;
    this.emit({ type: 'PHASE_CHANGED', phase, activePlayer: this.activePlayer, turn: this.turnNumber });
  }

  private clearPending(): void {
    this.pending = null;
    this.status  = EngineStatus.IDLE;
    this.emit({ type: 'INTERACTION_RESOLVED' });
  }

  private prePlaceKing(player: Player): void {
    const row = player === Player.P1 ? 0 : this.board.rows - 1;
    const col = Math.floor(this.board.cols / 2) - 1; // e.g. col 2 on 6-wide board
    const unit = this.createUnit('king', player, { col, row });
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

  private createUnit(cardId: string, owner: Player, position: Position): Unit {
    this.instanceCounter++;
    const def = getCard(cardId);
    const stats = def.stats!;
    const movNum = this.movementToNumber(stats.movement);

    return {
      instanceId:      `${cardId}_${this.instanceCounter}`,
      cardId,
      owner,
      position:        { ...position },
      baseAtk:         stats.atk,
      baseDef:         stats.def,
      baseMovement:    movNum,
      baseAtkPattern:  stats.attackPattern,
      baseMovementType: stats.movement,
      currentAtk:      stats.atk,
      currentDef:      stats.def,
      maxDef:          stats.def,
      currentMovement: movNum,
      hasMoved:        false,
      hasActed:        false,
      isActive:        true,
      isExhausted:     false,
      treasonOwner:    null,
      originalPos:     null,
      spawnCounter:    0,
    };
  }

  /** Convert MovementType enum to numeric distance for currentMovement. */
  private movementToNumber(movement: any): number {
    switch (movement) {
      case 'OMNI_1':          return 1;
      case 'OMNI_2':          return 2;
      case 'OMNI_3':          return 3;
      case 'VERTICAL_2':      return 2;
      case 'JUMP_DIAGONAL_1': return 1;
      case 'FWD_VERTICAL_1':  return 1;
      case 'STATIC':          return 0;
      default:                return 1;
    }
  }
}

// ─────────────────────────────────────────────
// MODULE HELPER
// ─────────────────────────────────────────────

function opponent(player: Player): Player {
  return player === Player.P1 ? Player.P2 : Player.P1;
}
