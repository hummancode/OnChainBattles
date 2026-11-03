/**
 * matchStore.test.ts — matches survive a server restart (Roadmap 3.1).
 *
 * Server #1 runs a match, then is shut down completely. Server #2 starts with a fresh
 * RoomManager/SessionManager but the same SQLite DB. Both players rejoin, the room +
 * authoritative simulation are rebuilt from disk, and play continues.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';
import { MatchStore } from '../../server/game/MatchStore.js';
import { MatchSimulation } from '../../server/game/MatchSimulation.js';
import { UNITS_ONLY_DECK_IDS } from '../../src/game/data/DeckDefinitions';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const once = <T = any>(s: ClientSocket, ev: string) => new Promise<T>((r) => s.once(ev, r));

interface TestServer { port: number; rooms: RoomManager; session: SessionManager; close: () => Promise<void> }

async function startServer(store: MatchStore): Promise<TestServer> {
  const http: HttpServer = createServer();
  const io = new Server(http);
  const rooms = new RoomManager();
  const session = new SessionManager(io as any, rooms, { payoutWinner: async () => ({ success: true }), refundTie: async () => ({ success: true }) } as any);
  session.hooks.onActionCommitted = (c, r) => store.save(c, r);
  session.hooks.onSettled = (c, r, res) => { store.saveReplay(c, r, res); store.remove(c); };
  session.hooks.onRoomClosed = (c) => store.remove(c);
  session.hooks.restoreRoom = (c) => store.load(c);
  io.on('connection', (socket: any) => {
    socket.on('createRoom', ({ roomCode, playerName }: any) => { rooms.createRoom(socket.id, roomCode, playerName); socket.join(roomCode); socket.emit('roomCreated', { roomCode, playerIndex: 0 }); });
    socket.on('joinRoom', ({ roomCode, playerName }: any) => { rooms.joinRoom(socket.id, roomCode, playerName); socket.join(roomCode); socket.emit('roomJoined', { roomCode, playerIndex: 1 }); });
    socket.on('rejoin_room', ({ roomCode, playerName }: any) => session.handleRejoin(socket, roomCode, playerName));
    session.registerHandlers(socket);
    socket.on('disconnect', () => session.handleDisconnect(socket));
  });
  const port = await new Promise<number>(r => http.listen(0, () => r((http.address() as any).port)));
  return {
    port, rooms, session,
    close: async () => {
      // Simulate a crash/restart: drop in-memory state without settling anything.
      for (const code of [...(rooms as any).rooms.keys()]) {
        const room = rooms.getRoom(code)!;
        room.disconnectTimers.forEach(t => clearTimeout(t));
        room.disconnectIntervals.forEach(t => clearInterval(t));
      }
      rooms.dispose(); io.close(); http.close();
    },
  };
}
const connect = (port: number) => new Promise<ClientSocket>((r) => {
  const c = ioClient(`http://localhost:${port}`, { reconnection: false, transports: ['websocket'] });
  c.on('connect', () => r(c));
});

async function startMatch(srv: TestServer, code: string) {
  const a = await connect(srv.port); const b = await connect(srv.port);
  const c1 = once(a, 'roomCreated'); a.emit('createRoom', { roomCode: code, playerName: 'Alice' }); await c1;
  const j1 = once(b, 'roomJoined'); b.emit('joinRoom', { roomCode: code, playerName: 'Bob' }); await j1;
  const ra = once(a, 'both_battle_ready');
  a.emit('player_ready', { roomCode: code }); b.emit('player_ready', { roomCode: code });
  await ra;
  return { a, b };
}

const servers: TestServer[] = [];
const sockets: ClientSocket[] = [];
afterEach(async () => {
  sockets.forEach(s => s.connected && s.disconnect()); sockets.length = 0;
  for (const s of servers) await s.close(); servers.length = 0;
  SessionManager.GRACE_PERIOD_MS = 30_000;
});

describe('MatchStore — server restart', () => {
  it('rebuilds the room + authoritative engine from disk and play continues', async () => {
    const store = new MatchStore(new Database(':memory:'));
    const s1 = await startServer(store); servers.push(s1);
    const { a, b } = await startMatch(s1, 'MS01');
    sockets.push(a, b);
    a.emit('game_action', { roomCode: 'MS01', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    a.emit('game_action', { roomCode: 'MS01', action: { type: 'END_ACT_PHASE', seqNum: 2 } });
    await sleep(40);
    b.emit('game_action', { roomCode: 'MS01', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    await sleep(40);
    const hashBefore = (s1.rooms.getRoom('MS01')!.simulation as any).hash();

    // ── crash ──
    a.disconnect(); b.disconnect();
    await s1.close(); servers.length = 0;

    const s2 = await startServer(store); servers.push(s2);
    expect(s2.rooms.getRoom('MS01')).toBeUndefined();

    const b2 = await connect(s2.port); sockets.push(b2);
    const rb = once<any>(b2, 'rejoinSuccess');
    b2.emit('rejoin_room', { roomCode: 'MS01', playerName: 'Bob' });
    const payload = await rb;
    expect(payload.playerIndex).toBe(1);
    expect(payload.actionLog.map((x: any) => x.type)).toEqual(['END_PLAY_PHASE', 'END_ACT_PHASE', 'END_PLAY_PHASE']);
    expect(payload.lastSeqNum).toBe(1);
    expect((s2.rooms.getRoom('MS01')!.simulation as any).hash()).toBe(hashBefore);

    const a2 = await connect(s2.port); sockets.push(a2);
    const ra = once<any>(a2, 'rejoinSuccess');
    a2.emit('rejoin_room', { roomCode: 'MS01', playerName: 'Alice' });
    expect((await ra).playerIndex).toBe(0);

    // Bob (P2, in ACT) ends his turn on the NEW server — validated by the rebuilt engine
    const relayed = once<any>(a2, 'opponent_action');
    b2.emit('game_action', { roomCode: 'MS01', action: { type: 'END_ACT_PHASE', seqNum: 2 } });
    expect((await relayed).type).toBe('END_ACT_PHASE');
    expect((s2.rooms.getRoom('MS01')!.simulation as any).activePlayer).toBe(0);
    // Grace timers were cancelled for both returning players
    expect(s2.rooms.getRoom('MS01')!.disconnectTimers.size).toBe(0);
  });

  it('consecutive-timeout strikes survive a restart', () => {
    const store = new MatchStore(new Database(':memory:'));
    const rm = new RoomManager();
    const room = rm.createRoom('x', 'MS04', 'Alice'); rm.joinRoom('y', 'MS04', 'Bob');
    room.simulation = new MatchSimulation(room.gameSeed ?? 1, [UNITS_ONLY_DECK_IDS, UNITS_ONLY_DECK_IDS]);
    room.battleReadyCount = 2;
    room.timeouts = [2, 1];
    store.save('MS04', room);
    expect(store.load('MS04')!.timeouts).toEqual([2, 1]);
    rm.dispose();
  });

  it('a settled match is removed from active_matches and kept as a replay', async () => {
    const store = new MatchStore(new Database(':memory:'));
    const s1 = await startServer(store); servers.push(s1);
    const { a, b } = await startMatch(s1, 'MS02');
    sockets.push(a, b);
    const sim: any = s1.rooms.getRoom('MS02')!.simulation;
    const board = sim.engineForTests.board;
    const k1 = board.getKing(0), k2 = board.getKing(1);
    board.moveUnit(k1.instanceId, 3, 3); board.moveUnit(k2.instanceId, 3, 4);
    k2.currentDef = 1;
    a.emit('game_action', { roomCode: 'MS02', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    const settled = once<any>(b, 'match_settled');
    a.emit('game_action', { roomCode: 'MS02', action: { type: 'ATTACK_UNIT', fromCol: 3, fromRow: 3, targetCol: 3, targetRow: 4, seqNum: 2 } });
    expect((await settled).winnerIndex).toBe(0);
    await sleep(20);
    expect(store.load('MS02')).toBeNull();
    const replay = store.getReplay('MS02')!;
    expect(replay.actionLog.map(x => x.type)).toEqual(['END_PLAY_PHASE', 'ATTACK_UNIT']);
    expect(replay.winnerIndex).toBe(0);
    expect(replay.playerNames).toEqual(['Alice', 'Bob']);
  });

  it('if only one player comes back after a restart, the absent one forfeits after the grace period', async () => {
    SessionManager.GRACE_PERIOD_MS = 250;
    const store = new MatchStore(new Database(':memory:'));
    const s1 = await startServer(store); servers.push(s1);
    const { a, b } = await startMatch(s1, 'MS03');
    a.emit('game_action', { roomCode: 'MS03', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    await sleep(30);
    a.disconnect(); b.disconnect();
    await s1.close(); servers.length = 0;

    const s2 = await startServer(store); servers.push(s2);
    const a2 = await connect(s2.port); sockets.push(a2);
    const rs = once(a2, 'rejoinSuccess');
    a2.emit('rejoin_room', { roomCode: 'MS03', playerName: 'Alice' });
    await rs;
    const settled = once<any>(a2, 'match_settled');
    const r = await settled;
    expect(r.winnerIndex).toBe(0);
    expect(r.reason).toBe('DISCONNECT');
    await sleep(20);
    expect(s2.rooms.getRoom('MS03')).toBeUndefined();
    expect(store.load('MS03')).toBeNull();
  });
});
