// ============================================================
// PendingCommandResolver.ts — Command resolution
//
// When the player makes a selection (target, position, column,
// or discard), this resolver produces the GameEvent[] to apply.
// ============================================================

import type { PendingCommand } from './PendingCommand';
import type { GameEvent } from '../types/EventTypes';
import type { IBoard } from '../interfaces/IBoard';
import { AbilityType } from '../types/AbilityTypes';

export type PendingSelection =
  | { kind: 'TARGET'; instanceId: string }
  | { kind: 'POSITION'; col: number; row: number }
  | { kind: 'COLUMN'; col: number }
  | { kind: 'DISCARD'; handIndex: number };

/** Optional context for resolving commands that need board state. */
export interface ResolveContext {
  board: IBoard;
}

/**
 * Resolve a pending command with the player's selection.
 * Returns events to apply to game state after resolution.
 */
export function resolvePending(
  command: PendingCommand,
  selection: PendingSelection,
  ctx?: ResolveContext,
): GameEvent[] {
  const events: GameEvent[] = [];

  // ── TARGET resolution ─────────────────────────────────────
  if (command.kind === 'TARGET' && selection.kind === 'TARGET') {
    resolveTarget(command, selection.instanceId, ctx, events);
  }

  // ── POSITION summon — place a unit at the selected position
  if (command.kind === 'POSITION' && selection.kind === 'POSITION') {
    events.push({
      type: 'UNIT_PLACED',
      instanceId: `${command.sourceCardId}_pending_${Date.now()}`,
      cardId: command.sourceCardId,
      owner: command.owner,
      col: selection.col,
      row: selection.row,
      isActive: true,
    } as GameEvent);
  }

  // Append deferred events (e.g., Mystic LEG drain)
  events.push(...command.deferredEvents);
  return events;
}

// ─────────────────────────────────────────────────────────────
// TARGET ability resolution
// ─────────────────────────────────────────────────────────────

function resolveTarget(
  cmd: PendingCommand & { kind: 'TARGET' },
  targetId: string,
  ctx: ResolveContext | undefined,
  events: GameEvent[],
): void {
  const ability = cmd.sourceAbility;

  // ── Priest: full heal ──────────────────────────────────────
  if (ability === AbilityType.ON_DEPLOY_HEAL_FRIENDLY) {
    if (!ctx?.board) return;
    const unit = ctx.board.getUnitById(targetId);
    if (!unit) return;
    const healAmount = unit.maxDef - unit.currentDef;
    if (healAmount <= 0) return; // already full HP
    events.push({
      type: 'UNIT_HEALED',
      instanceId: unit.instanceId,
      cardId: unit.cardId,
      col: unit.position.col,
      row: unit.position.row,
      amount: healAmount,
      newHP: unit.maxDef,
      maxHP: unit.maxDef,
      player: unit.owner,
      isKing: unit.cardId === 'king',
    } as GameEvent);
    return;
  }

  // ── Disease: damage structure + adjacent ────────────────────
  if (ability === AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ) {
    if (!ctx?.board) return;
    const structure = ctx.board.getUnitById(targetId);
    if (!structure) return;
    // Apply Disease timed effect — the actual damage ticks happen in EndPhase
    // For now, emit a structure-targeted event the engine can track
    events.push({
      type: 'UNIT_ATTACKED',
      attackerInstanceId: '',
      targetInstanceId: structure.instanceId,
      attackerCol: structure.position.col,
      attackerRow: structure.position.row,
      targetCol: structure.position.col,
      targetRow: structure.position.row,
      damage: 1,
      targetNewHP: Math.max(0, structure.currentDef - 1),
      targetPlayer: structure.owner,
      isKingHit: false,
      maxHP: structure.maxDef,
    } as GameEvent);
    // If structure dies from this
    if (structure.currentDef - 1 <= 0) {
      events.push({
        type: 'UNIT_DIED',
        instanceId: structure.instanceId,
        cardId: structure.cardId,
        owner: structure.owner,
        col: structure.position.col,
        row: structure.position.row,
        cause: 'DISEASE',
      } as GameEvent);
    }
    return;
  }

  // ── Coup: banish target royal, spawn foot soldiers ──────────
  if (ability === 'coupHandler') {
    if (!ctx?.board) return;
    const target = ctx.board.getUnitById(targetId);
    if (!target) return;
    events.push({
      type: 'UNIT_DIED',
      instanceId: target.instanceId,
      cardId: target.cardId,
      owner: target.owner,
      col: target.position.col,
      row: target.position.row,
      cause: 'COUP_BANISH',
    } as GameEvent);
    return;
  }

  // ── Treason: steal enemy unit for this turn ─────────────────
  if (ability === 'treasonHandler') {
    if (!ctx?.board) return;
    const target = ctx.board.getUnitById(targetId);
    if (!target) return;
    // Emit a transform event that flips ownership
    events.push({
      type: 'UNIT_TRANSFORMED',
      oldInstanceId: target.instanceId,
      newInstanceId: target.instanceId,
      toCardId: target.cardId,
      owner: cmd.owner,
      col: target.position.col,
      row: target.position.row,
      newHP: target.currentDef,
      newMaxHP: target.maxDef,
    } as GameEvent);
    return;
  }

  // ── Mystic / Revive: revive from graveyard (→ needs POSITION next) ──
  // For revive, the target is a graveyard card ID, not a board unit.
  // The actual placement will be a follow-up POSITION pending.
  // For now, just let deferredEvents handle it.
  if (ability === AbilityType.ON_DEPLOY_REVIVE || ability === 'mysticDeployHandler') {
    // The graveyard target will need a POSITION command next.
    // This is handled by the engine after these events apply.
    return;
  }
}
