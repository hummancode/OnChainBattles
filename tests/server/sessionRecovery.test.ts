/**
 * sessionRecovery.test.ts — server-side support for:
 *  - deck exchange at battle start (both clients must build identical engines)
 *  - draw claims (both Kings destroyed simultaneously)
 *  - state recovery on rejoin (full action log + last accepted seqNum)
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';

function createClient(port: number): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const c = ioClient(`http://localhost:${port}`, { reconnection: false, transports: ['websocket'] });
    c.on('connect', () => resolve(c));
  });
}
function waitFor<T = any>(s: ClientSocket, ev: string): Promise<T> {
  return new Promise((resolve) => s.once(ev, (d: T) => resolve(d)));
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('Session recovery', () => {
  let httpServer: HttpServer;
  let io: Server<ClientToServerEvents, ServerToClientEvents>;
  let rooms: RoomManager;
  let port: number;
  const clients: ClientSocket[] = [];
  let refunds = 0;

  beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    rooms = new RoomManager();
    const payoutStub = {
      payoutWinner: async () => ({ success: true }),
      refundTie: async () => { refunds++; return { success: true }; },
    } as any;
    const session = new SessionManager(io, rooms, payoutStub);
    io.on('connection', (socket) => {
      socket.on('createRoom', ({ roomCode, playerName }) => {
        rooms.createRoom(socket.id, roomCode, playerName);
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerIndex: 0 });
      });
      socket.on('joinRoom', ({ roomCode, playerName }) => {
        const r = rooms.joinRoom(socket.id, roomCode, playerName);
        if (typeof r === 'string') return;
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, playerIndex: 1 });
      });
      socket.on('rejoin_room', ({ roomCode, playerName, guestSessionId }) =>
        session.handleRejoin(socket, roomCode, playerName, guestSessionId));
      session.registerHandlers(socket);
      socket.on('disconnect', () => session.handleDisconnect(socket));
    });
    await new Promise<void>((r) => httpServer.listen(0, () => {
      const a = httpServer.address(); port = typeof a === 'object' && a ? a.port : 0; r();
    }));
  });
  afterEach(() => { for (const c of clients) if (c.connected) c.disconnect(); clients.length = 0; });
  afterAll(() => { rooms.dispose(); io.close(); httpServer.close(); });

  async function startBattle(code: string, decks?: [string[] | null, string[] | null]) {
    const a = await createClient(port); const b = await createClient(port);
    clients.push(a, b);
    const c1 = waitFor(a, 'roomCreated'); a.emit('createRoom', { roomCode: code, playerName: 'Alice' }); await c1;
    const j1 = waitFor(b, 'roomJoined'); b.emit('joinRoom', { roomCode: code, playerName: 'Bob' }); await j1;
    if (decks?.[0]) a.emit('submitDeck', { roomCode: code, deckIds: decks[0] });
    if (decks?.[1]) b.emit('submitDeck', { roomCode: code, deckIds: decks[1] });
    const ra = waitFor(a, 'both_battle_ready'); const rb = waitFor(b, 'both_battle_ready');
    a.emit('player_ready', { roomCode: code }); b.emit('player_ready', { roomCode: code });
    const [readyA, readyB] = await Promise.all([ra, rb]);
    return { a, b, readyA, readyB };
  }

  it('both_battle_ready carries both decks (defaults filled in when none submitted)', async () => {
    const { readyA, readyB } = await startBattle('SR01');
    expect(readyA?.decks).toHaveLength(2);
    expect(readyA.decks[0].length).toBeGreaterThan(0);
    expect(readyA.decks[1].length).toBeGreaterThan(0);
    expect(readyB.decks).toEqual(readyA.decks);
  });

  it('a draw claim (winnerIndex -1) from both players settles the match', async () => {
    const { a, b } = await startBattle('SR02');
    // need MIN_ACTIONS relayed actions first
    let seq = 0;
    for (const t of ['END_PLAY_PHASE', 'END_ACT_PHASE'] as const) a.emit('game_action', { roomCode: 'SR02', action: { type: t, seqNum: ++seq } });
    seq = 0;
    for (const t of ['END_PLAY_PHASE', 'END_ACT_PHASE'] as const) b.emit('game_action', { roomCode: 'SR02', action: { type: t, seqNum: ++seq } });
    await sleep(50);
    a.emit('game_over', { roomCode: 'SR02', winnerIndex: -1, totalTurns: 2 });
    b.emit('game_over', { roomCode: 'SR02', winnerIndex: -1, totalTurns: 2 });
    await sleep(50);
    expect(rooms.getRoom('SR02')?.settled).toBe(true);
  });

  it('rejoinSuccess returns the full ordered action log and last accepted seqNum', async () => {
    const { a, b } = await startBattle('SR03');
    const relayed = waitFor(b, 'opponent_action');
    a.emit('game_action', { roomCode: 'SR03', action: { type: 'PLAY_CARD', handIndex: 0, col: 1, row: 0, seqNum: 1 } });
    await relayed;
    a.emit('game_action', { roomCode: 'SR03', action: { type: 'END_PLAY_PHASE', seqNum: 2 } });
    a.emit('game_action', { roomCode: 'SR03', action: { type: 'END_ACT_PHASE', seqNum: 3 } });
    b.emit('game_action', { roomCode: 'SR03', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    await sleep(50);

    // Alice refreshes the page: socket drops, new socket rejoins
    a.disconnect();
    await sleep(30);
    const a2 = await createClient(port); clients.push(a2);
    const rs = waitFor<any>(a2, 'rejoinSuccess');
    a2.emit('rejoin_room', { roomCode: 'SR03', playerName: 'Alice' });
    const data = await rs;

    expect(data.playerIndex).toBe(0);
    expect(data.lastSeqNum).toBe(3);
    expect(data.decks).toHaveLength(2);
    expect(data.actionLog.map((x: any) => [x.by, x.type])).toEqual([
      [0, 'PLAY_CARD'], [0, 'END_PLAY_PHASE'], [0, 'END_ACT_PHASE'], [1, 'END_PLAY_PHASE'],
    ]);
    expect(data.actionLog.map((x: any) => x.serverSeq)).toEqual([1, 2, 3, 4]);

    // Sequence numbers continue after rejoin (no reset to 0) — seq 4 is accepted
    const toA2 = waitFor<any>(a2, 'opponent_action');
    b.emit('game_action', { roomCode: 'SR03', action: { type: 'END_ACT_PHASE', seqNum: 2 } }); // back to Alice
    await toA2;
    const relayed2 = waitFor<any>(b, 'opponent_action');
    a2.emit('game_action', { roomCode: 'SR03', action: { type: 'END_PLAY_PHASE', seqNum: 4 } });
    expect((await relayed2).type).toBe('END_PLAY_PHASE');
  });
});

describe('player_ready dedupe', () => {
  it('a repeated player_ready from one player does not start the battle alone', async () => {
    const { RoomManager } = await import('../../server/rooms/RoomManager.js');
    const { SessionManager } = await import('../../server/game/SessionManager.js');
    const rooms = new RoomManager();
    const emitted: string[] = [];
    const fakeIo: any = { to: () => ({ emit: (ev: string) => emitted.push(ev) }) };
    const session = new SessionManager(fakeIo, rooms, {} as any);
    rooms.createRoom('sockA', 'DUP1', 'Alice');
    rooms.joinRoom('sockB', 'DUP1', 'Bob');
    const handlers: Record<string, Function> = {};
    const sockA: any = { id: 'sockA', on: (ev: string, fn: Function) => { handlers[ev] = fn; }, to: () => ({ emit: () => {} }) };
    session.registerHandlers(sockA);
    handlers['player_ready']({ roomCode: 'DUP1' });
    handlers['player_ready']({ roomCode: 'DUP1' });
    expect(emitted).not.toContain('both_battle_ready');
    expect(rooms.getRoom('DUP1')!.battleReadyCount).toBe(1);
    rooms.dispose();
  });
});
