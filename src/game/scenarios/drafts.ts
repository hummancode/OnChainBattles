// ============================================================
// drafts.ts — unfinished story puzzles (work in progress).
// Same format as scenarios.ts. Board: 7×7, you are P1 (bottom,
// rows 0–2 home, row 3 neutral, rows 4–6 enemy half). Columns A–G = 0–6.
// Every scenario's `solution` is replayed by tests/engine/scenarios —
// change a card rule and those tests tell you which puzzle broke.
// ============================================================

import { Player } from '../types/GameTypes';
import type { Scenario } from './ScenarioTypes';

const P1 = Player.P1, P2 = Player.P2;
const E = { type: 'END_PLAY_PHASE' } as const;
const A = { type: 'END_ACT_PHASE' } as const;

/** NOT shown in the game yet: mechanics solver-checked, story texts still placeholders ('x').
 *  To finish: write the texts, move entries into SCENARIOS (scenarios.ts), run tests/engine/scenarios. */
export const DRAFT_SCENARIOS: Scenario[] = [
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
  // ── 2 ────────────────────────────────────────────────────
  {
    id: 'nightblade',
    title: 'The Night Blade',
    difficulty: 1,
    seed: 202,
    setup: {
      units: [
        { cardId: 'king', owner: P1, col: 3, row: 0 },
        { cardId: 'assassin', owner: P1, col: 3, row: 2 },
        { cardId: 'archer', owner: P1, col: 3, row: 3 },
        { cardId: 'king', owner: P2, col: 3, row: 6, hp: 4 },
        { cardId: 'archer', owner: P2, col: 0, row: 5 },
        { cardId: 'foot_soldier', owner: P2, col: 5, row: 5 },
      ],
      hands: [[], []], decks: [[], []], leg: [0, 0], legRate: [1, 1],
    },
    goal: { kind: 'KILL_KING' },
    maxMoves: 3,
    maxTurns: 2,
    text: {
      intro: ['x'],
      objective: 'x', hint: 'x', win: 'x', lose: 'x',
    },
    solution: [
      E,
      { type: 'ATTACK_UNIT', fromCol: 3, fromRow: 3, targetCol: 5, targetRow: 5 },
      { type: 'MOVE_UNIT', fromCol: 3, fromRow: 2, col: 5, row: 4 },
      A,
      E,
      { type: 'MOVE_UNIT', fromCol: 5, fromRow: 4, col: 3, row: 6 },
    ],
  },
  // ── 3 ────────────────────────────────────────────────────
  {
    id: 'ford',
    title: 'Hold the Ford',
    difficulty: 1,
    seed: 303,
    setup: {
      units: [
        { cardId: 'king', owner: P1, col: 3, row: 0, hp: 3 },
        { cardId: 'foot_soldier', owner: P1, col: 2, row: 0, canAct: false },
        { cardId: 'foot_soldier', owner: P1, col: 4, row: 0, canAct: false },
        { cardId: 'archer', owner: P1, col: 6, row: 2 },
        { cardId: 'king', owner: P2, col: 3, row: 6 },
        { cardId: 'lancer', owner: P2, col: 3, row: 3 },
        { cardId: 'archer', owner: P2, col: 1, row: 2 },
        { cardId: 'archer', owner: P2, col: 5, row: 2 },
      ],
      hands: [['pikeman'], []], decks: [[], []], leg: [2, 0], legRate: [2, 1],
    },
    goal: { kind: 'SURVIVE', turns: 1 },
    maxMoves: 3,
    maxTurns: 1,
    opponentScript: [
      [E, { type: 'MOVE_UNIT', fromCol: 3, fromRow: 3, col: 3, row: 2 }, { type: 'ATTACK_UNIT', fromCol: 3, fromRow: 2, targetCol: 3, targetRow: 1 },
        { type: 'ATTACK_UNIT', fromCol: 1, fromRow: 2, targetCol: 3, targetRow: 0 }, { type: 'ATTACK_UNIT', fromCol: 5, fromRow: 2, targetCol: 3, targetRow: 0 }],
    ],
    text: { intro: ['x'], objective: 'x', hint: 'x', win: 'x', lose: 'x' },
    solution: [
      { type: 'PLAY_CARD', handIndex: 0, col: 3, row: 2 },
      E,
      { type: 'MOVE_UNIT', fromCol: 3, fromRow: 0, col: 3, row: 1 },
      A,
    ],
  },
  // ── 6 ────────────────────────────────────────────────────
  {
    id: 'casus',
    title: 'A Pretext for War',
    difficulty: 3,
    seed: 606,
    setup: {
      units: [
        { cardId: 'king', owner: P1, col: 3, row: 0 },
        { cardId: 'archer', owner: P1, col: 2, row: 3 },
        { cardId: 'king', owner: P2, col: 2, row: 6, hp: 4 },
        { cardId: 'pikeman', owner: P2, col: 2, row: 5 },
        { cardId: 'foot_soldier', owner: P2, col: 0, row: 5 },
        { cardId: 'pikeman', owner: P2, col: 4, row: 5 },
        { cardId: 'foot_soldier', owner: P2, col: 5, row: 4 },
      ],
      hands: [['casus_belli', 'assassin'], ['priest']], decks: [[], []], leg: [4, 0], legRate: [4, 5],
    },
    goal: { kind: 'KILL_KING' },
    maxMoves: 3,
    maxTurns: 2,
    text: { intro: ['x'], objective: 'x', hint: 'x', win: 'x', lose: 'x' },
    solution: [
      { type: 'PLAY_CARD', handIndex: 0, col: 0, row: 0 },
      { type: 'SELECT_POSITION', col: 0, row: 4 },
      { type: 'SELECT_DISCARD', handIndex: 0 },
      E,
      { type: 'ATTACK_UNIT', fromCol: 2, fromRow: 3, targetCol: 0, targetRow: 5 },
      A,
      E,
      { type: 'MOVE_UNIT', fromCol: 0, fromRow: 4, col: 2, row: 6 },
    ],
  },
  // ── 4 ────────────────────────────────────────────────────
  {
    id: 'faultline',
    title: 'The Fault Line',
    difficulty: 2,
    seed: 404,
    setup: {
      units: [
        { cardId: 'king', owner: P1, col: 3, row: 0 },
        { cardId: 'lancer', owner: P1, col: 6, row: 4 },
        { cardId: 'foot_soldier', owner: P1, col: 4, row: 4 },
        { cardId: 'king', owner: P2, col: 3, row: 6, hp: 3 },
        { cardId: 'commander', owner: P2, col: 5, row: 5 },
        { cardId: 'pikeman', owner: P2, col: 2, row: 5 },
        { cardId: 'pikeman', owner: P2, col: 4, row: 6 },
      ],
      hands: [['earthquake'], []], decks: [[], []], leg: [3, 0], legRate: [4, 1],
    },
    goal: { kind: 'KILL_KING' },
    maxMoves: 3,
    maxTurns: 2,
    text: { intro: ['x'], objective: 'x', hint: 'x', win: 'x', lose: 'x' },
    solution: [
      E,
      { type: 'MOVE_UNIT', fromCol: 6, fromRow: 4, col: 6, row: 2 },
      { type: 'MOVE_UNIT', fromCol: 4, fromRow: 4, col: 4, row: 3 },
      A,
      { type: 'PLAY_CARD', handIndex: 0, col: 0, row: 0 },
      { type: 'SELECT_COLUMN', col: 3 },
    ],
  },
];
