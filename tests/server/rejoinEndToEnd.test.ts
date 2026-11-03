/**
 * End-to-end: real Socket.IO server + two real GameEngines.
 * Players exchange actions through the server for several turns, then P2
 * "refreshes the page" — it rebuilds its engine purely from rejoinSuccess
 * (server decks + action log). The rebuilt state must match P1's exactly,
 * and play must continue normally afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';
import { GameEngine } from '../../src/game/GameEngine';
import GameState from '../../src/GameState';
import { applyAction, replayLog } from '../../src/network/ActionApplier';
import { getCard } from '../../src/game/data/CardRegistry';
import type { GameAction, RejoinPayload } from '../../shared/types/NetworkEvents.js';
import '../engine/helpers/TestHarness';

const connect = (port: number) => new Promise<ClientSocket>((r) => {
  const c = ioClient(`http://localhost:${port}`, { reconnection: false, transports: ['websocket'] });
  c.on('connect', () => r(c));
});
const once = <T = any>(s: ClientSocket, ev: string) => new Promise<T>((r) => s.once(ev, r));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

import { readFileSync } from 'fs';
import { UNITS_ONLY_DECK_IDS } from '../../src/game/data/DeckDefinitions';
// Two DIFFERENT valid decks — the exact case that used to desync (each client loaded its own deck for both players)
const DECK_P1: string[] = JSON.parse(readFileSync('public/default-deck.json', 'utf8')).deckIds;
const DECK_P2: string[] = [...UNITS_ONLY_DECK_IDS];

function fingerprint(e: GameEngine): string {
  const s = e.getState();
  return JSON.stringify({
    t: s.turn.turnNumber, a: s.turn.activePlayer, p: s.turn.phase, st: s.status,
    hands: s.players.map(p => p.hand), decks: s.players.map(p => p.deckCount),
    leg: s.modifiers.map(m => m.legPool),
    board: s.board.filter(c => c.unit).map(c => [c.col, c.row, c.unit!.instanceId, c.unit!.currentDef, c.unit!.currentAtk]),
  });
}

describe('Rejoin end-to-end', () => {
  let http: HttpServer; let io: Server; let rooms: RoomManager; let port = 0;

  beforeAll(async () => {
    http = createServer(); io = new Server(http); rooms = new RoomManager();
    const session = new SessionManager(io as any, rooms, {} as any);
    io.on('connection', (socket: any) => {
      socket.on('createRoom', ({ roomCode, playerName }: any) => { rooms.createRoom(socket.id, roomCode, playerName); socket.join(roomCode); socket.emit('roomCreated', { roomCode, playerIndex: 0 }); });
      socket.on('joinRoom', ({ roomCode, playerName }: any) => { rooms.joinRoom(socket.id, roomCode, playerName); socket.join(roomCode); socket.emit('roomJoined', { roomCode, playerIndex: 1 }); });
      socket.on('rejoin_room', ({ roomCode, playerName }: any) => session.handleRejoin(socket, roomCode, playerName));
      session.registerHandlers(socket);
      socket.on('disconnect', () => session.handleDisconnect(socket));
    });
    await new Promise<void>(r => http.listen(0, () => { port = (http.address() as any).port; r(); }));
  });
  afterAll(() => { rooms.dispose(); io.close(); http.close(); });

  it('refreshed player rebuilds an identical engine and play continues', async () => {
    const ROOM = 'E2E01';
    const a = await connect(port); const b = await connect(port);
    const c = once(a, 'roomCreated'); a.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' }); await c;
    const j = once(b, 'roomJoined'); b.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' }); await j;
    a.emit('submitDeck', { roomCode: ROOM, deckIds: DECK_P1 });
    b.emit('submitDeck', { roomCode: ROOM, deckIds: DECK_P2 });
    const seed = rooms.getRoom(ROOM)!.gameSeed!;
    const ra = once<any>(a, 'both_battle_ready'); const rb = once<any>(b, 'both_battle_ready');
    a.emit('player_ready', { roomCode: ROOM }); b.emit('player_ready', { roomCode: ROOM });
    const [{ decks }] = await Promise.all([ra, rb]);
    expect(decks).toEqual([DECK_P1, DECK_P2]);
    expect(DECK_P1).not.toEqual(DECK_P2);

    GameState.gameSeed = seed;
    const engines = [new GameEngine(), new GameEngine()];
    engines.forEach(e => e.startGame(decks));
    const sockets = [a, b];
    const seq = [0, 0];

    // Each engine applies the opponent's relayed actions
    const listen = (i: number, s: ClientSocket) => s.on('opponent_action', (act: GameAction) => applyAction(engines[i], act));
    listen(0, a); listen(1, b);

    // A player acts locally then sends (exactly like InputCoordinator)
    const act = async (i: number, action: GameAction) => {
      expect(applyAction(engines[i], action)).toBe(true);
      sockets[i].emit('game_action', { roomCode: ROOM, action: { ...action, seqNum: ++seq[i] } });
      await sleep(15);
    };
    const playTurn = async () => {
      const i = engines[0].getState().turn.activePlayer;
      const st = engines[i].getState();
      const pos = engines[i].getValidDeployPositions()[0];
      const idx = st.players[i].hand.findIndex(id => getCard(id).cost <= st.modifiers[i].legPool);
      if (pos && idx >= 0) await act(i, { type: 'PLAY_CARD', handIndex: idx, col: pos.col, row: pos.row });
      await act(i, { type: 'END_PLAY_PHASE' });
      await act(i, { type: 'END_ACT_PHASE' });
    };

    for (let t = 0; t < 7; t++) await playTurn();
    expect(fingerprint(engines[1])).toBe(fingerprint(engines[0]));

    // ── Bob refreshes the page ──
    b.disconnect();
    await sleep(30);
    const b2 = await connect(port);
    const rs = once<RejoinPayload>(b2, 'rejoinSuccess');
    b2.emit('rejoin_room', { roomCode: ROOM, playerName: 'Bob' });
    const payload = await rs;
    expect(payload.battleStarted).toBe(true);

    GameState.gameSeed = payload.gameSeed;
    const rebuilt = new GameEngine();
    rebuilt.startGame(payload.decks!);
    expect(replayLog(rebuilt, payload.actionLog)).toBe(payload.actionLog.length);
    expect(fingerprint(rebuilt)).toBe(fingerprint(engines[0]));

    // ── Play continues with the rebuilt engine ──
    engines[1] = rebuilt; sockets[1] = b2; seq[1] = payload.lastSeqNum;
    listen(1, b2);
    for (let t = 0; t < 3; t++) await playTurn();
    expect(fingerprint(engines[1])).toBe(fingerprint(engines[0]));

    a.disconnect(); b2.disconnect();
  });
});
