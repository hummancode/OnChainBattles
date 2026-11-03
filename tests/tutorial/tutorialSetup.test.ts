import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/game/GameEngine';
import GameState from '../../src/GameState';
import { getCard } from '../../src/game/data/CardRegistry';
import { TUTORIAL_DECK, TUTORIAL_BOT_DECK, TUTORIAL_SEED } from '../../src/game/data/TutorialSetup';
import '../engine/helpers/TestHarness';

function openingHand(seed: number): string[] {
  GameState.gameSeed = seed;
  const e = new GameEngine();
  e.startGame([TUTORIAL_DECK, TUTORIAL_BOT_DECK]);
  return [...e.getState().players[0].hand];
}

describe('Tutorial setup', () => {
  it('deck has 31 cards', () => expect(TUTORIAL_DECK).toHaveLength(31));

  it('the fixed seed gives a playable turn-1 hand (a 1-LEG unit)', () => {
    const hand = openingHand(TUTORIAL_SEED);
    expect(hand.some(id => getCard(id).cost <= 1)).toBe(true);
  });
});
