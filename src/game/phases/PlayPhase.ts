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
import type { Unit } from '../types/GameTypes';
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

    const hasBuildDelay = def.flags.includes(CardFlag.BUILD_DELAY);
    unitInstance = ctx.createUnit(cardId, ctx.activePlayer, { col, row });
    unitInstance.isActive = !hasBuildDelay;

    if (hasBuildDelay) {
      mod.addTimedEffect({
        type: 'BUILD_DELAY',
        duration: 1,
        targetInstanceId: unitInstance.instanceId,
      });
    }

    ctx.board.placeUnit(unitInstance);
    ctx.emit({
      type: 'UNIT_PLACED',
      instanceId: unitInstance.instanceId,
      cardId,
      owner: ctx.activePlayer,
      col, row,
      isActive: unitInstance.isActive,
    });
  }

  // ── Resolve on-deploy abilities ────────────────────────
  const pos = (col !== undefined && row !== undefined) ? { col, row } : undefined;
  const result = resolveOnDeploy(
    cardId, ctx.activePlayer, pos,
    ctx.board, ctx.players, ctx.mods,
    unitInstance,
  );

  // Apply immediate events
  ctx.applyEvents(result.events);

  // Recalculate auras + modifiers (new unit may change discounts/rate/stat auras)
  // Always emit — even with empty changes — so the UI can sync ALL unit stats.
  const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  ctx.emit(auraEvent);

  // Handle pending interaction (Priest, Mystic, Disease, etc.)
  if (result.pending) {
    ctx.status = EngineStatus.AWAITING_INPUT;
    ctx.pending = result.pending;
    ctx.emit({
      type: result.pending.kind === 'TARGET'   ? 'PENDING_TARGET'   :
            result.pending.kind === 'POSITION' ? 'PENDING_POSITION' :
            result.pending.kind === 'COLUMN'   ? 'PENDING_COLUMN'   :
                                                  'PENDING_DISCARD',
      reason: result.pending.reason,
      sourceCardId:    result.pending.sourceCardId,
      sourceAbility:   result.pending.sourceAbility,
      validTargetIds:  result.pending.kind === 'TARGET' ? result.pending.validTargetIds : [],
      validPositions:  result.pending.kind === 'POSITION' ? result.pending.validPositions : [],
      count: result.pending.kind === 'DISCARD' ? result.pending.count : 1,
    } as any);
  }

  // Spells go to discard after play
  if (def.class === CardClass.SPELL) {
    ps.discard.push(cardId);
  }

  return true;
}
