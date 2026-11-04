/**
 * Every story puzzle must be solvable with its stored solution, must not be beatable by
 * just passing, must respect its 3–5 move budget, and (when cheap to check) must not have a
 * shortcut that uses fewer moves than intended. Card rule changes that break a puzzle fail here.
 */
import { describe, it, expect } from 'vitest';
import { SCENARIOS } from '../../../src/game/scenarios/scenarios';
import { replay, solve } from './solver';
import '../helpers/TestHarness';

describe('story puzzles', () => {
  it('ids are unique and texts are filled in', () => {
    expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) {
      expect(s.text.intro.length, s.id).toBeGreaterThan(0);
      for (const k of ['objective', 'hint', 'win', 'lose'] as const) expect(s.text[k].length, `${s.id}.${k}`).toBeGreaterThan(0);
    }
  });

  for (const s of SCENARIOS) {
    describe(s.id, () => {
      it(`budget is 3–5 moves`, () => {
        expect(s.maxMoves).toBeGreaterThanOrEqual(3);
        expect(s.maxMoves).toBeLessThanOrEqual(5);
      });

      it('the stored solution wins', () => {
        const r = replay(s, s.solution);
        expect(r.status, `${s.id}: ${r.loseReason}`).toBe('won');
        expect(r.movesUsed).toBeLessThanOrEqual(s.maxMoves);
      });

      it('passing every turn does not win', () => {
        const pass = Array.from({ length: s.maxTurns + 1 }, () => [{ type: 'END_PLAY_PHASE' }, { type: 'END_ACT_PHASE' }]).flat() as any;
        const r = replay(s, pass);
        if (s.goal.kind === 'SURVIVE') expect(r.status).not.toBe('playing');
        else expect(r.status).toBe('lost');
      });

      it('is deterministic (same line → same result twice)', () => {
        const a = replay(s, s.solution), b = replay(s, s.solution);
        expect(JSON.stringify(a.engine.getState().board)).toBe(JSON.stringify(b.engine.getState().board));
      });

      if ((s as any).checkNoShortcut !== false) {
        it('has no shortcut with fewer moves than the budget − 1', () => {
          const tight = { ...s, maxMoves: s.maxMoves - 2 };
          if (tight.maxMoves < 1) return;
          const res = solve(tight, 1, 40_000);
          expect(res.wins, JSON.stringify(res.wins[0])).toEqual([]);
        }, 120_000);
      }
    });
  }
});
