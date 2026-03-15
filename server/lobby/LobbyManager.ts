// ============================================================
// LobbyManager.ts
// Handles all lobby: namespaced socket events.
// Same pattern as SessionManager — registered per socket.
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, Room } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import { createLobbyRoom } from './lobbyHelpers.js';
import { sanitizeText } from '../utils/sanitize.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// Per-socket chat rate limiter
const chatRateMap = new WeakMap<TypedSocket, number[]>();
const CHAT_RATE_WINDOW = 2000;
const CHAT_RATE_MAX = 3;
const MAX_CHAT_LENGTH = 200;

export class LobbyManager {
  constructor(
    private io: TypedServer,
    private rooms: RoomManager
  ) {}

  registerHandlers(socket: TypedSocket): void {
    socket.on('lobby:create', ({ playerName, settings }) => {
      // Look up playerId BEFORE removing from rooms
      const found = this.rooms.findBySocket(socket.id);
      const playerId = found?.room.players.find(p => p.id === socket.id)?.playerId ?? null;

      this.rooms.removeFromAllRooms(socket.id);
      const code = this.rooms.generateUniqueCode();
      const room = createLobbyRoom(socket.id, playerName, playerId, settings);
      this.rooms.setRoom(code, room);
      socket.join(code);
      socket.emit('lobby:created', { code });
      this.emitState(code);
      console.log(`[Lobby] Room ${code} created by ${playerName}`);
    });

    socket.on('lobby:join', ({ roomCode, playerName, password }) => {
      this.rooms.removeFromAllRooms(socket.id);
      const room = this.rooms.getRoom(roomCode);
      if (!room) { socket.emit('lobby:error', { message: 'Room not found.' }); return; }
      if (room.status !== 'waiting') { socket.emit('lobby:error', { message: 'Room not accepting players.' }); return; }
      if (room.players.length >= (room.settings?.maxPlayers ?? 2)) { socket.emit('lobby:error', { message: 'Room is full.' }); return; }
      if (room.settings?.password && room.settings.password !== password) {
        socket.emit('lobby:password_required', { roomCode });
        return;
      }

      room.players.push({
        id: socket.id, name: playerName, wallet: null,
        playerId: null, deckIds: null, ready: false,
      });
      if (room.players.length >= (room.settings?.maxPlayers ?? 2)) {
        room.status = 'full';
      }
      socket.join(roomCode);
      socket.emit('lobby:joined', { code: roomCode });
      this.emitState(roomCode);
      this.emitSystem(roomCode, `${playerName} joined the room.`);
    });

    socket.on('lobby:leave', ({ roomCode }) => {
      this.handleLeave(socket, roomCode);
    });

    socket.on('lobby:list', () => {
      socket.emit('lobby:room_list', { rooms: this.rooms.getPublicRooms() });
    });

    socket.on('lobby:request_state', ({ roomCode }) => {
      const state = this.rooms.getLobbyState(roomCode);
      if (state) socket.emit('lobby:state', state);
    });

    socket.on('lobby:chat', ({ roomCode, text }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // Rate limit
      const timestamps = chatRateMap.get(socket) ?? [];
      const now = Date.now();
      const recent = timestamps.filter(t => now - t < CHAT_RATE_WINDOW);
      if (recent.length >= CHAT_RATE_MAX) {
        socket.emit('lobby:error', { message: 'Slow down — too many messages.' });
        return;
      }
      recent.push(now);
      chatRateMap.set(socket, recent);

      const clean = sanitizeText(text, MAX_CHAT_LENGTH);
      if (!clean) return;

      const msg = { sender: player.name, text: clean, timestamp: now };
      room.chat = room.chat ?? [];
      room.chat.push(msg);
      if (room.chat.length > 100) room.chat = room.chat.slice(-100);
      this.io.to(roomCode).emit('lobby:chat_message', msg);
    });

    socket.on('lobby:ready', ({ roomCode }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (player) player.ready = !(player.ready ?? false);
      this.emitState(roomCode);
    });

    socket.on('lobby:kick', ({ roomCode, targetPlayerName }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room || room.hostSocketId !== socket.id) return;
      const idx = room.players.findIndex(p => p.name === targetPlayerName && p.id !== room.hostSocketId);
      if (idx === -1) return;

      const target = room.players.splice(idx, 1)[0];
      this.io.to(target.id).emit('lobby:kicked', { reason: 'Removed by host.' });
      const targetSocket = this.io.sockets.sockets.get(target.id);
      targetSocket?.leave(roomCode);
      if (room.status === 'full') room.status = 'waiting';
      this.emitState(roomCode);
      this.emitSystem(roomCode, `${target.name} was removed.`);
    });

    socket.on('lobby:settings', ({ roomCode, settings }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room || room.hostSocketId !== socket.id || room.status !== 'waiting') return;
      if (room.settings) {
        if (typeof settings.isPublic === 'boolean') room.settings.isPublic = settings.isPublic;
        if (typeof settings.roomName === 'string') room.settings.roomName = sanitizeText(settings.roomName, 40) || room.settings.roomName;
        if (typeof settings.isCrypto === 'boolean') room.settings.isCrypto = settings.isCrypto;
        if (typeof settings.stakeAmount === 'number') room.settings.stakeAmount = settings.stakeAmount;
      }
      this.emitState(roomCode);
    });

    socket.on('lobby:start_game', ({ roomCode }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room || room.hostSocketId !== socket.id) {
        socket.emit('lobby:error', { message: 'Only the host can start.' }); return;
      }
      if (room.players.length < 2) {
        socket.emit('lobby:error', { message: 'Need 2 players.' }); return;
      }
      const allReady = room.players.filter(p => p.id !== room.hostSocketId).every(p => p.ready);
      if (!allReady) {
        socket.emit('lobby:error', { message: 'All players must be ready.' }); return;
      }

      if (room.settings?.isCrypto) {
        room.status = 'depositing';
        room.cryptoReadyCount = 0;
        this.emitState(roomCode);
        this.io.to(roomCode).emit('lobby:deposit_phase', { stakeAmount: room.settings.stakeAmount });
        return;
      }

      this.launchGame(roomCode, room);
    });

    socket.on('lobby:crypto_ready', ({ roomCode }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room || room.status !== 'depositing') return;
      // Dedup: prevent same player from incrementing twice
      const player = room.players.find(p => p.id === socket.id);
      if (!player || (player as any)._cryptoReady) return;
      (player as any)._cryptoReady = true;

      room.cryptoReadyCount += 1;
      if (room.cryptoReadyCount === 1) {
        socket.to(roomCode).emit('lobby:opponent_deposited');
      } else if (room.cryptoReadyCount >= 2) {
        this.io.to(roomCode).emit('lobby:both_deposited');
        setTimeout(() => this.launchGame(roomCode, room), 1000);
      }
    });

    socket.on('lobby:deck_submitted', ({ roomCode, deckIds }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room || room.status !== 'starting') return;
      const player = room.players.find(p => p.id === socket.id);
      if (player) player.deckIds = deckIds;
      if (room.players.every(p => p.deckIds)) {
        this.finalizeLaunch(roomCode, room);
      }
    });
  }

  /** Handle lobby-phase disconnects (waiting/full/depositing only). */
  handleLobbyDisconnect(socket: TypedSocket): void {
    const found = this.rooms.findBySocket(socket.id);
    if (!found) return;
    const { roomCode, room } = found;
    if (room.status === 'waiting' || room.status === 'full' || room.status === 'depositing') {
      this.handleLeave(socket, roomCode);
    }
    // in_progress disconnects are handled by SessionManager
  }

  // ─── Private Helpers ─────────────────────────────────────

  private launchGame(roomCode: string, room: Room): void {
    room.status = 'starting';
    this.io.to(roomCode).emit('lobby:submit_decks');
    this.emitState(roomCode);

    // Timeout: if decks don't arrive in 10s, launch anyway
    setTimeout(() => {
      if (room.status === 'starting') this.finalizeLaunch(roomCode, room);
    }, 10000);
  }

  private finalizeLaunch(roomCode: string, room: Room): void {
    if (room.status === 'in_progress') return;
    room.status = 'in_progress';

    const seed = Math.floor(Math.random() * 999999);
    room.gameSeed = seed;

    this.io.to(roomCode).emit('lobby:game_starting', {
      seed,
      players: room.players.map((p, i) => ({
        name: p.name, playerIndex: i, isHost: p.id === room.hostSocketId,
      })),
    });

    // Legacy events for BattleScene backward compatibility
    this.io.to(roomCode).emit('game_seed', { seed });
    room.players.forEach((p, i) => {
      const oppIdx = i === 0 ? 1 : 0;
      this.io.to(p.id).emit('roomCreated', { roomCode, playerIndex: i });
      this.io.to(p.id).emit('opponentJoined', {
        playerName: room.players[oppIdx].name, playerIndex: i,
      });
    });

    console.log(`[Lobby] Game launched in ${roomCode}, seed: ${seed}`);
  }

  private handleLeave(socket: TypedSocket, roomCode: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room) return;
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;

    const leaving = room.players.splice(idx, 1)[0];
    socket.leave(roomCode);

    if (room.players.length === 0) {
      this.rooms.deleteRoom(roomCode);
    } else {
      if (leaving.id === room.hostSocketId) {
        room.hostSocketId = room.players[0].id;
        room.hostPlayerId = room.players[0].playerId ?? null;
        this.emitSystem(roomCode, `${leaving.name} left. ${room.players[0].name} is now host.`);
      } else {
        this.emitSystem(roomCode, `${leaving.name} left.`);
      }
      if (room.status === 'full') room.status = 'waiting';
      this.emitState(roomCode);
    }
  }

  private emitState(roomCode: string): void {
    const state = this.rooms.getLobbyState(roomCode);
    if (state) this.io.to(roomCode).emit('lobby:state', state);
  }

  private emitSystem(roomCode: string, text: string): void {
    this.io.to(roomCode).emit('lobby:system_message', { text, timestamp: Date.now() });
  }
}
