/** A match must produce exactly one result (W/L record + result screen), whichever signal comes first. */
import { describe, it, expect, vi } from 'vitest';
import { setupGameOverHandler } from '../../src/scenes/battle/GameOverHandler';
import { claimResult, resetResult } from '../../src/scenes/battle/resultLatch';
import { EventBus, EV } from '../../src/events/EventBus';
import GameState from '../../src/GameState';
import { createTestEngine } from '../engine/helpers/TestHarness';

function fakeScene() {
  return {
    scene: { isActive: () => true, start: vi.fn() },
    time: { delayedCall: vi.fn() },
    cameras: { main: { fadeOut: vi.fn(), once: vi.fn() } },
  } as any;
}

describe('result latch', () => {
  it('engine GAME_OVER after a server-decided result does not record twice', () => {
    const { engine } = createTestEngine();
    const win = vi.spyOn(GameState, 'recordWin');
    const loss = vi.spyOn(GameState, 'recordLoss');
    const unsub = setupGameOverHandler(fakeScene(), engine, 0, 'A', 'B', false, { offline: false });
    expect(claimResult()).toBe(true);           // server path showed the result first
    EventBus.emit(EV.GAME_OVER, { result: { winner: 0, reason: 'KING_DESTROYED', turns: 5 } } as any);
    expect(win).not.toHaveBeenCalled();
    expect(loss).not.toHaveBeenCalled();
    unsub(); resetResult();
    win.mockRestore(); loss.mockRestore();
  });

  it('first signal wins', () => {
    resetResult();
    expect(claimResult()).toBe(true);
    expect(claimResult()).toBe(false);
  });
});
