/**
 * Mutual King death → DRAW.
 *
 * Dying blow means a King attacking a King can kill both in one exchange.
 * Previously the attacker was always declared the winner (checkKingDeath ran
 * for the defender first and short-circuited the second check).
 */
import { describe, it, expect } from 'vitest';
import { createTestEngine, Player } from '../helpers/TestHarness';

function setupKingsFaceToFace(hp1: number, hp2: number) {
  const t = createTestEngine();
  const board = (t.engine as any).board;
  const k1 = board.getKing(Player.P1);
  const k2 = board.getKing(Player.P2);
  // Put kings adjacent in the middle of the board
  board.moveUnit(k1.instanceId, 3, 3);
  board.moveUnit(k2.instanceId, 3, 4);
  k1.currentDef = hp1;
  k2.currentDef = hp2;
  t.engine.endPlayPhase(); // P1 → ACT
  return { t, k1, k2 };
}

describe('Mutual King death', () => {
  it('both kings dying in the same exchange is a draw', () => {
    const { t, k1, k2 } = setupKingsFaceToFace(1, 1);
    expect(t.engine.attackUnit(k1.instanceId, k2.instanceId)).toBe(true);

    const over = t.eventsOfType('GAME_OVER');
    expect(over).toHaveLength(1);
    expect((over[0] as any).result.isDraw).toBe(true);
    expect((over[0] as any).result.winner).toBeNull();
    expect(t.engine.getState().status).toBe('GAME_OVER');
  });

  it('only the defender king dying is still a win for the attacker', () => {
    const { t, k1, k2 } = setupKingsFaceToFace(5, 1);
    t.engine.attackUnit(k1.instanceId, k2.instanceId);
    const over = t.eventsOfType('GAME_OVER');
    expect(over).toHaveLength(1);
    expect((over[0] as any).result.winner).toBe(Player.P1);
    expect((over[0] as any).result.isDraw).toBeFalsy();
  });

  it('attacker king killed by dying blow loses', () => {
    const { t, k1, k2 } = setupKingsFaceToFace(1, 5);
    t.engine.attackUnit(k1.instanceId, k2.instanceId);
    const over = t.eventsOfType('GAME_OVER');
    expect(over).toHaveLength(1);
    expect((over[0] as any).result.winner).toBe(Player.P2);
  });
});
