# Step 3 Patch: Server Deck + Collection + Lobby Foundation

**Git branch:** `feat/step3-deck-collection-lobby`
**Estimated time:** 6–8 hours
**Prerequisites:** Step 1 (shared types) + Step 2 (DB + auth API)
**Verification:** `npx tsc -p tsconfig.server.json --noEmit` after each sub-step

---

## Sub-step 3.1: `server/api/deckRoutes.ts`

> One job: Deck CRUD + validation endpoints.
> ~95 LOC.

📁 **NEW FILE:** `server/api/deckRoutes.ts`

```typescript
// ============================================================
// deckRoutes.ts
// Deck CRUD: list, create, update, delete, activate, validate.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { validateDeck } from '../validation/DeckValidator.js';

export const deckRouter = Router();

const MAX_DECKS = 10;

function getOwnedCards(playerId: number): Map<string, number> {
  const db = getDB();
  const rows = db.prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(playerId) as Array<{ card_id: string; owned_copies: number }>;
  return new Map(rows.map(r => [r.card_id, r.owned_copies]));
}

// GET /api/decks
deckRouter.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT * FROM decks WHERE player_id = ? ORDER BY updated_at DESC'
  ).all(req.player!.playerId) as Array<Record<string, unknown>>;

  res.json({
    decks: rows.map(d => ({
      id: d.id, name: d.name,
      cardIds: JSON.parse(d.card_ids as string),
      isValid: !!d.is_valid,
      createdAt: d.created_at, updatedAt: d.updated_at,
    })),
  });
});

// POST /api/decks
deckRouter.post('/', requireAuth, (req, res) => {
  const { name, cardIds } = req.body ?? {};
  if (!Array.isArray(cardIds)) {
    res.status(400).json({ error: 'cardIds must be an array.' });
    return;
  }
  const db = getDB();
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?'
  ).get(req.player!.playerId) as { cnt: number };

  if (count.cnt >= MAX_DECKS) {
    res.status(400).json({ error: `Maximum ${MAX_DECKS} decks.` });
    return;
  }

  const owned = getOwnedCards(req.player!.playerId);
  const validation = validateDeck(cardIds, owned);

  const result = db.prepare(
    'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
  ).run(req.player!.playerId, name ?? 'My Deck', JSON.stringify(cardIds), validation.valid ? 1 : 0);

  res.status(201).json({
    deck: {
      id: Number(result.lastInsertRowid), name: name ?? 'My Deck',
      cardIds, isValid: validation.valid, errors: validation.errors,
    },
  });
});

// PUT /api/decks/:id
deckRouter.put('/:id', requireAuth, (req, res) => {
  const db = getDB();
  const existing = db.prepare(
    'SELECT * FROM decks WHERE id = ? AND player_id = ?'
  ).get(req.params.id, req.player!.playerId) as Record<string, unknown> | undefined;

  if (!existing) { res.status(404).json({ error: 'Deck not found.' }); return; }

  const name = req.body.name ?? existing.name;
  const cardIds = req.body.cardIds ?? JSON.parse(existing.card_ids as string);
  const owned = getOwnedCards(req.player!.playerId);
  const validation = validateDeck(cardIds, owned);

  db.prepare(
    'UPDATE decks SET name=?, card_ids=?, is_valid=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(name, JSON.stringify(cardIds), validation.valid ? 1 : 0, req.params.id);

  res.json({ deck: { id: existing.id, name, cardIds, isValid: validation.valid, errors: validation.errors } });
});

// DELETE /api/decks/:id
deckRouter.delete('/:id', requireAuth, (req, res) => {
  const db = getDB();
  db.prepare('UPDATE players SET active_deck_id=NULL WHERE id=? AND active_deck_id=?')
    .run(req.player!.playerId, req.params.id);
  const r = db.prepare('DELETE FROM decks WHERE id=? AND player_id=?')
    .run(req.params.id, req.player!.playerId);
  res.json({ success: r.changes > 0 });
});

// POST /api/decks/:id/activate
deckRouter.post('/:id/activate', requireAuth, (req, res) => {
  const db = getDB();
  const deck = db.prepare('SELECT * FROM decks WHERE id=? AND player_id=?')
    .get(req.params.id, req.player!.playerId) as Record<string, unknown> | undefined;
  if (!deck) { res.status(404).json({ error: 'Deck not found.' }); return; }
  if (!deck.is_valid) { res.status(400).json({ error: 'Cannot activate invalid deck.' }); return; }
  db.prepare('UPDATE players SET active_deck_id=? WHERE id=?').run(deck.id, req.player!.playerId);
  res.json({ success: true, activeDeckId: deck.id });
});

// POST /api/decks/validate
deckRouter.post('/validate', requireAuth, (req, res) => {
  const owned = getOwnedCards(req.player!.playerId);
  res.json(validateDeck(req.body?.cardIds ?? [], owned));
});
```

---

## Sub-step 3.2: `server/api/collectionRoutes.ts`

> One job: Return player's card collection.
> ~30 LOC.

📁 **NEW FILE:** `server/api/collectionRoutes.ts`

```typescript
// ============================================================
// collectionRoutes.ts
// Card collection query for authenticated players.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { CARD_POOL } from '../validation/CardPool.js';

export const collectionRouter = Router();

// GET /api/collection
collectionRouter.get('/', requireAuth, (req, res) => {
  const db = getDB();
  const rows = db.prepare(
    'SELECT card_id, owned_copies FROM collections WHERE player_id = ?'
  ).all(req.player!.playerId) as Array<{ card_id: string; owned_copies: number }>;

  const collection = CARD_POOL
    .filter(c => c.id !== 'king')
    .map(card => {
      const owned = rows.find(r => r.card_id === card.id);
      return {
        id: card.id, name: card.name,
        maxCopies: card.copies, ownedCopies: owned?.owned_copies ?? 0,
      };
    });

  res.json({ collection });
});
```

---

## Sub-step 3.3: `server/api/matchService.ts`

> One job: Record matches to DB + update win/loss.
> ~45 LOC. Called by SessionManager, not by REST routes directly.
> Separated from matchRoutes because SessionManager shouldn't import Express routers.

📁 **NEW FILE:** `server/api/matchService.ts`

```typescript
// ============================================================
// matchService.ts
// Match recording logic — used by SessionManager on game_over.
// Separate from matchRoutes to avoid circular dependency.
// ============================================================

import { getDB } from '../db/database.js';
import type { Room } from '../../shared/types/NetworkEvents.js';

export interface RecordMatchOptions {
  roomCode: string;
  room: Room;
  winnerIndex: number;
  totalTurns: number;
  txHash?: string;
}

/** Record a finished match to database. Safe for guests (null playerIds). */
export function recordMatch(opts: RecordMatchOptions): void {
  const { roomCode, room, winnerIndex, totalTurns, txHash } = opts;
  const pA = room.players[0];
  const pB = room.players[1];
  const winnerId = room.players[winnerIndex]?.playerId ?? null;

  // Skip recording if both players are guests
  if (!pA?.playerId && !pB?.playerId) return;

  const db = getDB();
  db.prepare(`
    INSERT INTO match_history
    (room_code, player_a_id, player_b_id, winner_id,
     player_a_deck, player_b_deck, tx_hash, game_seed, total_turns, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    roomCode,
    pA?.playerId ?? null,
    pB?.playerId ?? null,
    winnerId,
    pA?.deckIds ? JSON.stringify(pA.deckIds) : null,
    pB?.deckIds ? JSON.stringify(pB.deckIds) : null,
    txHash ?? null,
    room.gameSeed ?? 0,
    totalTurns,
  );

  // Update win/loss
  if (winnerId) {
    db.prepare('UPDATE players SET win_count = win_count + 1 WHERE id = ?').run(winnerId);
    const loserId = winnerIndex === 0 ? pB?.playerId : pA?.playerId;
    if (loserId) {
      db.prepare('UPDATE players SET loss_count = loss_count + 1 WHERE id = ?').run(loserId);
    }
  }

  console.log(`[MatchService] Recorded match in ${roomCode}, winner: ${winnerId ?? 'none'}`);
}
```

---

## Sub-step 3.4: `server/api/matchRoutes.ts`

> One job: Match history query endpoint.
> ~25 LOC.

📁 **NEW FILE:** `server/api/matchRoutes.ts`

```typescript
// ============================================================
// matchRoutes.ts
// Match history query for authenticated players.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';

export const matchRouter = Router();

// GET /api/matches?limit=20&offset=0
matchRouter.get('/', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const pid = req.player!.playerId;
  const db = getDB();

  const rows = db.prepare(`
    SELECT * FROM match_history
    WHERE player_a_id = ? OR player_b_id = ?
    ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(pid, pid, limit, offset);

  res.json({ matches: rows });
});
```

---

## Sub-step 3.5: Update `server/api/index.ts`

> Mount the 3 new routers.

📁 `server/api/index.ts`

**FULL REWRITE** (~25 LOC):

```typescript
// ============================================================
// api/index.ts
// Assembles all REST API sub-routers.
// Mounted at /api in server/app.ts.
// ============================================================

import { Router } from 'express';
import { authRouter } from './authRoutes.js';
import { playerRouter } from './playerRoutes.js';
import { deckRouter } from './deckRoutes.js';
import { collectionRouter } from './collectionRoutes.js';
import { matchRouter } from './matchRoutes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/player', playerRouter);
apiRouter.use('/decks', deckRouter);
apiRouter.use('/collection', collectionRouter);
apiRouter.use('/matches', matchRouter);
```

---

## Sub-step 3.6: Extend `server/rooms/RoomManager.ts`

> Add methods for auth identity, deck submission, and lobby room access.
> The existing methods stay untouched. Approximately 60 LOC of additions.
> File grows from ~80 LOC to ~140 LOC — well under the 300 alarm.

📁 `server/rooms/RoomManager.ts`

### Edit 1: Update import

OLD:
```typescript
import type { Room } from '../../shared/types/NetworkEvents.js';
```

NEW:
```typescript
import type { Room, RoomPlayer, RoomSettings, LobbyPlayerInfo, LobbyState, ChatMessage, PublicRoomListing } from '../../shared/types/NetworkEvents.js';
```

### Edit 2: Add new methods after `deleteRoom()`

Insert the following block AFTER the existing `deleteRoom()` method, BEFORE the closing `}` of the class:

```typescript
  // ─── Auth / Deck Extensions ──────────────────────────────

  /** Associate a DB player ID with a socket in a room. */
  setPlayerAuth(socketId: string, roomCode: string, playerId: number): void {
    const player = this.findPlayer(socketId, roomCode);
    if (player) player.playerId = playerId;
  }

  /** Store validated deck IDs for a player. */
  setPlayerDeck(socketId: string, roomCode: string, deckIds: string[]): boolean {
    const player = this.findPlayer(socketId, roomCode);
    if (!player) return false;
    player.deckIds = deckIds;
    return true;
  }

  /** Check if all players in a room have submitted decks. */
  allDecksReady(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.players.length < 2) return false;
    return room.players.every(p => !!p.deckIds);
  }

  // ─── Lobby Extensions ────────────────────────────────────

  /** Get all waiting public rooms for the room browser. */
  getPublicRooms(): PublicRoomListing[] {
    const result: PublicRoomListing[] = [];
    for (const [code, room] of this.rooms) {
      if (room.settings?.isPublic && room.status === 'waiting') {
        result.push({
          code,
          roomName: room.settings.roomName,
          hostName: room.players[0]?.name ?? 'Unknown',
          playerCount: room.players.length,
          maxPlayers: room.settings.maxPlayers,
          isCrypto: room.settings.isCrypto,
          stakeAmount: room.settings.stakeAmount,
          hasPassword: !!room.settings.password,
          status: room.status,
          createdAt: room.createdAt ?? Date.now(),
        });
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  }

  /** Build lobby state for players inside a room. */
  getLobbyState(roomCode: string): LobbyState | null {
    const room = this.rooms.get(roomCode);
    if (!room || !room.settings) return null;
    return {
      code: roomCode,
      settings: room.settings,
      status: room.status ?? 'waiting',
      players: room.players.map(p => ({
        name: p.name,
        playerId: p.playerId ?? null,
        ready: p.ready ?? false,
        isHost: p.id === room.hostSocketId,
        hasDeck: !!p.deckIds,
      })),
      chat: (room.chat ?? []).slice(-50),
    };
  }

  /** Generate a unique 6-digit room code. */
  generateUniqueCode(): string {
    let code: string;
    let attempts = 0;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      attempts++;
    } while (this.rooms.has(code) && attempts < 100);
    return code;
  }

  /** Remove a player from all rooms (prevent multi-room). Returns codes left. */
  removeFromAllRooms(socketId: string): string[] {
    const leftCodes: string[] = [];
    for (const [code, room] of this.rooms) {
      const idx = room.players.findIndex(p => p.id === socketId);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        leftCodes.push(code);
        if (room.players.length === 0) {
          this.rooms.delete(code);
        } else if (room.hostSocketId === socketId) {
          room.hostSocketId = room.players[0].id;
          room.hostPlayerId = room.players[0].playerId ?? null;
        }
      }
    }
    return leftCodes;
  }

  // ─── Private Helpers ─────────────────────────────────────

  private findPlayer(socketId: string, roomCode: string): RoomPlayer | undefined {
    const room = this.rooms.get(roomCode);
    return room?.players.find(p => p.id === socketId);
  }
```

---

## Sub-step 3.7: Extend `server/game/SessionManager.ts`

> Add `registerPlayer`, `submitDeck` handlers + match recording.
> ~40 LOC of additions. File goes from ~65 LOC to ~105 LOC — at alarm threshold but still single-purpose.

📁 `server/game/SessionManager.ts`

### Edit 1: Add imports

OLD:
```typescript
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { PayoutService } from './PayoutService.js';
```

NEW:
```typescript
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { PayoutService } from './PayoutService.js';
import { verifyToken } from '../api/middleware.js';
import { validateDeck } from '../validation/DeckValidator.js';
import { recordMatch } from '../api/matchService.js';
```

### Edit 2: Add `registerPlayer` and `submitDeck` handlers

Inside `registerHandlers()`, ADD these blocks AFTER the `cryptoReady` handler, BEFORE the closing `}`:

```typescript
    // ── Auth: register player identity ──
    socket.on('registerPlayer', ({ token }) => {
      const payload = verifyToken(token);
      if (!payload) return;
      const found = this.rooms.findBySocket(socket.id);
      if (found) {
        this.rooms.setPlayerAuth(socket.id, found.roomCode, payload.playerId);
        console.log(`[Session] Player #${payload.playerId} identified on ${socket.id}`);
      }
    });

    // ── Deck: validate and store deck for match ──
    socket.on('submitDeck', ({ roomCode, deckIds }) => {
      const result = validateDeck(deckIds, null); // Skip ownership for socket flow
      if (!result.valid) {
        socket.emit('deckRejected', { errors: result.errors });
        return;
      }

      const stored = this.rooms.setPlayerDeck(socket.id, roomCode, deckIds);
      if (!stored) return;

      socket.emit('deckAccepted', { cardCount: deckIds.length });
      console.log(`[Session] Deck accepted for socket ${socket.id} in ${roomCode}`);

      if (this.rooms.allDecksReady(roomCode)) {
        this.io.to(roomCode).emit('bothDecksReady');
        console.log(`[Session] Both decks ready in ${roomCode}`);
      }
    });
```

### Edit 3: Add match recording to `game_over` handler

OLD (the `game_over` handler):
```typescript
    socket.on('game_over', async ({ roomCode, winnerIndex }) => {
      if (!this.rooms.markSettled(roomCode)) return; // prevent double-settle

      const room = this.rooms.getRoom(roomCode);
      if (!room) return;

      const winner = room.players[winnerIndex];
      if (!winner?.wallet) {
        console.log(`[Session] game_over in ${roomCode} but winner has no wallet (free mode)`);
        return;
      }

      console.log(`[Session] game_over: ${winner.name} wins room ${roomCode}`);
      const result = await this.payout.payoutWinner(roomCode, winner.wallet);
      this.io.to(roomCode).emit('payout_result', result);
    });
```

NEW:
```typescript
    socket.on('game_over', async ({ roomCode, winnerIndex, totalTurns }) => {
      if (!this.rooms.markSettled(roomCode)) return;

      const room = this.rooms.getRoom(roomCode);
      if (!room) return;

      // Record match to database
      try {
        recordMatch({ roomCode, room, winnerIndex, totalTurns: totalTurns ?? 0 });
      } catch (err: unknown) {
        console.error('[Session] Failed to record match:', err);
      }

      // Mark room as finished for janitor
      if (room.status) room.status = 'finished';

      const winner = room.players[winnerIndex];
      if (!winner?.wallet) {
        console.log(`[Session] game_over in ${roomCode} — no wallet (free mode)`);
        return;
      }

      console.log(`[Session] game_over: ${winner.name} wins room ${roomCode}`);
      const result = await this.payout.payoutWinner(roomCode, winner.wallet);
      this.io.to(roomCode).emit('payout_result', result);
    });
```

---

## Sub-step 3.8: `server/lobby/lobbyHelpers.ts`

> One job: Room creation factory + code generation.
> ~45 LOC. Pure functions, no socket/DB dependency.

📁 **NEW FILE:** `server/lobby/lobbyHelpers.ts`

```typescript
// ============================================================
// lobbyHelpers.ts
// Lobby room creation helpers — pure functions.
// ============================================================

import type { Room, RoomPlayer, RoomSettings } from '../../shared/types/NetworkEvents.js';

const DEFAULT_SETTINGS: RoomSettings = {
  isPublic: true,
  isCrypto: false,
  maxPlayers: 2,
  roomName: 'Game Room',
  stakeAmount: 0,
  password: null,
};

/** Create a lobby-enabled room with full settings. */
export function createLobbyRoom(
  hostSocketId: string,
  hostName: string,
  hostPlayerId: number | null,
  settings: Partial<RoomSettings> = {}
): Room {
  const merged: RoomSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    roomName: (settings.roomName ?? `${hostName}'s Room`).slice(0, 40),
  };

  return {
    players: [{
      id: hostSocketId,
      name: hostName,
      wallet: null,
      playerId: hostPlayerId ?? null,
      deckIds: null,
      ready: true, // Host is always "ready"
    }],
    gameSeed: null,
    cryptoReadyCount: 0,
    settled: false,
    hostSocketId,
    hostPlayerId: hostPlayerId ?? null,
    status: 'waiting',
    settings: merged,
    chat: [],
    createdAt: Date.now(),
  };
}
```

---

## Sub-step 3.9: `server/lobby/RoomJanitor.ts`

> One job: Clean up stale/empty rooms on a timer.
> ~35 LOC.

📁 **NEW FILE:** `server/lobby/RoomJanitor.ts`

```typescript
// ============================================================
// RoomJanitor.ts
// Periodic cleanup of stale rooms.
// ============================================================

import type { Server } from 'socket.io';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';

const ROOM_TTL_MS = 30 * 60 * 1000;   // 30 minutes for waiting rooms
const JANITOR_INTERVAL = 60 * 1000;    // Check every minute

export class RoomJanitor {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private io: Server<ClientToServerEvents, ServerToClientEvents>,
    private rooms: RoomManager
  ) {}

  start(): void {
    this.intervalId = setInterval(() => this.sweep(), JANITOR_INTERVAL);
    console.log('[Janitor] Started — checking every 60s.');
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private sweep(): void {
    const now = Date.now();
    const publicRooms = this.rooms.getPublicRooms();

    for (const listing of publicRooms) {
      const age = now - listing.createdAt;
      if (listing.playerCount === 0 || (listing.status === 'waiting' && age > ROOM_TTL_MS)) {
        this.io.to(listing.code).emit('lobby:kicked', { reason: 'Room expired due to inactivity.' });
        this.rooms.deleteRoom(listing.code);
        console.log(`[Janitor] Deleted stale room: ${listing.code}`);
      }
    }
  }
}
```

---

## Sub-step 3.10: `server/lobby/LobbyManager.ts`

> One job: Register all `lobby:*` socket event handlers.
> This is the biggest file in Step 3 — target ~160 LOC.
> Follows the same `registerHandlers(socket)` pattern as SessionManager.

📁 **NEW FILE:** `server/lobby/LobbyManager.ts`

```typescript
// ============================================================
// LobbyManager.ts
// Handles all lobby: namespaced socket events.
// Same pattern as SessionManager — registered per socket.
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import { createLobbyRoom } from './lobbyHelpers.js';

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
    // Track auth identity (set by SessionManager.registerPlayer)
    const getPlayerId = (): number | null => {
      const found = this.rooms.findBySocket(socket.id);
      return found?.room.players.find(p => p.id === socket.id)?.playerId ?? null;
    };

    socket.on('lobby:create', ({ playerName, settings }) => {
      this.rooms.removeFromAllRooms(socket.id);
      const code = this.rooms.generateUniqueCode();
      const room = createLobbyRoom(socket.id, playerName, getPlayerId(), settings);

      // Store via RoomManager's internal map — we need direct access
      (this.rooms as any)['rooms'].set(code, room);
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
        playerId: getPlayerId(), deckIds: null, ready: false,
      });
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

      const clean = String(text).trim().slice(0, MAX_CHAT_LENGTH);
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
      this.emitState(roomCode);
      this.emitSystem(roomCode, `${target.name} was removed.`);
    });

    socket.on('lobby:settings', ({ roomCode, settings }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room || room.hostSocketId !== socket.id || room.status !== 'waiting') return;
      if (typeof settings.isPublic === 'boolean') room.settings!.isPublic = settings.isPublic;
      if (typeof settings.roomName === 'string') room.settings!.roomName = settings.roomName.slice(0, 40);
      if (typeof settings.isCrypto === 'boolean') room.settings!.isCrypto = settings.isCrypto;
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

    // Lobby-aware disconnect (waiting/full phases only)
    socket.on('disconnect', () => {
      const found = this.rooms.findBySocket(socket.id);
      if (!found) return;
      const { roomCode, room } = found;
      if (room.status === 'waiting' || room.status === 'full' || room.status === 'depositing') {
        this.handleLeave(socket, roomCode);
      }
    });
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
    if (room.status === 'in_progress') return; // Already launched
    room.status = 'in_progress';

    const seed = Math.floor(Math.random() * 999999);
    room.gameSeed = seed;

    this.io.to(roomCode).emit('lobby:game_starting', {
      seed,
      players: room.players.map((p, i) => ({
        name: p.name, playerIndex: i, isHost: p.id === room.hostSocketId,
      })),
    });

    // Legacy events for BattleScene compatibility
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
```

> **Note on line 68:** `(this.rooms as any)['rooms'].set(code, room)` — this is the ONE `as any` in the entire step. It accesses RoomManager's private `rooms` Map to insert a lobby-created room. The clean alternative is adding a `setRoom(code, room)` public method to RoomManager. I document both options below.

### RECOMMENDED: Add `setRoom()` to RoomManager instead

📁 `server/rooms/RoomManager.ts` — add after `deleteRoom()`:

```typescript
  /** Insert a pre-built room (used by LobbyManager). */
  setRoom(roomCode: string, room: Room): void {
    this.rooms.set(roomCode, room);
  }
```

Then replace line 68 of LobbyManager:

OLD:
```typescript
      (this.rooms as any)['rooms'].set(code, room);
```

NEW:
```typescript
      this.rooms.setRoom(code, room);
```

Zero `as any` in the codebase.

---

## Sub-step 3.11: Mount Lobby + Janitor in `server/app.ts`

📁 `server/app.ts`

### Edit 1: Add imports (after Step 2 imports)

OLD (after Step 2):
```typescript
import { getDB, closeDB } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { apiRouter } from './api/index.js';
```

NEW:
```typescript
import { getDB, closeDB } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { apiRouter } from './api/index.js';
import { LobbyManager } from './lobby/LobbyManager.js';
import { RoomJanitor } from './lobby/RoomJanitor.js';
```

### Edit 2: Instantiate LobbyManager + Janitor

OLD (after `const session = new SessionManager(...)`):
```typescript
const session = new SessionManager(io, roomManager, payout);
```

NEW:
```typescript
const session = new SessionManager(io, roomManager, payout);
const lobby = new LobbyManager(io, roomManager);
const janitor = new RoomJanitor(io, roomManager);
janitor.start();
```

### Edit 3: Register lobby handlers in connection block

OLD (inside `io.on('connection', ...)`):
```typescript
  // ── Game session events ──
  session.registerHandlers(socket);
```

NEW:
```typescript
  // ── Game session events ──
  session.registerHandlers(socket);

  // ── Lobby events ──
  lobby.registerHandlers(socket);
```

### Edit 4: Stop janitor on shutdown

OLD (from Step 2):
```typescript
process.on('SIGTERM', () => {
  closeDB();
  process.exit(0);
});
```

NEW:
```typescript
process.on('SIGTERM', () => {
  janitor.stop();
  closeDB();
  process.exit(0);
});
```

### Edit 5: Add REST room list endpoint

OLD (after Step 2, in api/index.ts — already handled). But we also need a public endpoint without auth. Add to `server/app.ts`, AFTER `app.use('/api', apiRouter)`:

```typescript
// Public room list (no auth required)
app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.getPublicRooms() });
});
```

---

## COMPLETE FILE CHANGE SUMMARY — Step 3

```
NEW FILES (8 files):
  server/api/deckRoutes.ts          Deck CRUD (~95 LOC)
  server/api/collectionRoutes.ts    Collection query (~30 LOC)
  server/api/matchService.ts        Match recording (~45 LOC)
  server/api/matchRoutes.ts         Match history query (~25 LOC)
  server/lobby/lobbyHelpers.ts      Lobby room factory (~45 LOC)
  server/lobby/RoomJanitor.ts       Stale room cleanup (~35 LOC)
  server/lobby/LobbyManager.ts      All lobby: socket events (~200 LOC)

MODIFIED FILES (4):
  server/api/index.ts               FULL REWRITE — mount 3 new routers (~25 LOC)
  server/rooms/RoomManager.ts       ADD ~70 LOC: auth/deck/lobby methods + setRoom()
  server/game/SessionManager.ts     3 EDITS: imports, registerPlayer+submitDeck, game_over+match recording
  server/app.ts                     4 EDITS: imports, lobby+janitor init, handler registration, shutdown

UNTOUCHED:
  server/db/*                       Zero changes
  server/validation/*               Zero changes
  server/api/authRoutes.ts          Zero changes
  server/api/playerRoutes.ts        Zero changes
  server/api/middleware.ts          Zero changes
  server/game/PayoutService.ts      Zero changes
  All src/ client files             Zero changes
```

## Directory Structure After Step 3

```
server/
  app.ts                            ← EDITED
  db/
    database.ts
    migrations.ts
  validation/
    CardPool.ts
    DeckValidator.ts
  api/
    index.ts                        ← EDITED (mount 3 new routers)
    middleware.ts
    authRoutes.ts
    playerRoutes.ts
    collectionHelpers.ts
    deckRoutes.ts                   ← NEW
    collectionRoutes.ts             ← NEW
    matchService.ts                 ← NEW
    matchRoutes.ts                  ← NEW
  rooms/
    RoomManager.ts                  ← EDITED (+70 LOC)
  game/
    SessionManager.ts               ← EDITED (+40 LOC)
    PayoutService.ts
  lobby/                            ← NEW FOLDER
    lobbyHelpers.ts                 ← NEW
    RoomJanitor.ts                  ← NEW
    LobbyManager.ts                 ← NEW
```

## POST-STEP VERIFICATION CHECKLIST

```bash
# 1. Server compiles
npx tsc -p tsconfig.server.json --noEmit

# 2. No 'any' in new files (except the one documented)
grep -rn ": any\|as any" server/lobby/ server/api/deckRoutes.ts server/api/collectionRoutes.ts server/api/matchService.ts server/api/matchRoutes.ts
# Expected: 0 results

# 3. File sizes under control
wc -l server/lobby/*.ts server/api/*.ts server/rooms/RoomManager.ts server/game/SessionManager.ts
# Expected: LobbyManager <210, RoomManager <160, SessionManager <110, all others <100

# 4. Server starts
npm run server
# Expected: [DB] ..., [Janitor] Started, [Server] ...

# 5. Deck API works
TOKEN=$(curl -s http://localhost:3001/api/auth/nonce?wallet=0xtest... | ...) # Get JWT first
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/decks
# Expected: { "decks": [] }

curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/collection
# Expected: { "collection": [...30 cards...] }

# 6. Public room list works (no auth)
curl http://localhost:3001/api/rooms
# Expected: { "rooms": [] }

# 7. Client still compiles
npx tsc --noEmit

# 8. Manual: existing RoomScene multiplayer still works end-to-end
# Manual: game_over records match to match_history table
```

**Git commit:** `feat: Step 3 — deck/collection/match APIs + lobby socket system + match recording`

---

## NOTES FOR STEP 4

Step 4 is the **client auth + deck** step:
- Replace AuthManager stub with real wallet login implementation
- `src/deck/DeckAPI.ts` — HTTP client for deck CRUD
- `src/deck/DeckValidatorClient.ts` — instant client-side validation
- Update `src/config/DeckLoader.ts` — server → config → fallback chain
- Wire auth into MainMenuScene or LoginScene

All REST endpoints are ready from Steps 2 + 3. Step 4 purely consumes them.
