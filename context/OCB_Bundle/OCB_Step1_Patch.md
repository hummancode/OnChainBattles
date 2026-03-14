# Step 1 Patch: Shared Foundation

**Git branch:** `feat/step1-shared-foundation`
**Estimated time:** 2–3 hours
**Verification:** `npx tsc --noEmit` after each sub-step

---

## Sub-step 1.1: Extend `shared/types/NetworkEvents.ts`

> **Why:** Every new socket event from both plans (deck, auth, lobby) must exist in the typed contract. Without this, tsc rejects all future code.

📁 `shared/types/NetworkEvents.ts`

**FULL REWRITE** — file grows from ~60 LOC to ~180 LOC. Every addition is a new interface or event entry. Existing events/interfaces are unchanged.

```typescript
// ============================================================
// NetworkEvents.ts
// Shared client ↔ server event contracts.
// Both SocketManager.ts and server/app.ts import from here.
//
// RULE: Every socket event MUST be declared here.
// No inline type assertions. No (data as any).
// ============================================================

// ─── Game Actions (relayed between players) ──────────────────

export interface GameAction {
  type: 'PLAY_CARD' | 'MOVE_UNIT' | 'ATTACK_UNIT' | 'END_PLAY_PHASE' | 'END_ACT_PHASE' | 'SELECT_POSITION';
  handIndex?: number;
  col?: number;
  row?: number;
  fromCol?: number;
  fromRow?: number;
  targetCol?: number;
  targetRow?: number;
}

// ─── Payout ─────────────────────────────────────────────────

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

// ─── Room Settings (lobby) ──────────────────────────────────

export interface RoomSettings {
  isPublic: boolean;
  isCrypto: boolean;
  maxPlayers: number;
  roomName: string;
  stakeAmount: number;
  password: string | null;
}

// ─── Chat ───────────────────────────────────────────────────

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

// ─── Room Player (server-side) ──────────────────────────────

export interface RoomPlayer {
  id: string;
  name: string;
  wallet: string | null;
  // Auth/Deck extensions (optional — backward compatible)
  playerId?: number | null;
  deckIds?: string[] | null;
  ready?: boolean;
}

// ─── Room ───────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'full' | 'depositing' | 'starting' | 'in_progress' | 'finished';

export interface Room {
  players: RoomPlayer[];
  gameSeed: number | null;
  cryptoReadyCount: number;
  settled: boolean;
  // Lobby extensions (optional — backward compatible)
  hostSocketId?: string;
  hostPlayerId?: number | null;
  status?: RoomStatus;
  settings?: RoomSettings;
  chat?: ChatMessage[];
  createdAt?: number;
}

// ─── Lobby State (sent to players inside a room) ────────────

export interface LobbyPlayerInfo {
  name: string;
  playerId: number | null;
  ready: boolean;
  isHost: boolean;
  hasDeck: boolean;
}

export interface LobbyState {
  code: string;
  settings: RoomSettings;
  status: RoomStatus;
  players: LobbyPlayerInfo[];
  chat: ChatMessage[];
}

export interface PublicRoomListing {
  code: string;
  roomName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isCrypto: boolean;
  stakeAmount: number;
  hasPassword: boolean;
  status: RoomStatus;
  createdAt: number;
}

export interface GameStartingData {
  seed: number;
  players: Array<{
    name: string;
    playerIndex: number;
    isHost: boolean;
  }>;
}

// ─── Client → Server Events ─────────────────────────────────

export interface ClientToServerEvents {
  // Existing room events
  createRoom:     (data: { roomCode: string; playerName: string }) => void;
  joinRoom:       (data: { roomCode: string; playerName: string }) => void;
  registerWallet: (data: { roomCode: string; walletAddress: string }) => void;
  cryptoReady:    (data: { roomCode: string }) => void;
  game_action:    (data: { roomCode: string; action: GameAction }) => void;
  game_over:      (data: { roomCode: string; winnerIndex: number; totalTurns?: number }) => void;

  // Auth/Deck events
  registerPlayer: (data: { token: string }) => void;
  submitDeck:     (data: { roomCode: string; deckIds: string[] }) => void;

  // Lobby events
  'lobby:create':         (data: { playerName: string; settings?: Partial<RoomSettings> }) => void;
  'lobby:join':           (data: { roomCode: string; playerName: string; password?: string }) => void;
  'lobby:leave':          (data: { roomCode: string }) => void;
  'lobby:chat':           (data: { roomCode: string; text: string }) => void;
  'lobby:ready':          (data: { roomCode: string }) => void;
  'lobby:kick':           (data: { roomCode: string; targetPlayerName: string }) => void;
  'lobby:settings':       (data: { roomCode: string; settings: Partial<RoomSettings> }) => void;
  'lobby:start_game':     (data: { roomCode: string }) => void;
  'lobby:crypto_ready':   (data: { roomCode: string }) => void;
  'lobby:deck_submitted': (data: { roomCode: string; deckIds: string[] }) => void;
  'lobby:list':           () => void;
}

// ─── Server → Client Events ─────────────────────────────────

export interface ServerToClientEvents {
  // Existing room events
  roomCreated:          (data: { roomCode: string; playerIndex: number }) => void;
  roomJoined:           (data: { roomCode: string; playerIndex: number }) => void;
  opponentJoined:       (data: { playerName: string; playerIndex: number }) => void;
  opponent_action:      (action: GameAction) => void;
  game_seed:            (data: { seed: number }) => void;
  opponentDisconnected: () => void;
  hostDepositConfirmed: () => void;
  bothCryptoReady:      () => void;
  payout_result:        (data: PayoutResult) => void;
  error:                (data: { message: string }) => void;

  // Deck validation events
  deckAccepted:   (data: { cardCount: number }) => void;
  deckRejected:   (data: { errors: string[] }) => void;
  bothDecksReady: () => void;

  // Lobby events
  'lobby:created':          (data: { code: string }) => void;
  'lobby:joined':           (data: { code: string }) => void;
  'lobby:state':            (data: LobbyState) => void;
  'lobby:room_list':        (data: { rooms: PublicRoomListing[] }) => void;
  'lobby:chat_message':     (data: ChatMessage) => void;
  'lobby:system_message':   (data: { text: string; timestamp: number }) => void;
  'lobby:kicked':           (data: { reason: string }) => void;
  'lobby:game_starting':    (data: GameStartingData) => void;
  'lobby:error':            (data: { message: string }) => void;
  'lobby:deposit_phase':    (data: { stakeAmount: number }) => void;
  'lobby:opponent_deposited': () => void;
  'lobby:both_deposited':   () => void;
  'lobby:submit_decks':     () => void;
  'lobby:password_required': (data: { roomCode: string }) => void;
}
```

### Verification
```bash
npx tsc -p tsconfig.server.json --noEmit   # Server compiles
npx tsc --noEmit                            # Client compiles (existing imports still work)
```

---

## Sub-step 1.2: Fix SocketManager `GameAction` Duplication

> **Why:** Coding Principles §6.2 — "Types as Documentation." One canonical definition, not two.
> Also §6.4 — "One Export, One Concern Per File."

📁 `src/network/SocketManager.ts`

**Delete the local `GameAction` interface and import from shared types.**

OLD (lines 3–10 of the file body):
```typescript
import { io, Socket } from "socket.io-client";
import GameState, { RoomAction } from "../GameState.ts";
export interface GameAction {
  type: 'PLAY_CARD' | 'MOVE_UNIT' | 'ATTACK_UNIT' | 'END_PLAY_PHASE' | 'END_ACT_PHASE' | 'SELECT_POSITION';
  handIndex?: number;
  col?: number;
  row?: number;
  fromCol?: number;
  fromRow?: number;
  targetCol?: number;
  targetRow?: number;
}
```

NEW:
```typescript
import { io, Socket } from "socket.io-client";
import GameState, { RoomAction } from "../GameState.ts";
import type { GameAction, PayoutResult } from "../../shared/types/NetworkEvents.js";

// Re-export so existing importers don't break
export type { GameAction };
```

> **Note:** The `re-export` keeps backward compatibility — every file that does `import { GameAction } from '../network/SocketManager'` still works. Zero cascading changes.

### Also fix `payout_result` handler inline type

Same file, inside `registerEvents()`:

OLD:
```typescript
this.socket.on('payout_result', (data: { success: boolean; txHash?: string; error?: string }) => {
  console.log('[SocketManager] Payout result:', data);
  GameState.payoutResult = data;
  this.callbacks?.onPayoutResult?.(data);
});
```

NEW:
```typescript
this.socket.on('payout_result', (data: PayoutResult) => {
  console.log('[SocketManager] Payout result:', data);
  GameState.payoutResult = data;
  this.callbacks?.onPayoutResult?.(data);
});
```

### Also fix `RoomCallbacks.onPayoutResult` type

Same file, in `RoomCallbacks` interface:

OLD:
```typescript
  onPayoutResult?: (result: { success: boolean; txHash?: string; error?: string }) => void;
```

NEW:
```typescript
  onPayoutResult?: (result: PayoutResult) => void;
```

### Verification
```bash
npx tsc --noEmit                            # Still compiles
grep -rn "interface GameAction" src/         # Expected: 0 results (only re-export)
grep -rn "GameAction" src/                   # Expected: all imports, no local definitions
```

---

## Sub-step 1.3: Add `connectOnly()`, `getSocket()`, `isConnected()` to SocketManager

> **Why:** LobbyScene and RoomBrowserScene need a socket connection WITHOUT auto-creating/joining a room. The current `connect()` immediately calls `actOnRoomAction()`. Adding these 3 methods is the minimal change.
> Coding Principles §1.2 — "One File, One Job" is preserved: SocketManager still only manages the socket.

📁 `src/network/SocketManager.ts` — inside `class SocketManagerClass`

**Add `eventsRegistered` guard** (prevents double-registration):

OLD (field declarations):
```typescript
class SocketManagerClass {
  private socket: Socket | null = null;
  private callbacks: RoomCallbacks | null = null;
  // NEW:
  private serverUrl: string = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
```

NEW:
```typescript
class SocketManagerClass {
  private socket: Socket | null = null;
  private callbacks: RoomCallbacks | null = null;
  private serverUrl: string = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
  private eventsRegistered: boolean = false;
```

**Add guard to `registerEvents()`:**

OLD (first line of registerEvents):
```typescript
  private registerEvents(): void {
    if (!this.socket) return;
```

NEW:
```typescript
  private registerEvents(): void {
    if (!this.socket || this.eventsRegistered) return;
    this.eventsRegistered = true;
```

**Add 3 new methods** — insert AFTER `setCallbacks()`, BEFORE `disconnect()`:

```typescript
  /**
   * Connect to server WITHOUT auto-creating/joining a room.
   * Used by LobbyScene, RoomBrowserScene, HubScene.
   * The caller controls room lifecycle via lobby events.
   */
  connectOnly(callbacks?: Partial<RoomCallbacks>): void {
    if (callbacks) {
      this.callbacks = {
        onRoomCreated: () => {},
        onRoomJoined: () => {},
        onOpponentJoined: () => {},
        onOpponentAction: () => {},
        onOpponentDisconnected: () => {},
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
      // NO actOnRoomAction() — caller decides
    });

    this.socket.on('disconnect', () => {
      console.log('[SocketManager] Disconnected.');
    });

    this.registerEvents();
  }

  /** Expose raw socket for LobbySocketManager to attach lobby: events. */
  getSocket(): Socket | null {
    return this.socket;
  }

  /** Check if socket is currently connected. */
  isConnected(): boolean {
    return !!this.socket?.connected;
  }
```

### Verification
```bash
npx tsc --noEmit
# Manual: existing RoomScene flow still works (connect() path unchanged)
```

---

## Sub-step 1.4: Create `src/auth/AuthManager.ts` (Stub)

> **Why:** LoginScene, HubScene, and LobbyScene all need to `import { AuthManager }`. If the file doesn't exist, Vite fails at build time — dynamic imports don't help.
> The stub ships NOW. Real implementation replaces it in Step 4.
> Coding Principles §6.3 — "Explicit Over Implicit." A stub that throws is better than a missing file that crashes.

📁 **NEW FILE:** `src/auth/AuthManager.ts`

```typescript
// ============================================================
// AuthManager.ts — Stub
// Always-importable auth manager. Returns safe defaults.
// Replace with real wallet-auth implementation in Step 4.
//
// Every scene can do:
//   import { AuthManager } from '../auth/AuthManager';
//   if (AuthManager.isLoggedIn()) { ... }
// without risk of build failure or runtime crash.
// ============================================================

export interface AuthPlayer {
  id: number;
  wallet: string;
  displayName: string;
  winCount: number;
  lossCount: number;
  eloRating: number;
  activeDeckId: number | null;
}

class AuthManagerClass {
  private _loggedIn = false;
  private _player: AuthPlayer | null = null;
  private _token: string | null = null;

  /** Wallet login — stub throws until server API is deployed. */
  async login(): Promise<AuthPlayer> {
    throw new Error('Auth not configured — deploy server auth API first (Step 4).');
  }

  getToken(): string | null { return this._token; }
  getPlayer(): AuthPlayer | null { return this._player; }
  isLoggedIn(): boolean { return this._loggedIn; }

  /** Auth headers for REST API calls. Empty object if not logged in. */
  authHeaders(): Record<string, string> {
    if (!this._token) return {};
    return { 'Authorization': `Bearer ${this._token}` };
  }

  logout(): void {
    this._loggedIn = false;
    this._player = null;
    this._token = null;
  }

  /**
   * Called by the real implementation (Step 4) after successful login.
   * NOT called by the stub — exists so the interface is stable.
   */
  _setAuth(token: string, player: AuthPlayer): void {
    this._token = token;
    this._player = player;
    this._loggedIn = true;
  }
}

export const AuthManager = new AuthManagerClass();
```

### Verification
```bash
npx tsc --noEmit
# Verify: import { AuthManager } from './auth/AuthManager' resolves
```

---

## Sub-step 1.5: Add Auth + Deck Fields to `src/GameState.ts`

> **Why:** Both plans add fields to GameState. Do it once, properly typed.
> Coding Principles §6.2 — "Types as Documentation" and §6.3 — "Explicit Over Implicit."
> No `as any` injection. Proper typed fields + setters.

📁 `src/GameState.ts`

**Add new fields** — insert AFTER `payoutResult` field, BEFORE `// ─── Setters`:

OLD:
```typescript
    // ─── Crypto ───────────────────────────────────────────────
    depositTxHash: string | null = null;
    payoutResult: PayoutResult | null = null;

    // ─── Setters ──────────────────────────────────────────────
    setPlayerName(name: string): void {
```

NEW:
```typescript
    // ─── Crypto ───────────────────────────────────────────────
    depositTxHash: string | null = null;
    payoutResult: PayoutResult | null = null;

    // ─── Auth (populated by AuthManager after login) ─────────
    authToken: string = '';
    authenticatedPlayerId: number = 0;
    displayName: string = '';

    // ─── Deck (populated by deck selection flow) ─────────────
    activeDeckId: number | null = null;
    activeDeckCardIds: string[] = [];

    // ─── Setters ──────────────────────────────────────────────
    setPlayerName(name: string): void {
```

**Add auth + deck setters** — insert AFTER `setLastMatch()`, BEFORE the closing `}` of the class:

```typescript
    // ─── Auth ─────────────────────────────────────────────────
    setAuthData(token: string, playerId: number, name: string): void {
        this.authToken = token;
        this.authenticatedPlayerId = playerId;
        this.displayName = name;
        this.playerName = name; // Sync with existing playerName
        console.log(`[GameState] Auth: ${name} (#${playerId})`);
    }

    isAuthenticated(): boolean {
        return this.authenticatedPlayerId > 0 && this.authToken.length > 0;
    }

    clearAuth(): void {
        this.authToken = '';
        this.authenticatedPlayerId = 0;
        this.displayName = '';
        console.log('[GameState] Auth cleared.');
    }

    // ─── Deck ─────────────────────────────────────────────────
    setActiveDeck(deckId: number | null, cardIds: string[]): void {
        this.activeDeckId = deckId;
        this.activeDeckCardIds = [...cardIds]; // defensive copy
        console.log(`[GameState] Active deck: #${deckId} (${cardIds.length} cards)`);
    }

    hasActiveDeck(): boolean {
        return this.activeDeckCardIds.length > 0;
    }
```

### Verification
```bash
npx tsc --noEmit
grep -n "as any" src/GameState.ts    # Expected: 0 results
```

---

## Sub-step 1.6: Add `totalTurns` to `sendGameOver`

> **Why:** Match history recording needs turn count. The shared contract already has it (from 1.1). Now wire it through SocketManager.

📁 `src/network/SocketManager.ts` — function `sendGameOver()`

OLD:
```typescript
sendGameOver(localPlayerIndex: number, localPlayerWon: boolean): void {
  console.log(`[SocketManager] Sending game_over, won: ${localPlayerWon}`);
  this.socket?.emit('game_over', {
    roomCode: GameState.roomCode,
    winnerIndex: localPlayerWon ? localPlayerIndex : (localPlayerIndex === 0 ? 1 : 0),
  });
}
```

NEW:
```typescript
sendGameOver(localPlayerIndex: number, localPlayerWon: boolean, totalTurns?: number): void {
  console.log(`[SocketManager] Sending game_over, won: ${localPlayerWon}, turns: ${totalTurns ?? 0}`);
  this.socket?.emit('game_over', {
    roomCode: GameState.roomCode,
    winnerIndex: localPlayerWon ? localPlayerIndex : (localPlayerIndex === 0 ? 1 : 0),
    totalTurns: totalTurns ?? 0,
  });
}
```

📁 `src/scenes/BattleScene.ts` — inside the `GAME_OVER` EventBus handler

OLD:
```typescript
      if (this.sceneData.isCryptoMode) SocketManager.sendGameOver(localPlayerIndex, playerWon);
```

NEW:
```typescript
      const turnCount = this.engine.getState().turn?.turnNumber ?? 0;
      SocketManager.sendGameOver(localPlayerIndex, playerWon, turnCount);
```

> **Note:** Now always sent (not just crypto mode). Server records match for authenticated players in any mode. Free-play guests without auth just get ignored by the server's match recorder (which doesn't exist yet — Step 2).

### Verification
```bash
npx tsc --noEmit
# Manual: play a game, check server logs show game_over with totalTurns
```

---

## COMPLETE FILE CHANGE SUMMARY — Step 1

```
MODIFIED FILES:
  shared/types/NetworkEvents.ts        FULL REWRITE (~180 LOC, was ~60)
    └─ Added: RoomSettings, ChatMessage, RoomStatus, LobbyState,
       PublicRoomListing, GameStartingData, LobbyPlayerInfo
    └─ Extended: RoomPlayer (+playerId, +deckIds, +ready)
    └─ Extended: Room (+hostSocketId, +status, +settings, +chat, +createdAt)
    └─ Extended: ClientToServerEvents (+12 lobby events, +2 auth/deck events)
    └─ Extended: ServerToClientEvents (+15 lobby events, +3 deck events)
    └─ Extended: game_over (+totalTurns)

  src/network/SocketManager.ts         4 EDITS
    └─ Import GameAction from shared (delete local definition)
    └─ Add eventsRegistered guard
    └─ Add connectOnly(), getSocket(), isConnected()
    └─ Update sendGameOver() signature (+totalTurns)

  src/GameState.ts                     2 EDITS
    └─ Add auth fields: authToken, authenticatedPlayerId, displayName
    └─ Add deck fields: activeDeckId, activeDeckCardIds
    └─ Add methods: setAuthData(), isAuthenticated(), clearAuth(),
                    setActiveDeck(), hasActiveDeck()

  src/scenes/BattleScene.ts            1 EDIT
    └─ GAME_OVER handler: always send game_over, pass turnCount

NEW FILES:
  src/auth/AuthManager.ts              STUB (~50 LOC)
    └─ Always-importable, safe defaults, throws on login()

UNTOUCHED:
  server/*                             Zero changes
  src/game/*                           Zero changes
  src/renderers/*                      Zero changes
  src/scenes/MainMenuScene.ts          Zero changes
  src/scenes/RoomScene.ts              Zero changes
```

## POST-STEP VERIFICATION CHECKLIST

```bash
# 1. TypeScript compiles (both client and server)
npx tsc --noEmit
npx tsc -p tsconfig.server.json --noEmit

# 2. No new 'any' introduced
grep -c ": any" src/auth/AuthManager.ts         # Expected: 0
grep -c "as any" src/GameState.ts               # Expected: 0

# 3. GameAction comes from shared, not SocketManager
grep "interface GameAction" src/network/SocketManager.ts   # Expected: 0
grep "GameAction" shared/types/NetworkEvents.ts            # Expected: found

# 4. AuthManager importable
echo 'import { AuthManager } from "./src/auth/AuthManager";' | npx tsc --noEmit --stdin

# 5. No file exceeds 500 LOC
wc -l shared/types/NetworkEvents.ts   # Expected: < 200
wc -l src/auth/AuthManager.ts         # Expected: < 60
wc -l src/GameState.ts                # Expected: < 200

# 6. Manual: start game, play a match, verify everything still works
```

**Git commit:** `feat: Step 1 — shared foundation (typed events, auth stub, GameState fields, SocketManager extensions)`
