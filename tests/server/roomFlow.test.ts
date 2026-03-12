/**
 * roomFlow.test.ts — Server integration tests for room creation,
 * joining, and battle-ready handshake.
 *
 * Spins up a minimal Socket.io server with RoomManager + SessionManager,
 * then connects two socket.io-client instances to verify the full flow.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/types/NetworkEvents.js';

// ─── Helpers ──────────────────────────────────────────────────

/** Create a connected client socket, resolves when 'connect' fires. */
function createClient(port: number): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const client = ioClient(`http://localhost:${port}`, {
      reconnection: false,
      transports: ['websocket'],
    });
    client.on('connect', () => resolve(client));
  });
}

/** Listen for a specific event, resolves with its data. */
function waitForEvent<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (data: T) => resolve(data));
  });
}

// ─── Test suite ───────────────────────────────────────────────

describe('Room flow — create, join, battle ready', () => {
  let httpServer: HttpServer;
  let io: Server<ClientToServerEvents, ServerToClientEvents>;
  let roomManager: RoomManager;
  let port: number;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: '*' },
    });

    roomManager = new RoomManager();

    // Minimal PayoutService stub (not needed for room flow)
    const payoutStub = {
      payoutWinner: async () => ({ success: true }),
      refundTie: async () => ({ success: true }),
    } as any;

    const session = new SessionManager(io, roomManager, payoutStub);

    io.on('connection', (socket) => {
      // Room events (mirrors app.ts)
      socket.on('createRoom', ({ roomCode, playerName }) => {
        roomManager.createRoom(socket.id, roomCode, playerName);
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerIndex: 0 });
      });

      socket.on('joinRoom', ({ roomCode, playerName }) => {
        const result = roomManager.joinRoom(socket.id, roomCode, playerName);
        if (typeof result === 'string') {
          socket.emit('error', { message: result });
          return;
        }
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, playerIndex: 1 });

        const host = result.players[0];
        io.to(host.id).emit('opponentJoined', { playerName, playerIndex: 0 });
        socket.emit('opponentJoined', { playerName: host.name, playerIndex: 1 });

        io.to(roomCode).emit('game_seed', { seed: result.gameSeed! });
      });

      session.registerHandlers(socket);
    });

    // Listen on random available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(() => {
    // Disconnect all clients after each test
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
    clients.length = 0;
  });

  afterAll(async () => {
    roomManager.dispose();
    io.close();
    httpServer.close();
  });

  // ────────────────────────────────────────────────────────────

  it('both players join the same room and receive room codes', async () => {
    const host = await createClient(port);
    const joiner = await createClient(port);
    clients.push(host, joiner);

    const ROOM = 'TEST01';

    // Host creates room
    const roomCreatedP = waitForEvent<{ roomCode: string; playerIndex: number }>(host, 'roomCreated');
    host.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' });
    const created = await roomCreatedP;

    expect(created.roomCode).toBe(ROOM);
    expect(created.playerIndex).toBe(0);

    // Joiner joins with the shared room code
    const roomJoinedP = waitForEvent<{ roomCode: string; playerIndex: number }>(joiner, 'roomJoined');
    const hostSeesOpponentP = waitForEvent<{ playerName: string; playerIndex: number }>(host, 'opponentJoined');
    const joinerSeesOpponentP = waitForEvent<{ playerName: string; playerIndex: number }>(joiner, 'opponentJoined');
    const hostSeedP = waitForEvent<{ seed: number }>(host, 'game_seed');
    const joinerSeedP = waitForEvent<{ seed: number }>(joiner, 'game_seed');

    joiner.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' });

    const [joined, hostOpponent, joinerOpponent, hostSeed, joinerSeed] = await Promise.all([
      roomJoinedP, hostSeesOpponentP, joinerSeesOpponentP, hostSeedP, joinerSeedP,
    ]);

    // Joiner gets correct room info
    expect(joined.roomCode).toBe(ROOM);
    expect(joined.playerIndex).toBe(1);

    // Both see each other's names
    expect(hostOpponent.playerName).toBe('Bob');
    expect(joinerOpponent.playerName).toBe('Alice');

    // Both receive the same game seed
    expect(hostSeed.seed).toBe(joinerSeed.seed);
    expect(typeof hostSeed.seed).toBe('number');
  });

  it('both players signal battle ready and receive both_battle_ready', async () => {
    const host = await createClient(port);
    const joiner = await createClient(port);
    clients.push(host, joiner);

    const ROOM = 'TEST02';

    // Setup: create and join room
    const roomCreatedP = waitForEvent(host, 'roomCreated');
    host.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' });
    await roomCreatedP;

    const roomJoinedP = waitForEvent(joiner, 'roomJoined');
    joiner.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' });
    await roomJoinedP;

    // Both signal battle ready — expect both_battle_ready broadcast
    const hostBattleReadyP = waitForEvent(host, 'both_battle_ready');
    const joinerBattleReadyP = waitForEvent(joiner, 'both_battle_ready');

    host.emit('player_ready', { roomCode: ROOM });
    joiner.emit('player_ready', { roomCode: ROOM });

    // Both should receive the event (with a reasonable timeout)
    await Promise.all([hostBattleReadyP, joinerBattleReadyP]);

    // If we got here without timing out, both players entered battle together
    expect(true).toBe(true);
  });

  it('joining a non-existent room returns an error', async () => {
    const client = await createClient(port);
    clients.push(client);

    const errorP = waitForEvent<{ message: string }>(client, 'error');
    client.emit('joinRoom', { roomCode: 'NONEXISTENT', playerName: 'Eve' });

    const err = await errorP;
    expect(err.message).toContain('Room not found');
  });

  it('third player cannot join a full room', async () => {
    const host = await createClient(port);
    const joiner = await createClient(port);
    const third = await createClient(port);
    clients.push(host, joiner, third);

    const ROOM = 'TEST03';

    host.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' });
    await waitForEvent(host, 'roomCreated');

    joiner.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' });
    await waitForEvent(joiner, 'roomJoined');

    // Third player tries to join
    const errorP = waitForEvent<{ message: string }>(third, 'error');
    third.emit('joinRoom', { roomCode: ROOM, playerName: 'Charlie' });

    const err = await errorP;
    expect(err.message).toContain('full');
  });
});
