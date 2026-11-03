/** Which game event makes which sound (pure mapping — the synth itself is browser-only). */
import { describe, it, expect } from 'vitest';
import { sfxForEvent } from '../../src/scenes/battle/SfxCoordinator';

describe('sfxForEvent', () => {
  const ME = 0;
  it('maps core board events', () => {
    expect(sfxForEvent('UNIT_PLACED', {}, ME)).toBe('deploy');
    expect(sfxForEvent('UNIT_ATTACKED', { damage: 2 }, ME)).toBe('attack');
    expect(sfxForEvent('UNIT_DIED', {}, ME)).toBe('death');
    expect(sfxForEvent('UNIT_HEALED', {}, ME)).toBe('heal');
  });
  it('turn chime only for our own turn', () => {
    expect(sfxForEvent('TURN_STARTED', { activePlayer: 0 }, ME)).toBe('turn');
    expect(sfxForEvent('TURN_STARTED', { activePlayer: 1 }, ME)).toBeNull();
  });
  it('game over: win / lose / draw from our perspective', () => {
    expect(sfxForEvent('GAME_OVER', { result: { winner: 0 } }, ME)).toBe('win');
    expect(sfxForEvent('GAME_OVER', { result: { winner: 1 } }, ME)).toBe('lose');
    expect(sfxForEvent('GAME_OVER', { result: { winner: null, isDraw: true } }, ME)).toBe('draw');
  });
  it('feedback toasts buzz; unrelated events are silent', () => {
    expect(sfxForEvent('UI_TOAST', { message: 'x' }, ME)).toBe('error');
    expect(sfxForEvent('HUD_REFRESH', {}, ME)).toBeNull();
  });
});
