// ============================================================
// app.ts
// Server entry point: Express + Socket.io bootstrap.
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/NetworkEvents.js';
import { RoomManager } from './rooms/RoomManager.js';
import { PayoutService } from './game/PayoutService.js';
import { SessionManager } from './game/SessionManager.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

const roomManager = new RoomManager();
const payout = new PayoutService(process.env.FUJI_PRIVATE_KEY!);
const session = new SessionManager(io, roomManager, payout);

io.on('connection', (socket) => {
  console.log(`[Server] Player connected: ${socket.id}`);

  // ── Room events ──
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

    // Broadcast shared shuffle seed
    io.to(roomCode).emit('game_seed', { seed: result.gameSeed! });
  });

  socket.on('registerWallet', ({ roomCode, walletAddress }) => {
    roomManager.registerWallet(socket.id, roomCode, walletAddress);
  });

  // ── Game session events ──
  session.registerHandlers(socket);

  // ── Disconnect ──
  socket.on('disconnect', () => {
    session.handleDisconnect(socket);
  });
});

httpServer.listen(3001, () => {
  console.log('[Server] Socket.io running on port 3001');
});
