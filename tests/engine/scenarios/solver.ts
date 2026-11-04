// Brute-force scenario solver (tests / design tool). Explores every player decision up to the
// move budget; the opponent's replies are deterministic (script → Hard bot), so a line is just
// the list of player actions. Positions are rebuilt by replaying the line (they're tiny).
import { ScenarioRunner } from '../../../src/game/scenarios/ScenarioRunner';
import type { Scenario } from '../../../src/game/scenarios/ScenarioTypes';
import type { GameAction } from '../../../shared/types/NetworkEvents';
import { Player } from '../../../src/game/types/GameTypes';
import { getCard } from '../../../src/game/data/CardRegistry';

export function replay(scn: Scenario, line: GameAction[]): ScenarioRunner {
  const r = new ScenarioRunner(scn);
  for (const a of line) {
    if (r.status !== 'playing') break;
    r.play(a);
    r.runOpponent();
  }
  r.runOpponent();
  return r;
}

export function candidates(r: ScenarioRunner): GameAction[] {
  const e = r.engine, st = e.getState();
  if (st.turn.activePlayer !== Player.P1) return [];
  const out: GameAction[] = [];
  const pending = e.getPendingCommand();
  if (pending) {
    switch (pending.kind) {
      case 'TARGET':
        for (const c of st.board) if (c.unit && pending.validTargetIds.includes(c.unit.instanceId)) out.push({ type: 'SELECT_TARGET', col: c.col, row: c.row });
        out.push({ type: 'CANCEL_PENDING' }); break;
      case 'POSITION':
        for (const p of pending.validPositions) out.push({ type: 'SELECT_POSITION', col: p.col, row: p.row });
        out.push({ type: 'CANCEL_PENDING' }); break;
      case 'COLUMN':
        for (let c = 0; c < 7; c++) out.push({ type: 'SELECT_COLUMN', col: c }); break;
      case 'DISCARD': {
        const idx = pending.validHandIndices ?? st.players[0].hand.map((_, i) => i);
        for (const i of idx) out.push({ type: 'SELECT_DISCARD', handIndex: i });
        break;
      }
    }
    return out;
  }
  if (st.turn.phase === 'PLAY') {
    out.push({ type: 'END_PLAY_PHASE' });
    if (r.movesLeft > 0) {
      const seen = new Set<string>();
      for (const i of e.getAffordableCards()) {
        const id = st.players[0].hand[i];
        if (seen.has(id)) continue; seen.add(id);
        const def = getCard(id);
        if (def.class === 'SPELL') out.push({ type: 'PLAY_CARD', handIndex: i, col: 0, row: 0 });
        else for (const p of e.getValidDeployPositions()) out.push({ type: 'PLAY_CARD', handIndex: i, col: p.col, row: p.row });
      }
    }
  } else if (st.turn.phase === 'ACT') {
    out.push({ type: 'END_ACT_PHASE' });
    if (r.movesLeft > 0) {
      for (const c of st.board) {
        const u = c.unit;
        if (!u || u.owner !== Player.P1) continue;
        for (const t of e.getValidAttackSquares(u.instanceId)) out.push({ type: 'ATTACK_UNIT', fromCol: c.col, fromRow: c.row, targetCol: t.col, targetRow: t.row });
        for (const m of e.getValidMoveSquares(u.instanceId)) out.push({ type: 'MOVE_UNIT', fromCol: c.col, fromRow: c.row, col: m.col, row: m.row });
      }
    }
  }
  return out;
}

export interface SolveResult { wins: GameAction[][]; nodes: number; minMoves: number | null }

/** All winning lines (up to `limit`). Turn-ends are free but bounded by the scenario's turns. */
export function solve(scn: Scenario, limit = 50, maxNodes = 200_000): SolveResult {
  const wins: GameAction[][] = [];
  let nodes = 0, minMoves: number | null = null;
  const dfs = (line: GameAction[]) => {
    if (wins.length >= limit || nodes >= maxNodes) return;
    nodes++;
    const r = replay(scn, line);
    if (r.status === 'won') {
      wins.push(line);
      minMoves = minMoves == null ? r.movesUsed : Math.min(minMoves, r.movesUsed);
      return;
    }
    if (r.status === 'lost') return;
    for (const a of candidates(r)) dfs([...line, a]);
  };
  dfs([]);
  return { wins, nodes, minMoves };
}
