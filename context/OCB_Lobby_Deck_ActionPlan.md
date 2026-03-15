# OCB Lobby & Deck System — Implementation Action Plan

## Validated Against Live Codebase · 14 March 2026

---

# OVERVIEW

6 phases, ~28 new files, ~12 edited files. Estimated 30-40 hours total.
Each phase is independently verifiable and committable.

**Key deviations from bundle:**
- NetworkEvents.ts: ADDITIVE edits, NOT full rewrite (preserves our recent additions)
- SessionManager game_over: PRESERVE 2-claim consensus (bundle would regress)
- CardPool.ts: costs verified against actual card definitions
- All `as any` hacks replaced with proper public methods
- UI scenes use existing patterns: MenuButton, DOMInputManager, ThemeLoader, ToastNotification

---

# PHASE 1: SHARED FOUNDATION

**Branch:** `feat/phase1-shared-foundation`
**Time:** 2-3h
**Dependencies:** None

## 1.1 — Extend `shared/types/NetworkEvents.ts` (ADDITIVE)

**DO NOT rewrite.** Append new types below existing ones. Preserve ALL existing interfaces
including `StateReportUnit`, `StateReportPlayer`, `GameStateReport`, `game_state_report`.

**New interfaces to ADD:**

```
RoomSettings { isPublic, isCrypto, maxPlayers, roomName, stakeAmount, password }
ChatMessage { sender, text, timestamp }
RoomStatus = 'waiting' | 'full' | 'depositing' | 'starting' | 'in_progress' | 'finished'
LobbyPlayerInfo { name, playerId, ready, isHost, hasDeck }
LobbyState { code, settings, status, players, chat }
PublicRoomListing { code, roomName, hostName, playerCount, maxPlayers, isCrypto, stakeAmount, hasPassword, status, createdAt }
GameStartingData { seed, players[] }
```

**Extend existing interfaces (optional fields only):**

```
RoomPlayer += { playerId?: number | null, deckIds?: string[] | null, ready?: boolean }
Room += { hostSocketId?, hostPlayerId?, status?: RoomStatus, settings?: RoomSettings, chat?: ChatMessage[] }
ClientToServerEvents += game_over.totalTurns, registerPlayer, submitDeck, 14 lobby:* events
ServerToClientEvents += deckAccepted, deckRejected, bothDecksReady, 15 lobby:* events
```

**CRITICAL: Keep these EXACTLY as-is:**
- GameAction (all 8 types + seqNum + serverSeq)
- registerWallet (with message + signature fields)
- Room (all existing required fields: battleReadyCount, actionQueue, currentTurnPlayer, currentPhase, actionCount, gameOverClaims, lastSeqNum, globalSeq, pendingHashes, disconnectTimers, disconnectIntervals, createdAt, gameLog)
- game_state_report and StateReport* types

## 1.2 — Fix SocketManager GameAction duplication

Delete local `GameAction` interface from `src/network/SocketManager.ts`.
Import from shared types. Re-export for backward compat.
Also type `payout_result` handler with `PayoutResult`.

## 1.3 — Add `connectOnly()`, `getSocket()` to SocketManager

- Add `eventsRegistered` guard to prevent double-registration
- `connectOnly()`: connect WITHOUT auto-room-action. Include reconnection config (same as `connect()`).
- `getSocket()`: expose raw socket for LobbySocketManager

Note: `isConnected()` already exists.

## 1.4 — Create `src/auth/AuthManager.ts` (Stub)

Singleton class. `isLoggedIn()` returns false. `login()` throws.
Exposes `getToken()`, `getPlayer()`, `authHeaders()`, `logout()`, `_setAuth()`.
Real implementation in Phase 4.

## 1.5 — Add auth + deck fields to `src/GameState.ts`

New fields (after payoutResult):
```
authToken: string = ''
authenticatedPlayerId: number = 0
displayName: string = ''
activeDeckId: number | null = null
activeDeckCardIds: string[] = []
```

New methods:
```
setAuthData(token, playerId, name) — also syncs playerName
isAuthenticated() — checks playerId > 0 && token.length > 0
clearAuth()
setActiveDeck(deckId, cardIds) — defensive copy
hasActiveDeck() — checks cardIds.length > 0
```

## 1.6 — Update `sendGameOver` + GameOverHandler

**Target: `src/scenes/battle/GameOverHandler.ts`** (NOT BattleScene)

Change:
```
if (isCryptoMode) SocketManager.sendGameOver(localPlayerIndex, playerWon);
```
To:
```
SocketManager.sendGameOver(localPlayerIndex, playerWon, turnCount);
```
Always send (not just crypto). Server ignores if no auth'd players.

Update `sendGameOver` signature in SocketManager to accept `totalTurns?: number`.

### Phase 1 Verification
```
npx tsc --noEmit
npx tsc -p tsconfig.server.json --noEmit
npm run test:game
```

---

# PHASE 2: SERVER DATABASE + AUTH API

**Branch:** `feat/phase2-server-db-auth`
**Time:** 4-5h
**Dependencies:** Phase 1

## 2.0 — Install dependencies

```bash
npm install better-sqlite3 jsonwebtoken cors
npm install -D @types/better-sqlite3 @types/jsonwebtoken @types/cors
```

Verify `better-sqlite3` installs on Windows (needs node-gyp build tools).
If fails: fall back to `sql.js`.

Add to `.env`: `JWT_SECRET=ocb-dev-secret-replace-in-production`
Add to `.env.development`: `VITE_API_URL=http://localhost:3001/api`

## 2.1 — `server/db/database.ts` (~35 LOC)

SQLite connection singleton. WAL mode. FK enforcement.
Path: `server/data/ocb.sqlite` (relative to process.cwd()).

## 2.2 — `server/db/migrations.ts` (~95 LOC)

4 tables: players, decks, collections, match_history.
Idempotent migration runner with `_migrations` tracking table.

## 2.3 — `server/validation/CardPool.ts` (~80 LOC)

Server-side card data for validation. **VERIFY COSTS against actual card definitions:**

| Card | Bundle says | Actual cost | Fix needed? |
|------|-----------|-------------|-------------|
| commander | 5 | **7** | YES |
| knights_guard | 4 | verify | CHECK |
| knight | 5 | verify | CHECK |

Read ALL card files in `src/game/data/cards/` to verify every cost before writing CardPool.

## 2.4 — `server/validation/DeckValidator.ts` (~60 LOC)

Pure function: `validateDeck(cardIds, ownedCards?)`.
Rules: 31 cards, no King, valid IDs, copy limits, optional ownership check.

## 2.5 — `server/api/middleware.ts` (~50 LOC)

JWT issue/verify + `requireAuth` Express middleware.
Verify `jsonwebtoken` works with ESM + `esModuleInterop: true`.

## 2.6 — `server/api/authRoutes.ts` (~90 LOC)

GET `/api/auth/nonce?wallet=0x...` — generates nonce, stores in-memory (5min TTL)
POST `/api/auth/login` — verifies signature with ethers, issues JWT, creates player if new

## 2.7 — `server/api/collectionHelpers.ts` (~25 LOC)

Initialize new player collection (MVP: all cards unlocked at max copies).

## 2.8 — `server/api/playerRoutes.ts` (~50 LOC)

GET/PATCH `/api/player/me` — profile read + display name update.

## 2.9 — `server/api/index.ts` (~20 LOC)

Router assembly. Mounts auth + player routes.

## 2.10 — Mount API in `server/app.ts`

Add: `import cors`, `app.use(cors())`, `app.use(express.json())`, `app.use('/api', apiRouter)`.
Add: DB init + migrations on startup.
Add: `process.on('SIGTERM', ...)` for graceful shutdown (closeDB).

## 2.11 — Add `server/data/` to `.gitignore`

### Phase 2 Verification
```
npx tsc -p tsconfig.server.json --noEmit
npm run server
curl localhost:3001/api/auth/nonce?wallet=0x1234567890abcdef1234567890abcdef12345678
curl localhost:3001/api/player/me  # expect 401
```

---

# PHASE 3: SERVER DECK + COLLECTION + LOBBY

**Branch:** `feat/phase3-deck-collection-lobby`
**Time:** 6-8h
**Dependencies:** Phase 2

## 3.1 — `server/api/deckRoutes.ts` (~95 LOC)

Deck CRUD: list, create, update, delete, activate, validate.

## 3.2 — `server/api/collectionRoutes.ts` (~30 LOC)

GET `/api/collection` — return player's card collection.

## 3.3 — `server/api/matchService.ts` (~45 LOC)

`recordMatch(opts)` — writes to match_history, updates win/loss.
Safe for guests (null playerIds → skip recording).

## 3.4 — `server/api/matchRoutes.ts` (~25 LOC)

GET `/api/matches` — paginated match history.

## 3.5 — Update `server/api/index.ts`

Mount deck, collection, match routers.

## 3.6 — Extend `server/rooms/RoomManager.ts` (~70 LOC additions)

New methods:
- `setPlayerAuth(socketId, roomCode, playerId)`
- `setPlayerDeck(socketId, roomCode, deckIds)`
- `allDecksReady(roomCode)`
- `getPublicRooms(): PublicRoomListing[]`
- `getLobbyState(roomCode): LobbyState`
- `generateUniqueCode(): string`
- `removeFromAllRooms(socketId): string[]`
- `setRoom(roomCode, room)` — public method for LobbyManager (NO `as any` hack)

Private helper: `findPlayer(socketId, roomCode)`

## 3.7 — Extend `server/game/SessionManager.ts`

Add `registerPlayer` handler (verify JWT, set player auth on room).
Add `submitDeck` handler (validate deck, store, emit accepted/rejected).

**CRITICAL: DO NOT replace game_over handler.** The current 2-claim consensus
system is correct. ADD match recording INSIDE the existing handler, after
both claims agree:

```typescript
// Inside the "if (claim0.claimedWinner === claim1.claimedWinner)" block, before payout:
try { recordMatch({ roomCode, room, winnerIndex: claim0.claimedWinner, totalTurns: ... }); }
catch (err) { console.error('[Session] Failed to record match:', err); }
```

## 3.8 — `server/lobby/lobbyHelpers.ts` (~45 LOC)

`createLobbyRoom()` factory. Creates Room with lobby fields populated.
Must include ALL required Room fields (battleReadyCount, actionQueue, etc.).

## 3.9 — `server/lobby/RoomJanitor.ts` (~35 LOC)

Periodic cleanup. Sweep ALL rooms (not just public ones).
Stop interval on SIGTERM.

## 3.10 — `server/lobby/LobbyManager.ts` (~200 LOC)

All `lobby:*` socket handlers. Same pattern as SessionManager.
Uses `rooms.setRoom(code, room)` — NO `as any`.

**Disconnect handling:** Only handle lobby-phase disconnects (waiting/full/depositing).
In-game disconnects are handled by SessionManager. Use room.status to distinguish.

**finalizeLaunch:** Emit legacy events (roomCreated, opponentJoined, game_seed) for
BattleScene backward compatibility. But be careful: LobbyScene should NOT set
GameState fields that legacy events also set (race condition).

## 3.11 — Mount lobby + janitor in `server/app.ts`

Add: LobbyManager + RoomJanitor instantiation.
Add: `lobby.registerHandlers(socket)` in connection block.
Add: `GET /api/rooms` public endpoint (no auth).
Add: janitor.stop() in SIGTERM handler.

### Phase 3 Verification
```
npx tsc -p tsconfig.server.json --noEmit
npm run server
curl localhost:3001/api/rooms  # expect { rooms: [] }
```

---

# PHASE 4: CLIENT AUTH + DECK

**Branch:** `feat/phase4-client-auth-deck`
**Time:** 4-5h
**Dependencies:** Phases 1-3

## 4.1 — Replace AuthManager stub with real implementation (~75 LOC)

Wallet-based login flow:
1. Connect wallet via WalletManager.connect()
2. Get nonce from `GET /api/auth/nonce?wallet=...`
3. Sign message with signer.signMessage()
4. POST `/api/auth/login` with wallet + signature
5. Store JWT + player data in GameState
6. Call `_setAuth(token, player)`

**Use `await signer.getAddress()`** — WalletManager has NO `getAddress()`.

## 4.2 — `src/deck/DeckAPI.ts` (~80 LOC)

HTTP client for deck CRUD. Uses `AuthManager.authHeaders()`.
Methods: list, create, update, remove, activate, validate.
Base URL from `import.meta.env.VITE_API_URL`.

## 4.3 — `src/deck/DeckValidatorClient.ts` (~60 LOC)

Client-side instant validation. Import `getCard` from `'../game/data/CardRegistry'` (correct path).
Rules: 31 cards, no King, copy limits, cost curve generation.

## 4.4 — `src/deck/CollectionAPI.ts` (~25 LOC)

Fetch authenticated player's card collection from server.

## 4.5 — Rewrite `src/config/DeckLoader.ts` (~85 LOC)

3-priority loading chain:
1. Server active deck (if authenticated + has active deck)
2. `/deck.config.json` (runtime config file)
3. UNITS_ONLY_DECK_IDS (hardcoded fallback)

Static import of GameState (not dynamic — no circular risk).

## 4.6 — Wire auth into MainMenuScene

Add: auth status display (logged in as... or "Guest").
Add: "[ LOGIN ]" button that calls AuthManager.login().
Update: `onPlayCrypto()` reuses wallet if already authenticated.

## 4.7 — Wire deck + auth into RoomScene

Add: `registerPlayer` emit after socket connect (if authenticated).
Add: `submitDeckAndEnter()` method with timeout fallback.
Add: deck event listeners (deckAccepted, deckRejected, bothDecksReady).

## 4.8 — Add SocketManager methods

Add: `registerPlayer(token)` emit method.
Add: `submitDeck(roomCode, deckIds)` emit method.
Add: deck event listeners in `registerEvents()`.

### Phase 4 Verification
```
npx tsc --noEmit
# Manual: guest flow still works (DeckLoader fallback path)
# Manual: wallet login → auth status shows in MainMenuScene
```

---

# PHASE 5: CLIENT LOBBY SCENES

**Branch:** `feat/phase5-client-lobby-scenes`
**Time:** 6-8h
**Dependencies:** Phases 1-4

## UI Design Guidelines (from codebase patterns)

All new scenes MUST follow existing patterns:
- **Buttons:** MenuButton class (not raw Phaser text)
- **Text inputs:** DOMInputManager
- **Notifications:** ToastNotification
- **Font:** "Courier New", monospace
- **Colors:** #00FF88 (green/success), #F5A623 (gold/crypto), #4FC3F7 (blue/info), #FF4444 (red/danger), #AAAAAA (secondary)
- **Backgrounds:** Check texture exists → fallback to 0x1a1a2e rectangle
- **Panels:** fillStyle(0x16213e, 0.88), strokeStyle(0x4fc3f7, 0.4), cornerRadius 10
- **Transitions:** fadeIn(400) on create, fadeOut(300) before scene.start
- **Canvas:** 1280×720, all coordinates relative to this
- **Layout:** Hardcoded constants (LAYOUT object) or LayoutLoader JSON
- **Theme:** ThemeLoader for colors/fonts if layout JSON exists

## 5.1 — `src/lobby/LobbySocketManager.ts` (~120 LOC)

Typed wrapper for `lobby:*` socket events.
Uses `SocketManager.getSocket()` — NOT `(SocketManager as any).socket`.

Outgoing: createRoom, joinRoom, sendChat, toggleReady, kick, startGame, submitDeck, cryptoReady, leave, list.
Incoming: onCreated, onJoined, onStateUpdate, onChatMessage, onError, onKicked, onGameStarting, onDepositPhase, etc.

Cleanup method: `removeAllListeners()`.

## 5.2 — `src/lobby/RoomBrowserAPI.ts` (~20 LOC)

REST fetch for `GET /api/rooms` (no auth required).

## 5.3 — `src/scenes/LoginScene.ts` (~95 LOC)

**Layout:**
```
Title: "ONCHAIN BATTLES" (44px, center)
Tagline (18px, #AAAAAA)
─────────────────────────────
"[ LOGIN WITH WALLET ]" — MenuButton, green, center
"[ PLAY AS GUEST ]" — MenuButton, blue, below
─────────────────────────────
Status text (shows wallet address after login)
```

**Flow:**
- Wallet login: AuthManager.login() → on success → fetch active deck → go to HubScene
- Guest: skip auth → go to HubScene
- Error: ToastNotification with error message

## 5.4 — `src/scenes/HubScene.ts` (~175 LOC)

**Layout:**
```
Player identity bar (top): "Welcome, {name}" + wallet badge
────────────────────────────────────────────
         MAIN PANEL (centered)

  "[ HOST A GAME ]"         — green, opens host settings overlay
  "[ BROWSE GAMES ]"        — blue, → RoomBrowserScene
  "[ JOIN BY CODE ]"         — blue, shows code input overlay
  "[ DECK BUILDER ]"         — gold, → DeckBuilderScene (stub)
  "[ QUICK PLAY (LEGACY) ]"  — grey, → MainMenuScene

────────────────────────────────────────────
Last match banner (if exists, bottom)
W/L record
```

**Host Settings Overlay** (shown when HOST clicked):
```
Panel overlay with:
  Room Name: [DOMInputManager text input]
  Public/Private: toggle button
  Free/Crypto: toggle button
  "[ CREATE ROOM ]" — confirms, calls LobbySocketManager.createRoom()
  "[ CANCEL ]" — hides overlay
```

**Join by Code Overlay:**
```
  Room Code: [DOMInputManager text input, 6 chars, uppercase]
  "[ JOIN ]" — calls LobbySocketManager.joinRoom()
  "[ CANCEL ]" — hides overlay
```

## 5.5 — `src/scenes/RoomBrowserScene.ts` (~135 LOC)

**Layout:**
```
Title: "BROWSE GAMES" (28px)
"[ BACK ]" — top-left, → HubScene
────────────────────────────────────────────
  Room list (scrollable area):
    Each row: [Room Name] [Host] [Players] [Mode] [JOIN]

  Auto-refresh every 5 seconds
  "No rooms available" if empty
────────────────────────────────────────────
Server status indicator (bottom)
```

**Important:** Register `this.events.on('shutdown', ...)` for timer cleanup.
Track fetch failures — show warning after 3 consecutive failures.

## 5.6 — `src/scenes/LobbyScene.ts` (~200 LOC)

**Layout:**
```
Room code + copy/share buttons (top)
Mode badge (FREE / CRYPTO)
────────────────────────────────────────────
  LEFT PANEL: Player list
    P1: {name} [HOST] [READY ✓]
    P2: {name} [READY ✗]  [KICK] (host only)

  RIGHT PANEL: Chat
    Chat messages (scrollable)
    Chat input (DOMInputManager) + Send button

────────────────────────────────────────────
  BOTTOM BAR:
    "[ READY ]" / "[ NOT READY ]" — toggle
    "[ START GAME ]" — host only, requires all ready
    "[ LEAVE ]" — returns to HubScene
```

**Crypto flow (after host clicks START):**
1. Server emits `lobby:deposit_phase`
2. Scene shows deposit UI with "[ DEPOSIT {amount} AVAX ]" button
3. Host calls EscrowManager.createMatch(), joiner calls EscrowManager.joinMatch()
4. Each sends `lobby:crypto_ready` after deposit
5. Server emits `lobby:both_deposited` → `lobby:game_starting`

**Game launch:**
- On `lobby:game_starting`: do NOT set GameState fields (legacy events will)
- Store opponent name, start scene transition
- Legacy events (roomCreated, game_seed, opponentJoined) set playerIndex, seed, etc.

**Disconnect safety:** If socket disconnects while in lobby, return to HubScene after 2s.

## 5.7 — Wire scenes in `src/main.ts`

Add imports + scene array entries for: LoginScene, HubScene, RoomBrowserScene, LobbyScene.

## 5.8 — Update `src/scenes/PreloadScene.ts`

Change: `scene.start('MainMenuScene')` → `scene.start('LoginScene')`

## 5.9 — Update `src/scenes/ResultScene.ts`

Change: `goToMenu()` → go to HubScene instead of MainMenuScene.
Add: "REMATCH" button → starts LobbyScene as host.
Keep: "LEGACY" button → MainMenuScene (backward compat).

### Phase 5 Verification
```
npx tsc --noEmit
# Manual: LoginScene → guest → HubScene → HOST → LobbyScene → opponent joins → START → BattleScene
# Manual: RoomBrowserScene shows hosted rooms, auto-refreshes
# Manual: Legacy flow via QUICK PLAY still works
```

---

# PHASE 6: INTEGRATION, POLISH & DECK BUILDER STUB

**Branch:** `feat/phase6-integration-polish`
**Time:** 3-4h
**Dependencies:** Phases 1-5

## 6.1 — `src/scenes/DeckBuilderScene.ts` (stub, ~90 LOC)

**Layout:**
```
Title: "DECK BUILDER" (28px)
"[ BACK ]" — → HubScene
────────────────────────────────────────────
  Active deck info:
    Deck name, card count, valid/invalid badge
    Card list (text, not interactive)

  "Your collection: {N} cards"
  "Server decks: {N}"

────────────────────────────────────────────
  "Full deck builder coming soon!"
```

Imports DeckAPI + CollectionAPI + AuthManager.
If not authenticated: shows "Login required for deck builder."

## 6.2 — Register DeckBuilderScene in `src/main.ts`

## 6.3 — Add `src/ui/SceneTransition.ts` (optional, ~20 LOC)

Reusable fade-out → scene.start helper to prevent double-transitions.

### Phase 6 Verification

Full integration test matrix:

**Group A: Guest Flow**
- LoginScene → Guest → HubScene
- HubScene → HOST → LobbyScene → 2nd player joins → START → BattleScene → ResultScene → HUB

**Group B: Authenticated Flow**
- LoginScene → Wallet → HubScene (shows wallet address)
- Deck builder shows collection info

**Group C: Crypto Flow**
- HOST crypto game → both deposit → battle

**Group D: Lobby Features**
- Chat works
- Ready toggle works
- Host can kick
- Host settings (public/private, room name)

**Group E: Room Browser**
- Public rooms appear
- Auto-refresh works
- Join by click works

**Group F: Legacy Compatibility**
- QUICK PLAY → MainMenuScene → RoomScene flow still works
- ResultScene → LEGACY → MainMenuScene

---

# COMPLETE FILE INVENTORY

## New Files (28)

```
SERVER (16):
  server/db/database.ts              Phase 2   ~35 LOC
  server/db/migrations.ts            Phase 2   ~95 LOC
  server/validation/CardPool.ts      Phase 2   ~80 LOC
  server/validation/DeckValidator.ts Phase 2   ~60 LOC
  server/api/middleware.ts           Phase 2   ~50 LOC
  server/api/authRoutes.ts           Phase 2   ~90 LOC
  server/api/collectionHelpers.ts    Phase 2   ~25 LOC
  server/api/playerRoutes.ts         Phase 2   ~50 LOC
  server/api/index.ts                Phase 2   ~20 LOC
  server/api/deckRoutes.ts           Phase 3   ~95 LOC
  server/api/collectionRoutes.ts     Phase 3   ~30 LOC
  server/api/matchService.ts         Phase 3   ~45 LOC
  server/api/matchRoutes.ts          Phase 3   ~25 LOC
  server/lobby/lobbyHelpers.ts       Phase 3   ~45 LOC
  server/lobby/RoomJanitor.ts        Phase 3   ~35 LOC
  server/lobby/LobbyManager.ts       Phase 3  ~200 LOC

CLIENT (12):
  src/auth/AuthManager.ts            Phase 1→4 ~75 LOC
  src/deck/DeckAPI.ts                Phase 4   ~80 LOC
  src/deck/DeckValidatorClient.ts    Phase 4   ~60 LOC
  src/deck/CollectionAPI.ts          Phase 4   ~25 LOC
  src/lobby/LobbySocketManager.ts    Phase 5  ~120 LOC
  src/lobby/RoomBrowserAPI.ts        Phase 5   ~20 LOC
  src/scenes/LoginScene.ts           Phase 5   ~95 LOC
  src/scenes/HubScene.ts             Phase 5  ~175 LOC
  src/scenes/RoomBrowserScene.ts     Phase 5  ~135 LOC
  src/scenes/LobbyScene.ts           Phase 5  ~200 LOC
  src/scenes/DeckBuilderScene.ts     Phase 6   ~90 LOC
  src/ui/SceneTransition.ts          Phase 6   ~20 LOC
```

## Edited Files (12)

```
shared/types/NetworkEvents.ts        Phase 1   ADDITIVE (~120 LOC added)
src/network/SocketManager.ts         Phases 1,4  +connectOnly, +getSocket, +registerPlayer, +submitDeck, +sendGameOver update, fix GameAction import
src/GameState.ts                     Phase 1   +auth fields, +deck fields, +methods
src/scenes/battle/GameOverHandler.ts Phase 1   always send game_over, +totalTurns
src/config/DeckLoader.ts             Phase 4   REWRITE (3-priority chain)
src/scenes/MainMenuScene.ts          Phase 4   +auth status, +login button
src/scenes/RoomScene.ts              Phase 4   +registerPlayer, +submitDeck
server/app.ts                        Phases 2,3 +cors, +json, +api, +db, +lobby, +janitor
server/rooms/RoomManager.ts          Phase 3   +~70 LOC methods
server/game/SessionManager.ts        Phase 3   +registerPlayer, +submitDeck, +match recording (inside existing game_over handler)
src/main.ts                          Phases 5,6 +scene imports
src/scenes/PreloadScene.ts           Phase 5   →LoginScene
src/scenes/ResultScene.ts            Phases 5,6 →HubScene, +REMATCH
.gitignore                           Phase 2   +server/data/
```

## Untouched (everything else)

GameEngine, Board, CombatResolver, all ability handlers, all aura processors,
all phase files, all renderers, all type files, EventBus, SelectionManager,
all battle coordinators (except GameOverHandler), EscrowManager, WalletManager,
all test files, Escrow.sol, all JSON configs.

---

# SCENE FLOW AFTER ALL PHASES

```
PreloadScene → LoginScene → HubScene ──┬──► DeckBuilderScene (stub)
                                       │
                                       ├──► LobbyScene (host, with settings)
                                       │       ├── chat, kick, ready
                                       │       ├── crypto deposit phase
                                       │       ├── deck submission
                                       │       └── → BattleScene
                                       │
                                       ├──► RoomBrowserScene → LobbyScene (join)
                                       │
                                       ├──► JOIN BY CODE overlay → LobbyScene (join)
                                       │
                                       └──► QUICK PLAY (LEGACY) → MainMenuScene → RoomScene
                                                                                      │
                                BattleScene ◄──────────────────────────────────────────┘
                                    │
                                    ▼
                                ResultScene ──┬──► REMATCH → LobbyScene (host)
                                              ├──► HUB → HubScene
                                              └──► LEGACY → MainMenuScene
```

---

# DEPENDENCIES

```bash
npm install better-sqlite3 jsonwebtoken cors
npm install -D @types/better-sqlite3 @types/jsonwebtoken @types/cors
```

# ENVIRONMENT VARIABLES

```env
# Add to .env
JWT_SECRET=replace-with-random-64-char-string-in-production

# Add to .env.development
VITE_API_URL=http://localhost:3001/api
```

---

# RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| `better-sqlite3` fails to install (node-gyp) | Fall back to `sql.js` (pure WASM) |
| `jsonwebtoken` ESM compat | `esModuleInterop: true` already set; test before Phase 2 |
| Dual disconnect handlers (Session + Lobby) | Use `room.status` to route: lobby phases → LobbyManager, in_progress → SessionManager |
| Legacy flow regression | Keep MainMenuScene + RoomScene untouched; QUICK PLAY button in HubScene |
| CardPool drift from CardDefinitions | TODO: build script to auto-generate CardPool from card files |
| Lobby deposit timing vs RoomScene | `lobby:deposit_phase` includes isHost so client knows createMatch vs joinMatch |
