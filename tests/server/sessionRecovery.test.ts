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

  it('client game_over claims cannot settle a server-authoritative match', async () => {
    const { a, b } = await startBattle('SR02');
    let seq = 0;
    for (const t of ['END_PLAY_PHASE', 'END_ACT_PHASE'] as const) a.emit('game_action', { roomCode: 'SR02', action: { type: t, seqNum: ++seq } });
    seq = 0;
    for (const t of ['END_PLAY_PHASE', 'END_ACT_PHASE'] as const) b.emit('game_action', { roomCode: 'SR02', action: { type: t, seqNum: ++seq } });
    await sleep(50);
    a.emit('game_over', { roomCode: 'SR02', winnerIndex: 0, totalTurns: 2 });
    b.emit('game_over', { roomCode: 'SR02', winnerIndex: 0, totalTurns: 2 });
    await sleep(50);
    expect(rooms.getRoom('SR02')?.settled).toBe(false); // nobody's King died — claims are ignored
  });

  async function kingsFaceToFace(code: string, hp1: number, hp2: number) {
    const battle = await startBattle(code);
    const sim: any = rooms.getRoom(code)!.simulation;
    const board = sim.engineForTests.board;
    const k1 = board.getKing(0), k2 = board.getKing(1);
    board.moveUnit(k1.instanceId, 3, 3); board.moveUnit(k2.instanceId, 3, 4);
    k1.currentDef = hp1; k2.currentDef = hp2;
    battle.a.emit('game_action', { roomCode: code, action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    return battle;
  }

  it('the server engine settles a mutual King kill as a DRAW and tells both clients', async () => {
    const { a, b } = await kingsFaceToFace('SR04', 1, 1);
    const sa = waitFor<any>(a, 'match_settled'); const sb = waitFor<any>(b, 'match_settled');
    a.emit('game_action', { roomCode: 'SR04', action: { type: 'ATTACK_UNIT', fromCol: 3, fromRow: 3, targetCol: 3, targetRow: 4, seqNum: 2 } });
    const [ra, rb] = await Promise.all([sa, sb]);
    expect(ra.winnerIndex).toBe(-1);
    expect(rb.winnerIndex).toBe(-1);
    expect(rooms.getRoom('SR04')?.settled).toBe(true);
  });

  it('the server engine settles a King kill for the attacker', async () => {
    const { a } = await kingsFaceToFace('SR05', 5, 1);
    const sa = waitFor<any>(a, 'match_settled');
    a.emit('game_action', { roomCode: 'SR05', action: { type: 'ATTACK_UNIT', fromCol: 3, fromRow: 3, targetCol: 3, targetRow: 4, seqNum: 2 } });
    expect((await sa).winnerIndex).toBe(0);
  });

  it('an illegal action is not relayed and the sender is told to resync', async () => {
    const { a, b } = await startBattle('SR06');
    let relayed = false;
    b.on('opponent_action', () => { relayed = true; });
    const rs = waitFor<any>(a, 'resync_required');
    // P1 tries to move a unit from an empty square
    a.emit('game_action', { roomCode: 'SR06', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    a.emit('game_action', { roomCode: 'SR06', action: { type: 'MOVE_UNIT', fromCol: 0, fromRow: 2, col: 0, row: 3, seqNum: 2 } });
    expect((await rs).reason).toMatch(/rejected/i);
    await sleep(30);
    // END_PLAY_PHASE was relayed, the illegal move was not
    expect(relayed).toBe(true);
    expect(rooms.getRoom('SR06')!.actionLog.map(x => x.type)).toEqual(['END_PLAY_PHASE']);
  });

  it('acting on the opponent\'s turn is rejected', async () => {
    const { b } = await startBattle('SR07');
    const rs = waitFor<any>(b, 'resync_required');
    b.emit('game_action', { roomCode: 'SR07', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    expect((await rs).reason).toMatch(/turn/);
    expect(rooms.getRoom('SR07')!.actionLog).toHaveLength(0);
  });

  it('a postHash that disagrees with the server engine triggers resync (action still accepted)', async () => {
    const { a } = await startBattle('SR08');
    const rs = waitFor<any>(a, 'resync_required');
    a.emit('game_action', { roomCode: 'SR08', action: { type: 'END_PLAY_PHASE', seqNum: 1, postHash: 'deadbeef' } });
    expect((await rs).reason).toMatch(/mismatch/i);
    const log = rooms.getRoom('SR08')!.actionLog;
    expect(log).toHaveLength(1);
    expect(log[0].postHash).toBeUndefined(); // stripped before storing/relaying
  });

  it('rejoinSuccess returns the full ordered action log and last accepted seqNum', async () => {
    const { a, b } = await startBattle('SR03');
    const relayed = waitFor(b, 'opponent_action');
    a.emit('game_action', { roomCode: 'SR03', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    await relayed;
    a.emit('game_action', { roomCode: 'SR03', action: { type: 'END_ACT_PHASE', seqNum: 2 } });
    await sleep(30);
    b.emit('game_action', { roomCode: 'SR03', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    b.emit('game_action', { roomCode: 'SR03', action: { type: 'END_ACT_PHASE', seqNum: 2 } });
    await sleep(50);

    // Alice refreshes the page: socket drops, new socket rejoins
    a.disconnect();
    await sleep(30);
    const a2 = await createClient(port); clients.push(a2);
    const rs = waitFor<any>(a2, 'rejoinSuccess');
    a2.emit('rejoin_room', { roomCode: 'SR03', playerName: 'Alice' });
    const data = await rs;

    expect(data.playerIndex).toBe(0);
    expect(data.lastSeqNum).toBe(2);
    expect(data.decks).toHaveLength(2);
    expect(data.actionLog.map((x: any) => [x.by, x.type])).toEqual([
      [0, 'END_PLAY_PHASE'], [0, 'END_ACT_PHASE'], [1, 'END_PLAY_PHASE'], [1, 'END_ACT_PHASE'],
    ]);
    expect(data.actionLog.map((x: any) => x.serverSeq)).toEqual([1, 2, 3, 4]);

    // Sequence numbers continue after rejoin (no reset to 0) — seq 3 is accepted, seq 2 would be a replay
    const relayed2 = waitFor<any>(b, 'opponent_action');
    a2.emit('game_action', { roomCode: 'SR03', action: { type: 'END_PLAY_PHASE', seqNum: 2 } }); // dup → dropped
    a2.emit('game_action', { roomCode: 'SR03', action: { type: 'END_PLAY_PHASE', seqNum: 3 } });
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
