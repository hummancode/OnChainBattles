/**
 * Tutorial step machine (Roadmap 4.4): advances on real game events, never on timers.
 */
import { describe, it, expect } from 'vitest';
import { TutorialScript } from '../../src/scenes/battle/TutorialScript';

const ME = 0, BOT = 1;

describe('TutorialScript', () => {
  it('walks through deploy → end play → end turn → bot turn → act → win prompt', () => {
    const t = new TutorialScript(ME);
    expect(t.current.id).toBe('welcome');
    t.next();                                                    // manual "Next"
    expect(t.current.id).toBe('deploy');

    t.onEvent('PHASE_CHANGED', { phase: 'ACT', activePlayer: ME }); // wrong order: ignored
    expect(t.current.id).toBe('deploy');
    t.onEvent('CARD_PLAYED', { isLocal: true });
    expect(t.current.id).toBe('end_play');
    t.onEvent('PHASE_CHANGED', { phase: 'ACT', activePlayer: ME });
    expect(t.current.id).toBe('end_turn');
    t.onEvent('TURN_STARTED', { activePlayer: BOT });
    expect(t.current.id).toBe('bot_turn');
    t.onEvent('TURN_STARTED', { activePlayer: ME });
    expect(t.current.id).toBe('deploy_again');
    t.onEvent('PHASE_CHANGED', { phase: 'ACT', activePlayer: ME });
    expect(t.current.id).toBe('act');
    t.onEvent('UNIT_MOVED', {});
    expect(t.current.id).toBe('finish');
    expect(t.done).toBe(false);
    t.next();
    expect(t.done).toBe(true);
  });

  it("the opponent's events never advance the player's steps", () => {
    const t = new TutorialScript(ME);
    t.next();
    t.onEvent('CARD_PLAYED', { isLocal: false });
    expect(t.current.id).toBe('deploy');
  });

  it('the bot stays passive until the player has learned to act', () => {
    const t = new TutorialScript(ME);
    expect(t.botPassive).toBe(true);
    t.skip();
    expect(t.done).toBe(true);
    expect(t.botPassive).toBe(false);
  });
});
