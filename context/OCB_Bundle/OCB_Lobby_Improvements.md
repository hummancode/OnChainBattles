# OCB Lobby Architecture — Improvements & Gap Fixes

## Addendum to OCB_Lobby_Architecture_Plan.md

This document identifies 14 problems in the original plan and provides concrete fixes for each. Read this AFTER the original plan — it patches, it doesn't replace.

---

# GAP 1: SocketManager.connect() Auto-Fires Room Actions

## The Problem

Current `SocketManager.connect()` does this:

```typescript
connect(callbacks: RoomCallbacks): void {
    this.callbacks = callbacks;
    // ...
    this.socket = io(this.serverUrl);
    this.socket.on("connect", () => {
      this.actOnRoomAction();   // ← IMMEDIATELY creates/joins a room
    });
```

`actOnRoomAction()` checks `GameState.roomAction` and fires `createRoom` or `joinRoom`. This means **every scene that calls SocketManager.connect() will immediately trigger room creation**. LobbyScene, RoomBrowserScene, and HubScene all need a socket connection WITHOUT auto-room-action.

## The Fix

Add a `connectOnly()` method to SocketManager. Zero changes to existing `connect()`.

**File:** `src/network/SocketManager.ts`

**Add this new method** (after `connect()`, before `disconnect()`):

```typescript
  /**
   * Connect to server WITHOUT auto-creating/joining a room.
   * Used by LobbyScene, RoomBrowserScene, HubScene.
   * The caller controls when to create/join via lobby events.
   */
  connectOnly(callbacks?: Partial<RoomCallbacks>): void {
    if (callbacks) {
      this.callbacks = {
        onRoomCreated: () => {},
        onRoomJoined: () => {},
        onOpponentJoined: () => {},
        onOpponentAction: () => {},
        onOpponentDisconnected: () => {},
        onOpponentRollReceived: () => {},
        onError: () => {},
        ...callbacks,
      } as RoomCallbacks;
    }

    if (this.socket?.connected) {
      console.log('[SocketManager] Already connected (connectOnly).');
      return;
    }

    console.log('[SocketManager] Connecting to server (no auto-action)...');
    this.socket = io(this.serverUrl);

    this.socket.on('connect', () => {
      console.log('[SocketManager] Connected (lobby mode).');
      // NO actOnRoomAction() here — caller decides what to do
    });

    this.socket.on('disconnect', () => {
      console.log('[SocketManager] Disconnected.');
    });

    this.registerEvents();
  }

  /** Expose socket for LobbySocketManager to attach lobby: events */
  getSocket(): any {
    return this.socket;
  }

  /** Check if connected */
  isConnected(): boolean {
    return !!this.socket?.connected;
  }
```

Now update LobbyScene to use `connectOnly()` instead of the fragile polling pattern:

**LobbyScene.ts — replace `connectAndSetup()` method:**

**OLD:**
```typescript
  private connectAndSetup(): void {
    if (!(SocketManager as any).socket?.connected) {
      SocketManager.connect({
        onRoomCreated: () => {},
        // ...
      });
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
```

**NEW:**
```typescript
  private connectAndSetup(): void {
    if (SocketManager.isConnected()) {
      this.registerLobbyEvents();
      this.initiateRoom();
      return;
    }

    SocketManager.connectOnly({
      onError: (msg) => this.statusText.setText(`Error: ${msg}`).setColor('#ff4444'),
    });

    // Wait for connection
    const socket = SocketManager.getSocket();
    if (socket) {
      socket.once('connect', () => {
        this.registerLobbyEvents();
        this.initiateRoom();
      });
    }
  }
```

And **LobbySocketManager.ts — replace `getSocket()`:**

**OLD:**
```typescript
  private getSocket(): any {
    if (this.socket) return this.socket;
    this.socket = (SocketManager as any).socket;
    return this.socket;
  }
```

**NEW:**
```typescript
  private getSocket(): any {
    if (this.socket) return this.socket;
    this.socket = SocketManager.getSocket();
    return this.socket;
  }
```

---

# GAP 2: Crypto Deposit Flow Missing from LobbyScene

## The Problem

RoomScene has a complex crypto flow: host deposits → `hostDepositConfirmed` → joiner deposits → `bothCryptoReady` → enter battle. LobbyScene has none of this. If a player selects CRYPTO mode, the lobby must handle deposits before game start.

## The Fix

The crypto deposit phase becomes an intermediate state between "all players ready" and "game starting". The host clicks START → if crypto mode, deposits flow runs → THEN `lobby:game_starting` fires.

**Add to `server/lobbyEvents.js` — replace the `lobby:start_game` handler:**

```js
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

    const allReady = room.players
      .filter(p => p.id !== room.hostSocketId)
      .every(p => p.ready);

    if (!allReady) {
      socket.emit('lobby:error', { message: 'All players must be ready.' });
      return;
    }

    // If crypto mode, enter deposit phase instead of starting directly
    if (room.settings.isCrypto) {
      room.status = 'depositing';
      room.cryptoReady = { count: 0 };
      io.to(roomCode).emit('lobby:state', roomToLobbyState(room));
      io.to(roomCode).emit('lobby:deposit_phase', {
        stakeAmount: room.settings.stakeAmount,
      });
      console.log(`[Lobby] Room ${roomCode} entering crypto deposit phase`);
      return;
    }

    // Free play — start immediately
    startGame(room, roomCode, io, rooms);
  });

  // Crypto ready signal (works with existing cryptoReady flow)
  socket.on('lobby:crypto_ready', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'depositing') return;
    room.cryptoReady.count++;

    const player = room.players.find(p => p.id === socket.id);
    console.log(`[Lobby] cryptoReady: ${room.cryptoReady.count}/2 in ${roomCode} (${player?.name})`);

    if (room.cryptoReady.count === 1) {
      // First deposit confirmed — tell other player
      socket.to(roomCode).emit('lobby:opponent_deposited');
    } else if (room.cryptoReady.count >= 2) {
      // Both deposited — start game
      io.to(roomCode).emit('lobby:both_deposited');
      setTimeout(() => startGame(room, roomCode, io, rooms), 1000);
    }
  });
```

**Extract `startGame` as a shared function at the top of `lobbyEvents.js`:**

```js
function startGame(room, roomCode, io, rooms) {
  room.status = 'in_progress';

  const seed = Math.floor(Math.random() * 999999);
  room.gameSeed = seed;

  io.to(roomCode).emit('lobby:game_starting', {
    seed,
    players: room.players.map((p, i) => ({
      name: p.name,
      playerIndex: i,
      isHost: p.id === room.hostSocketId,
    })),
  });

  // Emit legacy events for BattleScene compatibility
  io.to(roomCode).emit('game_seed', { seed });
  room.players.forEach((p, i) => {
    io.to(p.id).emit('roomCreated', { roomCode, playerIndex: i });
    const oppIdx = i === 0 ? 1 : 0;
    io.to(p.id).emit('opponentJoined', {
      playerName: room.players[oppIdx].name,
      playerIndex: i,
    });
  });

  console.log(`[Lobby] Game starting in ${roomCode}, seed: ${seed}`);
}
```

**Add to `LobbySocketManager.ts` — new events:**

```typescript
  signalCryptoReady(roomCode: string): void {
    this.emit('lobby:crypto_ready', { roomCode });
  }

  onDepositPhase(fn: Callback<{ stakeAmount: number }>): void {
    this.on('lobby:deposit_phase', fn);
  }

  onOpponentDeposited(fn: Callback<void>): void {
    this.on('lobby:opponent_deposited', fn as any);
  }

  onBothDeposited(fn: Callback<void>): void {
    this.on('lobby:both_deposited', fn as any);
  }
```

**Add to `LobbyScene.ts` — deposit handling inside `registerLobbyEvents()`:**

```typescript
    LobbySocket.onDepositPhase(async ({ stakeAmount }) => {
      this.statusText.setText('Deposit phase — lock your funds!').setColor('#f5a623');
      // Trigger escrow deposit (reuse existing EscrowManager)
      try {
        const EscrowManager = (await import('../web3/EscrowManager')).default;
        const isHost = this.isHost;
        const txHash = isHost
          ? await EscrowManager.createMatch(this.roomCode)
          : await EscrowManager.joinMatch(this.roomCode);

        (GameState as any).depositTxHash = txHash;
        this.statusText.setText('Funds locked ✓ Waiting for opponent...').setColor('#4fc3f7');
        LobbySocket.signalCryptoReady(this.roomCode);
      } catch (err: any) {
        this.statusText.setText(`Deposit failed: ${err.message}`).setColor('#ff4444');
      }
    });

    LobbySocket.onOpponentDeposited(() => {
      this.statusText.setText('Opponent deposited! Your turn...').setColor('#f5a623');
    });

    LobbySocket.onBothDeposited(() => {
      this.statusText.setText('Both deposited! Starting game...').setColor('#00ff88');
    });
```

---

# GAP 3: `prompt()` in HubScene is Terrible UX

## The Problem

```typescript
const code = prompt('Enter room code:');
```

This breaks the Phaser canvas focus, looks ugly, and doesn't work on mobile.

## The Fix

Replace with a DOMInputManager overlay, same pattern as MainMenuScene.

**Replace `showJoinByCode()` in HubScene:**

**OLD:**
```typescript
  private showJoinByCode(): void {
    const code = prompt('Enter room code:');
    if (code && code.trim().length >= 6) {
      GameState.setRoomCode(code.trim().toUpperCase());
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('LobbyScene', { mode: 'join', roomCode: code.trim().toUpperCase() });
      });
    }
  }
```

**NEW:**
```typescript
  private joinCodeOverlay: Phaser.GameObjects.Container | null = null;
  private joinInputManager: DOMInputManager | null = null;

  private showJoinByCode(): void {
    if (this.joinCodeOverlay) return; // Already showing

    // Dim background
    const dimBg = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6)
      .setInteractive(); // blocks clicks through

    // Panel
    const panel = this.add.rectangle(640, 340, 400, 180, 0x16213E)
      .setStrokeStyle(1, 0x253348);

    const label = this.add.text(640, 280, 'Enter Room Code', {
      fontSize: '18px', fontFamily: '"Courier New"', color: '#ffffff',
    }).setOrigin(0.5);

    this.joinInputManager = new DOMInputManager(this);
    const input = this.joinInputManager.createInput({
      gameX: 640, gameY: 340, width: 280, height: 44,
      placeholder: '6-digit code...', maxLength: 6, uppercase: true,
    });

    const joinBtn = new MenuButton(this, 580, 400, '[ JOIN ]', {
      color: '#00FF88', fontSize: '16px',
      onPointerDown: () => {
        const code = input.value.trim().toUpperCase();
        if (code.length >= 6) {
          this.closeJoinOverlay();
          GameState.setRoomCode(code);
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('LobbyScene', { mode: 'join', roomCode: code });
          });
        } else {
          ToastNotification.show(this, 'Code must be 6 digits', { color: '#ff4444' });
        }
      },
    });

    const cancelBtn = new MenuButton(this, 720, 400, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => this.closeJoinOverlay(),
    });

    this.joinCodeOverlay = this.add.container(0, 0, [dimBg, panel, label, joinBtn.text, cancelBtn.text]);

    input.focus();
  }

  private closeJoinOverlay(): void {
    this.joinInputManager?.destroyAll();
    this.joinInputManager = null;
    this.joinCodeOverlay?.destroy(true);
    this.joinCodeOverlay = null;
  }
```

**Add import to HubScene:**
```typescript
import { DOMInputManager } from '../ui/DOMInputManager';
```

---

# GAP 4: Room Stale Cleanup / TTL

## The Problem

If a host creates a room and closes the browser without disconnecting cleanly, the room stays in the `rooms` object forever (until server restart).

## The Fix

**Add to `server/lobbyEvents.js` — room janitor (at the module level, outside `registerLobbyEvents`):**

```js
const ROOM_TTL_MS = 30 * 60 * 1000;  // 30 minutes
const JANITOR_INTERVAL = 60 * 1000;   // Check every minute

function startRoomJanitor(rooms, io) {
  setInterval(() => {
    const now = Date.now();
    for (const code in rooms) {
      const room = rooms[code];
      const age = now - room.createdAt;

      // Delete empty rooms older than 5 minutes
      if (room.players.length === 0 && age > 5 * 60 * 1000) {
        delete rooms[code];
        continue;
      }

      // Delete waiting rooms older than TTL
      if (room.status === 'waiting' && age > ROOM_TTL_MS) {
        io.to(code).emit('lobby:system_message', {
          text: 'Room expired due to inactivity.',
          timestamp: Date.now(),
        });
        io.to(code).emit('lobby:kicked', { reason: 'Room expired.' });
        delete rooms[code];
        continue;
      }
    }
  }, JANITOR_INTERVAL);
}

module.exports = { registerLobbyEvents, startRoomJanitor };
```

**Mount in `server/index.js` (add after the `io.on('connection')` block):**

```js
const { startRoomJanitor } = require('./lobbyEvents');
startRoomJanitor(rooms, io);
```

---

# GAP 5: Player Can Be in Multiple Rooms

## The Problem

Nothing prevents a player from creating/joining multiple rooms simultaneously. This creates ghost players in rooms and breaks the flow.

## The Fix

**Add to `server/lobbyEvents.js` — at the start of both `lobby:create` and `lobby:join` handlers:**

```js
  // ── Guard: leave any existing room first ──
  function leaveAllRooms(socketId) {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socketId);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        socket.leave(code);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (room.hostSocketId === socketId) {
            room.hostSocketId = room.players[0].id;
            room.hostPlayerId = room.players[0].playerId;
          }
          io.to(code).emit('lobby:state', roomToLobbyState(room));
        }
      }
    }
  }
```

Then call `leaveAllRooms(socket.id)` as the first line in both `lobby:create` and `lobby:join`:

```js
  socket.on('lobby:create', ({ playerName, settings }) => {
    leaveAllRooms(socket.id);  // ← ADD
    const code = Math.floor(...);
    // ...
  });

  socket.on('lobby:join', ({ roomCode, playerName }) => {
    leaveAllRooms(socket.id);  // ← ADD
    const room = rooms[roomCode];
    // ...
  });
```

---

# GAP 6: Chat Rate Limiting

## The Problem

No rate limit on `lobby:chat`. A player can spam hundreds of messages per second.

## The Fix

**Add to `server/lobbyEvents.js` — per-socket rate tracking:**

```js
  // Chat rate limiter: 3 messages per 2 seconds per socket
  const chatTimestamps = [];  // Array of Date.now() values
  const CHAT_RATE_WINDOW = 2000;
  const CHAT_RATE_MAX = 3;

  socket.on('lobby:chat', ({ roomCode, text }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Rate limit check
    const now = Date.now();
    // Remove timestamps outside the window
    while (chatTimestamps.length > 0 && now - chatTimestamps[0] > CHAT_RATE_WINDOW) {
      chatTimestamps.shift();
    }
    if (chatTimestamps.length >= CHAT_RATE_MAX) {
      socket.emit('lobby:error', { message: 'Slow down — too many messages.' });
      return;
    }
    chatTimestamps.push(now);

    // Sanitize (unchanged from original)
    const cleanText = String(text).trim().slice(0, MAX_CHAT_LENGTH);
    if (!cleanText) return;

    const msg = {
      sender: player.name,
      text: cleanText,
      timestamp: now,
    };

    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT_MESSAGES) {
      room.chat = room.chat.slice(-MAX_CHAT_MESSAGES);
    }

    io.to(roomCode).emit('lobby:chat_message', msg);
  });
```

---

# GAP 7: Private Room Access Control

## The Problem

"Private" rooms (`isPublic: false`) are just unlisted. Anyone with the code can still join. No password protection.

## The Fix

Add an optional `password` field to room settings.

**Extend `createRoom()` in `server/roomModel.js`:**

```js
function createRoom(code, hostPlayer, settings = {}) {
  return {
    // ... existing fields ...
    settings: {
      isPublic:    settings.isPublic ?? true,
      isCrypto:    settings.isCrypto ?? false,
      maxPlayers:  2,
      roomName:    settings.roomName || `${hostPlayer.name}'s Room`,
      stakeAmount: settings.stakeAmount ?? 0,
      password:    settings.password || null,   // ← ADD
    },
    // ... rest unchanged ...
  };
}
```

**Add password check to `lobby:join` in `lobbyEvents.js`:**

```js
  socket.on('lobby:join', ({ roomCode, playerName, password }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('lobby:error', { message: 'Room not found.' });
      return;
    }
    // Password check
    if (room.settings.password && room.settings.password !== password) {
      socket.emit('lobby:password_required', { roomCode });
      return;
    }
    // ... rest unchanged ...
  });
```

**Add to LobbySocketManager.ts:**

```typescript
  onPasswordRequired(fn: Callback<{ roomCode: string }>): void {
    this.on('lobby:password_required', fn);
  }
```

**And strip password from public listing in `roomToPublicListing()`:**

```js
function roomToPublicListing(room) {
  return {
    code: room.code,
    roomName: room.settings.roomName,
    hostName: room.players[0]?.name ?? 'Unknown',
    playerCount: room.players.length,
    maxPlayers: room.settings.maxPlayers,
    isCrypto: room.settings.isCrypto,
    stakeAmount: room.settings.stakeAmount,
    hasPassword: !!room.settings.password,   // ← ADD (boolean only, not the value)
    status: room.status,
    createdAt: room.createdAt,
  };
}
```

---

# GAP 8: Deck Integration with Lobby Flow

## The Problem

The auth/deck plan has `submitDeck` on the socket + server validation. The lobby plan's `lobby:start_game` doesn't trigger deck submission/validation.

## The Fix

Deck submission happens BETWEEN "all ready" and "game starting". The server waits for both decks before emitting `lobby:game_starting`.

**Modify `startGame()` in `lobbyEvents.js`:**

```js
function startGame(room, roomCode, io, rooms) {
  room.status = 'starting';

  // Request decks from both players
  io.to(roomCode).emit('lobby:submit_decks');
  console.log(`[Lobby] Requesting decks in ${roomCode}`);

  // Set a timeout — if decks don't arrive in 10s, start with defaults
  room._deckTimeout = setTimeout(() => {
    if (room.status === 'starting') {
      console.log(`[Lobby] Deck timeout — starting with defaults in ${roomCode}`);
      launchGame(room, roomCode, io);
    }
  }, 10000);
}

function launchGame(room, roomCode, io) {
  room.status = 'in_progress';
  if (room._deckTimeout) clearTimeout(room._deckTimeout);

  const seed = Math.floor(Math.random() * 999999);
  room.gameSeed = seed;

  io.to(roomCode).emit('lobby:game_starting', {
    seed,
    players: room.players.map((p, i) => ({
      name: p.name,
      playerIndex: i,
      isHost: p.id === room.hostSocketId,
    })),
  });

  // Legacy events for BattleScene
  io.to(roomCode).emit('game_seed', { seed });
  room.players.forEach((p, i) => {
    io.to(p.id).emit('roomCreated', { roomCode, playerIndex: i });
    const oppIdx = i === 0 ? 1 : 0;
    io.to(p.id).emit('opponentJoined', {
      playerName: room.players[oppIdx].name,
      playerIndex: i,
    });
  });

  console.log(`[Lobby] Game launched in ${roomCode}, seed: ${seed}`);
}
```

**Add deck submission handler in `lobbyEvents.js`:**

```js
  socket.on('lobby:deck_submitted', ({ roomCode, deckIds }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'starting') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Validate if validator is available
    try {
      const { validateDeck } = require('./deckValidator');
      const result = validateDeck(deckIds, null); // Skip ownership for now
      if (!result.valid) {
        socket.emit('lobby:error', { message: `Invalid deck: ${result.errors[0]}` });
        return;
      }
    } catch { /* validator not deployed yet — accept any deck */ }

    player.deckIds = deckIds;
    console.log(`[Lobby] Deck submitted by ${player.name} in ${roomCode}`);

    // If both decks received, launch immediately
    if (room.players.length >= 2 && room.players.every(p => p.deckIds)) {
      launchGame(room, roomCode, io);
    }
  });
```

**Client side — handle `lobby:submit_decks` in LobbyScene `registerLobbyEvents()`:**

```typescript
    LobbySocket.onSubmitDecks(async () => {
      this.statusText.setText('Submitting deck...').setColor('#f5a623');
      // Load deck from DeckLoader (already handles server/config/fallback priority)
      try {
        const { DeckLoader } = await import('../config/DeckLoader');
        await DeckLoader.load();
        const deckIds = DeckLoader.get();
        LobbySocket.submitDeck(this.roomCode, deckIds);
      } catch {
        // If DeckLoader isn't available, send empty — server will use timeout fallback
        LobbySocket.submitDeck(this.roomCode, []);
      }
    });
```

**Add to `LobbySocketManager.ts`:**

```typescript
  submitDeck(roomCode: string, deckIds: string[]): void {
    this.emit('lobby:deck_submitted', { roomCode, deckIds });
  }

  onSubmitDecks(fn: Callback<void>): void {
    this.on('lobby:submit_decks', fn as any);
  }
```

---

# GAP 9: Rematch Flow Missing

## The Problem

After ResultScene, going to HubScene means players must recreate a room to rematch. This is high-friction for back-to-back games.

## The Fix

ResultScene gets a "REMATCH" button that creates a new room with the same opponent. The room code is passed through GameState.

**Add to ResultScene (wherever the button panel is rendered):**

```typescript
    // Rematch button — only if we came from a lobby game
    if (GameState.roomCode) {
      const rematchBtn = new MenuButton(this, CX, 520, '[ REMATCH ]', {
        color: '#4FC3F7', fontSize: '18px',
        onPointerDown: () => {
          // Go back to LobbyScene as host, opponent can join by code
          this.cameras.main.fadeOut(300, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('LobbyScene', { mode: 'host' });
          });
        },
      });
    }
```

**For a true instant-rematch (both players), add a server-side rematch event (future enhancement):**

```js
  // server/lobbyEvents.js
  socket.on('lobby:request_rematch', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'finished') return;
    // Notify opponent
    socket.to(roomCode).emit('lobby:rematch_requested', {
      requesterName: room.players.find(p => p.id === socket.id)?.name,
    });
  });

  socket.on('lobby:accept_rematch', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    // Reset room state
    room.status = 'waiting';
    room.settled = false;
    room.gameSeed = 0;
    room.players.forEach(p => { p.ready = false; p.deckIds = null; });
    io.to(roomCode).emit('lobby:state', roomToLobbyState(room));
    io.to(roomCode).emit('lobby:system_message', {
      text: 'Rematch accepted! Get ready.',
      timestamp: Date.now(),
    });
  });
```

---

# GAP 10: Room Code Collision

## The Problem

`Math.floor(100000 + Math.random() * 900000)` generates a 6-digit code. With many rooms, collisions become likely.

## The Fix

**Replace code generation in `lobbyEvents.js`:**

```js
  function generateUniqueCode(rooms) {
    let code;
    let attempts = 0;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      attempts++;
      if (attempts > 100) {
        // Extremely unlikely — use 7 digits
        code = Math.floor(1000000 + Math.random() * 9000000).toString();
        break;
      }
    } while (rooms[code]);
    return code;
  }
```

Then use it: `const code = generateUniqueCode(rooms);`

---

# GAP 11: Room Browser Auto-Refresh

## The Problem

Room list only loads once on scene create. No live updates.

## The Fix

**Add auto-refresh timer to `RoomBrowserScene.ts`:**

```typescript
  private refreshTimer: Phaser.Time.TimerEvent | null = null;

  async create(): Promise<void> {
    // ... existing create code ...

    await this.loadRooms();

    // Auto-refresh every 5 seconds
    this.refreshTimer = this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => this.loadRooms(),
    });
  }

  // Clean up on scene exit (add to existing shutdown or add shutdown method)
  shutdown(): void {
    this.refreshTimer?.remove();
  }
```

---

# GAP 12: Room Status in `roomToLobbyState` Should Include Deposit Phase

## The Problem

`roomToLobbyState()` returns `status` but the `'depositing'` status is new and client code doesn't handle it.

## The Fix

**Update `roomModel.js` — add `depositing` to the JSDoc and to `roomToLobbyState`:**

```js
/**
 * @typedef {'waiting' | 'full' | 'depositing' | 'starting' | 'in_progress' | 'finished'} RoomStatus
 */
```

**In LobbyScene, react to status changes inside `onStateUpdate`:**

```typescript
    LobbySocket.onStateUpdate((state) => {
      this.lobbyState = state;
      this.renderPlayerList(state.players);
      // ... existing code ...

      // Update status text based on room status
      switch (state.status) {
        case 'waiting':
          if (state.players.length < 2)
            this.statusText.setText('Waiting for players...');
          else
            this.statusText.setText('All players here. Ready up!');
          break;
        case 'depositing':
          this.statusText.setText('Crypto deposit phase...').setColor('#f5a623');
          break;
        case 'starting':
          this.statusText.setText('Validating decks...').setColor('#4fc3f7');
          break;
        case 'in_progress':
          this.statusText.setText('Game in progress!').setColor('#00ff88');
          break;
      }
    });
```

---

# GAP 13: HubScene Host Options (Public/Private/Crypto)

## The Problem

HubScene's "HOST A GAME" button goes directly to LobbyScene with no settings. The player needs to choose public/private and free/crypto BEFORE entering the lobby.

## The Fix

Add a host settings overlay in HubScene:

**Replace `goToLobbyAsHost()` in HubScene:**

```typescript
  private hostOverlay: Phaser.GameObjects.Container | null = null;

  private goToLobbyAsHost(): void {
    if (this.hostOverlay) return;

    const dimBg = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6)
      .setInteractive();
    const panel = this.add.rectangle(640, 340, 440, 280, 0x16213E)
      .setStrokeStyle(1, 0x253348);
    const title = this.add.text(640, 230, 'HOST SETTINGS', {
      fontSize: '20px', fontFamily: '"Courier New"', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    // Toggle states
    let isPublic = true;
    let isCrypto = false;

    const publicBtn = this.add.text(640, 290, '[ PUBLIC ROOM ]', {
      fontSize: '16px', fontFamily: '"Courier New"', color: '#00FF88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    publicBtn.on('pointerdown', () => {
      isPublic = !isPublic;
      publicBtn.setText(isPublic ? '[ PUBLIC ROOM ]' : '[ PRIVATE ROOM ]');
      publicBtn.setColor(isPublic ? '#00FF88' : '#F5A623');
    });

    const cryptoBtn = this.add.text(640, 330, '[ FREE PLAY ]', {
      fontSize: '16px', fontFamily: '"Courier New"', color: '#00FF88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cryptoBtn.on('pointerdown', () => {
      isCrypto = !isCrypto;
      cryptoBtn.setText(isCrypto ? '[ CRYPTO MODE ]' : '[ FREE PLAY ]');
      cryptoBtn.setColor(isCrypto ? '#F5A623' : '#00FF88');
      if (isCrypto) GameState.currentMode = GameMode.CryptoPlay;
      else GameState.currentMode = GameMode.FreePlay;
    });

    const goBtn = new MenuButton(this, 580, 400, '[ CREATE ]', {
      color: '#00FF88', fontSize: '20px',
      onPointerDown: () => {
        this.hostOverlay?.destroy(true);
        this.hostOverlay = null;
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('LobbyScene', {
            mode: 'host',
            settings: { isPublic, isCrypto },
          });
        });
      },
    });

    const cancelBtn = new MenuButton(this, 720, 400, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '14px',
      onPointerDown: () => {
        this.hostOverlay?.destroy(true);
        this.hostOverlay = null;
      },
    });

    this.hostOverlay = this.add.container(0, 0, [
      dimBg, panel, title, publicBtn, cryptoBtn, goBtn.text, cancelBtn.text,
    ]);
  }
```

**Update `LobbySceneData` to carry settings:**

```typescript
interface LobbySceneData {
  mode: 'host' | 'join';
  roomCode?: string;
  settings?: { isPublic?: boolean; isCrypto?: boolean };
}
```

**Update `initiateRoom()` in LobbyScene:**

```typescript
  private initiateRoom(): void {
    if (this.sceneData.mode === 'host') {
      LobbySocket.createRoom(GameState.playerName, {
        isPublic: this.sceneData.settings?.isPublic ?? true,
        isCrypto: this.sceneData.settings?.isCrypto ?? false,
      });
    } else if (this.sceneData.roomCode) {
      LobbySocket.joinRoom(this.sceneData.roomCode, GameState.playerName);
    }
  }
```

---

# GAP 14: BattleScene → game_over Marks Room as Finished

## The Problem

When the game ends, the server `game_over` handler sets `room.settled = true` but doesn't update `room.status`. The lobby room model has `'finished'` status but it's never set.

## The Fix

**In `server/index.js` — inside the existing `game_over` handler, after `room.settled = true;`:**

```js
  room.status = 'finished';
```

This one-liner lets the janitor know this room is done, and enables the rematch flow to check for `'finished'` status.

---

# REVISED FILE MAP (Additions to Original Plan)

```
ORIGINAL PLAN FILES (unchanged):
  server/roomModel.js          + password field, hasPassword in listing
  server/lobbyEvents.js        + crypto flow, deck flow, rate limit, janitor,
                                 collision-safe codes, leaveAllRooms guard,
                                 rematch, launchGame extracted
  src/lobby/LobbySocketManager.ts  + crypto events, deck events, password event
  src/scenes/LoginScene.ts     (unchanged)
  src/scenes/HubScene.ts       + host settings overlay, join code overlay
  src/scenes/RoomBrowserScene.ts  + auto-refresh timer
  src/scenes/LobbyScene.ts     + crypto deposit flow, deck submission,
                                 status-based text, connectOnly()

ADDITIONAL EDITS (from this document):
  src/network/SocketManager.ts
    └─ Add: connectOnly(), getSocket(), isConnected()

  server/index.js
    └─ Add: startRoomJanitor(rooms, io) call
    └─ Add: room.status = 'finished' in game_over handler
```

# REVISED IMPLEMENTATION ORDER

| Step | What | Hours | Note |
|---|---|---|---|
| **1** | `server/roomModel.js` with password field | 2h | |
| **2** | `server/lobbyEvents.js` with ALL fixes from this doc | 5-6h | Biggest piece |
| **3** | `SocketManager.ts` — add `connectOnly()`, `getSocket()`, `isConnected()` | 0.5h | **Do this first on client side** |
| **4** | `LobbySocketManager.ts` with all events | 2-3h | |
| **5** | `LoginScene.ts` | 2h | |
| **6** | `HubScene.ts` with overlays | 3-4h | |
| **7** | `RoomBrowserScene.ts` with auto-refresh | 2h | |
| **8** | `LobbyScene.ts` with crypto + deck + status | 5-7h | Biggest client piece |
| **9** | Wire `main.ts`, `PreloadScene`, `ResultScene` | 0.5h | |
| **10** | Integration testing: full flow | 2-3h | |
| **Total** | | **~24-30h** | Up from ~16-21h |

The increase is because we now handle crypto, decks, rate limiting, room passwords, and rematch — which were silently missing before.
