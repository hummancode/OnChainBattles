// ============================================================
// phases/ActPhase.ts
// ACT phase: unit movement and attack execution.
//
// Responsibilities:
//   - Move validation (via UnitQuery + MovementRules)
//   - Attack validation (via UnitQuery + MovementRules)
//   - Combat execution (delegates to CombatResolver)
//   - Counter-attack handling (melee defenders retaliate)
//   - On-kill ability resolution (both sides — attacker or defender can die)
//   - Assassin jump-attack (move onto enemy = auto-attack, immune to counter)
//   - Lancer charge (move + attack same turn)
//   - Death handling (graveyard, on-death abilities, aura recalc)
//   - King death → game over (checked for both sides after counter-attack)
//
// PATCH v0.3:
//   - executeCombat now uses resolveAttackWithCounter
//   - Assassin jump passes isAssassinJump=true (immune to counter)
//   - On-kill checked for BOTH attacker→defender AND defender→attacker
//   - King death checked for BOTH sides (counter can kill attacking king)
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { opponent } from '../GameContext';
import type { Unit } from '../types/GameTypes';
import { Player, EngineStatus } from '../types/GameTypes';
import { AtkPattern } from '../types/CardTypes';
import { getCard } from '../data/CardDefinitions';
import { canUnitMove, canUnitAttack } from '../UnitQuery';
import { isMoveValid, isAttackValid, isLancerForwardMove } from '../MovementRules';
import { resolveAttackWithCounter } from '../CombatResolver';
import { resolveOnDeath, resolveOnKill } from '../abilities/AbilityDispatcher';

// ─────────────────────────────────────────────
// MOVE
// ─────────────────────────────────────────────

/**
 * Attempt to move a unit to a new position.
 * Returns true if move was executed.
 */
export function executeMove(ctx: GameContext, unitId: string, col: number, row: number): boolean {
  const unit = ctx.board.getUnitById(unitId);
  if (!unit || unit.owner !== ctx.activePlayer) return false;

  // Capability check (alive, active, not stunned, hasn't acted, etc.)
  if (!canUnitMove(unit)) return false;

  // Pattern check (is this square reachable?)
  if (!isMoveValid(unit, col, row, ctx.board)) return false;

  // Lancer charge: movement must be forward
  const def = getCard(unit.cardId);
  if (unit.canAttackAfterMove && !isLancerForwardMove(unit, row)) {
    // If it's a charge unit, movement must be toward enemy
    // Non-charge units don't reach here (canAttackAfterMove is false)
  }

  const from = { ...unit.position };
  ctx.board.moveUnit(unitId, col, row);
  unit.hasMoved = true;

  // Non-charge units: moving ends their turn
  if (!unit.canAttackAfterMove) {
    unit.hasActed = true;
  }

  ctx.emit({
    type: 'UNIT_MOVED',
    instanceId: unitId,
    cardId: unit.cardId,
    owner: unit.owner,
    from,
    to: { col, row },
  });

  // Assassin: jump onto enemy = auto-attack on landing (immune to counter-attack)
  if (unit.baseAtkPattern === AtkPattern.ON_JUMP) {
    const defender = ctx.board.getUnit(col, row);
    if (defender && defender.owner !== unit.owner) {
      executeCombat(ctx, unit, defender, true);  // isAssassinJump = true
    }
  }

  return true;
}

// ─────────────────────────────────────────────
// ATTACK
// ─────────────────────────────────────────────

/**
 * Attempt to attack a target unit.
 * Returns true if attack was executed.
 */
export function executeAttack(ctx: GameContext, unitId: string, targetId: string): boolean {
  const unit   = ctx.board.getUnitById(unitId);
  const target = ctx.board.getUnitById(targetId);
  if (!unit || !target) return false;
  if (unit.owner !== ctx.activePlayer) return false;
  if (target.owner === ctx.activePlayer) return false;

  // Capability check
  if (!canUnitAttack(unit)) return false;

  // Pattern check (is the target in attack range?)
  if (!isAttackValid(unit, target.position.col, target.position.row, ctx.board)) return false;

  executeCombat(ctx, unit, target, false);
  return true;
}

// ─────────────────────────────────────────────
// COMBAT EXECUTION (shared by attack + assassin jump)
// Handles: damage, counter-attack, death, on-kill, game over
// ─────────────────────────────────────────────

function executeCombat(ctx: GameContext, attacker: Unit, defender: Unit, isAssassinJump: boolean = false): void {
  // Resolve primary attack + possible counter-attack
  const events = resolveAttackWithCounter(attacker, defender, ctx.board, isAssassinJump);
  attacker.hasActed = true;

  // Apply all events (primary attack + counter-attack + deaths)
  for (const event of events) {
    ctx.emit(event);

    if (event.type === 'UNIT_ATTACKED') {
      const target = ctx.board.getUnitById(event.targetInstanceId);
      if (target) {
        ctx.board.updateUnitStats(target.instanceId, { currentDef: event.targetNewHP });
      }
    }

    if (event.type === 'UNIT_DIED') {
      handleUnitDeath(ctx, event.instanceId, event.cardId, event.owner, event.cause);
    }
  }

  // On-kill abilities — check if attacker killed defender
  const killedDefender = events.find(
    e => e.type === 'UNIT_DIED' && (e as any).instanceId === defender.instanceId
  );
  if (killedDefender) {
    const killResult = resolveOnKill(attacker, defender, ctx.board, ctx.players, ctx.mods);
    ctx.applyEvents(killResult.events);
  }

  // On-kill abilities — check if defender killed attacker via counter-attack
  const killedAttacker = events.find(
    e => e.type === 'UNIT_DIED' && (e as any).instanceId === attacker.instanceId
  );
  if (killedAttacker) {
    const counterKillResult = resolveOnKill(defender, attacker, ctx.board, ctx.players, ctx.mods);
    ctx.applyEvents(counterKillResult.events);
  }

  // King death = game over — must check BOTH sides (counter can kill attacking king)
  checkKingDeath(ctx, defender, attacker, events);
  checkKingDeath(ctx, attacker, defender, events);
}

/**
 * Check if a specific unit (expected king) died in the event stream.
 * If so, trigger game over with the opponent as winner.
 */
function checkKingDeath(ctx: GameContext, unit: Unit, killer: Unit, events: any[]): void {
  if (unit.cardId !== 'king') return;
  if (ctx.status === EngineStatus.GAME_OVER) return; // Already triggered

  // Find the last UNIT_ATTACKED event targeting this king
  const attacksOnKing = events.filter(
    e => e.type === 'UNIT_ATTACKED' && e.targetInstanceId === unit.instanceId
  );
  if (attacksOnKing.length === 0) return;

  const lastHP = attacksOnKing[attacksOnKing.length - 1].targetNewHP;
  if (lastHP <= 0) {
    triggerGameOver(ctx, killer.owner, 'KING_DESTROYED');
  }
}

// ─────────────────────────────────────────────
// DEATH HANDLING
// ─────────────────────────────────────────────

function handleUnitDeath(
  ctx: GameContext,
  instanceId: string,
  cardId: string,
  owner: Player,
  cause: string,
): void {
  const unit = ctx.board.getUnitById(instanceId);
  if (!unit) return;

  // Record in graveyard
  ctx.graveyard.set(instanceId, cardId);
  ctx.players[owner].addToGraveyard(instanceId);

  // Remove from board
  ctx.board.removeUnit(instanceId);

  // Card goes to discard
  ctx.players[owner].discard.push(cardId);

  // On-death abilities (e.g., Foot Soldier draw)
  const deathResult = resolveOnDeath(unit, cause, ctx.board, ctx.players, ctx.mods);
  ctx.applyEvents(deathResult.events);

  if (deathResult.pending) {
    (ctx as any)._lastPending = deathResult.pending;
    ctx.status = EngineStatus.AWAITING_INPUT;
  }

  // Recalculate modifiers (removed unit may change discounts)
  ctx.auras.recalculateModifiers(ctx.board, ctx.mods);
}

// ─────────────────────────────────────────────
// GAME OVER
// ─────────────────────────────────────────────

function triggerGameOver(
  ctx: GameContext,
  winner: Player,
  reason: 'KING_DESTROYED' | 'SURRENDER' | 'TIMEOUT' | 'DISCONNECT',
): void {
  ctx.status = EngineStatus.GAME_OVER;
  ctx.emit({
    type: 'GAME_OVER',
    result: {
      winner,
      loser: opponent(winner),
      reason,
      turns: ctx.turnNumber,
    },
  });
}
