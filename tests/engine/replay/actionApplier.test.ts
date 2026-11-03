/**
 * ActionApplier — the single function that turns a network GameAction into
 * engine calls. Used for live opponent relay AND full-log replay on rejoin.
 */
import { describe, it, expect } from 'vitest';
import { createTestEngineWithDeck, injectHand, accumulate, Player } from '../helpers/TestHarness';
import { applyAction } from '../../../src/network/ActionApplier';
import type { GameAction } from '../../../shared/types/NetworkEvents';

const DECK = [
  'foot_soldier', 'foot_soldier', 'foot_soldier', 'foot_soldier',
  'pikeman', 'pikeman', 'archer', 'archer', 'swordsman', 'swordsman',
  'war_horn', 'war_horn', 'lancer', 'lancer', 'scout', 'scout',
  'messenger', 'militia', 'knight', 'commander',
  'foot_soldier', 'foot_soldier', 'foot_soldier', 'pikeman', 'pikeman',
  'archer', 'archer', 'swordsman', 'swordsman', 'foot_soldier', 'foot_soldier',
];

function hand(t: ReturnType<typeof createTestEngineWithDeck>, p: Player) {
  return [...t.engine.getState().players[p].hand];
}

describe('ActionApplier', () => {
  it('SELECT_DISCARD resolves the War Horn discard identically on a replica engine', () => {
    const a = createTestEngineWithDeck(DECK);
    const b = createTestEngineWithDeck(DECK);
    for (const t of [a, b]) { accumulate(t.engine, 3); injectHand(t.engine, Player.P1, ['war_horn', 'pikeman', 'archer']); }

    const actions: GameAction[] = [
      { type: 'PLAY_CARD', handIndex: 0 },
      { type: 'SELECT_DISCARD', handIndex: 1 },
    ];
    for (const act of actions) { expect(applyAction(a.engine, act)).toBe(true); applyAction(b.engine, act); }

    expect(a.engine.getState().status).toBe('IDLE');
    expect(hand(a, Player.P1)).toEqual(hand(b, Player.P1));
    expect(hand(a, Player.P1)).toHaveLength(3); // 3 - war_horn + 2 drawn - 1 discarded
  });

  it('War Horn discard is mandatory — CANCEL_PENDING cannot skip it', () => {
    const t = createTestEngineWithDeck(DECK);
    accumulate(t.engine, 3);
    injectHand(t.engine, Player.P1, ['war_horn']);
    applyAction(t.engine, { type: 'PLAY_CARD', handIndex: 0 });
    applyAction(t.engine, { type: 'CANCEL_PENDING' });
    expect(t.engine.getState().status).toBe('AWAITING_INPUT');
  });

  it('returns false for actions that reference empty squares', () => {
    const t = createTestEngineWithDeck(DECK);
    expect(applyAction(t.engine, { type: 'MOVE_UNIT', fromCol: 0, fromRow: 3, col: 0, row: 4 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Rejoin: rebuild a whole match from server-provided decks + action log
// ─────────────────────────────────────────────────────────────
import { GameEngine } from '../../../src/game/GameEngine';
import GameState from '../../../src/GameState';
import { replayLog } from '../../../src/network/ActionApplier';
import { getCard } from '../../../src/game/data/CardRegistry';

const DECK_A = Array(31).fill(0).map((_, i) => ['foot_soldier', 'pikeman', 'archer'][i % 3]);
const DECK_B = Array(31).fill(0).map((_, i) => ['swordsman', 'scout', 'militia'][i % 3]);

describe('Per-player decks + log rebuild', () => {
  it('startGame(decks) loads each player\'s OWN deck', () => {
    GameState.gameSeed = 777;
    const e = new GameEngine();
    e.startGame([DECK_A, DECK_B]);
    const s = e.getState();
    expect(s.players[0].hand.every(id => DECK_A.includes(id))).toBe(true);
    expect(s.players[1].hand.every(id => DECK_B.includes(id))).toBe(true);
  });

  it('a fresh engine replaying the log reaches the exact same state as the live engine', () => {
    GameState.gameSeed = 4242;
    const live = new GameEngine();
    live.startGame([DECK_A, DECK_B]);

    // Play a few turns on the live engine, recording actions the way the network does
    const log: GameAction[] = [];
    const doAct = (a: GameAction) => { expect(applyAction(live, a)).toBe(true); log.push(a); };
    for (let turn = 0; turn < 8; turn++) {
      const st = live.getState();
      const p = st.turn.activePlayer;
      // try to play the first affordable unit to its first deploy square
      const pos = live.getValidDeployPositions()[0];
      const idx = st.players[p].hand.findIndex(id => getCard(id).cost <= st.modifiers[p].legPool);
      if (pos && idx >= 0) doAct({ type: 'PLAY_CARD', handIndex: idx, col: pos.col, row: pos.row });
      const pk = live.getPendingKind();
      if (pk === 'DISCARD') doAct({ type: 'SELECT_DISCARD', handIndex: 0 });
      else if (pk) doAct({ type: 'CANCEL_PENDING' });
      doAct({ type: 'END_PLAY_PHASE' });
      doAct({ type: 'END_ACT_PHASE' });
    }

    const rebuilt = new GameEngine();
    rebuilt.startGame([DECK_A, DECK_B]);
    expect(replayLog(rebuilt, log)).toBe(log.length);

    const strip = (e: GameEngine) => {
      const s = e.getState();
      return JSON.stringify({
        turn: s.turn.turnNumber, active: s.turn.activePlayer, phase: s.turn.phase,
        hands: s.players.map(p => p.hand), leg: s.modifiers.map(m => m.legPool),
        board: s.board.filter(c => c.unit).map(c => [c.col, c.row, c.unit!.instanceId, c.unit!.currentDef]),
      });
    };
    expect(strip(rebuilt)).toBe(strip(live));
    expect(live.getState().board.filter(c => c.unit).length).toBeGreaterThan(2); // something actually happened
  });
});

describe('applyAction reports no-ops honestly (server validation relies on it)', () => {
  it('END_ACT_PHASE during PLAY, SELECT_* with nothing pending, and CANCEL with nothing pending are rejected', () => {
    const t = createTestEngineWithDeck(DECK);
    expect(applyAction(t.engine, { type: 'END_ACT_PHASE' })).toBe(false);
    expect(applyAction(t.engine, { type: 'SELECT_POSITION', col: 1, row: 1 })).toBe(false);
    expect(applyAction(t.engine, { type: 'SELECT_DISCARD', handIndex: 0 })).toBe(false);
    expect(applyAction(t.engine, { type: 'CANCEL_PENDING' })).toBe(false);
    expect(applyAction(t.engine, { type: 'END_PLAY_PHASE' })).toBe(true);
    expect(applyAction(t.engine, { type: 'END_PLAY_PHASE' })).toBe(false); // already in ACT
  });
});
