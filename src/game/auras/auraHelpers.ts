// Shared helpers for aura processors.

import type { StatBuff } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import type { StatDelta } from './AuraProcessor';

// ── Module-level audit trail ─────────────────────────
// Set by AuraSystem before running the chain, cleared after.
// Processors don't need to know about it — addDelta handles it.
let _buffMap: Map<string, StatBuff[]> | null = null;

export function beginAuditTrail(buffMap: Map<string, StatBuff[]>): void {
  _buffMap = buffMap;
}

export function endAuditTrail(): void {
  _buffMap = null;
}

/** Safely read params from any ability (CommonAbility or CustomAbility). */
export function params(ab: any): any {
  return ab.params ?? {};
}

export function otherPlayer(p: Player): Player {
  return p === Player.P1 ? Player.P2 : Player.P1;
}

export function addDelta(
  deltas: Map<string, StatDelta>,
  instanceId: string,
  atk: number,
  def: number,
  mov: number,
  source?: string
): void {
  const d = deltas.get(instanceId);
  if (!d) return;
  d.atkDelta += atk;
  d.defDelta += def;
  d.moveDelta += mov;

  // Record to audit trail if active
  if (source && _buffMap) {
    let buffs = _buffMap.get(instanceId);
    if (!buffs) { buffs = []; _buffMap.set(instanceId, buffs); }
    buffs.push({ source, atkDelta: atk, defDelta: def, moveDelta: mov });
  }
}
