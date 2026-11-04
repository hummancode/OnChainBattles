// ============================================================
// phases/PlayPhase.ts
// PLAY phase: validate and execute card plays from hand.
//
// Responsibilities:
//   - Afford check (LEG cost with Royal discount)
//   - Deploy position validation
//   - Unit/Structure placement on board
//   - Spell execution
//   - On-deploy ability resolution
//   - BUILD_DELAY timer setup
//   - Pending interaction setup (Priest heal target, etc.)
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import type { Unit, Position, Player } from '../types/GameTypes';
import type { PendingCommand } from '../pending/PendingCommand';
import { Allegiance, CardClass, CardFlag } from '../types/CardTypes';
import { getCard } from '../data/CardRegistry';
import { getValidDeploySquares } from '../MovementRules';
import { resolveOnDeploy } from '../abilities/AbilityDispatcher';
import { EngineStatus } from '../types/GameTypes';

/**
 * Attempt to play a card from the active player's hand.
 * Returns true if the card was successfully played.
 */
export function executePlayCard(
  ctx: GameContext,
  handIndex: number,
  col?: number,
  row?: number,
): boolean {
  const ps  = ctx.players[ctx.activePlayer];
  const mod = ctx.mods[ctx.activePlayer];
  const cardId = ps.hand[handIndex];
  if (!cardId) return false;

  const def = getCard(cardId);
  const isRoyal = def.allegiance === Allegiance.ROYAL;
  const cost = mod.getEffectiveCardCost(def.cost, isRoyal);

  // Afford check
  if (!mod.spendLEG(cost)) return false;

  // Remove from hand
  ps.playFromHand(handIndex);
  ctx.emit({ type: 'CARD_PLAYED', player: ctx.activePlayer, cardId, handIndex, legCost: cost });
  ctx.emit({ type: 'LEG_SPENT', player: ctx.activePlayer, amount: cost, remaining: mod.legPool, rate: mod.getEffectiveLEGRate() });

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
    const freeSquares = getValidDeploySquares(ctx.activePlayer, ctx.board);
    const isValidDeploy = freeSquares.some(p => p.col === col && p.row === row);
    if (!isValidDeploy) {
      mod.addLEG(cost);
      ps.hand.splice(handIndex, 0, cardId);
      return false;
    }

    unitInstance = placeCardUnit(ctx, cardId, ctx.activePlayer, col, row);
  }

  // ── Resolve on-deploy abilities ────────────────────────
  const pos = (col !== undefined && row !== undefined) ? { col, row } : undefined;
  const result = resolveOnDeploy(
    cardId, ctx.activePlayer, pos,
    ctx.board, ctx.players, ctx.mods,
    unitInstance,
  );

  // Targeted spell with nothing to target → refuse the play, give everything back.
  if (def.class === CardClass.SPELL && result.noValidTarget && !result.pending && result.events.length === 0) {
    // Back to its ORIGINAL slot: a refused action isn't logged or relayed, so it must leave
    // the engine exactly as it was (appending reordered the hand → later handIndex desyncs).
    returnSpellToHand(ctx, cardId, cost, 'NO_TARGET', handIndex);
    return false;
  }

  // Apply immediate events
  ctx.applyEvents(result.events);

  // Recalculate auras + modifiers (new unit may change discounts/rate/stat auras)
  // Always emit — even with empty changes — so the UI can sync ALL unit stats.
  const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  ctx.emit(auraEvent);

  // Handle pending interaction (Priest, Mystic, Disease, etc.)
  if (result.pending) {
    // Spells are refundable if their target choice is cancelled — but only when nothing has
    // happened yet (Casus Belli applies its LEG-rate drain first; refunding that would make
    // the drain free). Units just fizzle.
    setPendingPrompt(ctx, def.class === CardClass.SPELL && result.events.length === 0
      ? { ...result.pending, refund: { cardId, legCost: cost } }
      : result.pending);
  }

  // Spells go to discard after play
  if (def.class === CardClass.SPELL) {
    ps.discard.push(cardId);
  }

  return true;
}

/**
 * Create a unit/structure for `cardId` and put it on the board (BUILD_DELAY timer, SWIFT),
 * emitting UNIT_PLACED. Shared by a normal deploy and Casus Belli's forward deploy.
 */
export function placeCardUnit(ctx: GameContext, cardId: string, owner: Player, col: number, row: number): Unit {
  const def = getCard(cardId);
  const hasBuildDelay = def.flags.includes(CardFlag.BUILD_DELAY);
  const unit = ctx.createUnit(cardId, owner, { col, row });
  unit.isActive = !hasBuildDelay;

  if (hasBuildDelay) {
    ctx.mods[owner].addTimedEffect({
      type: 'BUILD_DELAY',
      duration: 2,
      targetInstanceId: unit.instanceId,
    });
  }

  // SWIFT units can act the turn they're deployed
  if (def.flags.includes(CardFlag.SWIFT)) {
    unit.isJustPlaced = false;
  }

  ctx.board.placeUnit(unit);
  ctx.emit({
    type: 'UNIT_PLACED',
    instanceId: unit.instanceId,
    cardId,
    owner,
    col, row,
    isActive: unit.isActive,
  });
  return unit;
}

/**
 * Casus Belli: deploy `cardId` (already taken out of hand) for free on `pos`, then run its
 * On Deploy abilities exactly like a normal deploy (events, aura pass, pending prompt).
 */
export function deployUnitWithAbilities(ctx: GameContext, cardId: string, owner: Player, pos: Position): void {
  const unit = placeCardUnit(ctx, cardId, owner, pos.col, pos.row);
  const result = resolveOnDeploy(cardId, owner, pos, ctx.board, ctx.players, ctx.mods, unit);
  ctx.applyEvents(result.events);
  ctx.emit(ctx.auras.evaluateAuras(ctx.board, ctx.mods));
  if (result.pending && ctx.status !== EngineStatus.GAME_OVER) setPendingPrompt(ctx, result.pending);
}

/** Park the engine on a pending interaction and tell the UI which prompt to show. */
function setPendingPrompt(ctx: GameContext, pending: PendingCommand): void {
  ctx.status = EngineStatus.AWAITING_INPUT;
  ctx.pending = pending;
  ctx.emit({
    type: pending.kind === 'TARGET'   ? 'PENDING_TARGET'   :
          pending.kind === 'POSITION' ? 'PENDING_POSITION' :
          pending.kind === 'COLUMN'   ? 'PENDING_COLUMN'   :
                                        'PENDING_DISCARD',
    reason: pending.reason,
    sourceCardId:    pending.sourceCardId,
    sourceAbility:   pending.sourceAbility,
    validTargetIds:  pending.kind === 'TARGET' ? pending.validTargetIds : [],
    validPositions:  pending.kind === 'POSITION' ? pending.validPositions : [],
    count: pending.kind === 'DISCARD' ? pending.count : 1,
  } as any);
}

/**
 * Undo a spell play: card back into hand (appended — hand UIs append too, keeping indices
 * in sync), LEG refunded. Used when it had no target, and when its target choice is cancelled.
 * Note: the spell is NOT in the discard pile yet when called from executePlayCard; when
 * called after a cancel it is, and the caller removes it first.
 */
export function returnSpellToHand(
  ctx: Pick<GameContext, 'players' | 'mods' | 'emit'> & { activePlayer: GameContext['activePlayer'] },
  cardId: string, legCost: number, reason: 'NO_TARGET' | 'CANCELLED',
  atIndex?: number,
): void {
  const p = ctx.activePlayer;
  const ps = ctx.players[p];
  const mod = ctx.mods[p];
  const idx = atIndex != null && atIndex >= 0 && atIndex <= ps.hand.length ? atIndex : ps.hand.length;
  ps.hand.splice(idx, 0, cardId);
  mod.addLEG(legCost);
  ctx.emit({ type: 'CARD_RETURNED', player: p, cardId, handIndex: idx, refundedLEG: legCost, reason });
  ctx.emit({ type: 'LEG_GAINED', player: p, amount: legCost, total: mod.legPool, rate: mod.getEffectiveLEGRate() });
}
