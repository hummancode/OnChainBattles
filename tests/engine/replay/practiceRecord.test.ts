/** Practice / tutorial matches vs the bot must not change the player's W/L record. */
import { describe, it, expect } from 'vitest';
import { EventBus, EV } from '../../../src/events/EventBus';
import GameState from '../../../src/GameState';
import { setupGameOverHandler } from '../../../src/scenes/battle/GameOverHandler';

const scene: any = {
  scene: { isActive: () => true, start: () => {} },
  time: { delayedCall: () => {} },
  cameras: { main: { fadeOut() {}, once() {} } },
};
const engine: any = { getState: () => ({ turn: { turnNumber: 5 } }) };

describe('Offline match record', () => {
  it('a bot match does not touch wins/losses', () => {
    const w = GameState.winCount, l = GameState.lossCount;
    const unsub = setupGameOverHandler(scene, engine, 0, 'Me', 'Bot', false, { offline: true });
    EventBus.emit(EV.GAME_OVER, { result: { winner: 0, loser: 1, reason: 'KING_DESTROYED', turns: 5 } } as any);
    unsub();
    expect([GameState.winCount, GameState.lossCount]).toEqual([w, l]);
    expect(GameState.lastMatch?.opponentName).toBe('Bot'); // result screen still works
    expect(GameState.lastMatch?.practice).toBe(true);       // REMATCH → another bot match
  });

  it('an online match still records the result', () => {
    const w = GameState.winCount;
    const unsub = setupGameOverHandler(scene, engine, 0, 'Me', 'Them', false);
    EventBus.emit(EV.GAME_OVER, { result: { winner: 0, loser: 1, reason: 'KING_DESTROYED', turns: 5 } } as any);
    unsub();
    expect(GameState.winCount).toBe(w + 1);
  });
});
