# OCB Lobby, Room Management & Hub Architecture Plan

## Against Current Codebase — Parallel with Auth/Deck Plan

---

# SECTION 1: WHAT EXISTS VS. WHAT WE'RE BUILDING

## 1.1 Current Scene Flow

```
PreloadScene → MainMenuScene → RoomScene → BattleScene → ResultScene
                    │                │
                    │  type name     │  socket connect
                    │  type room code│  create/join room
                    │  PLAY FREE     │  crypto deposit
                    │  PLAY CRYPTO   │  opponent joins → battle
                    │                │
                    └── One step ────┘  (no lobby, no browsing)
```

**Problems:**
- No persistent "home" — you type your name every time
- No room browsing — you must know the room code or create one
- No room settings — no private/public, no kick, no chat
- No profile visibility — W/L record is local, lost on refresh
- RoomScene is both "waiting room" and "pre-game lobby" in one

## 1.2 Target Scene Flow

```
PreloadScene → LoginScene → HubScene ─────┬──► DeckBuilderScene
                  │              │         │
                  │  wallet      │  hub:   │
                  │  sign-in     │  profile├──► RoomBrowserScene ──► LobbyScene
                  │  (or guest)  │  play   │                           │
                  │              │  decks  ├──► LobbyScene (host)      │
                  │              │  history│       │                    │
                  │              │         │       ▼                    ▼
                  │              │         │    BattleScene ◄──── both ready
                  │              │         │       │
                  │              │         │       ▼
                  │              │         │    ResultScene ──► HubScene
                  │              │         │
```

**New scenes:**
- `LoginScene` — wallet connect or guest entry (replaces the name input in MainMenuScene)
- `HubScene` — persistent home screen (replaces MainMenuScene)
- `RoomBrowserScene` — browse & join public rooms
- `LobbyScene` — replaces RoomScene with full room management

**MainMenuScene is NOT deleted** — it becomes `HubScene`. The current MainMenuScene can stay as a fallback until HubScene is ready.

---

# SECTION 2: SERVER-SIDE ROOM ARCHITECTURE

## 2.1 Current Server Room Model

```js
// Current: rooms is a plain object, room is a simple bag
rooms[roomCode] = {
  players: [{ id, name, roll, wallet }],
  cryptoReady: { count: 0 }
};
```

**What's missing:** visibility (public/private), room settings, host authority, chat messages, kick capability, room listing API, player readiness.

## 2.2 New Room Model

The existing `rooms` object in `server/index.js` evolves. We don't replace it — we **add fields**.

### NEW FILE: `server/roomModel.js`

```js
// ─── server/roomModel.js ─────────────────────────────────────
// Room data model + factory. Used by both socket handlers
// and the REST API for room listing.
//
// Does NOT replace the existing rooms object in index.js.
// Instead, createRoom() returns a room with the new shape,
// and the socket handler stores it in the same rooms{} object.
// ──────────────────────────────────────────────────────────────

/**
 * @typedef {'waiting' | 'full' | 'starting' | 'in_progress' | 'finished'} RoomStatus
 *
 * @typedef {Object} RoomPlayer
 * @property {string} id          - socket.id
 * @property {string} name        - display name
 * @property {number|null} playerId - DB player.id (null = guest)
 * @property {string|null} wallet  - wallet address
 * @property {number|null} roll    - dice roll (legacy)
 * @property {string[]|null} deckIds - validated deck
 * @property {boolean} ready       - player clicked "ready"
 * @property {number} joinedAt     - Date.now()
 *
 * @typedef {Object} ChatMessage
 * @property {string} sender       - player name
 * @property {string} text         - message body
 * @property {number} timestamp    - Date.now()
 *
 * @typedef {Object} Room
 * @property {string} code
 * @property {string} hostSocketId - socket.id of the creator
 * @property {number|null} hostPlayerId - DB player.id of the host
 * @property {RoomPlayer[]} players
 * @property {RoomSettings} settings
 * @property {RoomStatus} status
 * @property {ChatMessage[]} chat
 * @property {number} gameSeed
 * @property {boolean} settled
 * @property {{ count: number }} cryptoReady
 * @property {number} createdAt
 *
 * @typedef {Object} RoomSettings
 * @property {boolean} isPublic     - visible in room browser
 * @property {boolean} isCrypto     - requires AVAX stake
 * @property {number} maxPlayers    - always 2 for now
 * @property {string} roomName      - display name for public listing
 * @property {number} stakeAmount   - AVAX stake (0 for free)
 */

function createRoom(code, hostPlayer, settings = {}) {
  return {
    code,
    hostSocketId: hostPlayer.id,
    hostPlayerId: hostPlayer.playerId || null,
    players: [hostPlayer],
    settings: {
      isPublic:    settings.isPublic ?? true,
      isCrypto:    settings.isCrypto ?? false,
      maxPlayers:  2,
      roomName:    settings.roomName || `${hostPlayer.name}'s Room`,
      stakeAmount: settings.stakeAmount ?? 0,
    },
    status: 'waiting',
    chat: [],
    gameSeed: 0,
    settled: false,
    cryptoReady: { count: 0 },
    createdAt: Date.now(),
  };
}

function createPlayer(socketId, name, playerId = null) {
  return {
    id: socketId,
    name,
    playerId,
    wallet: null,
    roll: null,
    deckIds: null,
    ready: false,
    joinedAt: Date.now(),
  };
}

/**
 * Serialize a room for the public room list (hide sensitive data).
 */
function roomToPublicListing(room) {
  return {
    code: room.code,
    roomName: room.settings.roomName,
    hostName: room.players[0]?.name ?? 'Unknown',
    playerCount: room.players.length,
    maxPlayers: room.settings.maxPlayers,
    isCrypto: room.settings.isCrypto,
    stakeAmount: room.settings.stakeAmount,
    status: room.status,
    createdAt: room.createdAt,
  };
}

/**
 * Full room state sent to players inside the room.
 */
function roomToLobbyState(room) {
  return {
    code: room.code,
    settings: room.settings,
    status: room.status,
    players: room.players.map(p => ({
      name: p.name,
      playerId: p.playerId,
      ready: p.ready,
      isHost: p.id === room.hostSocketId,
      hasDeck: !!p.deckIds,
    })),
    chat: room.chat.slice(-50), // Last 50 messages
    hostSocketId: room.hostSocketId,
  };
}

module.exports = {
  createRoom,
  createPlayer,
  roomToPublicListing,
  roomToLobbyState,
};
```

---

## 2.3 Server Socket Events — New & Changed

### NEW FILE: `server/lobbyEvents.js`

```js
// ─── server/lobbyEvents.js ───────────────────────────────────
// New socket event handlers for lobby functionality.
// Mounted alongside existing handlers in server/index.js.
//
// These are ADDITIVE — they don't modify any existing event.
// The existing createRoom/joinRoom handlers still work unchanged.
// These new events provide the ENHANCED room experience.
// ──────────────────────────────────────────────────────────────

const { createRoom, createPlayer, roomToPublicListing, roomToLobbyState } = require('./roomModel');
const { validateDeck } = require('./deckValidator');

const MAX_CHAT_LENGTH = 200;
const MAX_CHAT_MESSAGES = 100;

/**
 * Register lobby socket events on a socket.
 * `rooms` is the same shared rooms object from index.js.
 * `io` is the Socket.io server instance.
 */
function registerLobbyEvents(socket, io, rooms, getPlayerIdForSocket) {

  // ─── CREATE ROOM (ENHANCED) ─────────────────────────────
  // New version with settings. Uses 'lobby:create' namespace
  // to coexist with existing 'createRoom' event.
  socket.on('lobby:create', ({ playerName, settings }) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const playerId = getPlayerIdForSocket(socket.id);

    const player = createPlayer(socket.id, playerName, playerId);
    const room = createRoom(code, player, settings);
    rooms[code] = room;

    socket.join(code);
    socket.emit('lobby:created', { code });
    socket.emit('lobby:state', roomToLobbyState(room));

    console.log(`[Lobby] Room ${code} created by ${playerName} (public: ${room.settings.isPublic})`);
  });

  // ─── JOIN ROOM (ENHANCED) ───────────────────────────────
  socket.on('lobby:join', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('lobby:error', { message: 'Room not found.' });
      return;
    }
    if (room.status !== 'waiting') {
      socket.emit('lobby:error', { message: 'Room is not accepting players.' });
      return;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      socket.emit('lobby:error', { message: 'Room is full.' });
      return;
    }
    // Check if player is banned/kicked
    if (room._kicked && room._kicked.has(socket.id)) {
      socket.emit('lobby:error', { message: 'You were kicked from this room.' });
      return;
    }

    const playerId = getPlayerIdForSocket(socket.id);
    const player = createPlayer(socket.id, playerName, playerId);
    room.players.push(player);

    socket.join(roomCode);
    socket.emit('lobby:joined', { code: roomCode });

    // Broadcast updated state to everyone in room
    io.to(roomCode).emit('lobby:state', roomToLobbyState(room));
    io.to(roomCode).emit('lobby:system_message', {
      text: `${playerName} joined the room.`,
      timestamp: Date.now(),
    });

    console.log(`[Lobby] ${playerName} joined room ${roomCode}`);
  });

  // ─── LIST PUBLIC ROOMS ──────────────────────────────────
  socket.on('lobby:list', () => {
    const publicRooms = Object.values(rooms)
      .filter(r => r.settings?.isPublic && r.status === 'waiting')
      .map(roomToPublicListing)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50); // Cap at 50

    socket.emit('lobby:room_list', { rooms: publicRooms });
  });

  // ─── KICK PLAYER (HOST ONLY) ────────────────────────────
  socket.on('lobby:kick', ({ roomCode, targetPlayerName }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostSocketId !== socket.id) {
      socket.emit('lobby:error', { message: 'Only the host can kick players.' });
      return;
    }

    const targetIdx = room.players.findIndex(
      p => p.name === targetPlayerName && p.id !== room.hostSocketId
    );
    if (targetIdx === -1) return;

    const target = room.players[targetIdx];
    room.players.splice(targetIdx, 1);

    // Track kicked socket IDs to prevent rejoin
    if (!room._kicked) room._kicked = new Set();
    room._kicked.add(target.id);

    // Notify kicked player
    io.to(target.id).emit('lobby:kicked', {
      reason: 'You were removed by the host.',
    });

    // Force leave the socket.io room
    const targetSocket = io.sockets.sockets.get(target.id);
    if (targetSocket) targetSocket.leave(roomCode);

    // Update room state for remaining players
    io.to(roomCode).emit('lobby:state', roomToLobbyState(room));
    io.to(roomCode).emit('lobby:system_message', {
      text: `${target.name} was removed by the host.`,
      timestamp: Date.now(),
    });

    console.log(`[Lobby] ${target.name} kicked from ${roomCode} by host`);
  });

  // ─── CHAT MESSAGE ───────────────────────────────────────
  socket.on('lobby:chat', ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Sanitize
    const cleanText = String(text).trim().slice(0, MAX_CHAT_LENGTH);
    if (!cleanText) return;

    const msg = {
      sender: player.name,
      text: cleanText,
      timestamp: Date.now(),
    };

    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT_MESSAGES) {
      room.chat = room.chat.slice(-MAX_CHAT_MESSAGES);
    }

    io.to(roomCode).emit('lobby:chat_message', msg);
  });

  // ─── PLAYER READY TOGGLE ───────────────────────────────
  socket.on('lobby:ready', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.ready = !player.ready;
    io.to(roomCode).emit('lobby:state', roomToLobbyState(room));

    console.log(`[Lobby] ${player.name} ready: ${player.ready} in ${roomCode}`);
  });

  // ─── UPDATE ROOM SETTINGS (HOST ONLY) ──────────────────
  socket.on('lobby:settings', ({ roomCode, settings }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostSocketId !== socket.id) {
      socket.emit('lobby:error', { message: 'Only the host can change settings.' });
      return;
    }
    if (room.status !== 'waiting') return;

    // Only allow safe updates
    if (typeof settings.isPublic === 'boolean') room.settings.isPublic = settings.isPublic;
    if (typeof settings.roomName === 'string') room.settings.roomName = settings.roomName.slice(0, 40);
    if (typeof settings.isCrypto === 'boolean') room.settings.isCrypto = settings.isCrypto;

    io.to(roomCode).emit('lobby:state', roomToLobbyState(room));
  });

  // ─── HOST STARTS GAME ──────────────────────────────────
  socket.on('lobby:start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostSocketId !== socket.id) {
      socket.emit('lobby:error', { message: 'Only the host can start.' });
      return;
    }
    if (room.players.length < 2) {
      socket.emit('lobby:error', { message: 'Need 2 players to start.' });
      return;
    }

    // Check all non-host players are ready
    const allReady = room.players
      .filter(p => p.id !== room.hostSocketId)
      .every(p => p.ready);

    if (!allReady) {
      socket.emit('lobby:error', { message: 'All players must be ready.' });
      return;
    }

    room.status = 'starting';

    // Generate seed
    const seed = Math.floor(Math.random() * 999999);
    room.gameSeed = seed;

    io.to(roomCode).emit('lobby:state', roomToLobbyState(room));
    io.to(roomCode).emit('lobby:game_starting', {
      seed,
      players: room.players.map((p, i) => ({
        name: p.name,
        playerIndex: i,
        isHost: p.id === room.hostSocketId,
      })),
    });

    // Also emit the existing events so BattleScene works unchanged:
    io.to(roomCode).emit('game_seed', { seed });

    // Set playerIndex for each player via their specific socket
    room.players.forEach((p, i) => {
      io.to(p.id).emit('roomCreated', { roomCode, playerIndex: i });
      // Notify each player about their opponent
      const oppIdx = i === 0 ? 1 : 0;
      io.to(p.id).emit('opponentJoined', {
        playerName: room.players[oppIdx].name,
        playerIndex: i,
      });
    });

    room.status = 'in_progress';
    console.log(`[Lobby] Game starting in ${roomCode}, seed: ${seed}`);
  });

  // ─── LEAVE ROOM ────────────────────────────────────────
  socket.on('lobby:leave', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;

    const leavingPlayer = room.players[idx];
    room.players.splice(idx, 1);
    socket.leave(roomCode);

    if (room.players.length === 0) {
      // Empty room — delete
      delete rooms[roomCode];
      console.log(`[Lobby] Room ${roomCode} deleted (empty)`);
    } else {
      // If host left, transfer host to next player
      if (leavingPlayer.id === room.hostSocketId) {
        room.hostSocketId = room.players[0].id;
        room.hostPlayerId = room.players[0].playerId;
        io.to(roomCode).emit('lobby:system_message', {
          text: `${leavingPlayer.name} left. ${room.players[0].name} is now the host.`,
          timestamp: Date.now(),
        });
      } else {
        io.to(roomCode).emit('lobby:system_message', {
          text: `${leavingPlayer.name} left the room.`,
          timestamp: Date.now(),
        });
      }
      io.to(roomCode).emit('lobby:state', roomToLobbyState(room));
    }
  });

  // ─── DISCONNECT HANDLING (lobby-aware) ─────────────────
  // This supplements (not replaces) the existing disconnect handler.
  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      const player = room.players[idx];

      // Only handle lobby-phase disconnects here.
      // In-game disconnects are handled by the existing handler.
      if (room.status === 'waiting' || room.status === 'full') {
        room.players.splice(idx, 1);

        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (player.id === room.hostSocketId) {
            room.hostSocketId = room.players[0].id;
            room.hostPlayerId = room.players[0].playerId;
          }
          io.to(code).emit('lobby:state', roomToLobbyState(room));
          io.to(code).emit('lobby:system_message', {
            text: `${player.name} disconnected.`,
            timestamp: Date.now(),
          });
        }
      }
      break;
    }
  });
}

module.exports = { registerLobbyEvents };
```

---

## 2.4 REST Endpoint for Room List

### ADD to existing `server/api.js` (at the bottom, before `module.exports`):

```js
// ═══════════════════════════════════════════════════════════
// ROOM LIST (public, no auth required)
// ═══════════════════════════════════════════════════════════

// This requires access to the rooms object.
// We attach it at mount time from index.js.
router.getRoomList = function(rooms) {
  const { roomToPublicListing } = require('./roomModel');
  return Object.values(rooms)
    .filter(r => r.settings?.isPublic && r.status === 'waiting')
    .map(roomToPublicListing)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
};

router.get('/rooms', (req, res) => {
  // rooms ref is injected via router._rooms (set in index.js)
  const rooms = router._rooms || {};
  res.json({ rooms: router.getRoomList(rooms) });
});
```

---

## 2.5 Mount in `server/index.js` — 2 Additions

### Addition 1: Import and mount lobby events (after existing `io.on('connection')` block opens)

**Location:** Inside `io.on('connection', (socket) => {`, at the very start, add:

```js
  // ── Lobby events (new — coexists with existing handlers) ──
  const { registerLobbyEvents } = require('./lobbyEvents');
  registerLobbyEvents(socket, io, rooms, (socketId) => {
    // Return playerId for a socket (set by registerPlayer from auth plan)
    return socket._playerId || null;
  });
```

### Addition 2: Pass rooms ref to API router (after `app.use('/api', apiRouter)`)

```js
apiRouter._rooms = rooms;
```

That's it. Two lines added to `server/index.js`. Everything else is new files.

---

# SECTION 3: CLIENT-SIDE ARCHITECTURE

## 3.1 New Client Files Map

```
src/
  scenes/
    LoginScene.ts          ← NEW: wallet connect or guest entry
    HubScene.ts            ← NEW: home screen (replaces MainMenuScene role)
    RoomBrowserScene.ts    ← NEW: browse public rooms
    LobbyScene.ts          ← NEW: enhanced room with chat/kick/ready
  lobby/
    LobbySocketManager.ts  ← NEW: lobby-specific socket events
    RoomBrowserAPI.ts       ← NEW: REST client for room list
    ChatManager.ts          ← NEW: chat state management
```

## 3.2 Lobby Socket Manager

### NEW FILE: `src/lobby/LobbySocketManager.ts`

```typescript
// ─── src/lobby/LobbySocketManager.ts ─────────────────────────
// Manages lobby-specific socket events.
// Wraps the existing SocketManager's socket — does NOT create
// a second connection. Just adds lobby: namespaced events.
//
// Usage:
//   LobbySocket.init(SocketManager);  // after socket connected
//   LobbySocket.createRoom(name, settings);
//   LobbySocket.onStateUpdate(callback);
// ──────────────────────────────────────────────────────────────

import SocketManager from '../network/SocketManager';

export interface PublicRoomListing {
  code: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isCrypto: boolean;
  stakeAmount: number;
  status: string;
  createdAt: number;
}

export interface LobbyPlayerInfo {
  name: string;
  playerId: number | null;
  ready: boolean;
  isHost: boolean;
  hasDeck: boolean;
}

export interface LobbyState {
  code: string;
  settings: {
    isPublic: boolean;
    isCrypto: boolean;
    maxPlayers: number;
    roomName: string;
    stakeAmount: number;
  };
  status: string;
  players: LobbyPlayerInfo[];
  chat: ChatMessage[];
  hostSocketId: string;
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface GameStartingData {
  seed: number;
  players: Array<{
    name: string;
    playerIndex: number;
    isHost: boolean;
  }>;
}

type Callback<T> = (data: T) => void;

class LobbySocketManagerClass {
  private socket: any = null;        // raw socket.io socket
  private listeners: Array<{ event: string; fn: Function }> = [];

  /**
   * Get the raw socket from SocketManager.
   * Must be called AFTER SocketManager.connect().
   */
  private getSocket(): any {
    // Access the private socket — SocketManager doesn't expose it,
    // so we reach through. If SocketManager adds a getter later, use that.
    if (this.socket) return this.socket;
    this.socket = (SocketManager as any).socket;
    return this.socket;
  }

  private on<T>(event: string, fn: Callback<T>): void {
    const s = this.getSocket();
    if (!s) { console.warn('[LobbySocket] No socket connection'); return; }
    s.on(event, fn);
    this.listeners.push({ event, fn });
  }

  private emit(event: string, data?: any): void {
    const s = this.getSocket();
    if (!s) { console.warn('[LobbySocket] No socket connection'); return; }
    s.emit(event, data);
  }

  // ─── OUTGOING (client → server) ────────────────────────

  createRoom(playerName: string, settings: Partial<LobbyState['settings']> = {}): void {
    this.emit('lobby:create', { playerName, settings });
  }

  joinRoom(roomCode: string, playerName: string): void {
    this.emit('lobby:join', { roomCode, playerName });
  }

  leaveRoom(roomCode: string): void {
    this.emit('lobby:leave', { roomCode });
  }

  requestRoomList(): void {
    this.emit('lobby:list');
  }

  sendChat(roomCode: string, text: string): void {
    this.emit('lobby:chat', { roomCode, text });
  }

  toggleReady(roomCode: string): void {
    this.emit('lobby:ready', { roomCode });
  }

  kickPlayer(roomCode: string, targetPlayerName: string): void {
    this.emit('lobby:kick', { roomCode, targetPlayerName });
  }

  updateSettings(roomCode: string, settings: Partial<LobbyState['settings']>): void {
    this.emit('lobby:settings', { roomCode, settings });
  }

  startGame(roomCode: string): void {
    this.emit('lobby:start_game', { roomCode });
  }

  // ─── INCOMING (server → client) ────────────────────────

  onCreated(fn: Callback<{ code: string }>): void {
    this.on('lobby:created', fn);
  }

  onJoined(fn: Callback<{ code: string }>): void {
    this.on('lobby:joined', fn);
  }

  onStateUpdate(fn: Callback<LobbyState>): void {
    this.on('lobby:state', fn);
  }

  onRoomList(fn: Callback<{ rooms: PublicRoomListing[] }>): void {
    this.on('lobby:room_list', fn);
  }

  onChatMessage(fn: Callback<ChatMessage>): void {
    this.on('lobby:chat_message', fn);
  }

  onSystemMessage(fn: Callback<{ text: string; timestamp: number }>): void {
    this.on('lobby:system_message', fn);
  }

  onKicked(fn: Callback<{ reason: string }>): void {
    this.on('lobby:kicked', fn);
  }

  onGameStarting(fn: Callback<GameStartingData>): void {
    this.on('lobby:game_starting', fn);
  }

  onError(fn: Callback<{ message: string }>): void {
    this.on('lobby:error', fn);
  }

  // ─── CLEANUP ───────────────────────────────────────────

  removeAllListeners(): void {
    const s = this.getSocket();
    if (!s) return;
    for (const { event, fn } of this.listeners) {
      s.off(event, fn);
    }
    this.listeners = [];
    this.socket = null;
  }
}

export const LobbySocket = new LobbySocketManagerClass();
```

---

## 3.3 Room Browser API (REST)

### NEW FILE: `src/lobby/RoomBrowserAPI.ts`

```typescript
// ─── src/lobby/RoomBrowserAPI.ts ─────────────────────────────
// REST client for room listing. Supplements socket-based
// lobby:list for cases where we want to poll or fetch before
// socket is connected.
// ──────────────────────────────────────────────────────────────

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001/api';

export interface PublicRoom {
  code: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isCrypto: boolean;
  stakeAmount: number;
  status: string;
  createdAt: number;
}

export async function fetchPublicRooms(): Promise<PublicRoom[]> {
  try {
    const res = await fetch(`${API_BASE}/rooms`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.rooms ?? [];
  } catch {
    console.warn('[RoomBrowser] Failed to fetch rooms');
    return [];
  }
}
```

---

## 3.4 Scene Implementations (Architecture + Key Code)

### NEW FILE: `src/scenes/LoginScene.ts`

```typescript
// ─── src/scenes/LoginScene.ts ────────────────────────────────
// First scene after PreloadScene. Handles:
//   - Wallet connect + server auth → HubScene (authenticated)
//   - Guest entry → HubScene (guest mode)
//
// Replaces the "name input" part of MainMenuScene.
// If auth plan (Phase B) isn't deployed yet, this scene
// simply collects a name and proceeds as guest.
// ──────────────────────────────────────────────────────────────

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

// Dynamic imports — won't crash if auth files don't exist yet
async function tryAuthLogin() {
  try {
    const { AuthManager } = await import('../auth/AuthManager');
    return await AuthManager.login();
  } catch (err: any) {
    throw new Error(err.message || 'Auth not available');
  }
}

const CX = 640;

export default class LoginScene extends Phaser.Scene {
  private inputManager!: DOMInputManager;
  private nameInput!: HTMLInputElement;

  constructor() { super({ key: 'LoginScene' }); }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(400, 0, 0, 0);

    this.add.text(CX, 120, 'OnChainBattles', {
      fontSize: '44px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(CX, 175, 'Chess-Like On-Chain Card Duel', {
      fontSize: '16px', fontFamily: '"Courier New", monospace', color: '#888888',
    }).setOrigin(0.5);

    // ── Wallet Login Button ──────────────────────────────
    const walletBtn = new MenuButton(this, CX, 280,
      '[ CONNECT WALLET ]', {
        color: '#F5A623', fontSize: '22px',
        onPointerDown: () => this.handleWalletLogin(walletBtn),
      });

    // ── OR divider ───────────────────────────────────────
    this.add.text(CX, 340, '— or play as guest —', {
      fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#555555',
    }).setOrigin(0.5);

    // ── Guest Name Input ─────────────────────────────────
    this.inputManager = new DOMInputManager(this);
    this.nameInput = this.inputManager.createInput({
      gameX: CX, gameY: 400, width: 320, height: 44,
      placeholder: 'Enter guest name...', maxLength: 20,
    });

    new MenuButton(this, CX, 470,
      '[ PLAY AS GUEST ]', {
        color: '#00FF88', fontSize: '20px',
        onPointerDown: () => this.handleGuest(),
      });

    this.events.once('shutdown', () => this.inputManager?.destroyAll());
    this.events.once('destroy', () => this.inputManager?.destroyAll());
  }

  private async handleWalletLogin(btn: MenuButton): Promise<void> {
    btn.setLabel('Connecting...');
    btn.setDisabled(true);
    try {
      const player = await tryAuthLogin();
      GameState.setPlayerName(player.displayName);
      if ((GameState as any).setAuthData) {
        const { AuthManager } = await import('../auth/AuthManager');
        (GameState as any).setAuthData(AuthManager.getToken(), player.id, player.displayName);
      }
      this.goToHub();
    } catch (err: any) {
      ToastNotification.show(this, err.message, { color: '#ff4444' });
      btn.setLabel('[ CONNECT WALLET ]');
      btn.setDisabled(false);
    }
  }

  private handleGuest(): void {
    const name = this.nameInput.value.trim();
    if (!name) {
      ToastNotification.show(this, 'Enter a name to continue', { color: '#ff4444' });
      return;
    }
    GameState.setPlayerName(name);
    this.goToHub();
  }

  private goToHub(): void {
    this.inputManager.destroyAll();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }
}
```

---

### NEW FILE: `src/scenes/HubScene.ts`

```typescript
// ─── src/scenes/HubScene.ts ──────────────────────────────────
// The "home screen" after login. Replaces MainMenuScene's role.
// Shows: player profile, play buttons, navigation to other scenes.
//
// This is the central hub — always return here after matches.
// Designed to have more panels added later (leaderboard, shop, etc.)
// ──────────────────────────────────────────────────────────────

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;

export default class HubScene extends Phaser.Scene {
  constructor() { super({ key: 'HubScene' }); }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Player Identity Bar (top) ────────────────────────
    const displayName = GameState.playerName || 'Guest';
    const isAuth = (GameState as any).isAuthenticated?.() ?? false;
    const authLabel = isAuth ? '(Wallet Connected)' : '(Guest)';

    this.add.text(20, 20, displayName, {
      fontSize: '22px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    });
    this.add.text(20, 48, authLabel, {
      fontSize: '12px', fontFamily: '"Courier New", monospace',
      color: isAuth ? '#4fc3f7' : '#777777',
    });

    // W/L record
    this.add.text(20, 72, `W: ${GameState.winCount}  L: ${GameState.lossCount}`, {
      fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#888888',
    });

    // ── Title ────────────────────────────────────────────
    this.add.text(CX, 80, 'OnChainBattles', {
      fontSize: '36px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    // ── Main Action Buttons ──────────────────────────────

    new MenuButton(this, CX, 200, '[ HOST A GAME ]', {
      color: '#00FF88', fontSize: '24px',
      onPointerDown: () => this.goToLobbyAsHost(),
    });

    new MenuButton(this, CX, 270, '[ BROWSE GAMES ]', {
      color: '#4FC3F7', fontSize: '22px',
      onPointerDown: () => this.goToRoomBrowser(),
    });

    new MenuButton(this, CX, 340, '[ JOIN BY CODE ]', {
      color: '#AAAAAA', fontSize: '18px',
      onPointerDown: () => this.showJoinByCode(),
    });

    // ── Secondary Buttons ────────────────────────────────

    if (isAuth) {
      new MenuButton(this, CX, 430, '[ DECK BUILDER ]', {
        color: '#F5A623', fontSize: '16px',
        onPointerDown: () => this.scene.start('DeckBuilderScene'),
      });

      new MenuButton(this, CX, 475, '[ MATCH HISTORY ]', {
        color: '#777777', fontSize: '14px',
        onPointerDown: () => {
          ToastNotification.show(this, 'Coming soon...', { color: '#F5A623' });
        },
      });
    }

    // ── Quick Play (legacy flow — goes directly to RoomScene) ──
    new MenuButton(this, CX, 560, '[ QUICK PLAY (LEGACY) ]', {
      color: '#555555', fontSize: '13px',
      onPointerDown: () => this.quickPlayLegacy(),
    });

    // ── Last Match Banner ────────────────────────────────
    this.renderLastMatchBanner();
  }

  private goToLobbyAsHost(): void {
    // Pass 'host' mode to LobbyScene
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LobbyScene', { mode: 'host' });
    });
  }

  private goToRoomBrowser(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('RoomBrowserScene');
    });
  }

  private showJoinByCode(): void {
    // Inline prompt — could be a DOM input overlay
    const code = prompt('Enter room code:');
    if (code && code.trim().length >= 6) {
      GameState.setRoomCode(code.trim().toUpperCase());
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LobbyScene', { mode: 'join', roomCode: code.trim().toUpperCase() });
      });
    }
  }

  private quickPlayLegacy(): void {
    GameState.currentMode = GameMode.FreePlay;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
  }

  private renderLastMatchBanner(): void {
    const match = GameState.lastMatch;
    if (!match) return;
    const color = match.playerWon ? '#00ff88' : '#ff6666';
    const msg = match.playerWon
      ? `Last: You beat ${match.opponentName}!`
      : `Last: ${match.opponentName} beat you`;
    this.add.text(CX, 640, msg, {
      fontSize: '14px', fontFamily: '"Courier New", monospace', color,
    }).setOrigin(0.5);
  }
}
```

---

### NEW FILE: `src/scenes/RoomBrowserScene.ts`

```typescript
// ─── src/scenes/RoomBrowserScene.ts ──────────────────────────
// Lists public rooms. Player can click to join.
// Uses both REST (initial load) and socket (live updates).
// ──────────────────────────────────────────────────────────────

import Phaser from 'phaser';
import GameState from '../GameState';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { fetchPublicRooms, type PublicRoom } from '../lobby/RoomBrowserAPI';

const CX = 640;
const LIST_Y = 160;
const ROW_H = 50;
const MAX_VISIBLE = 8;

export default class RoomBrowserScene extends Phaser.Scene {
  private rooms: PublicRoom[] = [];
  private listContainer!: Phaser.GameObjects.Container;
  private scrollOffset = 0;

  constructor() { super({ key: 'RoomBrowserScene' }); }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.add.text(CX, 40, 'PUBLIC GAMES', {
      fontSize: '28px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    // ── Back button ──────────────────────────────────────
    new MenuButton(this, 100, 40, '[ ← BACK ]', {
      color: '#AAAAAA', fontSize: '14px',
      onPointerDown: () => {
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HubScene'));
      },
    });

    // ── Refresh button ───────────────────────────────────
    new MenuButton(this, 1180, 40, '[ REFRESH ]', {
      color: '#4FC3F7', fontSize: '14px',
      onPointerDown: () => this.loadRooms(),
    });

    // ── Column Headers ───────────────────────────────────
    const headerY = LIST_Y - 25;
    this.add.text(120, headerY, 'ROOM', { fontSize: '11px', color: '#777777', fontFamily: '"Courier New"' });
    this.add.text(450, headerY, 'HOST', { fontSize: '11px', color: '#777777', fontFamily: '"Courier New"' });
    this.add.text(700, headerY, 'PLAYERS', { fontSize: '11px', color: '#777777', fontFamily: '"Courier New"' });
    this.add.text(850, headerY, 'MODE', { fontSize: '11px', color: '#777777', fontFamily: '"Courier New"' });
    this.add.text(1020, headerY, '', { fontSize: '11px', color: '#777777', fontFamily: '"Courier New"' });

    this.listContainer = this.add.container(0, 0);

    // ── No rooms message ─────────────────────────────────
    this.add.text(CX, 400, '', { fontSize: '16px', color: '#555555', fontFamily: '"Courier New"' })
      .setOrigin(0.5).setName('emptyMsg');

    await this.loadRooms();
  }

  private async loadRooms(): Promise<void> {
    this.rooms = await fetchPublicRooms();
    this.renderList();
  }

  private renderList(): void {
    this.listContainer.removeAll(true);
    const emptyMsg = this.children.getByName('emptyMsg') as Phaser.GameObjects.Text;

    if (this.rooms.length === 0) {
      if (emptyMsg) emptyMsg.setText('No public rooms available. Host one!');
      return;
    }
    if (emptyMsg) emptyMsg.setText('');

    const visible = this.rooms.slice(this.scrollOffset, this.scrollOffset + MAX_VISIBLE);

    visible.forEach((room, i) => {
      const y = LIST_Y + i * ROW_H;

      // Row background (alternating)
      const bg = this.add.rectangle(CX, y + ROW_H / 2, 1100, ROW_H - 4, i % 2 === 0 ? 0x16213E : 0x1a1a2e)
        .setOrigin(0.5);
      this.listContainer.add(bg);

      // Room name
      const nameText = this.add.text(120, y + 8, room.roomName.slice(0, 30), {
        fontSize: '14px', color: '#ffffff', fontFamily: '"Courier New"',
      });
      this.listContainer.add(nameText);

      // Host name
      this.listContainer.add(this.add.text(450, y + 8, room.hostName, {
        fontSize: '14px', color: '#AAAAAA', fontFamily: '"Courier New"',
      }));

      // Player count
      const countColor = room.playerCount >= room.maxPlayers ? '#ff4444' : '#00ff88';
      this.listContainer.add(this.add.text(700, y + 8, `${room.playerCount}/${room.maxPlayers}`, {
        fontSize: '14px', color: countColor, fontFamily: '"Courier New"',
      }));

      // Mode
      const modeLabel = room.isCrypto ? `CRYPTO ${room.stakeAmount}` : 'FREE';
      const modeColor = room.isCrypto ? '#F5A623' : '#00ff88';
      this.listContainer.add(this.add.text(850, y + 8, modeLabel, {
        fontSize: '14px', color: modeColor, fontFamily: '"Courier New"',
      }));

      // Join button
      if (room.playerCount < room.maxPlayers) {
        const joinBtn = this.add.text(1020, y + 8, '[ JOIN ]', {
          fontSize: '14px', color: '#4FC3F7', fontFamily: '"Courier New"',
        }).setInteractive({ useHandCursor: true });
        joinBtn.on('pointerover', () => joinBtn.setColor('#ffffff'));
        joinBtn.on('pointerout', () => joinBtn.setColor('#4FC3F7'));
        joinBtn.on('pointerdown', () => this.joinRoom(room.code));
        this.listContainer.add(joinBtn);
      }
    });
  }

  private joinRoom(code: string): void {
    GameState.setRoomCode(code);
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LobbyScene', { mode: 'join', roomCode: code });
    });
  }
}
```

---

### NEW FILE: `src/scenes/LobbyScene.ts`

```typescript
// ─── src/scenes/LobbyScene.ts ────────────────────────────────
// Enhanced room scene with: chat, kick, ready, host controls.
// Replaces RoomScene for the new flow. RoomScene stays for legacy.
//
// Receives init data:
//   { mode: 'host' }                    → creates a new room
//   { mode: 'join', roomCode: string }  → joins an existing room
// ──────────────────────────────────────────────────────────────

import Phaser from 'phaser';
import GameState, { GameMode, RoomAction } from '../GameState';
import SocketManager from '../network/SocketManager';
import { LobbySocket, type LobbyState, type ChatMessage, type LobbyPlayerInfo } from '../lobby/LobbySocketManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;

interface LobbySceneData {
  mode: 'host' | 'join';
  roomCode?: string;
}

export default class LobbyScene extends Phaser.Scene {
  private sceneData!: LobbySceneData;
  private inputManager!: DOMInputManager;
  private chatInput!: HTMLInputElement;
  private roomCode: string = '';
  private isHost: boolean = false;
  private lobbyState: LobbyState | null = null;

  // UI refs for live updates
  private playerListTexts: Phaser.GameObjects.Text[] = [];
  private chatTexts: Phaser.GameObjects.Text[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private startBtn: MenuButton | null = null;

  constructor() { super({ key: 'LobbyScene' }); }

  init(data: LobbySceneData): void {
    this.sceneData = data;
  }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_lobby')) {
      this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(300, 0, 0, 0);

    // ── Title ────────────────────────────────────────────
    this.add.text(CX, 25, 'GAME LOBBY', {
      fontSize: '24px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    this.roomCodeText = this.add.text(CX, 55, 'ROOM: ...', {
      fontSize: '18px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    // ── Left Panel: Players ──────────────────────────────
    this.add.text(80, 100, 'PLAYERS', {
      fontSize: '14px', fontFamily: '"Courier New"', color: '#777777',
    });
    this.add.rectangle(200, 250, 340, 250, 0x16213E).setAlpha(0.6);

    // ── Right Panel: Chat ────────────────────────────────
    this.add.text(780, 100, 'CHAT', {
      fontSize: '14px', fontFamily: '"Courier New"', color: '#777777',
    });
    this.add.rectangle(920, 320, 400, 400, 0x16213E).setAlpha(0.6);

    // Chat input
    this.inputManager = new DOMInputManager(this);
    this.chatInput = this.inputManager.createInput({
      gameX: 920, gameY: 540, width: 360, height: 36,
      placeholder: 'Type a message...', maxLength: 200,
    });
    this.chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && this.roomCode) {
        const text = this.chatInput.value.trim();
        if (text) {
          LobbySocket.sendChat(this.roomCode, text);
          this.chatInput.value = '';
        }
      }
    });

    // ── Status ───────────────────────────────────────────
    this.statusText = this.add.text(CX, 580, 'Connecting...', {
      fontSize: '16px', fontFamily: '"Courier New"', color: '#f5a623',
    }).setOrigin(0.5);

    // ── Back button ──────────────────────────────────────
    new MenuButton(this, 80, 640, '[ ← LEAVE ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => this.leaveRoom(),
    });

    // ── Ready button (non-host) ──────────────────────────
    new MenuButton(this, CX, 640, '[ READY / NOT READY ]', {
      color: '#00FF88', fontSize: '16px',
      onPointerDown: () => {
        if (this.roomCode) LobbySocket.toggleReady(this.roomCode);
      },
    });

    // ── Connect & Setup ──────────────────────────────────
    this.connectAndSetup();

    this.events.once('shutdown', () => this.cleanup());
    this.events.once('destroy', () => this.cleanup());
  }

  private connectAndSetup(): void {
    // Ensure socket is connected first (reuse existing SocketManager)
    if (!(SocketManager as any).socket?.connected) {
      SocketManager.connect({
        onRoomCreated: () => {},
        onRoomJoined: () => {},
        onOpponentJoined: () => {},
        onOpponentAction: () => {},
        onOpponentDisconnected: () => {},
        onOpponentRollReceived: () => {},
        onError: (msg) => this.statusText.setText(`Error: ${msg}`).setColor('#ff4444'),
      });
      // Wait for connection then proceed
      const checkConnect = setInterval(() => {
        if ((SocketManager as any).socket?.connected) {
          clearInterval(checkConnect);
          this.registerLobbyEvents();
          this.initiateRoom();
        }
      }, 100);
    } else {
      this.registerLobbyEvents();
      this.initiateRoom();
    }
  }

  private registerLobbyEvents(): void {
    LobbySocket.onCreated(({ code }) => {
      this.roomCode = code;
      this.isHost = true;
      this.roomCodeText.setText(`ROOM: ${code}`);
      this.statusText.setText('Waiting for players...');
      this.showStartButton();
    });

    LobbySocket.onJoined(({ code }) => {
      this.roomCode = code;
      this.isHost = false;
      this.roomCodeText.setText(`ROOM: ${code}`);
      this.statusText.setText('Joined! Waiting for host to start...');
    });

    LobbySocket.onStateUpdate((state) => {
      this.lobbyState = state;
      this.renderPlayerList(state.players);
      this.isHost = state.players.some(
        p => p.isHost && p.name === GameState.playerName
      );
      if (this.isHost) this.showStartButton();
      this.updateStartButton(state);
    });

    LobbySocket.onChatMessage((msg) => {
      this.appendChat(`${msg.sender}: ${msg.text}`, '#ffffff');
    });

    LobbySocket.onSystemMessage(({ text }) => {
      this.appendChat(`» ${text}`, '#f5a623');
    });

    LobbySocket.onKicked(({ reason }) => {
      ToastNotification.show(this, reason, { color: '#ff4444' });
      this.time.delayedCall(2000, () => this.scene.start('HubScene'));
    });

    LobbySocket.onGameStarting((data) => {
      this.statusText.setText('Game starting!').setColor('#00ff88');

      // Set GameState for BattleScene compatibility
      GameState.setGameSeed(data.seed);
      const me = data.players.find(p => p.name === GameState.playerName);
      const opp = data.players.find(p => p.name !== GameState.playerName);
      if (me) GameState.setPlayerIndex(me.playerIndex);
      if (opp) GameState.setOpponentName(opp.name);
      GameState.setRoomCode(this.roomCode);

      this.time.delayedCall(800, () => this.enterBattle());
    });

    LobbySocket.onError(({ message }) => {
      ToastNotification.show(this, message, { color: '#ff4444' });
    });
  }

  private initiateRoom(): void {
    if (this.sceneData.mode === 'host') {
      LobbySocket.createRoom(GameState.playerName, {
        isPublic: true,
        isCrypto: GameState.currentMode === GameMode.CryptoPlay,
      });
    } else if (this.sceneData.roomCode) {
      LobbySocket.joinRoom(this.sceneData.roomCode, GameState.playerName);
    }
  }

  // ─── UI RENDERERS ──────────────────────────────────────

  private renderPlayerList(players: LobbyPlayerInfo[]): void {
    // Clear old
    this.playerListTexts.forEach(t => t.destroy());
    this.playerListTexts = [];

    players.forEach((p, i) => {
      const y = 130 + i * 60;

      // Name
      const nameColor = p.isHost ? '#F5A623' : '#ffffff';
      const hostTag = p.isHost ? ' [HOST]' : '';
      const readyTag = p.ready ? ' ✓' : '';
      const t1 = this.add.text(60, y, `${p.name}${hostTag}${readyTag}`, {
        fontSize: '18px', fontFamily: '"Courier New"', color: nameColor,
      });
      this.playerListTexts.push(t1);

      // Ready status
      const statusColor = p.ready ? '#00FF88' : '#ff4444';
      const statusLabel = p.ready ? 'READY' : 'NOT READY';
      const t2 = this.add.text(60, y + 22, statusLabel, {
        fontSize: '12px', fontFamily: '"Courier New"', color: statusColor,
      });
      this.playerListTexts.push(t2);

      // Kick button (host only, not for self)
      if (this.isHost && !p.isHost) {
        const kick = this.add.text(320, y + 5, '[KICK]', {
          fontSize: '12px', fontFamily: '"Courier New"', color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        kick.on('pointerdown', () => LobbySocket.kickPlayer(this.roomCode, p.name));
        kick.on('pointerover', () => kick.setColor('#ffffff'));
        kick.on('pointerout', () => kick.setColor('#ff4444'));
        this.playerListTexts.push(kick);
      }
    });
  }

  private chatLines: string[] = [];

  private appendChat(line: string, color: string): void {
    this.chatLines.push(line);
    if (this.chatLines.length > 12) this.chatLines.shift();

    // Clear and redraw
    this.chatTexts.forEach(t => t.destroy());
    this.chatTexts = [];

    this.chatLines.forEach((text, i) => {
      const t = this.add.text(740, 130 + i * 28, text, {
        fontSize: '12px', fontFamily: '"Courier New"', color,
        wordWrap: { width: 380 },
      });
      this.chatTexts.push(t);
    });
  }

  private showStartButton(): void {
    if (this.startBtn) return;
    this.startBtn = new MenuButton(this, 320, 480, '[ START GAME ]', {
      color: '#00FF88', fontSize: '22px',
      onPointerDown: () => {
        if (this.roomCode) LobbySocket.startGame(this.roomCode);
      },
    });
  }

  private updateStartButton(state: LobbyState): void {
    if (!this.startBtn || !this.isHost) return;
    const canStart = state.players.length >= 2
      && state.players.filter(p => !p.isHost).every(p => p.ready);
    // Visual feedback (dim if can't start)
    this.startBtn.text.setAlpha(canStart ? 1 : 0.4);
  }

  // ─── TRANSITIONS ──────────────────────────────────────

  private enterBattle(): void {
    this.cleanup();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        playerName: GameState.playerName,
        opponentName: GameState.opponentName,
        isCryptoMode: GameState.currentMode === GameMode.CryptoPlay,
        roomCode: this.roomCode,
      });
    });
  }

  private leaveRoom(): void {
    if (this.roomCode) LobbySocket.leaveRoom(this.roomCode);
    this.cleanup();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('HubScene'));
  }

  private cleanup(): void {
    LobbySocket.removeAllListeners();
    this.inputManager?.destroyAll();
  }
}
```

---

# SECTION 4: SCENE REGISTRATION

## EDIT: `src/main.ts`

**OLD (scene array):**
```typescript
    scene: [
        PreLoadScene,
        MainMenuScene,
        RoomScene,
        BattleScene,
        ResultScene,
    ],
```

**NEW:**
```typescript
    scene: [
        PreLoadScene,
        LoginScene,
        HubScene,
        RoomBrowserScene,
        LobbyScene,
        MainMenuScene,    // kept for legacy/quick-play
        RoomScene,        // kept for legacy/quick-play
        BattleScene,
        ResultScene,
    ],
```

**Add imports at top of main.ts:**
```typescript
import LoginScene from './scenes/LoginScene';
import HubScene from './scenes/HubScene';
import RoomBrowserScene from './scenes/RoomBrowserScene';
import LobbyScene from './scenes/LobbyScene';
```

## EDIT: `src/scenes/PreloadScene.ts`

**OLD (in `create()`):**
```typescript
    this.scene.start('MainMenuScene');
```

**NEW:**
```typescript
    this.scene.start('LoginScene');
```

> MainMenuScene is still reachable via HubScene's "QUICK PLAY (LEGACY)" button.

## EDIT: `src/scenes/ResultScene.ts`

After a match ends, go to HubScene instead of MainMenuScene.

**OLD** (look for the "MAIN MENU" or "Play Again" button handlers):
```typescript
    this.scene.start('MainMenuScene');
```

**NEW:**
```typescript
    this.scene.start('HubScene');
```

---

# SECTION 5: FILE MAP & DEPENDENCY CHART

```
NEW SERVER FILES (drop-in):
  server/roomModel.js         Room data model + factory
  server/lobbyEvents.js       All lobby: socket events

EDITED SERVER FILES:
  server/index.js
    └─ 2 lines: require lobbyEvents + register, pass rooms to api
  server/api.js
    └─ Add GET /rooms endpoint at bottom

NEW CLIENT FILES (drop-in):
  src/lobby/LobbySocketManager.ts    Lobby socket event wrapper
  src/lobby/RoomBrowserAPI.ts        REST room list fetcher
  src/scenes/LoginScene.ts           Wallet/guest login
  src/scenes/HubScene.ts             Home screen hub
  src/scenes/RoomBrowserScene.ts     Public room browser
  src/scenes/LobbyScene.ts           Enhanced room with chat/kick/ready

EDITED CLIENT FILES:
  src/main.ts
    └─ Add 4 imports + 4 scenes to config array
  src/scenes/PreloadScene.ts
    └─ create(): start LoginScene instead of MainMenuScene
  src/scenes/ResultScene.ts
    └─ "Main Menu" button → HubScene instead of MainMenuScene

UNTOUCHED (ZERO changes):
  src/scenes/MainMenuScene.ts        ← Kept as legacy path
  src/scenes/RoomScene.ts            ← Kept as legacy path
  src/scenes/BattleScene.ts          ← No changes needed
  src/network/SocketManager.ts       ← LobbySocket wraps it, doesn't modify
  src/GameState.ts                   ← Auth fields added by auth plan, not here
  server/index.js core logic         ← Existing handlers untouched
  All renderers, engine, etc.        ← Zero changes
```

## Dependency on Auth/Deck Plan

This lobby plan is designed to work **with or without** the auth/deck plan:

| Auth Plan Status | Lobby Behavior |
|---|---|
| **Not deployed** | LoginScene uses guest mode only. Wallet button catches error gracefully. HubScene hides auth-only buttons. |
| **Partially deployed** (server API up, client not wired) | Same as above — dynamic imports fail safely. |
| **Fully deployed** | LoginScene does wallet auth. HubScene shows deck builder, match history. Player identities persist. |

The key mechanism is the `try { await import() }` pattern in LoginScene and the `(GameState as any).isAuthenticated?.()` optional chaining in HubScene. If the auth files don't exist, everything degrades to guest mode.

---

# SECTION 6: IMPLEMENTATION ORDER

| Step | What | Hours | Depends On |
|---|---|---|---|
| **1** | `server/roomModel.js` + `server/lobbyEvents.js` | 3-4h | nothing |
| **2** | Mount in `server/index.js` (2 lines) | 0.5h | step 1 |
| **3** | `src/lobby/LobbySocketManager.ts` + `RoomBrowserAPI.ts` | 2-3h | step 2 |
| **4** | `LoginScene.ts` + `HubScene.ts` | 3-4h | step 3 |
| **5** | `RoomBrowserScene.ts` | 2-3h | step 3 |
| **6** | `LobbyScene.ts` (biggest piece) | 4-6h | step 3 |
| **7** | Wire scenes in `main.ts`, `PreloadScene`, `ResultScene` | 0.5h | steps 4-6 |
| **8** | Add `GET /rooms` to `server/api.js` | 0.5h | step 1 |
| **Total** | | **~16-21h** | |

Steps 4, 5, 6 can run in parallel once step 3 is done.
