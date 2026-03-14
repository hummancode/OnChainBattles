// ============================================================
// app.ts
// Server entry point: Express + Socket.io bootstrap.
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { verifyMessage } from 'ethers';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/NetworkEvents.js';
import { RoomManager } from './rooms/RoomManager.js';
import { PayoutService } from './game/PayoutService.js';
import { SessionManager } from './game/SessionManager.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [/^http:\/\/localhost:\d+$/];

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: allowedOrigins },
});

const roomManager = new RoomManager();
const payout = new PayoutService(process.env.FUJI_PRIVATE_KEY!);
const session = new SessionManager(io, roomManager, payout);

// ── Per-socket rate limiter ──
const RATE_WINDOW_MS = 1_000;
const RATE_MAX_EVENTS = 30; // max events per second per socket

interface RateData { count: number; windowStart: number }
const rateLimitMap = new WeakMap<object, RateData>();

function rateLimited(socket: ReturnType<typeof io['sockets']['sockets']['get']>): boolean {
  const now = Date.now();
  let data = rateLimitMap.get(socket!);
  if (!data) {
    data = { count: 0, windowStart: now };
    rateLimitMap.set(socket!, data);
  }
  if (now - data.windowStart > RATE_WINDOW_MS) {
    data.count = 0;
    data.windowStart = now;
  }
  data.count += 1;
  if (data.count > RATE_MAX_EVENTS) {
    console.warn(`[Server] Rate limit exceeded for ${socket!.id}`);
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  console.log(`[Server] Player connected: ${socket.id}`);

  // Rate-limit middleware: intercept all incoming events
  socket.use((_event, next) => {
    if (rateLimited(socket)) {
      return next(new Error('Rate limit exceeded'));
    }
    next();
  });

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
      const room = roomManager.getRoom(roomCode);
      const player = room?.players.find(p => p.id === socket.id);
      if (player?.wallet) {
        console.warn(`[Server] Wallet already registered for ${player.name}, ignoring re-registration`);
        return;
      }
      roomManager.registerWallet(socket.id, roomCode, walletAddress);
    } catch (err) {
      console.error(`[Server] Wallet verification error:`, err);
      socket.emit('error', { message: 'Wallet verification failed' });
    }
  });

  // ── Rejoin after disconnect ──
  socket.on('rejoin_room', ({ roomCode, playerName }) => {
    session.handleRejoin(socket, roomCode, playerName);
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
