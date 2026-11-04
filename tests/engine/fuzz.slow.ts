/**
 * Engine fuzz (slow, not part of test:game): bot-vs-bot over random full-pool decks.
 * Checks invariants after every action and replay determinism per game.
 *   npm run test:fuzz            (FUZZ_GAMES=400, writes fuzz-report.txt)
 */
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import './helpers/TestHarness';
import { GameEngine } from '../../src/game/GameEngine';
import GameState from '../../src/GameState';
import { applyAction, replayLog } from '../../src/network/ActionApplier';
import { nextBotAction } from '../../src/game/ai/SimpleBot';
import { engineStateHash } from '../../src/game/utils/stateHash';
import { CARD_DEFINITIONS } from '../../src/game/data/CardDefinitions';
import type { GameAction } from '../../shared/types/NetworkEvents';

const OUT = process.env.FUZZ_REPORT ?? 'fuzz-report.txt';
const GAMES = Number(process.env.FUZZ_GAMES ?? 400);
const POOL = CARD_DEFINITIONS.filter(d => d.id !== 'king').map(d => d.id);

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
function deck(r: () => number) { return Array.from({ length: 31 }, () => POOL[Math.floor(r() * POOL.length)]); }

function invariants(e: GameEngine): string | null {
  const s = e.getState();
  const ids = new Set<string>();
  for (const c of s.board) {
    const u = c.unit; if (!u) continue;
    if (ids.has(u.instanceId)) return `duplicate unit ${u.instanceId}`;
    ids.add(u.instanceId);
    if (u.position.col !== c.col || u.position.row !== c.row) return `pos mismatch ${u.instanceId} cell ${c.col},${c.row} unit ${u.position.col},${u.position.row}`;
    if (u.currentDef <= 0 && s.status !== 'GAME_OVER') return `dead unit on board ${u.cardId} hp ${u.currentDef}`;
    if (u.owner !== 0 && u.owner !== 1) return `bad owner ${u.owner}`;
    if (u.currentAtk < 0) return `negative atk ${u.cardId}`;
  }
  if (s.status !== 'GAME_OVER') {
    for (const p of [0, 1]) if (!s.board.some(c => c.unit?.cardId === 'king' && c.unit.owner === p)) return `king of P${p + 1} missing but game not over`;
  }
  for (const p of [0, 1]) if (s.modifiers[p].legPool < 0) return `negative LEG P${p + 1}`;
  return null;
}

it('fuzz', () => {
  const lines: string[] = [];
  const counts: Record<string, number> = {};
  const note = (k: string, msg: string) => { counts[k] = (counts[k] ?? 0) + 1; if (counts[k] <= 3) lines.push(`[${k}] ${msg}`); };
  let games = 0, finished = 0, totalActions = 0;
  for (let seed = 1; seed <= GAMES; seed++) {
    const r = rng(seed * 7919);
    const decks: [string[], string[]] = [deck(r), deck(r)];
    GameState.gameSeed = seed;
    const e = new GameEngine();
    const log: GameAction[] = [];
    try { e.startGame(decks); } catch (err) { note('startGame-throw', `seed ${seed}: ${(err as Error).message}`); continue; }
    games++;
    let refusedInRow = 0;
    for (let n = 0; n < 2500 && e.getState().status !== 'GAME_OVER'; n++) {
      const p = e.getState().turn.activePlayer;
      let a: GameAction;
      try { a = nextBotAction(e, p); } catch (err) { note('bot-throw', `seed ${seed} n ${n}: ${(err as Error).stack?.split('\n').slice(0, 3).join(' | ')}`); break; }
      let ok = false;
      try { ok = applyAction(e, a); } catch (err) { note('engine-throw', `seed ${seed} n ${n} ${JSON.stringify(a)}: ${(err as Error).stack?.split('\n').slice(0, 4).join(' | ')}`); break; }
      if (ok) { log.push(a); refusedInRow = 0; }
      else {
        note('refused', `seed ${seed} n ${n} ${JSON.stringify(a)} phase=${e.getState().turn.phase} pending=${e.getPendingKind()}`);
        refusedInRow++;
        // fallback like the client driver
        const fb: GameAction = e.getPendingKind() ? { type: 'CANCEL_PENDING' } : { type: e.getState().turn.phase === 'PLAY' ? 'END_PLAY_PHASE' : 'END_ACT_PHASE' };
        if (applyAction(e, fb)) log.push(fb);
        if (refusedInRow > 5) { note('stuck', `seed ${seed} n ${n} phase=${e.getState().turn.phase} pending=${e.getPendingKind()} status=${e.getState().status}`); break; }
      }
      totalActions++;
      const bad = invariants(e);
      if (bad) { note('invariant', `seed ${seed} n ${n} after ${JSON.stringify(a)}: ${bad}`); break; }
    }
    if (e.getState().status === 'GAME_OVER') finished++; else note('no-finish', `seed ${seed} turn ${e.getState().turn.turnNumber}`);
    // determinism: replay log on a fresh engine
    try {
      GameState.gameSeed = seed;
      const r2 = new GameEngine(); r2.startGame(decks);
      const applied = replayLog(r2, log);
      if (applied !== log.length) note('replay-diverged', `seed ${seed}: ${applied}/${log.length} at ${JSON.stringify(log[applied])}`);
      else if (engineStateHash(r2) !== engineStateHash(e)) note('replay-hash', `seed ${seed}`);
    } catch (err) { note('replay-throw', `seed ${seed}: ${(err as Error).message}`); }
  }
  lines.unshift(`games=${games} finished=${finished} actions=${totalActions} counts=${JSON.stringify(counts)}`);
  writeFileSync(OUT, lines.join('\n'));
}, 600_000);
