/**
 * MVP 1: practice bot difficulty. Normal/Hard must play only legal actions, finish games,
 * and actually be stronger than Easy over a fixed set of seeds (both seat orders).
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../src/game/GameEngine';
import GameState from '../../../src/GameState';
import { applyAction } from '../../../src/network/ActionApplier';
import { nextBotAction, type BotDifficulty } from '../../../src/game/ai/SimpleBot';
import { Player } from '../../../src/game/types/GameTypes';
import { readFileSync } from 'fs';
import '../helpers/TestHarness';

const STARTER: string[] = JSON.parse(readFileSync('public/default-deck.json', 'utf8')).deckIds;

function duel(seed: number, p1: BotDifficulty, p2: BotDifficulty) {
  GameState.gameSeed = seed;
  const e = new GameEngine();
  let winner: number | null = null;
  e.on((ev: any) => { if (ev.type === 'GAME_OVER') winner = ev.result.isDraw ? null : ev.result.winner; });
  e.startGame([STARTER, STARTER]);
  let illegal = 0, n = 0;
  while (e.getState().status !== 'GAME_OVER' && n < 4000) {
    const p = e.getState().turn.activePlayer;
    const a = nextBotAction(e, p, { difficulty: p === Player.P1 ? p1 : p2 });
    if (!applyAction(e, a)) {
      illegal++;
      // keep the game moving like BattleScene's bot loop does
      if (e.getPendingKind()) applyAction(e, { type: 'CANCEL_PENDING' });
      applyAction(e, { type: e.getState().turn.phase === 'PLAY' ? 'END_PLAY_PHASE' : 'END_ACT_PHASE' });
    }
    n++;
  }
  const st = e.getState();
  return { over: st.status === 'GAME_OVER', winner, illegal, turns: st.turn.turnNumber };
}

function score(a: BotDifficulty, b: BotDifficulty, seeds: number[]) {
  let wins = 0, games = 0, illegal = 0, unfinished = 0;
  for (const s of seeds) {
    const g1 = duel(s, a, b); games++; if (g1.winner === Player.P1) wins++; illegal += g1.illegal; if (!g1.over) unfinished++;
    const g2 = duel(s, b, a); games++; if (g2.winner === Player.P2) wins++; illegal += g2.illegal; if (!g2.over) unfinished++;
  }
  return { rate: wins / games, illegal, unfinished };
}

const SEEDS = Array.from({ length: 20 }, (_, i) => 7 + i * 131);

describe('bot difficulty', () => {
  it('normal beats easy most of the time and plays legally', () => {
    const r = score('normal', 'easy', SEEDS);
    expect(r.illegal).toBe(0);
    expect(r.unfinished).toBe(0);
    expect(r.rate).toBeGreaterThanOrEqual(0.6);
  });

  it('hard beats easy clearly and plays legally', () => {
    const r = score('hard', 'easy', SEEDS);
    expect(r.illegal).toBe(0);
    expect(r.unfinished).toBe(0);
    expect(r.rate).toBeGreaterThanOrEqual(0.75);
  });

  it('hard is at least as strong as normal', () => {
    const r = score('hard', 'normal', SEEDS);
    expect(r.rate).toBeGreaterThanOrEqual(0.55);
  });
});
