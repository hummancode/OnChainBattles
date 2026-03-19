# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

OnChainBattles is a blockchain-integrated card/strategy game built with Phaser 4 (game engine), Socket.io (multiplayer), and Solidity (on-chain escrow). Players deploy units on a 7x7 board and battle to destroy the opponent's King. Supports free-play and crypto modes (AVAX stakes via escrow contract on Avalanche Fuji testnet).

## Commands

```bash
# Full dev start (server + frontend + Chrome with debugging)
dev_start.bat

# Frontend dev server (Vite, port 8080)
npm start

# Production build (outputs to dist/)
npm run build

# Backend server (port 3001)
npm run server

# Game logic tests (vitest)
npm run test:game           # single run — full suite
npm run test:game:watch     # watch mode
npm run test:smoke          # game loop smoke test (run after major changes)

# Smart contract tests (Hardhat)
npx hardhat test

# Deploy contract to Fuji testnet
npx hardhat ignition deploy --network fuji ignition/modules/Escrow.ts
```

## Architecture

### Three-tier system

1. **Frontend** (`src/`) — Phaser 4 game in TypeScript, bundled with Vite
2. **Backend** (`server/`) — Express + Socket.io relay server in TypeScript; holds owner wallet for escrow payouts
3. **Smart Contract** (`contracts/Escrow.sol`) — On-chain escrow for match stakes; winner gets pot minus 5% rake

### Frontend structure

| Folder | Purpose |
|--------|---------|
| `src/scenes/` | Phaser scenes (10 total, see scene flow below) |
| `src/renderers/` | Decoupled rendering layer (BoardRenderer, HandRenderer, HUDRenderer, OverlayRenderer) |
| `src/game/` | Pure game engine (no Phaser dependency) |
| `src/game/phases/` | Turn phases: Draw → LEG → Play → Act → End |
| `src/game/abilities/` | Strategy pattern: registry + 19 handler files |
| `src/game/auras/` | AuraProcessorChain + 7 stat processors |
| `src/game/pending/` | PendingCommand (discriminated union) + PendingCommandResolver |
| `src/game/data/` | CardRegistry (frozen), DeckDefinitions, MovementPresets, card definitions |
| `src/game/interfaces/` | IBoard, IPlayerState, IGameModifiers |
| `src/network/` | SocketManager (multiplayer relay) |
| `src/web3/` | WalletManager + EscrowManager (MetaMask/Core Wallet, Fuji testnet) |
| `src/auth/` | AuthManager (player authentication) |
| `src/deck/` | DeckAPI, DeckBuilderState, DeckEditorView, CollectionAPI |
| `src/lobby/` | RoomBrowserAPI, LobbySocketManager |
| `src/state/` | GlobalGameState (persistent) + RuntimeGameState (per-match) |

### Scene flow

```
PreloadScene → LoginScene → HubScene → ┬→ RoomBrowserScene → LobbyScene → BattleScene → ResultScene
                                        ├→ DeckBuilderScene
                                        └→ MainMenuScene → RoomScene → BattleScene → ResultScene
```

### Backend structure

| File/Folder | Purpose |
|-------------|---------|
| `server/app.ts` | Express + Socket.io bootstrap, rate limiter, Socket.IO Admin UI |
| `server/rooms/RoomManager.ts` | Room lifecycle, player tracking, game seed generation |
| `server/game/SessionManager.ts` | Game session handling, action validation, ready handshake |
| `server/game/PayoutService.ts` | Escrow payout calls with owner wallet |
| `server/game/GameLogWriter.ts` | Dev-mode game state logging |
| `server/lobby/LobbyManager.ts` | Lobby matchmaking |
| `server/lobby/RoomJanitor.ts` | Stale room cleanup |
| `server/api/` | REST routes: auth, decks, collections, matches, players |
| `server/db/` | SQLite database + migrations |
| `server/validation/` | Server-side deck validation (CardPool, DeckValidator) |

### Supporting folders

| Folder | Purpose |
|--------|---------|
| `tests/` | Game logic tests (vitest). Phaser mocked via `tests/mocks/phaser.ts` |
| `test/` | Hardhat/Solidity contract tests (mocha + chai) |
| `shared/` | Types shared between frontend and server (`NetworkEvents.ts`) |
| `context/` | Project docs: known-issues, bug-registry, network-protocol, coding principles |

## Key Configuration

- **Vite**: `vite/config.dev.mjs` and `vite/config.prod.mjs`
- **Hardhat**: `hardhat.config.ts` (Solidity 0.8.19, Fuji network)
- **Environment**: `.env.development` / `.env.production` — `VITE_SOCKET_URL`, contract address
- **Card definitions**: `src/game/data/cards/` (one file per card)
- **UI layouts**: `public/layouts/` (JSON position configs per scene)
- **Themes**: `public/themes/` (color schemes)
- **Deck config**: `public/deck.config.json` (card cost/name mappings)
- **MCP Servers**: `.mcp.json` (Chrome DevTools, Context7, GitHub, Playwright)

## Contract Details

`Escrow.sol` is Ownable. Key functions: `createMatch(bytes32)`, `joinMatch(bytes32)`, `claimWinnings(bytes32, address)`, `refundTie(bytes32)`. Rake is 500 bps (5%). Only the owner (backend wallet) can call payout functions. Deployed at `0xa145f82DC5b285B970BE71F48Cf5173E722cF515` on Fuji.

## Conventions & Principles

### Code style
- TypeScript throughout (frontend, server, Hardhat tests)
- Phaser 4 RC6 (not Phaser 3) — API differences exist from stable Phaser 3 docs
- EventBus is typed via `GameEventMap` (`src/game/types/GameEventMap.ts`) — use `EV.*` constants for compile-time payload checking
- Pre-existing 16-17 unused variable TS warnings are baseline — don't try to fix these

### Architecture rules
- **Game logic and rendering are strictly separated** — engine (`src/game/`) has zero Phaser imports; renderers read state from engine
- **State-Driven Rendering** — UI syncs from full engine state, not delta events. Never rely on incremental event streams for UI accuracy. See `context/OCB_CODING_PRINCIPLES.md` §3.6
- **Every state-setting operation must have a cancel/clear path** — if you add a `setPending()`, there must be a `cancelPending()`
- **Every local game action must have a network event** — if it changes engine state, it needs a socket emit
- **Every addEventListener must have a removeEventListener in cleanup**
- **Serialization must produce fully independent copies** — use deepFreeze for immutable data, deep copy for serialization
- **Damage calculation short-circuits on zero base** — 0 ATK = 0 damage regardless of bonuses
- **Player-relative coordinates must flip** — any dy offset needs `dySign = owner === P1 ? 1 : -1`

### EventBus payload mapping
`wireEngineToEventBus` enriches/transforms engine events before emitting to the bus. GameEventMap must reflect these UI-adapted payloads, NOT the raw `Ev*` interfaces from EventTypes.ts:
- `UNIT_PLACED` → `{ data: CardRenderData, col, row }` (not `EvUnitPlaced`)
- `UNIT_DIED` → `{ col, row, instanceId }` (subset of `EvUnitDied`)
- `CARD_DRAWN` → `{ card: CardRenderData, handIndex, deckRemaining }` (not `EvCardDrawn`)
- `CARD_PLAYED` / `CARD_DISCARDED` → adds `isLocal: boolean` field
- `UNIT_TRANSFORMED` → emitted as UNIT_DIED + UNIT_PLACED pair, never its own event

## Dev Tooling

### MCP Servers (configured in `.mcp.json`)
- **Chrome DevTools** — live browser inspection (console, DOM, network, screenshots). `dev_start.bat` launches Chrome with `--remote-debugging-port=9222`
- **Context7** — fetches live, version-specific docs for Phaser 4, Socket.io, ethers.js. Use when unsure about API signatures
- **GitHub** — manage issues/PRs from Claude Code. Requires OAuth auth via `/mcp` on first use
- **Playwright** — browser automation for self-QA after visual changes. Can navigate game, take screenshots, verify rendering

### MCP usage rules
- Always use Context7 when working with Phaser 4, ethers.js, React, or Socket.io APIs
- Use Chrome DevTools to inspect the running game before reporting bugs as fixed
- Use Playwright for self-QA after implementing visual changes (screenshot before/after)
- Keep total MCP servers ≤ 5 to avoid slow startup

### Socket.IO Admin UI
- Instrumented in `server/app.ts` (dev mode only, no auth)
- Dashboard: https://admin.socket.io → connect to `localhost:3001`
- Shows rooms, connected clients, events in real-time

### Browser extensions (manual install)
- **Phaser Debug Tool** — Chrome extension for live game object inspection, FPS, scene tree
- **Spector.js** — WebGL inspector for draw calls, textures, shaders. Critical for texture quality debugging

## Testing

### Test structure
- `tests/engine/` — game logic: phases, abilities, pending, replay, game loop, invariants, regression
- `tests/server/` — server: room flow, deck validation, lobby, auth, scene transitions, security
- `tests/setup.ts` — global beforeEach: resets GameState + seed before every test
- Phaser is mocked at `tests/mocks/phaser.ts`

### Test types
- **Unit tests**: Board, PlayerState, GameModifiers, CombatResolver, DeckValidator
- **Integration tests**: server DB (in-memory SQLite via `testDB.ts`), Socket.IO (real server)
- **Regression tests**: `bugRegression.test.ts` — covers 20 of 32 historical bugs
- **Property tests**: `gameInvariants.test.ts` — fast-check random action sequences verify invariants
- **Mutation tests**: `npm run test:mutate` — StrykerJS validates assertion quality

### Testing workflow
- After major changes: `npm run test:smoke` (game loop integrity)
- Before committing: `npm run test:game` (full suite, ~3s)
- After contract changes: `npx hardhat test`
- Periodic quality check: `npm run test:mutate` (mutation score should be >60%)

### Test-first protocol
- **Every bug fix MUST start with a failing test** that reproduces the bug before any code change. The test proves the bug exists and prevents regression.
- **Every new feature** should have at least one test covering the core behavior, written before or alongside the implementation.
- If a test cannot be written (e.g., pure rendering), document why in the commit message.

## Pre-Implementation Checklist

**MANDATORY** — before writing code for any feature or fix, verify:
- [ ] **Exhaustiveness**: Does this add a new variant/case? List ALL switch/map/registry sites that need updating
- [ ] **Symmetry**: Does this set state? Where's the clear/cancel path? Does this add a listener? Where's the cleanup? Does this emit locally? Where's the network send?
- [ ] **Player perspective**: Does this use coordinates/offsets? Is it flipped for P2?
- [ ] **Deep copy**: Does this serialize/freeze data? Is it recursive?
- [ ] **Test-first**: Is there a failing test that proves this bug exists / this feature works?

## Bug Registry Protocol

**MANDATORY — DO THIS IMMEDIATELY AFTER EVERY BUG FIX, NOT LATER**: When you fix a bug — whether reported by the user, found by you during implementation, or caught by a test — you MUST log it to `context/bug-registry.md` as part of the same response that contains the fix. Do NOT wait to be asked. Do NOT batch them. The bug registry entry is part of the fix, not a separate task.

Every time a bug is fixed, append an entry to `context/bug-registry.md` using this format:

```markdown
### BUG-NNN: Short description
- **Date**: YYYY-MM-DD
- **Category**: `logic` | `network` | `state` | `rendering` | `web3` | `type-safety` | `race-condition` | `memory-leak` | `security`
- **Discovered by**: `user` | `claude` | `test`
- **Symptom**: What the user/tester observed.
- **Root cause**: Why it happened (the actual code issue).
- **Fix**: What was changed.
- **Prevention**: How this class of bug could be avoided in the future.
- **Files**: Affected files.
```

Also update the **Stats Summary** table at the top of the file (increment the relevant category + discoverer counts).

Rules:
- `user` = bug found during playtesting or reported by the user
- `claude` = bug found by Claude during code review, implementation, or refactoring
- `test` = bug caught by an automated test
- Increment BUG-NNN sequentially (check current max in `context/bug-registry.md`)
- If the fix introduces a new prevention pattern, add it to the **Weakness Analysis** section
- Keep entries concise but complete enough to learn from

### Top weakness areas (from bug history)
1. **Exhaustiveness** — adding a new variant/case without updating ALL handlers (5 bugs)
2. **Symmetry** — every set needs a clear, every subscribe needs unsubscribe, every local action needs network send (5 bugs)
3. **Player perspective** — coordinates/offsets must account for both players (2 bugs)
4. **Deep vs shallow** — copy and freeze operations must be recursive (2 bugs)

## Patch Notes

Game changes are tracked in `context/dist/patch_notes.json` (unreleased + released patches). Update when shipping user-visible changes.

## Session Hygiene

- **Use `/clear` between unrelated tasks** — fresh context reduces carryover bugs
- **Use `/compact` when context fills** — preserves: modified file list, current task, failing test output
- **One task = one session** — use `claude --resume <name>` for multi-day tasks
- **After 2 failed corrections on the same issue**, `/clear` and rephrase the prompt rather than iterating further in degraded context

## Context Docs

Read these for deeper context when needed:
- `context/bug-registry.md` — structured bug history with root causes and prevention patterns
- `context/known-issues.md` — open issues + recent fix summaries
- `context/network-protocol.md` — full socket event flow, game action types, connection handshake
- `context/OCB_CODING_PRINCIPLES.md` — architectural principles and coding guidelines
- `context/OCB_Lobby_Deck_ActionPlan.md` — lobby & deck system implementation plan
