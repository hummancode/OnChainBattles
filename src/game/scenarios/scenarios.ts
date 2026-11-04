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
      intro: [
        'A moonless night. The enemy King sleeps in his tent (4 HP), guarded by a Foot Soldier on his right and an Archer on the far left.',
        "Your Assassin is a shadow: a 2-square diagonal leap onto an enemy strikes for 4 — and no one can answer the blow.",
      ],
      objective: 'Kill the sleeping King — 3 moves, 2 turns.',
      hint: 'Silence the right-hand guard with your Archer, slip the Assassin to a square two diagonals from the King, and leap next turn.',
      afterMove: { 1: 'One shadow moves…', 2: 'In position. End your turn — let the camp settle.' },
      opponentTurn: ['A soldier rushes to the tent — but he is watching the wrong side.'],
      win: 'The King never woke. The war ends tonight.',
      lose: 'The camp is awake. Strike from two squares away, where no one can answer.',
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
    difficulty: 2,
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
    text: {
      intro: [
        'Ambush at the ford! Your King (3 HP) is cornered on the riverbank. Enemy Archers hold both banks and a Lancer thunders down the road.',
        'Archers only shoot diagonally. Pikemen strike cavalry for triple damage — even when striking back.',
      ],
      objective: "Survive the enemy's turn — 3 moves.",
      hint: "Lower the pikes in the Lancer's path, then step the King out of both Archers' diagonals.",
      afterMove: { 1: 'Pikes are lowered across the road.', 2: "The King steps out of the archers' lines." },
      opponentTurn: ['The Lancer charges!'],
      win: 'The charge shattered on the pikes, and the arrows hit water. The King lives.',
      lose: 'The ambush closed. Block the road AND get out of the diagonals.',
    },
    solution: [
      { type: 'PLAY_CARD', handIndex: 0, col: 3, row: 2 },
      E,
      { type: 'MOVE_UNIT', fromCol: 3, fromRow: 0, col: 3, row: 1 },
      A,
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
    text: {
      intro: [
        "The enemy King (3 HP) waits in the hills behind his Commander. While the Commander stands in their half, every enemy there gains +1 DEF — your Earthquake (3 damage to a whole column) would leave the King alive.",
        "You can't afford the Earthquake yet. Next turn you can.",
      ],
      objective: 'Lure the Commander out of his half, then shake the King\'s column — 3 moves, 2 turns.',
      hint: "The Commander hunts what it can reach. Pull the Lancer back out of range, offer the Foot Soldier in the middle — then Earthquake the King's column.",
      afterMove: { 2: 'The bait is set. End your turn and watch.' },
      opponentTurn: ['The Commander rides out for the kill!'],
      win: "Without his Commander's banner the King's guard crumbled into the chasm.",
      lose: "The Commander's banner kept them standing. Draw him out of his half first.",
    },
    solution: [
      E,
      { type: 'MOVE_UNIT', fromCol: 6, fromRow: 4, col: 6, row: 2 },
      { type: 'MOVE_UNIT', fromCol: 4, fromRow: 4, col: 4, row: 3 },
      A,
      { type: 'PLAY_CARD', handIndex: 0, col: 0, row: 0 },
      { type: 'SELECT_COLUMN', col: 3 },
    ],
  },
  // ── 5 ────────────────────────────────────────────────────
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
    text: {
      intro: [
        'The enemy King (4 HP) hides behind a wall of Pikemen. Your army is far away — but a pretext for war can put a blade at his gate.',
        "Casus Belli deploys a unit from your hand on the front row of the enemy half. It can act from your next turn.",
      ],
      objective: 'Kill the enemy King — 3 moves, 2 turns.',
      hint: "Drop the Assassin where the King is exactly two diagonals away, and shoot the soldier who could hit her before nightfall.",
      afterMove: { 1: 'A pretext is found. Now choose who crosses the border…', 2: 'The only guard who could reach her is down. End your turn.' },
      opponentTurn: ['The enemy calls a Priest to the King\'s side — too late.'],
      win: 'A pretext, a leap, a crown on the floor.',
      lose: "She was seen. Pick a square two diagonals from the King — and protect it.",
    },
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
  // ── 6 ────────────────────────────────────────────────────
  {
    id: 'turncoat',
    title: 'The Turncoat',
    difficulty: 3,
    seed: 707,
    setup: {
      units: [
        { cardId: 'king', owner: P1, col: 3, row: 0 },
        { cardId: 'archer', owner: P1, col: 1, row: 3 },
        { cardId: 'king', owner: P2, col: 3, row: 6, hp: 3 },
        { cardId: 'lancer', owner: P2, col: 3, row: 3 },
        { cardId: 'pikeman', owner: P2, col: 3, row: 5 },
        { cardId: 'pikeman', owner: P2, col: 2, row: 5 },
        { cardId: 'foot_soldier', owner: P2, col: 4, row: 5 },
      ],
      hands: [['treason'], []], decks: [[], []], leg: [4, 0], legRate: [4, 1],
    },
    goal: { kind: 'KILL_KING' },
    maxMoves: 4,
    maxTurns: 1,
    text: {
      intro: [
        'Gold buys loyalty. An enemy Lancer waits in the middle of the field; behind him, a Pikeman guards the wounded King (3 HP).',
        'Treason turns an enemy unit to your side for this turn only. A Lancer may move and attack in the same turn.',
      ],
      objective: 'Kill the King this turn — 4 moves.',
      hint: 'Buy the Lancer. Your Archer clears the Pikeman (pikes would skewer cavalry). Then charge straight at the King.',
      afterMove: { 1: 'The Lancer lowers his banner… and raises yours.', 2: 'The pikes are down. Charge!' },
      win: 'Betrayed by his own rider. The realm is yours.',
      lose: 'Loyalty bought is loyalty spent — one turn only. Clear the pikes, then charge.',
    },
    solution: [
      { type: 'PLAY_CARD', handIndex: 0, col: 0, row: 0 },
      { type: 'SELECT_TARGET', col: 3, row: 3 },
      E,
      { type: 'ATTACK_UNIT', fromCol: 1, fromRow: 3, targetCol: 3, targetRow: 5 },
      { type: 'MOVE_UNIT', fromCol: 3, fromRow: 3, col: 3, row: 5 },
      { type: 'ATTACK_UNIT', fromCol: 3, fromRow: 5, targetCol: 3, targetRow: 6 },
    ],
  },
];
