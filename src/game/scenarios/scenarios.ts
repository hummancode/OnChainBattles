// ============================================================
// scenarios.ts — the story puzzles. Board: 7×7, you are P1 (bottom,
// rows 0–2 home, row 3 neutral, rows 4–6 enemy half). Columns A–G = 0–6.
// Every scenario's `solution` is replayed by tests/engine/scenarios —
// change a card rule and those tests tell you which puzzle broke.
// ============================================================

import { Player } from '../types/GameTypes';
import type { Scenario } from './ScenarioTypes';

const P1 = Player.P1, P2 = Player.P2;
const E = { type: 'END_PLAY_PHASE' } as const;
const A = { type: 'END_ACT_PHASE' } as const;

export const SCENARIOS: Scenario[] = [
  // ── 1 ────────────────────────────────────────────────────
  {
    id: 'breach',
    title: 'Breach the Gate',
    difficulty: 1,
    seed: 101,
    setup: {
      units: [
        { cardId: 'king', owner: P1, col: 3, row: 0 },
        { cardId: 'archer', owner: P1, col: 1, row: 3 },
        { cardId: 'lancer', owner: P1, col: 3, row: 3 },
        { cardId: 'king', owner: P2, col: 3, row: 6, hp: 3 },
        { cardId: 'pikeman', owner: P2, col: 3, row: 5 },
        { cardId: 'foot_soldier', owner: P2, col: 5, row: 5 },
      ],
      hands: [[], []], decks: [[], []], leg: [0, 0], legRate: [1, 1],
    },
    goal: { kind: 'KILL_KING' },
    maxMoves: 3,
    maxTurns: 1,
    text: {
      intro: [
        'The enemy King has fled to his last gate, wounded (3 HP). A single Pikeman holds the road.',
        'Pikemen strike cavalry for triple damage — your Lancer would never survive the charge.',
      ],
      objective: 'Kill the enemy King this turn — 3 moves.',
      hint: 'Your Archer shoots diagonally up to 2 squares. Clear the road, then charge: a Lancer may move AND attack.',
      afterMove: { 1: 'The road is open. Now — charge!' },
      win: 'The gate falls. Long live the King!',
      lose: 'The charge broke on the pikes. Clear the road first.',
    },
    solution: [
      E,
      { type: 'ATTACK_UNIT', fromCol: 1, fromRow: 3, targetCol: 3, targetRow: 5 },
      { type: 'MOVE_UNIT', fromCol: 3, fromRow: 3, col: 3, row: 5 },
      { type: 'ATTACK_UNIT', fromCol: 3, fromRow: 5, targetCol: 3, targetRow: 6 },
    ],
  },
];
