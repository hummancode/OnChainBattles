// ============================================================
// stateHash.ts — Whole-match fingerprint for desync detection.
//
// Covers everything both clients and the server must agree on:
// turn/phase/active player, engine status + pending kind, both
// players' hands/deck sizes/LEG, and every unit's position + stats.
// Computed identically in the browser and on the server.
// ============================================================

import type { GameEngine } from '../GameEngine';
import { fnv1a } from './boardHash';

export function engineStateHash(engine: GameEngine): string {
  const s = engine.getState();
  const units = s.board
    .filter(c => c.unit)
    .map(c => c.unit!)
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
    .map(u => `${u.instanceId}@${u.position.col},${u.position.row}:${u.owner}:${u.currentAtk}/${u.currentDef}/${u.maxDef}:${u.isActive ? 1 : 0}`)
    .join('|');
  const players = s.players
    .map((p, i) => `${p.hand.join(',')}#${p.deckCount}#${p.discardCount}#${s.modifiers[i].legPool}`)
    .join('||');
  return fnv1a(
    `${s.turn.turnNumber}:${s.turn.activePlayer}:${s.turn.phase}:${s.status}:${engine.getPendingKind() ?? '-'}` +
    `\n${players}\n${units}`,
  );
}
