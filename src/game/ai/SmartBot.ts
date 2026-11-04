// ============================================================
// SmartBot.ts — Normal / Hard difficulty for the practice bot.
//
// Same contract as SimpleBot: pure, Node-safe, reads the engine through
// public queries and returns ONE GameAction (applied via applyAction).
// No randomness → a seed fully determines a bot game.
//
// Over the greedy Easy bot it adds:
//   - trade evaluation: damage vs. counter-attack, kills, unit value
//   - threat awareness: squares the enemy can hit next turn
//   - King safety: a threatened King steps out of danger; deploys defend it
//   - smarter pending choices (best target / column / forward position)
//   Hard only: avoids walking into lethal squares, sets up next-turn hits,
//   and keeps its King out of fights it doesn't win. (Saving LEG for a
//   stronger card was tried and lost games — tempo wins in this format.)
// ============================================================

import type { GameEngine } from '../GameEngine';
import type { GameAction } from '../../../shared/types/NetworkEvents';
import type { Position, Unit } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import { getCard } from '../data/CardRegistry';
import { CardClass } from '../types/CardTypes';

export type SmartLevel = 'normal' | 'hard';

/** Behaviour switches per level (tuned with tests/engine/ai/botDifficulty.test.ts). */
export interface SmartProfile {
  avoidDanger: number;      // 0 = ignore enemy pressure on moves/deploys, higher = more careful
  kingCaution: number;      // penalty for the King joining a fight it doesn't win
  attackThreshold: number;  // minimum trade score worth taking
  lookahead: boolean;       // prefer moves that set up an attack next turn
}
export const PROFILES: Record<SmartLevel, SmartProfile> = {
  normal: { avoidDanger: 0,   kingCaution: 0,  attackThreshold: -2, lookahead: false },
  hard:   { avoidDanger: 1,   kingCaution: 15, attackThreshold: 0,  lookahead: true },
};

const KING_VALUE = 60;
const key = (p: Position) => `${p.col},${p.row}`;
const dist = (a: Position, b: Position) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
const value = (u: Unit) => (u.cardId === 'king' ? KING_VALUE : Math.max(1, getCard(u.cardId).cost));

export function nextSmartAction(engine: GameEngine, me: Player, level: SmartLevel): GameAction | null {
  const prof = PROFILES[level];
  const st = engine.getState();
  const enemy: Player = me === Player.P1 ? Player.P2 : Player.P1;
  const units = st.board.map(c => c.unit).filter((u): u is Unit => !!u);
  const mine = units.filter(u => u.owner === me);
  const theirs = units.filter(u => u.owner === enemy);
  const unitAt = (p: Position) => units.find(u => u.position.col === p.col && u.position.row === p.row) ?? null;
  const myKing = mine.find(u => u.cardId === 'king') ?? null;
  const enemyKing = theirs.find(u => u.cardId === 'king') ?? null;

  // Enemy pressure per square: total ATK the enemy could bring there next turn.
  const pressure = new Map<string, number>();
  for (const u of theirs) {
    for (const p of engine.getThreatRange(u.instanceId)) pressure.set(key(p), (pressure.get(key(p)) ?? 0) + u.currentAtk);
  }
  const danger = (p: Position) => pressure.get(key(p)) ?? 0;
  const kingThreatened = !!myKing && danger(myKing.position) > 0;

  // ── Pending choices ──────────────────────────────────────
  const pending = engine.getPendingCommand();
  if (pending) {
    switch (pending.kind) {
      case 'TARGET': {
        const targets = units.filter(u => pending.validTargetIds.includes(u.instanceId));
        if (targets.length === 0) return { type: 'CANCEL_PENDING' };
        const foes = targets.filter(u => u.owner === enemy);
        const pool = foes.length ? foes : targets;
        // Enemies: the most valuable (finish wounded ones first). Own units: the most valuable.
        const best = [...pool].sort((a, b) =>
          (value(b) + (b.owner === enemy ? (b.maxDef - b.currentDef) * 0.5 : 0))
          - (value(a) + (a.owner === enemy ? (a.maxDef - a.currentDef) * 0.5 : 0)))[0];
        return { type: 'SELECT_TARGET', col: best.position.col, row: best.position.row };
      }
      case 'COLUMN': {
        let bestCol = enemyKing?.position.col ?? 3, bestScore = -Infinity;
        for (let col = 0; col < 7; col++) {
          const inCol = units.filter(u => u.position.col === col);
          const score = inCol.reduce((s, u) => s + (u.owner === enemy ? value(u) : -value(u)), 0);
          if (score > bestScore) { bestScore = score; bestCol = col; }
        }
        return { type: 'SELECT_COLUMN', col: bestCol };
      }
      case 'POSITION': {
        if (pending.validPositions.length === 0) return { type: 'CANCEL_PENDING' };
        const fwd = (p: Position) => (me === Player.P1 ? p.row : -p.row);
        const pos = [...pending.validPositions].sort((a, b) =>
          (prof.avoidDanger ? danger(a) - danger(b) : 0) || fwd(b) - fwd(a))[0];
        return { type: 'SELECT_POSITION', col: pos.col, row: pos.row };
      }
      default:
        return null; // DISCARD → SimpleBot's handling is fine
    }
  }

  const phase = st.turn.phase;

  // ── PLAY ─────────────────────────────────────────────────
  if (phase === 'PLAY') {
    const hand = st.players[me].hand;
    const affordable = engine.getAffordableCards();
    const deploy = engine.getValidDeployPositions();
    if (affordable.length === 0) return { type: 'END_PLAY_PHASE' };

    // Where to put a unit: defend a threatened King, otherwise forward but (hard) not into fire.
    const fwd = (p: Position) => (me === Player.P1 ? p.row : -p.row);
    const squares = [...deploy].sort((a, b) => {
      if (kingThreatened && myKing) return dist(a, myKing.position) - dist(b, myKing.position);
      return (prof.avoidDanger ? Math.sign(danger(a)) - Math.sign(danger(b)) : 0) || fwd(b) - fwd(a) || Math.abs(a.col - 3) - Math.abs(b.col - 3);
    });

    const candidates = affordable
      .map(i => ({ i, id: hand[i], def: getCard(hand[i]) }))
      .sort((a, b) => b.def.cost - a.def.cost);

    for (const c of candidates) {
      const needsSquare = c.def.class === CardClass.UNIT || c.def.class === CardClass.STRUCTURE;
      if (needsSquare && squares.length === 0) continue;
      if (!needsSquare && !spellUseful(c.id, theirs)) continue;
      // Structures sit back, units go to the best square.
      const pos = c.def.class === CardClass.STRUCTURE ? squares[squares.length - 1] : squares[0];
      return { type: 'PLAY_CARD', handIndex: c.i, col: pos?.col ?? 0, row: pos?.row ?? 0 };
    }
    return { type: 'END_PLAY_PHASE' };
  }

  // ── ACT ──────────────────────────────────────────────────
  if (phase === 'ACT') {
    // 1. Best trade
    let bestAtk: { from: Unit; to: Unit; score: number } | null = null;
    for (const u of mine) {
      for (const t of engine.getValidAttackSquares(u.instanceId)) {
        const target = unitAt(t);
        if (!target || target.owner !== enemy) continue;
        const dmg = Math.max(0, u.currentAtk);
        if (dmg === 0) continue;
        const kills = dmg >= target.currentDef;
        const counterReach = engine.getThreatRange(target.instanceId).some(p => p.col === u.position.col && p.row === u.position.row);
        const counter = counterReach ? Math.max(0, target.currentAtk) : 0;
        const dies = counter >= u.currentDef;
        let score = target.cardId === 'king'
          ? (kills ? 10_000 : 20 + dmg * 3)
          : kills ? value(target) * 2 + 2 : (dmg / Math.max(1, target.maxDef)) * value(target);
        score -= dies ? value(u) * (u.cardId === 'king' ? 50 : 1.5) : (counter / Math.max(1, u.maxDef)) * value(u) * 0.5;
        if (u.cardId === 'king' && !kills) score -= prof.kingCaution;
        if (!bestAtk || score > bestAtk.score) bestAtk = { from: u, to: target, score };
      }
    }
    if (bestAtk && bestAtk.score > prof.attackThreshold) {
      return {
        type: 'ATTACK_UNIT', fromCol: bestAtk.from.position.col, fromRow: bestAtk.from.position.row,
        targetCol: bestAtk.to.position.col, targetRow: bestAtk.to.position.row,
      };
    }

    // 2. King safety: step out of danger
    if (myKing && kingThreatened) {
      const escapes = engine.getValidMoveSquares(myKing.instanceId)
        .filter(m => danger(m) < danger(myKing.position))
        .sort((a, b) => danger(a) - danger(b));
      if (escapes.length) {
        return { type: 'MOVE_UNIT', fromCol: myKing.position.col, fromRow: myKing.position.row, col: escapes[0].col, row: escapes[0].row };
      }
    }

    // 3. Advance toward the enemy King
    if (enemyKing) {
      let best: { from: Unit; to: Position; score: number } | null = null;
      for (const u of mine) {
        if (u.cardId === 'king') continue;
        const now = dist(u.position, enemyKing.position);
        for (const m of engine.getValidMoveSquares(u.instanceId)) {
          const gain = now - dist(m, enemyKing.position);
          const lethal = danger(m) >= u.currentDef;
          let score = gain * 2 - (prof.avoidDanger
            ? (lethal ? value(u) * 2 : danger(m) * 0.3) * prof.avoidDanger
            : (lethal ? value(u) * 0.5 : 0));
          // Set up a hit for next turn: an enemy will be inside this unit's reach from m
          if (prof.lookahead) score += setupBonus(engine, u, m, theirs);
          // Bodyguard: stay near a threatened King
          if (kingThreatened && myKing) score += (dist(u.position, myKing.position) - dist(m, myKing.position)) * 2;
          if (score > 0 && (!best || score > best.score)) best = { from: u, to: m, score };
        }
      }
      if (best) {
        return { type: 'MOVE_UNIT', fromCol: best.from.position.col, fromRow: best.from.position.row, col: best.to.col, row: best.to.row };
      }
    }
    return { type: 'END_ACT_PHASE' };
  }

  return null;
}

/** Rough "will I threaten something from there?" — enemies adjacent (Chebyshev 1–2) to m. */
function setupBonus(_engine: GameEngine, u: Unit, m: Position, theirs: Unit[]): number {
  if (u.currentAtk <= 0) return 0;
  let best = 0;
  for (const t of theirs) {
    const d = dist(m, t.position);
    if (d === 1) best = Math.max(best, t.cardId === 'king' ? 6 : 2 + (u.currentAtk >= t.currentDef ? 2 : 0));
  }
  return best;
}

/** Targeted spells only when a target exists (mirrors SimpleBot's filter). */
function spellUseful(cardId: string, theirs: Unit[]): boolean {
  const enemies = theirs.filter(u => u.cardId !== 'king');
  switch (cardId) {
    case 'coup':    return enemies.some(u => getCard(u.cardId).allegiance === 'ROYAL');
    case 'treason': return enemies.some(u => getCard(u.cardId).allegiance !== 'ROYAL');
    case 'disease': return enemies.some(u => getCard(u.cardId).class === CardClass.STRUCTURE);
    default:        return true;
  }
}
