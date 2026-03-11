// Shared helpers for aura processors.

import { Player } from '../types/GameTypes';
import type { StatDelta } from './AuraProcessor';

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
  mov: number
): void {
  const d = deltas.get(instanceId);
  if (!d) return;
  d.atkDelta += atk;
  d.defDelta += def;
  d.moveDelta += mov;
}
