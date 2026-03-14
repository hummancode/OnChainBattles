# OCB DeckAuth + Lobby Plans — Reconciliation Action Plan

## Against Updated Codebase (March 2026)

---

# PART 1: WHAT CHANGED SINCE THE PLANS WERE WRITTEN

The codebase had a significant architecture overhaul. Both plans (DeckAuth Integration Code + Lobby Architecture + Lobby Improvements) were written against the OLD state and now have **structural mismatches** with the real code.

## 1.1 Server Migration (Critical)

| What Plans Assume | What Actually Exists |
|---|---|
| `server/index.js` — single plain JS file | `server/app.ts` — TypeScript entry point |
| No typed events | `shared/types/NetworkEvents.ts` — typed `ClientToServerEvents` / `ServerToClientEvents` |
| Room = inline `rooms[code] = { players: [...] }` | `server/rooms/RoomManager.ts` — class with `Map<string, Room>` |
| Escrow logic inline in index.js | `server/game/PayoutService.ts` — extracted class |
| Socket handlers inline | `server/game/SessionManager.ts` — extracted class |
| Build: `node server/index.js` | Build: `tsc -p tsconfig.server.json && node server/dist/server/app.js` |
| Module system: CommonJS (`require`) | Module system: ESM (`import/export`, `"type": "module"`) |

**Impact:** Every server file in both plans (`server/db.js`, `server/api.js`, `server/cardPool.js`, `server/deckValidator.js`, `server/roomModel.js`, `server/lobbyEvents.js`) must be rewritten as TypeScript with ES imports. The `require()` calls throughout are wrong. The mount points in `server/index.js` no longer exist.

## 1.2 Shared Types Contract

`shared/types/NetworkEvents.ts` now defines:

```typescript
interface ClientToServerEvents {
  createRoom, joinRoom, registerWallet, cryptoReady, game_action, game_over
}
interface ServerToClientEvents {
  roomCreated, roomJoined, opponentJoined, opponent_action, game_seed,
  opponentDisconnected, hostDepositConfirmed, bothCryptoReady, payout_result, error
}
interface RoomPlayer { id, name, wallet }
interface Room { players, gameSeed, cryptoReadyCount, settled }
```

**Impact:** Both plans add new socket events (`submitDeck`, `deckAccepted`, `registerPlayer`, `lobby:create`, `lobby:join`, `lobby:chat`, etc.) that MUST be added to these typed interfaces. Otherwise `tsc` will reject them.

## 1.3 GameState Cleanup

| What Plans Assume | What Actually Exists |
|---|---|
| `(GameState as any).depositTxHash` | `GameState.depositTxHash: string \| null` (proper field) |
| `(GameState as any).payoutResult` | `GameState.payoutResult: PayoutResult \| null` (proper field) |
| `MatchResult` with dice roll fields | `BoardGameResult` with `reason`, `turns` (no dice) |
| `onOpponentRollReceived` callback | Removed from `RoomCallbacks` |

**Impact:** DeckAuth plan's `setAuthData()` / `setActiveDeck()` additions are still valid in concept but must use proper typing (no `as any`). The lobby improvements plan references removed callbacks.

## 1.4 Game Engine Refactoring

The engine was decomposed: `PendingCommand` replaces `PendingInteraction`, ability handlers are individual files via Strategy pattern, `CardRegistry.ts` + `DeckDefinitions.ts` extracted from `CardDefinitions.ts`. `getCard()` now lives in `CardRegistry.ts`, not `CardDefinitions.ts`.

**Impact:** DeckAuth plan's `DeckValidatorClient.ts` imports `getCard` from `'../game/data/CardDefinitions'` — must change to `'../game/data/CardRegistry'`. The server `cardPool.ts` idea is still valid but should also reference `DeckDefinitions.ts` for the `UNITS_ONLY_DECK_IDS`.

## 1.5 SocketManager Duplication

`SocketManager.ts` still defines its own `GameAction` interface locally instead of importing from `shared/types/NetworkEvents.ts`. This duplication exists in the live code and both plans perpetuate it.

---

# PART 2: QUALITY AUDIT OF EXISTING PLAN CODE

## 2.1 DeckAuth Integration Code — Issues Found

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | All server files are `.js` with `require()` — server is now TypeScript ESM | **BLOCKER** | `server/db.js`, `server/api.js`, `server/cardPool.js`, `server/deckValidator.js` |
| 2 | Mounts API on `server/index.js` which no longer exists | **BLOCKER** | DeckAuth Phase A, Change 1 |
| 3 | `server/api.js` uses `router.recordMatch` as a function property on Express router — this is a hacky pattern | MEDIUM | `server/api.js` bottom |
| 4 | `RoomPlayer` in plan has `{ playerId, deckIds }` but `shared/types/NetworkEvents.ts` `RoomPlayer` only has `{ id, name, wallet }` | **BLOCKER** | All server room player references |
| 5 | Client `DeckValidatorClient.ts` imports `getCard` from wrong path | HIGH | `src/deck/DeckValidatorClient.ts` |
| 6 | Client `DeckLoader.ts` rewrite does `await import('../GameState')` dynamic import — fragile, circular dependency risk | MEDIUM | `src/config/DeckLoader.ts` |
| 7 | `AuthManager.ts` hardcodes `API_BASE` with `import.meta.env.VITE_API_URL` but falls back to `localhost:3001/api` — the `/api` prefix is plan-internal and doesn't exist on the server yet | LOW | `src/auth/AuthManager.ts` |
| 8 | Plan adds `submitDeck` socket event to `server/index.js` inline — should be in `SessionManager.ts` | HIGH | DeckAuth Phase A, Change 3 |
| 9 | Plan references `GameState as any` in several places — GameState is now properly typed | MEDIUM | Multiple |
| 10 | `sendGameOver()` signature change adds `totalTurns` — must also update `shared/types/NetworkEvents.ts` `ClientToServerEvents.game_over` | HIGH | SocketManager edit |
| 11 | The plan has no `tsconfig.server.json` awareness — new server files must be included in its `include` array | HIGH | tsconfig.server.json |
| 12 | `jwt` dependency: plan uses `jsonwebtoken` npm package, but doesn't verify it works with ESM (`"type": "module"`) — `jsonwebtoken` is CommonJS-only, needs ESM wrapper or alternative like `jose` | HIGH | `server/api.js` auth routes |

## 2.2 Lobby Architecture + Improvements — Issues Found

| # | Issue | Severity | Location |
|---|---|---|---|
| 1 | Same JS/require blocker as DeckAuth — all server files are `.js` | **BLOCKER** | `server/roomModel.js`, `server/lobbyEvents.js` |
| 2 | `roomModel.js` creates a parallel room system — should extend existing `RoomManager.ts` and `Room` interface | **DESIGN** | `server/roomModel.js` |
| 3 | `LobbySocketManager.ts` accesses `(SocketManager as any).socket` — private field access | HIGH | `src/lobby/LobbySocketManager.ts` |
| 4 | `connectOnly()` method calls `this.registerEvents()` — if `connect()` was already called, events get double-registered | HIGH | SocketManager edit |
| 5 | No updates to `shared/types/NetworkEvents.ts` for any lobby events | **BLOCKER** | All lobby socket events |
| 6 | `leaveAllRooms()` in `lobbyEvents.js` directly iterates `rooms` object — should use `RoomManager.findBySocket()` | MEDIUM | Lobby improvements Gap 5 |
| 7 | Crypto deposit flow in lobby improvement calls `EscrowManager.createMatch/joinMatch` from LobbyScene — but the lobby flow is: host clicks START → THEN deposit. The current `EscrowManager` flow assumes host deposits in RoomScene BEFORE opponent joins. Timing is different. | HIGH | Lobby improvements Gap 2 |
| 8 | `HubScene.ts` uses `prompt()` initially, then the improvements doc fixes it — but the fix creates `MenuButton` instances inside a Container without proper cleanup | LOW | Lobby improvements Gap 3 |
| 9 | Room janitor `startRoomJanitor` uses `setInterval` — no cleanup on server shutdown | LOW | Lobby improvements Gap 4 |
| 10 | `RoomBrowserScene.ts` auto-refresh creates `Phaser.Time.TimerEvent` but `shutdown()` not called automatically by Phaser for scene switches (need `this.events.on('shutdown', ...)`) | MEDIUM | Lobby improvements Gap 11 |
| 11 | `lobby:game_starting` emits legacy events (`roomCreated`, `opponentJoined`) — but `SocketManager.registerEvents()` handles these and sets `GameState` fields. If LobbyScene already set those fields, they'll be double-set. Race condition risk. | HIGH | `server/lobbyEvents.js` startGame |
| 12 | Plan's `LoginScene.ts` uses `try { await import('../auth/AuthManager') }` as graceful degradation — but with ESM and Vite, dynamic imports of non-existent modules cause build-time errors, not runtime catches | MEDIUM | `src/scenes/LoginScene.ts` |

---

# PART 3: ACTION PLAN TO FIX BOTH PLANS

## Phase 0: Shared Foundation (Do First)

### 0.1 Extend `shared/types/NetworkEvents.ts`

Add ALL new event types from both plans to the shared contract. This is the single most important change — everything else type-checks against this.

**Add to `ClientToServerEvents`:**
- Auth: (none — auth uses REST, not sockets)
- Deck: `submitDeck`, `registerPlayer`
- Lobby: `lobby:create`, `lobby:join`, `lobby:leave`, `lobby:chat`, `lobby:ready`, `lobby:kick`, `lobby:settings`, `lobby:start_game`, `lobby:crypto_ready`, `lobby:deck_submitted`, `lobby:list`

**Add to `ServerToClientEvents`:**
- Deck: `deckAccepted`, `deckRejected`, `bothDecksReady`
- Lobby: `lobby:created`, `lobby:joined`, `lobby:state`, `lobby:room_list`, `lobby:chat_message`, `lobby:system_message`, `lobby:kicked`, `lobby:game_starting`, `lobby:error`, `lobby:deposit_phase`, `lobby:opponent_deposited`, `lobby:both_deposited`, `lobby:submit_decks`, `lobby:password_required`

**Extend `Room` interface** (add optional lobby fields so existing code doesn't break):
```
Room {
  // existing...
  // New optional lobby fields:
  hostSocketId?: string;
  hostPlayerId?: number | null;
  status?: 'waiting' | 'full' | 'depositing' | 'starting' | 'in_progress' | 'finished';
  settings?: RoomSettings;
  chat?: ChatMessage[];
}
```

**Extend `RoomPlayer` interface:**
```
RoomPlayer {
  // existing: id, name, wallet
  // New optional:
  playerId?: number | null;
  deckIds?: string[] | null;
  ready?: boolean;
}
```

**Add new interfaces:** `RoomSettings`, `ChatMessage`, `LobbyState`, `PublicRoomListing`, `GameStartingData`

**Also: add `totalTurns?: number` to `ClientToServerEvents.game_over`**.

### 0.2 Fix SocketManager `GameAction` Duplication

`SocketManager.ts` defines `GameAction` locally but `shared/types/NetworkEvents.ts` also has it. Make SocketManager import from shared. This is a one-line import change + delete the local interface.

### 0.3 Decide on JWT Library

`jsonwebtoken` is CommonJS-only. The server is ESM. Options:
- **Option A:** Use `jose` (pure ESM, no native deps) — cleaner but different API
- **Option B:** Keep `jsonwebtoken` with `import jwt from 'jsonwebtoken'` and `esModuleInterop: true` — works with the current `tsconfig.server.json`
- **Recommendation:** Option B works already since `esModuleInterop: true` is set. Just verify it compiles.

### 0.4 Decide on SQLite Library

`better-sqlite3` has native bindings (C++). Alternative: `sql.js` (pure WASM, no native deps, works everywhere). For a solo dev who might deploy to various environments, `sql.js` is safer. But `better-sqlite3` is faster.

**Recommendation:** Stick with `better-sqlite3` but note it requires `node-gyp` build tools. Add a note to the install instructions.

---

## Phase 1: DeckAuth Plan Corrections

### 1.1 Convert All Server Files to TypeScript

Every file the plan creates as `.js` must become `.ts` with proper ES imports:

| Plan File | Corrected File |
|---|---|
| `server/db.js` | `server/db/database.ts` |
| `server/db.js` migrations | `server/db/migrations.ts` |
| `server/api.js` | `server/api/index.ts` (router) + `server/api/authRoutes.ts` + `server/api/deckRoutes.ts` + `server/api/collectionRoutes.ts` + `server/api/matchRoutes.ts` + `server/api/playerRoutes.ts` |
| `server/cardPool.js` | `server/validation/CardPool.ts` |
| `server/deckValidator.js` | `server/validation/DeckValidator.ts` |

Splitting `api.js` (which was ~300 LOC) into route files follows the same decomposition pattern as the server refactoring already did for rooms/sessions.

### 1.2 Mount API on `server/app.ts`

The plan's 3-line mount on `server/index.js` must target `server/app.ts` instead:

```typescript
// server/app.ts — add after existing imports:
import cors from 'cors';
import { apiRouter } from './api/index.js';

// After const app = express():
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/api', apiRouter);
```

### 1.3 Extend `RoomManager.ts` Instead of Patching Inline

Instead of adding `playerId` and `deckIds` to room player objects by editing socket handlers inline, extend the `RoomPlayer` interface in `shared/types/NetworkEvents.ts` and update `RoomManager.ts`:

- Add `playerId?: number | null` and `deckIds?: string[] | null` to `RoomPlayer`
- Add methods to `RoomManager`: `setPlayerAuth(socketId, roomCode, playerId)`, `setPlayerDeck(socketId, roomCode, deckIds)`, `getPlayerDeck(socketId, roomCode)`

### 1.4 New Socket Events Go in `SessionManager.ts`

The `submitDeck` and `registerPlayer` socket handlers should be added to `SessionManager.registerHandlers()`, not inline in `app.ts`. This follows the established pattern.

### 1.5 Fix Client Import Paths

- `DeckValidatorClient.ts`: `getCard` import → from `'../game/data/CardRegistry'`
- `DeckLoader.ts`: remove dynamic `await import('../GameState')` — use static import (no circular risk since DeckLoader only reads fields, doesn't import GameState's dependencies)

### 1.6 Fix `GameState` Additions

The plan's `setAuthData()` and `setActiveDeck()` are valid but must be typed properly:

```typescript
// Add as proper typed fields, not (as any):
authToken: string = '';
authenticatedPlayerId: number = 0;
displayName: string = '';
activeDeckId: number | null = null;
activeDeckCardIds: string[] = [];
```

These fit naturally after the existing `payoutResult` field.

### 1.7 Fix `sendGameOver` Signature

Update BOTH `SocketManager.ts` AND `shared/types/NetworkEvents.ts`:
```typescript
// NetworkEvents.ts:
game_over: (data: { roomCode: string; winnerIndex: number; totalTurns?: number }) => void;
```

### 1.8 Update `tsconfig.server.json`

Ensure `include` covers new directories:
```json
"include": ["server/**/*.ts", "shared/**/*.ts"]
```
This already covers everything if new files go under `server/`. No change needed unless files go elsewhere.

---

## Phase 2: Lobby Plan Corrections

### 2.1 Kill `roomModel.js` — Extend `RoomManager.ts` Instead

The lobby plan creates a parallel room model that duplicates `RoomManager.ts`. Instead:

- Extend `Room` interface in `shared/types/NetworkEvents.ts` with optional lobby fields
- Add lobby methods to `RoomManager.ts`: `setRoomSettings()`, `setPlayerReady()`, `getRoomForBrowser()`, `getPublicRooms()`, `kickPlayer()`, `transferHost()`, `addChatMessage()`
- This keeps ONE room system, not two

### 2.2 Kill `lobbyEvents.js` — Create `server/lobby/LobbyManager.ts`

Following the established pattern (`SessionManager` handles game events, `RoomManager` handles CRUD), create:

- `server/lobby/LobbyManager.ts` — registers `lobby:*` socket handlers
- Constructor takes `(io, roomManager)` — same pattern as `SessionManager`
- Mount in `server/app.ts` alongside session manager

### 2.3 Fix `LobbySocketManager.ts` Socket Access

The `(SocketManager as any).socket` pattern is fragile. Instead:

**Option A (recommended):** Add `getSocket()` and `isConnected()` to `SocketManager` as public methods. This is a 6-line addition with zero risk.

**Option B:** Make `LobbySocketManager` extend `SocketManager` — over-engineered for 2 extra methods.

Go with Option A.

### 2.4 Fix Double Event Registration

`connectOnly()` calls `this.registerEvents()`. If the socket was already connected via `connect()`, events are registered twice.

Fix: Track registration state:
```typescript
private eventsRegistered = false;

private registerEvents(): void {
  if (this.eventsRegistered) return;
  this.eventsRegistered = true;
  // ... existing event registration
}
```

### 2.5 Fix Crypto Deposit Timing

The lobby flow is fundamentally different from RoomScene's flow:

- **RoomScene flow:** Host deposits → `hostDepositConfirmed` → Joiner deposits → `bothCryptoReady` → game starts. Deposits happen DURING the waiting phase.
- **Lobby flow:** Both players join → ready up → host clicks START → deposits phase → game starts. Deposits happen AFTER START is clicked.

The lobby improvement's deposit flow (Gap 2) must handle this correctly. The server's `lobby:start_game` handler should:
1. Check if crypto mode
2. If yes: set status to `'depositing'`, emit `lobby:deposit_phase`
3. Host and joiner BOTH see "deposit now" and click to deposit (parallel, not sequential)
4. Each calls `lobby:crypto_ready` after their deposit confirms
5. When both ready, server calls `launchGame()`

This is different from the improvement plan which tried to reuse `EscrowManager.createMatch`/`joinMatch` sequentially. In the lobby flow, the host should create the match on-chain AND deposit, the joiner should join and deposit. But both are triggered simultaneously from `lobby:deposit_phase`.

### 2.6 Fix Legacy Event Emission Race Condition

When `lobby:game_starting` fires, it also emits `roomCreated`, `opponentJoined`, and `game_seed` for BattleScene compatibility. But `SocketManager.registerEvents()` handles these and calls `GameState.setPlayerIndex()`, `GameState.setGameSeed()`.

If `LobbyScene` ALSO sets these values (which it does in `onGameStarting`), there's a race.

**Fix:** LobbyScene should NOT set GameState fields that the legacy events will set. Let the legacy events handle it. LobbyScene should only:
1. Store the opponent name
2. Trigger scene transition
3. Let legacy socket events set `playerIndex`, `gameSeed`, `roomCode`

### 2.7 Fix LoginScene Dynamic Import

`try { await import('../auth/AuthManager') }` won't gracefully fail with Vite — it will fail at build time if the file doesn't exist, not at runtime.

**Fix:** Use a feature flag instead:
```typescript
// At top of LoginScene:
let AuthManagerModule: any = null;
try {
  AuthManagerModule = await import('../auth/AuthManager');
} catch { /* not deployed yet */ }
```

Actually, with Vite, this won't work either because Vite statically analyzes imports.

**Better fix:** `AuthManager` should ALWAYS exist as a file, even if it's a stub that throws "not configured". Then LoginScene can import it normally and catch the runtime error:

```typescript
// src/auth/AuthManager.ts (stub version):
class AuthManagerClass {
  async login() { throw new Error('Auth not configured — deploy server API first'); }
  isLoggedIn() { return false; }
  getToken() { return null; }
  getPlayer() { return null; }
  authHeaders() { return {}; }
  logout() {}
}
export const AuthManager = new AuthManagerClass();
```

This stub ships immediately. When the server API is deployed, replace the stub with the real implementation. No conditional imports needed.

### 2.8 Fix RoomBrowserScene Cleanup

Phaser doesn't call `shutdown()` automatically on scene switch. Register it:

```typescript
create(): void {
  // ... existing code ...
  this.events.on('shutdown', this.shutdown, this);
}

shutdown(): void {
  this.refreshTimer?.remove();
  this.refreshTimer = null;
}
```

---

## Phase 3: Implementation Order (Both Plans Combined)

```
Week 1: Shared Foundation
  ├── 0.1 Extend shared/types/NetworkEvents.ts (all events + types)
  ├── 0.2 Fix SocketManager GameAction import
  ├── 0.3 Add connectOnly(), getSocket(), isConnected() to SocketManager
  └── 0.4 Create AuthManager stub (always-importable)

Week 2: Server Database + Auth API
  ├── 1.1 server/db/database.ts + migrations.ts (SQLite)
  ├── 1.2 server/validation/CardPool.ts + DeckValidator.ts
  ├── 1.3 server/api/authRoutes.ts (nonce + login)
  ├── 1.4 server/api/playerRoutes.ts
  ├── 1.5 server/api/index.ts (router) + mount in app.ts
  └── 1.6 npm install: better-sqlite3, jsonwebtoken, cors

Week 3: Server Deck + Collection + Lobby Foundation
  ├── 1.7 server/api/deckRoutes.ts + collectionRoutes.ts + matchRoutes.ts
  ├── 1.8 Extend RoomManager.ts (lobby fields, settings, host, ready)
  ├── 1.9 Extend RoomPlayer in shared types (playerId, deckIds, ready)
  ├── 2.1 server/lobby/LobbyManager.ts (all lobby: socket events)
  └── 2.2 Add submitDeck + registerPlayer to SessionManager.ts

Week 4: Client Auth + Deck
  ├── 3.1 Replace AuthManager stub with real implementation
  ├── 3.2 src/auth/AuthManager.ts (real wallet login)
  ├── 3.3 src/deck/DeckAPI.ts
  ├── 3.4 src/deck/DeckValidatorClient.ts (fix import path)
  ├── 3.5 Extend GameState.ts (auth + deck fields, properly typed)
  └── 3.6 Update DeckLoader.ts (server → config → fallback chain)

Week 5: Client Lobby Scenes
  ├── 4.1 src/lobby/LobbySocketManager.ts (use getSocket(), not cast)
  ├── 4.2 src/lobby/RoomBrowserAPI.ts
  ├── 4.3 src/scenes/LoginScene.ts (import AuthManager normally)
  ├── 4.4 src/scenes/HubScene.ts (with overlays, no prompt())
  ├── 4.5 src/scenes/RoomBrowserScene.ts (with proper cleanup)
  └── 4.6 src/scenes/LobbyScene.ts (with corrected crypto flow)

Week 6: Integration + Polish
  ├── 5.1 Wire scenes in main.ts + PreloadScene + ResultScene
  ├── 5.2 Add deck submission to LobbyScene + RoomScene
  ├── 5.3 Test: full guest flow (login → hub → host → play → result → hub)
  ├── 5.4 Test: full auth flow (wallet → login → deck builder → host → play)
  ├── 5.5 Test: room browser flow (browse → join → play)
  └── 5.6 Test: crypto flow through lobby (host → start → both deposit → play)
```

---

# PART 4: SPECIFIC CORRECTIONS CHECKLIST

Before implementing, apply these edits to the plan documents:

## DeckAuth Plan

- [ ] **All server files**: `.js` → `.ts`, `require()` → `import`, `module.exports` → `export`
- [ ] **Mount point**: `server/index.js` → `server/app.ts`
- [ ] **Room player fields**: extend `shared/types/NetworkEvents.ts` `RoomPlayer`, not inline patches
- [ ] **submitDeck handler**: put in `SessionManager.ts`, not inline in app.ts
- [ ] **getCard import**: `'../game/data/CardDefinitions'` → `'../game/data/CardRegistry'`
- [ ] **DeckLoader**: remove dynamic GameState import, use static import
- [ ] **GameState additions**: typed fields, no `as any`
- [ ] **sendGameOver**: update `shared/types/NetworkEvents.ts` too
- [ ] **api.js recordMatch**: extract to proper service, not router property hack
- [ ] **JWT**: verify `jsonwebtoken` works with ESM + `esModuleInterop`
- [ ] **RoomCallbacks**: remove `onOpponentRollReceived` references (deleted from codebase)

## Lobby Plan

- [ ] **roomModel.js**: delete — extend `RoomManager.ts` instead
- [ ] **lobbyEvents.js**: → `server/lobby/LobbyManager.ts` (TypeScript class)
- [ ] **LobbySocketManager**: use `SocketManager.getSocket()` not `(SocketManager as any).socket`
- [ ] **connectOnly()**: add `eventsRegistered` guard against double-registration
- [ ] **All lobby events**: add to `shared/types/NetworkEvents.ts`
- [ ] **Crypto deposit flow**: both players deposit in parallel after START, not host-first
- [ ] **Legacy event emission**: LobbyScene should NOT set GameState fields that legacy events also set
- [ ] **LoginScene**: import AuthManager normally (stub always exists)
- [ ] **RoomBrowserScene**: `this.events.on('shutdown', ...)` for cleanup
- [ ] **Room janitor**: clear interval on `process.on('SIGTERM')`
- [ ] **GET /rooms**: mount as Express route in `server/app.ts`, not on old index.js
- [ ] **leaveAllRooms**: use `RoomManager.findBySocket()` + `RoomManager.removePlayer()` instead of direct iteration

## Both Plans

- [ ] **GameAction duplication**: SocketManager.ts must import from shared types, delete local definition
- [ ] **AuthManager stub**: create immediately so all scenes can import it without conditional logic
- [ ] **tsconfig.server.json**: verify `include` covers all new server directories
- [ ] **package.json scripts**: `"server"` script already compiles + runs — new deps just need `npm install`
