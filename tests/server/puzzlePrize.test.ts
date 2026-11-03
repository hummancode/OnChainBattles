/** Solving a puzzle awards its prize card (was a TODO — prizeCardId was returned but never granted). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { patchGetDB, createTestPlayer } from './helpers/testDB';
import { awardCard } from '../../server/api/collectionHelpers.js';

describe('Puzzle prize card', () => {
  let ctx: ReturnType<typeof patchGetDB>;
  beforeAll(() => { ctx = patchGetDB(); });
  afterAll(() => ctx.cleanup());

  const copies = (pid: number, card: string) =>
    (ctx.db.prepare('SELECT owned_copies FROM collections WHERE player_id = ? AND card_id = ?').get(pid, card) as any)?.owned_copies ?? 0;

  it('adds a copy to the solver\'s collection (new row or +1)', () => {
    const { playerId } = createTestPlayer(ctx.db, { displayName: 'Solver' });
    expect(awardCard(playerId, 'knight')).toBe(true);
    expect(copies(playerId, 'knight')).toBe(1);
    expect(awardCard(playerId, 'knight')).toBe(true);
    expect(copies(playerId, 'knight')).toBe(2);
  });

  it('rejects unknown card ids', () => {
    const { playerId } = createTestPlayer(ctx.db, { displayName: 'Solver2' });
    expect(awardCard(playerId, 'not_a_card')).toBe(false);
    expect(copies(playerId, 'not_a_card')).toBe(0);
  });
});
