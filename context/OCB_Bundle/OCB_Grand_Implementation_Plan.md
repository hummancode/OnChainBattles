# OnChainBattles — Lobby & Deck Implementation Master Plan

## Unified 6-Step Guide · Validated Against Live Codebase · March 2026

---

# ERRATA: Corrections Found During Final Audit

Before reading the steps, these corrections override statements in the individual step patches. They are **already incorporated** into the step descriptions below.

| # | Issue | In Step | Correction |
|---|---|---|---|
| **E1** | Step 1 targets `BattleScene.ts` for `sendGameOver` edit | Step 1.6 | **Actual target is `src/scenes/battle/GameOverHandler.ts`** — BattleScene was decomposed into 5 coordinator files. |
| **E2** | GameOverHandler still sends `game_over` only in crypto mode | Step 1.6 | Must change to always send (needed for match recording in free mode). |
| **E3** | GameOverHandler has `(ev: any)` and `(engine as any)` | Step 1.6 | These `any` casts exist in the live code and are NOT introduced by the patch. Don't fix them here — they're a separate tech debt item. |
| **E4** | `NetworkCoordinator.ts` imports `GameAction` from `'../../network/SocketManager'` | Step 1.2 | Step 1.2 re-exports from SocketManager, so this still works. But the import path should ideally point to shared types in a future cleanup. |
| **E5** | WalletManager has no `getAddress()` — only `getSigner()` + `signer.getAddress()` | Step 4.1 | AuthManager must call `await signer.getAddress()` not `WalletManager.getAddress()`. Step 4 code is already correct. |
| **E6** | `import.meta.env.VITE_SOCKET_URL` (socket) vs `VITE_API_URL` (REST) are different env vars | Step 4 | Socket: `http://localhost:3001`, REST: `http://localhost:3001/api`. Both needed in `.env`. |

---

# CURRENT CODEBASE ARCHITECTURE (As-Is)

```
server/                              ← TypeScript, ESM, compiled via tsconfig.server.json
  app.ts                             Entry point: Express + Socket.io bootstrap (~70 LOC)
  rooms/RoomManager.ts               Room CRUD: create/join/wallet/settle (~80 LOC)
  game/SessionManager.ts             Game action relay + crypto + game_over (~65 LOC)
  game/PayoutService.ts              Escrow contract calls (~50 LOC)

shared/types/NetworkEvents.ts        Typed ClientToServer + ServerToClient events (~60 LOC)

src/
  GameState.ts                       Global singleton (~100 LOC)
  main.ts                            Phaser config + scene list
  auth/                              (empty — will be created)
  config/
    DeckLoader.ts                    Loads deck from config JSON (~60 LOC)
    LayoutLoader.ts, ThemeLoader.ts
  network/SocketManager.ts           Socket.io client (~200 LOC)
  game/
    abilities/handlers/              17 handler files (Strategy pattern)
    abilities/AbilityDispatcher.ts   30 LOC router
    auras/processors/                7 processor files (Chain of Responsibility)
    pending/PendingCommand.ts        Typed command objects (Command pattern)
    data/CardDefinitions.ts          All card data
    data/CardRegistry.ts             Frozen lookup map + getCard()
    data/DeckDefinitions.ts          UNITS_ONLY_DECK_IDS
    GameEngine.ts, Board.ts, etc.
  scenes/
    battle/                          5 coordinator files (decomposed from BattleScene)
      EngineEventBridge.ts
      NetworkCoordinator.ts
      HUDRefreshCoordinator.ts
      InputCoordinator.ts
      GameOverHandler.ts             ← GAME_OVER handling lives HERE, not BattleScene.ts
    BattleScene.ts                   Thin shell (~80 LOC)
    MainMenuScene.ts                 Name input + play buttons (~200 LOC)
    RoomScene.ts                     Room waiting + crypto deposit (~250 LOC)
    PreloadScene.ts                  Asset loading → MainMenuScene
    ResultScene.ts                   Match result display (~180 LOC)
  renderers/                         Bridge pattern: 4 card renderers + helpers
  web3/
    WalletManager.ts                 MetaMask connect (getSigner, isConnected — NO getAddress)
    EscrowManager.ts                 On-chain deposit/join
```

**Key facts that affect every step:**
- Server is **TypeScript ESM** — no `require()`, no `.js` files to create
- `shared/types/NetworkEvents.ts` is the **single source of truth** for all socket events
- BattleScene is **decomposed** — game over logic is in `GameOverHandler.ts`
- EventBus is **already typed** with `GameEventMap`
- Card data is in 3 files: `CardDefinitions.ts` (data), `CardRegistry.ts` (frozen map + `getCard()`), `DeckDefinitions.ts` (deck lists)
- WalletManager exposes `getSigner()` and `isConnected()` — address via `signer.getAddress()`
- `"type": "module"` in `package.json` — everything is ESM

---

# CODING PRINCIPLES COMPLIANCE CHECKLIST

Applied to every new file in this plan:

| Principle | How Enforced |
|---|---|
| §1.1 500-line ceiling | Largest file: LobbyManager.ts ~200 LOC, LobbyScene.ts ~200 LOC. Zero files over 250. |
| §1.2 One file one job | Each file answers "what does this do?" in one sentence. |
| §1.3 Feature folders | `server/db/`, `server/validation/`, `server/api/`, `server/lobby/`, `src/auth/`, `src/deck/`, `src/lobby/` |
| §1.4 Naming conventions | `*Service`, `*Manager`, `*Router`, `*Handler`, `*Helpers` — consistent. |
| §2 No inheritance | All composition. No class extends. |
| §3 Patterns used | Strategy (ability handlers — existing), Command (PendingCommand — existing), Repository (RoomManager — extended) |
| §6.1 Small pure functions | `validateDeck()`, `createLobbyRoom()`, `buildNonceMessage()` — all pure. |
| §6.2 Zero `any` in new code | All new files use proper types. Pre-existing `any` in GameOverHandler/NetworkCoordinator not touched. |
| §6.3 Explicit over implicit | No `(obj as any).secret`. All GameState fields are typed. |
| §6.4 One export one concern | Each file has 1 primary export (class, function, or router). |
| §7.1 Plan before code | This document is the plan. Execute step-by-step. |
| §7.4 Commit after each step | Each step has a commit message. |
| §8 Code change protocol | OLD → NEW blocks for edits. FULL REWRITE stated explicitly. NEW FILE for additions. |

---

# STEP 1: SHARED FOUNDATION

**Branch:** `feat/step1-shared-foundation`
**Time:** 2–3h
**Dependencies:** None
**New files:** 1 · **Edits:** 4

## 1.1 — Extend `shared/types/NetworkEvents.ts` (FULL REWRITE)

Grows from ~60 LOC to ~180 LOC. Adds all event types for lobby + deck + auth. Existing types unchanged. New types use `?` optional fields for backward compatibility.

**Key additions:** `RoomSettings`, `ChatMessage`, `RoomStatus`, `LobbyState`, `PublicRoomListing`, `GameStartingData`, `LobbyPlayerInfo`. Extended: `RoomPlayer` (+playerId, +deckIds, +ready), `Room` (+hostSocketId, +status, +settings, +chat), `ClientToServerEvents` (+14 events), `ServerToClientEvents` (+18 events), `game_over` (+totalTurns).

> Full code in Step 1 Patch document, Sub-step 1.1.

## 1.2 — Fix SocketManager `GameAction` Duplication

Delete local `GameAction` interface from `src/network/SocketManager.ts`. Import from shared types. Re-export for backward compatibility. Also fix `payout_result` handler to use `PayoutResult` type.

> Full code in Step 1 Patch document, Sub-step 1.2.

## 1.3 — Add `connectOnly()`, `getSocket()`, `isConnected()` to SocketManager

Add `eventsRegistered` guard to prevent double-registration. Add 3 new public methods: `connectOnly()` (connect without auto-room-action), `getSocket()` (expose raw socket for LobbySocketManager), `isConnected()` (boolean check).

> Full code in Step 1 Patch document, Sub-step 1.3.

## 1.4 — Create `src/auth/AuthManager.ts` (Stub)

Always-importable stub. `isLoggedIn()` returns false. `login()` throws. Real implementation comes in Step 4. Exists so LoginScene/HubScene can import it from day one without build errors.

> Full code in Step 1 Patch document, Sub-step 1.4.

## 1.5 — Add Auth + Deck Fields to `src/GameState.ts`

Add 5 typed fields (`authToken`, `authenticatedPlayerId`, `displayName`, `activeDeckId`, `activeDeckCardIds`) and 5 methods (`setAuthData()`, `isAuthenticated()`, `clearAuth()`, `setActiveDeck()`, `hasActiveDeck()`). Zero `as any`.

> Full code in Step 1 Patch document, Sub-step 1.5.

## 1.6 — Add `totalTurns` to `sendGameOver` ⚠️ CORRECTED TARGET

~~Step 1 Patch says edit `BattleScene.ts`.~~ **Actual target: `src/scenes/battle/GameOverHandler.ts`.**

📁 `src/scenes/battle/GameOverHandler.ts`

OLD:
```typescript
    if (isCryptoMode) SocketManager.sendGameOver(localPlayerIndex, playerWon);
```

NEW:
```typescript
    const turnCount = (engine as any).getState().turn?.turnNumber ?? 0;
    SocketManager.sendGameOver(localPlayerIndex, playerWon, turnCount);
```

> Note: The `(engine as any)` cast is pre-existing in this file. Not introduced by our patch.

📁 `src/network/SocketManager.ts` — `sendGameOver()` signature update

OLD:
```typescript
sendGameOver(localPlayerIndex: number, localPlayerWon: boolean): void {
```
NEW:
```typescript
sendGameOver(localPlayerIndex: number, localPlayerWon: boolean, totalTurns?: number): void {
```

And add `totalTurns` to the emit payload.

Also add `registerPlayer()` and `submitDeck()` emit methods to SocketManager, plus `deckAccepted`/`deckRejected`/`bothDecksReady` event listeners in `registerEvents()`.

> Full code for SocketManager methods in Step 4 Patch, Sub-step 4.7, Edit 2b.

### Step 1 Verification
```bash
npx tsc --noEmit
npx tsc -p tsconfig.server.json --noEmit
grep "interface GameAction" src/network/SocketManager.ts   # 0 results
```

**Commit:** `feat: Step 1 — shared types, auth stub, GameState fields, SocketManager extensions`

---

# STEP 2: SERVER DATABASE + AUTH API

**Branch:** `feat/step2-server-db-auth`
**Time:** 4–5h
**Dependencies:** Step 1
**New files:** 9 · **Edits:** 2
**Install:** `npm install better-sqlite3 jsonwebtoken cors` + `@types/*` devDeps

## New Files

| File | LOC | Job |
|---|---|---|
| `server/db/database.ts` | ~35 | SQLite connection (WAL mode, FK) |
| `server/db/migrations.ts` | ~95 | 4 tables: players, decks, collections, match_history |
| `server/validation/CardPool.ts` | ~80 | Server card data + lookup |
| `server/validation/DeckValidator.ts` | ~60 | Pure validation function |
| `server/api/middleware.ts` | ~50 | JWT issue/verify + `requireAuth` |
| `server/api/authRoutes.ts` | ~90 | Nonce + wallet-signature login |
| `server/api/collectionHelpers.ts` | ~25 | Initialize new player collection |
| `server/api/playerRoutes.ts` | ~50 | GET/PATCH player profile |
| `server/api/index.ts` | ~20 | Router assembly |

## Edits

| File | Change |
|---|---|
| `server/app.ts` | +imports, +`cors()`, +`express.json()`, +API mount, +DB init, +`SIGTERM` handler |
| `.gitignore` | +`server/data/` |

> Full code in Step 2 Patch document.

### Step 2 Verification
```bash
npx tsc -p tsconfig.server.json --noEmit
npm run server  # Should log [DB], [Server]
curl localhost:3001/api/auth/nonce?wallet=0x1234567890abcdef1234567890abcdef12345678
```

**Commit:** `feat: Step 2 — SQLite + wallet auth API + player profiles`

---

# STEP 3: SERVER DECK + COLLECTION + LOBBY

**Branch:** `feat/step3-deck-collection-lobby`
**Time:** 6–8h
**Dependencies:** Step 2
**New files:** 7 · **Edits:** 4

## New Files

| File | LOC | Job |
|---|---|---|
| `server/api/deckRoutes.ts` | ~95 | Deck CRUD: list/create/update/delete/activate/validate |
| `server/api/collectionRoutes.ts` | ~30 | GET player collection |
| `server/api/matchService.ts` | ~45 | Record match + update win/loss (used by SessionManager) |
| `server/api/matchRoutes.ts` | ~25 | GET match history |
| `server/lobby/lobbyHelpers.ts` | ~45 | `createLobbyRoom()` factory |
| `server/lobby/RoomJanitor.ts` | ~35 | Periodic stale room cleanup |
| `server/lobby/LobbyManager.ts` | ~200 | All `lobby:*` socket handlers |

## Edits

| File | Change |
|---|---|
| `server/api/index.ts` | Mount 3 new routers (deck, collection, match) |
| `server/rooms/RoomManager.ts` | +~70 LOC: `setPlayerAuth()`, `setPlayerDeck()`, `allDecksReady()`, `getPublicRooms()`, `getLobbyState()`, `generateUniqueCode()`, `removeFromAllRooms()`, `setRoom()` |
| `server/game/SessionManager.ts` | +imports, +`registerPlayer` handler, +`submitDeck` handler, +match recording in `game_over` |
| `server/app.ts` | +imports, +LobbyManager/Janitor init, +`lobby.registerHandlers()`, +`GET /api/rooms`, +janitor stop on shutdown |

### Cross-Step Integrity Note
- `SessionManager.ts` imports `verifyToken` from `server/api/middleware.ts` (created in Step 2)
- `SessionManager.ts` imports `validateDeck` from `server/validation/DeckValidator.ts` (created in Step 2)
- `SessionManager.ts` imports `recordMatch` from `server/api/matchService.ts` (created in this step)
- `LobbyManager.ts` imports `createLobbyRoom` from `server/lobby/lobbyHelpers.ts` (created in this step)
- `LobbyManager.ts` uses `roomManager.setRoom()` — added to `RoomManager.ts` in this step
- `RoomManager.ts` imports types from `shared/types/NetworkEvents.ts` (extended in Step 1)

> Full code in Step 3 Patch document.

### Step 3 Verification
```bash
npx tsc -p tsconfig.server.json --noEmit
npm run server
curl localhost:3001/api/rooms         # { "rooms": [] }
curl localhost:3001/api/collection    # 401 (no auth)
```

**Commit:** `feat: Step 3 — deck/collection/match APIs + lobby socket system`

---

# STEP 4: CLIENT AUTH + DECK

**Branch:** `feat/step4-client-auth-deck`
**Time:** 4–5h
**Dependencies:** Steps 1–3
**New files:** 3 · **Rewrites:** 2 · **Edits:** 3

## New Files

| File | LOC | Job |
|---|---|---|
| `src/deck/DeckAPI.ts` | ~80 | HTTP client for deck CRUD |
| `src/deck/DeckValidatorClient.ts` | ~60 | Client-side instant validation |
| `src/deck/CollectionAPI.ts` | ~25 | Fetch card collection |

## Rewrites

| File | LOC | Change |
|---|---|---|
| `src/auth/AuthManager.ts` | ~75 | Stub → real wallet login (WalletManager + nonce + sign + JWT) |
| `src/config/DeckLoader.ts` | ~85 | Add server active deck as priority 1: server → config → fallback |

## Edits

| File | Change |
|---|---|
| `src/scenes/MainMenuScene.ts` | +imports, +auth status display, +login button, +`handleWalletLogin()`, +reuse wallet in `onPlayCrypto()` |
| `src/scenes/RoomScene.ts` | +import DeckLoader, +`registerPlayer` in socket callbacks, +`submitDeckAndEnter()` method, +deck submit in free play `onOpponentJoined()` |
| `src/network/SocketManager.ts` | +`registerPlayer()` emit, +`submitDeck()` emit, +deck event listeners |

### Cross-Step Integrity Notes
- `AuthManager.ts` imports `WalletManager` from `../web3/WalletManager` — verified: exists, has `getSigner()`, `isConnected()`, NO `getAddress()`. Auth calls `await signer.getAddress()`.
- `DeckLoader.ts` imports `GameState` statically (not dynamically) — verified: `GameState.hasActiveDeck()` method added in Step 1.5.
- `DeckValidatorClient.ts` imports `getCard` from `'../game/data/CardRegistry'` — verified: correct file, exports `getCard()`.
- `DeckAPI.ts` uses `import.meta.env.VITE_API_URL` — needs `.env` entry: `VITE_API_URL=http://localhost:3001/api`.
- `RoomScene.ts` uses `SocketManager.getSocket()` — added in Step 1.3.
- `RoomScene.ts` uses `SocketManager.registerPlayer()` — added in this step.

> Full code in Step 4 Patch document.

### Step 4 Verification
```bash
npx tsc --noEmit
# Manual: guest flow still works (DeckLoader fallback path)
# Manual: wallet login → HubScene shows display name
```

**Commit:** `feat: Step 4 — client auth + deck API + DeckLoader 3-priority chain`

---

# STEP 5: CLIENT LOBBY SCENES

**Branch:** `feat/step5-client-lobby-scenes`
**Time:** 6–8h
**Dependencies:** Steps 1–4
**New files:** 6 · **Edits:** 3

## New Files

| File | LOC | Job |
|---|---|---|
| `src/lobby/LobbySocketManager.ts` | ~120 | Typed wrapper for `lobby:*` socket events |
| `src/lobby/RoomBrowserAPI.ts` | ~20 | REST fetch for public room list |
| `src/scenes/LoginScene.ts` | ~95 | Wallet/guest entry scene |
| `src/scenes/HubScene.ts` | ~175 | Home screen hub |
| `src/scenes/RoomBrowserScene.ts` | ~135 | Browse + join public rooms |
| `src/scenes/LobbyScene.ts` | ~200 | Enhanced room: chat, kick, ready, host controls |

## Edits

| File | Change |
|---|---|
| `src/main.ts` | +4 imports, +4 scenes in array |
| `src/scenes/PreloadScene.ts` | `scene.start('MainMenuScene')` → `scene.start('LoginScene')` |
| `src/scenes/ResultScene.ts` | `goToMenu()` → HubScene instead of MainMenuScene |

### Cross-Step Integrity Notes
- `LobbySocketManager.ts` uses `SocketManager.getSocket()` (Step 1.3) — NOT `(SocketManager as any).socket`.
- `LobbyScene.ts` uses `SocketManager.connectOnly()` (Step 1.3) — connects without auto-room-action.
- `LobbyScene.ts` uses `SocketManager.registerPlayer()` (Step 4) — identifies auth'd player.
- `LobbyScene.ts` uses `DeckLoader.load()` + `DeckLoader.get()` (Step 4 rewrite) — for deck submission.
- `LobbyScene.ts` dynamically imports `EscrowManager` for crypto deposit — correct: `await import('../web3/EscrowManager')`.
- `LobbyScene.ts` on `lobby:game_starting` does NOT set `playerIndex` or `gameSeed` — these are set by legacy events (`roomCreated`, `game_seed`) emitted by `LobbyManager.finalizeLaunch()` in Step 3.
- `LoginScene.ts` imports `AuthManager` (Step 1.4 stub / Step 4 real).
- `HubScene.ts` uses `GameState.isAuthenticated()` (Step 1.5).
- `RoomBrowserScene.ts` uses `fetchPublicRooms()` → `GET /api/rooms` (Step 3).
- All lobby socket events match `shared/types/NetworkEvents.ts` (Step 1.1).

> Full code in Step 5 Patch document.

### Step 5 Verification
```bash
npx tsc --noEmit
# Manual: LoginScene → guest → HubScene → HOST → LobbyScene → opponent joins → START → BattleScene
# Manual: RoomBrowserScene shows hosted rooms, auto-refreshes
# Manual: legacy flow via QUICK PLAY still works
```

**Commit:** `feat: Step 5 — LoginScene + HubScene + RoomBrowserScene + LobbyScene`

---

# STEP 6: INTEGRATION, POLISH & FINAL WIRING

**Branch:** `feat/step6-integration-polish`
**Time:** 4–5h
**Dependencies:** Steps 1–5
**New files:** 2 · **Edits:** 5

## New Files

| File | LOC | Job |
|---|---|---|
| `src/scenes/DeckBuilderScene.ts` | ~90 | Stub deck viewer (active deck info + server deck count) |
| `src/ui/SceneTransition.ts` | ~20 | Optional reusable fade-out helper |

## Edits

| File | Change |
|---|---|
| `src/scenes/HubScene.ts` | Replace `goToLobbyHost()` with settings overlay (public/private + free/crypto toggles). Deck builder button → DeckBuilderScene. |
| `src/scenes/ResultScene.ts` | 3 buttons (REMATCH / HUB / LEGACY). Add `goToRematch()`. `goToMenu()` → HubScene. |
| `src/scenes/LobbyScene.ts` | Add disconnect safety → return to HubScene after 2s. |
| `src/scenes/RoomBrowserScene.ts` | Add `failCount` for repeated fetch failures. |
| `src/main.ts` | +DeckBuilderScene import and scene array. |

### Cross-Step Integrity Notes
- `DeckBuilderScene.ts` imports `AuthManager` (Step 4), `DeckAPI` (Step 4), `GameState` (Step 1.5 fields).
- `ResultScene.ts` `goToRematch()` starts `LobbyScene` (Step 5) as host.
- `HubScene.ts` host overlay sets `GameState.currentMode` (existing field) before entering LobbyScene.
- `LobbyScene.ts` disconnect handler uses `SocketManager.getSocket()` (Step 1.3) for raw `disconnect` event.

> Full code in Step 6 Patch document.

### Step 6 Verification
Full test matrix: 7 groups, 35 test cases (see Step 6 Patch document).

**Commit:** `feat: Step 6 — host settings, rematch, deck builder stub, integration polish`
**Tag:** `v0.3.0-lobby-deckauth`

---

# COMPLETE INVENTORY

## All New Files (27)

```
SERVER (16 files):
  server/db/database.ts                Step 2   ~35 LOC
  server/db/migrations.ts              Step 2   ~95 LOC
  server/validation/CardPool.ts        Step 2   ~80 LOC
  server/validation/DeckValidator.ts   Step 2   ~60 LOC
  server/api/middleware.ts             Step 2   ~50 LOC
  server/api/authRoutes.ts             Step 2   ~90 LOC
  server/api/collectionHelpers.ts      Step 2   ~25 LOC
  server/api/playerRoutes.ts           Step 2   ~50 LOC
  server/api/index.ts                  Step 2   ~20 LOC
  server/api/deckRoutes.ts             Step 3   ~95 LOC
  server/api/collectionRoutes.ts       Step 3   ~30 LOC
  server/api/matchService.ts           Step 3   ~45 LOC
  server/api/matchRoutes.ts            Step 3   ~25 LOC
  server/lobby/lobbyHelpers.ts         Step 3   ~45 LOC
  server/lobby/RoomJanitor.ts          Step 3   ~35 LOC
  server/lobby/LobbyManager.ts         Step 3  ~200 LOC

CLIENT (11 files):
  src/auth/AuthManager.ts              Step 1→4 ~75 LOC  (stub then rewrite)
  src/deck/DeckAPI.ts                  Step 4   ~80 LOC
  src/deck/DeckValidatorClient.ts      Step 4   ~60 LOC
  src/deck/CollectionAPI.ts            Step 4   ~25 LOC
  src/lobby/LobbySocketManager.ts      Step 5  ~120 LOC
  src/lobby/RoomBrowserAPI.ts          Step 5   ~20 LOC
  src/scenes/LoginScene.ts             Step 5   ~95 LOC
  src/scenes/HubScene.ts               Step 5  ~175 LOC
  src/scenes/RoomBrowserScene.ts       Step 5  ~135 LOC
  src/scenes/LobbyScene.ts             Step 5  ~200 LOC
  src/scenes/DeckBuilderScene.ts       Step 6   ~90 LOC
```

## All Edited Files (17 unique, some edited in multiple steps)

```
shared/types/NetworkEvents.ts          Step 1    FULL REWRITE
src/network/SocketManager.ts           Steps 1,4 +connectOnly, +getSocket, +isConnected,
                                                 +registerPlayer, +submitDeck, +listeners,
                                                 +sendGameOver totalTurns, fix GameAction import
src/GameState.ts                       Step 1    +auth fields, +deck fields, +methods
src/scenes/battle/GameOverHandler.ts   Step 1    +always send game_over, +totalTurns
src/config/DeckLoader.ts               Step 4    FULL REWRITE (3-priority chain)
src/auth/AuthManager.ts                Step 4    FULL REWRITE (stub → real)
src/scenes/MainMenuScene.ts            Step 4    +auth UI, +login handler
src/scenes/RoomScene.ts                Step 4    +registerPlayer, +submitDeckAndEnter
server/app.ts                          Steps 2,3 +cors, +json, +api, +db, +lobby, +janitor
server/rooms/RoomManager.ts            Step 3    +70 LOC methods
server/game/SessionManager.ts          Step 3    +registerPlayer, +submitDeck, +match recording
server/api/index.ts                    Step 3    Mount 3 new routers
.gitignore                             Step 2    +server/data/
src/main.ts                            Steps 5,6 +scene imports
src/scenes/PreloadScene.ts             Step 5    →LoginScene
src/scenes/ResultScene.ts              Steps 5,6 →HubScene, +REMATCH button
src/scenes/HubScene.ts                 Step 6    +host overlay, +deck builder nav
```

## Completely Untouched (96 files)

GameEngine, Board, CombatResolver, all 17 ability handlers, all 7 aura processors, PendingCommand, PendingCommandResolver, all phase files (Draw/LEG/Play/Act/End), PlayerState, GameModifiers, MovementRules, UnitFactory, UnitQuery, all renderers (BoardRenderer, 4 card renderers, HandRenderer, HUDRenderer, OverlayRenderer, UnitThumbnail, 4 helper files), all type files (CardTypes, GameTypes, UITypes, AbilityTypes, EventTypes, GameEventMap), EventBus, SelectionManager, all coordinator files except GameOverHandler, LayoutLoader, ThemeLoader, all JSON configs (layouts, themes, deck.config), EscrowManager, all UI components (DOMInputManager, MenuButton, ShareHelper, ToastNotification, MipmapHelper, PhaserUtils), Escrow.sol, all test files.

---

# DEPENDENCY INSTALL SUMMARY

```bash
# Run once before Step 2:
npm install better-sqlite3 jsonwebtoken cors
npm install -D @types/better-sqlite3 @types/jsonwebtoken @types/cors
```

# ENVIRONMENT VARIABLES

```env
# .env (add to existing)
JWT_SECRET=replace-with-random-64-char-string-in-production
VITE_API_URL=http://localhost:3001/api
# Existing:
# VITE_SOCKET_URL=http://localhost:3001   (already used by SocketManager)
# FUJI_PRIVATE_KEY=...                     (already used by PayoutService)
```

# SCENE FLOW AFTER ALL 6 STEPS

```
PreloadScene → LoginScene → HubScene ──┬──► DeckBuilderScene (stub)
                                       │
                                       ├──► LobbyScene (host, with settings overlay)
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
