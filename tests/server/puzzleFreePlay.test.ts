/**
 * MVP 1 (crypto off): off-chain puzzles are solvable with just a login — no wallet signature —
 * and on-chain puzzles are hidden / refused while crypto is disabled. Cooldown reads
 * SQLite's UTC timestamps as UTC.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import { patchGetDB, createTestPlayer } from './helpers/testDB';
import { puzzleRouter } from '../../server/api/puzzleRoutes.js';

describe('Puzzles without crypto', () => {
  let ctx: ReturnType<typeof patchGetDB>;
  let base = '';
  let close: () => void;
  let free = 0, chain = 0;

  beforeAll(async () => {
    delete process.env.ENABLE_CRYPTO;
    ctx = patchGetDB();
    ctx.db.exec(`
      CREATE TABLE puzzles (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
        difficulty TEXT DEFAULT 'medium', board_setup TEXT DEFAULT '{}', hand_cards TEXT DEFAULT '[]', solution TEXT DEFAULT '[]',
        prize_card_id TEXT, prize_pool REAL DEFAULT 0, attempt_fee REAL DEFAULT 0, required_cards TEXT DEFAULT '[]',
        published INTEGER DEFAULT 0, solved INTEGER DEFAULT 0, solved_by_id INTEGER, solved_at DATETIME,
        created_by_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, show_required_cards INTEGER DEFAULT 1,
        escrow_tx_hash TEXT, on_chain INTEGER DEFAULT 0);
      CREATE TABLE puzzle_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, puzzle_id INTEGER, player_id INTEGER, placement TEXT,
        correct INTEGER DEFAULT 0, attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP, tx_hash TEXT, wallet_address TEXT);`);
    const admin = createTestPlayer(ctx.db, { displayName: 'Admin' });
    const ins = ctx.db.prepare(`INSERT INTO puzzles (title, solution, published, created_by_id, on_chain, attempt_fee)
                                VALUES (?, ?, 1, ?, ?, ?)`);
    free  = Number(ins.run('Free', JSON.stringify([{ cardId: 'knight', col: 3, row: 2 }]), admin.playerId, 0, 0).lastInsertRowid);
    chain = Number(ins.run('Chain', '[]', admin.playerId, 1, 0.1).lastInsertRowid);
    const app = express(); app.use(express.json()); app.use('/api/puzzles', puzzleRouter);
    const http = createServer(app);
    await new Promise<void>(r => http.listen(0, () => r()));
    base = `http://localhost:${(http.address() as any).port}/api/puzzles`;
    close = () => http.close();
  });
  afterAll(() => { close?.(); ctx.cleanup(); });

  let token = '';
  beforeEach(() => { token = createTestPlayer(ctx.db, { displayName: 'P' + Math.random() }).token; });
  const attempt = (id: number, placement: unknown) => fetch(`${base}/${id}/attempt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ placement }),
  });

  it('lists only off-chain puzzles', async () => {
    const data = await (await fetch(base)).json();
    expect(data.puzzles.map((p: any) => p.title)).toEqual(['Free']);
  });

  it('a wrong off-chain attempt needs no wallet and starts the cooldown', async () => {
    const r1 = await attempt(free, []);
    expect(r1.status).toBe(200);
    expect((await r1.json()).correct).toBe(false);
    expect((await attempt(free, [])).status).toBe(429);
  });

  it('refuses on-chain puzzles while crypto is disabled', async () => {
    expect((await attempt(chain, [])).status).toBe(404);
  });

  it('a correct off-chain attempt solves it', async () => {
    const r = await attempt(free, [{ cardId: 'knight', col: 3, row: 2 }]);
    expect((await r.json()).correct).toBe(true);
  });
});
