/**
 * Server review findings (2026-11-04) — run against the real production handlers
 * (server/net/wireConnection.ts) on a real Socket.IO server.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';
import { LobbyManager } from '../../server/lobby/LobbyManager.js';
import { wireConnection } from '../../server/net/wireConnection.js';

const DECK: string[] = JSON.parse(readFileSync('public/default-deck.json', 'utf8')).deckIds;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const once = <T = any>(s: ClientSocket, ev: string) => new Promise<T>((r) => s.once(ev, r));

describe('Server review findings', () => {
  let http: HttpServer; let io: Server; let rooms: RoomManager; let port = 0;
  const clients: ClientSocket[] = [];
  const connect = () => new Promise<ClientSocket>((r) => {
    const c = ioClient(`http://localhost:${port}`, { reconnection: false, transports: ['websocket'] });
    clients.push(c); c.on('connect', () => r(c));
  });

  beforeAll(async () => {
    http = createServer(); io = new Server(http); rooms = new RoomManager();
    const session = new SessionManager(io as any, rooms, { payoutWinner: async () => ({ success: true }), refundTie: async () => ({ success: true }) } as any);
    const lobby = new LobbyManager(io as any, rooms);
    io.on('connection', (socket: any) => wireConnection(io as any, socket, { rooms, session, lobby }));
    port = await new Promise<number>(r => http.listen(0, () => r((http.address() as any).port)));
  });
  afterEach(() => { clients.forEach(c => c.disconnect()); clients.length = 0; });
  afterAll(() => { rooms.dispose(); io.close(); http.close(); });

  async function legacyBattle(code: string) {
    const a = await connect(), b = await connect();
    const c1 = once(a, 'roomCreated'); a.emit('createRoom', { roomCode: code, playerName: 'Alice' }); await c1;
    const j1 = once(b, 'roomJoined'); b.emit('joinRoom', { roomCode: code, playerName: 'Bob' }); await j1;
    const r = once(a, 'both_battle_ready');
    a.emit('player_ready', { roomCode: code }); b.emit('player_ready', { roomCode: code });
    await r;
    return { a, b };
  }

  async function lobbyBattle() {
    const host = await connect(), guest = await connect();
    const created = once<any>(host, 'lobby:created');
    host.emit('lobby:create', { playerName: 'Host', settings: { isPublic: true, isCrypto: false, roomName: 'R' } });
    const { code } = await created;
    guest.emit('lobby:join', { roomCode: code, playerName: 'Guest' }); await sleep(30);
    guest.emit('lobby:ready', { roomCode: code }); await sleep(20);
    const starting = once(host, 'lobby:submit_decks');
    host.emit('lobby:start_game', { roomCode: code }); await starting;
    const go = once<any>(host, 'lobby:game_starting');
    host.emit('lobby:deck_submitted', { roomCode: code, deckIds: DECK });
    guest.emit('lobby:deck_submitted', { roomCode: code, deckIds: DECK });
    await go;
    const ready = once(host, 'both_battle_ready');
    host.emit('player_ready', { roomCode: code }); guest.emit('player_ready', { roomCode: code });
    await ready;
    return { host, guest, code };
  }

  it('malformed payloads do not crash the server', async () => {
    const { a } = await legacyBattle('RV01');
    (a as any).emit('game_action');                              // no payload at all
    a.emit('game_action', { roomCode: 'RV01' } as any);          // member, no action
    (a as any).emit('player_ready', 'not-an-object');
    (a as any).emit('rejoin_room');
    await sleep(50);
    const c = await connect();
    const ok = once(c, 'roomCreated');
    c.emit('createRoom', { roomCode: 'RV01b', playerName: 'Still alive' });
    await ok;                                                    // server still serving
  });

  it('createRoom cannot overwrite an existing room', async () => {
    await legacyBattle('RV02');
    const before = rooms.getRoom('RV02');
    const evil = await connect();
    const err = once<any>(evil, 'error');
    evil.emit('createRoom', { roomCode: 'RV02', playerName: 'Evil' });
    expect((await err).message).toMatch(/unavailable/i);
    expect(rooms.getRoom('RV02')).toBe(before);
  });

  it('legacy joinRoom respects lobby passwords and never joins a started battle', async () => {
    const host = await connect();
    const created = once<any>(host, 'lobby:created');
    host.emit('lobby:create', { playerName: 'Host', settings: { isPublic: false, isCrypto: false, roomName: 'P', password: 'secret' } });
    const { code } = await created;
    const evil = await connect();
    const err = once<any>(evil, 'error');
    evil.emit('joinRoom', { roomCode: code, playerName: 'Evil' });
    await err;
    expect(rooms.getRoom(code)!.players.map(p => p.name)).toEqual(['Host']);
  });

  it('host cannot kick, restart, or reshuffle seats once the battle started', async () => {
    const { host, guest, code } = await lobbyBattle();
    const room = rooms.getRoom(code)!;
    const seed = (room.simulation as any).seed;
    host.emit('lobby:kick', { roomCode: code, targetPlayerName: 'Guest' });
    host.emit('lobby:start_game', { roomCode: code });
    guest.emit('lobby:join', { roomCode: 'nope', playerName: 'Guest' }); // used to splice Guest out
    host.emit('lobby:leave', { roomCode: code });
    await sleep(80);
    expect(room.players.map(p => p.name)).toEqual(['Host', 'Guest']);
    expect(room.status).toBe('in_progress');
    expect((room.simulation as any).seed).toBe(seed);
    expect(rooms.getRoom(code)).toBe(room);
  });

  it('rejoin sends the seed the server simulation actually uses', async () => {
    const { code } = await lobbyBattle();
    const room = rooms.getRoom(code)!;
    room.gameSeed = 123;                                   // e.g. clobbered by a late joinRoom
    const c = await connect();
    const rs = once<any>(c, 'rejoinSuccess');
    room.players[1].guestSessionId = null;                  // legacy seat → name match allowed
    c.emit('rejoin_room', { roomCode: code, playerName: 'Guest' });
    expect((await rs).gameSeed).toBe((room.simulation as any).seed);
  });

  it('the stale-room sweep keeps a match that is still being played', async () => {
    const { a } = await legacyBattle('RV06');
    const room = rooms.getRoom('RV06')!;
    room.createdAt = Date.now() - 3 * 60 * 60 * 1000;      // created 3h ago…
    a.emit('game_action', { roomCode: 'RV06', action: { type: 'END_PLAY_PHASE', seqNum: 1 } });
    await sleep(30);                                        // …but active right now
    (rooms as any).sweepStaleRooms();
    expect(rooms.getRoom('RV06')).toBe(room);
  });

  it('cryptoReady counts each seated player once', async () => {
    const { a, b } = await legacyBattle('RV07');
    let both = 0;
    a.on('bothCryptoReady', () => both++);
    a.emit('cryptoReady', { roomCode: 'RV07' });
    a.emit('cryptoReady', { roomCode: 'RV07' });          // repeat
    const outsider = await connect();
    outsider.emit('cryptoReady', { roomCode: 'RV07' });   // not seated
    await sleep(60);
    expect(both).toBe(0);
    b.emit('cryptoReady', { roomCode: 'RV07' });
    await sleep(60);
    expect(both).toBe(1);
  });
});
