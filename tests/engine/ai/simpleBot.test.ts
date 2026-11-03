/**
 * SimpleBot (Roadmap 4.4): picks legal actions through the same ActionApplier path as a
 * human, and a bot-vs-bot game always terminates.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../src/game/GameEngine';
import GameState from '../../../src/GameState';
import { applyAction } from '../../../src/network/ActionApplier';
import { nextBotAction } from '../../../src/game/ai/SimpleBot';
import { Player } from '../../../src/game/types/GameTypes';
import { UNITS_ONLY_DECK_IDS } from '../../../src/game/data/DeckDefinitions';
import { readFileSync } from 'fs';
import '../helpers/TestHarness';

const STARTER: string[] = JSON.parse(readFileSync('public/default-deck.json', 'utf8')).deckIds;

function playOut(seed: number, decks: [string[], string[]], maxActions = 3000) {
  GameState.gameSeed = seed;
  const e = new GameEngine();
  e.startGame(decks);
  let actions = 0, illegal = 0;
  while (e.getState().status !== 'GAME_OVER' && actions < maxActions) {
    const p = e.getState().turn.activePlayer;
    const a = nextBotAction(e, p);
    if (!applyAction(e, a)) illegal++;
    actions++;
  }
  return { e, actions, illegal };
}

describe('SimpleBot', () => {
  for (const seed of [11, 222, 3333]) {
    it(`bot vs bot (seed ${seed}) only plays legal actions and finishes`, () => {
      const { e, illegal } = playOut(seed, [STARTER, [...UNITS_ONLY_DECK_IDS]]);
      expect(illegal).toBe(0);
      expect(e.getState().status).toBe('GAME_OVER');
    });
  }

  it('attacks the enemy King when it can', () => {
    GameState.gameSeed = 5;
    const e = new GameEngine();
    e.startGame();
    const eng: any = e;
    const k1 = eng.board.getKing(Player.P1), k2 = eng.board.getKing(Player.P2);
    eng.board.moveUnit(k1.instanceId, 3, 3); eng.board.moveUnit(k2.instanceId, 3, 4);
    e.endPlayPhase(); // P1 → ACT
    const a = nextBotAction(e, Player.P1);
    expect(a).toMatchObject({ type: 'ATTACK_UNIT', fromCol: 3, fromRow: 3, targetCol: 3, targetRow: 4 });
  });

  it('resolves a pending interaction instead of ending the phase', () => {
    GameState.gameSeed = 9;
    const e = new GameEngine();
    e.startGame();
    const eng: any = e;
    eng.players[Player.P1].hand = ['war_horn'];
    eng.mods[Player.P1].legOverflow = true; eng.mods[Player.P1].legPool = 10;
    expect(applyAction(e, nextBotAction(e, Player.P1))).toBe(true); // plays War Horn
    expect(e.getPendingKind()).toBe('DISCARD');
    expect(nextBotAction(e, Player.P1).type).toBe('SELECT_DISCARD');
  });

  it('a passive bot only ends its phases', () => {
    GameState.gameSeed = 4;
    const e = new GameEngine();
    e.startGame();
    expect(nextBotAction(e, Player.P1, { passive: true }).type).toBe('END_PLAY_PHASE');
  });
});
