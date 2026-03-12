// ============================================================
// boardHash.ts — Lightweight FNV-1a hash of board state.
// Used for cross-client state sync verification.
// ============================================================

import type { Unit } from '../types/GameTypes';

/**
 * FNV-1a 32-bit hash (fast, non-cryptographic, good distribution).
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Compute a deterministic hash from serialized board cells.
 * Works with the output of `engine.getState().board`.
 */
export function boardHashFromCells(cells: Array<{ col: number; row: number; unit: Unit | null }>): string {
  const units = cells
    .filter(c => c.unit !== null)
    .map(c => c.unit!)
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
    .map(u => `${u.instanceId}:${u.position.col},${u.position.row}:${u.currentDef}:${u.owner}`)
    .join('|');
  return fnv1a(units);
}
