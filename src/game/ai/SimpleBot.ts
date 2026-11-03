// ============================================================
// SimpleBot.ts — greedy AI opponent (practice + tutorial).
//
// Pure + Node-safe: reads the engine through its public queries and
// returns ONE GameAction. The caller applies it with applyAction(),
// i.e. exactly the path human and network actions take, so the bot
// can never break a rule the engine enforces.
//
// Strategy (deliberately simple and readable):
//   pending → resolve it (first valid target / position, column of the
//             enemy King, discard the cheapest card)
//   PLAY    → play the most expensive affordable card, deploying as far
//             forward as possible; once nothing else is playable → END
//   ACT     → attack (King first, then the weakest enemy), else move
//             the unit that gets closest to the enemy King; else → END
// ============================================================

import type { GameEngine } from '../GameEngine';
import type { GameAction } from '../../../shared/types/NetworkEvents';
import type { Position, Unit } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import { getCard } from '../data/CardRegistry';
import { CardClass } from '../types/CardTypes';

export interface BotOptions {
  /** Tutorial mode: never plays or attacks — just passes its turns. */
  passive?: boolean;
}

const dist = (a: Position, b: Position) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

export function nextBotAction(engine: GameEngine, me: Player, opts: BotOptions = {}): GameAction {
  const st = engine.getState();
  const enemy: Player = me === Player.P1 ? Player.P2 : Player.P1;
  const unitAt = (col: number, row: number) => st.board.find(c => c.col === col && c.row === row)?.unit ?? null;
  const enemyKing = st.board.find(c => c.unit?.cardId === 'king' && c.unit.owner === enemy)?.unit ?? null;

  // ── 1. Resolve whatever the engine is waiting for ──────────
  const pending = engine.getPendingCommand();
  if (pending) {
    switch (pending.kind) {
      case 'DISCARD': {
        const hand = st.players[me].hand;
        let idx = 0;
        hand.forEach((id, i) => { if (getCard(id).cost < getCard(hand[idx]).cost) idx = i; });
        return { type: 'SELECT_DISCARD', handIndex: idx };
      }
      case 'TARGET': {
        const target = st.board.find(c => c.unit && pending.validTargetIds.includes(c.unit.instanceId));
        return target ? { type: 'SELECT_TARGET', col: target.col, row: target.row } : { type: 'CANCEL_PENDING' };
      }
      case 'POSITION': {
        const pos = pending.validPositions[0];
        return pos ? { type: 'SELECT_POSITION', col: pos.col, row: pos.row } : { type: 'CANCEL_PENDING' };
      }
      case 'COLUMN':
        return { type: 'SELECT_COLUMN', col: enemyKing?.position.col ?? 3 };
    }
  }

  const phase = st.turn.phase;

  // ── 2. PLAY: deploy / cast ─────────────────────────────────
  if (phase === 'PLAY') {
    if (opts.passive) return { type: 'END_PLAY_PHASE' };
    const pool = st.modifiers[me].legPool;
    const deploy = engine.getValidDeployPositions();
    // Forward = toward the enemy: higher row for P1, lower for P2.
    const forward = [...deploy].sort((a, b) => (me === Player.P1 ? b.row - a.row : a.row - b.row) || Math.abs(a.col - 3) - Math.abs(b.col - 3));
    const candidates = st.players[me].hand
      .map((id, i) => ({ id, i, def: getCard(id) }))
      .filter(c => c.def.cost <= pool)
      .sort((a, b) => b.def.cost - a.def.cost);
    for (const c of candidates) {
      const needsSquare = c.def.class === CardClass.UNIT || c.def.class === CardClass.STRUCTURE;
      if (needsSquare && forward.length === 0) continue;
      // Structures sit back (safer), units go forward.
      const pos = c.def.class === CardClass.STRUCTURE ? forward[forward.length - 1] : forward[0];
      // Dry-run on a clone of the decision: the engine refuses illegal plays (e.g. a spell
      // with no target), so only propose plays the engine is likely to accept.
      if (!needsSquare && !spellLooksUseful(engine, c.id)) continue;
      return { type: 'PLAY_CARD', handIndex: c.i, col: pos?.col ?? 0, row: pos?.row ?? 0 };
    }
    return { type: 'END_PLAY_PHASE' };
  }

  // ── 3. ACT: attack, else advance ───────────────────────────
  if (phase === 'ACT') {
    if (opts.passive) return { type: 'END_ACT_PHASE' };
    const mine = st.board.map(c => c.unit).filter((u): u is Unit => !!u && u.owner === me);

    let best: { from: Unit; to: Position; score: number } | null = null;
    for (const u of mine) {
      for (const t of engine.getValidAttackSquares(u.instanceId)) {
        const target = unitAt(t.col, t.row);
        if (!target) continue;
        const score = target.cardId === 'king' ? 1000 : 100 - target.currentDef + u.currentAtk;
        if (!best || score > best.score) best = { from: u, to: t, score };
      }
    }
    if (best) {
      return { type: 'ATTACK_UNIT', fromCol: best.from.position.col, fromRow: best.from.position.row, targetCol: best.to.col, targetRow: best.to.row };
    }

    if (enemyKing) {
      let move: { from: Unit; to: Position; gain: number } | null = null;
      for (const u of mine) {
        if (u.cardId === 'king') continue; // keep the King home
        const now = dist(u.position, enemyKing.position);
        for (const m of engine.getValidMoveSquares(u.instanceId)) {
          const gain = now - dist(m, enemyKing.position);
          if (gain > 0 && (!move || gain > move.gain)) move = { from: u, to: m, gain };
        }
      }
      if (move) {
        return { type: 'MOVE_UNIT', fromCol: move.from.position.col, fromRow: move.from.position.row, col: move.to.col, row: move.to.row };
      }
    }
    return { type: 'END_ACT_PHASE' };
  }

  // DRAW / LEG / END are transient (the engine passes them itself) — nothing to decide.
  return { type: 'END_ACT_PHASE' };
}

/**
 * Cheap filter so the bot doesn't keep proposing a spell the engine will refuse.
 * Targeted spells are only "useful" if a target exists; the rest always are.
 */
function spellLooksUseful(engine: GameEngine, cardId: string): boolean {
  const st = engine.getState();
  const me = st.turn.activePlayer;
  const enemyUnits = st.board.map(c => c.unit).filter(u => u && u.owner !== me && u.cardId !== 'king');
  switch (cardId) {
    case 'coup':    return enemyUnits.some(u => getCard(u!.cardId).allegiance === 'ROYAL');
    case 'treason': return enemyUnits.some(u => getCard(u!.cardId).allegiance !== 'ROYAL');
    case 'disease': return enemyUnits.some(u => getCard(u!.cardId).class === CardClass.STRUCTURE);
    default:        return true;
  }
}
