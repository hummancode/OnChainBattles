/** Step 2 HUD: the battle log turns engine events into short, player-relative lines. */
import { describe, it, expect } from 'vitest';
import { describeEvent } from '../../src/scenes/battle/battleLog';

const names: Record<string, string> = { a1: 'archer', p2: 'pikeman', k2: 'king' };
const nameOf = (id: string) => names[id] ?? null;

describe('describeEvent', () => {
  it('turn start, from the local player\'s point of view', () => {
    expect(describeEvent({ type: 'TURN_STARTED', turn: 3, activePlayer: 0 } as any, 0, nameOf)).toEqual({ text: 'Turn 3 · you', tone: 'turn' });
    expect(describeEvent({ type: 'TURN_STARTED', turn: 3, activePlayer: 1 } as any, 0, nameOf)!.text).toBe('Turn 3 · opponent');
  });
  it('card plays name the card and the side', () => {
    expect(describeEvent({ type: 'CARD_PLAYED', player: 0, cardId: 'archer', handIndex: 0, legCost: 3 } as any, 0, nameOf)).toEqual({ text: 'You played Archer (3 LEG)', tone: 'you' });
    expect(describeEvent({ type: 'CARD_PLAYED', player: 1, cardId: 'treason', handIndex: 0, legCost: 4 } as any, 0, nameOf)).toEqual({ text: 'Opponent played Treason (4 LEG)', tone: 'enemy' });
  });
  it('attacks say who hit whom for how much; King hits show remaining HP', () => {
    expect(describeEvent({ type: 'UNIT_ATTACKED', attackerInstanceId: 'a1', targetInstanceId: 'p2', damage: 3, targetPlayer: 1, isKingHit: false } as any, 0, nameOf))
      .toEqual({ text: 'Archer hits Pikeman for 3', tone: 'you' });
    expect(describeEvent({ type: 'UNIT_ATTACKED', attackerInstanceId: 'a1', targetInstanceId: 'k2', damage: 3, targetPlayer: 1, isKingHit: true, newHP: 1 } as any, 0, nameOf)!.text)
      .toBe('Archer hits King for 3 (1 left)');
  });
  it('deaths and the result', () => {
    expect(describeEvent({ type: 'UNIT_DIED', instanceId: 'p2', cardId: 'pikeman', owner: 1 } as any, 0, nameOf)).toEqual({ text: 'Enemy Pikeman falls', tone: 'you' });
    expect(describeEvent({ type: 'UNIT_DIED', instanceId: 'x', cardId: 'archer', owner: 0 } as any, 0, nameOf)).toEqual({ text: 'Your Archer falls', tone: 'enemy' });
    expect(describeEvent({ type: 'GAME_OVER', result: { winner: 0, isDraw: false } } as any, 0, nameOf)!.text).toBe('Victory!');
  });
  it('ignores noise', () => {
    expect(describeEvent({ type: 'AURA_RECALCULATED' } as any, 0, nameOf)).toBeNull();
  });
});
