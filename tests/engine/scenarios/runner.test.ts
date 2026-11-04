/** ScenarioRunner rules: move budget, auto-end, goals, scripted replies with bot fallback. */
import { describe, it, expect } from 'vitest';
import { ScenarioRunner } from '../../../src/game/scenarios/ScenarioRunner';
import type { Scenario } from '../../../src/game/scenarios/ScenarioTypes';
import { Player } from '../../../src/game/types/GameTypes';
import '../helpers/TestHarness';

const P1 = Player.P1, P2 = Player.P2;
function base(over: Partial<Scenario> = {}): Scenario {
  return {
    id: 't', title: 't', difficulty: 1, seed: 7,
    setup: {
      units: [
        { cardId: 'king', owner: P1, col: 3, row: 0 },
        { cardId: 'king', owner: P2, col: 3, row: 6, hp: 3 },
        { cardId: 'swordsman', owner: P1, col: 3, row: 4 },
        { cardId: 'foot_soldier', owner: P2, col: 0, row: 6 },
      ],
      hands: [[], []], decks: [[], []], leg: [0, 0], legRate: [1, 1],
    },
    goal: { kind: 'KILL_KING' }, maxMoves: 3, maxTurns: 3,
    text: { intro: [], objective: '', hint: '', win: '', lose: '' },
    solution: [],
    ...over,
  };
}

describe('ScenarioRunner', () => {
  it('loads the hand-made position', () => {
    const r = new ScenarioRunner(base());
    const st = r.engine.getState();
    expect(st.board.filter(c => c.unit).length).toBe(4);
    expect(st.board.find(c => c.col === 3 && c.row === 6)!.unit!.currentDef).toBe(3);
    expect(st.turn.activePlayer).toBe(P1);
    expect(st.turn.phase).toBe('PLAY');
  });

  it('counts moves, not turn ends; spending the last move ends the turn and judges it', () => {
    const r = new ScenarioRunner(base({ maxMoves: 1 }));
    expect(r.play({ type: 'END_PLAY_PHASE' })).toBe(true);
    expect(r.movesUsed).toBe(0);
    expect(r.play({ type: 'MOVE_UNIT', fromCol: 3, fromRow: 4, col: 2, row: 4 })).toBe(true);
    expect(r.movesUsed).toBe(1);
    expect(r.status).toBe('lost');
    expect(r.loseReason).toBe('OUT_OF_MOVES');
  });

  it('wins by killing the King within the budget (attack after the opponent replies)', () => {
    const r = new ScenarioRunner(base({ maxMoves: 2 }));
    r.play({ type: 'END_PLAY_PHASE' });
    expect(r.play({ type: 'MOVE_UNIT', fromCol: 3, fromRow: 4, col: 3, row: 5 })).toBe(true);
    r.play({ type: 'END_ACT_PHASE' });
    expect(r.opponentToMove).toBe(true);
    r.runOpponent();
    expect(r.opponentToMove).toBe(false);
    if (r.status === 'playing') {
      r.play({ type: 'END_PLAY_PHASE' });
      const st = r.engine.getState();
      const k = st.board.find(c => c.unit?.cardId === 'king' && c.unit.owner === P2)!;
      const sw = st.board.find(c => c.unit?.cardId === 'swordsman')!;
      r.play({ type: 'ATTACK_UNIT', fromCol: sw.col, fromRow: sw.row, targetCol: k.col, targetRow: k.row });
    }
    expect(r.status).toBe('won');
  });

  it('runs out of turns when the player only passes', () => {
    const r = new ScenarioRunner(base({ maxTurns: 2 }));
    for (let i = 0; i < 10 && r.status === 'playing'; i++) {
      r.play({ type: 'END_PLAY_PHASE' }); r.play({ type: 'END_ACT_PHASE' }); r.runOpponent();
    }
    expect(r.status).toBe('lost');
    expect(r.loseReason).toBe('OUT_OF_TURNS');
  });

  it('plays the scripted reply, and improvises when the script no longer fits', () => {
    const script = [[{ type: 'END_PLAY_PHASE' }, { type: 'MOVE_UNIT', fromCol: 0, fromRow: 6, col: 0, row: 5 }]] as any;
    const r = new ScenarioRunner(base({ opponentScript: script }));
    r.play({ type: 'END_PLAY_PHASE' }); r.play({ type: 'END_ACT_PHASE' });
    const replies: string[] = [];
    while (r.opponentToMove) replies.push(JSON.stringify(r.stepOpponent()));
    expect(replies[1]).toContain('"fromCol":0');
    expect(r.engine.getState().board.find(c => c.col === 0 && c.row === 5)!.unit?.cardId).toBe('foot_soldier');
    // Second opponent turn has no script → bot; and an impossible script line falls back too
    const bad = new ScenarioRunner(base({ opponentScript: [[{ type: 'MOVE_UNIT', fromCol: 6, fromRow: 6, col: 6, row: 5 } as any]] }));
    bad.play({ type: 'END_PLAY_PHASE' }); bad.play({ type: 'END_ACT_PHASE' });
    bad.runOpponent();
    expect(bad.opponentToMove).toBe(false);
  });

  it('passing the only allowed turn loses (rounds are counted, not half-turns)', () => {
    const r = new ScenarioRunner(base({ maxTurns: 1 }));
    r.play({ type: 'END_PLAY_PHASE' }); r.play({ type: 'END_ACT_PHASE' }); r.runOpponent();
    expect(r.status).toBe('lost');
    expect(r.loseReason).toBe('OUT_OF_TURNS');
  });

  it('a refused action spends nothing', () => {
    const r = new ScenarioRunner(base());
    expect(r.play({ type: 'MOVE_UNIT', fromCol: 3, fromRow: 4, col: 3, row: 5 })).toBe(false); // still PLAY phase
    expect(r.movesUsed).toBe(0);
  });
});
