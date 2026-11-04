import { getCard } from '../data/CardRegistry';
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
import { applyEarthquakeDamage } from '../CombatResolver';

export type PendingSelection =
  | { kind: 'TARGET'; instanceId: string }
  | { kind: 'POSITION'; col: number; row: number }
  | { kind: 'COLUMN'; col: number }
  | { kind: 'DISCARD'; handIndex: number };

/** Optional context for resolving commands that need board state. */
export interface ResolveContext {
  board: IBoard;
  /** Needed by Coup (caster's remaining LEG decides capture vs banish). */
  mods?: readonly [{ legPool: number }, { legPool: number }];
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
      // '' = engine assigns a deterministic id from its unit counter (Date.now() here
      // made every client and the server create different ids → hash mismatches).
      instanceId: '',
      cardId: command.sourceCardId,
      owner: command.owner,
      col: selection.col,
      row: selection.row,
      isActive: true,
      fromDeck: command.sourceAbility === 'militiaDeployHandler',
      fromGraveyard: command.sourceAbility === 'mysticDeployHandler',
    } as GameEvent);
  }

  // ── COLUMN resolution ────────────────────────────────────
  if (command.kind === 'COLUMN' && selection.kind === 'COLUMN') {
    if (command.sourceAbility === AbilityType.SPELL_EARTHQUAKE && ctx?.board) {
      events.push(...applyEarthquakeDamage(selection.col, 3, ctx.board as any));
    }
  }

  // ── DISCARD resolution ──────────────────────────────────
  if (command.kind === 'DISCARD' && selection.kind === 'DISCARD') {
    // The actual discard is handled by GameEngine.selectDiscard()
    // which calls PlayerState.discardFromHand() after resolution.
    // We just need to signal success so deferred events fire.
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

  // ── Disease: apply recurring damage timed effect ────────────
  if (ability === AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ) {
    if (!ctx?.board) return;
    const structure = ctx.board.getUnitById(targetId);
    if (!structure) return;
    // Create DISEASE_APPLIED event — engine will add DISEASE_TICK timed effect.
    // Actual damage ticks happen each LEG phase via runDiseaseTicks().
    events.push({
      type: 'DISEASE_APPLIED',
      caster: cmd.owner,
      targetInstanceId: structure.instanceId,
      damage:   diseaseParams(cmd.sourceCardId).damage,
      duration: diseaseParams(cmd.sourceCardId).duration,
    } as GameEvent);
    return;
  }

  // ── Coup: capture if caster's remaining LEG ≥ target's base cost, else banish ──
  if (ability === 'coupHandler') {
    if (!ctx?.board) return;
    const target = ctx.board.getUnitById(targetId);
    if (!target) return;
    const remaining = ctx.mods?.[cmd.owner]?.legPool ?? 0;
    const base = { col: target.position.col, row: target.position.row, instanceId: target.instanceId, cardId: target.cardId };
    if (remaining >= getCard(target.cardId).cost) {
      events.push({ type: 'UNIT_CAPTURED', ...base, from: target.owner, to: cmd.owner, permanent: true });
    } else {
      events.push({ type: 'UNIT_BANISHED', ...base, owner: target.owner });
    }
    return;
  }

  // ── Treason: steal enemy unit for this turn ─────────────────
  if (ability === 'treasonHandler') {
    if (!ctx?.board) return;
    const target = ctx.board.getUnitById(targetId);
    if (!target) return;
    // Control until the caster's END phase (EndPhase.resolveTreasonReturns hands it back)
    events.push({
      type: 'UNIT_CAPTURED',
      instanceId: target.instanceId, cardId: target.cardId,
      from: target.owner, to: cmd.owner,
      col: target.position.col, row: target.position.row,
      permanent: false,
    });
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

/** Disease numbers come from the card definition (they were hard-coded). */
function diseaseParams(cardId: string): { damage: number; duration: number } {
  try {
    const ab = getCard(cardId).abilities.find(a => a.type === AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ) as any;
    return { damage: ab?.params?.damage ?? 2, duration: ab?.params?.duration ?? 3 };
  } catch { return { damage: 2, duration: 3 }; }
}
