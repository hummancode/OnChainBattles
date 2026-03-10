# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnChainBattles is a blockchain-integrated card/strategy game built with Phaser 4 (game engine), Socket.io (multiplayer), and Solidity (on-chain escrow). Players deploy units on a 7x7 board and battle to destroy the opponent's King. Supports free-play and crypto modes (AVAX stakes via escrow contract on Avalanche Fuji testnet).

## Common Commands

```bash
# Frontend dev server (Vite, port 3000)
npm start

# Production build (outputs to dist/)
npm run build

# Backend multiplayer server (port 3001)
node server/index.js

# Smart contract tests
npx hardhat test
npx hardhat test solidity   # Solidity tests only
npx hardhat test mocha       # TypeScript integration tests only

# Deploy contract to Fuji testnet
npx hardhat ignition deploy --network fuji ignition/modules/Escrow.ts
```

## Architecture

### Three-tier system

1. **Frontend** (`src/`) - Phaser 4 game in TypeScript, bundled with Vite
2. **Backend** (`server/index.js`) - Express + Socket.io relay server; also holds the owner wallet to call escrow payout functions
3. **Smart Contract** (`contracts/Escrow.sol`) - On-chain escrow for match stakes; winner gets pot minus 5% rake

### Frontend scene flow

`PreLoadScene` → `MainMenuScene` → `RoomScene` → `BattleScene` → `ResultScene`

Each scene lives in `src/scenes/` and has a corresponding renderer in `src/renderers/`.

### Game engine (`src/game/`)

- **GameEngine** - Thin orchestrator owning Board, PlayerState, GameModifiers, AuraSystem
- Turn phases execute sequentially: Draw → LEG → Play → Act → End (each in `src/game/phases/`)
- **CombatResolver** handles damage; abilities use Strategy Pattern via `src/game/abilities/` (registry + per-ability handler files)
- **UnitFactory** creates runtime unit instances from card definitions in `src/data/`

### Rendering layer (`src/renderers/`)

Renderers are decoupled from game logic. BoardRenderer, HandRenderer, HUDRenderer, OverlayRenderer each manage their own Phaser objects. Input flows through **SelectionManager** → GameEngine.

### Multiplayer (`src/network/SocketManager.ts` ↔ `server/index.js`)

Socket.io relays all game actions between players. The server generates a shared `game_seed` for deterministic deck shuffling. In crypto mode, the server calls `Escrow.claimWinnings()` with the owner wallet after receiving `game_over`.

### Web3 (`src/web3/`)

- **WalletManager** - MetaMask/Core Wallet connection, auto-switches to Fuji (chainId 43113)
- **EscrowManager** - Calls `createMatch`/`joinMatch` on the escrow contract (0.01 AVAX stake)
- Match IDs: room code string → UTF-8 hex → zero-padded to bytes32 (must match across frontend, server, and contract)

## Key Configuration

- **Vite configs**: `vite/config.dev.mjs` and `vite/config.prod.mjs`
- **Hardhat config**: `hardhat.config.ts` (Solidity 0.8.19, Fuji network)
- **Environment**: `.env.development` (local) and `.env.production` (deployed) set `VITE_SOCKET_URL` and contract address
- **Card definitions**: `src/data/` (card stats, abilities, movement patterns)
- **UI layouts**: `public/layouts/` (JSON position configs per scene)
- **Themes**: `public/themes/` (color schemes)
- **Deck config**: `public/deck.config.json` (card cost/name mappings loaded at runtime)

## Contract Details

`Escrow.sol` is Ownable. Key functions: `createMatch(bytes32)`, `joinMatch(bytes32)`, `claimWinnings(bytes32, address)`, `refundTie(bytes32)`. Rake is 500 bps (5%). Only the owner (backend wallet) can call payout functions. Deployed at `0xa145f82DC5b285B970BE71F48Cf5173E722cF515` on Fuji.

## Conventions

- TypeScript throughout (frontend + Hardhat tests); server is plain JS
- Game logic and rendering are strictly separated (engine vs renderers)
- Global state lives in `src/state/GlobalGameState.ts` (persistent across scenes) and `src/state/RuntimeGameState.ts` (per-match)
- Phaser 4 RC6 is used (not Phaser 3) - API differences exist from stable Phaser 3 docs
- EventBus is typed via `GameEventMap` (`src/game/types/GameEventMap.ts`) — use `EV.*` constants for compile-time payload checking

## Plan Notes (OCB_Architecture_ActionPlan_FINAL_v5.md)

Issues and corrections discovered while executing the refactoring plan:

- **PatternResolver.ts is NOT dead code** — Plan says delete it (P2.7, Step 1.8), but it actively exports `resolveCustomPattern()` and offset constants (`OFFSETS_OMNI`, `OFFSETS_HV`, `OFFSETS_DIAGONAL`, `OFFSETS_FORWARD_ONLY`) used by MovementRules. Do NOT delete. Could be moved/renamed in Phase 6 instead.
- **Line number references are wrong** — The handler extraction table (Step 1.4) references "codebase.md" line numbers (5176-5619), not actual AbilityResolver.ts lines. The real file was ~603 lines. Use the actual source, not the table line numbers.
- **PendingInteraction missing `count` field** — The `PendingInteraction` interface in `AbilityTypes.ts` has no `count` property, but `warHornHandler` sets `count: 1`. This caused TS2353 at line 487. Phase 3 (PendingCommand) should add `count` to the DISCARD variant.
- **EventBus payloads differ from EventTypes.ts** — `wireEngineToEventBus` in BattleScene enriches/transforms engine events before emitting to the bus. The GameEventMap must reflect these UI-adapted payloads, NOT the raw `Ev*` interfaces from EventTypes.ts. Key differences:
  - `UNIT_PLACED` → `{ data: CardRenderData, col, row }` (not `EvUnitPlaced`)
  - `UNIT_DIED` → `{ col, row, instanceId }` (subset of `EvUnitDied`)
  - `CARD_DRAWN` → `{ card: CardRenderData, handIndex, deckRemaining }` (not `EvCardDrawn`)
  - `CARD_PLAYED` / `CARD_DISCARDED` → adds `isLocal: boolean` field
  - `UNIT_TRANSFORMED` → emitted as a UNIT_DIED + UNIT_PLACED pair, never as its own event
- **Pre-existing TS errors** — 16-17 unused variable warnings (`noUnusedLocals`/`noUnusedParameters`) exist as baseline. These are class members and locals in HUDRenderer, OverlayRenderer, HandRenderer, RoomScene, PreloadScene, SelectionManager, ActPhase, MipmapHelper. They don't block builds (Vite ignores them) but `npx tsc --noEmit` will report them.
- **`noUnusedLocals` does NOT respect `_` prefix** — Unlike `noUnusedParameters`, TypeScript's `noUnusedLocals` does not suppress warnings for `_`-prefixed local variables or class members. Only function parameters benefit from `_` prefix.
- **Phase 2 typed EventBus uses overloads** — The EventBus `on`/`emit`/`once` methods have typed overloads for `GameEventType` keys AND a fallback `string` overload for backward compatibility. This means raw string usage still compiles but doesn't get type checking.

## Refactoring Progress

| Phase | Status | Description |
|-------|--------|-------------|
| Pre-cleanup | Done | Removed 15 unused imports, prefixed 2 unused params |
| 1. AbilityResolver → Strategy | Done | Deleted 602 LOC monolith → 19 handler files + registry + dispatcher |
| 2. Typed EventBus | Done | GameEventMap with 35+ typed events, fixed 5 real payload bugs |
| 3. PendingCommand | Pending | |
| 4. BattleScene Decomposition | Pending | |
| 5. CardRenderer Split | Pending | |
| 6. CardDefinitions Restructure | Pending | |
| 7. Interface Extraction | Pending | |
| 8. AuraSystem Chain | Pending | |
| 9. Server TypeScript | Pending | |
| 10. Renderer Utilities | Pending | |
| 11. GameState Cleanup | Pending | |
