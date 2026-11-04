// ============================================================
// wireConnection.ts — every per-socket handler, in one place.
// Used by app.ts and by the integration tests, so tests exercise the
// exact handlers production runs.
//
// hardenSocket() wraps each handler: a malformed payload (missing,
// not an object) is dropped, and a throw inside a handler is logged
// instead of crashing the process (socket.io runs handlers in
// process.nextTick — an uncaught throw there exits Node).
// ============================================================

import type { Server, Socket } from 'socket.io';
import { verifyMessage } from 'ethers';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { SessionManager } from '../game/SessionManager.js';
import type { LobbyManager } from '../lobby/LobbyManager.js';
import { Logger } from '../utils/Logger.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const log = new Logger('Socket');

/** Events that legitimately arrive without an object payload. */
const NO_PAYLOAD = new Set(['disconnect', 'disconnecting', 'error', 'lobby:list']);

export function hardenSocket(socket: TypedSocket): void {
  const rawOn = socket.on.bind(socket) as (ev: string, fn: (...a: any[]) => unknown) => TypedSocket;
  (socket as any).on = (event: string, handler: (...args: any[]) => unknown) =>
    rawOn(event, (...args: any[]) => {
      if (!NO_PAYLOAD.has(event) && (args[0] === null || typeof args[0] !== 'object')) {
        log.warn(`Dropped ${event} from ${socket.id}: payload must be an object`);
        return;
      }
      try {
        const r = handler(...args);
        if (r && typeof (r as Promise<unknown>).catch === 'function') {
          (r as Promise<unknown>).catch(err => log.error(`Handler ${event} rejected:`, err));
        }
      } catch (err) {
        log.error(`Handler ${event} threw (socket ${socket.id}):`, err);
      }
    });
}

export function wireConnection(
  io: TypedServer,
  socket: TypedSocket,
  deps: { rooms: RoomManager; session: SessionManager; lobby: LobbyManager },
): void {
  const { rooms, session, lobby } = deps;
  hardenSocket(socket);

  // ── Room events ──
  socket.on('createRoom', ({ roomCode, playerName, guestSessionId }) => {
    if (typeof roomCode !== 'string' || !roomCode || rooms.getRoom(roomCode)) {
      // Never overwrite a live room (that silently destroyed the match in it)
      socket.emit('error', { message: 'Room code unavailable — try again.' });
      return;
    }
    rooms.createRoom(socket.id, roomCode, playerName, guestSessionId);
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, playerIndex: 0 });
  });

  socket.on('joinRoom', ({ roomCode, playerName, guestSessionId }) => {
    const result = rooms.joinRoom(socket.id, roomCode, playerName, guestSessionId);
    if (typeof result === 'string') {
      socket.emit('error', { message: result });
      return;
    }
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, playerIndex: 1 });

    const host = result.players[0];
    io.to(host.id).emit('opponentJoined', { playerName, playerIndex: 0 });
    socket.emit('opponentJoined', { playerName: host.name, playerIndex: 1 });

    // Broadcast shared shuffle seed
    io.to(roomCode).emit('game_seed', { seed: result.gameSeed! });
  });

  socket.on('registerWallet', ({ roomCode, walletAddress, message, signature }) => {
    // Verify signature proves ownership of claimed wallet
    try {
      const recovered = verifyMessage(message, signature);
      if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        console.warn(`[Server] Wallet verification failed: claimed ${walletAddress}, recovered ${recovered}`);
        socket.emit('error', { message: 'Wallet verification failed' });
        return;
      }
      if (!message.includes(roomCode)) {
        console.warn(`[Server] Wallet verification: message doesn't contain roomCode`);
        socket.emit('error', { message: 'Invalid verification message' });
        return;
      }
      // Only accept registerWallet once per player
      const room = rooms.getRoom(roomCode);
      const player = room?.players.find(p => p.id === socket.id);
      if (player?.wallet) {
        console.warn(`[Server] Wallet already registered for ${player.name}, ignoring re-registration`);
        return;
      }
      rooms.registerWallet(socket.id, roomCode, walletAddress);
    } catch (err) {
      console.error(`[Server] Wallet verification error:`, err);
      socket.emit('error', { message: 'Wallet verification failed' });
    }
  });

  // ── Rejoin after disconnect ──
  socket.on('rejoin_room', ({ roomCode, playerName, guestSessionId, token }) => {
    session.handleRejoin(socket, roomCode, playerName, guestSessionId, token);
  });

  // ── Game session events ──
  session.registerHandlers(socket);

  // ── Lobby events ──
  lobby.registerHandlers(socket);

  // ── Disconnect ──
  socket.on('disconnect', () => {
    lobby.handleLobbyDisconnect(socket);
    session.handleDisconnect(socket);
  });
}
