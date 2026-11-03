/**
 * turnTimer.test.ts — AFK protection (Roadmap 3.3).
 * When a turn's time runs out the server resolves any pending interaction and ends the
 * player's phases itself (broadcast to BOTH clients). Three consecutive timeouts forfeit.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';

const once = <T = any>(s: ClientSocket, ev: string) => new Promise<T>((r) => s.once(ev, r));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const connect = (port: number) => new Promise<ClientSocket>((r) => {
  const c = ioClient(`http://localhost:${port}`, { reconnection: false, transports: ['websocket'] });
  c.on('connect', () => r(c));
});

describe('Turn timer', () => {
  let http: HttpServer; let io: Server; let rooms: RoomManager; let port = 0;
  const clients: ClientSocket[] = [];
  beforeAll(async () => {
    http = createServer(); io = new Server(http); rooms = new RoomManager();
    const session = new SessionManager(io as any, rooms, {} as any);
    io.on('connection', (socket: any) => {
      socket.on('createRoom', ({ roomCode, playerName }: any) => { rooms.createRoom(socket.id, roomCode, playerName); socket.join(roomCode); socket.emit('roomCreated', { roomCode, playerIndex: 0 }); });
      socket.on('joinRoom', ({ roomCode, playerName }: any) => { rooms.joinRoom(socket.id, roomCode, playerName); socket.join(roomCode); socket.emit('roomJoined', { roomCode, playerIndex: 1 }); });
      socket.on('rejoin_room', ({ roomCode, playerName }: any) => session.handleRejoin(socket, roomCode, playerName));
      session.registerHandlers(socket);
    });
    port = await new Promise<number>(r => http.listen(0, () => r((http.address() as any).port)));
  });
  afterEach(() => { clients.forEach(c => c.disconnect()); clients.length = 0; SessionManager.TURN_TIME_MS = 90_000; });
  afterAll(() => { rooms.dispose(); io.close(); http.close(); });

  async function start(code: string) {
    const a = await connect(port); const b = await connect(port); clients.push(a, b);
    const c = once(a, 'roomCreated'); a.emit('createRoom', { roomCode: code, playerName: 'Alice' }); await c;
    const j = once(b, 'roomJoined'); b.emit('joinRoom', { roomCode: code, playerName: 'Bob' }); await j;
    const timerA = once<any>(a, 'turn_timer'); const timerB = once<any>(b, 'turn_timer');
    a.emit('player_ready', { roomCode: code }); b.emit('player_ready', { roomCode: code });
    const [firstTimer] = await Promise.all([timerA, timerB]);
    return { a, b, firstTimer };
  }

  it('announces the turn deadline and auto-ends an idle player\'s turn for both clients', async () => {
    SessionManager.TURN_TIME_MS = 150;
    const { a, b, firstTimer } = await start('TT01');
    expect(firstTimer.activePlayer).toBe(0);
    expect(firstTimer.remainingMs).toBeGreaterThan(0);

    const toA: any[] = []; const toB: any[] = [];
    a.on('opponent_action', x => toA.push(x)); b.on('opponent_action', x => toB.push(x));
    const nextTimer = once<any>(b, 'turn_timer');
    expect((await nextTimer).activePlayer).toBe(1);
    await sleep(20);
    // Server-generated, sent to BOTH (the idle player's own client must apply them too)
    expect(toA.map(x => [x.type, x.by, x.auto])).toEqual([['END_PLAY_PHASE', 0, true], ['END_ACT_PHASE', 0, true]]);
    expect(toB.map(x => x.type)).toEqual(['END_PLAY_PHASE', 'END_ACT_PHASE']);
  });

  it('acting within the time keeps the turn alive; a turn change restarts the clock', async () => {
    SessionManager.TURN_TIME_MS = 300;
    const { a, b } = await start('TT02');
    await sleep(100);
    a.emit('game_action', { roomCode: 'TT02', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    const t = once<any>(b, 'turn_timer');
    a.emit('game_action', { roomCode: 'TT02', action: { type: 'END_ACT_PHASE', seqNum: 2 } });
    const timer = await t;
    expect(timer.activePlayer).toBe(1);
    expect(timer.remainingMs).toBeGreaterThan(250); // fresh full turn for Bob
  });

  it('three consecutive timeouts forfeit the match', async () => {
    SessionManager.TURN_TIME_MS = 60;
    const { a } = await start('TT03');
    const settled = await once<any>(a, 'match_settled');
    // P1 times out on turns 1, 2, 3 (P2 also idles, but P1 reaches 3 first)
    expect(settled.reason).toBe('TIMEOUT');
    expect(settled.winnerIndex).toBe(1);
    expect(rooms.getRoom('TT03')!.settled).toBe(true);
  });

  it('a rejoining client is told how much of the current turn is left', async () => {
    SessionManager.TURN_TIME_MS = 2000;
    await start('TT04');
    await sleep(300);
    const c = await connect(port); clients.push(c);
    const t = once<any>(c, 'turn_timer');
    c.emit('rejoin_room', { roomCode: 'TT04', playerName: 'Bob' });
    const timer = await t;
    expect(timer.activePlayer).toBe(0);
    expect(timer.remainingMs).toBeLessThan(1800);
    expect(timer.remainingMs).toBeGreaterThan(1000);
  });
});
