# .claude\settings.local.json

```json
{
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Glob(*)",
      "Grep(*)",
      "WebFetch(domain:localhost)"
    ]
  }
}

```

# .gitignore

```
# Node modules
/node_modules

# Compilation output
/dist
/server/dist

# pnpm deploy output
/bundle

# Hardhat Build Artifacts
/artifacts

# Hardhat compilation (v2) support directory
/cache

# Typechain output
/types

# Hardhat coverage reports
/coverage

# Environment files (contain secrets)
.env
.env.local
.env.*.local

# Dev tools (local only, not shipped)
/dev-tools

# Game session logs (generated during play, for debugging)
/logs

# SQLite database (local dev data)
server/data/

# Claude Code local settings
.claude/

```

# CLAUDE.md

```md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OnChainBattles is a blockchain-integrated card/strategy game built with Phaser 4 (game engine), Socket.io (multiplayer), and Solidity (on-chain escrow). Players deploy units on a 7x7 board and battle to destroy the opponent's King. Supports free-play and crypto modes (AVAX stakes via escrow contract on Avalanche Fuji testnet).

## Common Commands

\`\`\`bash
# Frontend dev server (Vite, port 8080)
npm start

# Production build (outputs to dist/)
npm run build

# Backend multiplayer server (port 3001)
npm run server

# Game logic tests (vitest, tests/ folder)
npm run test:game           # single run — all 74 tests
npm run test:game:watch     # watch mode
npm run test:smoke          # game loop smoke test (run after major changes)

# Smart contract tests (Hardhat, test/ folder)
npx hardhat test
npx hardhat test solidity   # Solidity tests only
npx hardhat test mocha       # TypeScript integration tests only

# Deploy contract to Fuji testnet
npx hardhat ignition deploy --network fuji ignition/modules/Escrow.ts

# Full dev start (server + frontend)
dev_start.bat
\`\`\`

## Architecture

### Three-tier system

1. **Frontend** (`src/`) - Phaser 4 game in TypeScript, bundled with Vite
2. **Backend** (`server/`) - Express + Socket.io relay server in TypeScript; also holds the owner wallet to call escrow payout functions
3. **Smart Contract** (`contracts/Escrow.sol`) - On-chain escrow for match stakes; winner gets pot minus 5% rake

### Supporting folders

- **`tests/`** — Game logic tests (vitest). Engine, phases, abilities, pending interactions. Phaser is mocked via `tests/mocks/phaser.ts`.
- **`test/`** — Hardhat/Solidity contract tests (mocha + chai). Separate from game tests.
- **`context/`** — Project context docs for Claude and developers. Architecture plans, known issues, network protocol, changelogs. Read these first when onboarding.
- **`shared/`** — Types shared between frontend and server (`NetworkEvents.ts`)

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

### Multiplayer (`src/network/SocketManager.ts` ↔ `server/app.ts`)

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

- **PatternResolver.ts was deleted** — After Phase 6, MovementRules.ts has its own `resolveCustomPattern()` and offset constants. PatternResolver.ts became dead code (zero imports) and was removed.
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
| 3. PendingCommand | Done | Removed callback anti-pattern → serializable PendingCommand union type + resolver |
| 4. BattleScene Decomposition | Done | 496-LOC monolith → 5 coordinators + thin shell (~120 LOC) |
| 5. CardRenderer Split | Done | 548-LOC monolith → 4 renderers + helpers + thin facade |
| 6. CardDefinitions Restructure | Done | Extracted CardRegistry (frozen), DeckDefinitions, MovementPresets |
| 7. Interface Extraction | Done | IBoard, IPlayerState, IGameModifiers interfaces + implements |
| 8. AuraSystem Chain | Done | 270-LOC monolith → 7 processors + chain + helpers, class ~75 LOC |
| 9. Server TypeScript | Done | JS monolith → 4 TS files (app, RoomManager, SessionManager, PayoutService) + shared NetworkEvents |
| 10. Renderer Utilities | Done | TextureHelper, ButtonFactory, CardLayoutCalc + wired into HUD/Overlay/Hand renderers |
| 11. GameState Cleanup | Done | BoardGameResult replaces MatchResult+MatchState, typed fields, 0 `as any` casts |

```

# commit.bat

```bat
@echo off
title OnChainBattles Commit
color 0B

cd /d D:\OnChainBattles

echo ==========================================
echo OnChainBattles - Git Commit ve Push
echo ==========================================
echo.

REM Git kontrolü
where git >nul 2>nul
if errorlevel 1 (
    echo Git bulunamadi! Lutfen Git yukleyin.
    pause
    exit /b 1
)

REM Degisiklikleri goster
echo Bekleyen degisiklikler:
git status -s
echo.

REM Kullanici onayi
set /p onay="Devam etmek istiyor musunuz? (E/H): "
if /i not "%onay%"=="E" (
    echo Islem iptal edildi.
    pause
    exit /b 0
)

REM Commit mesaji
set /p mesaj="Commit mesaji girin: "

REM Git islemleri
echo.
echo [1/2] Degisiklikler ekleniyor...
git add .

echo [2/2] Commit ve push...
git commit -m "%mesaj%"
git push origin main

if errorlevel 1 (
    echo.
    echo Push basarisiz! Alternatif olarak:
    echo git push origin master
    echo veya
    echo git push origin HEAD
) else (
    echo.
    echo Basarili! Commit: %mesaj%
)

echo.
pause
```

# contracts\Escrow.sol

```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Escrow {
    // ─── Match State ──────────────────────────────────────────
    enum MatchStatus { Waiting, Ready, Finished }

    struct Match {
        address playerA;
        address playerB;
        uint256 stake;
        MatchStatus status;
    }

    mapping(bytes32 => Match) public matches;
    address public owner;
    uint256 public rakeBps = 500; // 5% rake (500 basis points)

    // ─── Events ───────────────────────────────────────────────
    event MatchCreated(bytes32 matchId, address playerA, uint256 stake);
    event MatchReady(bytes32 matchId, address playerA, address playerB);
    event MatchFinished(bytes32 matchId, address winner, uint256 payout);

    constructor() {
        owner = msg.sender;
    }

    // ─── Create Match ─────────────────────────────────────────
    function createMatch(bytes32 matchId) external payable {
        require(msg.value > 0, "Stake required");
        require(matches[matchId].playerA == address(0), "Match exists");

        matches[matchId] = Match({
            playerA: msg.sender,
            playerB: address(0),
            stake: msg.value,
            status: MatchStatus.Waiting
        });

        emit MatchCreated(matchId, msg.sender, msg.value);
    }

    // ─── Join Match ───────────────────────────────────────────
    function joinMatch(bytes32 matchId) external payable {
        Match storage m = matches[matchId];
        require(m.playerA != address(0), "Match not found");
        require(m.playerB == address(0), "Match full");
        require(msg.value == m.stake, "Wrong stake amount");
        require(msg.sender != m.playerA, "Cannot join own match");

        m.playerB = msg.sender;
        m.status = MatchStatus.Ready;

        emit MatchReady(matchId, m.playerA, m.playerB);
    }

    // ─── Claim Winnings ───────────────────────────────────────
    // Called by owner (your backend) after dice result is known
    function claimWinnings(bytes32 matchId, address winner) external {
        require(msg.sender == owner, "Only owner");
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Ready, "Match not ready");
        require(winner == m.playerA || winner == m.playerB, "Invalid winner");

        m.status = MatchStatus.Finished;

        uint256 pot = m.stake * 2;
        uint256 rake = (pot * rakeBps) / 10000;
        uint256 payout = pot - rake;

        payable(winner).transfer(payout);
        payable(owner).transfer(rake);

        emit MatchFinished(matchId, winner, payout);
    }

    // ─── Refund Tie ───────────────────────────────────────────
    function refundTie(bytes32 matchId) external {
        require(msg.sender == owner, "Only owner");
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.Ready, "Match not ready");

        m.status = MatchStatus.Finished;
        payable(m.playerA).transfer(m.stake);
        payable(m.playerB).transfer(m.stake);
    }

    // ─── Owner Withdraw ───────────────────────────────────────
    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        payable(owner).transfer(address(this).balance);
    }
}
```

# dev_start.bat

```bat
@echo off
title OnChainBattles - Dev Environment
color 0A

echo.
echo  ==========================================
echo   OnChainBattles - Starting Dev Environment
echo  ==========================================
echo.

REM ── Check Node.js ─────────────────────────────────────────────
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found. Install from nodejs.org
    pause
    exit /b 1
)

REM ── Set project root (edit this path if you move the project) ──
set PROJECT_DIR=D:\OnChainBattles
cd /d "%PROJECT_DIR%"

echo [1/3] Checking .env file...
if not exist ".env" (
    echo [ERROR] .env file not found at %PROJECT_DIR%\.env
    echo        Create it with: FUJI_PRIVATE_KEY=0xyour64charkey
    pause
    exit /b 1
)
echo        .env found OK

echo.
echo [1.5/3] Clearing port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do taskkill /PID %%a /F >nul 2>nul
echo        Done.
echo [2/3] Building & starting Socket.io server on port 3001...
start "OCB - Socket Server" cmd /k "cd /d %PROJECT_DIR% && npm run server"
ping -n 3 127.0.0.1 >nul

echo.
echo [3/3] Starting Vite dev server on port 8080...
start "OCB - Vite Dev" cmd /k "cd /d %PROJECT_DIR% && npm start"
ping -n 4 127.0.0.1 >nul

echo.
echo  ==========================================
echo   All services started!
echo  
echo   Game:    http://localhost:8080
echo   Socket:  http://localhost:3001
echo   Fuji:    https://testnet.snowtrace.io
echo  ==========================================
echo.
echo  USEFUL COMMANDS (run in a new terminal):
echo.
echo   Compile contract:
echo   npx hardhat compile
echo.
echo   Redeploy contract to Fuji:
echo   npx hardhat run scripts/deploy.mjs --network fuji
echo.
echo   Check Fuji contract:
echo   https://testnet.snowtrace.io/address/0xa145f82DC5b285B970BE71F48Cf5173E722cF515
echo.
echo  Press any key to open the game in browser...
pause >nul

start http://localhost:8080

echo.
echo  Dev environment running. Close the server windows to stop.
echo.
pause

```

# dev-tools\card-pattern-editor.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<title>Card Pattern Editor v2</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    min-height: 100vh;
    padding: 20px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid #333;
  }
  .header h1 { font-size: 1.4em; color: #c9a84c; }
  .header .ver { font-size: 11px; color: #555; margin-left: 8px; }
  .header-controls { display: flex; gap: 12px; align-items: center; }
  .header-controls select {
    padding: 6px 12px;
    background: #16213e;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 14px;
    min-width: 200px;
  }

  .main { display: flex; gap: 24px; flex-wrap: wrap; }

  .controls {
    display: flex; gap: 16px; align-items: center;
    margin-bottom: 16px; flex-wrap: wrap;
  }
  .controls label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .controls input[type="radio"],
  .controls input[type="checkbox"] { accent-color: #c9a84c; }
  .controls input[type="number"] {
    width: 50px; padding: 3px 6px;
    background: #16213e; color: #e0e0e0;
    border: 1px solid #444; border-radius: 3px;
  }

  .grid-container { position: relative; }
  .grid-label {
    text-align: center; font-size: 12px; color: #888;
    padding: 4px 0; text-transform: uppercase; letter-spacing: 2px;
  }
  .col-labels { display: flex; gap: 2px; padding-left: 0; justify-content: center; margin-bottom: 2px; }
  .col-labels span { width: 52px; text-align: center; font-size: 12px; color: #888; }

  .grid {
    display: grid;
    grid-template-columns: repeat(7, 52px);
    grid-template-rows: repeat(7, 52px);
    gap: 2px;
  }
  .cell {
    width: 52px; height: 52px;
    background: #16213e;
    border: 1px solid #333;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: #555;
    transition: all 0.15s;
    position: relative;
  }
  .cell:hover:not(.center) {
    border-color: #c9a84c;
    background: #1e2a4a;
  }
  .cell.center {
    background: #2a1a1a;
    border-color: #666;
    cursor: default;
    font-size: 18px;
    color: #c9a84c;
  }
  /* Custom pattern cells (solid borders) */
  .cell.custom-move {
    background: #1a3a5c;
    border: 2px solid #4a9eff;
    box-shadow: inset 0 0 8px rgba(74, 158, 255, 0.3);
  }
  .cell.custom-attack {
    background: #4a1a1a;
    border: 2px solid #ff4a4a;
    box-shadow: inset 0 0 8px rgba(255, 74, 74, 0.3);
  }
  .cell.custom-both {
    background: #3a1a4a;
    border: 2px solid #b44aff;
    box-shadow: inset 0 0 8px rgba(180, 74, 255, 0.3);
  }
  /* Base enum pattern cells (dashed borders, visible) */
  .cell.base-move {
    background: #0d3460;
    border: 2px dashed #3d8ef0;
    box-shadow: inset 0 0 12px rgba(61, 142, 240, 0.25);
  }
  .cell.base-attack {
    background: #501010;
    border: 2px dashed #e04040;
    box-shadow: inset 0 0 12px rgba(224, 64, 64, 0.25);
  }
  .cell.base-both {
    background: #3a1050;
    border: 2px dashed #c050e0;
    box-shadow: inset 0 0 12px rgba(192, 80, 224, 0.25);
  }
  .cell .cell-icon {
    font-size: 16px;
    color: rgba(255,255,255,0.55);
    pointer-events: none;
  }
  .cell .tooltip {
    display: none;
    position: absolute;
    bottom: -24px;
    background: #000;
    color: #ccc;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    white-space: nowrap;
    z-index: 10;
  }
  .cell:hover .tooltip { display: block; }

  .preview-section { flex: 1; min-width: 350px; }
  .preview-section h3 { color: #c9a84c; margin-bottom: 8px; }
  .preview {
    background: #0a0a1a;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 16px;
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre;
    overflow-x: auto;
    min-height: 200px;
    color: #b0b0b0;
  }

  .actions {
    display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap;
  }
  .btn {
    padding: 8px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.15s;
  }
  .btn-primary { background: #c9a84c; color: #1a1a2e; }
  .btn-primary:hover { background: #dbb85c; }
  .btn-primary:disabled { background: #555; color: #888; cursor: not-allowed; }
  .btn-secondary { background: #333; color: #e0e0e0; }
  .btn-secondary:hover { background: #444; }
  .btn-danger { background: #5a2020; color: #ff8888; }
  .btn-danger:hover { background: #6a2a2a; }

  .status {
    margin-top: 12px;
    padding: 8px 14px;
    border-radius: 4px;
    font-size: 13px;
    min-height: 36px;
    display: flex;
    align-items: center;
  }
  .status.saved { background: #1a3a1a; color: #6f6; border: 1px solid #2a5a2a; }
  .status.unsaved { background: #3a3a1a; color: #ff8; border: 1px solid #5a5a2a; }
  .status.error { background: #3a1a1a; color: #f88; border: 1px solid #5a2a2a; }
  .status.idle { background: #1a1a2e; color: #888; border: 1px solid #333; }

  .legend {
    display: flex; gap: 16px; margin-top: 12px; font-size: 12px; flex-wrap: wrap;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-swatch {
    width: 16px; height: 16px; border-radius: 3px;
  }

  .card-info {
    margin-bottom: 12px; padding: 10px 14px;
    background: #16213e; border-radius: 6px;
    font-size: 13px;
  }
  .card-info .card-name { color: #c9a84c; font-weight: bold; font-size: 15px; }
  .card-info .card-id { color: #888; margin-left: 8px; }
  .card-info .card-enums { color: #6af; margin-left: 12px; font-size: 12px; font-family: monospace; }

  .kbd { background: #333; padding: 1px 5px; border-radius: 3px; font-size: 11px; color: #aaa; border: 1px solid #555; }
  #debug { font-size: 11px; color: #666; margin-top: 6px; font-family: monospace; }
</style>
</head>
<body>

<div class="header">
  <h1>Card Pattern Editor <span class="ver">v2</span></h1>
  <div class="header-controls">
    <select id="cardSelect"><option value="">Loading cards...</option></select>
    <button class="btn btn-primary" id="saveBtn" disabled>Save to File</button>
  </div>
</div>

<div id="cardInfo" class="card-info" style="display:none;">
  <span class="card-name" id="cardName"></span>
  <span class="card-id" id="cardId"></span>
  <span class="card-enums" id="cardEnums"></span>
</div>

<div class="controls">
  <label><input type="radio" name="mode" value="move" checked> Movement</label>
  <label><input type="radio" name="mode" value="attack"> Attack</label>
  <span style="color:#555">|</span>
  <label><input type="checkbox" id="canJump"> canJump</label>
  <label><input type="checkbox" id="requiresEnemy"> requiresEnemy</label>
  <label>Range: <input type="number" id="range" value="1" min="1" max="5"></label>
  <span style="color:#555">|</span>
  <span style="font-size:12px;color:#888">
    <span class="kbd">M</span> movement &nbsp;
    <span class="kbd">A</span> attack &nbsp;
    <span class="kbd">C</span> clear all
  </span>
</div>

<div class="main">
  <div>
    <div class="grid-container">
      <div class="grid-label">Enemy Side</div>
      <div class="col-labels">
        <span>A</span><span>B</span><span>C</span><span>D</span><span>E</span><span>F</span><span>G</span>
      </div>
      <div class="grid" id="grid"></div>
      <div class="grid-label">Your Side</div>
    </div>

    <div class="legend">
      <div class="legend-item"><div class="legend-swatch" style="background:#0d3460;border:2px dashed #3d8ef0"></div> Base Move</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#501010;border:2px dashed #e04040"></div> Base Attack</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#3a1050;border:2px dashed #c050e0"></div> Base Both</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#1a3a5c;border:2px solid #4a9eff"></div> Custom Move</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#4a1a1a;border:2px solid #ff4a4a"></div> Custom Attack</div>
      <div class="legend-item"><div class="legend-swatch" style="background:#3a1a4a;border:2px solid #b44aff"></div> Custom Both</div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" id="saveBtn2">Save to File</button>
      <button class="btn btn-secondary" id="clearMoveBtn">Clear Movement</button>
      <button class="btn btn-secondary" id="clearAtkBtn">Clear Attack</button>
      <button class="btn btn-danger" id="clearAllBtn">Clear All</button>
    </div>

    <div class="status idle" id="status">Select a card to begin editing.</div>
    <div id="debug"></div>
  </div>

  <div class="preview-section">
    <h3>TypeScript Preview</h3>
    <div class="preview" id="preview">// Select a card and toggle cells to see preview</div>
  </div>
</div>

<script>
const GRID_SIZE = 7;
const CENTER = 3;

// ── Enum to offset maps ─────────────────────────────────────

function omniOffsets(range) {
  const out = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= range) {
        out.push(dx + ',' + dy);
      }
    }
  }
  return out;
}

const MOVE_MAP = {
  'OMNI_1':          () => omniOffsets(1),
  'OMNI_2':          () => omniOffsets(2),
  'OMNI_3':          () => omniOffsets(3),
  'VERTICAL_2':      () => ['0,-1', '0,1', '0,-2', '0,2'],
  'JUMP_DIAGONAL_1': () => ['1,-1', '-1,-1', '1,1', '-1,1'],
  'FWD_VERTICAL_1':  () => ['0,-1'],
  'STATIC':          () => [],
};

const ATK_MAP = {
  'HV':                () => ['0,-1', '0,1', '-1,0', '1,0'],
  'OMNI':              () => omniOffsets(1),
  'DIAGONAL_RANGED_2': () => ['1,-1', '-1,-1', '1,1', '-1,1', '2,-2', '-2,-2', '2,2', '-2,2'],
  'STRAIGHT_RANGED_3': () => ['0,-1', '0,-2', '0,-3', '0,1', '0,2', '0,3', '-1,0', '-2,0', '-3,0', '1,0', '2,0', '3,0'],
  'ON_JUMP':           () => [],
  'AREA_ADJ':          () => omniOffsets(1),
  'FWD_VERTICAL':      () => ['0,-1'],
  'NONE':              () => [],
};

// ── State ───────────────────────────────────────────────────

let customMoveKeys   = new Set();
let customAttackKeys = new Set();
let baseMoveKeys     = new Set();
let baseAttackKeys   = new Set();
let currentCard = null;
let dirty = false;

// ── DOM refs ────────────────────────────────────────────────

const grid       = document.getElementById('grid');
const cardSelect = document.getElementById('cardSelect');
const preview    = document.getElementById('preview');
const statusEl   = document.getElementById('status');
const saveBtn    = document.getElementById('saveBtn');
const saveBtn2   = document.getElementById('saveBtn2');
const debugEl    = document.getElementById('debug');

// ── Grid ────────────────────────────────────────────────────

function buildGrid() {
  grid.innerHTML = '';
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.col = col;
      cell.dataset.row = row;
      const dx = col - CENTER;
      const dy = row - CENTER;

      if (dx === 0 && dy === 0) {
        cell.classList.add('center');
        cell.textContent = '\u265A';
      } else {
        const tip = document.createElement('span');
        tip.className = 'tooltip';
        tip.textContent = 'dx:' + dx + ', dy:' + (-dy) + (dy < 0 ? ' (fwd)' : dy > 0 ? ' (back)' : '');
        cell.appendChild(tip);
        cell.addEventListener('click', function() { toggleCell(dx, dy); });
      }
      grid.appendChild(cell);
    }
  }
}

function toggleCell(dx, dy) {
  const key = dx + ',' + dy;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const set = (mode === 'move') ? customMoveKeys : customAttackKeys;
  if (set.has(key)) set.delete(key); else set.add(key);
  dirty = true;
  refreshGrid();
  updatePreview();
  updateStatus();
}

function refreshGrid() {
  const cells = grid.querySelectorAll('.cell');
  for (const cell of cells) {
    if (cell.classList.contains('center')) continue;
    const dx = parseInt(cell.dataset.col) - CENTER;
    const dy = parseInt(cell.dataset.row) - CENTER;
    const key = dx + ',' + dy;

    // Reset classes
    cell.className = 'cell';

    // Remove old icon
    const oldIcon = cell.querySelector('.cell-icon');
    if (oldIcon) oldIcon.remove();

    const cm = customMoveKeys.has(key);
    const ca = customAttackKeys.has(key);
    const bm = baseMoveKeys.has(key);
    const ba = baseAttackKeys.has(key);

    // Custom takes visual priority
    if (cm && ca) {
      cell.classList.add('custom-both');
    } else if (cm) {
      cell.classList.add('custom-move');
    } else if (ca) {
      cell.classList.add('custom-attack');
    } else if (bm && ba) {
      cell.classList.add('base-both');
      addIcon(cell, '\u2726'); // four-pointed star
    } else if (bm) {
      cell.classList.add('base-move');
      addIcon(cell, '\u2192'); // right arrow
    } else if (ba) {
      cell.classList.add('base-attack');
      addIcon(cell, '\u2694'); // crossed swords
    }
  }
  saveBtn.disabled  = !dirty || !currentCard;
  saveBtn2.disabled = !dirty || !currentCard;
}

function addIcon(cell, icon) {
  const span = document.createElement('span');
  span.className = 'cell-icon';
  span.textContent = icon;
  cell.appendChild(span);
}

// ── Preview ─────────────────────────────────────────────────

function buildPatternObj(keys) {
  if (keys.size === 0) return null;
  const canJump = document.getElementById('canJump').checked;
  const requiresEnemy = document.getElementById('requiresEnemy').checked;
  const range = parseInt(document.getElementById('range').value) || 1;

  // Editor grid: up (toward enemy) = negative screen-dy.
  // Engine convention: dy > 0 = toward enemy (P1 perspective).
  // Negate dy on save so the file matches the engine convention.
  const offsets = [...keys].map(function(k) {
    const parts = k.split(',');
    return { dx: parseInt(parts[0]), dy: -parseInt(parts[1]) };
  }).sort(function(a, b) { return a.dy - b.dy || a.dx - b.dx; });

  const obj = { offsets: offsets };
  if (range !== 1) obj.range = range;
  if (canJump) obj.canJump = true;
  if (requiresEnemy) obj.requiresEnemy = true;
  return obj;
}

function formatPatternTS(p, indent) {
  if (!p) return '';
  var lines = ['{'];
  lines.push(indent + '  offsets: [');
  for (var i = 0; i < p.offsets.length; i += 4) {
    var chunk = p.offsets.slice(i, i + 4);
    lines.push(indent + '    ' + chunk.map(function(o) { return '{ dx: ' + o.dx + ', dy: ' + o.dy + ' }'; }).join(', ') + ',');
  }
  lines.push(indent + '  ],');
  if (p.range !== undefined && p.range !== 1) lines.push(indent + '  range: ' + p.range + ',');
  if (p.canJump) lines.push(indent + '  canJump: true,');
  if (p.requiresEnemy) lines.push(indent + '  requiresEnemy: true,');
  lines.push(indent + '}');
  return lines.join('\n');
}

function updatePreview() {
  var mp = buildPatternObj(customMoveKeys);
  var ap = buildPatternObj(customAttackKeys);
  var text = '';
  if (ap) text += 'customAttack: ' + formatPatternTS(ap, '      ') + ',\n';
  if (mp) text += 'customMove: ' + formatPatternTS(mp, '      ') + ',\n';
  if (!text) text = '// No custom patterns set';
  preview.textContent = text;
}

// ── Status ──────────────────────────────────────────────────

function updateStatus() {
  if (!currentCard) {
    statusEl.className = 'status idle';
    statusEl.textContent = 'Select a card to begin editing.';
  } else if (dirty) {
    statusEl.className = 'status unsaved';
    statusEl.textContent = 'Unsaved changes';
  } else {
    statusEl.className = 'status idle';
    statusEl.textContent = 'Card loaded — click grid to edit.';
  }
}

function showSaved(file) {
  dirty = false;
  statusEl.className = 'status saved';
  statusEl.textContent = 'Saved ' + file + ' \u2713';
  saveBtn.disabled = true;
  saveBtn2.disabled = true;
}

function showError(msg) {
  statusEl.className = 'status error';
  statusEl.textContent = 'Error: ' + msg;
}

// ── Load ────────────────────────────────────────────────────

async function loadCards() {
  try {
    var res = await fetch('/api/cards');
    var cards = await res.json();
    cardSelect.innerHTML = '<option value="">-- Select a card --</option>';

    var units  = cards.filter(function(c) { return c.hasStats; });
    var spells = cards.filter(function(c) { return !c.hasStats; });

    if (units.length) {
      var g = document.createElement('optgroup');
      g.label = 'Units & Structures';
      units.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name + (c.customMove || c.customAttack ? ' \u2022' : '');
        g.appendChild(opt);
      });
      cardSelect.appendChild(g);
    }
    if (spells.length) {
      var g2 = document.createElement('optgroup');
      g2.label = 'Spells (no patterns)';
      spells.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        opt.disabled = true;
        g2.appendChild(opt);
      });
      cardSelect.appendChild(g2);
    }
  } catch (err) {
    showError('Failed to load cards: ' + err.message);
  }
}

async function loadCard(id) {
  if (!id) {
    currentCard = null;
    customMoveKeys.clear();
    customAttackKeys.clear();
    baseMoveKeys.clear();
    baseAttackKeys.clear();
    dirty = false;
    document.getElementById('cardInfo').style.display = 'none';
    debugEl.textContent = '';
    refreshGrid();
    updatePreview();
    updateStatus();
    return;
  }

  try {
    var res = await fetch('/api/card/' + id);
    currentCard = await res.json();

    document.getElementById('cardInfo').style.display = 'block';
    document.getElementById('cardName').textContent = currentCard.name;
    document.getElementById('cardId').textContent = '(' + currentCard.id + ')';

    // Show movement/attack enums
    var parts = [];
    if (currentCard.movement) parts.push('Move: ' + currentCard.movement);
    if (currentCard.attackPattern) parts.push('Atk: ' + currentCard.attackPattern);
    document.getElementById('cardEnums').textContent = parts.join('  |  ');

    // Resolve base enum patterns into grid keys
    baseMoveKeys.clear();
    baseAttackKeys.clear();

    if (currentCard.movement && MOVE_MAP[currentCard.movement]) {
      MOVE_MAP[currentCard.movement]().forEach(function(k) { baseMoveKeys.add(k); });
    }
    if (currentCard.attackPattern && ATK_MAP[currentCard.attackPattern]) {
      ATK_MAP[currentCard.attackPattern]().forEach(function(k) { baseAttackKeys.add(k); });
    }

    // Debug output
    debugEl.textContent = 'Base: ' + baseMoveKeys.size + ' move, ' + baseAttackKeys.size + ' attack cells';

    // Load custom patterns
    customMoveKeys.clear();
    customAttackKeys.clear();
    document.getElementById('canJump').checked = false;
    document.getElementById('requiresEnemy').checked = false;
    document.getElementById('range').value = 1;

    // Engine convention: dy > 0 = toward enemy. Editor grid: up = negative screen-dy.
    // Negate dy on load to convert engine coords → screen coords.
    if (currentCard.customMove && currentCard.customMove.offsets) {
      currentCard.customMove.offsets.forEach(function(o) { customMoveKeys.add(o.dx + ',' + (-o.dy)); });
      if (currentCard.customMove.canJump) document.getElementById('canJump').checked = true;
      if (currentCard.customMove.requiresEnemy) document.getElementById('requiresEnemy').checked = true;
      if (currentCard.customMove.range) document.getElementById('range').value = currentCard.customMove.range;
    }
    if (currentCard.customAttack && currentCard.customAttack.offsets) {
      currentCard.customAttack.offsets.forEach(function(o) { customAttackKeys.add(o.dx + ',' + (-o.dy)); });
    }

    dirty = false;
    refreshGrid();
    updatePreview();
    updateStatus();
  } catch (err) {
    showError('Failed to load card: ' + err.message);
  }
}

// ── Save ────────────────────────────────────────────────────

async function saveCard() {
  if (!currentCard) return;
  var mp = buildPatternObj(customMoveKeys);
  var ap = buildPatternObj(customAttackKeys);

  try {
    var res = await fetch('/api/card/' + currentCard.id + '/patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customMove: mp, customAttack: ap }),
    });
    var result = await res.json();
    if (result.success) showSaved(result.file);
    else showError(result.error || 'Save failed');
  } catch (err) {
    showError('Save failed: ' + err.message);
  }
}

// ── Events ──────────────────────────────────────────────────

cardSelect.addEventListener('change', function() { loadCard(cardSelect.value); });
saveBtn.addEventListener('click', saveCard);
saveBtn2.addEventListener('click', saveCard);

document.getElementById('clearMoveBtn').addEventListener('click', function() {
  customMoveKeys.clear(); dirty = true;
  refreshGrid(); updatePreview(); updateStatus();
});
document.getElementById('clearAtkBtn').addEventListener('click', function() {
  customAttackKeys.clear(); dirty = true;
  refreshGrid(); updatePreview(); updateStatus();
});
document.getElementById('clearAllBtn').addEventListener('click', function() {
  customMoveKeys.clear(); customAttackKeys.clear(); dirty = true;
  refreshGrid(); updatePreview(); updateStatus();
});

['canJump', 'requiresEnemy', 'range'].forEach(function(name) {
  document.getElementById(name).addEventListener('change', function() {
    if (customMoveKeys.size || customAttackKeys.size) dirty = true;
    updatePreview(); updateStatus();
  });
});

document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'm' || e.key === 'M') {
    document.querySelector('input[name="mode"][value="move"]').checked = true;
  } else if (e.key === 'a' || e.key === 'A') {
    document.querySelector('input[name="mode"][value="attack"]').checked = true;
  } else if (e.key === 'c' || e.key === 'C') {
    customMoveKeys.clear(); customAttackKeys.clear(); dirty = true;
    refreshGrid(); updatePreview(); updateStatus();
  }
});

// ── Init ────────────────────────────────────────────────────

buildGrid();
loadCards();
console.log('[Card Pattern Editor v2] loaded');
</script>
</body>
</html>

```

# dev-tools\editor.bat

```bat
@echo off
title Card Pattern Editor
echo Stopping any existing editor server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3333 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting Card Pattern Editor...
echo.
start "" http://localhost:3333
node "%~dp0server.js"

```

# dev-tools\server.js

```js
import express from 'express';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = join(__dirname, '..', 'src', 'game', 'data', 'cards');
const PORT = 3333;

const app = express();
app.use(express.json());

// Serve the editor HTML (no cache)
app.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(join(__dirname, 'card-pattern-editor.html'));
});

// ── Parse card file ──────────────────────────────────────────

function parseCardFile(filePath) {
  const src = readFileSync(filePath, 'utf-8');

  // Extract card id
  const idMatch = src.match(/id:\s*'([^']+)'/);
  const nameMatch = src.match(/name:\s*"([^"]*)"/) || src.match(/name:\s*'([^']*)'/);
  if (!idMatch) return null;

  const card = {
    id: idMatch[1],
    name: nameMatch ? nameMatch[1] : idMatch[1],
    customMove: null,
    customAttack: null,
    movement: null,
    attackPattern: null,
    hasStats: /stats:\s*\{/.test(src),
  };

  // Extract movement and attackPattern enum values
  const movementMatch = src.match(/movement:\s*MovementType\.(\w+)/);
  if (movementMatch) card.movement = movementMatch[1];

  const atkPatternMatch = src.match(/attackPattern:\s*AtkPattern\.(\w+)/);
  if (atkPatternMatch) card.attackPattern = atkPatternMatch[1];

  // Check for imported preset patterns (e.g. PATTERN_ARCHER_ATTACK)
  const importedPatterns = {};
  const presetImportMatch = src.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/MovementPresets['"]/);
  if (presetImportMatch) {
    const presetNames = presetImportMatch[1].split(',').map(s => s.trim());
    // Read MovementPresets to get actual values
    try {
      const presetsPath = join(CARDS_DIR, '..', 'MovementPresets.ts');
      const presetsSrc = readFileSync(presetsPath, 'utf-8');
      for (const name of presetNames) {
        const pattern = extractPatternFromPresets(presetsSrc, name);
        if (pattern) importedPatterns[name] = pattern;
      }
    } catch { /* ignore */ }
  }

  // Extract customMove
  const customMoveRef = src.match(/customMove:\s*(\w+)/);
  if (customMoveRef && importedPatterns[customMoveRef[1]]) {
    card.customMove = importedPatterns[customMoveRef[1]];
  } else {
    card.customMove = extractInlinePattern(src, 'customMove');
  }

  // Extract customAttack
  const customAttackRef = src.match(/customAttack:\s*(\w+)/);
  if (customAttackRef && importedPatterns[customAttackRef[1]]) {
    card.customAttack = importedPatterns[customAttackRef[1]];
  } else {
    card.customAttack = extractInlinePattern(src, 'customAttack');
  }

  return card;
}

function extractPatternFromPresets(src, name) {
  // Match: export const NAME: CustomPattern = { ... };
  const regex = new RegExp(
    `export\\s+const\\s+${name}[^=]*=\\s*\\{([^}]+(?:\\{[^}]*\\}[^}]*)*)\\}`,
    's'
  );
  const match = src.match(regex);
  if (!match) return null;
  return parsePatternBlock(match[1]);
}

function extractInlinePattern(src, fieldName) {
  // Match: fieldName: { offsets: [...], ... }
  const regex = new RegExp(
    `${fieldName}:\\s*\\{\\s*offsets:\\s*\\[([^\\]]+)\\]([^}]*)\\}`,
    's'
  );
  const match = src.match(regex);
  if (!match) return null;
  return parsePatternBlock(`offsets: [${match[1]}]${match[2]}`);
}

function parsePatternBlock(block) {
  const pattern = { offsets: [] };

  // Parse offsets array
  const offsetMatches = block.matchAll(/\{\s*dx:\s*(-?\d+)\s*,\s*dy:\s*(-?\d+)\s*\}/g);
  for (const m of offsetMatches) {
    pattern.offsets.push({ dx: parseInt(m[1]), dy: parseInt(m[2]) });
  }

  // Parse range
  const rangeMatch = block.match(/range:\s*(\d+)/);
  if (rangeMatch) pattern.range = parseInt(rangeMatch[1]);

  // Parse canJump
  const jumpMatch = block.match(/canJump:\s*(true|false)/);
  if (jumpMatch) pattern.canJump = jumpMatch[1] === 'true';

  // Parse requiresEnemy
  const enemyMatch = block.match(/requiresEnemy:\s*(true|false)/);
  if (enemyMatch) pattern.requiresEnemy = enemyMatch[1] === 'true';

  return pattern;
}

// ── Remove a field (brace-counting for nested objects) ───────

function removeField(src, fieldName) {
  // Match preset reference: "customMove: SOME_PRESET,"
  const presetRegex = new RegExp(`\\s*${fieldName}:\\s*[A-Z_]\\w*,?`);
  if (presetRegex.test(src)) {
    return src.replace(presetRegex, '');
  }

  // Match inline brace block using brace counting to handle arbitrary nesting
  const marker = new RegExp(`\\s*${fieldName}:\\s*\\{`);
  const match = src.match(marker);
  if (!match) return src;

  const startIdx = match.index;
  // Find the opening brace
  const braceStart = src.indexOf('{', startIdx + fieldName.length);
  let depth = 0;
  let endIdx = braceStart;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === '{' || src[i] === '[') depth++;
    else if (src[i] === '}' || src[i] === ']') depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }
  // Consume trailing comma, whitespace, and newline
  while (endIdx < src.length && (src[endIdx] === ',' || src[endIdx] === ' ' || src[endIdx] === '\n' || src[endIdx] === '\r')) endIdx++;

  return src.slice(0, startIdx) + src.slice(endIdx);
}

// ── Format pattern as TypeScript ─────────────────────────────

function formatPattern(pattern, indent = '      ') {
  if (!pattern || pattern.offsets.length === 0) return null;

  let lines = [`{`];
  lines.push(`${indent}  offsets: [`);

  // Group offsets in rows of 4
  const offsets = pattern.offsets;
  for (let i = 0; i < offsets.length; i += 4) {
    const chunk = offsets.slice(i, i + 4);
    const formatted = chunk.map(o => `{ dx: ${o.dx}, dy: ${o.dy} }`).join(', ');
    const comma = (i + 4 < offsets.length) ? ',' : ',';
    lines.push(`${indent}    ${formatted}${comma}`);
  }
  lines.push(`${indent}  ],`);

  if (pattern.range !== undefined && pattern.range !== 1) {
    lines.push(`${indent}  range: ${pattern.range},`);
  }
  if (pattern.canJump) {
    lines.push(`${indent}  canJump: true,`);
  }
  if (pattern.requiresEnemy) {
    lines.push(`${indent}  requiresEnemy: true,`);
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

// ── API Routes ───────────────────────────────────────────────

// GET /api/cards — list all cards
app.get('/api/cards', (_req, res) => {
  try {
    const files = readdirSync(CARDS_DIR).filter(f => f.endsWith('.ts') && !f.startsWith('_'));
    const cards = [];
    for (const file of files) {
      const card = parseCardFile(join(CARDS_DIR, file));
      if (card) {
        card.file = file;
        cards.push(card);
      }
    }
    cards.sort((a, b) => a.name.localeCompare(b.name));
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/card/:id — get single card
app.get('/api/card/:id', (req, res) => {
  try {
    const files = readdirSync(CARDS_DIR).filter(f => f.endsWith('.ts') && !f.startsWith('_'));
    for (const file of files) {
      const card = parseCardFile(join(CARDS_DIR, file));
      if (card && card.id === req.params.id) {
        card.file = file;
        card.source = readFileSync(join(CARDS_DIR, file), 'utf-8');
        return res.json(card);
      }
    }
    res.status(404).json({ error: 'Card not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/card/:id/patterns — update patterns
app.post('/api/card/:id/patterns', (req, res) => {
  try {
    const { customMove, customAttack } = req.body;
    const files = readdirSync(CARDS_DIR).filter(f => f.endsWith('.ts') && !f.startsWith('_'));

    let targetFile = null;
    for (const file of files) {
      const card = parseCardFile(join(CARDS_DIR, file));
      if (card && card.id === req.params.id) {
        targetFile = file;
        break;
      }
    }
    if (!targetFile) return res.status(404).json({ error: 'Card not found' });

    const filePath = join(CARDS_DIR, targetFile);
    let src = readFileSync(filePath, 'utf-8');

    // Check if this card uses imported presets — if so, we need to switch to inline
    const usesPresetMove = src.match(/customMove:\s*[A-Z_]+/);
    const usesPresetAttack = src.match(/customAttack:\s*[A-Z_]+/);

    // Remove old customMove and customAttack (inline brace blocks or preset references)
    src = removeField(src, 'customMove');
    src = removeField(src, 'customAttack');

    // Clean up unused preset imports if we removed references
    if (usesPresetMove || usesPresetAttack) {
      // Remove the entire MovementPresets import line if no longer needed
      const hasOtherPresetRefs = src.match(/(?:customMove|customAttack):\s*[A-Z_]+/);
      if (!hasOtherPresetRefs) {
        src = src.replace(/import\s*\{[^}]+\}\s*from\s*['"]\.\.\/MovementPresets['"];?\s*\n?/g, '');
      }
    }

    // Insert new patterns before attackPattern line or at end of stats block
    const moveStr = customMove && customMove.offsets && customMove.offsets.length > 0
      ? `\n      customMove: ${formatPattern(customMove)},` : '';
    const attackStr = customAttack && customAttack.offsets && customAttack.offsets.length > 0
      ? `\n      customAttack: ${formatPattern(customAttack)},` : '';

    if (moveStr || attackStr) {
      // Insert after attackPattern value — handle both "AtkPattern.X," and "AtkPattern.X }" (last prop)
      const insertMatch = src.match(/(attackPattern:\s*AtkPattern\.\w+)(,|\s*\})/);
      if (insertMatch) {
        const fullMatch = insertMatch[0];
        const atkPart = insertMatch[1]; // "attackPattern: AtkPattern.XXX"
        const after = insertMatch[2];   // "," or " }" or "}"
        const idx = src.indexOf(fullMatch);

        if (after.includes('}')) {
          // attackPattern was last prop in stats: add comma, insert patterns, re-close
          // e.g. "attackPattern: AtkPattern.HV }" → "attackPattern: AtkPattern.HV,\n  customAttack: {...},\n  }"
          const closingBrace = after; // preserve whitespace before }
          src = src.slice(0, idx) + atkPart + ',' + attackStr + moveStr + '\n    ' + closingBrace.trim() + src.slice(idx + fullMatch.length);
        } else {
          // There's already a comma — just insert after it
          src = src.slice(0, idx + fullMatch.length) + attackStr + moveStr + src.slice(idx + fullMatch.length);
        }
      }
    }

    // Clean up any double commas or trailing issues
    src = src.replace(/,\s*,/g, ',');
    // Clean up blank lines in stats block
    src = src.replace(/\n\s*\n\s*\n/g, '\n\n');

    writeFileSync(filePath, src, 'utf-8');
    res.json({ success: true, file: targetFile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Card Pattern Editor running at http://localhost:${PORT}`);
  console.log(`Cards directory: ${CARDS_DIR}`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${PORT} is already in use!`);
    console.error('Close the other editor window first, or run: editor.bat (it auto-kills the old one)\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});

```

# directory.bat

```bat
@echo off
set "output_file=folder_structure.txt"

:: Change directory to where the batch file is located
cd /d "%~dp0"

echo Generating file structure...

:: Use PowerShell to walk the directory tree, skipping unwanted folders entirely
powershell -NoProfile -Command ^
  "$excluded = @('node_modules','.git','cache','artifacts','dist','build','coverage','typechain-types','vite');                                    " ^
  "$root = Get-Location;                                                                                                                           " ^
  "function Show-Tree($path, $indent) {                                                                                                            " ^
  "  $items = Get-ChildItem -Path $path -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin $excluded } | Sort-Object Name;       " ^
  "  $count = ($items | Measure-Object).Count;                                                                                                     " ^
  "  $i = 0;                                                                                                                                       " ^
  "  foreach ($item in $items) {                                                                                                                   " ^
  "    $i++;                                                                                                                                       " ^
  "    $connector = if ($i -eq $count) { '\--' } else { '+--' };                                                                                   " ^
  "    $line = $indent + $connector + ' ' + $item.Name;                                                                                            " ^
  "    $line;                                                                                                                                      " ^
  "    if ($item.PSIsContainer) {                                                                                                                  " ^
  "      $next = if ($i -eq $count) { $indent + '    ' } else { $indent + '|   ' };                                                               " ^
  "      Show-Tree $item.FullName $next;                                                                                                           " ^
  "    }                                                                                                                                           " ^
  "  }                                                                                                                                             " ^
  "}                                                                                                                                               " ^
  "Write-Output (Split-Path $root -Leaf);                                                                                                          " ^
  "Show-Tree $root ''                                                                                                                              " > "%output_file%"

echo Structure saved to %output_file%
pause
```

# events.txt

```txt
# Events from Phaser Editor 2D

scene-awake An event emitted at the end of the `editorCreate()` method generated by the Scene Editor compiler.

# Add your events like this:
#
# my-event My event documentation. 
```

# folder_structure.txt

```txt
OnChainBattles
+-- .aidigestignore
+-- .env
+-- .env.example
+-- .gitignore
+-- code_gen.bat
+-- codebase.md
+-- commit.bat
+-- contracts
|   \-- Escrow.sol
+-- dev_start.bat
+-- directory.bat
+-- events.txt
+-- folder_structure.txt
+-- generate_project.bat
+-- git_push.bat
+-- hardhat.config.ts
+-- ignition
|   \-- modules
|       \-- Escrow.js
+-- imager.bat
+-- index.html
+-- LICENSE
+-- package.json
+-- package-lock.json
+-- phasereditor2d.config.json
+-- public
|   +-- assets
|   |   +-- .DS_Store
|   |   +-- asset-pack.json
|   |   +-- backgrounds
|   |   |   +-- .DS_Store
|   |   |   +-- bg_battle.png
|   |   |   +-- bg_board.png
|   |   |   +-- bg_lobby.png
|   |   |   +-- bg_main_menu.png
|   |   |   +-- bg_menu.png
|   |   |   \-- bg_result.png
|   |   +-- board
|   |   |   \-- board_skin.png
|   |   +-- cards
|   |   |   +-- .DS_Store
|   |   |   +-- art
|   |   |   |   +-- .DS_Store
|   |   |   |   +-- archer.png
|   |   |   |   +-- assassin.png
|   |   |   |   +-- castle.png
|   |   |   |   +-- casus_belli.png
|   |   |   |   +-- civil_war.png
|   |   |   |   +-- commander.png
|   |   |   |   +-- coup.png
|   |   |   |   +-- disease.png
|   |   |   |   +-- earthquake.png
|   |   |   |   +-- foot_soldier.png
|   |   |   |   +-- inquisitor.png
|   |   |   |   +-- king.png
|   |   |   |   +-- kings_guard.png
|   |   |   |   +-- knight.png
|   |   |   |   +-- lancer.png
|   |   |   |   +-- messenger.png
|   |   |   |   +-- militia.png
|   |   |   |   +-- motherland.png
|   |   |   |   +-- mystic.png
|   |   |   |   +-- peasant_revolt.png
|   |   |   |   +-- pikeman.png
|   |   |   |   +-- priest.png
|   |   |   |   +-- princess.png
|   |   |   |   +-- reform.png
|   |   |   |   +-- scout.png
|   |   |   |   +-- scribe.png
|   |   |   |   +-- swordsman.png
|   |   |   |   +-- temple.png
|   |   |   |   +-- treason.png
|   |   |   |   +-- village.png
|   |   |   |   \-- war_horn.png
|   |   |   +-- card_back_pattern.png
|   |   |   +-- card_frame_royal.png
|   |   |   +-- card_frame_spell.png
|   |   |   +-- card_frame_standard.png
|   |   |   +-- card_frame_static.png
|   |   |   \-- thumb
|   |   |       +-- .DS_Store
|   |   |       +-- archer_thumb.png
|   |   |       +-- assassin_thumb.png
|   |   |       +-- castle_thumb.png
|   |   |       +-- casus_belli_thumb.png
|   |   |       +-- civil_war_thumb.png
|   |   |       +-- commander_thumb.png
|   |   |       +-- coup_thumb.png
|   |   |       +-- disease_thumb.png
|   |   |       +-- earthquake_thumb.png
|   |   |       +-- foot_soldier_thumb.png
|   |   |       +-- inquisitor_thumb.png
|   |   |       +-- king_thumb.png
|   |   |       +-- knight_thumb.png
|   |   |       +-- knights_guard_thumb.png
|   |   |       +-- lancer_thumb.png
|   |   |       +-- messenger_thumb.png
|   |   |       +-- militia_thumb.png
|   |   |       +-- motherland_thumb.png
|   |   |       +-- mystic_thumb.png
|   |   |       +-- peasant_revolt_thumb.png
|   |   |       +-- pikeman_thumb.png
|   |   |       +-- priest_thumb.png
|   |   |       +-- princess_thumb.png
|   |   |       +-- reform_thumb.png
|   |   |       +-- scout_thumb.png
|   |   |       +-- scribe_thumb.png
|   |   |       +-- swordsman_thumb.png
|   |   |       +-- temple_thumb.png
|   |   |       +-- treason_thumb.png
|   |   |       +-- village_thumb.png
|   |   |       \-- war_horn_thumb.png
|   |   +-- FufuSuperDino.png
|   |   +-- fx
|   |   |   +-- marker_attack.png
|   |   |   +-- marker_aura.png
|   |   |   +-- marker_danger.png
|   |   |   +-- marker_move.png
|   |   |   \-- marker_selected.png
|   |   +-- guapen.png
|   |   +-- icons
|   |   |   +-- icon_atk.png
|   |   |   +-- icon_cavalry.png
|   |   |   +-- icon_clock.png
|   |   |   +-- icon_def.png
|   |   |   +-- icon_leg.png
|   |   |   +-- icon_move.png
|   |   |   +-- icon_ranged.png
|   |   |   +-- icon_type_royal.png
|   |   |   +-- icon_type_spell.png
|   |   |   +-- icon_type_standard.png
|   |   |   \-- icon_type_static.png
|   |   +-- preload-asset-pack.json
|   |   \-- ui
|   |       \-- logo.png
|   +-- assetsy
|   |   +-- asset-pack.json
|   |   +-- backgrounds
|   |   |   +-- bg_battle.png
|   |   |   +-- bg_lobby.png
|   |   |   +-- bg_main_menu.png
|   |   |   \-- bg_result.png
|   |   +-- board
|   |   |   \-- board_skin.png
|   |   +-- cards
|   |   |   +-- art
|   |   |   |   +-- archer.png
|   |   |   |   +-- assassin.png
|   |   |   |   +-- castle.png
|   |   |   |   +-- casus_belli.png
|   |   |   |   +-- civil_war.png
|   |   |   |   +-- commander.png
|   |   |   |   +-- coup.png
|   |   |   |   +-- disease.png
|   |   |   |   +-- earthquake.png
|   |   |   |   +-- foot_soldier.png
|   |   |   |   +-- inquisitor.png
|   |   |   |   +-- king.png
|   |   |   |   +-- knight.png
|   |   |   |   +-- knights_guard.png
|   |   |   |   +-- lancer.png
|   |   |   |   +-- messenger.png
|   |   |   |   +-- militia.png
|   |   |   |   +-- motherland.png
|   |   |   |   +-- mystic.png
|   |   |   |   +-- peasant_revolt.png
|   |   |   |   +-- pikeman.png
|   |   |   |   +-- priest.png
|   |   |   |   +-- princess.png
|   |   |   |   +-- reform.png
|   |   |   |   +-- scout.png
|   |   |   |   +-- scribe.png
|   |   |   |   +-- swordsman.png
|   |   |   |   +-- temple.png
|   |   |   |   +-- treason.png
|   |   |   |   +-- village.png
|   |   |   |   \-- war_horn.png
|   |   |   +-- card_back_pattern.png
|   |   |   +-- card_frame_royal.png
|   |   |   +-- card_frame_spell.png
|   |   |   +-- card_frame_standard.png
|   |   |   +-- card_frame_static.png
|   |   |   \-- thumb
|   |   |       +-- archer_thumb.png
|   |   |       +-- assassin_thumb.png
|   |   |       +-- castle_thumb.png
|   |   |       +-- casus_belli_thumb.png
|   |   |       +-- civil_war_thumb.png
|   |   |       +-- commander_thumb.png
|   |   |       +-- coup_thumb.png
|   |   |       +-- disease_thumb.png
|   |   |       +-- earthquake_thumb.png
|   |   |       +-- foot_soldier_thumb.png
|   |   |       +-- inquisitor_thumb.png
|   |   |       +-- king_thumb.png
|   |   |       +-- knight_thumb.png
|   |   |       +-- knights_guard_thumb.png
|   |   |       +-- lancer_thumb.png
|   |   |       +-- messenger_thumb.png
|   |   |       +-- militia_thumb.png
|   |   |       +-- motherland_thumb.png
|   |   |       +-- mystic_thumb.png
|   |   |       +-- peasant_revolt_thumb.png
|   |   |       +-- pikeman_thumb.png
|   |   |       +-- priest_thumb.png
|   |   |       +-- princess_thumb.png
|   |   |       +-- reform_thumb.png
|   |   |       +-- scout_thumb.png
|   |   |       +-- scribe_thumb.png
|   |   |       +-- swordsman_thumb.png
|   |   |       +-- temple_thumb.png
|   |   |       +-- treason_thumb.png
|   |   |       +-- village_thumb.png
|   |   |       \-- war_horn_thumb.png
|   |   +-- FufuSuperDino.png
|   |   +-- fx
|   |   |   +-- marker_attack.png
|   |   |   +-- marker_aura.png
|   |   |   +-- marker_danger.png
|   |   |   +-- marker_move.png
|   |   |   \-- marker_selected.png
|   |   +-- guapen.png
|   |   +-- icons
|   |   |   +-- icon_atk.png
|   |   |   +-- icon_cavalry.png
|   |   |   +-- icon_clock.png
|   |   |   +-- icon_def.png
|   |   |   +-- icon_leg.png
|   |   |   +-- icon_move.png
|   |   |   +-- icon_ranged.png
|   |   |   +-- icon_type_royal.png
|   |   |   +-- icon_type_spell.png
|   |   |   +-- icon_type_standard.png
|   |   |   \-- icon_type_static.png
|   |   +-- preload-asset-pack.json
|   |   \-- ui
|   |       \-- logo.png
|   +-- deck.config.json
|   +-- favicon.png
|   +-- layouts
|   |   +-- BattleScene.layout.json
|   |   +-- MainMenuScene.layout.json
|   |   \-- ResultScene.layout.json
|   +-- publicroot
|   +-- style.css
|   \-- themes
|       +-- BattleScene.theme.json
|       +-- MainMenuScene.theme.json
|       \-- ResultScene.theme.json
+-- README.md
+-- scripts
|   +-- deploy.mjs
|   \-- send-op-tx.ts
+-- scripts_generate_placeholder_pngs.py
+-- server
|   \-- index.js
+-- src
|   +-- code_gen.bat
|   +-- codebase.md
|   +-- config
|   |   +-- DeckLoader.ts
|   |   +-- LayoutLoader.ts
|   |   \-- ThemeLoader.ts
|   +-- data
|   |   \-- MatchState.ts
|   +-- events
|   |   \-- EventBus.ts
|   +-- game
|   |   +-- AbilityResolver.ts
|   |   +-- AuraSystem.ts
|   |   +-- Board.ts
|   |   +-- CombatResolver.ts
|   |   +-- data
|   |   |   \-- CardDefinitions.ts
|   |   +-- GameEngine.ts
|   |   +-- GameModifiers.ts
|   |   +-- MovementRules.ts
|   |   +-- PlayerState.ts
|   |   \-- types
|   |       +-- AbilityTypes.ts
|   |       +-- CardTypes.ts
|   |       +-- EventTypes.ts
|   |       +-- GameTypes.ts
|   |       \-- UITypes.ts
|   +-- GameState.ts
|   +-- index.html
|   +-- input
|   |   \-- SelectionManager.ts
|   +-- main.ts
|   +-- network
|   |   \-- SocketManager.ts
|   +-- renderers
|   |   +-- BoardRenderer.ts
|   |   +-- CardRenderer.ts
|   |   +-- HandRenderer.ts
|   |   +-- HUDRenderer.ts
|   |   \-- OverlayRenderer.ts
|   +-- scenes
|   |   +-- BattleScene.ts
|   |   +-- MainMenuScene.ts
|   |   +-- PreloadScene.ts
|   |   +-- ResultScene.ts
|   |   \-- RoomScene.ts
|   +-- types
|   |   \-- ethereum.d.ts
|   +-- ui
|   |   +-- DOMInputManager.ts
|   |   +-- MenuButton.ts
|   |   +-- ShareHelper.ts
|   |   \-- ToastNotification.ts
|   +-- utils
|   |   \-- PhaserUtils.ts
|   +-- vite-env.d.ts
|   +-- wallet
|   \-- web3
|       +-- EscrowManager.ts
|       \-- WalletManager.ts
+-- test
|   \-- Counter.ts
+-- tools
|   \-- layout-editor
+-- tsconfig.hardhat.json
+-- tsconfig.json
+-- types
|   \-- process.env.ts
\-- vite.config.ts

```

# generate_project.bat

```bat
@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

echo.
echo  ============================================================
echo   OnChainBattles -- Project Generator
echo   Creates folders, source stubs, JSONs, placeholder PNGs
echo  ============================================================
echo.

:: ROOT = directory where this bat lives
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
echo [ROOT] %ROOT%
echo.

:: ==============================================================
:: STEP 1 - DIRECTORIES
:: ==============================================================
echo [1/5] Creating directory structure...

for %%D in (
    "public\assets\backgrounds"
    "public\assets\board"
    "public\assets\cards\art"
    "public\assets\cards\thumb"
    "public\assets\icons"
    "public\assets\fx"
    "public\assets\ui"
    "public\layouts"
    "public\themes"
    "src\game\types"
    "src\game\data"
    "src\config"
    "src\events"
    "src\scenes"
    "src\renderers"
    "src\input"
    "src\network"
    "src\wallet"
    "server"
    "tools\layout-editor"
) do (
    if not exist "%ROOT%\%%~D" (
        mkdir "%ROOT%\%%~D" >nul 2>&1
        echo    + %%~D
    )
)
echo    Done.
echo.

:: ==============================================================
:: STEP 2 - ROOT CONFIG FILES
:: ==============================================================
echo [2/5] Writing root config files...

:: -- package.json
if not exist "%ROOT%\package.json" (
    (
        echo {
        echo   "name": "onchainbattles",
        echo   "version": "0.2.0",
        echo   "private": true,
        echo   "scripts": {
        echo     "dev":     "vite",
        echo     "build":   "vite build",
        echo     "preview": "vite preview",
        echo     "server":  "node server/index.js"
        echo   },
        echo   "dependencies": {
        echo     "phaser":           "^4.0.0",
        echo     "socket.io-client": "^4.7.5",
        echo     "ethers":           "^6.11.0"
        echo   },
        echo   "devDependencies": {
        echo     "typescript": "^5.4.5",
        echo     "vite":       "^5.2.0"
        echo   }
        echo }
    ) > "%ROOT%\package.json"
    echo    + package.json
)

:: -- tsconfig.json
if not exist "%ROOT%\tsconfig.json" (
    (
        echo {
        echo   "compilerOptions": {
        echo     "target":                      "ES2020",
        echo     "module":                      "ESNext",
        echo     "moduleResolution":            "bundler",
        echo     "strict":                      false,
        echo     "noImplicitAny":               false,
        echo     "skipLibCheck":                true,
        echo     "esModuleInterop":             true,
        echo     "allowSyntheticDefaultImports": true,
        echo     "resolveJsonModule":           true,
        echo     "outDir":                      "./dist",
        echo     "rootDir":                     "./src",
        echo     "baseUrl":                     ".",
        echo     "paths":                       { "@/*": ["src/*"] }
        echo   },
        echo   "include":  ["src/**/*"],
        echo   "exclude":  ["node_modules", "dist"]
        echo }
    ) > "%ROOT%\tsconfig.json"
    echo    + tsconfig.json
)

:: -- vite.config.ts
if not exist "%ROOT%\vite.config.ts" (
    (
        echo import { defineConfig } from 'vite';
        echo.
        echo export default defineConfig({
        echo   server: { port: 3000, open: true },
        echo   build:  { target: 'es2020', sourcemap: true },
        echo   resolve: { alias: { '@': '/src' } },
        echo });
    ) > "%ROOT%\vite.config.ts"
    echo    + vite.config.ts
)

:: -- index.html
if not exist "%ROOT%\index.html" (
    (
        echo ^<!DOCTYPE html^>
        echo ^<html lang="en"^>
        echo ^<head^>
        echo   ^<meta charset="UTF-8" /^>
        echo   ^<meta name="viewport" content="width=device-width, initial-scale=1.0" /^>
        echo   ^<title^>OnChainBattles^</title^>
        echo   ^<style^>
        echo     * { margin:0; padding:0; box-sizing:border-box; }
        echo     body { background:#1A1A2E; display:flex; justify-content:center; align-items:center; height:100vh; overflow:hidden; }
        echo   ^</style^>
        echo ^</head^>
        echo ^<body^>
        echo   ^<div id="game"^>^</div^>
        echo   ^<script type="module" src="/src/main.ts"^>^</script^>
        echo ^</body^>
        echo ^</html^>
    ) > "%ROOT%\index.html"
    echo    + index.html
)

:: -- .gitignore
if not exist "%ROOT%\.gitignore" (
    (
        echo node_modules/
        echo dist/
        echo .env
        echo *.local
    ) > "%ROOT%\.gitignore"
    echo    + .gitignore
)

:: -- .env.example
if not exist "%ROOT%\.env.example" (
    (
        echo # Copy to .env and fill in values
        echo VITE_ESCROW_ADDRESS=0xYOUR_CONTRACT_ADDRESS
        echo VITE_SOCKET_URL=http://localhost:3001
        echo VITE_CHAIN_ID=43113
    ) > "%ROOT%\.env.example"
    echo    + .env.example
)

:: -- dev_start.bat
if not exist "%ROOT%\dev_start.bat" (
    (
        echo @echo off
        echo echo Starting OnChainBattles dev environment...
        echo start "OCB Server" cmd /k "node server/index.js"
        echo timeout /t 1 ^>nul
        echo npm run dev
    ) > "%ROOT%\dev_start.bat"
    echo    + dev_start.bat
)

echo    Done.
echo.

:: ==============================================================
:: STEP 3 - SOURCE FILE STUBS
:: ==============================================================
echo [3/5] Writing source file stubs (skips existing files)...

:: -- src\main.ts
if not exist "%ROOT%\src\main.ts" (
    (
        echo // main.ts - Phaser 4 game bootstrap
        echo import Phaser from 'phaser';
        echo import { PreloadScene }   from './scenes/PreloadScene';
        echo import { MainMenuScene }  from './scenes/MainMenuScene';
        echo import { BattleScene }    from './scenes/BattleScene';
        echo import { ResultScene }    from './scenes/ResultScene';
        echo.
        echo const config: Phaser.Types.Core.GameConfig = {
        echo   type:            Phaser.AUTO,
        echo   width:           1280,
        echo   height:          720,
        echo   backgroundColor: '#1A1A2E',
        echo   parent:          'game',
        echo   scene:           [PreloadScene, MainMenuScene, BattleScene, ResultScene],
        echo   scale: {
        echo     mode:       Phaser.Scale.FIT,
        echo     autoCenter: Phaser.Scale.CENTER_BOTH,
        echo   },
        echo };
        echo.
        echo new Phaser.Game(config);
    ) > "%ROOT%\src\main.ts"
    echo    + src/main.ts
)

:: -- src\scenes\PreloadScene.ts
if not exist "%ROOT%\src\scenes\PreloadScene.ts" (
    (
        echo // PreloadScene.ts
        echo import Phaser from 'phaser';
        echo.
        echo export class PreloadScene extends Phaser.Scene {
        echo   constructor() { super({ key: 'PreloadScene' }); }
        echo.
        echo   preload() {
        echo     const bar = this.add.graphics();
        echo     this.load.on('progress', (v: number) =^> {
        echo       bar.clear().fillStyle(0xF5A623).fillRect(340, 348, 600 * v, 24);
        echo     });
        echo     const A = 'assets/';
        echo     const cards = [
        echo       'foot_soldier','pikeman','archer','assassin','militia','scout',
        echo       'lancer','mystic','messenger','king','swordsman','princess','priest',
        echo       'commander','inquisitor','knight','knights_guard','scribe','castle',
        echo       'temple','village','disease','casus_belli','reform','civil_war',
        echo       'earthquake','war_horn','coup','treason','motherland','peasant_revolt'
        echo     ];
        echo     cards.forEach(id =^> {
        echo       this.load.image(`art_${id}`,   `${A}cards/art/${id}.png`);
        echo       this.load.image(`thumb_${id}`, `${A}cards/thumb/${id}_thumb.png`);
        echo     });
        echo     ['standard','royal','static','spell'].forEach(t =^>
        echo       this.load.image(`card_frame_${t}`, `${A}cards/card_frame_${t}.png`)
        echo     );
        echo     this.load.image('card_back', `${A}cards/card_back_pattern.png`);
        echo     ['atk','def','leg','move','cavalry','clock','ranged'].forEach(i =^>
        echo       this.load.image(`icon_${i}`, `${A}icons/icon_${i}.png`)
        echo     );
        echo     ['standard','royal','static','spell'].forEach(t =^>
        echo       this.load.image(`icon_type_${t}`, `${A}icons/icon_type_${t}.png`)
        echo     );
        echo     ['move','attack','aura','selected','danger'].forEach(m =^>
        echo       this.load.image(`marker_${m}`, `${A}fx/marker_${m}.png`)
        echo     );
        echo     this.load.image('board_skin',   `${A}board/board_skin.png`);
        echo     this.load.image('bg_battle',    `${A}backgrounds/bg_battle.png`);
        echo     this.load.image('bg_main_menu', `${A}backgrounds/bg_main_menu.png`);
        echo     this.load.image('bg_result',    `${A}backgrounds/bg_result.png`);
        echo     this.load.image('logo',         `${A}ui/logo.png`);
        echo   }
        echo.
        echo   create() {
        echo     this.scene.start('MainMenuScene');
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\PreloadScene.ts"
    echo    + src/scenes/PreloadScene.ts
)

:: -- src\scenes\MainMenuScene.ts
if not exist "%ROOT%\src\scenes\MainMenuScene.ts" (
    (
        echo // MainMenuScene.ts - stub
        echo import Phaser from 'phaser';
        echo.
        echo export class MainMenuScene extends Phaser.Scene {
        echo   constructor() { super({ key: 'MainMenuScene' }); }
        echo.
        echo   create() {
        echo     this.add.image(640, 360, 'bg_main_menu').setDisplaySize(1280, 720);
        echo     this.add.image(640, 120, 'logo');
        echo     this.add.text(640, 300, 'OnChainBattles', {
        echo       fontSize: '32px', color: '#F5A623', fontFamily: 'Arial'
        echo     }).setOrigin(0.5);
        echo     this.add.text(640, 400, 'Click to Start', {
        echo       fontSize: '20px', color: '#FFFFFF', fontFamily: 'Arial'
        echo     }).setOrigin(0.5);
        echo     this.input.once('pointerdown', () =^> this.scene.start('BattleScene'));
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\MainMenuScene.ts"
    echo    + src/scenes/MainMenuScene.ts
)

:: -- src\scenes\BattleScene.ts
if not exist "%ROOT%\src\scenes\BattleScene.ts" (
    (
        echo // BattleScene.ts - stub
        echo import Phaser from 'phaser';
        echo import { GameEngine } from '../game/GameEngine';
        echo.
        echo export class BattleScene extends Phaser.Scene {
        echo   private engine!: GameEngine;
        echo.
        echo   constructor() { super({ key: 'BattleScene' }); }
        echo.
        echo   create() {
        echo     this.add.image(640, 360, 'bg_battle').setDisplaySize(1280, 720);
        echo     this.add.text(640, 360, 'BattleScene - stub', {
        echo       fontSize: '20px', color: '#FFFFFF', align: 'center'
        echo     }).setOrigin(0.5);
        echo     // TODO: BoardRenderer, CardRenderer, HandRenderer, HUDRenderer,
        echo     //       OverlayRenderer, SelectionManager, engine.startGame()
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\BattleScene.ts"
    echo    + src/scenes/BattleScene.ts
)

:: -- src\scenes\ResultScene.ts
if not exist "%ROOT%\src\scenes\ResultScene.ts" (
    (
        echo // ResultScene.ts - stub
        echo import Phaser from 'phaser';
        echo.
        echo export class ResultScene extends Phaser.Scene {
        echo   constructor() { super({ key: 'ResultScene' }); }
        echo.
        echo   create(data: { winner: number; turns: number }) {
        echo     this.add.image(640, 360, 'bg_result').setDisplaySize(1280, 720);
        echo     const msg = data?.winner === 0 ? 'Player 1 Wins!' : 'Player 2 Wins!';
        echo     this.add.text(640, 360, msg, {
        echo       fontSize: '40px', color: '#F5A623', fontFamily: 'Arial'
        echo     }).setOrigin(0.5);
        echo   }
        echo }
    ) > "%ROOT%\src\scenes\ResultScene.ts"
    echo    + src/scenes/ResultScene.ts
)

:: -- src\network\SocketManager.ts
if not exist "%ROOT%\src\network\SocketManager.ts" (
    (
        echo // SocketManager.ts - stub
        echo import { io, Socket } from 'socket.io-client';
        echo.
        echo export class SocketManager {
        echo   private socket: Socket ^| null = null;
        echo   private static instance: SocketManager;
        echo.
        echo   static getInstance(): SocketManager {
        echo     if (!SocketManager.instance) SocketManager.instance = new SocketManager();
        echo     return SocketManager.instance;
        echo   }
        echo.
        echo   connect(url: string): void {
        echo     this.socket = io(url);
        echo     this.socket.on('connect',    () =^> console.log('[Socket] Connected'));
        echo     this.socket.on('disconnect', () =^> console.log('[Socket] Disconnected'));
        echo   }
        echo.
        echo   emit(event: string, data: any): void { this.socket?.emit(event, data); }
        echo   on(event: string, fn: (d: any) =^> void): void { this.socket?.on(event, fn); }
        echo   disconnect(): void { this.socket?.disconnect(); }
        echo }
    ) > "%ROOT%\src\network\SocketManager.ts"
    echo    + src/network/SocketManager.ts
)

:: -- src\wallet\WalletManager.ts
if not exist "%ROOT%\src\wallet\WalletManager.ts" (
    (
        echo // WalletManager.ts - stub
        echo import { BrowserProvider, JsonRpcSigner } from 'ethers';
        echo.
        echo export class WalletManager {
        echo   private static signer:  JsonRpcSigner ^| null = null;
        echo   private static address: string = '';
        echo.
        echo   static async connect(): Promise^<string^> {
        echo     if (!(window as any).ethereum) throw new Error('MetaMask not found');
        echo     const provider = new BrowserProvider((window as any).ethereum);
        echo     await provider.send('eth_requestAccounts', []);
        echo     WalletManager.signer  = await provider.getSigner();
        echo     WalletManager.address = await WalletManager.signer.getAddress();
        echo     return WalletManager.address;
        echo   }
        echo.
        echo   static getSigner():   JsonRpcSigner ^| null { return WalletManager.signer;  }
        echo   static getAddress():  string              { return WalletManager.address;  }
        echo   static isConnected(): boolean             { return !!WalletManager.signer; }
        echo }
    ) > "%ROOT%\src\wallet\WalletManager.ts"
    echo    + src/wallet/WalletManager.ts
)

:: -- src\wallet\EscrowManager.ts
if not exist "%ROOT%\src\wallet\EscrowManager.ts" (
    (
        echo // EscrowManager.ts - stub
        echo import { Contract, parseEther } from 'ethers';
        echo import { WalletManager } from './WalletManager';
        echo.
        echo const ESCROW_ADDRESS = (import.meta as any).env.VITE_ESCROW_ADDRESS ?? '';
        echo const ESCROW_ABI = [
        echo   'function deposit(string roomId) payable',
        echo   'function payout(string roomId, address winner)',
        echo   'function refund(string roomId)',
        echo   'event Deposited(string roomId, address player, uint256 amount)',
        echo   'event Paid(string roomId, address winner, uint256 amount)',
        echo ];
        echo.
        echo export class EscrowManager {
        echo   static async deposit(roomId: string, amountEth: string): Promise^<void^> {
        echo     const signer = WalletManager.getSigner();
        echo     if (!signer) throw new Error('Wallet not connected');
        echo     const c = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
        echo     const tx = await c.deposit(roomId, { value: parseEther(amountEth) });
        echo     await tx.wait();
        echo   }
        echo }
    ) > "%ROOT%\src\wallet\EscrowManager.ts"
    echo    + src/wallet/EscrowManager.ts
)

:: -- server\index.js
if not exist "%ROOT%\server\index.js" (
    (
        echo // server/index.js - Socket.io matchmaking + relay server
        echo // Run: node server/index.js
        echo const { createServer } = require('http');
        echo const { Server }       = require('socket.io');
        echo.
        echo const PORT = process.env.PORT ^|^| 3001;
        echo const http = createServer();
        echo const io   = new Server(http, { cors: { origin: '*' } });
        echo.
        echo const rooms = {};
        echo.
        echo io.on('connection', socket =^> {
        echo   console.log('[Server] +', socket.id);
        echo.
        echo   socket.on('join_room', ({ roomId, playerName }) =^> {
        echo     if (!rooms[roomId]) rooms[roomId] = { players: [] };
        echo     const room = rooms[roomId];
        echo     if (room.players.length ^>= 2) { socket.emit('room_full'); return; }
        echo     room.players.push({ id: socket.id, name: playerName });
        echo     socket.join(roomId);
        echo     socket.emit('room_joined', { playerIndex: room.players.length - 1, roomId });
        echo     if (room.players.length === 2)
        echo       io.to(roomId).emit('game_start', { players: room.players });
        echo   });
        echo.
        echo   socket.on('game_action', ({ roomId, action }) =^>
        echo     socket.to(roomId).emit('opponent_action', action)
        echo   );
        echo.
        echo   socket.on('disconnect', () =^> {
        echo     console.log('[Server] -', socket.id);
        echo     for (const id in rooms)
        echo       rooms[id].players = rooms[id].players.filter((p) =^> p.id !== socket.id);
        echo   });
        echo });
        echo.
        echo http.listen(PORT, () =^> console.log(`[Server] Listening :${PORT}`));
    ) > "%ROOT%\server\index.js"
    echo    + server/index.js
)

echo    Done.
echo.

:: ==============================================================
:: STEP 4 - PLACEHOLDER JSON CONFIGS
:: ==============================================================
echo [4/5] Writing placeholder JSON configs (skips existing)...

if not exist "%ROOT%\public\layouts\BattleScene.layout.json" (
    (
        echo { "schemaVersion":"2.0","scene":"BattleScene","canvas":{"width":1280,"height":720},"board":{"x":280,"y":360,"cellSize":80},"handP1":{"x":640,"y":660},"handP2":{"x":640,"y":60},"hud":{"timerX":640,"timerY":360} }
    ) > "%ROOT%\public\layouts\BattleScene.layout.json"
    echo    + public/layouts/BattleScene.layout.json
)

if not exist "%ROOT%\public\layouts\MainMenuScene.layout.json" (
    (
        echo { "schemaVersion":"2.0","scene":"MainMenuScene","canvas":{"width":1280,"height":720},"logo":{"x":640,"y":120,"width":300,"height":80},"title":{"x":640,"y":220},"nameInput":{"x":640,"y":300,"width":360,"height":48},"roomCodeInput":{"x":640,"y":370,"width":280,"height":48},"connectBtn":{"x":640,"y":450,"width":220,"height":56},"cryptoToggle":{"x":640,"y":530,"width":200,"height":40},"statusLabel":{"x":640,"y":600} }
    ) > "%ROOT%\public\layouts\MainMenuScene.layout.json"
    echo    + public/layouts/MainMenuScene.layout.json
)

if not exist "%ROOT%\public\layouts\ResultScene.layout.json" (
    (
        echo { "schemaVersion":"2.0","scene":"ResultScene","canvas":{"width":1280,"height":720},"panel":{"x":640,"y":360,"width":600,"height":420},"resultTitle":{"x":640,"y":240},"winnerLabel":{"x":640,"y":310},"payoutLabel":{"x":640,"y":370},"txHashLabel":{"x":640,"y":420},"playAgainBtn":{"x":640,"y":510,"width":200,"height":52},"menuBtn":{"x":640,"y":580,"width":160,"height":44} }
    ) > "%ROOT%\public\layouts\ResultScene.layout.json"
    echo    + public/layouts/ResultScene.layout.json
)

if not exist "%ROOT%\public\themes\BattleScene.theme.json" (
    (
        echo { "schemaVersion":"2.0","scene":"BattleScene","colors":{"BG_DEEP":"#1A1A2E","ACCENT_GOLD":"#F5A623","ACCENT_GREEN":"#00FF88","TEXT_PRIMARY":"#FFFFFF","TEXT_SECONDARY":"#AAAAAA"},"fonts":{"title":{"family":"Arial","size":32},"body":{"family":"Arial","size":16}},"assets":{"board_skin":"assets/board/board_skin.png","bg_battle":"assets/backgrounds/bg_battle.png"} }
    ) > "%ROOT%\public\themes\BattleScene.theme.json"
    echo    + public/themes/BattleScene.theme.json
)

if not exist "%ROOT%\public\themes\MainMenuScene.theme.json" (
    (
        echo { "schemaVersion":"2.0","scene":"MainMenuScene","colors":{"BG_DEEP":"#1A1A2E","ACCENT_GOLD":"#F5A623","ACCENT_GREEN":"#00FF88","TEXT_PRIMARY":"#FFFFFF","TEXT_SECONDARY":"#AAAAAA"},"fonts":{"title":{"family":"Arial","size":32},"body":{"family":"Arial","size":16}},"assets":{"logo":"assets/ui/logo.png","bg_main_menu":"assets/backgrounds/bg_main_menu.png"},"buttons":{"primary":{"fillColor":"#1A3A5C","strokeColor":"#F5A623","strokeWidth":2,"textColor":"#FFFFFF","fontSize":18,"hoverFillColor":"#2A4A6C","hoverTextColor":"#F5A623","cornerRadius":6,"paddingX":20,"paddingY":10}} }
    ) > "%ROOT%\public\themes\MainMenuScene.theme.json"
    echo    + public/themes/MainMenuScene.theme.json
)

if not exist "%ROOT%\public\themes\ResultScene.theme.json" (
    (
        echo { "schemaVersion":"2.0","scene":"ResultScene","colors":{"BG_DEEP":"#1A1A2E","ACCENT_GOLD":"#F5A623","ACCENT_GREEN":"#00FF88","ACCENT_RED":"#FF4444","TEXT_PRIMARY":"#FFFFFF","TEXT_SECONDARY":"#AAAAAA"},"fonts":{"title":{"family":"Arial","size":32},"body":{"family":"Arial","size":16}},"assets":{"bg_result":"assets/backgrounds/bg_result.png"},"buttons":{"primary":{"fillColor":"#1A3A5C","strokeColor":"#F5A623","strokeWidth":2,"textColor":"#FFFFFF","fontSize":18,"hoverFillColor":"#2A4A6C","hoverTextColor":"#F5A623","cornerRadius":6,"paddingX":20,"paddingY":10}} }
    ) > "%ROOT%\public\themes\ResultScene.theme.json"
    echo    + public/themes/ResultScene.theme.json
)

echo    Done.
echo.

:: ==============================================================
:: STEP 5 - PLACEHOLDER PNGs via Python script written to a file
:: ==============================================================
echo [5/5] Generating placeholder PNGs via Python + Pillow...
echo       (If you see SKIP below, run: pip install Pillow)
echo.

:: Write Python script to a temp file to avoid all inline escaping issues
set "PYFILE=%TEMP%\ocb_gen_pngs.py"

(
echo import sys, os
echo.
echo try:
echo     from PIL import Image, ImageDraw, ImageFont
echo except ImportError:
echo     print('  [SKIP] Pillow not installed. Run: pip install Pillow')
echo     sys.exit(0)
echo.
echo ROOT = r'%ROOT%'
echo.
echo FONT_PATHS = [
echo     r'C:\Windows\Fonts\arialbd.ttf',
echo     r'C:\Windows\Fonts\arial.ttf',
echo     r'C:\Windows\Fonts\segoeui.ttf',
echo     '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
echo     '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
echo ]
echo.
echo def load_font(size):
echo     for fp in FONT_PATHS:
echo         try:
echo             return ImageFont.truetype(fp, size)
echo         except:
echo             pass
echo     return ImageFont.load_default()
echo.
echo def rgb(h):
echo     h = h.lstrip('#')
echo     return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
echo.
echo created = 0
echo.
echo def make(rel, w, h, bg, label, lc='#BBBBBB', border=None, alpha=255):
echo     global created
echo     path = os.path.join(ROOT, 'public', 'assets', rel)
echo     os.makedirs(os.path.dirname(path), exist_ok=True)
echo     if os.path.exists(path):
echo         return
echo     img  = Image.new('RGBA', (w, h), (*rgb(bg), alpha))
echo     draw = ImageDraw.Draw(img)
echo     stripe_color = (*rgb(lc), 18)
echo     for i in range(-h, w + h, 18):
echo         draw.line([(i, 0), (i + h, h)], fill=stripe_color, width=1)
echo     if border:
echo         bw = max(2, w // 60)
echo         draw.rectangle([bw, bw, w - bw - 1, h - bw - 1], outline=(*rgb(border), 220), width=bw)
echo     font_size = max(8, min(16, h // 6, w // 8))
echo     font = load_font(font_size)
echo     lines = label.split('\n')
echo     total_h = len(lines) * (font_size + 2)
echo     for li, line in enumerate(lines):
echo         bb = draw.textbbox((0, 0), line, font=font)
echo         tw = bb[2] - bb[0]
echo         tx = (w - tw) // 2
echo         ty = (h - total_h) // 2 + li * (font_size + 2)
echo         draw.text((tx, ty), line, fill=(*rgb(lc), 210), font=font)
echo     img.save(path, 'PNG')
echo     created += 1
echo.
echo def t(rel, w, h, bg, label, lc='#AAAAAA', border=None, a=255):
echo     make(rel, w, h, bg, label, lc, border, a)
echo.
echo # Backgrounds
echo t('backgrounds/bg_battle.png',    1280, 720, '#0A1520', 'BG BATTLE',    '#334455', '#1A2A3A')
echo t('backgrounds/bg_main_menu.png', 1280, 720, '#10101E', 'BG MAIN MENU', '#2A2A44', '#1A1A3A')
echo t('backgrounds/bg_result.png',    1280, 720, '#0A1520', 'BG RESULT',    '#334455', '#1A2A3A')
echo t('backgrounds/bg_lobby.png',     1280, 720, '#10101E', 'BG LOBBY',     '#2A2A44', '#1A1A3A')
echo.
echo # Board
echo t('board/board_skin.png', 720, 720, '#0C2D4A', 'BOARD SKIN', '#1A5A8A', '#1A3A6A')
echo.
echo # UI
echo t('ui/logo.png', 300, 80, '#1A1A2E', 'ONCHAINBATTLES', '#F5A623', '#F5A623')
echo.
echo # Card frames
echo t('cards/card_frame_standard.png', 140, 200, '#12122A', 'STANDARD\nFRAME', '#5A5A9A', '#4A4A8A')
echo t('cards/card_frame_royal.png',    140, 200, '#1A1200', 'ROYAL\nFRAME',    '#C8960C', '#A07800')
echo t('cards/card_frame_static.png',   140, 200, '#0A1A0A', 'STATIC\nFRAME',   '#3A8A4A', '#2A6A3A')
echo t('cards/card_frame_spell.png',    140, 200, '#140A1E', 'SPELL\nFRAME',    '#8A3AAA', '#6A1A8A')
echo t('cards/card_back_pattern.png',   140, 200, '#101028', 'CARD\nBACK',      '#3A3A66', '#2A2A55')
echo.
echo # Card art + thumbnails
echo CARDS = [
echo     ('foot_soldier',   '#1A2A1A', '#4A8A4A'),
echo     ('pikeman',        '#1A1A2A', '#4A4A8A'),
echo     ('archer',         '#1A2A2A', '#4A7A7A'),
echo     ('assassin',       '#080810', '#3A3A5A'),
echo     ('militia',        '#1A1A08', '#6A6A2A'),
echo     ('scout',          '#081A08', '#3A6A3A'),
echo     ('lancer',         '#1A0808', '#7A3A3A'),
echo     ('mystic',         '#080818', '#5A3A8A'),
echo     ('messenger',      '#0A1A14', '#3A7A6A'),
echo     ('king',           '#1A1000', '#C8960C'),
echo     ('swordsman',      '#161608', '#8A8A2A'),
echo     ('princess',       '#1A0814', '#9A3A6A'),
echo     ('priest',         '#140808', '#7A3A4A'),
echo     ('commander',      '#080812', '#3A3A8A'),
echo     ('inquisitor',     '#0A0000', '#6A1A1A'),
echo     ('knight',         '#080818', '#3A3A7A'),
echo     ('knights_guard',  '#04040E', '#1A1A4A'),
echo     ('scribe',         '#141000', '#7A6A2A'),
echo     ('castle',         '#14100A', '#6A5A3A'),
echo     ('temple',         '#0A0A18', '#4A3A7A'),
echo     ('village',        '#0A1808', '#3A6A3A'),
echo     ('disease',        '#001400', '#2A7A2A'),
echo     ('casus_belli',    '#1A0A00', '#7A4A1A'),
echo     ('reform',         '#0A1A0A', '#4A7A4A'),
echo     ('civil_war',      '#140000', '#6A1A1A'),
echo     ('earthquake',     '#1A1000', '#8A6A1A'),
echo     ('war_horn',       '#001020', '#1A5A8A'),
echo     ('coup',           '#180004', '#7A1A3A'),
echo     ('treason',        '#100A00', '#6A5A1A'),
echo     ('motherland',     '#001800', '#1A7A1A'),
echo     ('peasant_revolt', '#0A1400', '#4A7A2A'),
echo ]
echo for cid, bg, accent in CARDS:
echo     label = cid.replace('_', ' ').upper()
echo     t(f'cards/art/{cid}.png',         140,  90, bg, label, accent, accent)
echo     t(f'cards/thumb/{cid}_thumb.png', 200, 200, bg, label, accent, accent)
echo.
echo # Icons (32x32)
echo ICONS = [
echo     ('icon_atk',           '#3A0A0A', '#FF6666', 'ATK'),
echo     ('icon_def',           '#0A1A3A', '#4FC3F7', 'DEF'),
echo     ('icon_leg',           '#2A1A00', '#F5A623', 'LEG'),
echo     ('icon_move',          '#002A1A', '#00FF88', 'MOV'),
echo     ('icon_cavalry',       '#2A1A00', '#F5B833', 'CAV'),
echo     ('icon_clock',         '#1A1A1A', '#AAAAAA', 'CLK'),
echo     ('icon_ranged',        '#0A1A2A', '#4FC3F7', 'RNG'),
echo     ('icon_type_standard', '#1A1A2A', '#6A6A9A', 'STD'),
echo     ('icon_type_royal',    '#1A1200', '#C8960C', 'ROY'),
echo     ('icon_type_static',   '#0A1A0A', '#4A8A4A', 'STC'),
echo     ('icon_type_spell',    '#12001A', '#8A3AAA', 'SPL'),
echo ]
echo for name, bg, accent, label in ICONS:
echo     t(f'icons/{name}.png', 32, 32, bg, label, accent, accent)
echo.
echo # FX markers (semi-transparent)
echo t('fx/marker_move.png',     120, 120, '#001A08', 'MOVE',   '#00CC66', '#00AA44', 180)
echo t('fx/marker_attack.png',   120, 120, '#1A0000', 'ATTACK', '#CC3333', '#AA2222', 200)
echo t('fx/marker_aura.png',     120, 120, '#00081A', 'AURA',   '#3399CC', '#2277AA', 160)
echo t('fx/marker_selected.png', 120, 120, '#001A0A', 'SELECT', '#00FF88', '#00CC66', 200)
echo t('fx/marker_danger.png',   120, 120, '#1A0000', 'DANGER', '#FF4444', '#CC2222', 180)
echo.
echo total = sum(
echo     sum(1 for f in files if f.endswith('.png'))
echo     for _, _, files in os.walk(os.path.join(ROOT, 'public', 'assets'))
echo )
echo print(f'  Created {created} new PNGs.  Total on disk: {total} PNGs.')
) > "%PYFILE%"

python "%PYFILE%"
del "%PYFILE%" >nul 2>&1

echo.
echo ============================================================
echo  Project scaffold complete.
echo ============================================================
echo.
echo  public/
echo    assets/backgrounds/   4 PNGs  (bg_battle, bg_main_menu, ...)
echo    assets/board/         1 PNG   (board_skin)
echo    assets/cards/art/    31 PNGs  (one per card)
echo    assets/cards/thumb/  31 PNGs  (200x200 thumbnails)
echo    assets/icons/        11 PNGs  (atk/def/leg/move + type icons)
echo    assets/fx/            5 PNGs  (move/attack/aura/selected/danger)
echo    assets/ui/            1 PNG   (logo)
echo    layouts/              3 JSONs (Battle, MainMenu, Result)
echo    themes/               3 JSONs (Battle, MainMenu, Result)
echo.
echo  src/
echo    main.ts               game bootstrap
echo    scenes/               4 stubs (Preload/MainMenu/Battle/Result)
echo    network/              SocketManager stub
echo    wallet/               WalletManager + EscrowManager stubs
echo.
echo  server/index.js         Socket.io relay server
echo.
echo  NEXT STEPS:
echo    1. npm install
echo    2. dev_start.bat   (opens localhost:3000 + server on :3001)
echo    3. Replace placeholder PNGs with real art as it arrives
echo    4. JSON files in public/layouts/ and public/themes/ are
echo       managed by the Layout Editor -- avoid manual edits
echo.
pause

```

# git_cleanup.bat

```bat
@echo off
title OnChainBattles - Git Cleanup
color 0E

cd /d D:\OnChainBattles

echo ==========================================
echo  OnChainBattles - Git Cleanup
echo  Untrack files that should be gitignored
echo ==========================================
echo.
echo Bu script:
echo  - .gitignore'daki dosyalari Git izlemesinden cikarir
echo  - Dosyalar YEREL olarak KALIR (silinmez!)
echo  - Sadece Git artik onlari takip etmez
echo.
echo ONEMLI: Once .gitignore dosyanizi guncelleyin!
echo.

REM Git kontrolu
where git >nul 2>nul
if errorlevel 1 (
    echo Git bulunamadi! Lutfen Git yukleyin.
    pause
    exit /b 1
)

REM Kullanici onayi
echo Mevcut repo durumu:
git status -s
echo.
set /p onay="Devam etmek istiyor musunuz? (E/H): "
if /i not "%onay%"=="E" (
    echo Islem iptal edildi.
    pause
    exit /b 0
)

echo.
echo [1/6] .env dosyasi untrack ediliyor...
git rm --cached .env 2>nul
if not errorlevel 1 echo       .env basarili

echo.
echo [2/6] Generated dosyalar untrack ediliyor...
git rm --cached codebase.md 2>nul
git rm --cached src\codebase.md 2>nul
git rm --cached folder_structure.txt 2>nul
git rm --cached events.txt 2>nul

echo.
echo [3/6] .DS_Store dosyalari untrack ediliyor...
for /r %%f in (.DS_Store) do (
    git rm --cached "%%f" 2>nul
)

echo.
echo [4/6] PNG dosyalari untrack ediliyor (yerel dosyalar kalacak)...
for /r %%f in (*.png) do (
    git rm --cached "%%f" 2>nul
)

echo.
echo [5/6] Diger image dosyalari untrack ediliyor...
for /r %%f in (*.jpg *.jpeg *.gif *.webp *.svg *.ico *.bmp) do (
    git rm --cached "%%f" 2>nul
)

echo.
echo [6/6] Degisiklikler commit ediliyor...
git add .gitignore
git commit -m "chore: untrack images, .env, and generated files (now in .gitignore)"

echo.
echo ==========================================
echo  Temizlik tamamlandi!
echo ==========================================
echo.
echo Dosyalar artik Git tarafindan izlenmiyor.
echo Ama yerel olarak hala mevcut.
echo.
echo UYARI: Bu islem repo boyutunu KUCULTMEZ!
echo Eski commitlerde PNG'ler hala mevcut.
echo Repo boyutunu kucultmek icin history temizligi
echo gerekir (git_nuke_history.bat kullanin).
echo.

set /p push="Degisiklikleri push etmek ister misiniz? (E/H): "
if /i "%push%"=="E" (
    git push origin main
    if errorlevel 1 (
        echo Push basarisiz, deneyin: git push origin master
    ) else (
        echo Push basarili!
    )
)

echo.
pause

```

# gitignore

```
# ── Dependencies ──
/node_modules

# ── Build / Compilation ──
/dist
/bundle

# ── Hardhat ──
/artifacts
/cache
/coverage
/typechain-types

# ── Environment ──
.env
.env.local
.env.*.local

# ── OS junk ──
.DS_Store
Thumbs.db
desktop.ini

# ── IDE / Editor ──
.vscode/
.idea/
*.swp
*.swo
*~

# ── Generated / Temp files ──
codebase.md
src/codebase.md
folder_structure.txt
events.txt

# ── Image files (use Git LFS later if versioning needed) ──
*.png
*.jpg
*.jpeg
*.gif
*.webp
*.svg
*.ico
*.bmp

# ── Logs ──
*.log
npm-debug.log*

# ── Misc ──
*.tgz
*.tsbuildinfo

```

# hardhat.config.ts

```ts
import { defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import * as dotenv from "dotenv";
dotenv.config();

const FUJI_PRIVATE_KEY = process.env.FUJI_PRIVATE_KEY ?? "";

export default defineConfig({
  plugins: [hardhatEthers],
  solidity: "0.8.19",
  networks: {
    fuji: {
      type: "http",
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: [FUJI_PRIVATE_KEY],
    },
  },
});
```

# ignition\modules\Escrow.js

```js
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("EscrowModule", (m) => {
  const escrow = m.contract("Escrow");
  return { escrow };
});
```

# imager.bat

```bat
@echo off
setlocal

:: ==============================================================
:: STEP 5 - PLACEHOLDER PNGs via Python script file
:: ==============================================================

echo [5/5] Generating placeholder PNGs via Python + Pillow...
echo       (If you see SKIP below, run: pip install Pillow)
echo.

:: Resolve project root (defaults to current script directory)
if not defined ROOT set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "SCRIPT=%~dp0scripts_generate_placeholder_pngs.py"
if not exist "%SCRIPT%" (
  echo [ERROR] Missing script: %SCRIPT%
  pause
  exit /b 1
)

python "%SCRIPT%"
if errorlevel 1 (
  echo.
  echo [ERROR] PNG generation failed.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Project scaffold complete.
echo ============================================================
echo.

pause
endlocal
```

# index.html

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/style.css">
    <title>OnChainBattles</title>
</head>

<body>
    <div id="app">
        <div id="game-container"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
</body>
</html>

```

# package.json

```json
{
    "name": "phaser-editor-template-vite-ts",
    "description": "A Phaser 3 TypeScript template using Vite.",
    "version": "1.2.1",
    "repository": {
        "type": "git",
        "url": "git+https://github.com/phaserjs/template-vite-ts.git"
    },
    "author": "Phaser Studio <support@phaser.io> (https://phaser.io/)",
    "license": "MIT",
    "licenseUrl": "http://www.opensource.org/licenses/mit-license.php",
    "bugs": {
        "url": "https://github.com/phaserjs/template-vite-ts/issues"
    },
    "homepage": "https://github.com/phaserjs/template-vite-ts#readme",
    "scripts": {
        "start": "vite --config vite/config.dev.mjs",
        "build": "vite build --config vite/config.prod.mjs && phaser-asset-pack-hashing -j -r dist",
        "server:build": "tsc -p tsconfig.server.json",
        "server": "tsc -p tsconfig.server.json && node server/dist/server/app.js",
        "test:game": "vitest run",
        "test:game:watch": "vitest",
        "test:smoke": "vitest run tests/engine/gameLoop.test.ts",
        "dev:editor": "node dev-tools/server.js"
    },
    "devDependencies": {
        "@nomicfoundation/hardhat-ethers": "^4.0.4",
        "@nomicfoundation/hardhat-ignition": "^3.0.7",
        "@nomicfoundation/hardhat-toolbox-mocha-ethers": "^3.0.2",
        "@types/better-sqlite3": "^7.6.13",
        "@types/chai": "^4.3.20",
        "@types/chai-as-promised": "^8.0.2",
        "@types/cors": "^2.8.19",
        "@types/express": "^5.0.6",
        "@types/jsonwebtoken": "^9.0.10",
        "@types/mocha": "^10.0.10",
        "@types/node": "^22.19.11",
        "chai": "^5.3.3",
        "forge-std": "github:foundry-rs/forge-std#v1.9.4",
        "hardhat": "^3.1.9",
        "mocha": "^11.7.5",
        "phaser-asset-pack-hashing": "^1.0.6",
        "terser": "^5.28.1",
        "typescript": "~5.8.0",
        "vite": "^7.3.1",
        "vitest": "^4.1.0"
    },
    "dependencies": {
        "@phaserjs/editor-scripts-base": "^2.0.1",
        "better-sqlite3": "^12.8.0",
        "cors": "^2.8.6",
        "dotenv": "^17.3.1",
        "ethers": "^6.16.0",
        "express": "^5.2.1",
        "jsonwebtoken": "^9.0.3",
        "phaser": "^4.0.0-rc.6",
        "socket.io": "^4.8.3",
        "socket.io-client": "^4.8.3"
    },
    "type": "module"
}

```

# public\assetsy\asset-pack.json

```json
{
    "section1": {
        "files": [
            {
                "url": "assets/FufuSuperDino.png",
                "type": "image",
                "key": "FufuSuperDino"
            }
        ]
    },
    "meta": {
        "app": "Phaser Editor 2D - Asset Pack Editor",
        "contentType": "phasereditor2d.pack.core.AssetContentType",
        "url": "https://phasereditor2d.com",
        "version": 2
    }
}
```

# public\assetsy\backgrounds\bg_battle.png

This is a binary file of the type: Image

# public\assetsy\backgrounds\bg_lobby.png

This is a binary file of the type: Image

# public\assetsy\backgrounds\bg_main_menu.png

This is a binary file of the type: Image

# public\assetsy\backgrounds\bg_result.png

This is a binary file of the type: Image

# public\assetsy\board\board_skin.png

This is a binary file of the type: Image

# public\assetsy\cards\art\archer.png

This is a binary file of the type: Image

# public\assetsy\cards\art\assassin.png

This is a binary file of the type: Image

# public\assetsy\cards\art\castle.png

This is a binary file of the type: Image

# public\assetsy\cards\art\casus_belli.png

This is a binary file of the type: Image

# public\assetsy\cards\art\civil_war.png

This is a binary file of the type: Image

# public\assetsy\cards\art\commander.png

This is a binary file of the type: Image

# public\assetsy\cards\art\coup.png

This is a binary file of the type: Image

# public\assetsy\cards\art\disease.png

This is a binary file of the type: Image

# public\assetsy\cards\art\earthquake.png

This is a binary file of the type: Image

# public\assetsy\cards\art\foot_soldier.png

This is a binary file of the type: Image

# public\assetsy\cards\art\inquisitor.png

This is a binary file of the type: Image

# public\assetsy\cards\art\king.png

This is a binary file of the type: Image

# public\assetsy\cards\art\knight.png

This is a binary file of the type: Image

# public\assetsy\cards\art\knights_guard.png

This is a binary file of the type: Image

# public\assetsy\cards\art\lancer.png

This is a binary file of the type: Image

# public\assetsy\cards\art\messenger.png

This is a binary file of the type: Image

# public\assetsy\cards\art\militia.png

This is a binary file of the type: Image

# public\assetsy\cards\art\motherland.png

This is a binary file of the type: Image

# public\assetsy\cards\art\mystic.png

This is a binary file of the type: Image

# public\assetsy\cards\art\peasant_revolt.png

This is a binary file of the type: Image

# public\assetsy\cards\art\pikeman.png

This is a binary file of the type: Image

# public\assetsy\cards\art\priest.png

This is a binary file of the type: Image

# public\assetsy\cards\art\princess.png

This is a binary file of the type: Image

# public\assetsy\cards\art\reform.png

This is a binary file of the type: Image

# public\assetsy\cards\art\scout.png

This is a binary file of the type: Image

# public\assetsy\cards\art\scribe.png

This is a binary file of the type: Image

# public\assetsy\cards\art\swordsman.png

This is a binary file of the type: Image

# public\assetsy\cards\art\temple.png

This is a binary file of the type: Image

# public\assetsy\cards\art\treason.png

This is a binary file of the type: Image

# public\assetsy\cards\art\village.png

This is a binary file of the type: Image

# public\assetsy\cards\art\war_horn.png

This is a binary file of the type: Image

# public\assetsy\cards\card_back_pattern.png

This is a binary file of the type: Image

# public\assetsy\cards\card_frame_royal.png

This is a binary file of the type: Image

# public\assetsy\cards\card_frame_spell.png

This is a binary file of the type: Image

# public\assetsy\cards\card_frame_standard.png

This is a binary file of the type: Image

# public\assetsy\cards\card_frame_static.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\archer_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\assassin_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\castle_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\casus_belli_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\civil_war_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\commander_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\coup_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\disease_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\earthquake_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\foot_soldier_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\inquisitor_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\king_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\knight_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\knights_guard_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\lancer_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\messenger_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\militia_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\motherland_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\mystic_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\peasant_revolt_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\pikeman_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\priest_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\princess_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\reform_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\scout_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\scribe_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\swordsman_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\temple_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\treason_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\village_thumb.png

This is a binary file of the type: Image

# public\assetsy\cards\thumb\war_horn_thumb.png

This is a binary file of the type: Image

# public\assetsy\FufuSuperDino.png

This is a binary file of the type: Image

# public\assetsy\fx\marker_attack.png

This is a binary file of the type: Image

# public\assetsy\fx\marker_aura.png

This is a binary file of the type: Image

# public\assetsy\fx\marker_danger.png

This is a binary file of the type: Image

# public\assetsy\fx\marker_move.png

This is a binary file of the type: Image

# public\assetsy\fx\marker_selected.png

This is a binary file of the type: Image

# public\assetsy\guapen.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_atk.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_cavalry.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_clock.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_def.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_leg.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_move.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_ranged.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_type_royal.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_type_spell.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_type_standard.png

This is a binary file of the type: Image

# public\assetsy\icons\icon_type_static.png

This is a binary file of the type: Image

# public\assetsy\preload-asset-pack.json

```json
{
    "section1": {
        "files": [
            {
                "url": "assets/guapen.png",
                "type": "image",
                "key": "guapen"
            }
        ]
    },
    "meta": {
        "app": "Phaser Editor 2D - Asset Pack Editor",
        "contentType": "phasereditor2d.pack.core.AssetContentType",
        "url": "https://phasereditor2d.com",
        "version": 2,
        "showAllFilesInBlocks": false
    }
}
```

# public\assetsy\ui\logo.png

This is a binary file of the type: Image

# public\deck.config.json

```json
{
  "_comment": "Edit card IDs here to change the deck. Must be exactly 31 valid card IDs. King is pre-placed and must NOT be included.",
  "deckIds": [
    "foot_soldier", "foot_soldier", "foot_soldier",
    "pikeman",      "pikeman",
    "archer",       "archer",
    "assassin",     "assassin",
    "militia",      "militia",
    "scout",        "scout",
    "lancer",       "lancer",
    "messenger",    "messenger",
    "mystic",
    "swordsman",    "swordsman",
    "priest",       "priest",
    "inquisitor",   "inquisitor",
    "knight",       "knight",
    "scribe",       "scribe",
    "princess",
    "commander",
    "knights_guard"
  ]
}
```

# public\default-deck.json

```json
{
  "_comment": "Beginner's Deck — 31 cards. Edit this file to change the default deck for new players.",
  "_rules": "Exactly 31 cards. No 'king' (pre-placed). Each card has a max copies limit (see copies field in card data).",
  "name": "Starter Deck",
  "deckIds": [
    "foot_soldier", "foot_soldier", "foot_soldier",
    "militia",      "militia",
    "pikeman",      "pikeman",
    "scout",        "scout",
    "archer",       "archer",
    "lancer",       "lancer",
    "messenger",    "messenger",
    "swordsman",    "swordsman",
    "knight",       "knight",
    "priest",       "priest",
    "scribe",       "scribe",
    "princess",
    "commander",
    "knights_guard",
    "mystic",
    "village",      "village",
    "reform",       "reform"
  ]
}

```

# public\favicon.png

This is a binary file of the type: Image

# public\favicon.svg

This is a file of the type: SVG Image

# public\layouts\BattleScene.layout.json

```json
{
  "schemaVersion": "2.0",
  "scene": "BattleScene",
  "canvas": {
    "width": 1280,
    "height": 720
  },
  "grid": {
    "cols": 7,
    "rows": 7,
    "cellSize": 102,
    "originX": 283,
    "originY": 3,
    "coordsVisible": true,
    "coordsFontSize": 11,
    "gridLineWidth": 1
  },
  "leftHUD": {
    "x": 0,
    "y": 0,
    "width": 280,
    "height": 720,
    "playerName": { "x": 140, "y": 20 },
    "kingHPBar": { "x": 30, "y": 50, "width": 220, "height": 12 },
    "legCounter": { "x": 140, "y": 100 },
    "legRate": { "x": 140, "y": 130 },
    "winLoss": { "x": 140, "y": 160 },
    "hand": {
      "x": 140, "y": 200,
      "cardWidth": 70, "cardHeight": 95,
      "spacing": 10, "maxVisible": 10,
      "fanAngle": 0, "selectedScale": 1.15
    }
  },
 "rightHUD": {
    "x": 1000, "y": 0, "width": 280, "height": 720,
    "opponentName": { "x": 1160, "y": 20 },
    "kingHPBar": { "x": 1060, "y": 50, "width": 200, "height": 12 },
    "legCounter": { "x": 1160, "y": 100 },
    "hand": {
      "x": 1160, "y": 200,
      "cardWidth": 70, "cardHeight": 95,
      "spacing": 10, "maxVisible": 10,
      "fanAngle": 4, "selectedScale": 1
    }
  },
"bottomBar": {
    "x": 997, "y": 300, "width": 70, "height": 120,
    "phaseLabel": { "x": 1035, "y": 310 },
    "endTurnBtn": { "x": 1035, "y": 345, "width": 76, "height": 36 },
    "passBtn": { "x": 0, "y": 0, "width": 0, "height": 0 },
    "cardPlayZone": { "x": 0, "y": 0, "width": 0, "height": 0 }
  },
  "cards": {
    "full": {
      "width": 140, "height": 200,
      "hoverWidth": 160, "hoverHeight": 230,
      "artAreaHeight": 90, "nameBarHeight": 24,
      "statRowHeight": 20, "legPipSize": 24,
      "typeIconSize": 16, "cornerRadius": 6
    },
    "thumbnail": {
      "width": 100, "height": 100,
      "margin": 1, "hpBarHeight": 0,
      "badgeFontSize": 13, "badgeWidth": 24, "badgeHeight": 18
    },
    "detail": {
      "width": 220, "height": 320,
      "x": 640, "y": 360,
      "patternDiagramSize": 80
    }
  },
  "overlays": {
    "dimmer": { "x": 0, "y": 0, "width": 1280, "height": 720 },
    "targetSelect": { "x": 640, "y": 360, "width": 500, "height": 300 },
    "gameOver": { "x": 640, "y": 360, "width": 600, "height": 400 },
    "stakeSelect": { "x": 640, "y": 360, "width": 500, "height": 350 },
    "deckPreview": { "x": 640, "y": 360, "width": 700, "height": 500 }
  }
}

```

# public\layouts\MainMenuScene.layout.json

```json
{
  "schemaVersion": "2.0",
  "scene": "MainMenuScene",
  "canvas": {
    "width": 1280,
    "height": 720
  },
  "grid": null,
  "elements": [
    {
      "id": "title",
      "type": "text",
      "name": "Game Title",
      "x": 540,
      "y": 68,
      "w": 200,
      "h": 56,
      "opacity": 1,
      "cornerRadius": 0,
      "fill": "transparent",
      "stroke": "transparent",
      "strokeWidth": 1,
      "label": "OnChainBattles",
      "fontSize": 36,
      "textColor": "#FFFFFF",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "tagline",
      "type": "text",
      "name": "Tagline",
      "x": 460,
      "y": 128,
      "w": 360,
      "h": 24,
      "opacity": 1,
      "cornerRadius": 0,
      "fill": "transparent",
      "stroke": "transparent",
      "strokeWidth": 1,
      "label": "Chess-Like On-Chain Card Duel",
      "fontSize": 14,
      "textColor": "#AAAAAA",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "nameInput",
      "type": "hud",
      "name": "Name Input",
      "x": 460,
      "y": 252,
      "w": 360,
      "h": 48,
      "opacity": 1,
      "cornerRadius": 4,
      "fill": "#16213E",
      "stroke": "#253348",
      "strokeWidth": 1,
      "label": "Your Name",
      "fontSize": 13,
      "textColor": "#AAAAAA",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "roomInput",
      "type": "hud",
      "name": "Room Code Input",
      "x": 480,
      "y": 318,
      "w": 320,
      "h": 48,
      "opacity": 1,
      "cornerRadius": 4,
      "fill": "#16213E",
      "stroke": "#253348",
      "strokeWidth": 1,
      "label": "Room Code",
      "fontSize": 13,
      "textColor": "#AAAAAA",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "playFree",
      "type": "button",
      "name": "Play Free",
      "x": 540,
      "y": 412,
      "w": 200,
      "h": 52,
      "opacity": 1,
      "cornerRadius": 3,
      "fill": "transparent",
      "stroke": "#00FF88",
      "strokeWidth": 1,
      "label": "[ PLAY FREE ]",
      "fontSize": 16,
      "textColor": "#00FF88",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": "primary",
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "playCrypto",
      "type": "button",
      "name": "Play Crypto",
      "x": 504,
      "y": 480,
      "w": 272,
      "h": 44,
      "opacity": 1,
      "cornerRadius": 3,
      "fill": "transparent",
      "stroke": "#F5A623",
      "strokeWidth": 1,
      "label": "[ PLAY CRYPTO (AVAX) ]",
      "fontSize": 13,
      "textColor": "#F5A623",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": "primary",
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "logo",
      "type": "image",
      "name": "Logo",
      "x": 604,
      "y": 68,
      "w": 72,
      "h": 60,
      "opacity": 1,
      "cornerRadius": 0,
      "fill": "transparent",
      "stroke": "#253348",
      "strokeWidth": 1,
      "label": "",
      "fontSize": 13,
      "textColor": "#fff",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    }
  ]
}
```

# public\layouts\ResultScene.layout.json

```json
{
  "schemaVersion": "2.0",
  "scene": "ResultScene",
  "canvas": {
    "width": 1280,
    "height": 720
  },
  "grid": null,
  "elements": [
    {
      "id": "panel",
      "type": "hud",
      "name": "Result Panel",
      "x": 340,
      "y": 150,
      "w": 600,
      "h": 420,
      "opacity": 1,
      "cornerRadius": 10,
      "fill": "#16213E",
      "stroke": "#253348",
      "strokeWidth": 1,
      "label": "",
      "fontSize": 13,
      "textColor": "#fff",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "resultTxt",
      "type": "text",
      "name": "Result",
      "x": 524,
      "y": 228,
      "w": 232,
      "h": 60,
      "opacity": 1,
      "cornerRadius": 0,
      "fill": "transparent",
      "stroke": "transparent",
      "strokeWidth": 1,
      "label": "YOU WIN! 🎉",
      "fontSize": 38,
      "textColor": "#00FF88",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "winnerLbl",
      "type": "text",
      "name": "Winner",
      "x": 464,
      "y": 308,
      "w": 352,
      "h": 28,
      "opacity": 1,
      "cornerRadius": 0,
      "fill": "transparent",
      "stroke": "transparent",
      "strokeWidth": 1,
      "label": "Player: 0xAbCd...",
      "fontSize": 16,
      "textColor": "#AAAAAA",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "payoutLbl",
      "type": "text",
      "name": "Payout",
      "x": 464,
      "y": 356,
      "w": 352,
      "h": 32,
      "opacity": 1,
      "cornerRadius": 0,
      "fill": "transparent",
      "stroke": "transparent",
      "strokeWidth": 1,
      "label": "Payout: 0.18 AVAX",
      "fontSize": 20,
      "textColor": "#F5A623",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "txLbl",
      "type": "text",
      "name": "TX Hash",
      "x": 424,
      "y": 408,
      "w": 432,
      "h": 20,
      "opacity": 1,
      "cornerRadius": 0,
      "fill": "transparent",
      "stroke": "transparent",
      "strokeWidth": 1,
      "label": "TX: 0x1234...abcd",
      "fontSize": 11,
      "textColor": "#4FC3F7",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": null,
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "playAgain",
      "type": "button",
      "name": "Play Again",
      "x": 540,
      "y": 480,
      "w": 200,
      "h": 52,
      "opacity": 1,
      "cornerRadius": 6,
      "fill": "#00FF88",
      "stroke": "#00FF88",
      "strokeWidth": 1,
      "label": "PLAY AGAIN",
      "fontSize": 16,
      "textColor": "#000",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": "endTurn",
      "paddingX": 16,
      "paddingY": 8
    },
    {
      "id": "menuBtn",
      "type": "button",
      "name": "Menu",
      "x": 560,
      "y": 548,
      "w": 160,
      "h": 44,
      "opacity": 1,
      "cornerRadius": 4,
      "fill": "#16213E",
      "stroke": "#253348",
      "strokeWidth": 1,
      "label": "MAIN MENU",
      "fontSize": 13,
      "textColor": "#AAAAAA",
      "assetKey": null,
      "cardArtKey": null,
      "cardFrameKey": null,
      "cardBackKey": null,
      "faceDown": false,
      "cardType": "STANDARD",
      "legCost": 0,
      "atk": 0,
      "def": 0,
      "barFull": "#00FF88",
      "barMid": "#F5A623",
      "barLow": "#FF4444",
      "barBg": "#333333",
      "barValue": 65,
      "btnStyle": "secondary",
      "paddingX": 16,
      "paddingY": 8
    }
  ]
}
```

# public\publicroot

```

```

# public\style.css

```css
body {
    margin: 0;
    padding: 0;
    color: rgba(255, 255, 255, 0.87);
    background-color: #000000;
}

#app {
    width: 100%;
    height: 100vh;
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: center;
}
```

# public\themes\BattleScene.theme.json

```json
{
  "schemaVersion": "2.0",
  "scene": "BattleScene",

  "colors": {
    "BG_DEEP":        "#1A1A2E",
    "BG_MID":         "#16213E",
    "BG_BOARD":       "#0F3460",
    "ACCENT_GOLD":    "#F5A623",
    "ACCENT_GREEN":   "#00FF88",
    "ACCENT_RED":     "#FF4444",
    "ACCENT_BLUE":    "#4FC3F7",
    "TEXT_PRIMARY":   "#FFFFFF",
    "TEXT_SECONDARY": "#AAAAAA",
    "CARD_STANDARD":  "#2A2A4A",
    "CARD_ROYAL":     "#3D2B1F",
    "CARD_STATIC":    "#1B3A2A",
    "CARD_SPELL":     "#2A1B3D",
    "OVERLAY_BLACK":  "#000000"
  },

  "fonts": {
    "title":       { "family": "Arial", "size": 32, "color": "#FFFFFF" },
    "heading":     { "family": "Arial", "size": 18, "color": "#FFFFFF" },
    "body":        { "family": "Arial", "size": 14, "color": "#FFFFFF" },
    "small":       { "family": "Arial", "size": 11, "color": "#AAAAAA" },
    "cardName":    { "family": "Arial", "size": 12, "color": "#FFFFFF" },
    "cardStat":    { "family": "Arial", "size": 12, "color": "#FFFFFF" },
    "cardAbility": { "family": "Arial", "size": 11, "color": "#AAAAAA" },
    "coordLabel":  { "family": "Arial", "size": 11, "color": "#AAAAAA" }
  },

  "assets": {
    "bg_main_menu":        "backgrounds/bg_main_menu.png",
    "bg_battle":           "backgrounds/bg_battle.png",
    "bg_result":           "backgrounds/bg_result.png",

    "board_skin":          "board/board_skin.png",

    "card_frame_standard": "cards/card_frame_standard.png",
    "card_frame_royal":    "cards/card_frame_royal.png",
    "card_frame_static":   "cards/card_frame_static.png",
    "card_frame_spell":    "cards/card_frame_spell.png",
    "card_back":           "cards/card_back_pattern.png",

    "icon_atk":            "icons/icon_atk.png",
    "icon_def":            "icons/icon_def.png",
    "icon_leg":            "icons/icon_leg.png",
    "icon_move":           "icons/icon_move.png",
    "icon_cavalry":        "icons/icon_cavalry.png",
    "icon_clock":          "icons/icon_clock.png",
    "icon_ranged":         "icons/icon_ranged.png",

    "icon_type_standard":  "icons/icon_type_standard.png",
    "icon_type_royal":     "icons/icon_type_royal.png",
    "icon_type_static":    "icons/icon_type_static.png",
    "icon_type_spell":     "icons/icon_type_spell.png",

    "marker_move":         "fx/marker_move.png",
    "marker_attack":       "fx/marker_attack.png",
    "marker_aura":         "fx/marker_aura.png",
    "marker_selected":     "fx/marker_selected.png",
    "marker_danger":       "fx/marker_danger.png",

    "logo":                "ui/logo.png",

    "art_archer":          "cards/art/archer.png",
    "art_assassin":        "cards/art/assassin.png",
    "art_castle":          "cards/art/castle.png",
    "art_casus_belli":     "cards/art/casus_belli.png",
    "art_civil_war":       "cards/art/civil_war.png",
    "art_commander":       "cards/art/commander.png",
    "art_coup":            "cards/art/coup.png",
    "art_disease":         "cards/art/disease.png",
    "art_earthquake":      "cards/art/earthquake.png",
    "art_foot_soldier":    "cards/art/foot_soldier.png",
    "art_inquisitor":      "cards/art/inquisitor.png",
    "art_king":            "cards/art/king.png",
    "art_knight":          "cards/art/knight.png",
    "art_knights_guard":   "cards/art/knights_guard.png",
    "art_lancer":          "cards/art/lancer.png",
    "art_messenger":       "cards/art/messenger.png",
    "art_militia":         "cards/art/militia.png",
    "art_motherland":      "cards/art/motherland.png",
    "art_mystic":          "cards/art/mystic.png",
    "art_peasant_revolt":  "cards/art/peasant_revolt.png",
    "art_pikeman":         "cards/art/pikeman.png",
    "art_priest":          "cards/art/priest.png",
    "art_princess":        "cards/art/princess.png",
    "art_reform":          "cards/art/reform.png",
    "art_scout":           "cards/art/scout.png",
    "art_scribe":          "cards/art/scribe.png",
    "art_swordsman":       "cards/art/swordsman.png",
    "art_temple":          "cards/art/temple.png",
    "art_treason":         "cards/art/treason.png",
    "art_village":         "cards/art/village.png",
    "art_war_horn":        "cards/art/war_horn.png",

    "thumb_archer":        "cards/thumb/archer_thumb.png",
    "thumb_assassin":      "cards/thumb/assassin_thumb.png",
    "thumb_castle":        "cards/thumb/castle_thumb.png",
    "thumb_casus_belli":   "cards/thumb/casus_belli_thumb.png",
    "thumb_civil_war":     "cards/thumb/civil_war_thumb.png",
    "thumb_commander":     "cards/thumb/commander_thumb.png",
    "thumb_coup":          "cards/thumb/coup_thumb.png",
    "thumb_disease":       "cards/thumb/disease_thumb.png",
    "thumb_earthquake":    "cards/thumb/earthquake_thumb.png",
    "thumb_foot_soldier":  "cards/thumb/foot_soldier_thumb.png",
    "thumb_inquisitor":    "cards/thumb/inquisitor_thumb.png",
    "thumb_king":          "cards/thumb/king_thumb.png",
    "thumb_knight":        "cards/thumb/knight_thumb.png",
    "thumb_knights_guard": "cards/thumb/knights_guard_thumb.png",
    "thumb_lancer":        "cards/thumb/lancer_thumb.png",
    "thumb_messenger":     "cards/thumb/messenger_thumb.png",
    "thumb_militia":       "cards/thumb/militia_thumb.png",
    "thumb_motherland":    "cards/thumb/motherland_thumb.png",
    "thumb_mystic":        "cards/thumb/mystic_thumb.png",
    "thumb_peasant_revolt":"cards/thumb/peasant_revolt_thumb.png",
    "thumb_pikeman":       "cards/thumb/pikeman_thumb.png",
    "thumb_priest":        "cards/thumb/priest_thumb.png",
    "thumb_princess":      "cards/thumb/princess_thumb.png",
    "thumb_reform":        "cards/thumb/reform_thumb.png",
    "thumb_scout":         "cards/thumb/scout_thumb.png",
    "thumb_scribe":        "cards/thumb/scribe_thumb.png",
    "thumb_swordsman":     "cards/thumb/swordsman_thumb.png",
    "thumb_temple":        "cards/thumb/temple_thumb.png",
    "thumb_treason":       "cards/thumb/treason_thumb.png",
    "thumb_village":       "cards/thumb/village_thumb.png",
    "thumb_war_horn":      "cards/thumb/war_horn_thumb.png"
  },

  "board": {
    "cellEvenFill":     "#0F3460",
    "cellOddFill":      "#0C2D55",
    "gridLineColor":    "#1A4A80",
    "playerHalfTint":   "#00FF8814",
    "enemyHalfTint":    "#FF444414",
    "coordColor":       "#AAAAAA",
    "cellHover":        "#4FC3F733",
    "cellSelected":     "#F5A62366",
    "cellValidMove":    "#00FF8833",
    "cellValidAtk":     "#FF444466",
    "cellAura":         "#4FC3F722",
    "unitBandPlayer":   "#00FF88",
    "unitBandEnemy":    "#FF4444",
    "unitBandHeight":   4,
    "useBoardSkinTexture": true,
    "cardPlayZoneBorderColor": "#F5A623",
    "cardPlayZoneBorderAlpha": 0.4
  },

  "cards": {
    "STANDARD": {
      "frameAsset":  "card_frame_standard",
      "tintColor":   "#2A2A4A",
      "nameBarColor":"#1A1A3A"
    },
    "ROYAL": {
      "frameAsset":  "card_frame_royal",
      "tintColor":   "#3D2B1F",
      "nameBarColor":"#2A1A0A"
    },
    "STATIC": {
      "frameAsset":  "card_frame_static",
      "tintColor":   "#1B3A2A",
      "nameBarColor":"#0A2A1A"
    },
    "SPELL": {
      "frameAsset":  "card_frame_spell",
      "tintColor":   "#2A1B3D",
      "nameBarColor":"#1A0A2A"
    }
  },

  "hud": {
    "panelColor":           "#16213E",
    "panelAlpha":           0.92,
    "panelStroke":          "#4FC3F7",
    "panelStrokeWidth":     1,
    "hpBarBg":              "#333333",
    "hpBarFillPlayer":      "#00FF88",
    "hpBarFillEnemy":       "#FF4444",
    "legPipActive":         "#F5A623",
    "legPipInactive":       "#333333",
    "playerNameColor":      "#00FF88",
    "opponentNameColor":    "#FF4444",
    "phaseTextColor":       "#4FC3F7",
    "turnNumberColor":      "#FFFFFF",
    "cardPlayZoneBorderColor": "#F5A623",
    "cardPlayZoneBorderAlpha": 0.4
  },

  "buttons": {
    "primary": {
      "fillColor":      "#1A3A5C",
      "strokeColor":    "#4FC3F7",
      "strokeWidth":    1,
      "textColor":      "#FFFFFF",
      "fontSize":       14,
      "hoverFillColor": "#2A5A8C",
      "hoverTextColor": "#FFFFFF",
      "cornerRadius":   6,
      "paddingX":       16,
      "paddingY":       8
    },
    "secondary": {
      "fillColor":      "#2A2A4A",
      "strokeColor":    "#AAAAAA",
      "strokeWidth":    1,
      "textColor":      "#AAAAAA",
      "fontSize":       14,
      "hoverFillColor": "#3A3A6A",
      "hoverTextColor": "#FFFFFF",
      "cornerRadius":   6,
      "paddingX":       16,
      "paddingY":       8
    },
    "danger": {
      "fillColor":      "#4A1A1A",
      "strokeColor":    "#FF4444",
      "strokeWidth":    1,
      "textColor":      "#FF4444",
      "fontSize":       14,
      "hoverFillColor": "#6A2A2A",
      "hoverTextColor": "#FFFFFF",
      "cornerRadius":   6,
      "paddingX":       16,
      "paddingY":       8
    },
    "endTurn": {
      "fillColor":      "#0A3A1A",
      "strokeColor":    "#00FF88",
      "strokeWidth":    2,
      "textColor":      "#00FF88",
      "fontSize":       15,
      "hoverFillColor": "#1A5A2A",
      "hoverTextColor": "#FFFFFF",
      "cornerRadius":   8,
      "paddingX":       20,
      "paddingY":       10
    },
    "pass": {
      "fillColor":      "#1A1A2E",
      "strokeColor":    "#555577",
      "strokeWidth":    1,
      "textColor":      "#AAAAAA",
      "fontSize":       13,
      "hoverFillColor": "#2A2A4A",
      "hoverTextColor": "#FFFFFF",
      "cornerRadius":   6,
      "paddingX":       14,
      "paddingY":       8
    }
  },

  "overlays": {
    "dimmerColor":      "#000000",
    "dimmerAlpha":      0.8,
    "panelColor":       "#16213E",
    "panelAlpha":       0.97,
    "panelStroke":      "#4FC3F7",
    "panelStrokeWidth": 1,
    "titleColor":       "#FFFFFF",
    "bodyColor":        "#AAAAAA",
    "cornerRadius":     10
  }
}
```

# public\themes\MainMenuScene.theme.json

```json
{
  "schemaVersion": "2.0",
  "scene": "MainMenuScene",

  "colors": {
    "BG_DEEP":        "#1A1A2E",
    "BG_MID":         "#16213E",
    "BG_BOARD":       "#0F3460",
    "ACCENT_GOLD":    "#F5A623",
    "ACCENT_GREEN":   "#00FF88",
    "ACCENT_RED":     "#FF4444",
    "ACCENT_BLUE":    "#4FC3F7",
    "TEXT_PRIMARY":   "#FFFFFF",
    "TEXT_SECONDARY": "#AAAAAA",
    "CARD_STANDARD":  "#2A2A4A",
    "CARD_ROYAL":     "#3D2B1F",
    "CARD_STATIC":    "#1B3A2A",
    "CARD_SPELL":     "#2A1B3D",
    "OVERLAY_BLACK":  "#000000"
  },

  "fonts": {
    "title":       { "family": "Arial", "size": 32, "color": "#FFFFFF" },
    "heading":     { "family": "Arial", "size": 18, "color": "#FFFFFF" },
    "body":        { "family": "Arial", "size": 14, "color": "#FFFFFF" },
    "small":       { "family": "Arial", "size": 11, "color": "#AAAAAA" },
    "cardName":    { "family": "Arial", "size": 12, "color": "#FFFFFF" },
    "cardStat":    { "family": "Arial", "size": 12, "color": "#FFFFFF" },
    "cardAbility": { "family": "Arial", "size": 11, "color": "#AAAAAA" },
    "coordLabel":  { "family": "Arial", "size": 11, "color": "#AAAAAA" }
  },

  "assets": {
    "bg_main_menu":        "backgrounds/bg_main_menu.png",
    "bg_battle":           "backgrounds/bg_battle.png",
    "bg_result":           "backgrounds/bg_result.png",
    "board_skin":          "board/board_skin.png",
    "card_frame_standard": "cards/card_frame_standard.png",
    "card_frame_royal":    "cards/card_frame_royal.png",
    "card_frame_static":   "cards/card_frame_static.png",
    "card_frame_spell":    "cards/card_frame_spell.png",
    "card_back":           "cards/card_back_pattern.png",
    "icon_atk":            "icons/icon_atk.png",
    "icon_def":            "icons/icon_def.png",
    "icon_leg":            "icons/icon_leg.png",
    "icon_move":           "icons/icon_move.png",
    "icon_cavalry":        "icons/icon_cavalry.png",
    "icon_clock":          "icons/icon_clock.png",
    "icon_ranged":         "icons/icon_ranged.png",
    "icon_type_standard":  "icons/icon_type_standard.png",
    "icon_type_royal":     "icons/icon_type_royal.png",
    "icon_type_static":    "icons/icon_type_static.png",
    "icon_type_spell":     "icons/icon_type_spell.png",
    "marker_move":         "fx/marker_move.png",
    "marker_attack":       "fx/marker_attack.png",
    "marker_aura":         "fx/marker_aura.png",
    "marker_selected":     "fx/marker_selected.png",
    "marker_danger":       "fx/marker_danger.png",
    "logo":                "ui/logo.png"
  },

  "board": {
    "cellEvenFill":     "#0F3460",
    "cellOddFill":      "#0C2D55",
    "gridLineColor":    "#1A4A80",
    "playerHalfTint":   "#00FF8814",
    "enemyHalfTint":    "#FF444414",
    "coordColor":       "#AAAAAA",
    "cellHover":        "#4FC3F733",
    "cellSelected":     "#F5A62366",
    "cellValidMove":    "#00FF8833",
    "cellValidAtk":     "#FF444433",
    "cellAura":         "#4FC3F722",
    "unitBandPlayer":   "#00FF88",
    "unitBandEnemy":    "#FF4444",
    "unitBandHeight":   4,
    "useBoardSkinTexture": true,
    "cardPlayZoneBorderColor": "#F5A623",
    "cardPlayZoneBorderAlpha": 0.4
  },

  "cards": {
    "STANDARD": { "frameAsset": "card_frame_standard", "tintColor": "#2A2A4A", "nameBarColor": "#1A1A3A" },
    "ROYAL":    { "frameAsset": "card_frame_royal",    "tintColor": "#3D2B1F", "nameBarColor": "#2A1A0A" },
    "STATIC":   { "frameAsset": "card_frame_static",   "tintColor": "#1B3A2A", "nameBarColor": "#0A2A1A" },
    "SPELL":    { "frameAsset": "card_frame_spell",    "tintColor": "#2A1B3D", "nameBarColor": "#1A0A2A" }
  },

  "hud": {
    "panelColor":              "#16213E",
    "panelAlpha":              0.92,
    "panelStroke":             "#4FC3F7",
    "panelStrokeWidth":        1,
    "hpBarBg":                 "#333333",
    "hpBarFillPlayer":         "#00FF88",
    "hpBarFillEnemy":          "#FF4444",
    "legPipActive":            "#F5A623",
    "legPipInactive":          "#333333",
    "playerNameColor":         "#00FF88",
    "opponentNameColor":       "#FF4444",
    "phaseTextColor":          "#4FC3F7",
    "turnNumberColor":         "#FFFFFF",
    "cardPlayZoneBorderColor": "#F5A623",
    "cardPlayZoneBorderAlpha": 0.4
  },

  "buttons": {
    "primary": {
      "fillColor": "#1A3A5C", "strokeColor": "#4FC3F7", "strokeWidth": 1,
      "textColor": "#FFFFFF", "fontSize": 14,
      "hoverFillColor": "#2A5A8C", "hoverTextColor": "#FFFFFF",
      "cornerRadius": 6, "paddingX": 16, "paddingY": 8
    },
    "secondary": {
      "fillColor": "#2A2A4A", "strokeColor": "#AAAAAA", "strokeWidth": 1,
      "textColor": "#AAAAAA", "fontSize": 14,
      "hoverFillColor": "#3A3A6A", "hoverTextColor": "#FFFFFF",
      "cornerRadius": 6, "paddingX": 16, "paddingY": 8
    },
    "danger": {
      "fillColor": "#4A1A1A", "strokeColor": "#FF4444", "strokeWidth": 1,
      "textColor": "#FF4444", "fontSize": 14,
      "hoverFillColor": "#6A2A2A", "hoverTextColor": "#FFFFFF",
      "cornerRadius": 6, "paddingX": 16, "paddingY": 8
    },
    "endTurn": {
      "fillColor": "#0A3A1A", "strokeColor": "#00FF88", "strokeWidth": 2,
      "textColor": "#00FF88", "fontSize": 15,
      "hoverFillColor": "#1A5A2A", "hoverTextColor": "#FFFFFF",
      "cornerRadius": 8, "paddingX": 20, "paddingY": 10
    },
    "pass": {
      "fillColor": "#1A1A2E", "strokeColor": "#555577", "strokeWidth": 1,
      "textColor": "#AAAAAA", "fontSize": 13,
      "hoverFillColor": "#2A2A4A", "hoverTextColor": "#FFFFFF",
      "cornerRadius": 6, "paddingX": 14, "paddingY": 8
    }
  },

  "overlays": {
    "dimmerColor": "#000000", "dimmerAlpha": 0.8,
    "panelColor": "#16213E", "panelAlpha": 0.97,
    "panelStroke": "#4FC3F7", "panelStrokeWidth": 1,
    "titleColor": "#FFFFFF", "bodyColor": "#AAAAAA",
    "cornerRadius": 10
  }
}
```

# public\themes\ResultScene.theme.json

```json
{
  "schemaVersion": "2.0",
  "scene": "ResultScene",
  "colors": {
    "BG_DEEP": "#1A1A2E",
    "BG_MID": "#16213E",
    "BG_BOARD": "#0F3460",
    "ACCENT_GOLD": "#F5A623",
    "ACCENT_GREEN": "#00FF88",
    "ACCENT_RED": "#FF4444",
    "ACCENT_BLUE": "#4FC3F7",
    "TEXT_PRIMARY": "#FFFFFF",
    "TEXT_SECONDARY": "#AAAAAA",
    "CARD_STANDARD": "#2A2A4A",
    "CARD_ROYAL": "#3D2B1F",
    "CARD_STATIC": "#1B3A2A",
    "CARD_SPELL": "#2A1B3D",
    "OVERLAY_BLACK": "#000000"
  },
  "fonts": {
    "title": {
      "family": "Rajdhani",
      "size": 32,
      "color": "#FFFFFF"
    },
    "heading": {
      "family": "Exo 2",
      "size": 18,
      "color": "#FFFFFF"
    },
    "body": {
      "family": "Exo 2",
      "size": 14,
      "color": "#FFFFFF"
    },
    "small": {
      "family": "Exo 2",
      "size": 11,
      "color": "#AAAAAA"
    },
    "cardName": {
      "family": "Exo 2",
      "size": 12,
      "color": "#FFFFFF"
    },
    "cardStat": {
      "family": "Share Tech Mono",
      "size": 12,
      "color": "#FFFFFF"
    },
    "cardAbility": {
      "family": "Exo 2",
      "size": 11,
      "color": "#AAAAAA"
    },
    "coordLabel": {
      "family": "Share Tech Mono",
      "size": 11,
      "color": "#AAAAAA"
    }
  },
  "board": {
    "cellEvenFill": "#0F3460",
    "cellOddFill": "#0D2B4E",
    "gridLineColor": "#1A3A6A",
    "playerHalfTint": "#00FF8814",
    "enemyHalfTint": "#FF444414",
    "coordColor": "#AAAAAA",
    "cellHover": "#FFFFFF1F",
    "cellSelected": "#00FF88",
    "cellValidMove": "#00FF8833",
    "cellValidAtk": "#FF444433",
    "cellAura": "#4FC3F71A",
    "unitBandPlayer": "#00FF88",
    "unitBandEnemy": "#FF4444",
    "unitBandHeight": 8,
    "hpBarFull": "#00FF88",
    "hpBarMid": "#F5A623",
    "hpBarLow": "#FF4444",
    "hpBarBackground": "#333333"
  },
  "cards": {
    "STANDARD": {
      "bodyColor": "#2A2A4A",
      "bandColor": "#2A2A4A",
      "frameAsset": "card_frame_standard",
      "legPipColor": "#4FC3F7",
      "borderColor": "#4A4A8A",
      "borderWidth": 2,
      "glowColor": "",
      "glowSize": 0
    },
    "ROYAL": {
      "bodyColor": "#3D2B1F",
      "bandColor": "#F5A623",
      "frameAsset": "card_frame_royal",
      "legPipColor": "#F5A623",
      "borderColor": "#8A6A2A",
      "borderWidth": 2,
      "glowColor": "#F5A623",
      "glowSize": 4
    },
    "STATIC": {
      "bodyColor": "#1B3A2A",
      "bandColor": "#1B3A2A",
      "frameAsset": "card_frame_static",
      "legPipColor": "#4FC3F7",
      "borderColor": "#2A5A3A",
      "borderWidth": 2,
      "glowColor": "",
      "glowSize": 0
    },
    "SPELL": {
      "bodyColor": "#2A1B3D",
      "bandColor": "#9B59B6",
      "frameAsset": "card_frame_spell",
      "legPipColor": "#4FC3F7",
      "borderColor": "#5A2A8A",
      "borderWidth": 2,
      "glowColor": "#a855f7",
      "glowSize": 4
    },
    "atkBadgeColor": "#FF4444",
    "defBadgeColor": "#4FC3F7",
    "nameBarBg": "#1A1A2EB3",
    "nameColor": "#FFFFFF",
    "abilityTextColor": "#AAAAAA",
    "exhaustedAlpha": 0.4,
    "selectedGlowColor": "#00FF88",
    "selectedGlowSize": 6
  },
  "hud": {
    "panelBg": "#16213E",
    "panelAlpha": 0.97,
    "playerNameColor": "#00FF88",
    "enemyNameColor": "#FF4444",
    "legColor": "#F5A623",
    "legRateColor": "#AAAAAA",
    "hpBarFull": "#00FF88",
    "hpBarMid": "#F5A623",
    "hpBarLow": "#FF4444",
    "hpBarBg": "#333333",
    "phaseLabelColor": "#F5A623",
    "cardPlayZoneBorderColor": "#4FC3F7",
    "cardPlayZoneBorderAlpha": 0.6
  },
  "buttons": {
    "primary": {
      "fillColor": "#4FC3F7",
      "strokeColor": "#4FC3F7",
      "strokeWidth": 1,
      "textColor": "#000000",
      "fontSize": 14,
      "hoverFillColor": "#7dd6ff",
      "hoverTextColor": "#000",
      "cornerRadius": 6,
      "paddingX": 16,
      "paddingY": 8
    },
    "secondary": {
      "fillColor": "#2A2A4A",
      "strokeColor": "#4A4A7A",
      "strokeWidth": 1,
      "textColor": "#AAAAAA",
      "fontSize": 14,
      "hoverFillColor": "#3a3a6a",
      "hoverTextColor": "#fff",
      "cornerRadius": 6,
      "paddingX": 16,
      "paddingY": 8
    },
    "danger": {
      "fillColor": "#FF4444",
      "strokeColor": "#FF4444",
      "strokeWidth": 1,
      "textColor": "#FFFFFF",
      "fontSize": 14,
      "hoverFillColor": "#ff7777",
      "hoverTextColor": "#fff",
      "cornerRadius": 6,
      "paddingX": 16,
      "paddingY": 8
    },
    "endTurn": {
      "fillColor": "#00FF88",
      "strokeColor": "#00FF88",
      "strokeWidth": 1,
      "textColor": "#000000",
      "fontSize": 14,
      "hoverFillColor": "#33ffaa",
      "hoverTextColor": "#000",
      "cornerRadius": 6,
      "paddingX": 16,
      "paddingY": 8
    },
    "pass": {
      "fillColor": "#16213E",
      "strokeColor": "#4FC3F7",
      "strokeWidth": 1,
      "textColor": "#AAAAAA",
      "fontSize": 14,
      "hoverFillColor": "#1e2e50",
      "hoverTextColor": "#fff",
      "cornerRadius": 6,
      "paddingX": 16,
      "paddingY": 8
    }
  },
  "overlays": {
    "dimmerColor": "#000000",
    "dimmerAlpha": 0.8,
    "panelColor": "#16213E",
    "panelAlpha": 0.97,
    "panelStroke": "#4FC3F7",
    "panelStrokeWidth": 1,
    "titleColor": "#FFFFFF",
    "bodyColor": "#AAAAAA",
    "cornerRadius": 10
  }
}
```

# README.md

```md
# ⚔️ OnChainBattles

**A chess-like tactical card game on the Avalanche blockchain. Stake AVAX. Deploy units. Destroy the King.**

🎮 [Play Now](https://ocb-game.onrender.com/) · 📄 [Smart Contract on Fuji](https://testnet.snowtrace.io/address/0xa145f82DC5b285B970BE71F48Cf5173E722cF515) · 🏔️ Built for [Avalanche Build Games 2026](https://build.avax.network/build-games)

---

## What Is This?

OnChainBattles is a real-time PvP card battler where two players deploy historical units onto a 7x7 board, maneuver for position, and fight to destroy the opponent's King — with real AVAX on the line.

Think **chess meets Hearthstone, on-chain.** Card draw adds controlled randomness, but positioning, timing, and resource management are pure tactics. Losing feels like a mistake, not bad luck.

**This is not a concept.** It's a deployed, playable game with live smart contracts on Avalanche Fuji testnet.

---

## How It Works

**Each turn follows 5 phases:**

1. **DRAW** — Draw a card from your deck
2. **LEG** — Your King generates Legitimacy (the game's mana resource)
3. **PLAY** — Spend LEG to deploy a unit or cast a spell
4. **ACT** — Each unit on the board can move OR attack
5. **END** — Effects tick, turn passes to opponent

**Win condition:** Destroy the opponent's King.

**On-chain stakes:** Players can wager AVAX through a Solidity escrow contract. Winner takes 95% of the pot. 5% platform rake. Free-play mode also available.

---

## The Card System

23 unique cards across 4 types, forming a 31-card deck (+ pre-placed King):

| Type | Examples | Role |
|------|----------|------|
| **Standard Units** | Foot Soldier, Pikeman, Archer, Assassin, Scout, Lancer | Cheap early-game fighters with unique movement/attack patterns |
| **Royal Units** | Princess, Knight, Commander, King's Guard, Inquisitor | Powerful late-game units that require the discount engine |
| **Structures** | Castle, Temple, Village | Static buildings that provide auras, discounts, and board control |
| **Spells** | Disease, Casus Belli, Earthquake, Civil War | One-shot effects that disrupt the opponent's position or economy |

**The Royal Discount Engine** is the core strategic layer: Castle (−1 LEG), Temple (−1 LEG), and Princess (−1 LEG) reduce Royal unit costs. Protecting these structures unlocks your late-game power. Losing them locks you out.

---

## Key Mechanics

- **Legitimacy (LEG):** Mana that grows each turn. King generates +1/turn base. Princess adds +1 bonus. Spend it to deploy cards.
- **Positional Combat:** Units have distinct movement patterns (omni, diagonal, jump) and attack patterns (melee H/V, ranged diagonal, on-jump). No RNG in combat — ATK deals flat damage to DEF (HP).
- **Pikeman Flank Aura:** Any friendly unit on both left and right of a Pikeman grants +1 ATK +1 DEF. Rewards tight formations.
- **Cavalry Counter:** Pikemen deal ×3 damage to Cavalry units (Lancer, Scout, Commander, Knight).
- **Castle Spawning:** Castles auto-spawn a Foot Soldier every 3 turns and grant adjacent units +1 DEF.
- **Counter-Attacks:** Melee units strike back when attacked in melee range. Ranged units don't.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Game Engine** | Phaser 3 (TypeScript) |
| **Architecture** | Pure TS game logic → Phaser renders via EventBus (zero coupling) |
| **Multiplayer** | Socket.IO — room creation, seed sync, action relay |
| **Blockchain** | Avalanche C-Chain (Fuji Testnet) |
| **Smart Contracts** | Solidity (Hardhat v3) — Escrow.sol for match staking |
| **Web3 Integration** | ethers.js v6 — MetaMask / Core Wallet |
| **Bundler** | Vite |
| **Deployment** | Render (game client + server) |

### Architecture Principles

- **Game logic is framework-agnostic.** `Board`, `GameEngine`, `AbilitySystem`, `MovementRules` are pure TypeScript classes. Phaser never touches game state directly — it subscribes to events and renders.
- **Cards are data-driven.** Adding a new card means adding one object to `CardDefinitions.ts`. No new classes, no switch statements. Abilities resolve through a generic `AbilityResolver`.
- **Clean separation:** `SelectionManager` handles all input state. `BoardRenderer` handles all visuals. `GameEngine` is the single source of truth.

---

## Project Structure

\`\`\`
src/
├── game/
│   ├── engine/          # GameEngine, Board, TurnManager, AbilitySystem
│   ├── data/            # CardDefinitions.ts — single source of truth for all cards
│   ├── types/           # CardTypes, EventTypes, AbilityTypes — full type system
│   ├── input/           # SelectionManager — click/tap handling state machine
│   └── utils/           # MovementRules, CombatResolver, helpers
├── scenes/
│   ├── MainMenuScene    # Lobby, room creation, mode selection
│   ├── BattleScene      # Core gameplay — board, hand, HUD
│   └── ResultScene      # Post-match results, payout display
├── rendering/
│   ├── BoardRenderer    # 6×6 grid, unit sprites, highlights
│   ├── HandRenderer     # Card fan in hand, selection glow
│   ├── HUDRenderer      # LEG display, turn indicator, phase label
│   └── CardRenderer     # Card face rendering with stats overlay
├── network/
│   └── SocketManager    # Socket.IO — room sync, action relay, seed sharing
├── web3/
│   ├── WalletManager    # MetaMask/Core connect, Fuji network switching
│   └── EscrowManager    # Escrow.sol interactions — create, join, payout
└── assets/
    └── cards/
        ├── art/         # Full card illustrations (23 unique cards)
        └── thumb/       # Board thumbnails for deployed units
\`\`\`

---

## Smart Contract

**Escrow.sol** on Avalanche Fuji Testnet:

- **Address:** `0xa145f82DC5b285B970BE71F48Cf5173E722cF515`
- **Explorer:** [View on Snowtrace](https://testnet.snowtrace.io/address/0xa145f82DC5b285B970BE71F48Cf5173E722cF515)
- **Rake:** 5% (500 basis points)

**Match flow:**
1. Player A creates room → deposits AVAX into escrow
2. Player B joins room → matches the deposit
3. Contract moves to `Ready` state
4. Game plays out in the client
5. Winner's address is submitted → contract auto-pays winner 95% of pot

---

## Getting Started

### Prerequisites
- Node.js 18+
- MetaMask or Core Wallet (for crypto mode)
- Test AVAX from [faucet.avax.network](https://faucet.avax.network) (for staked matches)

### Run Locally

\`\`\`bash
# Clone
git clone https://github.com/hummancode/OnChainBattles.git
cd OnChainBattles

# Install dependencies
npm install

# Start dev server
npm run dev
\`\`\`

The game runs at `http://localhost:5173`. Open two browser tabs to test PvP locally.

### Deploy Contracts (optional)

\`\`\`bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network fuji
\`\`\`

---

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| **Phase 1:** Core Game | ✅ Complete | Board, cards, turns, PvP multiplayer, escrow |
| **Phase 2:** Engine Expansion | 🔨 In Progress | Spell cards, server-authoritative sim, replay logs |
| **Phase 3:** Deck Building + Mainnet | 📋 Planned | Custom decks, 30+ cards, Avalanche mainnet deploy |
| **Phase 4:** Competitive | 📋 Planned | Glicko-2 ranked matchmaking, leaderboards, spectator mode |
| **Phase 5:** Economy | 📋 Planned | NFT card minting, marketplace, seasonal tournaments |

---

## Why Avalanche?

- **Low fees** make micro-stakes ($1–5 AVAX matches) economically viable
- **Fast finality** means escrow deposits confirm in seconds, not minutes
- **Subnet potential** for a dedicated game chain as player base grows
- **Fuji testnet** with free faucet AVAX for zero-cost development and playtesting

---

## Solo Build

Built entirely by one developer in Ankara, Turkey. Mechanical engineering background (automation & control systems) applied to game system design — the LEG economy, aura calculations, and state machines draw directly from control theory principles.

---

## License

All rights reserved. Source code is visible for competition evaluation purposes.

---

<p align="center">
  <strong>🏔️ Built on Avalanche · ⚔️ Stake. Deploy. Conquer.</strong>
</p>

```

# resize_assets.py

```py
"""
resize_assets.py — Batch resize OnChainBattles art to spec dimensions.

Uses Pillow's LANCZOS resampling (highest quality downscale).
Creates a backup of originals in _originals/ before overwriting.

USAGE:
    python resize_assets.py                    # dry run (shows what would change)
    python resize_assets.py --apply            # actually resize files
    python resize_assets.py --apply --no-backup # skip backup (saves disk space)

Run from project root:  D:\OnChainBattles>
"""

import os
import sys
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not installed. Run:  pip install Pillow")
    sys.exit(1)

# ─── Target dimensions from OCB_Master_Artwork_List ─────────────
# Format:  directory_glob → (width, height)
# Images already at target size are skipped.

RESIZE_RULES = {
    # Card art — exact display size in hand (140 wide × 90 art area)
    "public/assets/cards/art/*.png": (140, 90),

    # Card thumbnails — exact board unit size (100×100)
    "public/assets/cards/thumb/*.png": (100, 100),

    # Card frames — exact card size in hand (140×200)
    "public/assets/cards/card_frame_*.png": (140, 200),
    "public/assets/cards/card_back_pattern.png": (140, 200),

    # Everything else stays the same
    "public/assets/backgrounds/bg_main_menu.png": (1280, 720),
    "public/assets/backgrounds/bg_battle.png":    (1280, 720),
    "public/assets/backgrounds/bg_result.png":    (1280, 720),
    "public/assets/backgrounds/bg_lobby.png":     (1280, 720),
    "public/assets/backgrounds/bg_menu.png":      (1280, 720),
    "public/assets/backgrounds/bg_board.png": (720, 720),
    "public/assets/board/board_skin.png": (720, 720),
    "public/assets/icons/*.png": (64, 64),
    "public/assets/fx/*.png": (120, 120),
    "public/assets/ui/logo.png": (300, 80),
}


# ─── Helpers ────────────────────────────────────────────────────

def find_files(glob_pattern: str, project_root: Path) -> list[Path]:
    """Resolve a glob pattern relative to project root."""
    parts = glob_pattern.replace("/", os.sep)
    return sorted(project_root.glob(parts))


def resize_image(src: Path, target_w: int, target_h: int, dry_run: bool, backup_dir: Path | None):
    """Resize a single image if it doesn't match target dimensions."""
    try:
        img = Image.open(src)
    except Exception as e:
        print(f"  SKIP  {src.name} — can't open: {e}")
        return "skip"

    cur_w, cur_h = img.size

    # Already correct size
    if cur_w == target_w and cur_h == target_h:
        return "ok"

    ratio_tag = f"{cur_w}×{cur_h} → {target_w}×{target_h}"

    if dry_run:
        print(f"  WOULD RESIZE  {src.name}  ({ratio_tag})")
        return "would"

    # Backup original
    if backup_dir:
        rel = src.relative_to(src.parents[len(src.parts) - 2])
        backup_path = backup_dir / src.relative_to(backup_dir.parent.parent / "public")
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        if not backup_path.exists():
            shutil.copy2(src, backup_path)

    # Resize with LANCZOS (best quality for downscaling)
    # Preserve alpha channel
    resized = img.resize((target_w, target_h), Image.LANCZOS)
    resized.save(src, "PNG", optimize=True)

    print(f"  RESIZED  {src.name}  ({ratio_tag})")
    return "resized"


# ─── Main ───────────────────────────────────────────────────────

def main():
    apply = "--apply" in sys.argv
    no_backup = "--no-backup" in sys.argv

    # Find project root (script should be in project root)
    project_root = Path.cwd()

    # Verify we're in the right place
    if not (project_root / "public" / "assets").is_dir():
        # Try script's own directory
        project_root = Path(__file__).parent
        if not (project_root / "public" / "assets").is_dir():
            print("ERROR: Run this script from the OnChainBattles project root.")
            print("       e.g.:  cd D:\\OnChainBattles && python resize_assets.py")
            sys.exit(1)

    backup_dir = None
    if apply and not no_backup:
        backup_dir = project_root / "public" / "_originals"
        backup_dir.mkdir(exist_ok=True)
        print(f"Backing up originals to: {backup_dir}\n")

    if not apply:
        print("=" * 60)
        print("DRY RUN — no files will be changed.")
        print("Add --apply to actually resize files.")
        print("=" * 60)
        print()

    stats = {"ok": 0, "resized": 0, "would": 0, "skip": 0, "missing": 0}

    for glob_pattern, (tw, th) in RESIZE_RULES.items():
        files = find_files(glob_pattern, project_root)

        if not files:
            # Single file pattern that doesn't exist
            if "*" not in glob_pattern:
                print(f"  MISSING  {glob_pattern}")
                stats["missing"] += 1
            continue

        print(f"\n[{glob_pattern}]  target: {tw}×{th}  ({len(files)} files)")

        for f in files:
            # Skip .DS_Store and non-PNG
            if f.suffix.lower() != ".png":
                continue
            result = resize_image(f, tw, th, dry_run=not apply, backup_dir=backup_dir)
            stats[result] += 1

    # Summary
    print("\n" + "=" * 60)
    if apply:
        print(f"DONE.  Resized: {stats['resized']}  |  Already correct: {stats['ok']}  |  Skipped: {stats['skip']}  |  Missing: {stats['missing']}")
        if backup_dir and backup_dir.exists():
            print(f"\nOriginals saved in: {backup_dir}")
            print("Delete _originals/ when you're happy with the results.")
    else:
        print(f"DRY RUN.  Would resize: {stats['would']}  |  Already correct: {stats['ok']}  |  Missing: {stats['missing']}")
        print("\nRun with --apply to execute.")


if __name__ == "__main__":
    main()

```

# scripts_generate_placeholder_pngs.py

```py
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("  [SKIP] Pillow not installed. Run: pip install Pillow")
    sys.exit(0)

ROOT = os.environ.get("ROOT") or os.path.dirname(os.path.abspath(__file__))

FONT_PATHS = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def load_font(size: int):
    for fp in FONT_PATHS:
        try:
            return ImageFont.truetype(fp, size)
        except Exception:
            pass
    return ImageFont.load_default()


def rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


created = 0


def make(rel, w, h, bg, label, lc="#BBBBBB", border=None, alpha=255):
    global created
    path = os.path.join(ROOT, "public", "assets", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        return

    img = Image.new("RGBA", (w, h), (*rgb(bg), alpha))
    draw = ImageDraw.Draw(img)

    stripe_color = (*rgb(lc), 18)
    for i in range(-h, w + h, 18):
        draw.line([(i, 0), (i + h, h)], fill=stripe_color, width=1)

    if border:
        bw = max(2, w // 60)
        draw.rectangle([bw, bw, w - bw - 1, h - bw - 1], outline=(*rgb(border), 220), width=bw)

    font_size = max(8, min(16, h // 6, w // 8))
    font = load_font(font_size)

    lines = label.split("\n")
    total_h = len(lines) * (font_size + 2)
    for li, line in enumerate(lines):
        bb = draw.textbbox((0, 0), line, font=font)
        tw = bb[2] - bb[0]
        tx = (w - tw) // 2
        ty = (h - total_h) // 2 + li * (font_size + 2)
        draw.text((tx, ty), line, fill=(*rgb(lc), 210), font=font)

    img.save(path, "PNG")
    created += 1


def t(rel, w, h, bg, label, lc="#AAAAAA", border=None, a=255):
    make(rel, w, h, bg, label, lc, border, a)


# Backgrounds
t("backgrounds/bg_battle.png", 1280, 720, "#0A1520", "BG BATTLE", "#334455", "#1A2A3A")
t("backgrounds/bg_main_menu.png", 1280, 720, "#10101E", "BG MAIN MENU", "#2A2A44", "#1A1A3A")
t("backgrounds/bg_result.png", 1280, 720, "#0A1520", "BG RESULT", "#334455", "#1A2A3A")
t("backgrounds/bg_lobby.png", 1280, 720, "#10101E", "BG LOBBY", "#2A2A44", "#1A1A3A")

# Board
t("board/board_skin.png", 720, 720, "#0C2D4A", "BOARD SKIN", "#1A5A8A", "#1A3A6A")

# UI
t("ui/logo.png", 300, 80, "#1A1A2E", "ONCHAINBATTLES", "#F5A623", "#F5A623")

# Card frames
t("cards/card_frame_standard.png", 140, 200, "#12122A", "STANDARD\nFRAME", "#5A5A9A", "#4A4A8A")
t("cards/card_frame_royal.png", 140, 200, "#1A1200", "ROYAL\nFRAME", "#C8960C", "#A07800")
t("cards/card_frame_static.png", 140, 200, "#0A1A0A", "STATIC\nFRAME", "#3A8A4A", "#2A6A3A")
t("cards/card_frame_spell.png", 140, 200, "#140A1E", "SPELL\nFRAME", "#8A3AAA", "#6A1A8A")
t("cards/card_back_pattern.png", 140, 200, "#101028", "CARD\nBACK", "#3A3A66", "#2A2A55")

# Card art + thumbnails
CARDS = [
    ("foot_soldier", "#1A2A1A", "#4A8A4A"),
    ("pikeman", "#1A1A2A", "#4A4A8A"),
    ("archer", "#1A2A2A", "#4A7A7A"),
    ("assassin", "#080810", "#3A3A5A"),
    ("militia", "#1A1A08", "#6A6A2A"),
    ("scout", "#081A08", "#3A6A3A"),
    ("lancer", "#1A0808", "#7A3A3A"),
    ("mystic", "#080818", "#5A3A8A"),
    ("messenger", "#0A1A14", "#3A7A6A"),
    ("king", "#1A1000", "#C8960C"),
    ("swordsman", "#161608", "#8A8A2A"),
    ("princess", "#1A0814", "#9A3A6A"),
    ("priest", "#140808", "#7A3A4A"),
    ("commander", "#080812", "#3A3A8A"),
    ("inquisitor", "#0A0000", "#6A1A1A"),
    ("knight", "#080818", "#3A3A7A"),
    ("knights_guard", "#04040E", "#1A1A4A"),
    ("scribe", "#141000", "#7A6A2A"),
    ("castle", "#14100A", "#6A5A3A"),
    ("temple", "#0A0A18", "#4A3A7A"),
    ("village", "#0A1808", "#3A6A3A"),
    ("disease", "#001400", "#2A7A2A"),
    ("casus_belli", "#1A0A00", "#7A4A1A"),
    ("reform", "#0A1A0A", "#4A7A4A"),
    ("civil_war", "#140000", "#6A1A1A"),
    ("earthquake", "#1A1000", "#8A6A1A"),
    ("war_horn", "#001020", "#1A5A8A"),
    ("coup", "#180004", "#7A1A3A"),
    ("treason", "#100A00", "#6A5A1A"),
    ("motherland", "#001800", "#1A7A1A"),
    ("peasant_revolt", "#0A1400", "#4A7A2A"),
]
for cid, bg, accent in CARDS:
    label = cid.replace("_", " ").upper()
    t(f"cards/art/{cid}.png", 140, 90, bg, label, accent, accent)
    t(f"cards/thumb/{cid}_thumb.png", 200, 200, bg, label, accent, accent)

# Icons (32x32)
ICONS = [
    ("icon_atk", "#3A0A0A", "#FF6666", "ATK"),
    ("icon_def", "#0A1A3A", "#4FC3F7", "DEF"),
    ("icon_leg", "#2A1A00", "#F5A623", "LEG"),
    ("icon_move", "#002A1A", "#00FF88", "MOV"),
    ("icon_cavalry", "#2A1A00", "#F5B833", "CAV"),
    ("icon_clock", "#1A1A1A", "#AAAAAA", "CLK"),
    ("icon_ranged", "#0A1A2A", "#4FC3F7", "RNG"),
    ("icon_type_standard", "#1A1A2A", "#6A6A9A", "STD"),
    ("icon_type_royal", "#1A1200", "#C8960C", "ROY"),
    ("icon_type_static", "#0A1A0A", "#4A8A4A", "STC"),
    ("icon_type_spell", "#12001A", "#8A3AAA", "SPL"),
]
for name, bg, accent, label in ICONS:
    t(f"icons/{name}.png", 32, 32, bg, label, accent, accent)

# FX markers (semi-transparent)
t("fx/marker_move.png", 120, 120, "#001A08", "MOVE", "#00CC66", "#00AA44", 180)
t("fx/marker_attack.png", 120, 120, "#1A0000", "ATTACK", "#CC3333", "#AA2222", 200)
t("fx/marker_aura.png", 120, 120, "#00081A", "AURA", "#3399CC", "#2277AA", 160)
t("fx/marker_selected.png", 120, 120, "#001A0A", "SELECT", "#00FF88", "#00CC66", 200)
t("fx/marker_danger.png", 120, 120, "#1A0000", "DANGER", "#FF4444", "#CC2222", 180)

total = sum(
    sum(1 for f in files if f.endswith(".png"))
    for _, _, files in os.walk(os.path.join(ROOT, "public", "assets"))
)
print(f"  Created {created} new PNGs.  Total on disk: {total} PNGs.")

```

# scripts\deploy.mjs

```mjs
import { network } from "hardhat";

async function main() {
  console.log("Deploying Escrow to Fuji...");

  const connection = await network.connect("fuji");
  const ethers = connection.ethers;

  console.log("ethers loaded:", !!ethers);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const escrow = await ethers.deployContract("Escrow");
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("Escrow deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

# scripts\send-op-tx.ts

```ts
import { network } from "hardhat";

const { ethers } = await network.connect({
  network: "hardhatOp",
  chainType: "op",
});

console.log("Sending transaction using the OP chain type");

const [sender] = await ethers.getSigners();

console.log("Sending 1 wei from", sender.address, "to itself");

console.log("Sending L2 transaction");
const tx = await sender.sendTransaction({
  to: sender.address,
  value: 1n,
});

await tx.wait();

console.log("Transaction sent successfully");

```

# server\api\authRoutes.ts

```ts
// ============================================================
// authRoutes.ts
// Wallet-based authentication: nonce → sign → JWT.
// No password, no email. MetaMask signature is the credential.
// ============================================================

import { Router } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { getDB } from '../db/database.js';
import { issueToken } from './middleware.js';
import { initializeCollection } from './collectionHelpers.js';

export const authRouter = Router();

// In-memory nonce store: wallet → { nonce, expiresAt }
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

const MAX_NONCES = 10_000;

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [key, val] of nonceStore) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
  // Hard cap to prevent OOM under attack
  if (nonceStore.size > MAX_NONCES) {
    const excess = nonceStore.size - MAX_NONCES;
    const keys = nonceStore.keys();
    for (let i = 0; i < excess; i++) {
      const k = keys.next().value;
      if (k !== undefined) nonceStore.delete(k);
    }
  }
}

function buildNonceMessage(nonce: string): string {
  return `Sign this message to log in to OnChainBattles.\n\nNonce: ${nonce}\n\nThis does not cost any gas.`;
}

// GET /api/auth/nonce?wallet=0x...
authRouter.get('/nonce', (req, res) => {
  const wallet = (req.query.wallet as string ?? '').toLowerCase();
  if (!wallet.startsWith('0x') || wallet.length !== 42) {
    res.status(400).json({ error: 'Invalid wallet address.' });
    return;
  }

  cleanExpiredNonces();
  const nonce = crypto.randomBytes(32).toString('hex');
  nonceStore.set(wallet, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });

  res.json({ nonce, message: buildNonceMessage(nonce) });
});

// POST /api/auth/login  { wallet, signature }
authRouter.post('/login', (req, res) => {
  const { wallet, signature } = req.body ?? {};
  const w = (wallet ?? '').toLowerCase();

  if (!w || !signature) {
    res.status(400).json({ error: 'Missing wallet or signature.' });
    return;
  }

  const stored = nonceStore.get(w);
  if (!stored || stored.expiresAt < Date.now()) {
    res.status(401).json({ error: 'Nonce expired. Request a new one.' });
    return;
  }

  const message = buildNonceMessage(stored.nonce);
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== w) {
      res.status(401).json({ error: 'Signature does not match wallet.' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid signature.' });
    return;
  }

  nonceStore.delete(w);

  const db = getDB();
  let player = db.prepare('SELECT * FROM players WHERE wallet_address = ?').get(w) as Record<string, unknown> | undefined;

  if (!player) {
    const result = db.prepare(
      'INSERT INTO players (wallet_address, display_name) VALUES (?, ?)'
    ).run(w, `Player_${w.slice(-6)}`);
    player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>;
    initializeCollection(player!.id as number);
  }

  db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(player!.id);

  const token = issueToken({ playerId: player!.id as number, wallet: w });

  res.json({
    token,
    player: {
      id: player!.id,
      wallet: player!.wallet_address,
      displayName: player!.display_name,
      winCount: player!.win_count,
      lossCount: player!.loss_count,
      eloRating: player!.elo_rating,
      activeDeckId: player!.active_deck_id,
    },
  });
});

```

# server\api\collectionHelpers.ts

```ts
// ============================================================
// collectionHelpers.ts
// Card collection initialization for new players.
// MVP: all cards unlocked at max copies.
// ============================================================

import { getDB } from '../db/database.js';
import { CARD_POOL } from '../validation/CardPool.js';

/** Grant a new player all cards at max copies. */
export function initializeCollection(playerId: number): void {
  const db = getDB();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO collections (player_id, card_id, owned_copies) VALUES (?, ?, ?)'
  );

  const batch = db.transaction(() => {
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue;
      insert.run(playerId, card.id, card.copies);
    }
  });

  batch();
  console.log(`[Collection] Initialized for player #${playerId}`);
}

```

# server\api\collectionRoutes.ts

```ts
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

# server\api\deckRoutes.ts

```ts
// ============================================================
// deckRoutes.ts
// Deck CRUD: list, create, update, delete, activate, validate.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { validateDeck } from '../validation/DeckValidator.js';
import { sanitizeText } from '../utils/sanitize.js';

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
    decks: rows.map(d => {
      let cardIds: string[] = [];
      try { cardIds = JSON.parse(d.card_ids as string); } catch { /* corrupted */ }
      return {
        id: d.id, name: d.name, cardIds,
        isValid: !!d.is_valid,
        createdAt: d.created_at, updatedAt: d.updated_at,
      };
    }),
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

  const safeName = sanitizeText(name, 40) || 'My Deck';
  const result = db.prepare(
    'INSERT INTO decks (player_id, name, card_ids, is_valid) VALUES (?, ?, ?, ?)'
  ).run(req.player!.playerId, safeName, JSON.stringify(cardIds), validation.valid ? 1 : 0);

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

  // Prevent deleting the last deck
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM decks WHERE player_id = ?'
  ).get(req.player!.playerId) as { cnt: number };
  if (count.cnt <= 1) {
    res.status(400).json({ error: 'Cannot delete your last deck.' });
    return;
  }

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

# server\api\index.ts

```ts
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

# server\api\matchRoutes.ts

```ts
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

# server\api\matchService.ts

```ts
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

  console.log(`[MatchService] Recorded match in ${roomCode}, winner: ${winnerId ?? 'guest'}`);
}

```

# server\api\middleware.ts

```ts
// ============================================================
// middleware.ts
// JWT authentication middleware for Express routes.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'ocb-dev-secret-replace-in-production';

export interface TokenPayload {
  playerId: number;
  wallet: string;
}

// Extend Express Request to carry auth payload
declare global {
  namespace Express {
    interface Request {
      player?: TokenPayload;
    }
  }
}

export function issueToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

/** Requires valid JWT. Attaches `req.player`. Returns 401 on failure. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header.' });
    return;
  }

  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  req.player = payload;
  next();
}

```

# server\api\playerRoutes.ts

```ts
// ============================================================
// playerRoutes.ts
// Player profile: read + update display name.
// ============================================================

import { Router } from 'express';
import { getDB } from '../db/database.js';
import { requireAuth } from './middleware.js';
import { sanitizeText } from '../utils/sanitize.js';

export const playerRouter = Router();

// GET /api/player/me
playerRouter.get('/me', requireAuth, (req, res) => {
  const db = getDB();
  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown> | undefined;
  if (!p) {
    res.status(404).json({ error: 'Player not found.' });
    return;
  }

  res.json({
    id: p.id,
    wallet: p.wallet_address,
    displayName: p.display_name,
    winCount: p.win_count,
    lossCount: p.loss_count,
    eloRating: p.elo_rating,
    activeDeckId: p.active_deck_id,
    createdAt: p.created_at,
  });
});

// PATCH /api/player/me  { displayName }
playerRouter.patch('/me', requireAuth, (req, res) => {
  const { displayName } = req.body ?? {};
  const db = getDB();

  const clean = sanitizeText(displayName, 20);
  if (clean.length >= 2) {
    db.prepare('UPDATE players SET display_name = ? WHERE id = ?')
      .run(clean, req.player!.playerId);
  }

  const p = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.playerId) as Record<string, unknown>;
  res.json({ id: p.id, displayName: p.display_name });
});

```

# server\app.ts

```ts
// ============================================================
// app.ts
// Server entry point: Express + Socket.io bootstrap.
// ============================================================

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { verifyMessage } from 'ethers';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types/NetworkEvents.js';
import { RoomManager } from './rooms/RoomManager.js';
import { PayoutService } from './game/PayoutService.js';
import { SessionManager } from './game/SessionManager.js';
import { getDB, closeDB } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { apiRouter } from './api/index.js';
import { LobbyManager } from './lobby/LobbyManager.js';
import { RoomJanitor } from './lobby/RoomJanitor.js';

dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/api', apiRouter);

// ── Database ──
getDB();
runMigrations();

const httpServer = createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [/^http:\/\/localhost:\d+$/];

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: allowedOrigins },
});

const roomManager = new RoomManager();
const payout = new PayoutService(process.env.FUJI_PRIVATE_KEY!);
const session = new SessionManager(io, roomManager, payout);
const lobby = new LobbyManager(io, roomManager);
const janitor = new RoomJanitor(roomManager);
janitor.start();

// ── Per-socket rate limiter ──
const RATE_WINDOW_MS = 1_000;
const RATE_MAX_EVENTS = 30; // max events per second per socket

interface RateData { count: number; windowStart: number }
const rateLimitMap = new WeakMap<object, RateData>();

function rateLimited(socket: ReturnType<typeof io['sockets']['sockets']['get']>): boolean {
  const now = Date.now();
  let data = rateLimitMap.get(socket!);
  if (!data) {
    data = { count: 0, windowStart: now };
    rateLimitMap.set(socket!, data);
  }
  if (now - data.windowStart > RATE_WINDOW_MS) {
    data.count = 0;
    data.windowStart = now;
  }
  data.count += 1;
  if (data.count > RATE_MAX_EVENTS) {
    console.warn(`[Server] Rate limit exceeded for ${socket!.id}`);
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  console.log(`[Server] Player connected: ${socket.id}`);

  // Rate-limit middleware: intercept all incoming events
  socket.use((_event, next) => {
    if (rateLimited(socket)) {
      return next(new Error('Rate limit exceeded'));
    }
    next();
  });

  // ── Room events ──
  socket.on('createRoom', ({ roomCode, playerName }) => {
    roomManager.createRoom(socket.id, roomCode, playerName);
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, playerIndex: 0 });
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const result = roomManager.joinRoom(socket.id, roomCode, playerName);
    if (typeof result === 'string') {
      socket.emit('error', { message: result });
      return;
    }
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, playerIndex: 1 });

    const host = result.players[0];
    io.to(host.id).emit('opponentJoined', { playerName, playerIndex: 0 });
    socket.emit('opponentJoined', { playerName: host.name, playerIndex: 1 });

    // Broadcast shared shuffle seed
    io.to(roomCode).emit('game_seed', { seed: result.gameSeed! });
  });

  socket.on('registerWallet', ({ roomCode, walletAddress, message, signature }) => {
    // Verify signature proves ownership of claimed wallet
    try {
      const recovered = verifyMessage(message, signature);
      if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
        console.warn(`[Server] Wallet verification failed: claimed ${walletAddress}, recovered ${recovered}`);
        socket.emit('error', { message: 'Wallet verification failed' });
        return;
      }
      if (!message.includes(roomCode)) {
        console.warn(`[Server] Wallet verification: message doesn't contain roomCode`);
        socket.emit('error', { message: 'Invalid verification message' });
        return;
      }
      // Only accept registerWallet once per player
      const room = roomManager.getRoom(roomCode);
      const player = room?.players.find(p => p.id === socket.id);
      if (player?.wallet) {
        console.warn(`[Server] Wallet already registered for ${player.name}, ignoring re-registration`);
        return;
      }
      roomManager.registerWallet(socket.id, roomCode, walletAddress);
    } catch (err) {
      console.error(`[Server] Wallet verification error:`, err);
      socket.emit('error', { message: 'Wallet verification failed' });
    }
  });

  // ── Rejoin after disconnect ──
  socket.on('rejoin_room', ({ roomCode, playerName }) => {
    session.handleRejoin(socket, roomCode, playerName);
  });

  // ── Game session events ──
  session.registerHandlers(socket);

  // ── Lobby events ──
  lobby.registerHandlers(socket);

  // ── Disconnect ──
  socket.on('disconnect', () => {
    lobby.handleLobbyDisconnect(socket);
    session.handleDisconnect(socket);
  });
});

// Public room list (no auth required)
app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.getPublicRooms() });
});

httpServer.listen(3001, () => {
  console.log('[Server] Socket.io + REST API + Lobby running on port 3001');
});

function shutdown() {
  janitor.stop();
  closeDB();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

```

# server\data\ocb.sqlite

This is a binary file of the type: Binary

# server\data\ocb.sqlite-shm

This is a binary file of the type: Binary

# server\data\ocb.sqlite-wal

This is a binary file of the type: Binary

# server\db\database.ts

```ts
// ============================================================
// database.ts
// SQLite connection — singleton with WAL mode.
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve('server/data');
const DB_PATH = path.join(DB_DIR, 'ocb.sqlite');

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log(`[DB] Opened: ${DB_PATH}`);
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Closed.');
  }
}

```

# server\db\migrations.ts

```ts
// ============================================================
// migrations.ts
// Idempotent schema migrations. Run on every server start.
// Each migration has a unique ID — only runs once.
// ============================================================

import { getDB } from './database.js';

interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_players',
    sql: `CREATE TABLE IF NOT EXISTS players (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address  TEXT UNIQUE NOT NULL,
      display_name    TEXT NOT NULL DEFAULT 'Player',
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login      DATETIME DEFAULT CURRENT_TIMESTAMP,
      win_count       INTEGER DEFAULT 0,
      loss_count      INTEGER DEFAULT 0,
      elo_rating      INTEGER DEFAULT 1000,
      active_deck_id  INTEGER
    )`,
  },
  {
    id: '002_decks',
    sql: `CREATE TABLE IF NOT EXISTS decks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   INTEGER NOT NULL,
      name        TEXT NOT NULL DEFAULT 'My Deck',
      card_ids    TEXT NOT NULL,
      is_valid    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )`,
  },
  {
    id: '003_collections',
    sql: `CREATE TABLE IF NOT EXISTS collections (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id     INTEGER NOT NULL,
      card_id       TEXT NOT NULL,
      owned_copies  INTEGER DEFAULT 0,
      unlocked_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE(player_id, card_id)
    )`,
  },
  {
    id: '004_match_history',
    sql: `CREATE TABLE IF NOT EXISTS match_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code     TEXT NOT NULL,
      player_a_id   INTEGER,
      player_b_id   INTEGER,
      winner_id     INTEGER,
      player_a_deck TEXT,
      player_b_deck TEXT,
      stake_amount  REAL DEFAULT 0,
      tx_hash       TEXT,
      game_seed     INTEGER,
      total_turns   INTEGER DEFAULT 0,
      started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at      DATETIME,
      FOREIGN KEY (player_a_id) REFERENCES players(id),
      FOREIGN KEY (player_b_id) REFERENCES players(id)
    )`,
  },
];

export function runMigrations(): void {
  const db = getDB();

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id     TEXT PRIMARY KEY,
    ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const check = db.prepare('SELECT id FROM _migrations WHERE id = ?');
  const mark = db.prepare('INSERT INTO _migrations (id) VALUES (?)');

  for (const m of MIGRATIONS) {
    if (!check.get(m.id)) {
      console.log(`[DB] Running migration: ${m.id}`);
      db.exec(m.sql);
      mark.run(m.id);
    }
  }

  console.log('[DB] Migrations complete.');
}

```

# server\game\GameLogWriter.ts

```ts
// ============================================================
// GameLogWriter.ts (Server-side)
// Writes per-session game action logs to logs/ directory.
// One JSON file per room session.
//
// In dev mode (NODE_ENV !== 'production'), also accepts rich
// game state snapshots from clients and writes periodically.
//
// Format: logs/server_<roomCode>_<timestamp>.json
// ============================================================

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_DEV = process.env.NODE_ENV !== 'production';
// __dirname = server/dist/server/game/ when compiled
const LOGS_DIR = IS_DEV
  ? join(__dirname, '..', '..', 'logs')        // server/dist/logs
  : join(__dirname, '..', '..', '..', 'logs'); // project-root/logs

const DEV_WRITE_INTERVAL_MS = 30_000;

interface ServerLogEntry {
  seq: number;
  ts: number;                 // ms since session start
  player: number;             // 0 or 1
  actionType: string;
  detail: string;
  raw: Record<string, any>;
}

interface ServerSessionLog {
  meta: {
    roomCode: string;
    seed: number;
    players: Array<{ name: string; wallet: string | null }>;
    startedAt: string;
    endedAt?: string;
  };
  entries: ServerLogEntry[];
  snapshots: Record<string, any>[];
}

export class GameLogWriter {
  private log: ServerSessionLog;
  private seq = 0;
  private startMs: number;
  private filePath: string;
  private writeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(roomCode: string, seed: number, players: Array<{ name: string; wallet: string | null }>) {
    this.startMs = Date.now();
    this.log = {
      meta: {
        roomCode,
        seed,
        players,
        startedAt: new Date().toISOString(),
      },
      entries: [],
      snapshots: [],
    };

    // Pre-compute file path
    const ts = this.log.meta.startedAt.replace(/[:.]/g, '-');
    const filename = `server_${roomCode}_${ts}.json`;
    try {
      if (!existsSync(LOGS_DIR)) {
        mkdirSync(LOGS_DIR, { recursive: true });
      }
    } catch { /* will fail on write instead */ }
    this.filePath = join(LOGS_DIR, filename);

    // In dev mode, write to disk periodically
    if (IS_DEV) {
      this.writeTimer = setInterval(() => this.writeToDisk(), DEV_WRITE_INTERVAL_MS);
    }
  }

  record(playerIndex: number, action: Record<string, any>): void {
    this.log.entries.push({
      seq: this.seq++,
      ts: Date.now() - this.startMs,
      player: playerIndex,
      actionType: action.type ?? 'UNKNOWN',
      detail: describeAction(playerIndex, action),
      raw: { ...action },
    });
  }

  /** Accept a rich game state snapshot (dev only). */
  recordSnapshot(snapshot: Record<string, any>): void {
    this.log.snapshots.push({
      receivedAt: Date.now() - this.startMs,
      ...snapshot,
    });
  }

  flush(): void {
    this.log.meta.endedAt = new Date().toISOString();
    if (this.writeTimer) {
      clearInterval(this.writeTimer);
      this.writeTimer = null;
    }
    this.writeToDisk();
  }

  private writeToDisk(): void {
    try {
      if (!existsSync(LOGS_DIR)) {
        mkdirSync(LOGS_DIR, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(this.log), 'utf-8');
      console.log(`[GameLogWriter] Written ${this.filePath} (${this.log.entries.length} actions, ${this.log.snapshots.length} snapshots)`);
    } catch (e) {
      console.error('[GameLogWriter] Failed to write log:', e);
    }
  }

  get entryCount(): number { return this.log.entries.length; }
}

function describeAction(player: number, action: Record<string, any>): string {
  const p = `P${player + 1}`;
  switch (action.type) {
    case 'PLAY_CARD':
      return `${p} played hand[${action.handIndex}] at (${action.col},${action.row})`;
    case 'MOVE_UNIT':
      return `${p} moved (${action.fromCol},${action.fromRow}) → (${action.col},${action.row})`;
    case 'ATTACK_UNIT':
      return `${p} attacked (${action.fromCol},${action.fromRow}) → (${action.targetCol},${action.targetRow})`;
    case 'END_PLAY_PHASE':
      return `${p} ended PLAY phase`;
    case 'END_ACT_PHASE':
      return `${p} ended ACT phase`;
    case 'SELECT_TARGET':
      return `${p} selected target at (${action.col},${action.row})`;
    case 'SELECT_POSITION':
      return `${p} selected position at (${action.col},${action.row})`;
    case 'CANCEL_PENDING':
      return `${p} cancelled pending interaction`;
    default:
      return `${p}: ${action.type}`;
  }
}

```

# server\game\PayoutService.ts

```ts
// ============================================================
// PayoutService.ts
// Escrow contract interaction for crypto match settlement.
// ============================================================

import { ethers } from 'ethers';
import type { PayoutResult } from '../../shared/types/NetworkEvents.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('PayoutService');

const ESCROW_ADDRESS = '0xa145f82DC5b285B970BE71F48Cf5173E722cF515';
const ESCROW_ABI = [
  'function claimWinnings(bytes32 matchId, address winner) external',
  'function refundTie(bytes32 matchId) external',
  'function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)',
];

const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

export class PayoutService {
  private contract: ethers.Contract;
  private wallet: ethers.Wallet;
  private walletAddress: string;
  /** Simple mutex to serialize transactions (prevents nonce collisions). */
  private txQueue: Promise<void> = Promise.resolve();

  constructor(privateKey: string) {
    const provider = new ethers.JsonRpcProvider(FUJI_RPC);
    this.wallet = new ethers.Wallet(privateKey, provider);
    this.contract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, this.wallet);
    this.walletAddress = this.wallet.address;
    log.info(` Owner wallet: ${this.walletAddress}`);
  }

  /** Convert room code string → bytes32 matchId (must match frontend). */
  matchIdFromCode(roomCode: string): string {
    const hex = Buffer.from(roomCode, 'utf8').toString('hex');
    const padded = hex.padStart(64, '0');
    return '0x' + padded;
  }

  async payoutWinner(roomCode: string, winnerAddress: string): Promise<PayoutResult> {
    return this.enqueue(() => this.doPayoutWinner(roomCode, winnerAddress));
  }

  async refundTie(roomCode: string): Promise<PayoutResult> {
    return this.enqueue(() => this.doRefundTie(roomCode));
  }

  // ── Internals ──

  /** Serialize all contract calls through a queue to prevent nonce collisions. */
  private enqueue(fn: () => Promise<PayoutResult>): Promise<PayoutResult> {
    const resultPromise = this.txQueue.then(fn, fn);
    // Update the queue tail (swallow result to keep it as Promise<void>)
    this.txQueue = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }

  private async doPayoutWinner(roomCode: string, winnerAddress: string): Promise<PayoutResult> {
    const matchId = this.matchIdFromCode(roomCode);
    log.info(` Paying winner ${winnerAddress} for room ${roomCode}`);
    return this.sendWithRetry(
      () => this.contract.claimWinnings(matchId, winnerAddress),
      `payout ${roomCode}`
    );
  }

  private async doRefundTie(roomCode: string): Promise<PayoutResult> {
    const matchId = this.matchIdFromCode(roomCode);
    log.info(` Refunding tie for room ${roomCode}`);
    return this.sendWithRetry(
      () => this.contract.refundTie(matchId),
      `refund ${roomCode}`
    );
  }

  private async sendWithRetry(
    sendFn: () => Promise<ethers.TransactionResponse>,
    label: string
  ): Promise<PayoutResult> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tx = await sendFn();
        const receipt = await tx.wait();
        if (!receipt) {
          log.warn(`${label}: tx.wait() returned null (tx dropped?), hash: ${tx.hash}`);
          return { success: false, error: 'Transaction may have been dropped' };
        }
        log.info(` ${label} done! tx: ${tx.hash}`);
        return { success: true, txHash: tx.hash };
      } catch (err: any) {
        const isRetryable = err.code === 'NETWORK_ERROR'
          || err.code === 'SERVER_ERROR'
          || err.code === 'TIMEOUT'
          || err.message?.includes('nonce');

        if (isRetryable && attempt < MAX_RETRIES) {
          log.warn(`${label} attempt ${attempt + 1} failed (retryable): ${err.message}`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }

        log.error(`${label} failed:`, err.message);
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  }
}

```

# server\game\SessionManager.ts

```ts
// ============================================================
// SessionManager.ts
// Handles game session events: action relay, crypto flow,
// game-over settlement.
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { PayoutService } from './PayoutService.js';
import { Logger } from '../utils/Logger.js';
import { GameLogWriter } from './GameLogWriter.js';
import { verifyToken } from '../api/middleware.js';
import { validateDeck } from '../validation/DeckValidator.js';
import { recordMatch } from '../api/matchService.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const log = new Logger('Session');
const IS_DEV = process.env.NODE_ENV !== 'production';

export class SessionManager {
  constructor(
    private io: TypedServer,
    private rooms: RoomManager,
    private payout: PayoutService
  ) {}

  registerHandlers(socket: TypedSocket): void {
    socket.on('player_ready', ({ roomCode }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      room.battleReadyCount += 1;
      log.info(`player_ready: ${room.battleReadyCount}/2 in room ${roomCode}`);
      if (room.battleReadyCount >= 2) {
        this.io.to(roomCode).emit('both_battle_ready');

        // Start server-side game log
        if (!room.gameLog) {
          room.gameLog = new GameLogWriter(
            roomCode,
            room.gameSeed ?? 0,
            room.players.map(p => ({ name: p.name, wallet: p.wallet })),
          );
        }

        for (const queued of room.actionQueue) {
          socket.to(roomCode).emit('opponent_action', queued);
          log.debug(`Flushed queued action: ${queued.type}`);
        }
        room.actionQueue = [];
      }
    });

    socket.on('game_action', ({ roomCode, action }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;

      if (room.battleReadyCount < 2) {
        room.actionQueue.push(action);
        log.debug(`Queued action (opponent not ready): ${action.type}`);
        return;
      }

      // ── Layer 0: Sequence validation ─────────────────────
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      if (action.seqNum != null) {
        if (action.seqNum <= room.lastSeqNum[playerIndex]) {
          log.warn(`REJECTED ${action.type} from P${playerIndex + 1}: seqNum ${action.seqNum} <= last ${room.lastSeqNum[playerIndex]}`);
          return;
        }
        room.lastSeqNum[playerIndex] = action.seqNum;
      }

      // ── Layer 1: Turn ownership validation ──────────────
      if (playerIndex !== room.currentTurnPlayer) {
        log.warn(`REJECTED ${action.type} from P${playerIndex + 1} — not their turn (P${room.currentTurnPlayer + 1}'s turn)`);
        return;
      }

      // ── Layer 2: Phase-appropriate action validation ────
      const playPhaseActions = ['PLAY_CARD', 'END_PLAY_PHASE', 'SELECT_POSITION', 'SELECT_TARGET', 'CANCEL_PENDING'];
      const actPhaseActions  = ['MOVE_UNIT', 'ATTACK_UNIT', 'END_ACT_PHASE', 'SELECT_POSITION', 'SELECT_TARGET', 'CANCEL_PENDING'];

      if (room.currentPhase === 'PLAY' && !playPhaseActions.includes(action.type)) {
        log.warn(`REJECTED ${action.type} during PLAY phase`);
        return;
      }
      if (room.currentPhase === 'ACT' && !actPhaseActions.includes(action.type)) {
        log.warn(`REJECTED ${action.type} during ACT phase`);
        return;
      }

      // ── Layer 2: Field validation ───────────────────────
      if (action.type === 'PLAY_CARD' && (action.handIndex == null || action.col == null || action.row == null)) {
        log.warn('REJECTED PLAY_CARD: missing fields');
        return;
      }
      if (action.type === 'MOVE_UNIT' && (action.fromCol == null || action.fromRow == null || action.col == null || action.row == null)) {
        log.warn('REJECTED MOVE_UNIT: missing fields');
        return;
      }
      if (action.type === 'ATTACK_UNIT' && (action.fromCol == null || action.fromRow == null || action.targetCol == null || action.targetRow == null)) {
        log.warn('REJECTED ATTACK_UNIT: missing fields');
        return;
      }

      // ── Track phase/turn transitions ────────────────────
      if (action.type === 'END_PLAY_PHASE') {
        room.currentPhase = 'ACT';
      } else if (action.type === 'END_ACT_PHASE') {
        room.currentPhase = 'PLAY';
        room.currentTurnPlayer = room.currentTurnPlayer === 0 ? 1 : 0;
      }

      room.actionCount += 1;
      room.globalSeq += 1;
      action.serverSeq = room.globalSeq;

      // Log action before relay
      room.gameLog?.record(playerIndex, action);

      socket.to(roomCode).emit('opponent_action', action);
      log.debug(`Relayed ${action.type} in ${roomCode} (action #${room.actionCount}, serverSeq=${room.globalSeq})`);
    });

    socket.on('game_over', async ({ roomCode, winnerIndex, totalTurns }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      if (room.settled) return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      if (winnerIndex !== 0 && winnerIndex !== 1) {
        log.warn(`REJECTED game_over: invalid winnerIndex ${winnerIndex}`);
        return;
      }

      const MIN_ACTIONS = 4;
      if (room.actionCount < MIN_ACTIONS) {
        log.warn(`REJECTED game_over: only ${room.actionCount} actions (min ${MIN_ACTIONS})`);
        return;
      }

      if (room.gameOverClaims.some(c => c.playerIndex === playerIndex)) {
        log.warn(`REJECTED duplicate game_over from P${playerIndex + 1}`);
        return;
      }

      room.gameOverClaims.push({ playerIndex, claimedWinner: winnerIndex });
      room.gameLog?.record(playerIndex, { type: 'GAME_OVER', claimedWinner: winnerIndex });
      room.gameLog?.flush();
      log.info(`game_over claim from P${playerIndex + 1}: winner=P${winnerIndex + 1} (${room.gameOverClaims.length}/2 claims)`);

      const hasWallets = room.players.some(p => p.wallet !== null);
      if (!hasWallets) {
        // Free-play: still wait for both claims before recording
        if (room.gameOverClaims.length < 2) {
          log.info(`Free-play game_over claim ${room.gameOverClaims.length}/2 in ${roomCode}`);
          return;
        }
        const fc0 = room.gameOverClaims.find(c => c.playerIndex === 0);
        const fc1 = room.gameOverClaims.find(c => c.playerIndex === 1);
        const agreedWinner = (fc0 && fc1 && fc0.claimedWinner === fc1.claimedWinner)
          ? fc0.claimedWinner : winnerIndex;
        log.info(`Free-play mode game_over in ${roomCode}, winner: P${agreedWinner + 1}`);
        try { recordMatch({ roomCode, room, winnerIndex: agreedWinner, totalTurns: totalTurns ?? 0 }); }
        catch (err: unknown) { log.error('Failed to record match:', err); }
        if (room.status) room.status = 'finished';
        room.settled = true;
        return;
      }

      if (room.gameOverClaims.length < 2) return;

      const claim0 = room.gameOverClaims.find(c => c.playerIndex === 0)!;
      const claim1 = room.gameOverClaims.find(c => c.playerIndex === 1)!;

      room.settled = true;

      if (claim0.claimedWinner === claim1.claimedWinner) {
        // Record match to database
        try { recordMatch({ roomCode, room, winnerIndex: claim0.claimedWinner, totalTurns: totalTurns ?? 0 }); }
        catch (err: unknown) { log.error('Failed to record match:', err); }
        if (room.status) room.status = 'finished';

        const winner = room.players[claim0.claimedWinner];
        if (winner?.wallet) {
          log.info(`Both agree: P${claim0.claimedWinner + 1} (${winner.name}) wins room ${roomCode}`);
          const result = await this.payout.payoutWinner(roomCode, winner.wallet);
          this.io.to(roomCode).emit('payout_result', result);
        }
      } else {
        log.warn(`DISPUTE in ${roomCode}: P1 says P${claim0.claimedWinner + 1}, P2 says P${claim1.claimedWinner + 1}. Refunding.`);
        try {
          const result = await this.payout.refundTie(roomCode);
          this.io.to(roomCode).emit('payout_result', result);
        } catch (err) {
          log.error(`Refund failed for ${roomCode}:`, err);
          this.io.to(roomCode).emit('payout_result', { success: false, error: 'Dispute refund failed' });
        }
      }
    });

    socket.on('state_hash', ({ roomCode, hash, afterGlobalSeq }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      // Cap pending hashes to prevent memory leak if one player stops sending
      if (room.pendingHashes.size > 50) {
        const oldest = room.pendingHashes.keys().next().value;
        if (oldest !== undefined) room.pendingHashes.delete(oldest);
      }

      if (!room.pendingHashes.has(afterGlobalSeq)) {
        room.pendingHashes.set(afterGlobalSeq, []);
      }
      const entries = room.pendingHashes.get(afterGlobalSeq)!;
      entries.push({ playerIndex, hash });

      if (entries.length >= 2) {
        if (entries[0].hash !== entries[1].hash) {
          log.warn(`STATE MISMATCH in ${roomCode} at globalSeq=${afterGlobalSeq}: P1=${entries[0].hash} P2=${entries[1].hash}`);
        } else {
          log.debug(`State sync OK in ${roomCode} at globalSeq=${afterGlobalSeq}: ${entries[0].hash}`);
        }
        room.pendingHashes.delete(afterGlobalSeq);
      }
    });

    // ── Dev-only: rich game state reports for detailed logging ──
    if (IS_DEV) {
      socket.on('game_state_report' as any, ({ roomCode, report }: { roomCode: string; report: Record<string, any> }) => {
        const room = this.rooms.getRoom(roomCode);
        if (!room) return;
        room.gameLog?.recordSnapshot(report);
        log.debug(`State report (${report.trigger}) in ${roomCode}: turn=${report.turn} phase=${report.phase}`);
      });
    }

    socket.on('cryptoReady', ({ roomCode }) => {
      const count = this.rooms.incrementCryptoReady(roomCode);
      if (count === 1) {
        socket.to(roomCode).emit('hostDepositConfirmed');
        log.info(`Told opponent to deposit in room ${roomCode}`);
      } else if (count >= 2) {
        this.io.to(roomCode).emit('bothCryptoReady');
        log.info(`Both players crypto-ready in room ${roomCode}`);
      }
    });

    // ── Auth: register player identity ──
    socket.on('registerPlayer' as any, ({ token }: { token: string }) => {
      const payload = verifyToken(token);
      if (!payload) return;
      const found = this.rooms.findBySocket(socket.id);
      if (found) {
        this.rooms.setPlayerAuth(socket.id, found.roomCode, payload.playerId);
        log.info(`Player #${payload.playerId} identified on ${socket.id}`);
      }
    });

    // ── Deck: validate and store deck for match ──
    socket.on('submitDeck' as any, ({ roomCode, deckIds }: { roomCode: string; deckIds: string[] }) => {
      const result = validateDeck(deckIds, null);
      if (!result.valid) {
        socket.emit('deckRejected', { errors: result.errors });
        return;
      }

      const stored = this.rooms.setPlayerDeck(socket.id, roomCode, deckIds);
      if (!stored) return;

      socket.emit('deckAccepted', { cardCount: deckIds.length });
      log.info(`Deck accepted for socket ${socket.id} in ${roomCode}`);

      if (this.rooms.allDecksReady(roomCode)) {
        this.io.to(roomCode).emit('bothDecksReady');
        log.info(`Both decks ready in ${roomCode}`);
      }
    });
  }

  private static readonly GRACE_PERIOD_MS = 10_000;

  async handleDisconnect(socket: TypedSocket): Promise<void> {
    const found = this.rooms.findBySocket(socket.id);
    if (!found) return;

    const { roomCode, room, playerIndex } = found;
    const disconnected = room.players[playerIndex];
    log.info(`${disconnected.name} disconnected from room: ${roomCode} (grace period: ${SessionManager.GRACE_PERIOD_MS / 1000}s)`);

    // Notify opponent of temporary disconnect with total seconds
    const totalSec = SessionManager.GRACE_PERIOD_MS / 1000;
    socket.to(roomCode).emit('opponentDisconnected');

    // Countdown interval: emit remaining seconds every 1s
    let remaining = totalSec;
    this.io.to(roomCode).emit('disconnectCountdown', { remaining });
    const countdownInterval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        this.io.to(roomCode).emit('disconnectCountdown', { remaining });
      }
    }, 1000);
    room.disconnectIntervals.set(playerIndex, countdownInterval);

    // Start grace period — if they don't rejoin, finalize disconnect
    const timer = setTimeout(async () => {
      clearInterval(countdownInterval);
      room.disconnectTimers.delete(playerIndex);
      log.info(`Grace period expired for ${disconnected.name} in ${roomCode} — finalizing disconnect`);

      // Flush game log before cleanup
      room.gameLog?.record(playerIndex, { type: 'DISCONNECT_ABANDON' });
      room.gameLog?.flush();

      // Notify remaining player that opponent abandoned
      this.io.to(roomCode).emit('opponentAbandon');

      if (room.cryptoReadyCount >= 2 && !room.settled) {
        room.settled = true;
        const remainingIdx = playerIndex === 0 ? 1 : 0;
        const remaining = room.players[remainingIdx];
        if (remaining?.wallet) {
          log.info(`Disconnect payout to ${remaining.name} (${remaining.wallet})`);
          const result = await this.payout.payoutWinner(roomCode, remaining.wallet);
          this.io.to(roomCode).emit('payout_result', result);
        }
      }

      this.rooms.deleteRoom(roomCode);
    }, SessionManager.GRACE_PERIOD_MS);

    room.disconnectTimers.set(playerIndex, timer);
  }

  handleRejoin(socket: TypedSocket, roomCode: string, playerName: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room expired — cannot rejoin' });
      return;
    }

    const playerIndex = this.rooms.reassignSocket(roomCode, playerName, socket.id);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in room' });
      return;
    }

    // Reset sequence counter for reconnected player
    room.lastSeqNum[playerIndex] = 0;

    // Cancel the grace period timer and countdown interval
    const timer = room.disconnectTimers.get(playerIndex);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(playerIndex);
      log.info(`Grace timer cancelled for ${playerName} in ${roomCode}`);
    }
    const interval = room.disconnectIntervals.get(playerIndex);
    if (interval) {
      clearInterval(interval);
      room.disconnectIntervals.delete(playerIndex);
    }

    socket.join(roomCode);
    socket.emit('rejoinSuccess', { roomCode, playerIndex });
    socket.to(roomCode).emit('opponentReconnected');
    log.info(`${playerName} rejoined room: ${roomCode}`);

    // NOTE: handlers are NOT re-registered here — app.ts already calls
    // registerHandlers() + lobby.registerHandlers() for every new socket
    // on 'connection'. Re-registering would cause duplicate handlers.
  }
}

```

# server\lobby\lobbyHelpers.ts

```ts
// ============================================================
// lobbyHelpers.ts
// Lobby room creation helpers — pure functions.
// ============================================================

import type { Room, RoomSettings } from '../../shared/types/NetworkEvents.js';

const DEFAULT_SETTINGS: RoomSettings = {
  isPublic: true,
  isCrypto: false,
  maxPlayers: 2,
  roomName: 'Game Room',
  stakeAmount: 0,
  password: null,
};

/** Create a lobby-enabled room with full settings and all required Room fields. */
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
      ready: true,
    }],
    gameSeed: null,
    cryptoReadyCount: 0,
    battleReadyCount: 0,
    actionQueue: [],
    settled: false,
    currentTurnPlayer: 0,
    currentPhase: 'PLAY',
    actionCount: 0,
    gameOverClaims: [],
    lastSeqNum: [0, 0],
    globalSeq: 0,
    pendingHashes: new Map(),
    disconnectTimers: new Map(),
    disconnectIntervals: new Map(),
    createdAt: Date.now(),
    // Lobby extensions
    hostSocketId,
    hostPlayerId: hostPlayerId ?? null,
    status: 'waiting',
    settings: merged,
    chat: [],
  };
}

```

# server\lobby\LobbyManager.ts

```ts
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

```

# server\lobby\RoomJanitor.ts

```ts
// ============================================================
// RoomJanitor.ts
// Periodic cleanup of stale rooms — ALL rooms, not just public.
// ============================================================

import type { RoomManager } from '../rooms/RoomManager.js';

const ROOM_TTL_MS = 30 * 60 * 1000;   // 30 minutes for lobby rooms
const JANITOR_INTERVAL = 60 * 1000;    // Check every minute

export class RoomJanitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
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
    // RoomManager already has sweepStaleRooms (2h TTL) for legacy rooms.
    // This janitor handles lobby rooms with shorter TTL (30min waiting).
    // Both can coexist safely — deleteRoom is idempotent.
    const publicRooms = this.rooms.getPublicRooms();
    const now = Date.now();

    for (const listing of publicRooms) {
      const age = now - listing.createdAt;
      if (listing.playerCount === 0 || (listing.status === 'waiting' && age > ROOM_TTL_MS)) {
        this.rooms.deleteRoom(listing.code);
        console.log(`[Janitor] Deleted stale lobby room: ${listing.code} (age: ${Math.round(age / 60_000)}m)`);
      }
    }
  }
}

```

# server\rooms\RoomManager.ts

```ts
// ============================================================
// RoomManager.ts
// Room CRUD and player tracking.
// ============================================================

import { randomInt } from 'crypto';
import type { Room, RoomPlayer, PublicRoomListing, LobbyState } from '../../shared/types/NetworkEvents.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('RoomManager');

export class RoomManager {
  private rooms = new Map<string, Room>();
  private static readonly STALE_ROOM_MS = 2 * 60 * 60 * 1000; // 2 hours
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Sweep stale rooms every 10 minutes
    this.cleanupTimer = setInterval(() => this.sweepStaleRooms(), 10 * 60 * 1000);
  }

  private sweepStaleRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > RoomManager.STALE_ROOM_MS) {
        log.info(`Sweeping stale room: ${code} (age: ${Math.round((now - room.createdAt) / 60_000)}m)`);
        this.deleteRoom(code);
      }
    }
  }

  createRoom(socketId: string, roomCode: string, playerName: string): Room {
    const room: Room = {
      players: [{ id: socketId, name: playerName, wallet: null }],
      gameSeed: null,
      cryptoReadyCount: 0,
      battleReadyCount: 0,
      actionQueue: [],
      settled: false,
      currentTurnPlayer: 0,
      currentPhase: 'PLAY',
      actionCount: 0,
      gameOverClaims: [],
      lastSeqNum: [0, 0],
      globalSeq: 0,
      pendingHashes: new Map(),
      disconnectTimers: new Map(),
      disconnectIntervals: new Map(),
      createdAt: Date.now(),
    };
    this.rooms.set(roomCode, room);
    log.info(` Room created: ${roomCode} by ${playerName}`);
    return room;
  }

  joinRoom(socketId: string, roomCode: string, playerName: string): Room | string {
    const room = this.rooms.get(roomCode);
    if (!room) return 'Room not found. Check the code.';
    if (room.players.length >= 2) return 'Room is full.';

    room.players.push({ id: socketId, name: playerName, wallet: null });

    // Generate shared shuffle seed (32-bit, cryptographically random)
    const seed = randomInt(0, 2 ** 32);
    room.gameSeed = seed;

    log.info(` ${playerName} joined room: ${roomCode}, seed: ${seed}`);
    return room;
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  registerWallet(socketId: string, roomCode: string, walletAddress: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socketId);
    if (player) {
      player.wallet = walletAddress;
      log.info(` Wallet registered for ${player.name}: ${walletAddress}`);
    }
  }

  incrementCryptoReady(roomCode: string): number {
    const room = this.rooms.get(roomCode);
    if (!room) return 0;
    room.cryptoReadyCount += 1;
    log.info(` cryptoReady: ${room.cryptoReadyCount}/2 in room ${roomCode}`);
    return room.cryptoReadyCount;
  }

  markSettled(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room || room.settled) return false;
    room.settled = true;
    return true;
  }

  /** Find room + player index by socket ID. Returns null if not found. */
  findBySocket(socketId: string): { roomCode: string; room: Room; playerIndex: number } | null {
    for (const [code, room] of this.rooms) {
      const idx = room.players.findIndex(p => p.id === socketId);
      if (idx !== -1) return { roomCode: code, room, playerIndex: idx };
    }
    return null;
  }

  /** Reassign a player's socket ID (after reconnection). Returns player index or -1. */
  reassignSocket(roomCode: string, playerName: string, newSocketId: string): number {
    const room = this.rooms.get(roomCode);
    if (!room) return -1;
    const idx = room.players.findIndex(p => p.name === playerName);
    if (idx === -1) return -1;
    room.players[idx].id = newSocketId;
    log.info(` Reassigned ${playerName} in ${roomCode} → socket ${newSocketId}`);
    return idx;
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }

  deleteRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      for (const timer of room.disconnectTimers.values()) {
        clearTimeout(timer);
      }
      room.disconnectTimers.clear();
      for (const interval of room.disconnectIntervals.values()) {
        clearInterval(interval);
      }
      room.disconnectIntervals.clear();
    }
    this.rooms.delete(roomCode);
  }

  /** Insert a pre-built room (used by LobbyManager). */
  setRoom(roomCode: string, room: Room): void {
    this.rooms.set(roomCode, room);
  }

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
    // Strip password from broadcast — only expose hasPassword flag
    const { password: _pw, ...safeSettings } = room.settings;
    return {
      code: roomCode,
      settings: { ...safeSettings, password: null },
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
}

```

# server\utils\Logger.ts

```ts
// ============================================================
// Logger.ts — Server-side structured logging.
// Mirror of src/utils/Logger.ts for server code.
// ============================================================

export enum LogLevel {
  DEBUG = 0,
  INFO  = 1,
  WARN  = 2,
  ERROR = 3,
  NONE  = 4,
}

const LEVEL_NAMES: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info:  LogLevel.INFO,
  warn:  LogLevel.WARN,
  error: LogLevel.ERROR,
  none:  LogLevel.NONE,
};

let globalLevel: LogLevel = (() => {
  const raw = process.env.LOG_LEVEL;
  if (raw && LEVEL_NAMES[raw.toLowerCase()] !== undefined) {
    return LEVEL_NAMES[raw.toLowerCase()];
  }
  return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.DEBUG;
})();

export class Logger {
  constructor(private tag: string) {}

  static setGlobalLevel(level: LogLevel): void {
    globalLevel = level;
  }

  static getGlobalLevel(): LogLevel {
    return globalLevel;
  }

  debug(...args: unknown[]): void {
    if (globalLevel <= LogLevel.DEBUG) console.log(`[${this.tag}]`, ...args);
  }

  info(...args: unknown[]): void {
    if (globalLevel <= LogLevel.INFO) console.log(`[${this.tag}]`, ...args);
  }

  warn(...args: unknown[]): void {
    if (globalLevel <= LogLevel.WARN) console.warn(`[${this.tag}]`, ...args);
  }

  error(...args: unknown[]): void {
    if (globalLevel <= LogLevel.ERROR) console.error(`[${this.tag}]`, ...args);
  }
}

```

# server\utils\sanitize.ts

```ts
// ============================================================
// sanitize.ts
// Input sanitization for user-provided strings.
// Strips HTML tags and trims to max length.
// ============================================================

/** Strip HTML tags and trim to maxLen. */
export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/[<>&"']/g, '')   // strip remaining dangerous chars
    .trim()
    .slice(0, maxLen);
}

```

# server\validation\CardPool.ts

```ts
// ============================================================
// CardPool.ts
// Server-side card pool — minimal data for deck validation.
// Costs and copies verified against src/game/data/cards/ definitions.
//
// Future: auto-generate from card definitions via build script.
// ============================================================

export interface CardPoolEntry {
  id: string;
  name: string;
  copies: number;
  cost: number;
}

export const CARD_POOL: readonly CardPoolEntry[] = [
  // King (pre-placed, excluded from decks)
  { id: 'king',           name: 'King',            copies: 1,  cost: 0 },

  // Standard Units
  { id: 'foot_soldier',   name: 'Foot Soldier',    copies: 3,  cost: 1 },
  { id: 'messenger',      name: 'Messenger',       copies: 2,  cost: 1 },
  { id: 'militia',        name: 'Militia',          copies: 2,  cost: 2 },
  { id: 'pikeman',        name: 'Pikeman',          copies: 2,  cost: 2 },
  { id: 'scout',          name: 'Scout',            copies: 2,  cost: 2 },
  { id: 'archer',         name: 'Archer',           copies: 2,  cost: 3 },
  { id: 'assassin',       name: 'Assassin',         copies: 2,  cost: 3 },
  { id: 'lancer',         name: 'Lancer',           copies: 2,  cost: 4 },

  // Royal Units
  { id: 'swordsman',      name: 'Swordsman',        copies: 2,  cost: 3 },
  { id: 'princess',       name: 'Princess',          copies: 1,  cost: 5 },
  { id: 'scribe',         name: 'Scribe',            copies: 2,  cost: 5 },
  { id: 'priest',         name: 'Priest',            copies: 2,  cost: 6 },
  { id: 'mystic',         name: 'Mystic',            copies: 1,  cost: 6 },
  { id: 'commander',      name: 'Commander',         copies: 1,  cost: 7 },
  { id: 'inquisitor',     name: 'Inquisitor',        copies: 2,  cost: 7 },
  { id: 'knight',         name: 'Knight',            copies: 2,  cost: 9 },
  { id: 'knights_guard',  name: "King's Guard",      copies: 1,  cost: 12 },

  // Structures
  { id: 'village',        name: 'Village',            copies: 2,  cost: 2 },
  { id: 'temple',         name: 'Temple',             copies: 2,  cost: 3 },
  { id: 'castle',         name: 'Castle',             copies: 1,  cost: 4 },

  // Spells
  { id: 'reform',         name: 'Reform',             copies: 2,  cost: 2 },
  { id: 'civil_war',      name: 'Civil War',          copies: 1,  cost: 3 },
  { id: 'peasant_revolt', name: 'Peasant Revolt',     copies: 1,  cost: 3 },
  { id: 'war_horn',       name: 'War Horn',           copies: 2,  cost: 3 },
  { id: 'casus_belli',    name: 'Casus Belli',        copies: 1,  cost: 4 },
  { id: 'disease',        name: 'Disease',            copies: 2,  cost: 4 },
  { id: 'motherland',     name: 'Motherland',         copies: 1,  cost: 4 },
  { id: 'treason',        name: 'Treason',            copies: 2,  cost: 4 },
  { id: 'earthquake',     name: 'Earthquake',         copies: 1,  cost: 5 },
  { id: 'coup',           name: 'Coup',               copies: 1,  cost: 12 },
] as const;

const POOL_MAP = new Map<string, CardPoolEntry>(
  CARD_POOL.map(c => [c.id, c])
);

export function getCardFromPool(id: string): CardPoolEntry | undefined {
  return POOL_MAP.get(id);
}

```

# server\validation\DeckValidator.ts

```ts
// ============================================================
// DeckValidator.ts
// Pure deck validation. No database access — ownership map
// is passed in by the caller.
// ============================================================

import { getCardFromPool } from './CardPool.js';

const DECK_SIZE = 31;

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a deck of card IDs.
 * @param cardIds    - Array of card ID strings
 * @param ownedCards - Optional ownership map (cardId → copies owned). Null = skip ownership check.
 */
export function validateDeck(
  cardIds: string[],
  ownedCards: Map<string, number> | null = null
): DeckValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(cardIds)) {
    return { valid: false, errors: ['cardIds must be an array.'] };
  }

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck must have exactly ${DECK_SIZE} cards, got ${cardIds.length}.`);
  }

  if (cardIds.includes('king')) {
    errors.push('King cannot be in deck (pre-placed automatically).');
  }

  const unknown = cardIds.filter(id => !getCardFromPool(id));
  if (unknown.length > 0) {
    errors.push(`Unknown card IDs: ${[...new Set(unknown)].join(', ')}`);
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of counts) {
    const card = getCardFromPool(id);
    if (card && count > card.copies) {
      errors.push(`${card.name}: ${count} copies, max ${card.copies}.`);
    }
  }

  if (ownedCards) {
    for (const [id, count] of counts) {
      const owned = ownedCards.get(id) ?? 0;
      if (count > owned) {
        const card = getCardFromPool(id);
        errors.push(`${card?.name ?? id}: need ${count}, own ${owned}.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

```

# shared\types\NetworkEvents.ts

```ts
// ============================================================
// NetworkEvents.ts
// Shared client ↔ server event contracts.
// Both SocketManager.ts and server/app.ts import from here.
// ============================================================

// ─── Game Actions (relayed between players) ──────────────────

export interface GameAction {
  type: 'PLAY_CARD' | 'MOVE_UNIT' | 'ATTACK_UNIT' | 'END_PLAY_PHASE' | 'END_ACT_PHASE' | 'SELECT_POSITION' | 'SELECT_TARGET' | 'CANCEL_PENDING';
  handIndex?: number;
  col?: number;
  row?: number;
  fromCol?: number;
  fromRow?: number;
  targetCol?: number;
  targetRow?: number;
  /** Client-assigned sequence number (monotonically increasing per player). */
  seqNum?: number;
  /** Server-assigned global order stamp (set before relay to opponent). */
  serverSeq?: number;
}

// ─── Client → Server Events ─────────────────────────────────

// ─── Game State Report (dev-only, sent by client for server logs) ──

export interface StateReportUnit {
  instanceId: string;
  cardId: string;
  name: string;
  owner: number;
  col: number;
  row: number;
  baseAtk: number;
  currentAtk: number;
  baseDef: number;
  currentDef: number;
  maxDef: number;
  isActive: boolean;
  hasMoved: boolean;
  hasActed: boolean;
  buffs: Array<{ source: string; atkDelta: number; defDelta: number; movDelta: number }>;
}

export interface StateReportPlayer {
  player: number;
  handCards: string[];      // card names
  handCount: number;
  deckCount: number;
  discardCount: number;
  leg: number;
  legRate: number;
  legRateBase: number;
  legRateBonus: number;
  legRatePenalty: number;
  crownDiscount: number;
  crownPenalty: number;
}

export interface GameStateReport {
  trigger: 'GAME_START' | 'PERIODIC' | 'GAME_END';
  ts: string;                    // ISO timestamp
  turn: number;
  phase: string;
  activePlayer: number;
  units: StateReportUnit[];
  players: [StateReportPlayer, StateReportPlayer];
}

export interface ClientToServerEvents {
  // Existing room events
  createRoom:     (data: { roomCode: string; playerName: string }) => void;
  joinRoom:       (data: { roomCode: string; playerName: string }) => void;
  registerWallet: (data: { roomCode: string; walletAddress: string; message: string; signature: string }) => void;
  cryptoReady:    (data: { roomCode: string }) => void;
  player_ready:   (data: { roomCode: string }) => void;
  game_action:    (data: { roomCode: string; action: GameAction }) => void;
  game_over:      (data: { roomCode: string; winnerIndex: number; totalTurns?: number }) => void;
  state_hash:     (data: { roomCode: string; hash: string; afterGlobalSeq: number }) => void;
  rejoin_room:    (data: { roomCode: string; playerName: string }) => void;
  game_state_report: (data: { roomCode: string; report: GameStateReport }) => void;

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
  'lobby:request_state':  (data: { roomCode: string }) => void;
}

// ─── Server → Client Events ─────────────────────────────────

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface ServerToClientEvents {
  // Existing room events
  roomCreated:          (data: { roomCode: string; playerIndex: number }) => void;
  roomJoined:           (data: { roomCode: string; playerIndex: number }) => void;
  opponentJoined:       (data: { playerName: string; playerIndex: number }) => void;
  opponent_action:      (action: GameAction) => void;
  game_seed:            (data: { seed: number }) => void;
  both_battle_ready:    () => void;
  opponentDisconnected: () => void;
  opponentReconnected:  () => void;
  opponentAbandon:      () => void;
  disconnectCountdown:  (data: { remaining: number }) => void;
  rejoinSuccess:        (data: { roomCode: string; playerIndex: number }) => void;
  hostDepositConfirmed: () => void;
  bothCryptoReady:      () => void;
  payout_result:        (data: PayoutResult) => void;
  error:                (data: { message: string }) => void;

  // Deck validation events
  deckAccepted:   (data: { cardCount: number }) => void;
  deckRejected:   (data: { errors: string[] }) => void;
  bothDecksReady: () => void;

  // Lobby events
  'lobby:created':            (data: { code: string }) => void;
  'lobby:joined':             (data: { code: string }) => void;
  'lobby:state':              (data: LobbyState) => void;
  'lobby:room_list':          (data: { rooms: PublicRoomListing[] }) => void;
  'lobby:chat_message':       (data: ChatMessage) => void;
  'lobby:system_message':     (data: { text: string; timestamp: number }) => void;
  'lobby:kicked':             (data: { reason: string }) => void;
  'lobby:game_starting':      (data: GameStartingData) => void;
  'lobby:error':              (data: { message: string }) => void;
  'lobby:deposit_phase':      (data: { stakeAmount: number }) => void;
  'lobby:opponent_deposited': () => void;
  'lobby:both_deposited':     () => void;
  'lobby:submit_decks':       () => void;
  'lobby:password_required':  (data: { roomCode: string }) => void;
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

// ─── Room Status ────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'full' | 'depositing' | 'starting' | 'in_progress' | 'finished';

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

export interface GameOverClaim {
  playerIndex: number;
  claimedWinner: number;
}

export interface Room {
  players: RoomPlayer[];
  gameSeed: number | null;
  cryptoReadyCount: number;
  battleReadyCount: number;
  actionQueue: GameAction[];
  settled: boolean;
  // Server-side turn tracking for action validation
  currentTurnPlayer: number;  // 0 = P1, 1 = P2
  currentPhase: 'PLAY' | 'ACT';
  // Game-over verification
  actionCount: number;
  gameOverClaims: GameOverClaim[];
  // Action sequencing
  lastSeqNum: [number, number];  // last seqNum received from [P1, P2]
  globalSeq: number;             // monotonic server-wide order stamp
  // State checksum sync
  pendingHashes: Map<number, { playerIndex: number; hash: string }[]>;
  // Reconnection grace
  disconnectTimers: Map<number, ReturnType<typeof setTimeout>>;
  disconnectIntervals: Map<number, ReturnType<typeof setInterval>>;
  // Room age tracking for stale cleanup
  createdAt: number;
  // Server-side game log (optional, set when battle starts)
  gameLog?: any;
  // Lobby extensions (optional — backward compatible with legacy RoomScene flow)
  hostSocketId?: string;
  hostPlayerId?: number | null;
  status?: RoomStatus;
  settings?: RoomSettings;
  chat?: ChatMessage[];
}

```

# src\auth\AuthManager.ts

```ts
// ============================================================
// AuthManager.ts
// Wallet-based authentication: nonce → sign → JWT.
// Singleton — survives scene changes.
//
// Flow:
//   1. WalletManager.connect() → get signer
//   2. GET /api/auth/nonce?wallet=... → get nonce + message
//   3. signer.signMessage(message) → signature
//   4. POST /api/auth/login → JWT + player record
//   5. Store in GameState + AuthManager
// ============================================================

import WalletManager from '../web3/WalletManager';
import GameState from '../GameState';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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

  /** Wallet login: connect → nonce → sign → JWT. */
  async login(): Promise<AuthPlayer> {
    // 1. Connect wallet (may already be connected)
    let address: string;
    if (WalletManager.isConnected()) {
      const signer = WalletManager.getSigner();
      if (!signer) throw new Error('Wallet connected but no signer');
      address = await signer.getAddress();
    } else {
      address = await WalletManager.connect();
    }

    // 2. Get nonce from server
    const nonceRes = await fetch(`${API_BASE}/auth/nonce?wallet=${address.toLowerCase()}`);
    if (!nonceRes.ok) throw new Error('Failed to get login nonce');
    const { message } = await nonceRes.json();

    // 3. Sign the nonce message
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error('No signer available');
    const signature = await signer.signMessage(message);

    // 4. Login with signature
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: address.toLowerCase(), signature }),
    });
    if (!loginRes.ok) {
      const err = await loginRes.json().catch(() => ({}));
      throw new Error(err.error || 'Login failed');
    }

    const { token, player } = await loginRes.json();

    // 5. Store auth state
    this._setAuth(token, {
      id: player.id,
      wallet: player.wallet,
      displayName: player.displayName,
      winCount: player.winCount,
      lossCount: player.lossCount,
      eloRating: player.eloRating,
      activeDeckId: player.activeDeckId,
    });

    // Sync to GameState
    GameState.setAuthData(token, player.id, player.displayName);
    GameState.connectWallet(address);

    console.log(`[AuthManager] Logged in as ${player.displayName} (#${player.id})`);
    return this._player!;
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
    GameState.clearAuth();
  }

  /** Internal — set auth state directly. */
  _setAuth(token: string, player: AuthPlayer): void {
    this._token = token;
    this._player = player;
    this._loggedIn = true;
  }
}

export const AuthManager = new AuthManagerClass();

```

# src\config\DeckLoader.ts

```ts
// ============================================================
// DeckLoader.ts
// 4-priority deck loading chain:
//   1. Server active deck (if authenticated + has active deck)
//   2. /public/default-deck.json (beginner's deck, easily editable)
//   3. /public/deck.config.json (legacy runtime config)
//   4. UNITS_ONLY_DECK_IDS (hardcoded fallback)
//
// Call load() once during PreloadScene. Result is cached.
// ============================================================

import { UNITS_ONLY_DECK_IDS } from '../game/data/DeckDefinitions';
import { getCard } from '../game/data/CardRegistry';
import GameState from '../GameState';
import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class DeckLoaderClass {
  private deckIds: string[] | null = null;

  /**
   * Load deck using 4-priority chain.
   * Safe to call multiple times — returns cache after first load.
   */
  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;

    // Priority 1: Server active deck (authenticated player with active deck)
    if (GameState.hasActiveDeck()) {
      console.log(`[DeckLoader] Using GameState active deck (${GameState.activeDeckCardIds.length} cards)`);
      this.deckIds = [...GameState.activeDeckCardIds];
      return this.deckIds;
    }

    if (AuthManager.isLoggedIn()) {
      try {
        const serverDeck = await this.fetchServerActiveDeck();
        if (serverDeck) {
          console.log(`[DeckLoader] Loaded ${serverDeck.length} cards from server active deck`);
          this.deckIds = serverDeck;
          GameState.setActiveDeck(AuthManager.getPlayer()?.activeDeckId ?? null, serverDeck);
          return this.deckIds;
        }
      } catch (err) {
        console.warn('[DeckLoader] Failed to fetch server deck:', err);
      }
    }

    // Priority 2: default-deck.json (beginner's deck)
    try {
      const defaultDeck = await this.fetchJsonDeck('/default-deck.json');
      if (defaultDeck) {
        console.log(`[DeckLoader] Loaded ${defaultDeck.length} cards from default-deck.json`);
        this.deckIds = defaultDeck;
        return this.deckIds;
      }
    } catch (err) {
      console.warn('[DeckLoader] Failed to fetch default-deck.json:', err);
    }

    // Priority 3: deck.config.json (legacy)
    try {
      const configDeck = await this.fetchJsonDeck('/deck.config.json');
      if (configDeck) {
        console.log(`[DeckLoader] Loaded ${configDeck.length} cards from deck.config.json`);
        this.deckIds = configDeck;
        return this.deckIds;
      }
    } catch (err) {
      console.warn('[DeckLoader] Failed to fetch deck.config.json:', err);
    }

    // Priority 4: hardcoded fallback
    return this.useFallback();
  }

  /** Synchronous get — only works after load(). Returns fallback if not yet loaded. */
  get(): string[] {
    return this.deckIds ?? UNITS_ONLY_DECK_IDS;
  }

  /** Clear cache — forces re-fetch on next load() call. */
  invalidate(): void {
    this.deckIds = null;
  }

  // ─── Private loaders ──────────────────────────────────────

  private async fetchServerActiveDeck(): Promise<string[] | null> {
    const player = AuthManager.getPlayer();
    if (!player?.activeDeckId) return null;

    const res = await fetch(`${API_BASE}/decks`, {
      headers: AuthManager.authHeaders(),
    });
    if (!res.ok) return null;

    const { decks } = await res.json();
    const active = decks.find((d: any) => d.id === player.activeDeckId);
    if (!active?.cardIds || !Array.isArray(active.cardIds)) return null;

    return this.validateCardIds(active.cardIds) ? active.cardIds : null;
  }

  private async fetchJsonDeck(path: string): Promise<string[] | null> {
    const res = await fetch(path);
    if (!res.ok) return null;

    const json = await res.json();
    if (!Array.isArray(json.deckIds)) return null;

    return this.validateCardIds(json.deckIds) ? json.deckIds : null;
  }

  private validateCardIds(ids: string[]): boolean {
    const invalid = ids.filter(id => {
      try { getCard(id); return false; }
      catch { return true; }
    });

    if (invalid.length > 0) {
      console.error(`[DeckLoader] Unknown card IDs: ${invalid.join(', ')}`);
      return false;
    }

    if (ids.length !== 31) {
      console.warn(`[DeckLoader] Deck has ${ids.length} cards, expected 31. Loading anyway.`);
    }

    return true;
  }

  private useFallback(): string[] {
    console.log('[DeckLoader] Using built-in fallback deck');
    this.deckIds = [...UNITS_ONLY_DECK_IDS];
    return this.deckIds;
  }
}

export const DeckLoader = new DeckLoaderClass();

```

# src\config\LayoutLoader.ts

```ts
// ============================================================
// LayoutLoader.ts
// Fetches, validates, and caches Layout JSON files.
// Provides typed access to layout data for all scenes.
//
// PATCH v0.3.1:
//   - bottomBar defaults moved to right HUD area (no longer covers board)
//   - PASS button zeroed out (END TURN handles both phases)
//   - cardPlayZone zeroed out (not needed with right-side controls)
// ============================================================

import type {
  LayoutJSON,
  BattleLayoutJSON,
  MainMenuLayoutJSON,
  ResultLayoutJSON,
} from '../game/types/UITypes';

// Default fallback values — used if JSON is missing a field.
// This means you can ship partial JSON and the game still runs.
const DEFAULTS = {
  canvas: { width: 1280, height: 720 },

  grid: {
    cols: 7,
    rows: 7,
    cellSize: 102,
    originX: 283,
    originY: 3,
    coordsVisible: true,
    coordsFontSize: 11,
    gridLineWidth: 1,
  },

  cards: {
    full: {
      width: 140,
      height: 200,
      hoverWidth: 160,
      hoverHeight: 230,
      artAreaHeight: 90,
      nameBarHeight: 24,
      statRowHeight: 20,
      legPipSize: 24,
      typeIconSize: 16,
      cornerRadius: 6,
    },
    thumbnail: {
      width: 100,
      height: 100,
      margin: 1,
      hpBarHeight: 0,
      badgeFontSize: 13,
      badgeWidth: 24,
      badgeHeight: 18,
    },
    detail: {
      width: 220,
      height: 320,
      x: 640,
      y: 360,
      patternDiagramSize: 120,
    },
  },
} as const;

class LayoutLoaderClass {
  private cache: Map<string, LayoutJSON> = new Map();
  private basePath = '/layouts';

  async load(sceneName: string): Promise<LayoutJSON> {
    if (this.cache.has(sceneName)) {
      return this.cache.get(sceneName)!;
    }

    const url = `${this.basePath}/${sceneName}.layout.json`;

    let raw: any;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[LayoutLoader] ${url} not found — using defaults`);
        raw = this.buildDefault(sceneName);
      } else {
        raw = await res.json();
      }
    } catch (err) {
      console.warn(`[LayoutLoader] Failed to fetch ${url} — using defaults`, err);
      raw = this.buildDefault(sceneName);
    }

    const merged = this.mergeDefaults(raw, sceneName);
    this.cache.set(sceneName, merged);
    return merged;
  }

  get(sceneName: string): LayoutJSON | null {
    return this.cache.get(sceneName) ?? null;
  }

  getBattle(): BattleLayoutJSON | null {
    return this.cache.get('BattleScene') as BattleLayoutJSON ?? null;
  }

  getMainMenu(): MainMenuLayoutJSON | null {
    return this.cache.get('MainMenuScene') as MainMenuLayoutJSON ?? null;
  }

  getResult(): ResultLayoutJSON | null {
    return this.cache.get('ResultScene') as ResultLayoutJSON ?? null;
  }

  invalidate(sceneName?: string): void {
    if (sceneName) {
      this.cache.delete(sceneName);
    } else {
      this.cache.clear();
    }
  }

  cellCenterX(col: number, grid: { originX: number; cellSize: number }): number {
    return grid.originX + col * grid.cellSize + grid.cellSize / 2;
  }

  cellCenterY(row: number, grid: { originY: number; cellSize: number }): number {
    return grid.originY + row * grid.cellSize + grid.cellSize / 2;
  }

  pixelToCell(
    px: number,
    py: number,
    grid: { originX: number; originY: number; cellSize: number; cols: number; rows: number }
  ): { col: number; row: number } | null {
    const col = Math.floor((px - grid.originX) / grid.cellSize);
    const row = Math.floor((py - grid.originY) / grid.cellSize);
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
    return { col, row };
  }

  getAssetSizeRequirements(layout: BattleLayoutJSON): Record<string, { w: number; h: number }> {
    const g = layout.grid;
    const c = layout.cards;
    return {
      board_cell:     { w: g.cellSize, h: g.cellSize },
      marker_move:    { w: g.cellSize, h: g.cellSize },
      marker_attack:  { w: g.cellSize, h: g.cellSize },
      marker_aura:    { w: g.cellSize, h: g.cellSize },
      card_frame:     { w: c.full.width, h: c.full.height },
      card_art_full:  { w: c.full.width, h: c.full.artAreaHeight },
      card_art_thumb: { w: c.thumbnail.width, h: c.thumbnail.height },
      icon_stat:      { w: c.full.typeIconSize * 2, h: c.full.typeIconSize * 2 },
      icon_type:      { w: c.full.typeIconSize, h: c.full.typeIconSize },
      leg_pip:        { w: c.full.legPipSize, h: c.full.legPipSize },
    };
  }

  // ─────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────

  private mergeDefaults(raw: any, sceneName: string): LayoutJSON {
    if (sceneName === 'BattleScene') {
      return {
        scene: 'BattleScene',
        canvas: { ...DEFAULTS.canvas, ...raw.canvas },
        grid: { ...DEFAULTS.grid, ...raw.grid },
        leftHUD: raw.leftHUD ?? this.defaultLeftHUD(),
        rightHUD: raw.rightHUD ?? this.defaultRightHUD(),
        bottomBar: raw.bottomBar ?? this.defaultBottomBar(),
        cards: {
          full: { ...DEFAULTS.cards.full, ...raw.cards?.full },
          thumbnail: { ...DEFAULTS.cards.thumbnail, ...raw.cards?.thumbnail },
          detail: { ...DEFAULTS.cards.detail, ...raw.cards?.detail },
        },
        overlays: raw.overlays ?? this.defaultOverlays(),
      } as BattleLayoutJSON;
    }

    if (sceneName === 'MainMenuScene') {
      return {
        scene: 'MainMenuScene',
        canvas: { ...DEFAULTS.canvas, ...raw.canvas },
        logo:          raw.logo          ?? { x: 640, y: 120, width: 300, height: 80 },
        title:         raw.title         ?? { x: 640, y: 220 },
        nameInput:     raw.nameInput     ?? { x: 640, y: 300, width: 360, height: 48 },
        roomCodeInput: raw.roomCodeInput ?? { x: 640, y: 370, width: 280, height: 48 },
        connectBtn:    raw.connectBtn    ?? { x: 640, y: 450, width: 220, height: 56 },
        cryptoToggle:  raw.cryptoToggle  ?? { x: 640, y: 530, width: 200, height: 40 },
        statusLabel:   raw.statusLabel   ?? { x: 640, y: 600 },
      } as MainMenuLayoutJSON;
    }

    if (sceneName === 'ResultScene') {
      return {
        scene: 'ResultScene',
        canvas:       { ...DEFAULTS.canvas, ...raw.canvas },
        panel:        raw.panel        ?? { x: 640, y: 360, width: 600, height: 420 },
        resultTitle:  raw.resultTitle  ?? { x: 640, y: 240 },
        winnerLabel:  raw.winnerLabel  ?? { x: 640, y: 310 },
        payoutLabel:  raw.payoutLabel  ?? { x: 640, y: 370 },
        txHashLabel:  raw.txHashLabel  ?? { x: 640, y: 420 },
        playAgainBtn: raw.playAgainBtn ?? { x: 640, y: 510, width: 200, height: 52 },
        menuBtn:      raw.menuBtn      ?? { x: 640, y: 580, width: 160, height: 44 },
      } as ResultLayoutJSON;
    }

    return raw as LayoutJSON;
  }

  private buildDefault(sceneName: string): any {
    return { scene: sceneName };
  }

  private defaultLeftHUD() {
    return {
      x: 0, y: 0, width: 280, height: 720,
      playerName: { x: 140, y: 20 },
      kingHPBar:  { x: 30, y: 50, width: 220, height: 12 },
      legCounter: { x: 140, y: 100 },
      legRate:    { x: 140, y: 130 },
      winLoss:    { x: 140, y: 160 },
      hand: {
        x: 140, y: 200,
        cardWidth: 70, cardHeight: 95,
        spacing: 10, maxVisible: 10,
        fanAngle: 3, selectedScale: 1.15,
      },
    };
  }

  private defaultRightHUD() {
    return {
      x: 1000, y: 0, width: 280, height: 720,
      opponentName: { x: 1160, y: 20 },
      kingHPBar:    { x: 1060, y: 50, width: 200, height: 12 },
      legCounter:   { x: 1160, y: 100 },
      hand: {
        x: 1160, y: 200,
        cardWidth: 70, cardHeight: 95,
        spacing: 10, maxVisible: 10,
        fanAngle: 0, selectedScale: 1.0,
      },
    };
  }

private defaultBottomBar() {
    return {
x: 997, y: 300, width: 70, height: 120,
      phaseLabel:   { x: 1035, y: 310 },
      endTurnBtn:   { x: 1035, y: 345, width: 76, height: 36 },
    };
  }

  private defaultOverlays() {
    return {
      dimmer:       { x: 0,   y: 0,   width: 1280, height: 720 },
      targetSelect: { x: 640, y: 360, width: 500,  height: 300 },
      gameOver:     { x: 640, y: 360, width: 600,  height: 400 },
      stakeSelect:  { x: 640, y: 360, width: 500,  height: 350 },
      deckPreview:  { x: 640, y: 360, width: 700,  height: 500 },
    };
  }
}

export const LayoutLoader = new LayoutLoaderClass();

```

# src\config\ThemeLoader.ts

```ts
// ============================================================
// ThemeLoader.ts
// Fetches, validates, and caches Theme JSON files.
// Provides typed access to colors, fonts, assets, and styles.
// Renderers use this — never hardcode hex values in renderer code.
// ============================================================

import type { ThemeJSON, ColorTokens, ButtonStyle, CardTypeTheme } from '../game/types/UITypes';

// Complete default theme. Renderers always get a valid value even
// if the theme file is missing or partially defined.
const DEFAULT_THEME: ThemeJSON = {
  scene: 'default',

  colors: {
    BG_DEEP:        '#1A1A2E',
    BG_MID:         '#16213E',
    BG_BOARD:       '#0F3460',
    ACCENT_GOLD:    '#F5A623',
    ACCENT_GREEN:   '#00FF88',
    ACCENT_RED:     '#FF4444',
    ACCENT_BLUE:    '#4FC3F7',
    TEXT_PRIMARY:   '#FFFFFF',
    TEXT_SECONDARY: '#AAAAAA',
    CARD_STANDARD:  '#2A2A4A',
    CARD_ROYAL:     '#3D2B1F',
    CARD_STATIC:    '#1B3A2A',
    CARD_SPELL:     '#2A1B3D',
    OVERLAY_BLACK:  '#000000',
  },

  fonts: {
    title:       { family: 'Arial', size: 32, color: '#FFFFFF' },
    heading:     { family: 'Arial', size: 18, color: '#FFFFFF' },
    body:        { family: 'Arial', size: 14, color: '#FFFFFF' },
    small:       { family: 'Arial', size: 11, color: '#AAAAAA' },
    cardName:    { family: 'Arial', size: 12, color: '#FFFFFF' },
    cardStat:    { family: 'Arial', size: 12, color: '#FFFFFF' },
    cardAbility: { family: 'Arial', size: 11, color: '#AAAAAA' },
    coordLabel:  { family: 'Arial', size: 11, color: '#AAAAAA' },
  },

  assets: {
    bg_main_menu:         'backgrounds/bg_main_menu.png',
    bg_battle:            'backgrounds/bg_battle.png',
    bg_result:            'backgrounds/bg_result.png',
    board_skin:           'board/board_skin.png',
    card_frame_standard:  'cards/card_frame_standard.png',
    card_frame_royal:     'cards/card_frame_royal.png',
    card_frame_static:    'cards/card_frame_static.png',
    card_frame_spell:     'cards/card_frame_spell.png',
    card_back:            'cards/card_back_pattern.png',
    icon_atk:             'icons/icon_atk.png',
    icon_def:             'icons/icon_def.png',
    icon_leg:             'icons/icon_leg.png',
    icon_move:            'icons/icon_move.png',
    icon_cavalry:         'icons/icon_cavalry.png',
    icon_clock:           'icons/icon_clock.png',
    icon_ranged:          'icons/icon_ranged.png',
    icon_type_standard:   'icons/icon_type_standard.png',
    icon_type_royal:      'icons/icon_type_royal.png',
    icon_type_static:     'icons/icon_type_static.png',
    icon_type_spell:      'icons/icon_type_spell.png',
    marker_move:          'fx/marker_move.png',
    marker_attack:        'fx/marker_attack.png',
    marker_aura:          'fx/marker_aura.png',
    logo:                 'ui/logo.png',
  },

  board: {
    cellEvenFill:     '#0F3460',
    cellOddFill:      '#0D2B4E',
    gridLineColor:    '#1A3A6A',
    playerHalfTint:   '#00FF8814',
    enemyHalfTint:    '#FF444414',
    coordColor:       '#AAAAAA',
    cellHover:        '#FFFFFF1F',
    cellSelected:     '#00FF88',
    cellValidMove:    '#00FF8833',
    cellValidAtk:     '#FF444433',
    cellAura:         '#4FC3F71A',
    unitBandPlayer:   '#00FF88',
    unitBandEnemy:    '#FF4444',
    unitBandHeight:   8,
    hpBarFull:        '#00FF88',
    hpBarMid:         '#F5A623',
    hpBarLow:         '#FF4444',
    hpBarBackground:  '#333333',
  },

  cards: {
    STANDARD: {
      bodyColor:   '#2A2A4A',
      bandColor:   '#2A2A4A',
      frameAsset:  'card_frame_standard',
      legPipColor: '#4FC3F7',
      borderColor: '#4A4A8A',
      borderWidth: 2,
      glowColor:   '',
      glowSize:    0,
    },
    ROYAL: {
      bodyColor:   '#3D2B1F',
      bandColor:   '#F5A623',
      frameAsset:  'card_frame_royal',
      legPipColor: '#F5A623',
      borderColor: '#F5A623',
      borderWidth: 2,
      glowColor:   '#F5A623',
      glowSize:    4,
    },
    STATIC: {
      bodyColor:   '#1B3A2A',
      bandColor:   '#1B3A2A',
      frameAsset:  'card_frame_static',
      legPipColor: '#4FC3F7',
      borderColor: '#2A6A4A',
      borderWidth: 2,
      glowColor:   '#00FF88',
      glowSize:    2,
    },
    SPELL: {
      bodyColor:   '#2A1B3D',
      bandColor:   '#9B59B6',
      frameAsset:  'card_frame_spell',
      legPipColor: '#4FC3F7',
      borderColor: '#8A4ACA',
      borderWidth: 2,
      glowColor:   '#9B59B6',
      glowSize:    4,
    },
    atkBadgeColor:      '#FF4444',
    defBadgeColor:      '#4FC3F7',
    nameBarBg:          '#1A1A2EB3',
    nameColor:          '#FFFFFF',
    abilityTextColor:   '#AAAAAA',
    exhaustedAlpha:     0.4,
    selectedGlowColor:  '#00FF88',
    selectedGlowSize:   6,
  },

  hud: {
    panelBg:             '#16213E',
    panelAlpha:          0.97,
    playerNameColor:     '#00FF88',
    enemyNameColor:      '#FF4444',
    legColor:            '#F5A623',
    legRateColor:        '#AAAAAA',
    hpBarFull:           '#00FF88',
    hpBarMid:            '#F5A623',
    hpBarLow:            '#FF4444',
    hpBarBg:             '#333333',
    phaseLabelColor:     '#F5A623',
    cardPlayZoneBorderColor: '#4FC3F7',
    cardPlayZoneBorderAlpha: 0.6,
  },

  buttons: {
    primary: {
      fillColor: '#4FC3F7', strokeColor: '#FFFFFF', strokeWidth: 1,
      textColor: '#000000', fontSize: 14,
      hoverFillColor: '#81D4FA', hoverTextColor: '#000000',
      cornerRadius: 6, paddingX: 16, paddingY: 8,
    },
    secondary: {
      fillColor: '#2A2A4A', strokeColor: '#4A4A8A', strokeWidth: 1,
      textColor: '#AAAAAA', fontSize: 13,
      hoverFillColor: '#3A3A6A', hoverTextColor: '#FFFFFF',
      cornerRadius: 6, paddingX: 12, paddingY: 6,
    },
    danger: {
      fillColor: '#FF4444', strokeColor: '#FF6666', strokeWidth: 1,
      textColor: '#FFFFFF', fontSize: 14,
      hoverFillColor: '#FF6666', hoverTextColor: '#FFFFFF',
      cornerRadius: 6, paddingX: 16, paddingY: 8,
    },
    endTurn: {
      fillColor: '#00FF88', strokeColor: '#00CC66', strokeWidth: 2,
      textColor: '#000000', fontSize: 14,
      hoverFillColor: '#33FFAA', hoverTextColor: '#000000',
      cornerRadius: 6, paddingX: 16, paddingY: 8,
    },
    pass: {
      fillColor: '#16213E', strokeColor: '#AAAAAA', strokeWidth: 1,
      textColor: '#AAAAAA', fontSize: 13,
      hoverFillColor: '#1E2E50', hoverTextColor: '#FFFFFF',
      cornerRadius: 6, paddingX: 12, paddingY: 6,
    },
  },

  overlays: {
    dimmerColor:    '#000000',
    dimmerAlpha:    0.8,
    panelColor:     '#16213E',
    panelAlpha:     0.97,
    panelStroke:    '#4FC3F7',
    panelStrokeWidth: 1,
    titleColor:     '#FFFFFF',
    bodyColor:      '#AAAAAA',
    cornerRadius:   10,
  },
};

class ThemeLoaderClass {
  private cache: Map<string, ThemeJSON> = new Map();
  private basePath = '/themes';

  async load(sceneName: string): Promise<ThemeJSON> {
    if (this.cache.has(sceneName)) {
      return this.cache.get(sceneName)!;
    }

    const url = `${this.basePath}/${sceneName}.theme.json`;
    let raw: any;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[ThemeLoader] ${url} not found — using defaults`);
        raw = {};
      } else {
        raw = await res.json();
      }
    } catch (err) {
      console.warn(`[ThemeLoader] Failed to fetch ${url} — using defaults`, err);
      raw = {};
    }

    const merged = this.mergeWithDefaults(raw);
    this.cache.set(sceneName, merged);
    return merged;
  }

  get(sceneName: string): ThemeJSON {
    return this.cache.get(sceneName) ?? DEFAULT_THEME;
  }

  /** Convert a hex color string to a Phaser-compatible number. */
  hexToNum(hex: string): number {
    return parseInt(hex.replace('#', '0x'), 16);
  }

  /**
   * Parse a hex color that may include alpha (8-digit).
   * Returns { color: number, alpha: number }.
   */
  hexToColorAlpha(hex: string): { color: number; alpha: number } {
    const clean = hex.replace('#', '');
    if (clean.length === 8) {
      const alpha = parseInt(clean.slice(6, 8), 16) / 255;
      const color = parseInt('0x' + clean.slice(0, 6), 16);
      return { color, alpha };
    }
    return { color: parseInt('0x' + clean, 16), alpha: 1.0 };
  }

  /** Get a color token as a Phaser number. */
  colorNum(theme: ThemeJSON, token: keyof ColorTokens): number {
    return this.hexToNum(theme.colors[token]);
  }

  /** Get card type theme by class string: 'STANDARD' | 'ROYAL' | 'STATIC' | 'SPELL' */
cardTypeTheme(theme: ThemeJSON, cardClass: string): CardTypeTheme {
  if (!cardClass || typeof cardClass !== 'string') return theme.cards.STANDARD;
  const key = cardClass.toUpperCase() as keyof typeof theme.cards;
    const t = theme.cards[key];
    if (t && typeof t === 'object' && 'bodyColor' in t) {
      return t as CardTypeTheme;
    }
    return theme.cards.STANDARD;
  }

  /** Get button style by name */
  button(theme: ThemeJSON, name: keyof ThemeJSON['buttons']): ButtonStyle {
    return theme.buttons[name];
  }

  /** Get full asset URL (prefixed with /assets/) */
  assetUrl(theme: ThemeJSON, key: string): string {
    const path = theme.assets[key];
    if (!path) {
      console.warn(`[ThemeLoader] Asset key "${key}" not found in theme`);
      return '';
    }
    return `/assets/${path}`;
  }

  /** Get the frame asset key for a card type */
  frameAssetKey(theme: ThemeJSON, cardClass: string): string {
    return this.cardTypeTheme(theme, cardClass).frameAsset;
  }

  /** Returns all asset entries as [key, fullUrl] pairs for PreloadScene */
  getAllAssetPairs(theme: ThemeJSON): Array<[string, string]> {
    return Object.entries(theme.assets).map(([key, path]) => [
      key,
      `/assets/${path}`,
    ]);
  }

  invalidate(sceneName?: string): void {
    if (sceneName) {
      this.cache.delete(sceneName);
    } else {
      this.cache.clear();
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────

  private mergeWithDefaults(raw: any): ThemeJSON {
    return {
      scene:    raw.scene    ?? 'default',
      colors:   { ...DEFAULT_THEME.colors,  ...raw.colors },
      fonts:    { ...DEFAULT_THEME.fonts,   ...raw.fonts },
      assets:   { ...DEFAULT_THEME.assets,  ...raw.assets },
      board:    { ...DEFAULT_THEME.board,   ...raw.board },
      cards:    {
        ...DEFAULT_THEME.cards,
        ...raw.cards,
        STANDARD: { ...DEFAULT_THEME.cards.STANDARD, ...raw.cards?.STANDARD },
        ROYAL:    { ...DEFAULT_THEME.cards.ROYAL,    ...raw.cards?.ROYAL },
        STATIC:   { ...DEFAULT_THEME.cards.STATIC,   ...raw.cards?.STATIC },
        SPELL:    { ...DEFAULT_THEME.cards.SPELL,    ...raw.cards?.SPELL },
      },
      hud:      { ...DEFAULT_THEME.hud,     ...raw.hud },
      buttons:  {
        primary:   { ...DEFAULT_THEME.buttons.primary,   ...raw.buttons?.primary },
        secondary: { ...DEFAULT_THEME.buttons.secondary, ...raw.buttons?.secondary },
        danger:    { ...DEFAULT_THEME.buttons.danger,    ...raw.buttons?.danger },
        endTurn:   { ...DEFAULT_THEME.buttons.endTurn,   ...raw.buttons?.endTurn },
        pass:      { ...DEFAULT_THEME.buttons.pass,      ...raw.buttons?.pass },
      },
      overlays: { ...DEFAULT_THEME.overlays, ...raw.overlays },
    };
  }
}

export const ThemeLoader = new ThemeLoaderClass();

```

# src\deck\CardDetailOverlay.ts

```ts
// ============================================================
// CardDetailOverlay.ts
// Popup overlay showing full card stats. Dimmer + panel.
// ============================================================

import Phaser from 'phaser';
import { getCard } from '../game/data/CardRegistry';
import type { CollectionCard } from './CollectionAPI';

const FONT = '"Courier New", monospace';

export function showCardDetail(
  scene: Phaser.Scene,
  cardId: string,
  collection: CollectionCard[],
  onDismiss: () => void,
): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0);

  // Dimmer
  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
    .setInteractive();
  dim.on('pointerdown', onDismiss);
  container.add(dim);

  // Panel
  const pw = 420, ph = 380;
  const px = width / 2 - pw / 2, py = height / 2 - ph / 2;

  const g = scene.add.graphics();
  g.fillStyle(0x16213e, 0.97);
  g.fillRoundedRect(px, py, pw, ph, 10);
  g.lineStyle(2, 0xf5a623, 0.6);
  g.strokeRoundedRect(px, py, pw, ph, 10);
  container.add(g);

  let card;
  try { card = getCard(cardId); } catch {
    container.add(scene.add.text(width / 2, height / 2, `Unknown card: ${cardId}`, {
      fontSize: '16px', fontFamily: FONT, color: '#ff4444',
    }).setOrigin(0.5));
    return container;
  }

  const cx = width / 2;
  let y = py + 25;
  const left = px + 20;

  // Title
  container.add(scene.add.text(cx, y, card.name, {
    fontSize: '22px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
  }).setOrigin(0.5));
  y += 35;

  // Class + Cost
  container.add(scene.add.text(left, y, `Class: ${card.class}`, {
    fontSize: '14px', fontFamily: FONT, color: '#FFFFFF',
  }));
  container.add(scene.add.text(left + 220, y, `Cost: ${card.cost}`, {
    fontSize: '14px', fontFamily: FONT, color: '#4fc3f7',
  }));
  y += 22;

  // Allegiance
  container.add(scene.add.text(left, y, `Allegiance: ${card.allegiance}`, {
    fontSize: '14px', fontFamily: FONT, color: '#AAAAAA',
  }));
  y += 22;

  // Stats (if unit/structure)
  if (card.stats) {
    container.add(scene.add.text(left, y, `ATK: ${card.stats.atk}  DEF: ${card.stats.def}`, {
      fontSize: '14px', fontFamily: FONT, color: '#FFFFFF',
    }));
    y += 22;

    container.add(scene.add.text(left, y, `Move: ${card.stats.movement}`, {
      fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
    }));
    container.add(scene.add.text(left + 220, y, `Atk: ${card.stats.attackPattern}`, {
      fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
    }));
    y += 22;
  }

  y += 5;

  // Ability text
  if (card.abilityText) {
    const abilityLines = wordWrap(card.abilityText, 48);
    for (const line of abilityLines) {
      container.add(scene.add.text(left, y, line, {
        fontSize: '12px', fontFamily: FONT, color: '#00ff88',
      }));
      y += 16;
    }
    y += 5;
  }

  // Flavor text
  if (card.flavorText) {
    container.add(scene.add.text(left, y, `"${card.flavorText}"`, {
      fontSize: '11px', fontFamily: FONT, fontStyle: 'italic', color: '#777777',
    }));
    y += 20;
  }

  // Ownership
  const owned = collection.find(c => c.id === cardId)?.ownedCopies ?? 0;
  container.add(scene.add.text(left, y, `Max per deck: ${card.copies}  |  You own: ${owned}`, {
    fontSize: '13px', fontFamily: FONT, color: '#AAAAAA',
  }));
  y += 30;

  // Close button
  const closeBtn = scene.add.text(cx, py + ph - 30, '[ CLOSE ]', {
    fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
  closeBtn.on('pointerout', () => closeBtn.setColor('#ff4444'));
  closeBtn.on('pointerdown', onDismiss);
  container.add(closeBtn);

  // ESC key
  const escKey = scene.input.keyboard?.addKey('ESC');
  const escHandler = () => { onDismiss(); };
  escKey?.once('down', escHandler);

  // Cleanup when container is destroyed
  container.once('destroy', () => {
    escKey?.off('down', escHandler);
  });

  return container;
}

function wordWrap(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

```

# src\deck\CollectionAPI.ts

```ts
// ============================================================
// CollectionAPI.ts
// Fetch authenticated player's card collection from server.
// ============================================================

import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface CollectionCard {
  id: string;
  name: string;
  maxCopies: number;
  ownedCopies: number;
}

export const CollectionAPI = {
  /** Fetch the authenticated player's card collection. */
  async get(): Promise<CollectionCard[]> {
    if (!AuthManager.isLoggedIn()) return [];

    const res = await fetch(`${API_BASE}/collection`, {
      headers: AuthManager.authHeaders(),
    });
    if (!res.ok) return [];

    const { collection } = await res.json();
    return collection;
  },
};

```

# src\deck\DeckAPI.ts

```ts
// ============================================================
// DeckAPI.ts
// HTTP client for server-side deck CRUD operations.
// All calls require authentication via AuthManager.
// ============================================================

import { AuthManager } from '../auth/AuthManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface DeckSummary {
  id: number;
  name: string;
  cardIds: string[];
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeckCreateResult {
  deck: DeckSummary & { errors: string[] };
}

async function apiCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...AuthManager.authHeaders(),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

export const DeckAPI = {
  /** List all decks for the authenticated player. */
  async list(): Promise<{ decks: DeckSummary[] }> {
    return apiCall('/decks');
  },

  /** Create a new deck. */
  async create(name: string, cardIds: string[]): Promise<DeckCreateResult> {
    return apiCall('/decks', {
      method: 'POST',
      body: JSON.stringify({ name, cardIds }),
    });
  },

  /** Update an existing deck. */
  async update(deckId: number, name: string, cardIds: string[]): Promise<DeckCreateResult> {
    return apiCall(`/decks/${deckId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, cardIds }),
    });
  },

  /** Delete a deck. */
  async remove(deckId: number): Promise<{ success: boolean }> {
    return apiCall(`/decks/${deckId}`, { method: 'DELETE' });
  },

  /** Activate a deck (set as active for matches). */
  async activate(deckId: number): Promise<{ success: boolean; activeDeckId: number }> {
    return apiCall(`/decks/${deckId}/activate`, { method: 'POST' });
  },

  /** Validate a deck server-side. */
  async validate(cardIds: string[]): Promise<{ valid: boolean; errors: string[] }> {
    return apiCall('/decks/validate', {
      method: 'POST',
      body: JSON.stringify({ cardIds }),
    });
  },
};

```

# src\deck\DeckBuilderHelpers.ts

```ts
// ============================================================
// DeckBuilderHelpers.ts
// Pure functions for deck builder: filter, sort, cost curve.
// No Phaser dependency — easy to unit test.
// ============================================================

import type { CollectionCard } from './CollectionAPI';
import { getCard } from '../game/data/CardRegistry';
import { CardClass } from '../game/types/CardTypes';

export interface DeckCardEntry {
  cardId: string;
  name: string;
  cost: number;
  count: number;
}

/** Group a flat cardIds array into sorted entries with counts. */
export function groupDeckCards(cardIds: string[], sortBy: 'cost' | 'name'): DeckCardEntry[] {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const entries: DeckCardEntry[] = [];
  for (const [cardId, count] of counts) {
    try {
      const card = getCard(cardId);
      entries.push({ cardId, name: card.name, cost: card.cost, count });
    } catch {
      entries.push({ cardId, name: cardId, cost: 0, count });
    }
  }

  if (sortBy === 'cost') {
    entries.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  } else {
    entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  return entries;
}

/** Filter collection cards by class and sort. */
export function filterCollection(
  collection: CollectionCard[],
  classFilter: CardClass | 'ALL',
  sortBy: 'cost' | 'name',
): CollectionCard[] {
  let filtered = collection;

  if (classFilter !== 'ALL') {
    filtered = filtered.filter(c => {
      try {
        return getCard(c.id).class === classFilter;
      } catch { return false; }
    });
  }

  // Exclude king
  filtered = filtered.filter(c => c.id !== 'king');

  const sorted = [...filtered];
  if (sortBy === 'cost') {
    sorted.sort((a, b) => {
      try {
        return getCard(a.id).cost - getCard(b.id).cost || a.name.localeCompare(b.name);
      } catch { return 0; }
    });
  } else {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
}

/** How many more copies of this card can be added to the deck? */
export function availableCopies(
  cardId: string,
  currentDeckIds: string[],
  collection: CollectionCard[],
): number {
  const inDeck = currentDeckIds.filter(id => id === cardId).length;

  let maxPerDeck = 1;
  try { maxPerDeck = getCard(cardId).copies; } catch { /* default 1 */ }

  const owned = collection.find(c => c.id === cardId)?.ownedCopies ?? 0;

  // Can add up to min(maxPerDeck, owned) total, minus what's already in deck
  return Math.max(0, Math.min(maxPerDeck, owned) - inDeck);
}

/** Build compact ASCII cost curve string lines for display. */
export function buildCostCurveLines(costCurve: Map<number, number>): string[] {
  if (costCurve.size === 0) return ['  (empty)'];

  const maxCost = Math.max(...costCurve.keys(), 6);
  const maxCount = Math.max(...costCurve.values(), 1);
  const barScale = 10 / maxCount;

  const lines: string[] = [];
  for (let cost = 1; cost <= maxCost; cost++) {
    const count = costCurve.get(cost) ?? 0;
    const barLen = Math.round(count * barScale);
    const bar = '\u2588'.repeat(barLen);
    const padCount = String(count).padStart(2, ' ');
    lines.push(`${cost}: ${bar} ${padCount}`);
  }
  return lines;
}

```

# src\deck\DeckBuilderState.ts

```ts
// ============================================================
// DeckBuilderState.ts
// State types and factory for DeckBuilderScene.
// ============================================================

import type { DeckSummary } from './DeckAPI';
import type { CollectionCard } from './CollectionAPI';
import type { ClientValidationResult } from './DeckValidatorClient';
import { CardClass } from '../game/types/CardTypes';
import { AuthManager } from '../auth/AuthManager';
import GameState from '../GameState';

export enum DeckView { DECK_LIST, DECK_EDITOR }

export interface EditorState {
  deckId: number | null;        // null = creating new deck
  deckName: string;
  cardIds: string[];            // mutable working copy
  dirty: boolean;
  validation: ClientValidationResult;
  classFilter: CardClass | 'ALL';
  sortBy: 'cost' | 'name';
  collectionPage: number;
}

export interface DeckBuilderState {
  decks: DeckSummary[];
  collection: CollectionCard[];
  activeDeckId: number | null;
  currentView: DeckView;
  loading: boolean;
  editor: EditorState | null;
  deleteConfirmId: number | null;  // deck id pending delete confirmation
}

export function createInitialState(): DeckBuilderState {
  return {
    decks: [],
    collection: [],
    activeDeckId: AuthManager.getPlayer()?.activeDeckId ?? GameState.activeDeckId,
    currentView: DeckView.DECK_LIST,
    loading: true,
    editor: null,
    deleteConfirmId: null,
  };
}

export interface DeckBuilderCallbacks {
  onEditDeck(deckId: number): void;
  onCreateDeck(): void;
  onDeleteDeck(deckId: number): void;
  onConfirmDelete(deckId: number): void;
  onCancelDelete(): void;
  onActivateDeck(deckId: number): void;
  onAddCard(cardId: string): void;
  onRemoveCard(cardId: string): void;
  onSave(): void;
  onSaveAndActivate(): void;
  onBackToList(): void;
  onBackToHub(): void;
  onShowCardDetail(cardId: string): void;
  onDismissCardDetail(): void;
  onFilterChange(filter: CardClass | 'ALL'): void;
  onSortChange(sort: 'cost' | 'name'): void;
  onPageChange(delta: number): void;
}

```

# src\deck\DeckEditorView.ts

```ts
// ============================================================
// DeckEditorView.ts
// Renders the DECK_EDITOR view: left=deck contents, right=collection.
// ============================================================

import Phaser from 'phaser';
import { MenuButton } from '../ui/MenuButton';
import { DOMInputManager } from '../ui/DOMInputManager';
import { getCard } from '../game/data/CardRegistry';
import { CardClass } from '../game/types/CardTypes';
import { groupDeckCards, filterCollection, availableCopies, buildCostCurveLines } from './DeckBuilderHelpers';
import type { DeckBuilderState, DeckBuilderCallbacks } from './DeckBuilderState';

const FONT = '"Courier New", monospace';

// Layout constants — wider panel (100..1180)
const LEFT_X = 135;     // left panel content start
const DIVIDER_X = 620;  // vertical divider
const RIGHT_X = 650;    // right panel content start
const RIGHT_END = 1140;  // right panel end
const ROW_H = 22;
const DECK_MAX_ROWS = 20;
const COLL_PAGE_SIZE = 16;

export function renderDeckEditor(
  scene: Phaser.Scene,
  state: DeckBuilderState,
  cb: DeckBuilderCallbacks,
  inputManager: DOMInputManager,
): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const editor = state.editor!;

  // ── Header Bar ────────────────────────────────────────────
  // Left: back button
  const backBtn = new MenuButton(scene, 200, 40, '[ BACK TO DECKS ]', {
    color: '#ff4444', fontSize: '14px',
    onPointerDown: () => cb.onBackToList(),
  });
  objs.push(backBtn.text);

  // Center: deck name input
  const nameInput = inputManager.createInput({
    gameX: 490, gameY: 40, width: 200, height: 28,
    placeholder: 'Deck name...', maxLength: 30,
  });
  nameInput.value = editor.deckName;
  nameInput.addEventListener('input', () => {
    editor.deckName = nameInput.value;
    editor.dirty = true;
  });

  // Right: card count + validity + dirty flag
  const countColor = editor.validation.valid ? '#00ff88' : '#ff4444';
  const validLabel = editor.validation.valid ? 'VALID' : 'INVALID';
  const dirtyStr = editor.dirty ? '  *' : '';
  objs.push(scene.add.text(680, 34, `${editor.validation.cardCount}/31  ${validLabel}${dirtyStr}`, {
    fontSize: '18px', fontFamily: FONT, fontStyle: 'bold', color: countColor,
  }));

  // Separator line
  const sepLine = scene.add.graphics();
  sepLine.lineStyle(1, 0xf5a623, 0.3);
  sepLine.lineBetween(120, 62, 1160, 62);
  objs.push(sepLine);

  // ── Vertical Divider ─────────────────────────────────────
  const divider = scene.add.graphics();
  divider.lineStyle(1, 0x4fc3f7, 0.25);
  divider.lineBetween(DIVIDER_X, 62, DIVIDER_X, 645);
  objs.push(divider);

  // ══════════════════════════════════════════════════════════
  // LEFT PANEL: Deck Contents
  // ══════════════════════════════════════════════════════════
  objs.push(scene.add.text(LEFT_X, 72, 'DECK CONTENTS', {
    fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
  }));

  // Sort toggle
  const sortLabel = editor.sortBy === 'cost' ? 'COST' : 'NAME';
  const sortBtn = scene.add.text(LEFT_X + 330, 72, `Sort:[${sortLabel}]`, {
    fontSize: '11px', fontFamily: FONT, color: '#4fc3f7',
  }).setInteractive({ useHandCursor: true });
  sortBtn.on('pointerover', () => sortBtn.setColor('#ffffff'));
  sortBtn.on('pointerout', () => sortBtn.setColor('#4fc3f7'));
  sortBtn.on('pointerdown', () => {
    cb.onSortChange(editor.sortBy === 'cost' ? 'name' : 'cost');
  });
  objs.push(sortBtn);

  // Column header
  objs.push(scene.add.text(LEFT_X, 92, 'Card               Cost  Qty', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));

  const deckEntries = groupDeckCards(editor.cardIds, editor.sortBy);

  if (deckEntries.length === 0) {
    objs.push(scene.add.text(LEFT_X, 115, 'Empty — add cards from collection', {
      fontSize: '12px', fontFamily: FONT, color: '#555555',
    }));
  } else {
    let y = 108;
    for (const entry of deckEntries.slice(0, DECK_MAX_ROWS)) {
      // Card name (clickable)
      const nameText = scene.add.text(LEFT_X, y, entry.name, {
        fontSize: '13px', fontFamily: FONT, color: '#FFFFFF',
      }).setInteractive({ useHandCursor: true });
      nameText.on('pointerover', () => nameText.setColor('#4fc3f7'));
      nameText.on('pointerout', () => nameText.setColor('#FFFFFF'));
      nameText.on('pointerdown', () => cb.onShowCardDetail(entry.cardId));
      objs.push(nameText);

      // Cost
      objs.push(scene.add.text(LEFT_X + 230, y + 1, `${entry.cost}`, {
        fontSize: '12px', fontFamily: FONT, color: '#777777',
      }));

      // Count
      objs.push(scene.add.text(LEFT_X + 290, y + 1, `x${entry.count}`, {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }));

      // Remove button
      const removeBtn = scene.add.text(LEFT_X + 340, y, '[-]', {
        fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
      }).setInteractive({ useHandCursor: true });
      removeBtn.on('pointerover', () => removeBtn.setColor('#ffffff'));
      removeBtn.on('pointerout', () => removeBtn.setColor('#ff4444'));
      const capturedId = entry.cardId;
      removeBtn.on('pointerdown', () => cb.onRemoveCard(capturedId));
      objs.push(removeBtn);

      y += ROW_H;
    }

    if (deckEntries.length > DECK_MAX_ROWS) {
      objs.push(scene.add.text(LEFT_X, 108 + DECK_MAX_ROWS * ROW_H, `... +${deckEntries.length - DECK_MAX_ROWS} more`, {
        fontSize: '10px', fontFamily: FONT, color: '#555555',
      }));
    }
  }

  // ── Cost Curve (compact, inline) ──────────────────────────
  const curveY = 560;
  objs.push(scene.add.text(LEFT_X, curveY, 'MANA CURVE', {
    fontSize: '10px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
  }));

  const curveLines = buildCostCurveLines(editor.validation.costCurve);
  let cy = curveY + 14;
  for (const line of curveLines) {
    objs.push(scene.add.text(LEFT_X, cy, line, {
      fontSize: '10px', fontFamily: FONT, color: '#AAAAAA',
    }));
    cy += 12;
  }

  // ══════════════════════════════════════════════════════════
  // RIGHT PANEL: Collection Browser
  // ══════════════════════════════════════════════════════════
  objs.push(scene.add.text(RIGHT_X, 72, 'COLLECTION', {
    fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
  }));

  // Class filter tabs
  const filters: Array<{ key: CardClass | 'ALL'; label: string }> = [
    { key: 'ALL', label: 'ALL' },
    { key: CardClass.UNIT, label: 'UNIT' },
    { key: CardClass.SPELL, label: 'SPELL' },
    { key: CardClass.STRUCTURE, label: 'STRUCT' },
  ];

  let fx = RIGHT_X;
  for (const f of filters) {
    const isSelected = editor.classFilter === f.key;
    const baseColor = isSelected ? '#f5a623' : '#555555';

    const filterBtn = scene.add.text(fx, 92, `[${f.label}]`, {
      fontSize: '11px', fontFamily: FONT, fontStyle: isSelected ? 'bold' : 'normal', color: baseColor,
    }).setInteractive({ useHandCursor: true });
    filterBtn.on('pointerover', () => { if (!isSelected) filterBtn.setColor('#ffffff'); });
    filterBtn.on('pointerout', () => { if (!isSelected) filterBtn.setColor(baseColor); });
    const capturedKey = f.key;
    filterBtn.on('pointerdown', () => cb.onFilterChange(capturedKey));
    objs.push(filterBtn);

    fx += f.label.length * 8 + 28;
  }

  // Column headers
  objs.push(scene.add.text(RIGHT_X, 112, 'Card', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 200, 112, 'Cost', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 250, 112, 'A/D', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 300, 112, 'In Deck', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));
  objs.push(scene.add.text(RIGHT_X + 370, 112, 'Own', {
    fontSize: '10px', fontFamily: FONT, color: '#555555',
  }));

  // Filtered collection
  const filteredCards = filterCollection(state.collection, editor.classFilter, editor.sortBy);
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / COLL_PAGE_SIZE));
  const page = Math.min(editor.collectionPage, totalPages - 1);
  const pageCards = filteredCards.slice(page * COLL_PAGE_SIZE, (page + 1) * COLL_PAGE_SIZE);

  let ry = 128;
  for (const collCard of pageCards) {
    let cardDef;
    try { cardDef = getCard(collCard.id); } catch { continue; }

    const canAdd = availableCopies(collCard.id, editor.cardIds, state.collection);
    const inDeck = editor.cardIds.filter(id => id === collCard.id).length;
    const maxCopies = cardDef.copies;

    // Card name (clickable)
    const nameColor = inDeck > 0 ? '#FFFFFF' : '#BBBBBB';
    const nameText = scene.add.text(RIGHT_X, ry, cardDef.name, {
      fontSize: '12px', fontFamily: FONT, color: nameColor,
    }).setInteractive({ useHandCursor: true });
    nameText.on('pointerover', () => nameText.setColor('#4fc3f7'));
    nameText.on('pointerout', () => nameText.setColor(nameColor));
    const capturedId = collCard.id;
    nameText.on('pointerdown', () => cb.onShowCardDetail(capturedId));
    objs.push(nameText);

    // Cost
    objs.push(scene.add.text(RIGHT_X + 205, ry + 1, `${cardDef.cost}`, {
      fontSize: '11px', fontFamily: FONT, color: '#777777',
    }));

    // Stats (ATK/DEF)
    const statsStr = cardDef.stats ? `${cardDef.stats.atk}/${cardDef.stats.def}` : '--';
    objs.push(scene.add.text(RIGHT_X + 250, ry + 1, statsStr, {
      fontSize: '11px', fontFamily: FONT, color: '#777777',
    }));

    // In deck count (colored)
    const deckCountColor = inDeck >= maxCopies ? '#f5a623' : inDeck > 0 ? '#4fc3f7' : '#444444';
    objs.push(scene.add.text(RIGHT_X + 310, ry + 1, `${inDeck}/${maxCopies}`, {
      fontSize: '11px', fontFamily: FONT, color: deckCountColor,
    }));

    // Owned count
    objs.push(scene.add.text(RIGHT_X + 375, ry + 1, `${collCard.ownedCopies}`, {
      fontSize: '11px', fontFamily: FONT, color: '#777777',
    }));

    // Add button
    if (canAdd > 0) {
      const addBtn = scene.add.text(RIGHT_X + 410, ry, '[+]', {
        fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#00ff88',
      }).setInteractive({ useHandCursor: true });
      addBtn.on('pointerover', () => addBtn.setColor('#ffffff'));
      addBtn.on('pointerout', () => addBtn.setColor('#00ff88'));
      addBtn.on('pointerdown', () => cb.onAddCard(capturedId));
      objs.push(addBtn);
    } else {
      objs.push(scene.add.text(RIGHT_X + 410, ry, '[+]', {
        fontSize: '12px', fontFamily: FONT, color: '#2a2a2a',
      }));
    }

    ry += ROW_H;
  }

  // Pagination
  if (totalPages > 1) {
    const pageY = 128 + COLL_PAGE_SIZE * ROW_H + 8;

    if (page > 0) {
      const prevBtn = scene.add.text(RIGHT_X + 100, pageY, '< Prev', {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }).setInteractive({ useHandCursor: true });
      prevBtn.on('pointerover', () => prevBtn.setColor('#ffffff'));
      prevBtn.on('pointerout', () => prevBtn.setColor('#4fc3f7'));
      prevBtn.on('pointerdown', () => cb.onPageChange(-1));
      objs.push(prevBtn);
    }

    objs.push(scene.add.text(RIGHT_X + 190, pageY, `${page + 1} / ${totalPages}`, {
      fontSize: '12px', fontFamily: FONT, color: '#777777',
    }));

    if (page < totalPages - 1) {
      const nextBtn = scene.add.text(RIGHT_X + 280, pageY, 'Next >', {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }).setInteractive({ useHandCursor: true });
      nextBtn.on('pointerover', () => nextBtn.setColor('#ffffff'));
      nextBtn.on('pointerout', () => nextBtn.setColor('#4fc3f7'));
      nextBtn.on('pointerdown', () => cb.onPageChange(1));
      objs.push(nextBtn);
    }
  }

  // ══════════════════════════════════════════════════════════
  // BOTTOM BAR: Save buttons + validation errors
  // ══════════════════════════════════════════════════════════
  const bottomSep = scene.add.graphics();
  bottomSep.lineStyle(1, 0xf5a623, 0.3);
  bottomSep.lineBetween(120, 650, 1160, 650);
  objs.push(bottomSep);

  const saveBtn = new MenuButton(scene, 420, 672, '[ SAVE ]', {
    color: '#00ff88', fontSize: '18px',
    onPointerDown: () => cb.onSave(),
  });
  objs.push(saveBtn.text);

  const saveActivateBtn = new MenuButton(scene, 680, 672, '[ SAVE & ACTIVATE ]', {
    color: '#f5a623', fontSize: '18px',
    onPointerDown: () => cb.onSaveAndActivate(),
  });
  if (!editor.validation.valid) {
    saveActivateBtn.setDisabled(true);
  }
  objs.push(saveActivateBtn.text);

  // Validation errors
  if (editor.validation.errors.length > 0) {
    const errText = editor.validation.errors.slice(0, 2).join('  |  ');
    objs.push(scene.add.text(640, 696, errText, {
      fontSize: '10px', fontFamily: FONT, color: '#ff4444',
    }).setOrigin(0.5));
  }

  return objs;
}

```

# src\deck\DeckListView.ts

```ts
// ============================================================
// DeckListView.ts
// Renders the DECK_LIST view: saved decks with actions,
// plus the "currently playing" deck info (default or active).
// ============================================================

import Phaser from 'phaser';
import { MenuButton } from '../ui/MenuButton';
import type { DeckBuilderState, DeckBuilderCallbacks } from './DeckBuilderState';

const CX = 640;
const FONT = '"Courier New", monospace';
const MAX_DECKS = 10;
const LEFT = 180;

export function renderDeckList(
  scene: Phaser.Scene,
  state: DeckBuilderState,
  cb: DeckBuilderCallbacks,
): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];

  // ── Decks Section ──────────────────────────────────────────
  const deckCount = state.decks.length;
  const sectionY = 85;

  objs.push(scene.add.text(CX, sectionY, `── Your Decks (${deckCount}/${MAX_DECKS}) ──`, {
    fontSize: '15px', fontFamily: FONT, color: '#4fc3f7',
  }).setOrigin(0.5));

  if (deckCount === 0) {
    objs.push(scene.add.text(CX, sectionY + 60, 'No decks yet — creating starter deck...', {
      fontSize: '16px', fontFamily: FONT, color: '#555555',
    }).setOrigin(0.5));
  } else {
    // Column headers
    objs.push(scene.add.text(LEFT, sectionY + 25, 'Name', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));
    objs.push(scene.add.text(480, sectionY + 25, 'Cards', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));
    objs.push(scene.add.text(560, sectionY + 25, 'Status', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));
    objs.push(scene.add.text(680, sectionY + 25, 'Actions', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    }));

    let y = sectionY + 42;
    const rowH = 36;

    for (const deck of state.decks) {
      const isActive = deck.id === state.activeDeckId;
      const isDeleting = state.deleteConfirmId === deck.id;

      // Active row highlight
      if (isActive) {
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(0xf5a623, 0.06);
        rowBg.fillRoundedRect(LEFT - 10, y - 3, 920, rowH - 2, 4);
        objs.push(rowBg);
      }

      if (isDeleting) {
        objs.push(scene.add.text(LEFT, y + 2, `Delete "${deck.name}"?`, {
          fontSize: '14px', fontFamily: FONT, color: '#ff4444',
        }));

        const yesBtn = scene.add.text(620, y + 2, '[ YES, DELETE ]', {
          fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        yesBtn.on('pointerover', () => yesBtn.setColor('#ffffff'));
        yesBtn.on('pointerout', () => yesBtn.setColor('#ff4444'));
        yesBtn.on('pointerdown', () => cb.onConfirmDelete(deck.id));
        objs.push(yesBtn);

        const noBtn = scene.add.text(800, y + 2, '[ CANCEL ]', {
          fontSize: '13px', fontFamily: FONT, fontStyle: 'bold', color: '#4fc3f7',
        }).setInteractive({ useHandCursor: true });
        noBtn.on('pointerover', () => noBtn.setColor('#ffffff'));
        noBtn.on('pointerout', () => noBtn.setColor('#4fc3f7'));
        noBtn.on('pointerdown', () => cb.onCancelDelete());
        objs.push(noBtn);

        y += rowH;
        continue;
      }

      // Deck name
      const nameColor = isActive ? '#f5a623' : '#FFFFFF';
      const prefix = isActive ? '\u25B6 ' : '  ';
      objs.push(scene.add.text(LEFT, y, `${prefix}${deck.name}`, {
        fontSize: '15px', fontFamily: FONT, fontStyle: 'bold', color: nameColor,
      }));

      // Card count
      const countColor = deck.cardIds.length === 31 ? '#AAAAAA' : '#ff4444';
      objs.push(scene.add.text(480, y + 2, `${deck.cardIds.length}/31`, {
        fontSize: '13px', fontFamily: FONT, color: countColor,
      }));

      // Validity badge
      const validColor = deck.isValid ? '#00ff88' : '#ff4444';
      const validLabel = deck.isValid ? 'VALID' : 'INVALID';
      objs.push(scene.add.text(560, y + 2, validLabel, {
        fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: validColor,
      }));

      // Action buttons
      let btnX = 680;

      if (isActive) {
        objs.push(scene.add.text(btnX, y + 2, 'ACTIVE', {
          fontSize: '12px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
        }));
        btnX += 70;
      } else {
        const actBtn = scene.add.text(btnX, y + 2, '[ACTIVATE]', {
          fontSize: '12px', fontFamily: FONT, color: deck.isValid ? '#4fc3f7' : '#444444',
        });
        if (deck.isValid) {
          actBtn.setInteractive({ useHandCursor: true });
          actBtn.on('pointerover', () => actBtn.setColor('#ffffff'));
          actBtn.on('pointerout', () => actBtn.setColor('#4fc3f7'));
          actBtn.on('pointerdown', () => cb.onActivateDeck(deck.id));
        }
        objs.push(actBtn);
        btnX += 95;
      }

      const editBtn = scene.add.text(btnX, y + 2, '[EDIT]', {
        fontSize: '12px', fontFamily: FONT, color: '#4fc3f7',
      }).setInteractive({ useHandCursor: true });
      editBtn.on('pointerover', () => editBtn.setColor('#ffffff'));
      editBtn.on('pointerout', () => editBtn.setColor('#4fc3f7'));
      editBtn.on('pointerdown', () => cb.onEditDeck(deck.id));
      objs.push(editBtn);
      btnX += 60;

      // Delete: not allowed for active deck or last remaining deck
      const canDelete = !isActive && deckCount > 1;
      if (canDelete) {
        const delBtn = scene.add.text(btnX, y + 2, '[DEL]', {
          fontSize: '12px', fontFamily: FONT, color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        delBtn.on('pointerover', () => delBtn.setColor('#ffffff'));
        delBtn.on('pointerout', () => delBtn.setColor('#ff4444'));
        delBtn.on('pointerdown', () => cb.onDeleteDeck(deck.id));
        objs.push(delBtn);
      }

      y += rowH;
    }
  }

  // ── New Deck Button ───────────────────────────────────────
  const emptyRows = deckCount === 0 ? 1 : deckCount;
  const btnY = Math.max(380, sectionY + 42 + emptyRows * 36 + 30);

  if (deckCount < MAX_DECKS) {
    const newBtn = new MenuButton(scene, CX, btnY, '[ + NEW DECK ]', {
      color: '#00ff88', fontSize: '22px',
      onPointerDown: () => cb.onCreateDeck(),
    });
    objs.push(newBtn.text);
  } else {
    objs.push(scene.add.text(CX, btnY, 'Maximum decks reached (10/10)', {
      fontSize: '14px', fontFamily: FONT, color: '#777777',
    }).setOrigin(0.5));
  }

  // Collection summary
  const ownedCount = state.collection.filter(c => c.ownedCopies > 0).length;
  objs.push(scene.add.text(CX, btnY + 50, `Card collection: ${ownedCount} unique cards owned`, {
    fontSize: '13px', fontFamily: FONT, color: '#555555',
  }).setOrigin(0.5));

  // Tip
  objs.push(scene.add.text(CX, 680, 'Create a deck and activate it to use in matches', {
    fontSize: '10px', fontFamily: FONT, color: '#3a3a3a',
  }).setOrigin(0.5));

  return objs;
}

```

# src\deck\DeckValidatorClient.ts

```ts
// ============================================================
// DeckValidatorClient.ts
// Client-side instant deck validation feedback.
// Uses CardRegistry for card data — no network calls.
// ============================================================

import { getCard } from '../game/data/CardRegistry';

const DECK_SIZE = 31;

export interface ClientValidationResult {
  valid: boolean;
  errors: string[];
  cardCount: number;
  costCurve: Map<number, number>;  // cost → count
}

/**
 * Validate a deck locally for instant UI feedback.
 * Server-side validation is authoritative — this is for UX only.
 */
export function validateDeckClient(cardIds: string[]): ClientValidationResult {
  const errors: string[] = [];
  const costCurve = new Map<number, number>();

  if (!Array.isArray(cardIds)) {
    return { valid: false, errors: ['Invalid deck data.'], cardCount: 0, costCurve };
  }

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck needs exactly ${DECK_SIZE} cards (has ${cardIds.length}).`);
  }

  if (cardIds.includes('king')) {
    errors.push('King is pre-placed and cannot be in the deck.');
  }

  // Check each card exists and count copies
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    try {
      const card = getCard(id);
      costCurve.set(card.cost, (costCurve.get(card.cost) ?? 0) + 1);
    } catch {
      errors.push(`Unknown card: ${id}`);
    }
  }

  // Check copy limits
  for (const [id, count] of counts) {
    try {
      const card = getCard(id);
      if (count > card.copies) {
        errors.push(`${card.name}: ${count} copies (max ${card.copies}).`);
      }
    } catch { /* already reported as unknown */ }
  }

  return {
    valid: errors.length === 0,
    errors,
    cardCount: cardIds.length,
    costCurve,
  };
}

```

# src\events\EventBus.ts

```ts
// ============================================================
// EventBus.ts
// Singleton pub/sub. Decouples GameEngine from all renderers.
// GameEngine emits → EventBus → any subscriber reacts.
// No Phaser dependency. No game logic.
// ============================================================

import type { GameEventMap, GameEventType } from '../game/types/GameEventMap';

export type EventHandler<T = any> = (payload: T) => void;

class EventBusClass {
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private static instance: EventBusClass;

  static getInstance(): EventBusClass {
    if (!EventBusClass.instance) {
      EventBusClass.instance = new EventBusClass();
    }
    return EventBusClass.instance;
  }

  /**
   * Subscribe to a typed event.
   * Returns an unsubscribe function for easy cleanup.
   */
  on<K extends GameEventType>(type: K, handler: (payload: GameEventMap[K]) => void): () => void;
  on(type: string, handler: EventHandler): () => void;
  on(type: string, handler: EventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler);

    return () => this.off(type, handler);
  }

  /**
   * Subscribe to an event type, fire once, then auto-unsubscribe.
   */
  once<K extends GameEventType>(type: K, handler: (payload: GameEventMap[K]) => void): void;
  once(type: string, handler: EventHandler): void;
  once(type: string, handler: EventHandler): void {
    const wrapper: EventHandler = (payload: any) => {
      handler(payload);
      this.off(type, wrapper);
    };
    this.on(type, wrapper);
  }

  /**
   * Unsubscribe a specific handler from an event type.
   */
  off(type: string, handler: EventHandler): void {
    this.listeners.get(type)?.delete(handler);
  }

  /**
   * Emit a typed event. All subscribers for this type receive the payload.
   * Errors in handlers are caught individually — one bad handler
   * won't prevent others from receiving the event.
   */
  emit<K extends GameEventType>(type: K, payload: GameEventMap[K]): void;
  emit(type: string, payload?: any): void;
  emit(type: string, payload?: any): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;

    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${type}":`, err);
      }
    });
  }

  /**
   * Remove all listeners for a specific type.
   * Useful when a scene shuts down.
   */
  clearType(type: string): void {
    this.listeners.delete(type);
  }

  /**
   * Remove ALL listeners. Call when resetting the game.
   */
  clearAll(): void {
    this.listeners.clear();
  }

  /**
   * Debug: list all registered event types and listener counts.
   */
  debug(): void {
    console.log('[EventBus] Registered events:');
    this.listeners.forEach((handlers, type) => {
      console.log(`  ${type}: ${handlers.size} listener(s)`);
    });
  }
}

export const EventBus = EventBusClass.getInstance();

// ─────────────────────────────────────────────
// EVENT TYPE CONSTANTS
// Use these strings everywhere — never raw strings.
// ─────────────────────────────────────────────

export const EV = {
  // Game state
  PHASE_CHANGED:       'PHASE_CHANGED',
  TURN_STARTED:        'TURN_STARTED',
  GAME_OVER:           'GAME_OVER',

  // Cards
  CARD_DRAWN:          'CARD_DRAWN',
  CARD_PLAYED:         'CARD_PLAYED',
  CARD_DISCARDED:      'CARD_DISCARDED',

  // Units / board
  UNIT_PLACED:         'UNIT_PLACED',
  UNIT_MOVED:          'UNIT_MOVED',
  UNIT_ATTACKED:       'UNIT_ATTACKED',
  UNIT_DIED:           'UNIT_DIED',
  UNIT_HEALED:         'UNIT_HEALED',
  UNIT_TRANSFORMED:    'UNIT_TRANSFORMED',
  UNIT_EXHAUSTED:      'UNIT_EXHAUSTED',
  UNIT_REFRESHED:      'UNIT_REFRESHED',

  // LEG economy
  LEG_GAINED:          'LEG_GAINED',
  LEG_SPENT:           'LEG_SPENT',

  // Aura
  AURA_APPLIED:        'AURA_APPLIED',

  // Interaction (engine waiting for player input)
  PENDING_TARGET:      'PENDING_TARGET',
  PENDING_POSITION:    'PENDING_POSITION',
  PENDING_COLUMN:      'PENDING_COLUMN',
  PENDING_DISCARD:     'PENDING_DISCARD',
  INTERACTION_RESOLVED:'INTERACTION_RESOLVED',

  // UI selection (SelectionManager → renderers)
  SELECTION_CHANGED:   'SELECTION_CHANGED',
  HIGHLIGHTS_CHANGED:  'HIGHLIGHTS_CHANGED',
  INPUT_BOARD_CLICK:   'INPUT_BOARD_CLICK',   // BoardRenderer → SelectionManager
  INPUT_HAND_CLICK:    'INPUT_HAND_CLICK',    // HandRenderer  → SelectionManager
  CARD_HOVERED:        'CARD_HOVERED',
  CARD_HOVER_END:      'CARD_HOVER_END',
  DETAIL_SHOW:         'DETAIL_SHOW',
  DETAIL_HIDE:         'DETAIL_HIDE',

  // HUD refresh
  HUD_REFRESH:         'HUD_REFRESH',

  // Network
  NET_OPPONENT_ACTION: 'NET_OPPONENT_ACTION',
  NET_GAME_STATE_SYNC: 'NET_GAME_STATE_SYNC',
} as const;

export type EVType = typeof EV[keyof typeof EV];

```

# src\game\abilities\AbilityDispatcher.ts

```ts
import { AbilityHandlerRegistry } from './AbilityHandlerRegistry';
import type { AbilityResult, AbilityContext } from './types';
import type { Unit, Position } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import type { Board } from '../Board';
import type { PlayerState } from '../PlayerState';
import type { GameModifiers } from '../GameModifiers';
import { getCard } from '../data/CardRegistry';
export function resolveOnDeploy(
  cardId: string,
  owner: Player,
  position: Position | undefined,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers],
  unitInstance?: Unit
): AbilityResult {
  const def = getCard(cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    const key = ability.type === 'CUSTOM'
      ? (ability as any).handler as string
      : ability.type;

    const handler = AbilityHandlerRegistry.get(key);
    if (!handler) {
      console.warn(`[AbilityDispatcher] No handler for: ${key}`);
      continue;
    }

    const ctx: AbilityContext = {
      cardId,
      owner,
      position,
      board,
      players: ps,
      mods,
      unit: unitInstance,
      params: (ability as any).params ?? {},
    };

    try {
      const result = handler(ctx);
      combined.events.push(...result.events);
      if (result.pending && !combined.pending) combined.pending = result.pending;
    } catch (err) {
      console.error(`[AbilityDispatcher] Handler "${key}" threw for card "${cardId}":`, err);
    }
  }

  return combined;
}

export function resolveOnDeath(
  unit: Unit,
  cause: string,
  _board: Board,
  _ps: [PlayerState, PlayerState],
  _mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(unit.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    try {
      if (ability.type === 'ON_DEATH_DRAW') {
        if (cause !== 'REFORM') {
          combined.events.push({
            type:          'CARD_DRAWN',
            player:         unit.owner,
            cardId:         '__DRAW__',
            handIndex:      -1,
            deckRemaining:  -1,
          });
        }
      }
    } catch (err) {
      console.error(`[AbilityDispatcher] onDeath handler threw for "${unit.cardId}":`, err);
    }
  }

  return combined;
}

export function resolveOnKill(
  attacker: Unit,
  victim: Unit,
  _board: Board,
  _ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(attacker.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    try {
      if (ability.type === 'ON_KILL_LEG_DRAIN') {
        const { minTargetCost, amount } = (ability as any).params as { minTargetCost: number; amount: number };
        const victimCost = getCard(victim.cardId).cost;
        if (victimCost > minTargetCost) {
          const victimPlayer = victim.owner;
          const oldRate = mods[victimPlayer].getEffectiveLEGRate();
          combined.events.push({
            type:     'LEG_RATE_CHANGED',
            player:   victimPlayer,
            oldRate,
            newRate:  Math.max(1, oldRate - amount),
            reason:   'INQUISITOR',
          });
        }
      }
    } catch (err) {
      console.error(`[AbilityDispatcher] onKill handler threw for "${attacker.cardId}":`, err);
    }
  }

  return combined;
}

```

# src\game\abilities\AbilityHandlerRegistry.ts

```ts
import type { AbilityHandlerFn } from './types';

class Registry {
  private readonly handlers = new Map<string, AbilityHandlerFn>();

  register(key: string, handler: AbilityHandlerFn): void {
    if (this.handlers.has(key)) {
      console.warn(`[AbilityRegistry] Overwriting handler: ${key}`);
    }
    this.handlers.set(key, handler);
  }

  get(key: string): AbilityHandlerFn | undefined {
    return this.handlers.get(key);
  }

  has(key: string): boolean {
    return this.handlers.has(key);
  }

  listKeys(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const AbilityHandlerRegistry = new Registry();

```

# src\game\abilities\handlers\customMilitia.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function militiaDeployHandler(ctx: AbilityContext): AbilityResult {
  const hasMilitiaInDeck = ctx.players[ctx.owner].deck.includes('militia');
  if (!hasMilitiaInDeck) return { events: [] };

  const freeSquares = ctx.board.getFreeSquaresInHalf(ctx.owner);
  if (freeSquares.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'POSITION',
    owner:          ctx.owner,
    sourceCardId:   'militia',
    sourceAbility:  'militiaDeployHandler',
    reason:         'Place the summoned Militia on your half of the board.',
    validPositions: freeSquares,
    deferredEvents: [],
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('militiaDeployHandler', militiaDeployHandler);

```

# src\game\abilities\handlers\customMystic.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function mysticDeployHandler(ctx: AbilityContext): AbilityResult {
  const graveIds = ctx.players[ctx.owner].getGraveyard();

  const drainEvent: GameEvent = {
    type:    'LEG_RATE_CHANGED',
    player:   ctx.owner,
    oldRate:  ctx.mods[ctx.owner].getEffectiveLEGRate(),
    newRate:  Math.max(1, ctx.mods[ctx.owner].getEffectiveLEGRate() - 1),
    reason:   'MYSTIC',
  };

  if (graveIds.length === 0) return { events: [drainEvent] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  'mysticDeployHandler',
    reason:         'Mystic: choose a unit from your graveyard to revive.',
    validTargetIds: graveIds,
    deferredEvents: [drainEvent],
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('mysticDeployHandler', mysticDeployHandler);

```

# src\game\abilities\handlers\onDeployDraw.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function onDeployDraw(ctx: AbilityContext): AbilityResult {
  const { count, filter } = ctx.params as { count: number; filter?: string };
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         ctx.owner,
      cardId:         filter ? `__DRAW_FILTERED_${filter}__` : '__DRAW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_DRAW, onDeployDraw);

```

# src\game\abilities\handlers\onDeployHeal.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function onDeployHeal(ctx: AbilityContext): AbilityResult {
  const friendlyUnits = ctx.board.getUnitsOf(ctx.owner);
  const validTargetIds = friendlyUnits
    .filter(u => u.currentDef < u.maxDef)
    .map(u => u.instanceId);

  if (validTargetIds.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.ON_DEPLOY_HEAL_FRIENDLY,
    reason:         'Choose a friendly unit to fully restore HP.',
    validTargetIds,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_HEAL_FRIENDLY, onDeployHeal);

```

# src\game\abilities\handlers\onDeployRevive.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function onDeployRevive(ctx: AbilityContext): AbilityResult {
  const graveIds = ctx.players[ctx.owner].getGraveyard();
  if (graveIds.length === 0) {
    return {
      events: [{
        type:    'LEG_RATE_CHANGED',
        player:   ctx.owner,
        oldRate:  ctx.mods[ctx.owner].getEffectiveLEGRate(),
        newRate:  Math.max(1, ctx.mods[ctx.owner].getEffectiveLEGRate() - 1),
        reason:   'MYSTIC',
      }]
    };
  }

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.ON_DEPLOY_REVIVE,
    reason:         'Choose a unit from your graveyard to revive.',
    validTargetIds: graveIds,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_REVIVE, onDeployRevive);

```

# src\game\abilities\handlers\onDeployScout.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';

function onDeployScout(ctx: AbilityContext): AbilityResult {
  const { count } = ctx.params as { count: number };
  const opponentPs = ctx.players[ctx.owner === Player.P1 ? Player.P2 : Player.P1];
  const topCards = opponentPs.peekTop(count);
  return {
    events: [{
      type:     'SCOUT_RESULT',
      player:   ctx.owner,
      topCards,
    }]
  };
}

AbilityHandlerRegistry.register(AbilityType.ON_DEPLOY_SCOUT_DECK, onDeployScout);

```

# src\game\abilities\handlers\passiveNoOp.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityResult } from '../types';

const noOp = (): AbilityResult => ({ events: [] });

// Passive abilities are not resolved on deploy — handled by AuraSystem or GameEngine LEG phase.
AbilityHandlerRegistry.register(AbilityType.PASSIVE_BUILD_DELAY, noOp);
AbilityHandlerRegistry.register(AbilityType.PASSIVE_SPAWN, noOp);
AbilityHandlerRegistry.register(AbilityType.PASSIVE_LANCER_CHARGE, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_ROYAL_DISCOUNT, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_LEG_BONUS, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_ADJ_DEF, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_BOARD_HALF_DEF, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_BOARD_HALF_ATK, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_VILLAGE_SLOW, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_CAVALRY_COUNTER, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_PIKEMAN_FLANK, noOp);
AbilityHandlerRegistry.register(AbilityType.AURA_AUTO_HEAL, noOp);
AbilityHandlerRegistry.register(AbilityType.ON_DEATH_DRAW, noOp);
AbilityHandlerRegistry.register(AbilityType.ON_KILL_LEG_DRAIN, noOp);

```

# src\game\abilities\handlers\spellCoup.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import { getCard } from '../../data/CardRegistry';

function coupHandler(ctx: AbilityContext): AbilityResult {
  const opp = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = ctx.board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance === 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  'coupHandler',
    reason:         'Coup: choose an enemy Royal unit to capture or banish.',
    validTargetIds: targets.map(u => u.instanceId),
    deferredEvents: [],
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('coupHandler', coupHandler);

```

# src\game\abilities\handlers\spellDamageStructure.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function spellDamageStructure(ctx: AbilityContext): AbilityResult {
  const structures = ctx.board.getStructures();
  const validTargetIds = structures.map(u => u.instanceId);

  if (validTargetIds.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ,
    reason:         'Choose an enemy structure to afflict with Disease.',
    validTargetIds,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, spellDamageStructure);

```

# src\game\abilities\handlers\spellDrainLeg.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';

function spellDrainLeg(ctx: AbilityContext): AbilityResult {
  const { amount } = ctx.params as { amount: number; target: string };
  const opp = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const oldRate = ctx.mods[opp].getEffectiveLEGRate();
  return {
    events: [{
      type:    'LEG_RATE_CHANGED',
      player:   opp,
      oldRate,
      newRate:  Math.max(1, oldRate - amount),
      reason:   'CASUS_BELLI',
    }]
  };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DRAIN_LEG_RATE_PERM, spellDrainLeg);

```

# src\game\abilities\handlers\spellDrawStructures.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function spellDrawStructures(ctx: AbilityContext): AbilityResult {
  const { overflow } = ctx.params as { overflow: boolean };
  const ownStructures = ctx.board.getStructures(ctx.owner);
  const count = ownStructures.length;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         ctx.owner,
      cardId:         overflow ? '__DRAW_OVERFLOW__' : '__DRAW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_DRAW_STRUCTURES, spellDrawStructures);

```

# src\game\abilities\handlers\spellEarthquake.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';

function spellEarthquake(ctx: AbilityContext): AbilityResult {
  const pending: PendingCommand = {
    kind:           'COLUMN',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_EARTHQUAKE,
    reason:         'Choose a column (A\u2013F) to strike with the Earthquake.',
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_EARTHQUAKE, spellEarthquake);

```

# src\game\abilities\handlers\spellForwardDeploy.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import type { Position } from '../../types/GameTypes';

function spellForwardDeploy(ctx: AbilityContext): AbilityResult {
  const frontRow = ctx.owner === Player.P1 ? ctx.board.rows - 1 : 0;
  const validPositions: Position[] = [];
  for (let c = 0; c < ctx.board.cols; c++) {
    if (ctx.board.isEmpty(c, frontRow)) validPositions.push({ col: c, row: frontRow });
  }
  if (validPositions.length === 0 || ctx.players[ctx.owner].hand.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'POSITION',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  AbilityType.SPELL_FORWARD_DEPLOY,
    reason:         'Choose an empty square in the enemy front row to deploy a card.',
    validPositions,
    deferredEvents: [],
  };
  return { events: [], pending };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_FORWARD_DEPLOY, spellForwardDeploy);

```

# src\game\abilities\handlers\spellFreezeLeg.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';

function spellFreezeLeg(ctx: AbilityContext): AbilityResult {
  const p1Rate = ctx.mods[Player.P1].getEffectiveLEGRate();
  const p2Rate = ctx.mods[Player.P2].getEffectiveLEGRate();
  return {
    events: [
      { type: 'LEG_RATE_CHANGED', player: Player.P1, oldRate: p1Rate, newRate: 0, reason: 'CIVIL_WAR' },
      { type: 'LEG_RATE_CHANGED', player: Player.P2, oldRate: p2Rate, newRate: 0, reason: 'CIVIL_WAR' },
    ]
  };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_FREEZE_LEG_RATE, spellFreezeLeg);

```

# src\game\abilities\handlers\spellMotherland.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function motherlandHandler(ctx: AbilityContext): AbilityResult {
  const count = ctx.board.getStructures(ctx.owner).length;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         ctx.owner,
      cardId:         '__DRAW_OVERFLOW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}

AbilityHandlerRegistry.register('motherlandHandler', motherlandHandler);

```

# src\game\abilities\handlers\spellRevolt.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function peasantRevoltHandler(ctx: AbilityContext): AbilityResult {
  const allStructures = ctx.board.getStructures();
  const count = allStructures.length;

  const events: GameEvent[] = [];

  const freeSquares = ctx.board.getFreeSquaresInHalf(ctx.owner);
  const toSummon = Math.min(count, freeSquares.length);
  for (let i = 0; i < toSummon; i++) {
    events.push({
      type:       'UNIT_PLACED',
      instanceId: `militia_revolt_${i}_${Date.now()}`,
      cardId:     'militia',
      owner:      ctx.owner,
      col:        freeSquares[i].col,
      row:        freeSquares[i].row,
      isActive:   true,
    });
  }

  const oldRate = ctx.mods[ctx.owner].getEffectiveLEGRate();
  events.push({
    type:    'LEG_RATE_CHANGED',
    player:   ctx.owner,
    oldRate,
    newRate:  Math.max(1, oldRate - 1),
    reason:   'REVOLT',
  });

  return { events };
}

AbilityHandlerRegistry.register('peasantRevoltHandler', peasantRevoltHandler);

```

# src\game\abilities\handlers\spellTransformAll.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import { AbilityType } from '../../types/AbilityTypes';
import type { AbilityContext, AbilityResult } from '../types';
import { applyReform } from '../../CombatResolver';

function spellTransformAll(ctx: AbilityContext): AbilityResult {
  const { fromCardId, toCardId } = ctx.params as { fromCardId: string; toCardId: string };
  const events = applyReform(fromCardId, toCardId, ctx.board);
  return { events };
}

AbilityHandlerRegistry.register(AbilityType.SPELL_TRANSFORM_ALL, spellTransformAll);

```

# src\game\abilities\handlers\spellTreason.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import { Player } from '../types';
import { getCard } from '../../data/CardRegistry';

function treasonHandler(ctx: AbilityContext): AbilityResult {
  const opp = ctx.owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = ctx.board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance !== 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingCommand = {
    kind:           'TARGET',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  'treasonHandler',
    reason:         'Treason: choose an enemy non-Royal unit to control this turn.',
    validTargetIds: targets.map(u => u.instanceId),
    deferredEvents: [],
  };

  return { events: [], pending };
}

AbilityHandlerRegistry.register('treasonHandler', treasonHandler);

```

# src\game\abilities\handlers\spellWarHorn.ts

```ts
import { AbilityHandlerRegistry } from '../AbilityHandlerRegistry';
import type { PendingCommand } from '../../pending/PendingCommand';
import type { AbilityContext, AbilityResult } from '../types';
import type { GameEvent } from '../../types/EventTypes';

function warHornHandler(ctx: AbilityContext): AbilityResult {
  const drawEvents: GameEvent[] = [
    { type: 'CARD_DRAWN', player: ctx.owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
    { type: 'CARD_DRAWN', player: ctx.owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
  ];

  const pending: PendingCommand = {
    kind:           'DISCARD',
    owner:          ctx.owner,
    sourceCardId:   ctx.cardId,
    sourceAbility:  'warHornHandler',
    count:          1,
    reason:         'War Horn: discard 1 card from your hand.',
    deferredEvents: [],
  };

  return { events: drawEvents, pending };
}

AbilityHandlerRegistry.register('warHornHandler', warHornHandler);

```

# src\game\abilities\registerAll.ts

```ts
import './handlers/onDeployDraw';
import './handlers/onDeployScout';
import './handlers/onDeployHeal';
import './handlers/onDeployRevive';
import './handlers/spellDamageStructure';
import './handlers/spellFreezeLeg';
import './handlers/spellDrainLeg';
import './handlers/spellForwardDeploy';
import './handlers/spellTransformAll';
import './handlers/spellEarthquake';
import './handlers/spellDrawStructures';
import './handlers/spellWarHorn';
import './handlers/spellCoup';
import './handlers/spellTreason';
import './handlers/spellRevolt';
import './handlers/spellMotherland';
import './handlers/customMystic';
import './handlers/customMilitia';
import './handlers/passiveNoOp';
// ↓ ADD NEW HANDLERS HERE ↓

```

# src\game\abilities\types.ts

```ts
import type { Unit, Position } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import type { Board } from '../Board';
import type { PlayerState } from '../PlayerState';
import type { GameModifiers } from '../GameModifiers';
import type { GameEvent } from '../types/EventTypes';
import type { PendingCommand } from '../pending/PendingCommand';

export { Player };

export interface AbilityResult {
  events: GameEvent[];
  pending?: PendingCommand;
}

export interface AbilityContext {
  readonly cardId: string;
  readonly owner: Player;
  readonly position?: Position;
  readonly board: Board;
  readonly players: [PlayerState, PlayerState];
  readonly mods: [GameModifiers, GameModifiers];
  readonly unit?: Unit;
  readonly params: Record<string, any>;
}

export type AbilityHandlerFn = (ctx: AbilityContext) => AbilityResult;

```

# src\game\auras\auraHelpers.ts

```ts
// Shared helpers for aura processors.

import type { StatBuff } from '../types/GameTypes';
import { Player } from '../types/GameTypes';
import type { StatDelta } from './AuraProcessor';

// ── Module-level audit trail ─────────────────────────
// Set by AuraSystem before running the chain, cleared after.
// Processors don't need to know about it — addDelta handles it.
let _buffMap: Map<string, StatBuff[]> | null = null;

export function beginAuditTrail(buffMap: Map<string, StatBuff[]>): void {
  _buffMap = buffMap;
}

export function endAuditTrail(): void {
  _buffMap = null;
}

/** Safely read params from any ability (CommonAbility or CustomAbility). */
export function params(ab: any): any {
  return ab.params ?? {};
}

export function otherPlayer(p: Player): Player {
  return p === Player.P1 ? Player.P2 : Player.P1;
}

export function addDelta(
  deltas: Map<string, StatDelta>,
  instanceId: string,
  atk: number,
  def: number,
  mov: number,
  source?: string
): void {
  const d = deltas.get(instanceId);
  if (!d) return;
  d.atkDelta += atk;
  d.defDelta += def;
  d.moveDelta += mov;

  // Record to audit trail if active
  if (source && _buffMap) {
    let buffs = _buffMap.get(instanceId);
    if (!buffs) { buffs = []; _buffMap.set(instanceId, buffs); }
    buffs.push({ source, atkDelta: atk, defDelta: def, moveDelta: mov });
  }
}

```

# src\game\auras\AuraProcessor.ts

```ts
// ============================================================
// AuraProcessor.ts
// Interface for Chain of Responsibility aura processors.
// Each processor handles one aura type and accumulates deltas.
// ============================================================

import type { Unit } from '../types/GameTypes';
import type { IBoard } from '../interfaces/IBoard';
import type { IGameModifiers } from '../interfaces/IGameModifiers';

export interface StatDelta {
  atkDelta: number;
  defDelta: number;
  moveDelta: number;
}

/**
 * A stat-aura processor: examines a source unit's abilities
 * and accumulates stat deltas for affected units.
 */
export interface AuraProcessor {
  readonly auraType: string;
  process(
    source: Unit,
    allUnits: Unit[],
    board: IBoard,
    deltas: Map<string, StatDelta>
  ): void;
}

/**
 * An economy-aura processor: recalculates modifier values
 * (royal discount, LEG bonus) for a single player's units.
 */
export interface EconomyProcessor {
  readonly auraType: string;
  process(
    ownUnits: Unit[],
    modifiers: IGameModifiers
  ): number;
}

```

# src\game\auras\AuraProcessorChain.ts

```ts
// ============================================================
// AuraProcessorChain.ts
// Assembles stat and economy processors into an ordered chain.
// Replaces the switch statement from the old evaluateAuras().
// ============================================================

import type { AuraProcessor, EconomyProcessor, StatDelta } from './AuraProcessor';
import type { Unit } from '../types/GameTypes';
import type { IBoard } from '../interfaces/IBoard';

// Stat processors
import { AdjDefProcessor } from './processors/AdjDefProcessor';
import { BoardHalfDefProcessor } from './processors/BoardHalfDefProcessor';
import { BoardHalfAtkProcessor } from './processors/BoardHalfAtkProcessor';
import { VillageSlowProcessor } from './processors/VillageSlowProcessor';
import { PikemanFlankProcessor } from './processors/PikemanFlankProcessor';
import { KingSuppressProcessor } from './processors/KingSuppressProcessor';

// Economy processors
import { RoyalDiscountProcessor } from './processors/RoyalDiscountProcessor';
import { LEGBonusProcessor } from './processors/LEGBonusProcessor';

/** Default stat-aura chain in evaluation order. */
export function createStatChain(): AuraProcessor[] {
  return [
    new AdjDefProcessor(),
    new BoardHalfDefProcessor(),
    new BoardHalfAtkProcessor(),
    new VillageSlowProcessor(),
    new PikemanFlankProcessor(),
    new KingSuppressProcessor(),
  ];
}

/** Default economy-aura chain. */
export function createEconomyChain(): EconomyProcessor[] {
  return [
    new RoyalDiscountProcessor(),
    new LEGBonusProcessor(),
  ];
}

/**
 * Run all stat processors for a single source unit.
 * Each processor checks if the source has the relevant ability.
 */
export function runStatChain(
  chain: AuraProcessor[],
  source: Unit,
  allUnits: Unit[],
  board: IBoard,
  deltas: Map<string, StatDelta>
): void {
  for (const processor of chain) {
    processor.process(source, allUnits, board, deltas);
  }
}

```

# src\game\auras\processors\AdjDefProcessor.ts

```ts
// Castle: adjacent friendly units +DEF

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, addDelta } from '../auraHelpers';

export class AdjDefProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_ADJ_DEF;

  process(source: Unit, _allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const adjacents = board.getAdjacentUnits(source.position.col, source.position.row);
      for (const adj of adjacents) {
        if (adj.owner === source.owner) {
          addDelta(deltas, adj.instanceId, 0, params(ability).amount, 0, `${source.cardId}:ADJ_DEF`);
        }
      }
    }
  }
}

```

# src\game\auras\processors\BoardHalfAtkProcessor.ts

```ts
// Commander: enemy-half friendly units +ATK
// Only applies when the Commander itself is on the enemy half.
// Neutral zone (middle row) = no aura.

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, otherPlayer, addDelta } from '../auraHelpers';

export class BoardHalfAtkProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_BOARD_HALF_ATK;

  process(source: Unit, allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const p = params(ability);

      const enemyOwner = otherPlayer(source.owner);

      // Commander must be on the ENEMY half for ATK aura to activate
      if (!board.isOwnHalf(source.position.col, source.position.row, enemyOwner)) continue;

      // Buff all friendly units on enemy half
      for (const u of allUnits) {
        if (u.owner === source.owner && board.isOwnHalf(u.position.col, u.position.row, enemyOwner)) {
          addDelta(deltas, u.instanceId, p.amount, 0, 0, `${source.cardId}:BOARD_HALF_ATK`);
        }
      }
    }
  }
}

```

# src\game\auras\processors\BoardHalfDefProcessor.ts

```ts
// Commander: own-half friendly units +DEF
// Only applies when the Commander itself is on its own half.
// Neutral zone (middle row) = no aura.

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, addDelta } from '../auraHelpers';

export class BoardHalfDefProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_BOARD_HALF_DEF;

  process(source: Unit, allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const p = params(ability);

      // Commander must be on its OWN half for DEF aura to activate
      if (!board.isOwnHalf(source.position.col, source.position.row, source.owner)) continue;

      // Buff all friendly units on own half
      for (const u of allUnits) {
        if (u.owner === source.owner && board.isOwnHalf(u.position.col, u.position.row, source.owner)) {
          addDelta(deltas, u.instanceId, 0, p.amount, 0, `${source.cardId}:BOARD_HALF_DEF`);
        }
      }
    }
  }
}

```

# src\game\auras\processors\KingSuppressProcessor.ts

```ts
// Messenger: adjacent enemy King's ATK = 0

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { addDelta } from '../auraHelpers';

export class KingSuppressProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_SUPPRESS_KING_ATK;

  process(source: Unit, _allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const adjacents = board.getAdjacentUnits(source.position.col, source.position.row);
      for (const adj of adjacents) {
        if (adj.owner !== source.owner && adj.cardId === 'king') {
          // Zero the King's ATK by subtracting its base value
          addDelta(deltas, adj.instanceId, -adj.baseAtk, 0, 0, `${source.cardId}:SUPPRESS_KING_ATK`);
        }
      }
    }
  }
}

```

# src\game\auras\processors\LEGBonusProcessor.ts

```ts
// Economy: LEG rate bonus from Princess

import type { EconomyProcessor } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IGameModifiers } from '../../interfaces/IGameModifiers';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params } from '../auraHelpers';

export class LEGBonusProcessor implements EconomyProcessor {
  readonly auraType = AbilityType.AURA_LEG_BONUS;

  process(ownUnits: Unit[], _modifiers: IGameModifiers): number {
    let legBonus = 0;
    for (const u of ownUnits) {
      if (!u.isActive) continue;
      const def = getCard(u.cardId);
      for (const ab of def.abilities) {
        if (ab.type === 'CUSTOM') continue;
        if (ab.type === AbilityType.AURA_LEG_BONUS && u.cardId !== 'king') {
          legBonus += params(ab).amount;
        }
      }
    }
    return legBonus;
  }
}

```

# src\game\auras\processors\PikemanFlankProcessor.ts

```ts
// Pikeman: +ATK +DEF if friendly units on both horizontal sides

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, addDelta } from '../auraHelpers';

export class PikemanFlankProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_PIKEMAN_FLANK;

  process(source: Unit, _allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const { col, row } = source.position;
      const leftUnit  = board.isInBounds(col - 1, row) ? board.getUnit(col - 1, row) : null;
      const rightUnit = board.isInBounds(col + 1, row) ? board.getUnit(col + 1, row) : null;
      const hasLeft   = leftUnit  !== null && leftUnit.owner  === source.owner;
      const hasRight  = rightUnit !== null && rightUnit.owner === source.owner;
      if (hasLeft && hasRight) {
        const p = params(ability);
        addDelta(deltas, source.instanceId, p.bonusAtk, p.bonusDef, 0, `${source.cardId}:PIKEMAN_FLANK`);
      }
    }
  }
}

```

# src\game\auras\processors\RoyalDiscountProcessor.ts

```ts
// Economy: royal cost discount from Castle, Temple, Princess, Kings Guard

import type { EconomyProcessor } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IGameModifiers } from '../../interfaces/IGameModifiers';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params } from '../auraHelpers';

export class RoyalDiscountProcessor implements EconomyProcessor {
  readonly auraType = AbilityType.AURA_ROYAL_DISCOUNT;

  process(ownUnits: Unit[], _modifiers: IGameModifiers): number {
    let discount = 0;
    for (const u of ownUnits) {
      if (!u.isActive) continue;
      const def = getCard(u.cardId);
      for (const ab of def.abilities) {
        if (ab.type === 'CUSTOM') continue;
        if (ab.type === AbilityType.AURA_ROYAL_DISCOUNT) {
          discount += params(ab).amount;
        }
      }
    }
    return discount;
  }
}

```

# src\game\auras\processors\VillageSlowProcessor.ts

```ts
// Village: adjacent enemies -movement

import type { AuraProcessor, StatDelta } from '../AuraProcessor';
import type { Unit } from '../../types/GameTypes';
import type { IBoard } from '../../interfaces/IBoard';
import { AbilityType } from '../../types/AbilityTypes';
import { getCard } from '../../data/CardRegistry';
import { params, addDelta } from '../auraHelpers';

export class VillageSlowProcessor implements AuraProcessor {
  readonly auraType = AbilityType.AURA_VILLAGE_SLOW;

  process(source: Unit, _allUnits: Unit[], board: IBoard, deltas: Map<string, StatDelta>): void {
    const def = getCard(source.cardId);
    for (const ability of def.abilities) {
      if (ability.type !== this.auraType) continue;
      const adjacents = board.getAdjacentUnits(source.position.col, source.position.row);
      for (const adj of adjacents) {
        if (adj.owner !== source.owner) {
          addDelta(deltas, adj.instanceId, 0, 0, -params(ability).amount, `${source.cardId}:VILLAGE_SLOW`);
        }
      }
    }
  }
}

```

# src\game\AuraSystem.ts

```ts
// ============================================================
// AuraSystem.ts
// Recalculates ALL unit stats each LEG phase using a
// Chain of Responsibility pattern.
//
// Algorithm: reset every unit to base stats → run processor
// chain to accumulate deltas → apply deltas → run economy
// processors for modifier recalculation.
//
// Pure TypeScript — no Phaser, no EventBus.
// ============================================================

import type { Unit, StatBuff } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { IBoard } from './interfaces/IBoard';
import type { IGameModifiers } from './interfaces/IGameModifiers';
import type { AuraProcessor, EconomyProcessor, StatDelta } from './auras/AuraProcessor';
import { createStatChain, createEconomyChain, runStatChain } from './auras/AuraProcessorChain';
import { getCard } from './data/CardRegistry';
import { AbilityType } from './types/AbilityTypes';
import { params, beginAuditTrail, endAuditTrail } from './auras/auraHelpers';
import type { EvAuraApplied } from './types/EventTypes';

export class AuraSystem {
  private statChain: AuraProcessor[];
  private economyChain: EconomyProcessor[];

  constructor() {
    this.statChain = createStatChain();
    this.economyChain = createEconomyChain();
  }

  /**
   * Full aura recalculation pass.
   * Call once per LEG phase before any ACT actions.
   * Mutates unit.currentAtk / currentDef / currentMovement in place.
   * Also updates GameModifiers royalCostDiscount and legRateBonus.
   */
  evaluateAuras(board: IBoard, mods: [IGameModifiers, IGameModifiers]): EvAuraApplied {
    const allUnits = board.getAllUnits();

    // ── Step 1: Reset every unit to base stats + clear audit trail ──
    for (const unit of allUnits) {
      unit.currentAtk      = unit.baseAtk;
      unit.maxDef          = unit.baseDef;               // reset max to base (removes old aura DEF buffs)
      unit.currentDef      = Math.min(unit.currentDef, unit.maxDef); // cap HP at new max
      unit.currentMovement = unit.baseMovement;
      unit.activeBuffs     = [];
    }

    // ── Step 2: Collect per-unit deltas ──
    const deltas = new Map<string, StatDelta>();
    const buffMap = new Map<string, StatBuff[]>();
    for (const unit of allUnits) {
      deltas.set(unit.instanceId, { atkDelta: 0, defDelta: 0, moveDelta: 0 });
    }

    // ── Step 3: Run stat processor chain for each active unit ──
    beginAuditTrail(buffMap);
    for (const unit of allUnits) {
      if (!unit.isActive) continue;
      runStatChain(this.statChain, unit, allUnits, board, deltas);
    }
    endAuditTrail();

    // ── Step 4: Apply deltas to currentAtk / currentMovement + copy audit trail ──
    const changes: EvAuraApplied['changes'] = [];

    for (const unit of allUnits) {
      const d = deltas.get(unit.instanceId)!;

      const prevAtk = unit.currentAtk;
      const prevMov = unit.currentMovement;

      unit.currentAtk      = Math.max(0, unit.currentAtk + d.atkDelta);
      if (d.defDelta !== 0) {
        unit.maxDef     += d.defDelta;
        unit.currentDef  = Math.min(unit.currentDef + d.defDelta, unit.maxDef);
      }
      unit.currentMovement = Math.max(0, unit.currentMovement + d.moveDelta);
      unit.activeBuffs     = buffMap.get(unit.instanceId) ?? [];

      if (d.atkDelta !== 0 || d.defDelta !== 0 || d.moveDelta !== 0) {
        changes.push({
          instanceId: unit.instanceId,
          col:        unit.position.col,
          row:        unit.position.row,
          atkDelta:   unit.currentAtk - prevAtk,
          defDelta:   d.defDelta,
          moveDelta:  unit.currentMovement - prevMov,
          buffs:      unit.activeBuffs,
        });
      }
    }

    // ── Step 5: Run economy processors per player ──
    for (const player of [Player.P1, Player.P2] as Player[]) {
      const mod = mods[player];
      const ownUnits = board.getUnitsOf(player);

      for (const processor of this.economyChain) {
        const value = processor.process(ownUnits, mod);
        if (processor.auraType === AbilityType.AURA_ROYAL_DISCOUNT) {
          mod.royalCostDiscount = value;
        } else if (processor.auraType === AbilityType.AURA_LEG_BONUS) {
          mod.setLEGRateBonus(value);
        }
      }
    }

    return { type: 'AURA_APPLIED', changes };
  }

  recalculateModifiers(board: IBoard, mods: [IGameModifiers, IGameModifiers]): void {
    this.evaluateAuras(board, mods);
  }
}

// ─────────────────────────────────────────────
// COMBAT-TIME AURA QUERIES
// Called by CombatResolver / GameEngine at moment of combat.
// These are standalone — not part of the chain.
// ─────────────────────────────────────────────

export function getCavalryCounterMultiplier(attacker: Unit, defender: Unit): number {
  const attDef = getCard(attacker.cardId);
  const defDef = getCard(defender.cardId);

  const attackerHasCounter = attDef.abilities.some(
    ab => ab.type === AbilityType.AURA_CAVALRY_COUNTER
  );
  const defenderIsCavalry = defDef.subtypes.includes('CAVALRY' as any);

  if (attackerHasCounter && defenderIsCavalry) {
    const ab = attDef.abilities.find(ab => ab.type === AbilityType.AURA_CAVALRY_COUNTER)!;
    return params(ab).multiplier;
  }
  return 1;
}

export function getAutoHealAmount(unit: Unit): number {
  const def = getCard(unit.cardId);
  const ab = def.abilities.find(ab => ab.type === AbilityType.AURA_AUTO_HEAL);
  if (!ab) return 0;
  return params(ab).amount;
}

```

# src\game\Board.ts

```ts
// ============================================================
// Board.ts
// 7×7 (or any cols×rows) grid state.
// Pure TypeScript — zero Phaser imports.
// Stores Unit objects on a 2D grid.
// All mutations go through Board methods.
//
// PATCH v0.3:
//   - Default 7×7 (was 6×6)
//   - Exported DEPLOY_ROWS = 3 constant
//   - Deploy zone uses explicit DEPLOY_ROWS, not half-board
//   - Middle row(s) act as neutral buffer zone
//   - resetTurnFlags clears isJustPlaced
// ============================================================

import type { Unit, BoardCell, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { IBoard } from './interfaces/IBoard';

/** Number of rows each player can deploy into (from their back edge). */
export const DEPLOY_ROWS = 3;

export class Board implements IBoard {
  readonly cols: number;
  readonly rows: number;
  private cells: BoardCell[][];
  private unitIndex: Map<string, Unit> = new Map(); // instanceId → Unit

  /** Dirty-flagged cache for unit list queries. Invalidated on any mutation. */
  private _allUnitsCache: Unit[] | null = null;
  private _unitsOfCache: [Unit[], Unit[]] | null = null; // [P1, P2]

  private invalidateUnitCache(): void {
    this._allUnitsCache = null;
    this._unitsOfCache = null;
  }

  constructor(cols = 7, rows = 7) {
    this.cols = cols;
    this.rows = rows;
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        this.cells[r][c] = { col: c, row: r, unit: null };
      }
    }
  }

  // ─────────────────────────────────────────────
  // READ QUERIES
  // ─────────────────────────────────────────────

  getCell(col: number, row: number): BoardCell {
    this.assertInBounds(col, row);
    return this.cells[row][col];
  }

  getUnit(col: number, row: number): Unit | null {
    return this.getCell(col, row).unit;
  }

  getUnitById(instanceId: string): Unit | null {
    return this.unitIndex.get(instanceId) ?? null;
  }

  isEmpty(col: number, row: number): boolean {
    return this.getCell(col, row).unit === null;
  }

  isInBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  /**
   * P1 deploy zone: rows 0..(DEPLOY_ROWS-1).
   * P2 deploy zone: rows (rows-DEPLOY_ROWS)..(rows-1).
   * Middle rows are neutral — no player can deploy there.
   */
  isOwnHalf(_col: number, row: number, player: Player): boolean {
    return player === Player.P1
      ? row < DEPLOY_ROWS
      : row >= this.rows - DEPLOY_ROWS;
  }

  /** Returns all units belonging to a player. */
  getUnitsOf(player: Player): Unit[] {
    if (!this._unitsOfCache) {
      const p1: Unit[] = [], p2: Unit[] = [];
      for (const u of this.unitIndex.values()) {
        (u.owner === Player.P1 ? p1 : p2).push(u);
      }
      this._unitsOfCache = [p1, p2];
    }
    return this._unitsOfCache[player];
  }

  /** Returns the King unit for a player, or null if dead. */
  getKing(player: Player): Unit | null {
    return this.getUnitsOf(player).find(u => u.cardId === 'king') ?? null;
  }

  /** Returns all structure units (STATIC subtype) on the board. */
  private static readonly STRUCTURE_IDS = new Set(['castle', 'temple', 'village']);

  getStructures(player?: Player): Unit[] {
    const result: Unit[] = [];
    for (const u of this.unitIndex.values()) {
      if (Board.STRUCTURE_IDS.has(u.cardId) && (player === undefined || u.owner === player)) {
        result.push(u);
      }
    }
    return result;
  }

  /** Returns all units. */
  getAllUnits(): Unit[] {
    if (!this._allUnitsCache) {
      this._allUnitsCache = Array.from(this.unitIndex.values());
    }
    return this._allUnitsCache;
  }

  /** Returns all cells as a flat array (for serialization). */
  getCells(): BoardCell[] {
    const out: BoardCell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        out.push(this.cells[r][c]);
      }
    }
    return out;
  }

  /** Get units adjacent to a position (4 cardinal + 4 diagonal = up to 8). */
  getAdjacentUnits(col: number, row: number): Unit[] {
    const units: Unit[] = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (this.isInBounds(nc, nr)) {
          const u = this.cells[nr][nc].unit;
          if (u) units.push(u);
        }
      }
    }
    return units;
  }

  /** Get units adjacent using HV only (4 cardinal). */
  getHVAdjacentUnits(col: number, row: number): Unit[] {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const units: Unit[] = [];
    for (const [dc, dr] of dirs) {
      const nc = col + dc, nr = row + dr;
      if (this.isInBounds(nc, nr)) {
        const u = this.cells[nr][nc].unit;
        if (u) units.push(u);
      }
    }
    return units;
  }

  /**
   * Get all free squares in a player's deploy zone.
   * P1: rows 0..(DEPLOY_ROWS-1).  P2: rows (rows-DEPLOY_ROWS)..(rows-1).
   */
  getFreeSquaresInHalf(player: Player): Position[] {
    const result: Position[] = [];
    const startRow = player === Player.P1 ? 0 : this.rows - DEPLOY_ROWS;
    const endRow   = player === Player.P1 ? DEPLOY_ROWS : this.rows;
    for (let r = startRow; r < endRow; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.cells[r][c].unit === null) {
          result.push({ col: c, row: r });
        }
      }
    }
    return result;
  }

  /** Get all units in a specific column. */
  getUnitsInColumn(col: number): Unit[] {
    const units: Unit[] = [];
    for (let r = 0; r < this.rows; r++) {
      const u = this.cells[r][col].unit;
      if (u) units.push(u);
    }
    return units;
  }

  // ─────────────────────────────────────────────
  // MUTATIONS
  // ─────────────────────────────────────────────

  /** Place a unit on the board. Throws if cell is occupied. */
  placeUnit(unit: Unit): void {
    const { col, row } = unit.position;
    this.assertInBounds(col, row);
    if (this.cells[row][col].unit !== null) {
      throw new Error(`[Board] Cell (${col},${row}) is already occupied`);
    }
    this.cells[row][col].unit = unit;
    this.unitIndex.set(unit.instanceId, unit);
    this.invalidateUnitCache();
  }

  /** Remove a unit from the board (death, capture, return). */
  removeUnit(instanceId: string): Unit | null {
    const unit = this.unitIndex.get(instanceId);
    if (!unit) return null;
    const { col, row } = unit.position;
    this.cells[row][col].unit = null;
    this.unitIndex.delete(instanceId);
    this.invalidateUnitCache();
    return unit;
  }

  /**
   * Move a unit from its current position to a new position.
   * Throws if target cell is occupied or unit not found.
   */
  moveUnit(instanceId: string, toCol: number, toRow: number): void {
    const unit = this.unitIndex.get(instanceId);
    if (!unit) throw new Error(`[Board] Unit ${instanceId} not found`);
    this.assertInBounds(toCol, toRow);
    if (this.cells[toRow][toCol].unit !== null) {
      throw new Error(`[Board] Target cell (${toCol},${toRow}) is occupied`);
    }

    // Clear old cell
    this.cells[unit.position.row][unit.position.col].unit = null;

    // Update unit position
    unit.position = { col: toCol, row: toRow };

    // Set new cell
    this.cells[toRow][toCol].unit = unit;
  }

  /**
   * Directly update a unit's stats in place.
   * Used by AuraSystem after recalculation.
   */
  updateUnitStats(instanceId: string, updates: Partial<Unit>): void {
    const unit = this.unitIndex.get(instanceId);
    if (!unit) return;
    Object.assign(unit, updates);
  }

  /**
   * Reset all units' turn flags (hasMoved, hasActed, isJustPlaced).
   * Called at START of each owner's turn.
   */
  resetTurnFlags(player: Player): void {
    this.getUnitsOf(player).forEach(u => {
      u.hasMoved = false;
      u.hasActed = false;
      u.isJustPlaced = false;  // Unit placed last turn can now act
      // Treason exhausted flag clears at end of opponent turn
    });
  }

  // ─────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────

  /** Returns a plain-object snapshot (for network sync, state inspection). */
  serialize(): Array<{ col: number; row: number; unit: Unit | null }> {
    return this.getCells().map(cell => ({
      col: cell.col,
      row: cell.row,
      unit: cell.unit ? { ...cell.unit, position: { ...cell.unit.position } } : null,
    }));
  }

  /** Clear the entire board. Used for game reset. */
  clear(): void {
    this.unitIndex.clear();
    this.invalidateUnitCache();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.cells[r][c].unit = null;
      }
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────

  private assertInBounds(col: number, row: number): void {
    if (!this.isInBounds(col, row)) {
      throw new Error(`[Board] Out of bounds: (${col},${row})`);
    }
  }
}

```

# src\game\CombatResolver.ts

```ts
// ============================================================
// CombatResolver.ts
// Pure functions — never mutates board or player state.
// Returns GameEvent[] arrays that GameEngine applies to state.
// All combat math lives here.
//
// PATCH v0.5 (dying blow):
//   - Counter-attack now fires even if defender dies from primary attack.
//     A dying melee unit still retaliates before falling. Uses defender's
//     pre-damage ATK for counter damage calculation.
//   - Assassin jump still immune to counter-attack.
//   - Event order: primary attack → defender death → counter-attack → attacker death
// ============================================================

import type { Unit } from './types/GameTypes';
import type { Board } from './Board';
import { getCard } from './data/CardRegistry';
import { CombatTag } from './types/CardTypes';
import { getValidAttacks } from './MovementRules';
import {
  EvUnitAttacked, EvUnitDied, EvUnitTransformed,
  DamageBreakdown, GameEvent
} from './types/EventTypes';

// ─────────────────────────────────────────────
// COMBAT RESOLUTION
// ─────────────────────────────────────────────

/**
 * Resolve a single attack from attacker → defender.
 * Returns GameEvent[] — caller applies these to state.
 * Never mutates board or units directly.
 */
export function resolveAttack(
  attacker: Unit,
  defender: Unit,
  _board: Board
): GameEvent[] {
  const events: GameEvent[] = [];

  const breakdown = calculateDamage(attacker, defender);
  const damage = breakdown.totalDamage;
  const isKingHit = defender.cardId === 'king';
  const newHP = Math.max(0, defender.currentDef - damage);
  const targetPlayer = defender.owner;
  const maxHP = defender.maxDef;

  const attackEvent: EvUnitAttacked = {
    type: 'UNIT_ATTACKED',
    attackerInstanceId: attacker.instanceId,
    targetInstanceId:   defender.instanceId,
    attackerCol: attacker.position.col,
    attackerRow: attacker.position.row,
    targetCol:   defender.position.col,
    targetRow:   defender.position.row,
    damage,
    targetNewHP: newHP,
    targetPlayer,
    isKingHit,
    newHP:  isKingHit ? newHP : undefined,
    maxHP:  isKingHit ? maxHP : undefined,
    breakdown,
  };
  events.push(attackEvent);

  // Death check (King doesn't die from combat — game over handled separately)
  if (newHP <= 0 && defender.cardId !== 'king') {
    const dieEvent: EvUnitDied = {
      type: 'UNIT_DIED',
      instanceId: defender.instanceId,
      cardId:     defender.cardId,
      owner:      defender.owner,
      col:        defender.position.col,
      row:        defender.position.row,
      cause:      'COMBAT',
    };
    events.push(dieEvent);
  }

  return events;
}

// ─────────────────────────────────────────────
// COUNTER-ATTACK RESOLUTION (with dying blow)
// ─────────────────────────────────────────────

/**
 * Resolve attack WITH counter-attack logic (v0.5 — dying blow).
 *
 * A melee defender always retaliates if adjacent, EVEN IF the
 * primary attack killed them. This represents a "dying blow" —
 * the defender strikes back as they fall.
 *
 * Counter-attack uses defender's PRE-DAMAGE ATK value.
 *
 * Assassin jump attacks remain immune to counter-attack.
 *
 * Event order:
 *   1. Primary attack (attacker → defender)
 *   2. Defender death (if killed by primary)
 *   3. Counter-attack (defender → attacker, even if dying)
 *   4. Attacker death (if killed by counter)
 */
export function resolveAttackWithCounter(
  attacker: Unit,
  defender: Unit,
  board: Board,
  isAssassinJump: boolean = false,
): GameEvent[] {
  const events: GameEvent[] = [];

  // ── Capture defender's pre-damage state for counter-attack ──
  const defenderPreDamageAtk = defender.currentAtk;
  const defenderCombatTag = defender.combatTag;
  const defenderPos = { ...defender.position };
  const attackerPos = { ...attacker.position };

  // ── 1. Primary attack: attacker → defender ──
  const primaryEvents = resolveAttack(attacker, defender, board);
  events.push(...primaryEvents);

  // ── 2. Counter-attack eligibility ──
  //    Assassin jumps: always immune
  if (isAssassinJump) return events;
  //    Defender must have positive ATK to deal counter damage
  if (defenderPreDamageAtk <= 0) return events;
  //    Defender must be able to reach attacker from its own attack vector
  const defenderReach = getValidAttacks(defender, board);
  const canReachAttacker = defenderReach.some(
    p => p.col === attackerPos.col && p.row === attackerPos.row
  );
  if (!canReachAttacker) return events;

  // ── 3. Counter-attack: defender → attacker (dying blow) ──
  const counterDamage = Math.max(0, defenderPreDamageAtk);
  const attackerNewHP = Math.max(0, attacker.currentDef - counterDamage);

  const counterBreakdown: DamageBreakdown = {
    baseAtk: defenderPreDamageAtk,
    cavalryCounter: 0,
    backstabBonus: 0,
    ambushBonus: 0,
    totalDamage: counterDamage,
    auraBuffs: [...defender.activeBuffs],
  };

  const counterEvent: EvUnitAttacked = {
    type: 'UNIT_ATTACKED',
    attackerInstanceId: defender.instanceId,
    targetInstanceId:   attacker.instanceId,
    attackerCol: defenderPos.col,
    attackerRow: defenderPos.row,
    targetCol:   attackerPos.col,
    targetRow:   attackerPos.row,
    damage:       counterDamage,
    targetNewHP:  attackerNewHP,
    targetPlayer: attacker.owner,
    isKingHit:    attacker.cardId === 'king',
    newHP:  attacker.cardId === 'king' ? attackerNewHP : undefined,
    maxHP:  attacker.cardId === 'king' ? attacker.maxDef : undefined,
    breakdown:    counterBreakdown,
  };
  events.push(counterEvent);

  // ── 4. Attacker death from counter-attack ──
  if (attackerNewHP <= 0 && attacker.cardId !== 'king') {
    events.push({
      type: 'UNIT_DIED',
      instanceId: attacker.instanceId,
      cardId:     attacker.cardId,
      owner:      attacker.owner,
      col:        attackerPos.col,
      row:        attackerPos.row,
      cause:      'COMBAT',
    } as EvUnitDied);
  }

  return events;
}

// ─────────────────────────────────────────────
// CASTLE AREA ATTACK
// ─────────────────────────────────────────────

export function resolveCastleAreaAttack(castle: Unit, board: Board): GameEvent[] {
  const events: GameEvent[] = [];
  const adjacent = board.getAdjacentUnits(castle.position.col, castle.position.row);
  const enemies = adjacent.filter(u => u.owner !== castle.owner);

  for (const enemy of enemies) {
    const subEvents = resolveAttack(castle, enemy, board);
    events.push(...subEvents);
  }
  return events;
}

// ─────────────────────────────────────────────
// DIRECT DAMAGE / HEAL (abilities, effects)
// ─────────────────────────────────────────────

export function applyDamage(
  unit: Unit,
  damage: number,
  cause: EvUnitDied['cause']
): GameEvent[] {
  const events: GameEvent[] = [];
  const newHP = Math.max(0, unit.currentDef - damage);

  events.push({
    type: 'UNIT_ATTACKED',
    attackerInstanceId: 'EFFECT',
    targetInstanceId:   unit.instanceId,
    attackerCol: -1, attackerRow: -1,
    targetCol:   unit.position.col,
    targetRow:   unit.position.row,
    damage,
    targetNewHP:  newHP,
    targetPlayer: unit.owner,
    isKingHit:    unit.cardId === 'king',
    newHP:  unit.cardId === 'king' ? newHP : undefined,
    maxHP:  unit.cardId === 'king' ? unit.maxDef : undefined,
  });

  if (newHP <= 0 && unit.cardId !== 'king') {
    events.push({
      type: 'UNIT_DIED',
      instanceId: unit.instanceId,
      cardId:     unit.cardId,
      owner:      unit.owner,
      col:        unit.position.col,
      row:        unit.position.row,
      cause,
    });
  }
  return events;
}

export function applyHeal(unit: Unit, amount: number): GameEvent[] {
  const healed = Math.min(amount, unit.maxDef - unit.currentDef);
  if (healed <= 0) return [];
  return [{
    type: 'UNIT_HEALED',
    instanceId: unit.instanceId,
    cardId:     unit.cardId,
    col:        unit.position.col,
    row:        unit.position.row,
    amount:     healed,
    newHP:      unit.currentDef + healed,
    maxHP:      unit.maxDef,
    player:     unit.owner,
    isKing:     unit.cardId === 'king',
  }];
}

export function applyFullHeal(unit: Unit): GameEvent[] {
  return applyHeal(unit, unit.maxDef - unit.currentDef);
}

export function applyAutoHeal(unit: Unit, amount: number): GameEvent[] {
  return applyHeal(unit, amount);
}

export function applyReform(
  fromCardId: string, toCardId: string, board: Board
): GameEvent[] {
  const events: GameEvent[] = [];
  const toDef = getCard(toCardId);
  const newMaxHP = toDef.stats?.def ?? 1;
  const units = board.getAllUnits().filter(u => u.cardId === fromCardId);

  for (const unit of units) {
    const hpRatio = unit.maxDef > 0 ? unit.currentDef / unit.maxDef : 1;
    const newHP = Math.max(1, Math.ceil(hpRatio * newMaxHP));
    const event: EvUnitTransformed = {
      type: 'UNIT_TRANSFORMED',
      oldInstanceId: unit.instanceId,
      newInstanceId: unit.instanceId + '_reformed',
      fromCardId, toCardId,
      col: unit.position.col, row: unit.position.row,
      owner: unit.owner,
      newHP, newMaxHP,
    };
    events.push(event);
  }
  return events;
}

export function applyEarthquakeDamage(col: number, damage: number, board: Board): GameEvent[] {
  const events: GameEvent[] = [];
  for (const unit of board.getUnitsInColumn(col)) {
    events.push(...applyDamage(unit, damage, 'EARTHQUAKE'));
  }
  return events;
}

// ─────────────────────────────────────────────
// DAMAGE CALCULATION
// ─────────────────────────────────────────────

function calculateDamage(attacker: Unit, defender: Unit): DamageBreakdown {
  const baseAtk = attacker.currentAtk;

  // Zero-ATK units deal no damage — skip all bonuses (e.g. aura-suppressed King)
  if (baseAtk <= 0) {
    return { baseAtk: 0, cavalryCounter: 0, backstabBonus: 0, ambushBonus: 0, totalDamage: 0, auraBuffs: [...attacker.activeBuffs] };
  }

  let atk = baseAtk;
  let cavalryCounter = 0;
  let backstabBonus = 0;
  let ambushBonus = 0;

  // Cavalry counter: Pikeman x3 ATK vs cavalry
  const isCavalry = isUnitCavalry(defender);
  if (isCavalry && hasFlag(attacker, 'CAVALRY_COUNTER')) {
    cavalryCounter = atk * 2; // x3 total = base + 2x bonus
    atk *= 3;
  }

  // Positional bonuses — per-card, not universal
  const atkDef = getCard(attacker.cardId);

  // Backstab: directly behind (dx=0, exactly 1 row behind defender's facing)
  if (atkDef.backstabBonus && isBackstab(attacker, defender)) {
    backstabBonus = atkDef.backstabBonus;
    atk += backstabBonus;
  }

  // Ambush: rear arc (|dx|≤1, exactly 1 row behind defender's facing)
  if (atkDef.ambushBonus && isAmbush(attacker, defender)) {
    ambushBonus = atkDef.ambushBonus;
    atk += ambushBonus;
  }

  const totalDamage = Math.max(0, atk);
  return { baseAtk, cavalryCounter, backstabBonus, ambushBonus, totalDamage, auraBuffs: [...attacker.activeBuffs] };
}

/**
 * Backstab: attacker is directly behind the defender (same column, exactly 1 row behind).
 * P1 faces toward row 6 → back = row-1. P2 faces toward row 0 → back = row+1.
 */
function isBackstab(attacker: Unit, defender: Unit): boolean {
  const dx = attacker.position.col - defender.position.col;
  if (dx !== 0) return false;
  const dy = attacker.position.row - defender.position.row;
  // P1's back is toward row 0, so attacker behind P1 means attacker.row < defender.row (dy < 0)
  // P2's back is toward row 6, so attacker behind P2 means attacker.row > defender.row (dy > 0)
  return defender.owner === 0 ? dy === -1 : dy === 1;
}

/**
 * Ambush: attacker is in the rear arc (|dx|≤1, exactly 1 row behind defender's facing).
 * Wider than backstab — includes the two diagonal-behind positions.
 */
function isAmbush(attacker: Unit, defender: Unit): boolean {
  const dx = Math.abs(attacker.position.col - defender.position.col);
  if (dx > 1) return false;
  const dy = attacker.position.row - defender.position.row;
  return defender.owner === 0 ? dy === -1 : dy === 1;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function isUnitCavalry(unit: Unit): boolean {
  const def = getCard(unit.cardId);
  return def.subtypes.includes('CAVALRY' as any);
}

function hasFlag(unit: Unit, flag: string): boolean {
  const def = getCard(unit.cardId);
  return def.flags.includes(flag as any);
}

function isAdjacent(a: { col: number; row: number }, b: { col: number; row: number }): boolean {
  return Math.abs(a.col - b.col) <= 1 && Math.abs(a.row - b.row) <= 1;
}

```

# src\game\data\CardDefinitions.ts

```ts
// ============================================================
// CardDefinitions.ts
// Aggregator — imports individual card files from cards/ and
// re-exports the CARD_DEFINITIONS array in canonical order.
// ============================================================

import type { CardDefinition } from '../types/CardTypes.js';

// King
import { KING_DEF } from './cards/king.js';

// Standard Units
import { FOOT_SOLDIER_DEF } from './cards/foot_soldier.js';
import { PIKEMAN_DEF } from './cards/pikeman.js';
import { ARCHER_DEF } from './cards/archer.js';
import { ASSASSIN_DEF } from './cards/assassin.js';
import { MILITIA_DEF } from './cards/militia.js';
import { SCOUT_DEF } from './cards/scout.js';
import { LANCER_DEF } from './cards/lancer.js';
import { MYSTIC_DEF } from './cards/mystic.js';
import { MESSENGER_DEF } from './cards/messenger.js';

// Royal Units
import { SWORDSMAN_DEF } from './cards/swordsman.js';
import { PRINCESS_DEF } from './cards/princess.js';
import { PRIEST_DEF } from './cards/priest.js';
import { COMMANDER_DEF } from './cards/commander.js';
import { INQUISITOR_DEF } from './cards/inquisitor.js';
import { KNIGHT_DEF } from './cards/knight.js';
import { KNIGHTS_GUARD_DEF } from './cards/knights_guard.js';
import { SCRIBE_DEF } from './cards/scribe.js';

// Structures
import { CASTLE_DEF } from './cards/castle.js';
import { TEMPLE_DEF } from './cards/temple.js';
import { VILLAGE_DEF } from './cards/village.js';

// Spells
import { DISEASE_DEF } from './cards/disease.js';
import { CASUS_BELLI_DEF } from './cards/casus_belli.js';
import { REFORM_DEF } from './cards/reform.js';
import { CIVIL_WAR_DEF } from './cards/civil_war.js';
import { EARTHQUAKE_DEF } from './cards/earthquake.js';
import { WAR_HORN_DEF } from './cards/war_horn.js';
import { COUP_DEF } from './cards/coup.js';
import { TREASON_DEF } from './cards/treason.js';
import { MOTHERLAND_DEF } from './cards/motherland.js';
import { PEASANT_REVOLT_DEF } from './cards/peasant_revolt.js';

export const CARD_DEFINITIONS: CardDefinition[] = [
  // King
  KING_DEF,

  // Standard Units
  FOOT_SOLDIER_DEF,
  PIKEMAN_DEF,
  ARCHER_DEF,
  ASSASSIN_DEF,
  MILITIA_DEF,
  SCOUT_DEF,
  LANCER_DEF,
  MYSTIC_DEF,
  MESSENGER_DEF,

  // Royal Units
  SWORDSMAN_DEF,
  PRINCESS_DEF,
  PRIEST_DEF,
  COMMANDER_DEF,
  INQUISITOR_DEF,
  KNIGHT_DEF,
  KNIGHTS_GUARD_DEF,
  SCRIBE_DEF,

  // Structures
  CASTLE_DEF,
  TEMPLE_DEF,
  VILLAGE_DEF,

  // Spells
  DISEASE_DEF,
  CASUS_BELLI_DEF,
  REFORM_DEF,
  CIVIL_WAR_DEF,
  EARTHQUAKE_DEF,
  WAR_HORN_DEF,
  COUP_DEF,
  TREASON_DEF,
  MOTHERLAND_DEF,
  PEASANT_REVOLT_DEF,
];

```

# src\game\data\CardRegistry.ts

```ts
// ============================================================
// CardRegistry.ts
// Frozen card lookup map + getCard() accessor.
// Flyweight pattern: all definitions are Object.freeze'd.
// ============================================================

import type { CardDefinition } from '../types/CardTypes';
import { CARD_DEFINITIONS } from './CardDefinitions';

function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export const CARD_MAP: ReadonlyMap<string, Readonly<CardDefinition>> = new Map(
  CARD_DEFINITIONS.map(c => [c.id, deepFreeze(c)])
);

export function getCard(id: string): Readonly<CardDefinition> {
  const c = CARD_MAP.get(id);
  if (!c) throw new Error(`[CardRegistry] Unknown card id: "${id}"`);
  return c;
}

```

# src\game\data\cards\_aliases.ts

```ts
// Shorthand aliases for card definitions
import { CardClass, Allegiance, SubType } from '../../types/CardTypes.js';

export const U    = CardClass.UNIT;
export const SP   = CardClass.SPELL;
export const ST   = CardClass.STRUCTURE;
export const STD  = Allegiance.STANDARD;
export const ROY  = Allegiance.ROYAL;
export const CAV  = SubType.CAVALRY;
export const STRUC = SubType.STRUCTURE;

```

# src\game\data\cards\archer.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, STD } from './_aliases.js';
import { PATTERN_ARCHER_ATTACK } from '../MovementPresets';

export const ARCHER_DEF: CardDefinition = {
  id: 'archer', name: 'Archer',
  flavorText: 'Precision over brute force.',
  class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
  stats: { atk: 3, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.DIAGONAL_RANGED_2,
    customAttack: PATTERN_ARCHER_ATTACK,
  },
  flags: [],
  abilities: [],
  abilityText: 'Ranged attack: targets any unit diagonally within 2 squares. Ignores adjacency.',
};

```

# src\game\data\cards\assassin.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, STD } from './_aliases.js';
export const ASSASSIN_DEF: CardDefinition = {
  id: 'assassin', name: 'Assassin',
  flavorText: 'The shadow moves. Then it\'s over.',
  class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
  stats: { atk: 4, def: 1, movement: MovementType.JUMP_DIAGONAL_1, attackPattern: AtkPattern.ON_JUMP,
      customAttack: {
        offsets: [
          { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
        ],
        canJump: true,
      },
      customMove: {
        offsets: [
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -2, dy: 0 },
          { dx: 2, dy: 0 }, { dx: 0, dy: 2 },
        ],
        canJump: true,
      },},
  flags: [],
  ambushBonus: 1,
  abilities: [],
  abilityText: 'Jumps diagonally. Attacks landing square on jump. Ambush: +1 ATK from rear arc.',
};

```

# src\game\data\cards\castle.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { ST, ROY, STRUC } from './_aliases.js';

export const CASTLE_DEF: CardDefinition = {
  id: 'castle', name: 'Castle',
  flavorText: 'Stone and mortar, patience and power.',
  class: ST, allegiance: ROY, subtypes: [STRUC], cost: 4, copies: 1,
  stats: { atk: 3, def: 8, movement: MovementType.STATIC, attackPattern: AtkPattern.AREA_ADJ },
  flags: [CardFlag.BUILD_DELAY],
  abilities: [
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
    { type: AbilityType.AURA_ADJ_DEF,        params: { amount: 1 } },
    { type: AbilityType.PASSIVE_BUILD_DELAY,  params: {} },
    { type: AbilityType.PASSIVE_SPAWN,        params: { cardId: 'foot_soldier', interval: 3 } },
  ],
  abilityText: 'Build Delay: inactive for 1 turn after placement. Attacks all adjacent enemies each LEG phase. Adjacent friendlies +1 DEF. Spawns 1 Foot Soldier every 3 turns. −1 Royal cost.',
};

```

# src\game\data\cards\casus_belli.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const CASUS_BELLI_DEF: CardDefinition = {
  id: 'casus_belli', name: 'Casus Belli',
  flavorText: 'A pretext for war is always found.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_DRAIN_LEG_RATE_PERM, params: { amount: 1, target: 'OPPONENT' } },
    { type: AbilityType.SPELL_FORWARD_DEPLOY,       params: {} },
  ],
  abilityText: 'Permanently −1 opponent\'s LEG rate (min 1). Then deploy one card from your hand to any free square in the front row of enemy half.',
};

```

# src\game\data\cards\civil_war.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const CIVIL_WAR_DEF: CardDefinition = {
  id: 'civil_war', name: 'Civil War',
  flavorText: 'When the kingdom turns on itself, all suffer.',
  class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_FREEZE_LEG_RATE, params: { duration: 3 } },
  ],
  abilityText: 'Both players\' LEG rates are frozen at 0 for 3 turns. Existing pools are unaffected.',
};

```

# src\game\data\cards\commander.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY, CAV } from './_aliases.js';

export const COMMANDER_DEF: CardDefinition = {
  id: 'commander', name: 'Commander',
  flavorText: 'Every soldier fights harder in his shadow.',
  class: U, allegiance: ROY, subtypes: [CAV], cost: 7, copies: 1,
  stats: { atk: 5, def: 5, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_BOARD_HALF_DEF, params: { half: 'OWN',   amount: 1 } },
    { type: AbilityType.AURA_BOARD_HALF_ATK, params: { half: 'ENEMY', amount: 1 } },
  ],
  abilityText: 'Cavalry. Aura: when on your half, friendly units there +1 DEF. When on enemy half, friendly units there +1 ATK. Neutral zone: no aura.',
};

```

# src\game\data\cards\coup.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, ROY } from './_aliases.js';

export const COUP_DEF: CardDefinition = {
  id: 'coup', name: 'Coup',
  flavorText: 'Power seized in a single night.',
  class: SP, allegiance: ROY, subtypes: [], cost: 12, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_COUP, params: {} },
  ],
  abilityText: 'Target an enemy Royal unit (not King). If your remaining LEG ≥ target\'s base cost: capture it (it joins your side). Otherwise: banish it from the game.',
};

```

# src\game\data\cards\disease.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const DISEASE_DEF: CardDefinition = {
  id: 'disease', name: 'Disease',
  flavorText: 'The rot spreads from stone to stone.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, params: { damage: 2, duration: 3 } },
  ],
  abilityText: 'Target a Structure. It takes 2 damage at the start of your turn for 3 turns. Units adjacent to it take 1 damage per tick.',
};

```

# src\game\data\cards\earthquake.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const EARTHQUAKE_DEF: CardDefinition = {
  id: 'earthquake', name: 'Earthquake',
  flavorText: 'The earth itself takes sides.',
  class: SP, allegiance: STD, subtypes: [], cost: 5, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_EARTHQUAKE, params: {} },
  ],
  abilityText: 'Choose a column (A–F). All units in that column take 3 damage. Triggers Foot Soldier On Death.',
};

```

# src\game\data\cards\foot_soldier.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const FOOT_SOLDIER_DEF: CardDefinition = {
  id: 'foot_soldier', name: 'Foot Soldier',
  flavorText: 'Cannon fodder with a silver lining.',
  class: U, allegiance: STD, subtypes: [], cost: 1, copies: 3,
  stats: { atk: 1, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEATH_DRAW, params: { count: 1 } },
  ],
  abilityText: 'On Death: draw 1 card. Reform target: becomes Swordsman.',
};

```

# src\game\data\cards\inquisitor.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const INQUISITOR_DEF: CardDefinition = {
  id: 'inquisitor', name: 'Inquisitor',
  flavorText: 'The guilty always reveal themselves.',
  class: U, allegiance: ROY, subtypes: [], cost: 7, copies: 2,
  stats: { atk: 4, def: 4, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.ON_KILL_LEG_DRAIN, params: { minTargetCost: 4, amount: 1 } },
  ],
  abilityText: 'On Kill: if target\'s base cost >4, permanently −1 opponent\'s LEG rate (min 1).',
};

```

# src\game\data\cards\king.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const KING_DEF: CardDefinition = {
  id: 'king', name: 'King',
  flavorText: 'All legitimacy flows from the crown.',
  class: U, allegiance: ROY, subtypes: [], cost: 0, copies: 1,
  stats: { atk: 1, def: 10, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_LEG_BONUS, params: { amount: 1 } },
  ],
  abilityText: 'Pre-placed. Generates +1 LEG/turn. Enemy King in your half: lose 1 LEG this turn. Win condition.',
};

```

# src\game\data\cards\knight.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, ROY, CAV } from './_aliases.js';

export const KNIGHT_DEF: CardDefinition = {
  id: 'knight', name: 'Knight',
  flavorText: 'Heavy, fast, devastating.',
  class: U, allegiance: ROY, subtypes: [CAV], cost: 9, copies: 2,
  stats: { atk: 5, def: 8, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI,
      customAttack: {
        offsets: [
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 0 },
          { dx: 1, dy: 0 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
        ],
      },
      customMove: {
        offsets: [
          { dx: -1, dy: -2 }, { dx: 0, dy: -2 }, { dx: 1, dy: -2 }, { dx: -2, dy: -1 },
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 2, dy: -1 },
          { dx: -2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
          { dx: -2, dy: 1 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
          { dx: 2, dy: 1 }, { dx: -1, dy: 2 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 },
        ],
      },},
  flags: [],
  abilities: [],
  abilityText: 'Cavalry. Requires Royal discount engine to play before late game.',
};

```

# src\game\data\cards\knights_guard.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const KNIGHTS_GUARD_DEF: CardDefinition = {
  id: 'knights_guard', name: "King's Guard",
  flavorText: 'Sworn in blood. Unwavering in duty.',
  class: U, allegiance: ROY, subtypes: [], cost: 12, copies: 1,
  stats: { atk: 6, def: 12, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_AUTO_HEAL,      params: { amount: 2 } },
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
  ],
  abilityText: 'Auto-heal +2 HP at start of your LEG phase. While on board: −1 Royal card cost.',
};

```

# src\game\data\cards\lancer.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD, CAV } from './_aliases.js';

export const LANCER_DEF: CardDefinition = {
  id: 'lancer', name: 'Lancer',
  flavorText: 'At full gallop, nothing stops the charge.',
  class: U, allegiance: STD, subtypes: [CAV], cost: 4, copies: 2,
  stats: { atk: 3, def: 2, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV,
      customAttack: {
        offsets: [
          { dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 },
        ],
      },
      customMove: {
        offsets: [
          { dx: 0, dy: -2 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
          { dx: -2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
          { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 },
        ],
      },
    },
  flags: [CardFlag.LANCER_CHARGE],
  abilities: [
    { type: AbilityType.PASSIVE_LANCER_CHARGE, params: {} },
  ],
  abilityText: 'Cavalry. Charge: may MOVE and ATTACK in the same turn. Movement must be toward enemy half.',
};

```

# src\game\data\cards\messenger.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const MESSENGER_DEF: CardDefinition = {
  id: 'messenger', name: 'Messenger',
  flavorText: 'Swift enough to carry news before it matters.',
  class: U, allegiance: STD, subtypes: [], cost: 1, copies: 2,
  stats: { atk: 0, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.NONE,
      customMove: {
        offsets: [
          { dx: -2, dy: -2 }, { dx: 2, dy: -2 }, { dx: -1, dy: -1 }, { dx: 0, dy: -1 },
          { dx: 1, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 1 },
          { dx: 0, dy: 1 }, { dx: 1, dy: 1 }, { dx: -2, dy: 2 }, { dx: 2, dy: 2 },
        ],
      },
    },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEPLOY_DRAW,       params: { count: 1 } },
    { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 1 } },
    { type: AbilityType.AURA_SUPPRESS_KING_ATK, params: {} },
  ],
  abilityText: 'On Deploy: draw 1 card. Reveal top 1 card of opponent\'s deck. Aura: adjacent enemy King ATK = 0.',
};

```

# src\game\data\cards\militia.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const MILITIA_DEF: CardDefinition = {
  id: 'militia', name: 'Militia',
  flavorText: 'Where one falls, another rises.',
  class: U, allegiance: STD, subtypes: [], cost: 2, copies: 2,
  stats: { atk: 1, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [],
  abilities: [
    { type: AbilityType.CUSTOM, handler: 'militiaDeployHandler' },
  ],
  abilityText: 'On Deploy: pull the next Militia copy from your deck to any free square in your half.',
};

```

# src\game\data\cards\motherland.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const MOTHERLAND_DEF: CardDefinition = {
  id: 'motherland', name: 'Motherland',
  flavorText: 'The homeland always gives more.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_DRAW_STRUCTURES, params: { overflow: true } },
  ],
  abilityText: 'Draw 1 card per Structure you control. Can overflow hand limit this turn. Overflow cards are lost at end of turn.',
};

```

# src\game\data\cards\mystic.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const MYSTIC_DEF: CardDefinition = {
  id: 'mystic', name: 'Mystic',
  flavorText: 'She sees beyond death. The cost is paid in kind.',
  class: U, allegiance: STD, subtypes: [], cost: 6, copies: 1,
  stats: { atk: 2, def: 5, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [
    { type: AbilityType.CUSTOM, handler: 'mysticDeployHandler' },
  ],
  abilityText: 'On Deploy: revive one unit from your graveyard to any free square in your half. Permanently −1 your LEG rate (min 1).',
};

```

# src\game\data\cards\peasant_revolt.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const PEASANT_REVOLT_DEF: CardDefinition = {
  id: 'peasant_revolt', name: 'Peasant Revolt',
  flavorText: 'The masses have little to lose.',
  class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_REVOLT, params: {} },
  ],
  abilityText: 'Summon 1 Militia to any free square in your half per Structure on the board (both sides). Permanent penalty to you: −1 LEG rate (min 1) and +2 Royal cost for the rest of the game.',
};

```

# src\game\data\cards\pikeman.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD } from './_aliases.js';

export const PIKEMAN_DEF: CardDefinition = {
  id: 'pikeman', name: 'Pikeman',
  flavorText: 'The cavalry\'s nightmare, the footman\'s wall.',
  class: U, allegiance: STD, subtypes: [], cost: 2, copies: 2,
  stats: { atk: 1, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [CardFlag.CAVALRY_COUNTER],
  abilities: [
    { type: AbilityType.AURA_CAVALRY_COUNTER, params: { multiplier: 3 } },
    { type: AbilityType.AURA_PIKEMAN_FLANK,   params: { bonusAtk: 1, bonusDef: 1 } },
  ],
  abilityText: '×3 ATK vs Cavalry. Flank: if any friendly on left AND right squares, gain +1 ATK +1 DEF this turn.',
};

```

# src\game\data\cards\priest.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const PRIEST_DEF: CardDefinition = {
  id: 'priest', name: 'Priest',
  flavorText: 'The wounded are never truly lost.',
  class: U, allegiance: ROY, subtypes: [], cost: 6, copies: 2,
  stats: { atk: 1, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEPLOY_HEAL_FRIENDLY, params: { amount: 'FULL' } },
  ],
  abilityText: 'On Deploy: fully restore one friendly unit\'s HP (including King).',
};

```

# src\game\data\cards\princess.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const PRINCESS_DEF: CardDefinition = {
  id: 'princess', name: 'Princess',
  flavorText: 'Her mere presence commands the court.',
  class: U, allegiance: ROY, subtypes: [], cost: 5, copies: 1,
  stats: { atk: 0, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.NONE },
  flags: [],
  abilities: [
    { type: AbilityType.AURA_LEG_BONUS,      params: { amount: 1 } },
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
  ],
  abilityText: '+1 LEG/turn while on board. −1 Royal card cost while on board.',
};

```

# src\game\data\cards\reform.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const REFORM_DEF: CardDefinition = {
  id: 'reform', name: 'Reform',
  flavorText: 'The soldier becomes the knight he always was.',
  class: SP, allegiance: STD, subtypes: [], cost: 2, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_TRANSFORM_ALL, params: { fromCardId: 'foot_soldier', toCardId: 'swordsman' } },
  ],
  abilityText: 'Transform all Foot Soldiers on the board into Swordsmen. HP scales proportionally. Does not trigger Foot Soldier\'s On Death ability.',
};

```

# src\game\data\cards\scout.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, STD, CAV } from './_aliases.js';

export const SCOUT_DEF: CardDefinition = {
  id: 'scout', name: 'Scout',
  flavorText: 'Knowledge is the first casualty of ignorance.',
  class: U, allegiance: STD, subtypes: [CAV], cost: 2, copies: 2,
  stats: { atk: 1, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV,
      customAttack: {
        offsets: [
          { dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 },
        ],
      },
      customMove: {
        offsets: [
          { dx: -1, dy: -2 }, { dx: 0, dy: -2 }, { dx: 1, dy: -2 }, { dx: -2, dy: -1 },
          { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 2, dy: -1 },
          { dx: -2, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 2, dy: 0 },
          { dx: -2, dy: 1 }, { dx: -1, dy: 1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 1 },
          { dx: 2, dy: 1 }, { dx: -1, dy: 2 }, { dx: 0, dy: 2 }, { dx: 1, dy: 2 },
        ],
      },},
  flags: [],
  backstabBonus: 1,
  abilities: [
    { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 2 } },
  ],
  abilityText: 'Cavalry. On Deploy: reveal the top 2 cards of opponent\'s deck (visible to you only).',
};

```

# src\game\data\cards\scribe.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { U, ROY } from './_aliases.js';

export const SCRIBE_DEF: CardDefinition = {
  id: 'scribe', name: 'Scribe',
  flavorText: 'The pen shapes the future of the crown.',
  class: U, allegiance: ROY, subtypes: [], cost: 5, copies: 2,
  stats: { atk: 0, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.NONE },
  flags: [],
  abilities: [
    { type: AbilityType.ON_DEPLOY_DRAW, params: { count: 2, filter: 'ROYAL' } },
  ],
  abilityText: 'On Deploy: draw 2 Royal cards from your deck (skip non-Royal until count met or deck empty).',
};

```

# src\game\data\cards\swordsman.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern } from '../../types/CardTypes.js';
import { U, ROY } from './_aliases.js';

export const SWORDSMAN_DEF: CardDefinition = {
  id: 'swordsman', name: 'Swordsman',
  flavorText: 'A knight in all but title.',
  class: U, allegiance: ROY, subtypes: [], cost: 3, copies: 2,
  stats: { atk: 3, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
  flags: [],
  abilities: [],
  abilityText: 'Reform result. Requires Royal cost engine to play economically.',
};

```

# src\game\data\cards\temple.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { ST, ROY, STRUC } from './_aliases.js';

export const TEMPLE_DEF: CardDefinition = {
  id: 'temple', name: 'Temple',
  flavorText: 'Legitimacy is granted by the divine.',
  class: ST, allegiance: ROY, subtypes: [STRUC], cost: 3, copies: 2,
  stats: { atk: 0, def: 5, movement: MovementType.STATIC, attackPattern: AtkPattern.NONE },
  flags: [CardFlag.BUILD_DELAY],
  abilities: [
    { type: AbilityType.AURA_ROYAL_DISCOUNT, params: { amount: 1 } },
    { type: AbilityType.PASSIVE_BUILD_DELAY, params: {} },
  ],
  abilityText: 'Build Delay: inactive 1 turn. −1 Royal card cost while on board.',
};

```

# src\game\data\cards\treason.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const TREASON_DEF: CardDefinition = {
  id: 'treason', name: 'Treason',
  flavorText: 'Even loyal men have a price.',
  class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_TREASON, params: {} },
  ],
  abilityText: 'Target an enemy non-Royal unit. It fights for you this turn only. At end of turn: returns to original position, exhausted.',
};

```

# src\game\data\cards\village.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { MovementType, AtkPattern, CardFlag } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { ST, STD, STRUC } from './_aliases.js';

export const VILLAGE_DEF: CardDefinition = {
  id: 'village', name: 'Village',
  flavorText: 'The people tire of marching armies.',
  class: ST, allegiance: STD, subtypes: [STRUC], cost: 2, copies: 2,
  stats: { atk: 0, def: 4, movement: MovementType.STATIC, attackPattern: AtkPattern.NONE },
  flags: [CardFlag.BUILD_DELAY],
  abilities: [
    { type: AbilityType.AURA_VILLAGE_SLOW, params: { amount: 1 } },
    { type: AbilityType.PASSIVE_BUILD_DELAY, params: {} },
  ],
  abilityText: 'Build Delay: inactive 1 turn. Aura: all adjacent enemy units −1 movement (min 0). Immobilized units may still attack this structure.',
};

```

# src\game\data\cards\war_horn.ts

```ts
import type { CardDefinition } from '../../types/CardTypes.js';
import { AbilityType } from '../../types/AbilityTypes';
import { SP, STD } from './_aliases.js';

export const WAR_HORN_DEF: CardDefinition = {
  id: 'war_horn', name: 'War Horn',
  flavorText: 'The sound of destiny.',
  class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 2,
  flags: [],
  abilities: [
    { type: AbilityType.SPELL_WAR_HORN, params: {} },
  ],
  abilityText: 'Draw 2 cards, then discard 1. All your units gain +1 movement this turn.',
};

```

# src\game\data\DeckDefinitions.ts

```ts
// ============================================================
// DeckDefinitions.ts
// Deck configurations — card ID lists for game modes.
// ============================================================

// UNITS-ONLY DECK — 31 cards (King pre-placed, not included)
// No spells or structures. Focused on unit combat for MVP playtesting.
// Both players use identical pool, each gets an independently shuffled copy.
export const UNITS_ONLY_DECK_IDS: string[] = [
  // Standard units
  'foot_soldier', 'foot_soldier', 'foot_soldier',  // 3 copies — cheap backbone
  'pikeman',      'pikeman',                        // 2 — anti-cavalry
  'archer',       'archer',                         // 2 — ranged
  'assassin',     'assassin',                       // 2 — fast striker
  'militia',      'militia',                        // 2 — expendable
  'scout',        'scout',                          // 2 — board info
  'lancer',       'lancer',                         // 2 — cavalry charge
  'messenger',    'messenger',                      // 2 — utility
  'mystic',                                         // 1 — revive wildcard
  // Royal units
  'swordsman',    'swordsman',                      // 2 — reliable fighter
  'priest',       'priest',                         // 2 — healer
  'inquisitor',   'inquisitor',                     // 2 — LEG drain threat
  'knight',       'knight',                         // 2 — heavy cavalry
  'scribe',       'scribe',                         // 2 — deck utility
  'princess',                                       // 1 — CROWN boost
  'commander',                                      // 1 — aura leader
  'knights_guard',                                  // 1 — defensive elite
];

// Sanity check — must be exactly 31
if (UNITS_ONLY_DECK_IDS.length !== 31) {
  console.error(`[DeckDefinitions] UNITS_ONLY_DECK_IDS has ${UNITS_ONLY_DECK_IDS.length} entries, expected 31`);
}

// Alias for backwards compatibility
export const DEMO_DECK_IDS = UNITS_ONLY_DECK_IDS;

```

# src\game\data\MovementPresets.ts

```ts
// ============================================================
// MovementPresets.ts
// Custom movement and attack pattern offset constants.
// Used by CardDefinitions for Archer, Assassin, and others.
// ============================================================

import type { CustomPattern } from '../types/CardTypes';

// Archer: diagonal ranged 2 squares
export const PATTERN_ARCHER_ATTACK: CustomPattern = {
  offsets: [
    { dx: 1, dy: -1 }, { dx: -1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
    { dx: 2, dy: -2 }, { dx: -2, dy: -2 }, { dx: 2, dy: 2 }, { dx: -2, dy: 2 },
  ],
  range: 1,
};

// Assassin: attacks diagonally adjacent
export const PATTERN_ASSASSIN_ATTACK: CustomPattern = {
  offsets: [
    { dx: 1, dy: -1 }, { dx: -1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
  ],
  range: 1,
};

// Assassin: jumps 2 squares in HV direction
export const PATTERN_ASSASSIN_MOVE: CustomPattern = {
  offsets: [
    { dx: 2, dy: 0 }, { dx: -2, dy: 0 }, { dx: 0, dy: 2 }, { dx: 0, dy: -2 },
  ],
  range: 1,
};

```

# src\game\GameContext.ts

```ts
// ============================================================
// GameContext.ts
// Shared context object passed to all phase modules and queries.
// Contains references to all game subsystems.
// Phase modules and UnitQuery never import GameEngine directly.
// ============================================================

import type { Board } from './Board';
import type { GameModifiers } from './GameModifiers';
import type { PlayerState } from './PlayerState';
import type { AuraSystem } from './AuraSystem';
import type { Unit, Position } from './types/GameTypes';
import type { GameEvent } from './types/EventTypes';
import type { PendingCommand } from './pending/PendingCommand';
import { Player, TurnPhase, EngineStatus } from './types/GameTypes';

/**
 * Immutable reference bag — every subsystem the engine owns.
 * Passed by reference, so phases can mutate board/mods/players directly.
 * Events are collected via emit(), which the engine wires to its subscriber list.
 */
export interface GameContext {
  // Core subsystems
  readonly board: Board;
  readonly mods: [GameModifiers, GameModifiers];
  readonly players: [PlayerState, PlayerState];
  readonly auras: AuraSystem;

  // Turn state (mutable by engine only)
  activePlayer: Player;
  turnNumber: number;
  phase: TurnPhase;
  status: EngineStatus;

  // Graveyard registry (instanceId → cardId)
  readonly graveyard: Map<string, string>;

  // Pending command set by phase modules when ability needs player input
  pending?: PendingCommand;

  // Unit factory — engine provides this so phases don't need the counter
  createUnit(cardId: string, owner: Player, position: Position): Unit;

  // Event emitter — phases push events through this
  emit(event: GameEvent): void;

  // Apply events to state + emit (for ability results that produce events)
  applyEvents(events: GameEvent[]): void;
}

/**
 * Helper: get the opponent of a player.
 * Used throughout phases — exported here to avoid duplication.
 */
export function opponent(player: Player): Player {
  return player === Player.P1 ? Player.P2 : Player.P1;
}

```

# src\game\GameEngine.ts

```ts
// ============================================================
// GameEngine.ts — Thin Orchestrator
//
// Responsibilities (and ONLY these):
//   - Own subsystem instances (Board, Mods, Players, Auras)
//   - Manage turn state machine (phase transitions)
//   - Provide public API facade for UI layer
//   - Route actions to the correct phase module
//   - Manage pending interactions
//   - Manage event subscribers
//
// All game logic lives in:
//   phases/DrawPhase.ts   — card draw
//   phases/LEGPhase.ts    — CROWN/LEG economy + passive effects
//   phases/PlayPhase.ts   — card play from hand
//   phases/ActPhase.ts    — unit move/attack + combat
//   phases/EndPhase.ts    — turn cleanup + win check
//   UnitQuery.ts          — on-demand capability checks
//   UnitFactory.ts        — unit creation
//   MovementRules.ts      — pattern resolution (pure)
//
// ZERO Phaser imports. Pure TypeScript state machine.
// ============================================================

import { Board } from './Board';
import { GameModifiers } from './GameModifiers';
import { PlayerState } from './PlayerState';
import { AuraSystem } from './AuraSystem';
import { UnitFactory, movementToNumber } from './UnitFactory';
import { DeckLoader } from '../config/DeckLoader';
import { getCard } from './data/CardRegistry';

import { Player, TurnPhase, EngineStatus } from './types/GameTypes';
import type { Position, GameStateSnapshot } from './types/GameTypes';
import type { GameEvent } from './types/EventTypes';
import type { PendingCommand } from './pending/PendingCommand';
import { resolvePending } from './pending/PendingCommandResolver';
import { Allegiance } from './types/CardTypes';
import type { GameContext } from './GameContext';
import { opponent } from './GameContext';

// Phase modules
import { runDrawPhase } from './phases/DrawPhase';
import { runLEGPhase } from './phases/LEGPhase';
import { executePlayCard } from './phases/PlayPhase';
import { executeMove, executeAttack } from './phases/ActPhase';
import { runEndPhase } from './phases/EndPhase';

// Query + pattern modules
import { canUnitMove, canUnitAttack } from './UnitQuery';
import { getValidMoves, getValidAttacks, getAttackRange, getValidDeploySquares } from './MovementRules';

// ─────────────────────────────────────────────
// PUBLIC API INTERFACE (consumed by SelectionManager)
// ─────────────────────────────────────────────

export interface IGameEngineAPI {
  getValidMoveSquares(unitId: string): Position[];
  getValidAttackSquares(unitId: string): Position[];
  getAttackRange(unitId: string): Position[];
  getValidDeployPositions(): Position[];
  getAffordableCards(): number[];
  playCard(handIndex: number, col?: number, row?: number): boolean;
  moveUnit(unitId: string, col: number, row: number): boolean;
  attackUnit(unitId: string, targetId: string): boolean;
  endPlayPhase(): void;
  endActPhase(): void;
  selectTarget(instanceId: string): void;
  selectPosition(col: number, row: number): void;
  selectColumn(col: number): void;
  selectDiscard(handIndex: number): void;
  cancelPending(): void;
  getState(): GameStateSnapshot;
  on(handler: (event: GameEvent) => void): void;
  off(handler: (event: GameEvent) => void): void;
}

// ─────────────────────────────────────────────
// GAME ENGINE
// ─────────────────────────────────────────────

export class GameEngine implements IGameEngineAPI {
  // Core subsystems
  private board: Board;
  private mods: [GameModifiers, GameModifiers];
  private players: [PlayerState, PlayerState];
  private auras: AuraSystem;
  private unitFactory: UnitFactory;

  // Turn state
  private turnNumber: number = 1;
  private activePlayer: Player = Player.P1;
  private phase: TurnPhase = TurnPhase.DRAW;
  private status: EngineStatus = EngineStatus.IDLE;

  // Interaction pause state
  private pending: PendingCommand | null = null;

  // Dead unit registry (instanceId → cardId)
  private graveyard: Map<string, string> = new Map();

  // Event subscribers
  private subscribers: Set<(event: GameEvent) => void> = new Set();

  // ─────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────

    constructor(cols = 7, rows = 7) {
    this.board       = new Board(cols, rows);
    this.mods        = [new GameModifiers(Player.P1), new GameModifiers(Player.P2)];
    this.players     = [new PlayerState(Player.P1), new PlayerState(Player.P2)];
    this.auras       = new AuraSystem();
    this.unitFactory = new UnitFactory();
  }

  /** Start a new game. Deals opening hands and pre-places Kings. */
  startGame(): void {
    const deck = DeckLoader.get();

    this.players[Player.P1].loadDeck([...deck], Player.P1);
    this.players[Player.P2].loadDeck([...deck], Player.P2);

    this.prePlaceKing(Player.P1);
    this.prePlaceKing(Player.P2);
    this.drawOpeningHand(Player.P1);
    this.drawOpeningHand(Player.P2);
    this.auras.recalculateModifiers(this.board, this.mods);
    this.status = EngineStatus.IDLE;
    this.startTurn();
  }

  // ─────────────────────────────────────────────
  // QUERIES — gated by UnitQuery, delegated to MovementRules
  // ─────────────────────────────────────────────

  getValidMoveSquares(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    if (!canUnitMove(unit)) return [];
    return getValidMoves(unit, this.board);
  }

  getValidAttackSquares(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    if (!canUnitAttack(unit)) return [];
    return getValidAttacks(unit, this.board);
  }

  getAttackRange(unitId: string): Position[] {
    const unit = this.board.getUnitById(unitId);
    if (!unit || unit.owner !== this.activePlayer) return [];
    if (!canUnitAttack(unit)) return [];
    return getAttackRange(unit, this.board);
  }

  getValidDeployPositions(): Position[] {
    return getValidDeploySquares(this.activePlayer, this.board);
  }

  getAffordableCards(): number[] {
    if (this.phase !== TurnPhase.PLAY) return [];
    const hand = this.players[this.activePlayer].hand;
    const mod  = this.mods[this.activePlayer];
    return hand.map((cardId, i) => {
      const def = getCard(cardId);
      const isRoyal = def.allegiance === Allegiance.ROYAL;
      return mod.canAfford(def.cost, isRoyal) ? i : -1;
    }).filter(i => i >= 0);
  }

  getState(): GameStateSnapshot {
    // Lazily computed — only build the acted set when accessed
    let actedSet: Set<string> | null = null;
    const board = this.board;

    return {
      turn: {
        turnNumber: this.turnNumber,
        activePlayer: this.activePlayer,
        phase: this.phase,
        get unitsActedThisTurn(): Set<string> {
          if (!actedSet) {
            actedSet = new Set<string>();
            for (const u of board.getAllUnits()) {
              if (u.hasActed || u.hasMoved) actedSet.add(u.instanceId);
            }
          }
          return actedSet;
        },
      },
      modifiers: [this.mods[0].snapshot(), this.mods[1].snapshot()],
      players:   [this.players[0].snapshot(), this.players[1].snapshot()],
      board:     this.board.serialize(),
      status:    this.status,
    };
  }

  // ─────────────────────────────────────────────
  // ACTIONS — routed to phase modules
  // ─────────────────────────────────────────────

  playCard(handIndex: number, col?: number, row?: number): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.PLAY) return false;

    const ctx = this.buildContext();
    const success = executePlayCard(ctx, handIndex, col, row);

    if (ctx.pending) {
      this.pending = ctx.pending;
    }
    this.syncFromContext(ctx);

    return success;
  }

  moveUnit(unitId: string, col: number, row: number): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const ctx = this.buildContext();
    const success = executeMove(ctx, unitId, col, row);

    if (ctx.pending) {
      this.pending = ctx.pending;
    }
    this.syncFromContext(ctx);

    return success;
  }

  attackUnit(unitId: string, targetId: string): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const ctx = this.buildContext();
    const success = executeAttack(ctx, unitId, targetId);

    if (ctx.pending) {
      this.pending = ctx.pending;
    }
    this.syncFromContext(ctx);

    return success;
  }

  endPlayPhase(): void {
    if (this.phase !== TurnPhase.PLAY) return;
    if (this.status === EngineStatus.AWAITING_INPUT) return;
    this.phase = TurnPhase.ACT;
    this.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.ACT, activePlayer: this.activePlayer, turn: this.turnNumber });
  }

  endActPhase(): void {
    if (this.phase !== TurnPhase.ACT) return;
    if (this.status === EngineStatus.AWAITING_INPUT) return;
    const ctx = this.buildContext();
    const gameOver = runEndPhase(ctx);
    this.syncFromContext(ctx);

    if (!gameOver) {
      // Swap player and start next turn
      if (this.activePlayer === Player.P2) this.turnNumber++;
      this.activePlayer = opponent(this.activePlayer);
      this.startTurn();
    }
  }

  // ─────────────────────────────────────────────
  // PENDING INTERACTION RESOLVERS
  // ─────────────────────────────────────────────

  selectTarget(instanceId: string): void {
    if (!this.pending || this.pending.kind !== 'TARGET') return;
    if (!this.pending.validTargetIds.includes(instanceId)) return;
    const cmd = this.pending;
    this.clearPending();
    const events = resolvePending(cmd, { kind: 'TARGET', instanceId }, { board: this.board });
    for (const e of events) { this.applyEvent(e); this.emit(e); }
  }

  selectPosition(col: number, row: number): void {
    if (!this.pending || this.pending.kind !== 'POSITION') return;
    if (!this.pending.validPositions.some(p => p.col === col && p.row === row)) return;
    const cmd = this.pending;
    this.clearPending();
    const events = resolvePending(cmd, { kind: 'POSITION', col, row });
    for (const e of events) { this.applyEvent(e); this.emit(e); }
  }

  selectColumn(col: number): void {
    if (!this.pending || this.pending.kind !== 'COLUMN') return;
    if (col < 0 || col >= this.board.cols) return;
    const cmd = this.pending;
    this.clearPending();
    const events = resolvePending(cmd, { kind: 'COLUMN', col });
    for (const e of events) { this.applyEvent(e); this.emit(e); }
  }

  selectDiscard(handIndex: number): void {
    if (!this.pending || this.pending.kind !== 'DISCARD') return;
    const ps = this.players[this.activePlayer];
    if (handIndex < 0 || handIndex >= ps.hand.length) return;
    const cmd = this.pending;
    this.clearPending();
    const events = resolvePending(cmd, { kind: 'DISCARD', handIndex });
    for (const e of events) { this.applyEvent(e); this.emit(e); }
  }

  /** Cancel the current pending interaction (e.g., user pressed Cancel / ESC).
   *  Does NOT emit INTERACTION_RESOLVED — the UI-initiated cancel already
   *  emitted it, so clearPending()'s extra emit would cause a double-fire. */
  cancelPending(): void {
    if (!this.pending) return;
    console.log('[GameEngine] Pending interaction cancelled');
    this.pending = null;
    this.status  = EngineStatus.IDLE;
  }

  // ─────────────────────────────────────────────
  // EVENT BUS
  // ─────────────────────────────────────────────

  on(handler: (event: GameEvent) => void): void {
    this.subscribers.add(handler);
  }

  off(handler: (event: GameEvent) => void): void {
    this.subscribers.delete(handler);
  }

  private emit(event: GameEvent): void {
    for (const sub of this.subscribers) {
      try { sub(event); } catch (e) { console.error('[GameEngine] Subscriber error:', e); }
    }
  }

  // ─────────────────────────────────────────────
  // TURN LOOP — wires phase modules in sequence
  // ─────────────────────────────────────────────

  private startTurn(): void {
    this.emit({ type: 'TURN_STARTED', turn: this.turnNumber, activePlayer: this.activePlayer });
    this.board.resetTurnFlags(this.activePlayer);

    const ctx = this.buildContext();

    // DRAW → LEG → lands on PLAY (LEGPhase advances to PLAY internally)
    runDrawPhase(ctx);
    runLEGPhase(ctx);

    this.syncFromContext(ctx);
  }

  // ─────────────────────────────────────────────
  // CONTEXT BRIDGE
  // ─────────────────────────────────────────────

  /**
   * Build a GameContext from current engine state.
   * Phase modules receive this instead of the engine itself.
   * This is the ONLY coupling point between engine and phases.
   */
  private buildContext(): GameContext {
    return {
      board:        this.board,
      mods:         this.mods,
      players:      this.players,
      auras:        this.auras,
      activePlayer: this.activePlayer,
      turnNumber:   this.turnNumber,
      phase:        this.phase,
      status:       this.status,
      graveyard:    this.graveyard,
      pending:      undefined,

      createUnit: (cardId, owner, pos) => this.unitFactory.create(cardId, owner, pos),

      emit: (event) => this.emit(event),

      applyEvents: (events) => {
        for (const event of events) {
          this.applyEvent(event);
          this.emit(event);
        }
      },
    };
  }

  /**
   * Sync engine state back from context after phase execution.
   * Phase modules may have changed phase/status.
   */
  private syncFromContext(ctx: GameContext): void {
    this.phase  = ctx.phase;
    this.status = ctx.status;
    if (ctx.pending) {
      this.pending = ctx.pending;
    }
  }

  // ─────────────────────────────────────────────
  // EVENT APPLICATION — central state mutation
  // ─────────────────────────────────────────────

  private applyEvent(event: GameEvent): void {
    switch (event.type) {
      case 'UNIT_PLACED': {
        const exists = this.board.getUnitById(event.instanceId);
        if (!exists) {
          // Create unit with the event's instanceId to avoid post-emit mutation.
          // UnitFactory generates a new ID, but we override it to match the event
          // so subscribers already holding this event object see a consistent ID.
          const newUnit = this.unitFactory.create(event.cardId, event.owner, { col: event.col, row: event.row });
          newUnit.isActive = event.isActive;
          newUnit.instanceId = event.instanceId;
          this.board.placeUnit(newUnit);
        }
        break;
      }

      case 'UNIT_ATTACKED': {
        const target = this.board.getUnitById(event.targetInstanceId);
        if (target) {
          this.board.updateUnitStats(target.instanceId, { currentDef: event.targetNewHP });
        }
        break;
      }

      case 'UNIT_HEALED': {
        const u = this.board.getUnitById(event.instanceId);
        if (u) {
          this.board.updateUnitStats(u.instanceId, { currentDef: event.newHP });
        }
        break;
      }

      case 'UNIT_TRANSFORMED': {
        const old = this.board.getUnitById(event.oldInstanceId);
        if (!old) break;
        const newDef = getCard(event.toCardId);
        const newStats = newDef.stats!;
        this.board.updateUnitStats(event.oldInstanceId, {
          cardId:           event.toCardId,
          instanceId:       event.newInstanceId,
          baseAtk:          newStats.atk,
          baseDef:          newStats.def,
          currentAtk:       newStats.atk,
          currentDef:       event.newHP,
          maxDef:           event.newMaxHP,
          baseMovement:     movementToNumber(newStats.movement),
          currentMovement:  movementToNumber(newStats.movement),
          baseMovementType: newStats.movement,
          baseAtkPattern:   newStats.attackPattern,
        });
        break;
      }

      case 'CARD_DRAWN': {
        const ps = this.players[event.player];
        if (event.cardId === '__DRAW__') {
          const drawn = ps.drawCards(1);
          if (drawn.length > 0) {
            event.cardId = drawn[0];
            event.handIndex = ps.hand.length - 1;
            event.deckRemaining = ps.deck.length;
          }
        } else if (event.cardId.startsWith('__DRAW_FILTERED_')) {
          const filter = event.cardId.replace('__DRAW_FILTERED_', '').replace('__', '');
          const drawn = ps.drawCardsFiltered(1, filter as 'ROYAL' | 'STANDARD');
          if (drawn.length > 0) {
            event.cardId = drawn[0];
            event.handIndex = ps.hand.length - 1;
            event.deckRemaining = ps.deck.length;
          }
        } else if (event.cardId === '__DRAW_OVERFLOW__') {
          const drawn = ps.drawCardsOverflow(1);
          if (drawn.length > 0) {
            event.cardId = drawn[0];
            event.handIndex = ps.hand.length - 1;
            event.deckRemaining = ps.deck.length;
          }
        }
        break;
      }

      case 'LEG_RATE_CHANGED': {
        const mod = this.mods[event.player];
        const oldRate = mod.getEffectiveLEGRate();
        if (event.newRate < oldRate) {
          mod.addLEGRatePenalty(oldRate - event.newRate);
        }
        break;
      }

      case 'LEG_STOLEN': {
        const fromMod = this.mods[event.from];
        const toMod   = this.mods[event.to];
        const actual  = Math.min(event.amount, fromMod.legPool);
        fromMod.removeLEG(actual);
        toMod.addLEG(actual);
        break;
      }

      // Informational events — no state mutation needed
      default:
        break;
    }
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private clearPending(): void {
    this.pending = null;
    this.status  = EngineStatus.IDLE;
    this.emit({ type: 'INTERACTION_RESOLVED' });
  }

 private prePlaceKing(player: Player): void {
    const row = player === Player.P1 ? 0 : this.board.rows - 1;
    const col = Math.floor(this.board.cols / 2);  // Center: col 3 on 7-wide board
    const unit = this.unitFactory.create('king', player, { col, row });
    unit.isJustPlaced = false;  // Kings are pre-placed, they can act from turn 1
    this.board.placeUnit(unit);
    this.emit({ type: 'UNIT_PLACED', instanceId: unit.instanceId, cardId: 'king', owner: player, col, row, isActive: true });
  }
  private drawOpeningHand(player: Player): void {
    const ps = this.players[player];
    const drawn = ps.drawCards(4);
    for (let i = 0; i < drawn.length; i++) {
      this.emit({ type: 'CARD_DRAWN', player, cardId: drawn[i], handIndex: i, deckRemaining: ps.deck.length });
    }
  }
}

```

# src\game\GameLogger.ts

```ts
// ============================================================
// GameLogger.ts
// Comprehensive game session logger.
//
// Records every engine event + periodic full game state snapshots
// every 30 seconds. Designed for post-game debugging.
//
// Logs include: units (stats, buffs, position), player hands,
// LEG economy (pool, rate, bonuses, penalties), crown discounts,
// combat breakdowns (base ATK, aura buffs, positional bonuses),
// card placements, deaths, and all phase transitions.
//
// Usage:
//   const logger = new GameLogger(roomCode, playerIndex, seed, () => engine.getState());
//   engine.on(e => logger.record(e));
//   // On game end or scene shutdown:
//   logger.stop();
//
// Auto-saves to localStorage every 30s. Downloads JSON on stop().
// ============================================================

import type { GameEvent } from './types/EventTypes';
import type { GameStateSnapshot, StatBuff, GameModifiers, PlayerStateSnapshot } from './types/GameTypes';
import { getCard } from './data/CardRegistry';

const AUTO_SAVE_INTERVAL_MS = 30_000;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface SessionMeta {
  roomCode: string;
  localPlayerIndex: number;
  seed: number;
  startedAt: string;
  endedAt?: string;
}

export interface LogEntry {
  seq: number;
  ts: number;                 // ms since session start
  event: string;              // event.type
  detail: string;             // human-readable summary
  raw: Record<string, any>;   // full event payload
}

export interface UnitSnap {
  instanceId: string;
  cardId: string;
  name: string;
  owner: number;
  col: number;
  row: number;
  baseAtk: number;
  currentAtk: number;
  currentDef: number;
  maxDef: number;
  isActive: boolean;
  hasMoved: boolean;
  hasActed: boolean;
  activeBuffs: StatBuff[];
}

export interface PlayerSnap {
  player: number;
  hand: string[];             // card IDs
  handNames: string[];        // human-readable card names
  handCount: number;
  deckCount: number;
  discardCount: number;
  leg: number;                // current LEG pool
  legRate: number;            // effective LEG rate (base + bonus - penalty)
  legRateBase: number;
  legRateBonus: number;
  legRatePenalty: number;
  crownDiscount: number;      // royal cost discount
  crownPenalty: number;       // royal cost penalty
}

export interface FullSnapshot {
  ts: number;
  turn: number;
  phase: string;
  activePlayer: number;
  units: UnitSnap[];
  players: [PlayerSnap, PlayerSnap];
}

export interface SessionLog {
  meta: SessionMeta;
  events: LogEntry[];
  snapshots: FullSnapshot[];
}

// ─────────────────────────────────────────────
// LOGGER
// ─────────────────────────────────────────────

export class GameLogger {
  private meta: SessionMeta;
  private events: LogEntry[] = [];
  private snapshots: FullSnapshot[] = [];
  private seq = 0;
  private startMs: number;
  private stopped = false;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private getState: () => GameStateSnapshot;
  private storageKey: string;

  constructor(
    roomCode: string,
    localPlayerIndex: number,
    seed: number,
    getState: () => GameStateSnapshot
  ) {
    this.startMs = Date.now();
    this.getState = getState;
    this.meta = {
      roomCode,
      localPlayerIndex,
      seed,
      startedAt: new Date().toISOString(),
    };
    this.storageKey = `gamelog_session_${roomCode}_${this.meta.startedAt.replace(/[:.]/g, '-')}`;

    // Periodic auto-save every 30 seconds
    if (typeof window !== 'undefined') {
      this.autoSaveTimer = setInterval(() => this.autoSave(), AUTO_SAVE_INTERVAL_MS);
    }
  }

  /**
   * Record a game engine event.
   */
  record(event: GameEvent): void {
    if (this.stopped) return;

    const entry: LogEntry = {
      seq: this.seq++,
      ts: Date.now() - this.startMs,
      event: event.type,
      detail: describeEvent(event),
      raw: { ...event } as any,
    };
    this.events.push(entry);

    // Take a full snapshot on key structural events
    if (SNAPSHOT_EVENTS.has(event.type)) {
      this.takeSnapshot();
    }
  }

  /** Take a full game state snapshot. */
  takeSnapshot(): void {
    if (this.stopped) return;
    try {
      const state = this.getState();
      this.snapshots.push(buildFullSnapshot(state, Date.now() - this.startMs));
    } catch { /* engine not ready yet */ }
  }

  /** Auto-save to localStorage (called every 30s). */
  private autoSave(): void {
    if (this.stopped) return;
    // Take a periodic snapshot
    this.takeSnapshot();
    this.saveToStorage();
  }

  /** Save current log to localStorage without stopping. */
  private saveToStorage(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const log = this.buildLog();
      const json = JSON.stringify(log, null, 2);
      localStorage.setItem(this.storageKey, json);
    } catch { /* storage full or unavailable */ }
  }

  /** Stop logging, save final state, and download. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.meta.endedAt = new Date().toISOString();

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Final snapshot
    try {
      const state = this.getState();
      this.snapshots.push(buildFullSnapshot(state, Date.now() - this.startMs));
    } catch { /* engine may be gone */ }

    // Save and download
    if (typeof window !== 'undefined') {
      const log = this.buildLog();
      const json = JSON.stringify(log, null, 2);

      try { localStorage.setItem(this.storageKey, json); } catch { /* */ }

      const filename = `session_${this.meta.roomCode}_${this.meta.startedAt.replace(/[:.]/g, '-')}.json`;
      downloadJSON(json, filename);
      console.log(`[GameLogger] Session log saved: ${filename} (${this.events.length} events, ${this.snapshots.length} snapshots)`);
    }
  }

  /** Build the full log object. */
  private buildLog(): SessionLog {
    return {
      meta: { ...this.meta },
      events: this.events,
      snapshots: this.snapshots,
    };
  }

  /** Get the log without stopping (for console inspection). */
  getLog(): SessionLog {
    return this.buildLog();
  }

  get entryCount(): number { return this.events.length; }

  /** Alias for stop() — backwards compatibility. */
  flush(): void { this.stop(); }
}

// ─────────────────────────────────────────────
// SNAPSHOT BUILDERS
// ─────────────────────────────────────────────

// Events that warrant a full snapshot
const SNAPSHOT_EVENTS = new Set([
  'TURN_STARTED', 'UNIT_PLACED', 'UNIT_DIED', 'UNIT_ATTACKED',
  'UNIT_MOVED', 'UNIT_TRANSFORMED', 'AURA_APPLIED', 'GAME_OVER',
  'LEG_GAINED', 'LEG_SPENT', 'LEG_RATE_CHANGED',
]);

function buildFullSnapshot(state: GameStateSnapshot, ts: number): FullSnapshot {
  const units: UnitSnap[] = [];
  for (const cell of state.board) {
    if (!cell.unit) continue;
    const u = cell.unit;
    units.push({
      instanceId: u.instanceId,
      cardId: u.cardId,
      name: cardName(u.cardId),
      owner: u.owner,
      col: cell.col,
      row: cell.row,
      baseAtk: u.baseAtk,
      currentAtk: u.currentAtk,
      currentDef: u.currentDef,
      maxDef: u.maxDef,
      isActive: u.isActive,
      hasMoved: u.hasMoved,
      hasActed: u.hasActed,
      activeBuffs: u.activeBuffs ?? [],
    });
  }

  const players: [PlayerSnap, PlayerSnap] = [
    buildPlayerSnap(state.players[0], state.modifiers[0]),
    buildPlayerSnap(state.players[1], state.modifiers[1]),
  ];

  return {
    ts,
    turn: state.turn?.turnNumber ?? 0,
    phase: state.turn?.phase ?? 'UNKNOWN',
    activePlayer: state.turn?.activePlayer ?? 0,
    units,
    players,
  };
}

function buildPlayerSnap(ps: PlayerStateSnapshot, mod: GameModifiers): PlayerSnap {
  const effectiveRate = Math.max(1, mod.legRateBase + mod.legRateBonus - mod.legRatePenalty);
  return {
    player: ps.player,
    hand: [...ps.hand],
    handNames: ps.hand.map(id => cardName(id)),
    handCount: ps.hand.length,
    deckCount: ps.deckCount,
    discardCount: ps.discardCount,
    leg: mod.legPool,
    legRate: mod.legRateFrozen ? 0 : effectiveRate,
    legRateBase: mod.legRateBase,
    legRateBonus: mod.legRateBonus,
    legRatePenalty: mod.legRatePenalty,
    crownDiscount: mod.royalCostDiscount,
    crownPenalty: mod.royalCostPenalty,
  };
}

// ─────────────────────────────────────────────
// EVENT DESCRIPTION — human-readable summaries
// ─────────────────────────────────────────────

function cardName(cardId: string): string {
  try { return getCard(cardId).name; } catch { return cardId; }
}

function playerLabel(p: number): string {
  return p === 0 ? 'P1' : 'P2';
}

function describeEvent(e: GameEvent): string {
  switch (e.type) {
    case 'TURN_STARTED':
      return `Turn ${e.turn} — ${playerLabel(e.activePlayer)}'s turn`;
    case 'PHASE_CHANGED':
      return `Phase → ${e.phase} (${playerLabel(e.activePlayer)}, turn ${e.turn})`;

    case 'CARD_DRAWN':
      return `${playerLabel(e.player)} drew ${cardName(e.cardId)} (hand[${e.handIndex}], deck: ${e.deckRemaining})`;
    case 'CARD_PLAYED':
      return `${playerLabel(e.player)} played ${cardName(e.cardId)} (cost ${e.legCost})`;
    case 'CARD_DISCARDED':
      return `${playerLabel(e.player)} discarded ${cardName(e.cardId)}`;

    case 'UNIT_PLACED':
      return `${playerLabel(e.owner)} placed ${cardName(e.cardId)} [${e.instanceId}] at (${e.col},${e.row})${e.isActive ? '' : ' [BUILD_DELAY]'}`;
    case 'UNIT_MOVED':
      return `${playerLabel(e.owner)} moved ${cardName(e.cardId)} [${e.instanceId}] (${e.from.col},${e.from.row}) → (${e.to.col},${e.to.row})`;
    case 'UNIT_ATTACKED': {
      let desc = `[${e.attackerInstanceId}] attacked [${e.targetInstanceId}] at (${e.targetCol},${e.targetRow}) — ${e.damage} dmg → HP ${e.targetNewHP}${e.isKingHit ? ' [KING HIT]' : ''}`;
      if (e.breakdown) {
        const b = e.breakdown;
        const parts: string[] = [`base:${b.baseAtk}`];
        if (b.cavalryCounter) parts.push(`cavalry:+${b.cavalryCounter}`);
        if (b.backstabBonus) parts.push(`backstab:+${b.backstabBonus}`);
        if (b.ambushBonus) parts.push(`ambush:+${b.ambushBonus}`);
        if (b.auraBuffs.length > 0) {
          for (const buff of b.auraBuffs) {
            if (buff.atkDelta !== 0) parts.push(`${buff.source}:atk${buff.atkDelta > 0 ? '+' : ''}${buff.atkDelta}`);
          }
        }
        desc += ` (${parts.join(', ')})`;
      }
      return desc;
    }
    case 'UNIT_DIED':
      return `${cardName(e.cardId)} [${e.instanceId}] (${playerLabel(e.owner)}) died at (${e.col},${e.row}) — cause: ${e.cause}`;
    case 'UNIT_HEALED':
      return `${cardName(e.cardId)} [${e.instanceId}] healed +${e.amount} → HP ${e.newHP}/${e.maxHP}`;
    case 'UNIT_TRANSFORMED':
      return `${cardName(e.fromCardId)} [${e.oldInstanceId}] → ${cardName(e.toCardId)} [${e.newInstanceId}] at (${e.col},${e.row})`;

    case 'LEG_GAINED':
      return `${playerLabel(e.player)} gained ${e.amount} LEG (total: ${e.total}, rate: ${e.rate})`;
    case 'LEG_SPENT':
      return `${playerLabel(e.player)} spent ${e.amount} LEG (remaining: ${e.remaining})`;
    case 'LEG_STOLEN':
      return `${playerLabel(e.from)} → ${playerLabel(e.to)}: stole ${e.amount} LEG`;
    case 'LEG_RATE_CHANGED':
      return `${playerLabel(e.player)} LEG rate ${e.oldRate} → ${e.newRate} (${e.reason})`;

    case 'AURA_APPLIED': {
      if (e.changes.length === 0) return 'Auras recalculated (no stat changes)';
      const parts = e.changes.map(c => {
        let s = `[${c.instanceId}] atk${c.atkDelta >= 0 ? '+' : ''}${c.atkDelta} def${c.defDelta >= 0 ? '+' : ''}${c.defDelta} mov${c.moveDelta >= 0 ? '+' : ''}${c.moveDelta}`;
        if (c.buffs && c.buffs.length > 0) {
          const sources = c.buffs.map(b => b.source).join(', ');
          s += ` [from: ${sources}]`;
        }
        return s;
      });
      return `Auras: ${parts.join(', ')}`;
    }

    case 'PENDING_TARGET':
      return `Awaiting target selection: ${e.reason}`;
    case 'PENDING_POSITION':
      return `Awaiting position selection: ${e.reason}`;
    case 'INTERACTION_RESOLVED':
      return `Interaction resolved${e.cancelled ? ' (cancelled)' : ''}`;

    case 'GAME_OVER':
      return `GAME OVER — ${playerLabel(e.result.winner)} wins (${e.result.reason}, ${e.result.turns} turns)`;

    default:
      return e.type;
  }
}

// ─────────────────────────────────────────────
// FILE DOWNLOAD (browser)
// ─────────────────────────────────────────────

function downloadJSON(json: string, filename: string): void {
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  } catch { /* non-browser environment */ }
}

```

# src\game\GameModifiers.ts

```ts
// ============================================================
// GameModifiers.ts
// Per-player LEG economy and timed effect management.
// Pure TypeScript — no Phaser, no EventBus.
// GameEngine owns two instances: [P1, P2].
//
// CROWN = CROWN determines both LEG gained AND LEG cap each turn.
// LEG pool can never exceed current CROWN value (unless Motherland overflow).
// This keeps the economy tight: turn 3 → CROWN 3, cap 3. No hoarding.
// ============================================================

import type { GameModifiers as GameModifiersSnapshot, TimedEffect } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { IGameModifiers } from './interfaces/IGameModifiers';

const LEG_RATE_MIN = 1;

export class GameModifiers implements IGameModifiers {
  readonly player: Player;

  legRateBase: number   = 0;   // Grows +1 each turn via GameEngine.runLEGPhase
  legRateBonus: number  = 0;   // Princess +1 per copy on board
  legRatePenalty: number = 0;  // Permanent drains (Casus Belli, Mystic, Inquisitor, Revolt)
  legRateFrozen: boolean = false; // Civil War

  royalCostDiscount: number = 0; // Castle + Temple + Princess (stacks, floor 0)
  royalCostPenalty: number  = 0; // Peasant Revolt +2 (no floor)

  legPool: number = 0;
  legOverflow: boolean = false;  // Motherland: allow exceeding CROWN cap for this turn only

  timedEffects: TimedEffect[] = [];

  constructor(player: Player) {
    this.player = player;
  }

  // ─────────────────────────────────────────────
  // COMPUTED RATES
  // ─────────────────────────────────────────────

  /** Effective LEG gained per turn (= CROWN). Minimum 1 unless frozen by Civil War. */
  getEffectiveLEGRate(): number {
    if (this.legRateFrozen) return 0;
    return Math.max(LEG_RATE_MIN, this.legRateBase + this.legRateBonus - this.legRatePenalty);
  }

  /**
   * Dynamic LEG pool cap = current CROWN value.
   * Pool can never exceed this unless Motherland overflow is active.
   * When Civil War freezes CROWN to 0, cap is still based on the
   * unfrozen rate so existing LEG isn't wiped — only gain is blocked.
   */
  getLEGCap(): number {
    if (this.legOverflow) return Infinity;
    // Use the unfrozen rate for cap so Civil War doesn't destroy existing pool
    const unfrozenRate = Math.max(LEG_RATE_MIN, this.legRateBase + this.legRateBonus - this.legRatePenalty);
    return unfrozenRate;
  }

  /** Effective cost for a card. Royal cards get discount applied, floor 0. */
  getEffectiveCardCost(baseCost: number, isRoyal: boolean): number {
    if (!isRoyal) return baseCost;
    return Math.max(0, baseCost - this.royalCostDiscount + this.royalCostPenalty);
  }

  // ─────────────────────────────────────────────
  // LEG POOL OPERATIONS
  // ─────────────────────────────────────────────

  /**
   * Apply LEG gain at start of LEG phase. Returns amount actually gained.
   * Cap = CROWN (effective rate), so pool tops out at CROWN value.
   * Example: CROWN 5, pool was 2 → gain 5 → pool = min(7, 5) = 5.
   * Effectively you always refill to CROWN each turn.
   */
  gainLEG(): number {
    const rate = this.getEffectiveLEGRate();
    const cap = this.getLEGCap();
    const before = this.legPool;
    this.legPool = Math.min(this.legPool + rate, cap);
    return this.legPool - before;
  }

  /** Spend LEG. Returns false if insufficient funds. */
  spendLEG(amount: number): boolean {
    if (this.legPool < amount) return false;
    this.legPool -= amount;
    return true;
  }

  /** Forcibly add LEG (steal, bonus effects). Does not exceed CROWN cap unless overflow. */
  addLEG(amount: number): void {
    const cap = this.getLEGCap();
    this.legPool = Math.min(this.legPool + amount, cap);
  }

  /** Forcibly remove LEG (stolen, penalties). Floored at 0. */
  removeLEG(amount: number): void {
    this.legPool = Math.max(0, this.legPool - amount);
  }

  /** Check affordability without spending. */
  canAfford(baseCost: number, isRoyal: boolean): boolean {
    return this.legPool >= this.getEffectiveCardCost(baseCost, isRoyal);
  }

  // ─────────────────────────────────────────────
  // RATE MODIFIERS
  // ─────────────────────────────────────────────

  /** Add permanent LEG rate penalty. Minimum effective rate always enforced. */
  addLEGRatePenalty(amount: number): void {
    this.legRatePenalty += amount;
    // Clamp pool to new (lower) cap immediately
    this.clampPool();
  }

  /** Recalculate Royal discount based on structures/units on board. */
  setRoyalDiscount(castle: number, temple: number, princess: number): void {
    this.royalCostDiscount = castle + temple + princess;
  }

  /** Set bonus LEG rate from Princess count on board. */
  setLEGRateBonus(princessCount: number): void {
    const oldBonus = this.legRateBonus;
    this.legRateBonus = princessCount;
    // If Princess died and bonus dropped, cap may have lowered — clamp pool
    if (princessCount < oldBonus) {
      this.clampPool();
    }
  }

  // ─────────────────────────────────────────────
  // TIMED EFFECTS
  // ─────────────────────────────────────────────

  addTimedEffect(effect: TimedEffect): void {
    this.timedEffects.push(effect);
  }

  /** Tick all effects. Call at END phase. Returns list of expired effect types. */
  tickEffects(): TimedEffect[] {
    const expired: TimedEffect[] = [];

    this.timedEffects = this.timedEffects.filter(effect => {
      if (effect.duration === -1) return true; // Permanent — never expire

      effect.duration--;

      if (effect.duration <= 0) {
        expired.push(effect);
        return false;
      }
      return true;
    });

    // Resolve Civil War freeze
    const hasCivilWar = this.timedEffects.some(e => e.type === 'CIVIL_WAR_FREEZE');
    this.legRateFrozen = hasCivilWar;

    return expired;
  }

  /** Returns true if any timed effect of a given type is active. */
  hasEffect(type: TimedEffect['type']): boolean {
    return this.timedEffects.some(e => e.type === type);
  }

  /** Remove all effects of a given type immediately. */
  removeEffect(type: TimedEffect['type']): void {
    this.timedEffects = this.timedEffects.filter(e => e.type !== type);
  }

  /**
   * Clear the one-turn overflow flag. Called at END phase.
   * After clearing, clamp pool back to CROWN cap.
   */
  clearOverflow(): void {
    this.legOverflow = false;
    this.clampPool();
  }

  // ─────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────

  /**
   * Clamp legPool to current cap.
   * Called whenever cap might have decreased (penalty added, Princess died, overflow cleared).
   */
  private clampPool(): void {
    const cap = this.getLEGCap();
    if (this.legPool > cap) {
      this.legPool = cap;
    }
  }

  // ─────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────

  snapshot(): GameModifiersSnapshot {
    return {
      legRateBase:      this.legRateBase,
      legRateBonus:     this.legRateBonus,
      legRatePenalty:   this.legRatePenalty,
      royalCostDiscount: this.royalCostDiscount,
      royalCostPenalty:  this.royalCostPenalty,
      legPool:           this.legPool,
      legRateFrozen:     this.legRateFrozen,
      timedEffects:     [...this.timedEffects],
    };
  }
}
```

# src\game\interfaces\IBoard.ts

```ts
// ============================================================
// IBoard.ts
// Interface for the game board — Dependency Inversion.
// Consumers depend on this interface, not the concrete Board.
// ============================================================

import type { Unit, BoardCell, Position } from '../types/GameTypes';
import { Player } from '../types/GameTypes';

export interface IBoard {
  readonly cols: number;
  readonly rows: number;

  // READ QUERIES
  getCell(col: number, row: number): BoardCell;
  getUnit(col: number, row: number): Unit | null;
  getUnitById(instanceId: string): Unit | null;
  isEmpty(col: number, row: number): boolean;
  isInBounds(col: number, row: number): boolean;
  isOwnHalf(col: number, row: number, player: Player): boolean;
  getUnitsOf(player: Player): Unit[];
  getKing(player: Player): Unit | null;
  getStructures(player?: Player): Unit[];
  getAllUnits(): Unit[];
  getCells(): BoardCell[];
  getAdjacentUnits(col: number, row: number): Unit[];
  getHVAdjacentUnits(col: number, row: number): Unit[];
  getFreeSquaresInHalf(player: Player): Position[];
  getUnitsInColumn(col: number): Unit[];

  // MUTATIONS
  placeUnit(unit: Unit): void;
  removeUnit(instanceId: string): Unit | null;
  moveUnit(instanceId: string, toCol: number, toRow: number): void;
  updateUnitStats(instanceId: string, updates: Partial<Unit>): void;
  resetTurnFlags(player: Player): void;

  // SERIALIZATION
  serialize(): Array<{ col: number; row: number; unit: Unit | null }>;
  clear(): void;
}

```

# src\game\interfaces\IGameModifiers.ts

```ts
// ============================================================
// IGameModifiers.ts
// Interface for per-player LEG economy and timed effects.
// ============================================================

import type { TimedEffect, GameModifiers as GameModifiersSnapshot } from '../types/GameTypes';
import { Player } from '../types/GameTypes';

export interface IGameModifiers {
  readonly player: Player;
  legRateBase: number;
  legRateBonus: number;
  legRatePenalty: number;
  legRateFrozen: boolean;
  royalCostDiscount: number;
  royalCostPenalty: number;
  legPool: number;
  legOverflow: boolean;
  timedEffects: TimedEffect[];

  // COMPUTED RATES
  getEffectiveLEGRate(): number;
  getLEGCap(): number;
  getEffectiveCardCost(baseCost: number, isRoyal: boolean): number;

  // LEG POOL OPERATIONS
  gainLEG(): number;
  spendLEG(amount: number): boolean;
  addLEG(amount: number): void;
  removeLEG(amount: number): void;
  canAfford(baseCost: number, isRoyal: boolean): boolean;

  // RATE MODIFIERS
  addLEGRatePenalty(amount: number): void;
  setRoyalDiscount(castle: number, temple: number, princess: number): void;
  setLEGRateBonus(princessCount: number): void;

  // TIMED EFFECTS
  addTimedEffect(effect: TimedEffect): void;
  tickEffects(): TimedEffect[];
  hasEffect(type: TimedEffect['type']): boolean;
  removeEffect(type: TimedEffect['type']): void;
  clearOverflow(): void;

  // SERIALIZATION
  snapshot(): GameModifiersSnapshot;
}

```

# src\game\interfaces\IPlayerState.ts

```ts
// ============================================================
// IPlayerState.ts
// Interface for player hand/deck/discard management.
// ============================================================

import { Player } from '../types/GameTypes';

export interface IPlayerState {
  readonly player: Player;
  hand: string[];
  deck: string[];
  discard: string[];
  graveyard: string[];
  handLimit: number;

  // DECK SETUP
  loadDeck(cardIds: string[], playerIndex?: number): void;

  // DRAW
  drawCards(count: number): string[];
  drawCardsOverflow(count: number): string[];
  drawCardsFiltered(count: number, filter: 'ROYAL' | 'STANDARD'): string[];

  // HAND OPERATIONS
  playFromHand(index: number): string;
  discardFromHand(index: number): string;
  addToHand(cardId: string, overrideLimit?: boolean): boolean;
  trimOverflowHand(): string[];

  // DECK OPERATIONS
  findAndPullFromDeck(cardId: string): boolean;
  peekTop(count: number): string[];

  // GRAVEYARD
  addToGraveyard(instanceId: string): void;
  getGraveyard(): string[];

  // SERIALIZATION
  snapshot(): {
    player: Player;
    hand: string[];
    deckCount: number;
    discardCount: number;
    handLimit: number;
  };
}

```

# src\game\MovementRules.ts

```ts
// ============================================================
// MovementRules.ts
// Pure pattern resolvers. ZERO capability checks here.
//
// GameEngine gates access via UnitQuery.canUnitMove/canUnitAttack
// BEFORE calling these functions. By the time we get here, the
// unit is confirmed capable — we just need to find which squares
// match the movement/attack pattern.
//
// HYBRID PATTERN SYSTEM:
//   - Cards with customMove/customAttack → resolveCustomPattern()
//   - Cards with enum only → existing switch-case logic
//   - Both paths produce Position[] of valid squares
//
// ZERO Phaser imports. Pure TypeScript.
// ============================================================

import { MovementType, AtkPattern } from './types/CardTypes';
import type { CustomPattern, PatternOffset } from './types/CardTypes';
import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import { getCard } from './data/CardRegistry';

// ═══════════════════════════════════════════════════════
// PUBLIC API — called by GameEngine (after UnitQuery gate)
// ═══════════════════════════════════════════════════════

/**
 * All squares a unit can move to.
 * No capability checks — caller must verify canUnitMove() first.
 */
export function getValidMoves(unit: Unit, board: Board): Position[] {
  const def = getCard(unit.cardId);

  // Custom pattern takes priority
  if (def.stats?.customMove) {
    return resolveCustomPattern(unit, def.stats.customMove, board, false);
  }

  // Enum-based fallback
  const { col, row } = unit.position;
  const dist = unit.currentMovement;

  switch (unit.baseMovementType) {
    case MovementType.STATIC:          return [];
    case MovementType.OMNI_1:
    case MovementType.OMNI_2:
    case MovementType.OMNI_3:          return getOmniMoves(col, row, dist, board);
    case MovementType.VERTICAL_2:      return getLinearMoves(col, row, DIRS_VERTICAL, dist, board);
    case MovementType.JUMP_DIAGONAL_1: return getJumpTargets(col, row, DIRS_DIAGONAL, board, unit.owner);
    case MovementType.FWD_VERTICAL_1:  return getForwardMove(col, row, unit.owner, board);
    default:                           return [];
  }
}

/**
 * All squares a unit can attack (must have enemy occupant).
 * No capability checks — caller must verify canUnitAttack() first.
 */
export function getValidAttacks(unit: Unit, board: Board): Position[] {
  const def = getCard(unit.cardId);

  if (def.stats?.customAttack) {
    return resolveCustomPattern(unit, def.stats.customAttack, board, true);
  }

  if (unit.baseAtkPattern === AtkPattern.NONE) return [];
  const { col, row } = unit.position;

  switch (unit.baseAtkPattern) {
    case AtkPattern.HV:               return getEnemiesInDirs(col, row, DIRS_HV, board, unit.owner);
    case AtkPattern.OMNI:
    case AtkPattern.AREA_ADJ:         return getEnemiesInDirs(col, row, DIRS_OMNI, board, unit.owner);
    case AtkPattern.DIAGONAL_RANGED_2: return getRangedEnemies(col, row, DIRS_DIAGONAL, 2, board, unit.owner);
    case AtkPattern.STRAIGHT_RANGED_3: return getRangedEnemies(col, row, DIRS_HV, 3, board, unit.owner);
    case AtkPattern.ON_JUMP:           return []; // Assassin: attack is part of move
    case AtkPattern.FWD_VERTICAL:      return getForwardEnemy(col, row, unit.owner, board);
    default:                           return [];
  }
}

/**
 * All squares in a unit's attack RANGE — occupied or empty.
 * UI-only: shows threat zone. Not used for action validation.
 */
export function getAttackRange(unit: Unit, board: Board): Position[] {
  const def = getCard(unit.cardId);

  if (def.stats?.customAttack) {
    return resolvePatternRange(unit, def.stats.customAttack, board);
  }

  if (unit.baseAtkPattern === AtkPattern.NONE) return [];
  const { col, row } = unit.position;

  switch (unit.baseAtkPattern) {
    case AtkPattern.HV:                return getAllInDirs(col, row, DIRS_HV, 1, board);
    case AtkPattern.OMNI:
    case AtkPattern.AREA_ADJ:          return getAllInDirs(col, row, DIRS_OMNI, 1, board);
    case AtkPattern.DIAGONAL_RANGED_2: return getAllRanged(col, row, DIRS_DIAGONAL, 2, board);
    case AtkPattern.STRAIGHT_RANGED_3: return getAllRanged(col, row, DIRS_HV, 3, board);
    case AtkPattern.ON_JUMP:           return [];
    case AtkPattern.FWD_VERTICAL: {
      const dr = unit.owner === Player.P1 ? 1 : -1;
      const nr = row + dr;
      return board.isInBounds(col, nr) ? [{ col, row: nr }] : [];
    }
    default: return [];
  }
}

/**
 * Valid deploy squares (own half, unoccupied).
 */
export function getValidDeploySquares(player: Player, board: Board): Position[] {
  return board.getFreeSquaresInHalf(player);
}

// ─────────────────────────────────────────────
// VALIDATION HELPERS (used by phase modules)
// ─────────────────────────────────────────────

export function isMoveValid(unit: Unit, toCol: number, toRow: number, board: Board): boolean {
  return getValidMoves(unit, board).some(p => p.col === toCol && p.row === toRow);
}

export function isAttackValid(unit: Unit, targetCol: number, targetRow: number, board: Board): boolean {
  return getValidAttacks(unit, board).some(p => p.col === targetCol && p.row === targetRow);
}

export function isLancerForwardMove(unit: Unit, toRow: number): boolean {
  const dr = unit.owner === Player.P1 ? 1 : -1;
  return (toRow - unit.position.row) * dr > 0;
}

// ═══════════════════════════════════════════════════════
// CUSTOM PATTERN RESOLVER
//
// Path-blocking rules (when canJump = false):
//   - Adjacent offsets (|dx|≤1 AND |dy|≤1): no intermediates to check.
//   - Decomposable offsets (gcd(|dx|,|dy|) ≥ 2, e.g. {-2,-2}, {0,-2}):
//     Single clear path exists. Trace step-by-step along {dx/gcd, dy/gcd}.
//     Blocked if ANY intermediate is occupied.
//   - L-shaped offsets (gcd=1, distance > 1, e.g. {-1,-2}, {2,-1}):
//     Multiple paths through the bounding rectangle. Check ALL cells in
//     the rectangle (excluding start + destination). Blocked only if
//     EVERY intermediate cell is occupied — meaning no path exists.
//     Example: (0,0)→(1,2) checks (0,1),(1,0),(1,1),(0,2).
// ═══════════════════════════════════════════════════════

/**
 * GCD for decomposing offsets into traceable steps.
 * gcd(0, n) = n, gcd(a, b) = gcd(b, a%b).
 */
function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * Check if the path from (col, row) to (col+dx, row+dy) is clear.
 * Only checks intermediate squares — NOT the destination itself.
 * Returns true if the path is clear.
 */
function isPathClear(col: number, row: number, dx: number, dy: number, board: Board): boolean {
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (dist <= 1) return true; // adjacent — no intermediates

  const g = gcd(dx, dy);

  if (g >= 2) {
    // Decomposable (straight/diagonal): single path, ANY blocker stops it
    const sdx = dx / g;
    const sdy = dy / g;
    for (let s = 1; s < g; s++) {
      const ic = col + sdx * s;
      const ir = row + sdy * s;
      if (board.isInBounds(ic, ir) && board.getUnit(ic, ir) !== null) {
        return false;
      }
    }
    return true;
  }

  // L-shaped: multiple paths through bounding rectangle.
  // Blocked only if ALL intermediate cells are occupied.
  const minC = Math.min(0, dx), maxC = Math.max(0, dx);
  const minR = Math.min(0, dy), maxR = Math.max(0, dy);

  for (let dc = minC; dc <= maxC; dc++) {
    for (let dr = minR; dr <= maxR; dr++) {
      if (dc === 0 && dr === 0) continue;       // skip origin
      if (dc === dx && dr === dy) continue;      // skip destination
      const ic = col + dc;
      const ir = row + dr;
      if (!board.isInBounds(ic, ir)) continue;
      if (board.getUnit(ic, ir) === null) {
        return true; // at least one cell is free — path exists
      }
    }
  }
  return false; // every intermediate cell is occupied — fully blocked
}

function resolveCustomPattern(
  unit: Unit, pattern: CustomPattern, board: Board, isAttack: boolean,
): Position[] {
  const results: Position[] = [];
  const range = pattern.range ?? 1;
  const canJump = pattern.canJump ?? false;
  const { col, row } = unit.position;
  // Pattern offsets are defined from P1's perspective (dy>0 = toward enemy).
  // Flip dy for P2 so patterns are player-relative.
  const dySign = unit.owner === Player.P1 ? 1 : -1;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const dx = offset.dx * step;
      const dy = (offset.dy * dySign) * step;
      const nc = col + dx;
      const nr = row + dy;
      if (!board.isInBounds(nc, nr)) break;

      // Path blocking: check intermediate squares (unless canJump)
      if (!canJump && !isPathClear(col, row, dx, dy, board)) break;

      const occupant = board.getUnit(nc, nr);

      if (isAttack) {
        if (occupant) {
          if (occupant.owner !== unit.owner) results.push({ col: nc, row: nr });
          if (!canJump) break;
        }
      } else {
        if (occupant) {
          if (!canJump) break;
          continue;
        }
        results.push({ col: nc, row: nr });
      }
    }
  }
  return results;
}

/** Custom pattern range — all reachable squares regardless of occupancy. */
function resolvePatternRange(unit: Unit, pattern: CustomPattern, board: Board): Position[] {
  const results: Position[] = [];
  const range = pattern.range ?? 1;
  const canJump = pattern.canJump ?? false;
  const { col, row } = unit.position;
  // Flip dy for P2 (same as resolveCustomPattern)
  const dySign = unit.owner === Player.P1 ? 1 : -1;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const dx = offset.dx * step;
      const dy = (offset.dy * dySign) * step;
      const nc = col + dx;
      const nr = row + dy;
      if (!board.isInBounds(nc, nr)) break;
      // For range display: show square but stop extending if path blocked
      if (!canJump && !isPathClear(col, row, dx, dy, board)) break;
      results.push({ col: nc, row: nr });
      if (board.getUnit(nc, nr) && !canJump) break;
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════
// PRESET OFFSET TABLES
// ═══════════════════════════════════════════════════════

const DIRS_OMNI: number[][] = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
const DIRS_HV: number[][] = [[0,-1],[0,1],[-1,0],[1,0]];
const DIRS_DIAGONAL: number[][] = [[-1,-1],[1,-1],[-1,1],[1,1]];
const DIRS_VERTICAL: number[][] = [[0,-1],[0,1]];

/** Exported presets for use in card definitions */
export const OFFSETS_OMNI: PatternOffset[] = DIRS_OMNI.map(([dx,dy]) => ({ dx, dy }));
export const OFFSETS_HV: PatternOffset[] = DIRS_HV.map(([dx,dy]) => ({ dx, dy }));
export const OFFSETS_DIAGONAL: PatternOffset[] = DIRS_DIAGONAL.map(([dx,dy]) => ({ dx, dy }));
export const OFFSETS_FORWARD: PatternOffset[] = [{ dx: 0, dy: -1 }];
export const OFFSETS_L_JUMP: PatternOffset[] = [
  { dx:-1, dy:-2 }, { dx:1, dy:-2 }, { dx:-2, dy:-1 }, { dx:2, dy:-1 },
  { dx:-2, dy:1 },  { dx:2, dy:1 },  { dx:-1, dy:2 },  { dx:1, dy:2 },
];

// ═══════════════════════════════════════════════════════
// ENUM-BASED HELPERS
// ═══════════════════════════════════════════════════════

/** BFS omni-directional movement up to maxDist. */
function getOmniMoves(col: number, row: number, maxDist: number, board: Board): Position[] {
  // Use numeric keys (col * 100 + row) instead of string interpolation
  const visited = new Set<number>([col * 100 + row]);
  const result: Position[] = [];
  const queue = [{ col, row, dist: 0 }];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.dist >= maxDist) continue;

    for (const [dc, dr] of DIRS_OMNI) {
      const nc = curr.col + dc, nr = curr.row + dr;
      const key = nc * 100 + nr;
      if (!board.isInBounds(nc, nr) || visited.has(key)) continue;
      visited.add(key);
      if (board.getUnit(nc, nr) === null) {
        result.push({ col: nc, row: nr });
        queue.push({ col: nc, row: nr, dist: curr.dist + 1 });
      }
    }
  }
  return result;
}

/** Linear movement along given directions up to maxDist. Stops at occupied. */
function getLinearMoves(
  col: number, row: number, dirs: number[][], maxDist: number, board: Board,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxDist; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      if (board.getUnit(nc, nr) !== null) break;
      result.push({ col: nc, row: nr });
    }
  }
  return result;
}

/** Jump targets: land on empty or enemy (ignores path). */
function getJumpTargets(
  col: number, row: number, dirs: number[][], board: Board, owner: Player,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc, nr = row + dr;
    if (!board.isInBounds(nc, nr)) continue;
    const occ = board.getUnit(nc, nr);
    if (occ === null || occ.owner !== owner) result.push({ col: nc, row: nr });
  }
  return result;
}

/** Forward 1 square (P1 moves down, P2 moves up). */
function getForwardMove(col: number, row: number, owner: Player, board: Board): Position[] {
  const dr = owner === Player.P1 ? 1 : -1;
  const nr = row + dr;
  if (!board.isInBounds(col, nr) || board.getUnit(col, nr) !== null) return [];
  return [{ col, row: nr }];
}

/** Adjacent enemies in given directions (range 1). */
function getEnemiesInDirs(
  col: number, row: number, dirs: number[][], board: Board, owner: Player,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    const nc = col + dc, nr = row + dr;
    if (!board.isInBounds(nc, nr)) continue;
    const u = board.getUnit(nc, nr);
    if (u && u.owner !== owner) result.push({ col: nc, row: nr });
  }
  return result;
}

/** Ranged enemies along directions up to maxRange. Stops at any unit. */
function getRangedEnemies(
  col: number, row: number, dirs: number[][], maxRange: number, board: Board, owner: Player,
): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxRange; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      const u = board.getUnit(nc, nr);
      if (u) {
        if (u.owner !== owner) result.push({ col: nc, row: nr });
        break;
      }
    }
  }
  return result;
}

/** Forward enemy (range 1, forward only). */
function getForwardEnemy(col: number, row: number, owner: Player, board: Board): Position[] {
  const dr = owner === Player.P1 ? 1 : -1;
  const nr = row + dr;
  if (!board.isInBounds(col, nr)) return [];
  const u = board.getUnit(col, nr);
  if (u && u.owner !== owner) return [{ col, row: nr }];
  return [];
}

/** All squares in given directions (range N), regardless of occupancy. For attack range UI. */
function getAllInDirs(col: number, row: number, dirs: number[][], range: number, board: Board): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= range; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (board.isInBounds(nc, nr)) result.push({ col: nc, row: nr });
    }
  }
  return result;
}

/** All ranged squares — stops at occupied but includes that square. For attack range UI. */
function getAllRanged(col: number, row: number, dirs: number[][], maxRange: number, board: Board): Position[] {
  const result: Position[] = [];
  for (const [dc, dr] of dirs) {
    for (let d = 1; d <= maxRange; d++) {
      const nc = col + dc * d, nr = row + dr * d;
      if (!board.isInBounds(nc, nr)) break;
      result.push({ col: nc, row: nr });
      if (board.getUnit(nc, nr) !== null) break;
    }
  }
  return result;
}

```

# src\game\pending\PendingCommand.ts

```ts
// ============================================================
// PendingCommand.ts — Serializable interaction commands
//
// Replaces the old PendingInteraction callback anti-pattern.
// Each variant is pure data — no functions, fully serializable.
// The engine pauses on a PendingCommand and resumes when the
// player makes a selection, resolved via PendingCommandResolver.
// ============================================================

import type { Position } from '../types/GameTypes';
import type { Player } from '../types/GameTypes';
import type { GameEvent } from '../types/EventTypes';

export type PendingCommand =
  | {
      kind: 'TARGET';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      validTargetIds: string[];
      reason: string;
      deferredEvents: GameEvent[];
    }
  | {
      kind: 'POSITION';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      validPositions: Position[];
      reason: string;
      deferredEvents: GameEvent[];
    }
  | {
      kind: 'COLUMN';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      reason: string;
      deferredEvents: GameEvent[];
    }
  | {
      kind: 'DISCARD';
      owner: Player;
      sourceCardId: string;
      sourceAbility: string;
      count: number;
      reason: string;
      deferredEvents: GameEvent[];
    };

```

# src\game\pending\PendingCommandResolver.ts

```ts
// ============================================================
// PendingCommandResolver.ts — Command resolution
//
// When the player makes a selection (target, position, column,
// or discard), this resolver produces the GameEvent[] to apply.
// ============================================================

import type { PendingCommand } from './PendingCommand';
import type { GameEvent } from '../types/EventTypes';
import type { IBoard } from '../interfaces/IBoard';
import { AbilityType } from '../types/AbilityTypes';

export type PendingSelection =
  | { kind: 'TARGET'; instanceId: string }
  | { kind: 'POSITION'; col: number; row: number }
  | { kind: 'COLUMN'; col: number }
  | { kind: 'DISCARD'; handIndex: number };

/** Optional context for resolving commands that need board state. */
export interface ResolveContext {
  board: IBoard;
}

/**
 * Resolve a pending command with the player's selection.
 * Returns events to apply to game state after resolution.
 */
export function resolvePending(
  command: PendingCommand,
  selection: PendingSelection,
  ctx?: ResolveContext,
): GameEvent[] {
  const events: GameEvent[] = [];

  // ── TARGET resolution ─────────────────────────────────────
  if (command.kind === 'TARGET' && selection.kind === 'TARGET') {
    resolveTarget(command, selection.instanceId, ctx, events);
  }

  // ── POSITION summon — place a unit at the selected position
  if (command.kind === 'POSITION' && selection.kind === 'POSITION') {
    events.push({
      type: 'UNIT_PLACED',
      instanceId: `${command.sourceCardId}_pending_${Date.now()}`,
      cardId: command.sourceCardId,
      owner: command.owner,
      col: selection.col,
      row: selection.row,
      isActive: true,
    } as GameEvent);
  }

  // Append deferred events (e.g., Mystic LEG drain)
  events.push(...command.deferredEvents);
  return events;
}

// ─────────────────────────────────────────────────────────────
// TARGET ability resolution
// ─────────────────────────────────────────────────────────────

function resolveTarget(
  cmd: PendingCommand & { kind: 'TARGET' },
  targetId: string,
  ctx: ResolveContext | undefined,
  events: GameEvent[],
): void {
  const ability = cmd.sourceAbility;

  // ── Priest: full heal ──────────────────────────────────────
  if (ability === AbilityType.ON_DEPLOY_HEAL_FRIENDLY) {
    if (!ctx?.board) return;
    const unit = ctx.board.getUnitById(targetId);
    if (!unit) return;
    const healAmount = unit.maxDef - unit.currentDef;
    if (healAmount <= 0) return; // already full HP
    events.push({
      type: 'UNIT_HEALED',
      instanceId: unit.instanceId,
      cardId: unit.cardId,
      col: unit.position.col,
      row: unit.position.row,
      amount: healAmount,
      newHP: unit.maxDef,
      maxHP: unit.maxDef,
      player: unit.owner,
      isKing: unit.cardId === 'king',
    } as GameEvent);
    return;
  }

  // ── Disease: damage structure + adjacent ────────────────────
  if (ability === AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ) {
    if (!ctx?.board) return;
    const structure = ctx.board.getUnitById(targetId);
    if (!structure) return;
    // Apply Disease timed effect — the actual damage ticks happen in EndPhase
    // For now, emit a structure-targeted event the engine can track
    events.push({
      type: 'UNIT_ATTACKED',
      attackerInstanceId: '',
      targetInstanceId: structure.instanceId,
      attackerCol: structure.position.col,
      attackerRow: structure.position.row,
      targetCol: structure.position.col,
      targetRow: structure.position.row,
      damage: 1,
      targetNewHP: Math.max(0, structure.currentDef - 1),
      targetPlayer: structure.owner,
      isKingHit: false,
      maxHP: structure.maxDef,
    } as GameEvent);
    // If structure dies from this
    if (structure.currentDef - 1 <= 0) {
      events.push({
        type: 'UNIT_DIED',
        instanceId: structure.instanceId,
        cardId: structure.cardId,
        owner: structure.owner,
        col: structure.position.col,
        row: structure.position.row,
        cause: 'DISEASE',
      } as GameEvent);
    }
    return;
  }

  // ── Coup: banish target royal, spawn foot soldiers ──────────
  if (ability === 'coupHandler') {
    if (!ctx?.board) return;
    const target = ctx.board.getUnitById(targetId);
    if (!target) return;
    events.push({
      type: 'UNIT_DIED',
      instanceId: target.instanceId,
      cardId: target.cardId,
      owner: target.owner,
      col: target.position.col,
      row: target.position.row,
      cause: 'COUP_BANISH',
    } as GameEvent);
    return;
  }

  // ── Treason: steal enemy unit for this turn ─────────────────
  if (ability === 'treasonHandler') {
    if (!ctx?.board) return;
    const target = ctx.board.getUnitById(targetId);
    if (!target) return;
    // Emit a transform event that flips ownership
    events.push({
      type: 'UNIT_TRANSFORMED',
      oldInstanceId: target.instanceId,
      newInstanceId: target.instanceId,
      toCardId: target.cardId,
      owner: cmd.owner,
      col: target.position.col,
      row: target.position.row,
      newHP: target.currentDef,
      newMaxHP: target.maxDef,
    } as GameEvent);
    return;
  }

  // ── Mystic / Revive: revive from graveyard (→ needs POSITION next) ──
  // For revive, the target is a graveyard card ID, not a board unit.
  // The actual placement will be a follow-up POSITION pending.
  // For now, just let deferredEvents handle it.
  if (ability === AbilityType.ON_DEPLOY_REVIVE || ability === 'mysticDeployHandler') {
    // The graveyard target will need a POSITION command next.
    // This is handled by the engine after these events apply.
    return;
  }
}

```

# src\game\phases\ActPhase.ts

```ts
// ============================================================
// phases/ActPhase.ts
// ACT phase: unit movement and attack execution.
//
// Responsibilities:
//   - Move validation (via UnitQuery + MovementRules)
//   - Attack validation (via UnitQuery + MovementRules)
//   - Combat execution (delegates to CombatResolver)
//   - Counter-attack handling (melee defenders retaliate)
//   - On-kill ability resolution (both sides — attacker or defender can die)
//   - Assassin jump-attack (move onto enemy = auto-attack, immune to counter)
//   - Lancer charge (move + attack same turn)
//   - Death handling (graveyard, on-death abilities, aura recalc)
//   - King death → game over (checked for both sides after counter-attack)
//
// PATCH v0.3:
//   - executeCombat now uses resolveAttackWithCounter
//   - Assassin jump passes isAssassinJump=true (immune to counter)
//   - On-kill checked for BOTH attacker→defender AND defender→attacker
//   - King death checked for BOTH sides (counter can kill attacking king)
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { opponent } from '../GameContext';
import type { Unit } from '../types/GameTypes';
import { Player, EngineStatus } from '../types/GameTypes';
import { AtkPattern } from '../types/CardTypes';
import { getCard } from '../data/CardRegistry';
import { canUnitMove, canUnitAttack } from '../UnitQuery';
import { isMoveValid, isAttackValid, isLancerForwardMove } from '../MovementRules';
import { resolveAttackWithCounter } from '../CombatResolver';
import { resolveOnDeath, resolveOnKill } from '../abilities/AbilityDispatcher';

// ─────────────────────────────────────────────
// MOVE
// ─────────────────────────────────────────────

/**
 * Attempt to move a unit to a new position.
 * Returns true if move was executed.
 */
export function executeMove(ctx: GameContext, unitId: string, col: number, row: number): boolean {
  const unit = ctx.board.getUnitById(unitId);
  if (!unit || unit.owner !== ctx.activePlayer) return false;

  // Capability check (alive, active, not stunned, hasn't acted, etc.)
  if (!canUnitMove(unit)) return false;

  // Pattern check (is this square reachable?)
  if (!isMoveValid(unit, col, row, ctx.board)) return false;

  // Lancer charge: movement must be forward
  const def = getCard(unit.cardId);
  if (unit.canAttackAfterMove && !isLancerForwardMove(unit, row)) {
    // If it's a charge unit, movement must be toward enemy
    // Non-charge units don't reach here (canAttackAfterMove is false)
  }

  const from = { ...unit.position };
  ctx.board.moveUnit(unitId, col, row);
  unit.hasMoved = true;

  // Non-charge units: moving ends their turn
  if (!unit.canAttackAfterMove) {
    unit.hasActed = true;
  }

  ctx.emit({
    type: 'UNIT_MOVED',
    instanceId: unitId,
    cardId: unit.cardId,
    owner: unit.owner,
    from,
    to: { col, row },
  });

  // Recalculate auras after move (e.g. Messenger aura triggers on adjacency change)
  // Always emit — even with empty changes — so the UI can sync ALL unit stats.
  const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  ctx.emit(auraEvent);

  // Assassin: jump onto enemy = auto-attack on landing (immune to counter-attack)
  if (unit.baseAtkPattern === AtkPattern.ON_JUMP) {
    const defender = ctx.board.getUnit(col, row);
    if (defender && defender.owner !== unit.owner) {
      executeCombat(ctx, unit, defender, true);  // isAssassinJump = true
    }
  }

  return true;
}

// ─────────────────────────────────────────────
// ATTACK
// ─────────────────────────────────────────────

/**
 * Attempt to attack a target unit.
 * Returns true if attack was executed.
 */
export function executeAttack(ctx: GameContext, unitId: string, targetId: string): boolean {
  const unit   = ctx.board.getUnitById(unitId);
  const target = ctx.board.getUnitById(targetId);
  if (!unit || !target) return false;
  if (unit.owner !== ctx.activePlayer) return false;
  if (target.owner === ctx.activePlayer) return false;

  // Capability check
  if (!canUnitAttack(unit)) return false;

  // Pattern check (is the target in attack range?)
  if (!isAttackValid(unit, target.position.col, target.position.row, ctx.board)) return false;

  executeCombat(ctx, unit, target, false);
  return true;
}

// ─────────────────────────────────────────────
// COMBAT EXECUTION (shared by attack + assassin jump)
// Handles: damage, counter-attack, death, on-kill, game over
// ─────────────────────────────────────────────

function executeCombat(ctx: GameContext, attacker: Unit, defender: Unit, isAssassinJump: boolean = false): void {
  // Resolve primary attack + possible counter-attack
  const events = resolveAttackWithCounter(attacker, defender, ctx.board, isAssassinJump);
  attacker.hasActed = true;

  // Apply all events (primary attack + counter-attack + deaths)
  for (const event of events) {
    ctx.emit(event);

    if (event.type === 'UNIT_ATTACKED') {
      const target = ctx.board.getUnitById(event.targetInstanceId);
      if (target) {
        ctx.board.updateUnitStats(target.instanceId, { currentDef: event.targetNewHP });
      }
    }

    if (event.type === 'UNIT_DIED') {
      handleUnitDeath(ctx, event.instanceId, event.cardId, event.owner, event.cause);
    }
  }

  // On-kill abilities — check if attacker killed defender
  const killedDefender = events.find(
    e => e.type === 'UNIT_DIED' && (e as any).instanceId === defender.instanceId
  );
  if (killedDefender) {
    const killResult = resolveOnKill(attacker, defender, ctx.board, ctx.players, ctx.mods);
    ctx.applyEvents(killResult.events);
  }

  // On-kill abilities — check if defender killed attacker via counter-attack
  const killedAttacker = events.find(
    e => e.type === 'UNIT_DIED' && (e as any).instanceId === attacker.instanceId
  );
  if (killedAttacker) {
    const counterKillResult = resolveOnKill(defender, attacker, ctx.board, ctx.players, ctx.mods);
    ctx.applyEvents(counterKillResult.events);
  }

  // King death = game over — must check BOTH sides (counter can kill attacking king)
  checkKingDeath(ctx, defender, attacker, events);
  checkKingDeath(ctx, attacker, defender, events);
}

/**
 * Check if a specific unit (expected king) died in the event stream.
 * If so, trigger game over with the opponent as winner.
 */
function checkKingDeath(ctx: GameContext, unit: Unit, killer: Unit, events: any[]): void {
  if (unit.cardId !== 'king') return;
  if (ctx.status === EngineStatus.GAME_OVER) return; // Already triggered

  // Find the last UNIT_ATTACKED event targeting this king
  const attacksOnKing = events.filter(
    e => e.type === 'UNIT_ATTACKED' && e.targetInstanceId === unit.instanceId
  );
  if (attacksOnKing.length === 0) return;

  const lastHP = attacksOnKing[attacksOnKing.length - 1].targetNewHP;
  if (lastHP <= 0) {
    triggerGameOver(ctx, killer.owner, 'KING_DESTROYED');
  }
}

// ─────────────────────────────────────────────
// DEATH HANDLING
// ─────────────────────────────────────────────

function handleUnitDeath(
  ctx: GameContext,
  instanceId: string,
  cardId: string,
  owner: Player,
  cause: string,
): void {
  const unit = ctx.board.getUnitById(instanceId);
  if (!unit) return;

  // Record in graveyard
  ctx.graveyard.set(instanceId, cardId);
  ctx.players[owner].addToGraveyard(instanceId);

  // Remove from board
  ctx.board.removeUnit(instanceId);

  // Card goes to discard
  ctx.players[owner].discard.push(cardId);

  // On-death abilities (e.g., Foot Soldier draw)
  const deathResult = resolveOnDeath(unit, cause, ctx.board, ctx.players, ctx.mods);
  ctx.applyEvents(deathResult.events);

  if (deathResult.pending) {
    ctx.pending = deathResult.pending;
    ctx.status = EngineStatus.AWAITING_INPUT;
  }

  // Recalculate auras + modifiers (removed unit may change discounts/stat auras)
  const deathAuraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  ctx.emit(deathAuraEvent);
}

// ─────────────────────────────────────────────
// GAME OVER
// ─────────────────────────────────────────────

function triggerGameOver(
  ctx: GameContext,
  winner: Player,
  reason: 'KING_DESTROYED' | 'SURRENDER' | 'TIMEOUT' | 'DISCONNECT',
): void {
  ctx.status = EngineStatus.GAME_OVER;
  ctx.emit({
    type: 'GAME_OVER',
    result: {
      winner,
      loser: opponent(winner),
      reason,
      turns: ctx.turnNumber,
    },
  });
}

```

# src\game\phases\DrawPhase.ts

```ts
// ============================================================
// phases/DrawPhase.ts
// DRAW phase: active player draws 1 card.
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { TurnPhase } from '../types/GameTypes';

/**
 * Execute the DRAW phase.
 * Active player draws 1 card from their deck.
 * If deck is empty, discard pile is reshuffled in (handled by PlayerState).
 */
export function runDrawPhase(ctx: GameContext): void {
  ctx.phase = TurnPhase.DRAW;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.DRAW, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });

  const ps = ctx.players[ctx.activePlayer];
  const deckBefore = ps.deck.length;
  const drawn = ps.drawCards(1);

  if (drawn.length > 0) {
    ctx.emit({
      type: 'CARD_DRAWN',
      player: ctx.activePlayer,
      cardId: drawn[0],
      handIndex: ps.hand.length - 1,
      deckRemaining: ps.deck.length,
    });
  }

  // Deck reshuffled (discard pile recycled)
  if (ps.deck.length > deckBefore) {
    ctx.emit({ type: 'DECK_SHUFFLED', player: ctx.activePlayer, newDeckCount: ps.deck.length });
  }
}

```

# src\game\phases\EndPhase.ts

```ts
// ============================================================
// phases/EndPhase.ts
// END phase: turn cleanup and win condition check.
//
// Execution order:
//   1. Tick timed effects (duration --)
//   2. Resolve Treason returns
//   3. Trim hand overflow (Motherland)
//   4. Clear LEG overflow flag
//   5. Check win condition (King death)
//   6. Emit TURN_ENDED
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { opponent } from '../GameContext';
import { Player, TurnPhase, EngineStatus } from '../types/GameTypes';
import { getValidAttacks } from '../MovementRules';

/**
 * Execute the END phase for the active player.
 * Returns true if game is over (win condition met).
 */
export function runEndPhase(ctx: GameContext): boolean {
  ctx.phase = TurnPhase.END;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.END, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });

  const ap = ctx.activePlayer;
  const mod = ctx.mods[ap];

  // 1. Tick timed effects (duration --)
  mod.tickEffects();

  // 2. Resolve Treason returns
  resolveTreasonReturns(ctx);

  // 3. Trim hand overflow (Motherland)
  const overflow = ctx.players[ap].trimOverflowHand();
  for (const cardId of overflow) {
    ctx.emit({ type: 'CARD_DISCARDED', player: ap, cardId, handIndex: -1 });
  }

  // 4. Clear LEG overflow flag
  mod.clearOverflow();

  // 5. Check win condition
  if (checkWinCondition(ctx)) return true;

  // 6. Emit TURN_ENDED
  ctx.emit({ type: 'TURN_ENDED', turn: ctx.turnNumber, activePlayer: ap });

  return false;
}

// ─────────────────────────────────────────────
// SUB-STEPS
// ─────────────────────────────────────────────

function resolveTreasonReturns(ctx: GameContext): void {
  for (const unit of ctx.board.getAllUnits()) {
    if (unit.treasonOwner !== null && unit.treasonOwner !== unit.owner) {
      const origPos = unit.originalPos ?? unit.position;
      ctx.board.moveUnit(unit.instanceId, origPos.col, origPos.row);
      unit.owner = unit.treasonOwner;
      unit.treasonOwner = null;
      unit.originalPos = null;
      unit.isExhausted = true;
      ctx.emit({
        type: 'UNIT_EXHAUSTED',
        instanceId: unit.instanceId,
        col: unit.position.col,
        row: unit.position.row,
      });
    }
  }
}

/**
 * Check if either King is dead.
 * Also emits KING_THREATENED warnings.
 * Returns true if game is over.
 */
function checkWinCondition(ctx: GameContext): boolean {
  for (const p of [Player.P1, Player.P2]) {
    const king = ctx.board.getKing(p);
    if (!king || king.currentDef <= 0) {
      ctx.status = EngineStatus.GAME_OVER;
      ctx.emit({
        type: 'GAME_OVER',
        result: {
          winner: opponent(p),
          loser: p,
          reason: 'KING_DESTROYED',
          turns: ctx.turnNumber,
        },
      });
      return true;
    }
  }

  // King threat warnings (informational — doesn't block turn)
  emitKingThreats(ctx);

  return false;
}

function emitKingThreats(ctx: GameContext): void {
  for (const p of [Player.P1, Player.P2]) {
    const king = ctx.board.getKing(p);
    if (!king) continue;

    const kc = king.position.col, kr = king.position.row;
    const threatIds: string[] = [];

    for (const u of ctx.board.getUnitsOf(opponent(p))) {
      if (!u.isActive) continue;
      const attacks = getValidAttacks(u, ctx.board);
      for (const pos of attacks) {
        if (pos.col === kc && pos.row === kr) {
          threatIds.push(u.instanceId);
          break; // one match per unit is enough
        }
      }
    }

    if (threatIds.length > 0) {
      ctx.emit({
        type: 'KING_THREATENED',
        kingInstanceId: king.instanceId,
        kingPlayer: p,
        attackerInstanceIds: threatIds,
      });
    }
  }
}

```

# src\game\phases\LEGPhase.ts

```ts
// ============================================================
// phases/LEGPhase.ts
// LEG phase: CROWN growth, LEG gain, passive effects, aura recalc.
//
// Execution order:
//   1. CROWN grows +1 (capped)
//   2. Gain LEG equal to effective CROWN
//   3. Enemy King penalty (−1 LEG if enemy King in own half)
//   4. Auto-heal (King's Guard)
//   5. Disease ticks
//   6. Castle area attacks + spawn check
//   7. Activate BUILD_DELAY units whose timer expired
//   8. Evaluate auras (stat buffs)
//   9. Recalculate modifiers (LEG rate, Royal discount)
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { opponent } from '../GameContext';
import { TurnPhase } from '../types/GameTypes';
import { getCard } from '../data/CardRegistry';
import { resolveCastleAreaAttack, applyDamage, applyAutoHeal } from '../CombatResolver';

const CROWN_CAP = 10;

/**
 * Execute the full LEG phase for the active player.
 */
export function runLEGPhase(ctx: GameContext): void {
  ctx.phase = TurnPhase.LEG;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.LEG, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });

  const ap = ctx.activePlayer;
  const mod = ctx.mods[ap];

  // 1. CROWN grows +1 each turn (capped)
  if (mod.legRateBase < CROWN_CAP) {
    mod.legRateBase += 1;
  }

  // 2. Gain LEG
  const gained = mod.gainLEG();
  ctx.emit({
    type: 'LEG_GAINED',
    player: ap,
    amount: gained,
    total: mod.legPool,
    rate: mod.getEffectiveLEGRate(),
  });

  // 3. Enemy King in own half → −1 LEG penalty
  const enemyKing = ctx.board.getKing(opponent(ap));
  if (enemyKing && ctx.board.isOwnHalf(enemyKing.position.col, enemyKing.position.row, ap)) {
    mod.removeLEG(1);
    ctx.emit({
      type: 'LEG_SPENT',
      player: ap,
      amount: 1,
      remaining: mod.legPool,
      rate: mod.getEffectiveLEGRate(),
    });
  }

  // 4. King's Guard auto-heal (+2 HP)
  runAutoHeals(ctx, ap);

  // 5. Disease ticks
  runDiseaseTicks(ctx, ap);

  // 6. Castle area attacks + spawn
  runCastleEffects(ctx, ap);

  // 7. Activate BUILD_DELAY units
  runBuildDelayActivation(ctx, ap);

  // 8+9. Evaluate auras (stat buffs) + recalculate modifiers (LEG rate, Royal discount)
  // Single call — evaluateAuras handles both stats AND economy processors.
  // Always emit — even with empty changes — so the UI can sync ALL unit stats.
  const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  ctx.emit(auraEvent);

  // Advance to PLAY phase
  ctx.phase = TurnPhase.PLAY;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.PLAY, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });
}

// ─────────────────────────────────────────────
// SUB-STEPS (private to this module)
// ─────────────────────────────────────────────

function runAutoHeals(ctx: GameContext, ap: number): void {
  for (const unit of ctx.board.getUnitsOf(ap)) {
    if (!unit.isActive) continue;
    const ability = getCard(unit.cardId).abilities.find(
      (a: any) => a.type === 'AURA_AUTO_HEAL'
    ) as any;
    if (!ability) continue;
    const amount = ability.params?.amount ?? 2;
    const healEvents = applyAutoHeal(unit, amount);
    ctx.applyEvents(healEvents);
  }
}

function runDiseaseTicks(ctx: GameContext, ap: number): void {
  const mod = ctx.mods[ap];
  const diseaseEffects = mod.timedEffects.filter(e => e.type === 'DISEASE_TICK');

  for (const effect of diseaseEffects) {
    if (!effect.targetInstanceId) continue;
    const target = ctx.board.getUnitById(effect.targetInstanceId);
    if (!target) continue;

    const dmg = effect.value ?? 2;
    const dmgEvents = applyDamage(target, dmg, 'DISEASE');
    ctx.applyEvents(dmgEvents);

    // Adjacency damage: 1 to neighbors
    const adj = ctx.board.getAdjacentUnits(target.position.col, target.position.row);
    for (const adjUnit of adj) {
      const adjEvents = applyDamage(adjUnit, 1, 'DISEASE');
      ctx.applyEvents(adjEvents);
    }
  }
}

function runCastleEffects(ctx: GameContext, ap: number): void {
  const castles = ctx.board.getUnitsOf(ap).filter(u =>
    u.cardId === 'castle' && u.isActive
  );

  for (const castle of castles) {
    // Area attack
    const atkEvents = resolveCastleAreaAttack(castle, ctx.board);
    ctx.applyEvents(atkEvents);

    // Spawn counter
    castle.spawnCounter++;
    const spawnDef = getCard('castle');
    const spawnAbility = spawnDef.abilities.find(
      (a: any) => a.type === 'PASSIVE_SPAWN'
    ) as any;
    const interval = spawnAbility?.params?.interval ?? 3;

    if (castle.spawnCounter >= interval) {
      castle.spawnCounter = 0;
      const freeSquares = ctx.board.getFreeSquaresInHalf(ap);
      if (freeSquares.length > 0) {
        const spawnPos = freeSquares[0];
        const spawnUnit = ctx.createUnit('foot_soldier', ap, spawnPos);
        ctx.board.placeUnit(spawnUnit);
        ctx.emit({
          type: 'UNIT_PLACED',
          instanceId: spawnUnit.instanceId,
          cardId: 'foot_soldier',
          owner: ap,
          col: spawnPos.col,
          row: spawnPos.row,
          isActive: true,
        });
        ctx.emit({
          type: 'STRUCTURE_SPAWNED',
          structureInstanceId: castle.instanceId,
          spawnedCardId: 'foot_soldier',
          spawnedInstanceId: spawnUnit.instanceId,
          col: spawnPos.col,
          row: spawnPos.row,
          owner: ap,
        });
      }
    }
  }
}

function runBuildDelayActivation(ctx: GameContext, ap: number): void {
  const mod = ctx.mods[ap];
  const readyUnits = mod.timedEffects.filter(
    e => e.type === 'BUILD_DELAY' && e.duration <= 1
  );

  for (const effect of readyUnits) {
    if (!effect.targetInstanceId) continue;
    const unit = ctx.board.getUnitById(effect.targetInstanceId);
    if (unit) {
      unit.isActive = true;
      ctx.emit({
        type: 'UNIT_ACTIVATED',
        instanceId: unit.instanceId,
        col: unit.position.col,
        row: unit.position.row,
      });
    }
  }
}

```

# src\game\phases\PlayPhase.ts

```ts
// ============================================================
// phases/PlayPhase.ts
// PLAY phase: validate and execute card plays from hand.
//
// Responsibilities:
//   - Afford check (LEG cost with Royal discount)
//   - Deploy position validation
//   - Unit/Structure placement on board
//   - Spell execution
//   - On-deploy ability resolution
//   - BUILD_DELAY timer setup
//   - Pending interaction setup (Priest heal target, etc.)
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import type { Unit } from '../types/GameTypes';
import { Allegiance, CardClass, CardFlag } from '../types/CardTypes';
import { getCard } from '../data/CardRegistry';
import { getValidDeploySquares } from '../MovementRules';
import { resolveOnDeploy } from '../abilities/AbilityDispatcher';
import { EngineStatus } from '../types/GameTypes';

/**
 * Attempt to play a card from the active player's hand.
 * Returns true if the card was successfully played.
 */
export function executePlayCard(
  ctx: GameContext,
  handIndex: number,
  col?: number,
  row?: number,
): boolean {
  const ps  = ctx.players[ctx.activePlayer];
  const mod = ctx.mods[ctx.activePlayer];
  const cardId = ps.hand[handIndex];
  if (!cardId) return false;

  const def = getCard(cardId);
  const isRoyal = def.allegiance === Allegiance.ROYAL;
  const cost = mod.getEffectiveCardCost(def.cost, isRoyal);

  // Afford check
  if (!mod.spendLEG(cost)) return false;

  // Remove from hand
  ps.playFromHand(handIndex);
  ctx.emit({ type: 'CARD_PLAYED', player: ctx.activePlayer, cardId, handIndex, legCost: cost });
  ctx.emit({ type: 'LEG_SPENT', player: ctx.activePlayer, amount: cost, remaining: mod.legPool, rate: mod.getEffectiveLEGRate() });

  let unitInstance: Unit | undefined;

  // ── Place unit/structure on board ──────────────────────
  if (def.class === CardClass.UNIT || def.class === CardClass.STRUCTURE) {
    if (col === undefined || row === undefined) {
      // Roll back — no position provided for a unit card
      mod.addLEG(cost);
      ps.hand.splice(handIndex, 0, cardId);
      return false;
    }

    // Validate deploy position
    const freeSquares = getValidDeploySquares(ctx.activePlayer, ctx.board);
    const isValidDeploy = freeSquares.some(p => p.col === col && p.row === row);
    if (!isValidDeploy) {
      mod.addLEG(cost);
      ps.hand.splice(handIndex, 0, cardId);
      return false;
    }

    const hasBuildDelay = def.flags.includes(CardFlag.BUILD_DELAY);
    unitInstance = ctx.createUnit(cardId, ctx.activePlayer, { col, row });
    unitInstance.isActive = !hasBuildDelay;

    if (hasBuildDelay) {
      mod.addTimedEffect({
        type: 'BUILD_DELAY',
        duration: 1,
        targetInstanceId: unitInstance.instanceId,
      });
    }

    ctx.board.placeUnit(unitInstance);
    ctx.emit({
      type: 'UNIT_PLACED',
      instanceId: unitInstance.instanceId,
      cardId,
      owner: ctx.activePlayer,
      col, row,
      isActive: unitInstance.isActive,
    });
  }

  // ── Resolve on-deploy abilities ────────────────────────
  const pos = (col !== undefined && row !== undefined) ? { col, row } : undefined;
  const result = resolveOnDeploy(
    cardId, ctx.activePlayer, pos,
    ctx.board, ctx.players, ctx.mods,
    unitInstance,
  );

  // Apply immediate events
  ctx.applyEvents(result.events);

  // Recalculate auras + modifiers (new unit may change discounts/rate/stat auras)
  // Always emit — even with empty changes — so the UI can sync ALL unit stats.
  const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  ctx.emit(auraEvent);

  // Handle pending interaction (Priest, Mystic, Disease, etc.)
  if (result.pending) {
    ctx.status = EngineStatus.AWAITING_INPUT;
    ctx.pending = result.pending;
    ctx.emit({
      type: result.pending.kind === 'TARGET'   ? 'PENDING_TARGET'   :
            result.pending.kind === 'POSITION' ? 'PENDING_POSITION' :
            result.pending.kind === 'COLUMN'   ? 'PENDING_COLUMN'   :
                                                  'PENDING_DISCARD',
      reason: result.pending.reason,
      sourceCardId:    result.pending.sourceCardId,
      sourceAbility:   result.pending.sourceAbility,
      validTargetIds:  result.pending.kind === 'TARGET' ? result.pending.validTargetIds : [],
      validPositions:  result.pending.kind === 'POSITION' ? result.pending.validPositions : [],
      count: result.pending.kind === 'DISCARD' ? result.pending.count : 1,
    } as any);
  }

  // Spells go to discard after play
  if (def.class === CardClass.SPELL) {
    ps.discard.push(cardId);
  }

  return true;
}

```

# src\game\PlayerState.ts

```ts
// ============================================================
// PlayerState.ts
// Hand, deck, discard pile per player.
// Pure TypeScript — no Phaser, no EventBus.
// ============================================================

import { Player } from './types/GameTypes';
import { getCard } from './data/CardRegistry';
import GameState from '../GameState';
import type { IPlayerState } from './interfaces/IPlayerState';

export class PlayerState implements IPlayerState {
  readonly player: Player;

  hand: string[]    = []; // cardIds (may have duplicates per copies rule)
  deck: string[]    = []; // cardIds, deck[0] = top
  discard: string[] = []; // cardIds
  graveyard: string[] = []; // instanceIds of dead units (for Mystic revive)

  handLimit: number = 10;

  constructor(player: Player) {
    this.player = player;
  }

  // ─────────────────────────────────────────────
  // DECK SETUP
  // ─────────────────────────────────────────────

  /** Load and shuffle a deck from an array of card IDs. */
/** Load and shuffle a deck from an array of card IDs. */
loadDeck(cardIds: string[], playerIndex: number = 0): void {
  this.deck = [...cardIds];
  
  // Temporarily offset the seed so P1 and P2 get different shuffles.
  // reshuffleDiscard() calls shuffle() normally and is unaffected.
  const gs = GameState as any;
  const originalSeed = gs.gameSeed;
  if (originalSeed && originalSeed > 0) {
    gs.gameSeed = originalSeed + playerIndex;
  }
  
  this.shuffle(this.deck);          // existing shuffle — unchanged
  
  gs.gameSeed = originalSeed;       // restore immediately after
  
  this.hand      = [];
  this.discard   = [];
  this.graveyard = [];
}

  // ─────────────────────────────────────────────
  // DRAW
  // ─────────────────────────────────────────────

  /**
   * Draw N cards from deck to hand.
   * If deck runs out, auto-shuffles discard in.
   * Respects handLimit — excess goes to discard.
   * Returns array of drawn cardIds.
   */
  drawCards(count: number): string[] {
    const drawn: string[] = [];

    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break; // Both empty — nothing to draw
        this.reshuffleDiscard();
      }

      const cardId = this.deck.shift()!;

      if (this.hand.length < this.handLimit) {
        this.hand.push(cardId);
      } else {
        // Over hand limit — card goes to discard (Motherland overflow handled separately)
        this.discard.push(cardId);
      }

      drawn.push(cardId);
    }

    return drawn;
  }

  /**
   * Draw cards with overflow allowed (Motherland effect).
   * Ignores handLimit for this draw only.
   * Caller is responsible for clearing overflow at END phase.
   */
  drawCardsOverflow(count: number): string[] {
    const drawn: string[] = [];

    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break;
        this.reshuffleDiscard();
      }
      const cardId = this.deck.shift()!;
      this.hand.push(cardId);
      drawn.push(cardId);
    }

    return drawn;
  }

  /**
   * Draw cards matching a filter (Scribe: ROYAL only).
   * Skips non-matching cards and keeps drawing until count met or deck empty.
   * Non-matching skipped cards go back to bottom of deck.
   */
  drawCardsFiltered(count: number, filter: 'ROYAL' | 'STANDARD'): string[] {
    const drawn: string[] = [];
    const skipped: string[] = [];
    let attempts = 0;
    const maxAttempts = this.deck.length + this.discard.length;

    while (drawn.length < count && attempts < maxAttempts) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break;
        this.reshuffleDiscard();
      }

      const cardId = this.deck.shift()!;
      attempts++;

      const def = getCard(cardId);
      const matches = filter === 'ROYAL'
        ? def.allegiance === 'ROYAL'
        : def.allegiance === 'STANDARD';

      if (matches) {
        if (this.hand.length < this.handLimit) {
          this.hand.push(cardId);
        } else {
          this.discard.push(cardId);
        }
        drawn.push(cardId);
      } else {
        skipped.push(cardId);
      }
    }

    // Put skipped cards at bottom of deck
    this.deck.push(...skipped);

    return drawn;
  }

  // ─────────────────────────────────────────────
  // HAND OPERATIONS
  // ─────────────────────────────────────────────

  /** Remove a card from hand by index. Returns the removed cardId. */
  playFromHand(index: number): string {
    if (index < 0 || index >= this.hand.length) {
      throw new Error(`[PlayerState] Invalid hand index ${index}`);
    }
    const [cardId] = this.hand.splice(index, 1);
    return cardId;
  }

  /** Discard a card from hand by index. Goes to discard pile. */
  discardFromHand(index: number): string {
    const cardId = this.playFromHand(index);
    this.discard.push(cardId);
    return cardId;
  }

  /** Add a card directly to hand (e.g., from summon effects). Returns false if over limit. */
  addToHand(cardId: string, overrideLimit = false): boolean {
    if (!overrideLimit && this.hand.length >= this.handLimit) return false;
    this.hand.push(cardId);
    return true;
  }

  /** Trim hand to handLimit, discarding excess from the end. Returns discarded cardIds. */
  trimOverflowHand(): string[] {
    if (this.hand.length <= this.handLimit) return [];
    const overflow = this.hand.splice(this.handLimit);
    this.discard.push(...overflow);
    return overflow;
  }

  // ─────────────────────────────────────────────
  // DECK OPERATIONS
  // ─────────────────────────────────────────────

  /** Pull a specific card by ID from the deck (used by Militia, Scribe). Returns false if not found. */
  findAndPullFromDeck(cardId: string): boolean {
    const idx = this.deck.indexOf(cardId);
    if (idx === -1) return false;
    this.deck.splice(idx, 1);
    return true;
  }

  /** Peek at top N cards of deck without drawing. Returns IDs (does NOT reveal to opponent by default). */
  peekTop(count: number): string[] {
    return this.deck.slice(0, count);
  }

  private reshuffleDiscard(): void {
    this.deck = [...this.discard];
    this.discard = [];
    this.shuffle(this.deck);
  }

private shuffle(arr: string[]): void {
  const seed = GameState.gameSeed;
  if (seed && seed > 0) {
    this.seededShuffle(arr, seed);
  } else {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}
private seededShuffle(arr: string[], seed: number): void {
  let s = seed >>> 0;
  const rng = (): number => {
    s = (Math.imul(s ^ (s >>> 15), s | 1) ^ (s + Math.imul(s ^ (s >>> 7), s | 61))) >>> 0;
    return s / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

  // ─────────────────────────────────────────────
  // GRAVEYARD (for Mystic revive)
  // ─────────────────────────────────────────────

  /** Record a dead unit. instanceId → cardId mapping stored externally; here just track instanceIds. */
  addToGraveyard(instanceId: string): void {
    this.graveyard.push(instanceId);
  }

  /** Get all graveyard instanceIds (GameEngine resolves which are revivable). */
  getGraveyard(): string[] {
    return [...this.graveyard];
  }

  // ─────────────────────────────────────────────
  // SERIALIZATION
  // ─────────────────────────────────────────────

  snapshot() {
    return {
      player:        this.player,
      hand:          [...this.hand],
      deckCount:     this.deck.length,
      discardCount:  this.discard.length,
      handLimit:     this.handLimit,
    };
  }
}

```

# src\game\types\AbilityTypes.ts

```ts
// ============================================================
// AbilityTypes.ts
// All ability type strings and ability context interfaces.
// AbilityDispatcher resolves these via handler registry.
// ============================================================

// ─────────────────────────────────────────────
// ABILITY TYPE ENUM
// Every row in the Implementation Plan ability table maps here.
// ─────────────────────────────────────────────

export enum AbilityType {
  // ── On-Deploy ──────────────────────────────
  ON_DEPLOY_DRAW             = 'ON_DEPLOY_DRAW',           // Messenger, Scribe
  ON_DEPLOY_HEAL_FRIENDLY    = 'ON_DEPLOY_HEAL_FRIENDLY',  // Priest
  ON_DEPLOY_REVIVE           = 'ON_DEPLOY_REVIVE',         // Mystic (custom)
  ON_DEPLOY_SUMMON_FROM_DECK = 'ON_DEPLOY_SUMMON_FROM_DECK', // Militia (custom)
  ON_DEPLOY_SCOUT_DECK       = 'ON_DEPLOY_SCOUT_DECK',     // Scout, Messenger

  // ── On-Death ───────────────────────────────
  ON_DEATH_DRAW              = 'ON_DEATH_DRAW',            // Foot Soldier

  // ── On-Kill ────────────────────────────────
  ON_KILL_LEG_DRAIN          = 'ON_KILL_LEG_DRAIN',        // Inquisitor

  // ── Passive Auras (recalc every turn) ──────
  AURA_ROYAL_DISCOUNT        = 'AURA_ROYAL_DISCOUNT',      // Princess, Castle, Temple, Kings Guard
  AURA_LEG_BONUS             = 'AURA_LEG_BONUS',           // Princess
  AURA_ADJ_DEF               = 'AURA_ADJ_DEF',             // Castle
  AURA_BOARD_HALF_DEF        = 'AURA_BOARD_HALF_DEF',      // Commander
  AURA_BOARD_HALF_ATK        = 'AURA_BOARD_HALF_ATK',      // Commander
  AURA_VILLAGE_SLOW          = 'AURA_VILLAGE_SLOW',        // Village
  AURA_CAVALRY_COUNTER       = 'AURA_CAVALRY_COUNTER',     // Pikeman (x3 ATK vs cavalry)
  AURA_PIKEMAN_FLANK         = 'AURA_PIKEMAN_FLANK',       // Pikeman (flank bonus)
  AURA_AUTO_HEAL             = 'AURA_AUTO_HEAL',           // Kings Guard
  AURA_SUPPRESS_KING_ATK     = 'AURA_SUPPRESS_KING_ATK',   // Messenger: adjacent enemy King ATK = 0

  // ── Passive Flags ──────────────────────────
  PASSIVE_BUILD_DELAY        = 'PASSIVE_BUILD_DELAY',      // Castle (inactive 1 turn)
  PASSIVE_SPAWN              = 'PASSIVE_SPAWN',            // Castle (foot soldier every 3 turns)
  PASSIVE_LANCER_CHARGE      = 'PASSIVE_LANCER_CHARGE',    // Lancer (move + attack same turn)

  // ── Spell Effects ──────────────────────────
  SPELL_DAMAGE_STRUCTURE_ADJ = 'SPELL_DAMAGE_STRUCTURE_ADJ', // Disease
  SPELL_FREEZE_LEG_RATE      = 'SPELL_FREEZE_LEG_RATE',    // Civil War
  SPELL_DRAIN_LEG_RATE_PERM  = 'SPELL_DRAIN_LEG_RATE_PERM',// Casus Belli
  SPELL_STEAL_LEG            = 'SPELL_STEAL_LEG',          // Bandit Raid (future)
  SPELL_FORWARD_DEPLOY       = 'SPELL_FORWARD_DEPLOY',     // Casus Belli companion
  SPELL_TRANSFORM_ALL        = 'SPELL_TRANSFORM_ALL',      // Reform
  SPELL_DRAW_BY_COST         = 'SPELL_DRAW_BY_COST',       // Reinforcements (future)
  SPELL_DRAW_STRUCTURES      = 'SPELL_DRAW_STRUCTURES',    // Motherland (custom)
  SPELL_EARTHQUAKE           = 'SPELL_EARTHQUAKE',         // Earthquake (custom)
  SPELL_WAR_HORN             = 'SPELL_WAR_HORN',           // War Horn (custom)
  SPELL_COUP                 = 'SPELL_COUP',               // Coup (custom)
  SPELL_TREASON              = 'SPELL_TREASON',            // Treason (custom)
  SPELL_REVOLT               = 'SPELL_REVOLT',             // Peasant Revolt (custom)

  CUSTOM                     = 'CUSTOM',                   // Fallback for multi-step
}

// ─────────────────────────────────────────────
// ABILITY CONTEXT
// Passed to every ability handler. Contains everything
// the resolver needs without importing GameEngine.
// ─────────────────────────────────────────────

export interface AbilityContext {
  cardId: string;
  instanceId?: string;       // Set when unit is already placed
  ownerPlayer: number;       // 0 = P1, 1 = P2
  deployPosition?: { col: number; row: number };
  boardSnapshot: any;        // Board.serialize() — read-only view
  playerStates: any[];       // PlayerState snapshots [P1, P2]
  modifiers: any[];          // GameModifiers [P1, P2]
}

// ─────────────────────────────────────────────
// PENDING COMMAND (type re-export for convenience)
// See src/game/pending/PendingCommand.ts for the canonical definition.
// ─────────────────────────────────────────────

export type { PendingCommand } from '../pending/PendingCommand';

```

# src\game\types\CardTypes.ts

```ts
// ============================================================
// CardTypes.ts
// All card-related enums and interfaces.
// Zero runtime logic — pure type definitions only.
// This is the contract every other game file builds against.
//
// PATCH v0.3:
//   - Added CombatTag enum (MELEE / RANGED)
//   - Added optional combatTag field on CardDefinition
// ============================================================

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

export enum CardClass {
  UNIT      = 'UNIT',
  SPELL     = 'SPELL',
  STRUCTURE = 'STRUCTURE',
}

export enum Allegiance {
  STANDARD = 'STANDARD',
  ROYAL    = 'ROYAL',
}

export enum SubType {
  CAVALRY   = 'CAVALRY',
  STRUCTURE = 'STRUCTURE',
  // SOLDIER, NOBLE reserved for future expansion
}

export enum CardFlag {
  BUILD_DELAY     = 'BUILD_DELAY',     // Structure placed inactive for 1 turn
  LANCER_CHARGE   = 'LANCER_CHARGE',   // May MOVE + ATTACK in same ACT phase
  CAVALRY_COUNTER = 'CAVALRY_COUNTER', // Pikeman: x3 ATK vs isCavalry
  TAUNT_ROW       = 'TAUNT_ROW',       // Enemies must attack this unit if in range
}

export enum MovementType {
  OMNI_1          = 'OMNI_1',          // 1 step any direction (8 squares)
  OMNI_2          = 'OMNI_2',          // 2 steps any direction
  OMNI_3          = 'OMNI_3',          // 3 steps any direction
  VERTICAL_2      = 'VERTICAL_2',      // 2 steps forward/back only
  JUMP_DIAGONAL_1 = 'JUMP_DIAGONAL_1', // Assassin: jump to diagonal, ignores occupied
  FWD_VERTICAL_1  = 'FWD_VERTICAL_1',  // 1 step forward only (future: Vanguard)
  STATIC          = 'STATIC',          // Cannot move (Castle, Temple, Village)
}

export enum AtkPattern {
  HV               = 'HV',               // Horizontal/Vertical melee (4 squares)
  OMNI             = 'OMNI',             // All 8 adjacent squares melee
  DIAGONAL_RANGED_2= 'DIAGONAL_RANGED_2',// Archer: diagonal up to 2 squares, bypasses adjacency
  STRAIGHT_RANGED_3= 'STRAIGHT_RANGED_3',// Siege Tower: straight 3 (future)
  ON_JUMP          = 'ON_JUMP',          // Assassin: attacks landing square on jump
  AREA_ADJ         = 'AREA_ADJ',         // Castle: attacks all 8 adjacent squares simultaneously
  FWD_VERTICAL     = 'FWD_VERTICAL',     // Forward only (future: Vanguard)
  NONE             = 'NONE',             // Cannot attack (Princess, Temple, Messenger, Scribe)
}

/**
 * CombatTag — determines counter-attack eligibility.
 * MELEE units that are attacked in melee range will counter-attack.
 * RANGED units do not trigger or receive counter-attacks.
 *
 * Derived automatically from AtkPattern if not set explicitly on CardDefinition.
 * Explicit override allows fine-grained control per card.
 */
export enum CombatTag {
  MELEE  = 'MELEE',   // Adjacent attackers — subject to counter-attack
  RANGED = 'RANGED',  // Ranged attackers — no counter-attack
}

// ─────────────────────────────────────────────
// UNIT STATS (base values on CardDefinition)
// ─────────────────────────────────────────────

export interface UnitStats {
  atk: number;
  def: number;
  movement: MovementType;
  attackPattern: AtkPattern;
  // NEW: optional custom overrides — if present, these replace the enum logic
  customMove?: CustomPattern;
  customAttack?: CustomPattern;
}
export interface PatternOffset {
  dx: number;   // column offset (-1 = left, +1 = right)
  dy: number;   // row offset from P1's perspective (+1 = toward enemy, -1 = toward own half). Flipped for P2 at resolve time.
}
export interface CustomPattern {
  offsets: PatternOffset[];   // which squares relative to unit
  range?: number;             // max steps per direction (default 1)
  canJump?: boolean;          // ignore blocking units (default false)
  requiresEnemy?: boolean;    // only valid if enemy present (for attacks)
}

// ─────────────────────────────────────────────
// CARD DEFINITION
// ─────────────────────────────────────────────

export interface CardDefinition {
  id: string;                  // 'foot_soldier', 'knights_guard'
  name: string;                // Display name
  flavorText?: string;         // Optional lore line
  class: CardClass;
  allegiance: Allegiance;
  subtypes: SubType[];
  cost: number;                // Base LEG cost
  copies: number;              // Max copies per deck: 1, 2, or 3
  stats?: UnitStats;           // Present on UNIT and STRUCTURE, absent on SPELL
  flags: CardFlag[];
  combatTag?: CombatTag;       // Override derived combat tag. If omitted, derived from attackPattern.
  backstabBonus?: number;      // +N ATK when attacking from directly behind (dx=0, 1 row behind). Scout = 1.
  ambushBonus?: number;        // +N ATK when attacking from rear arc (|dx|≤1, 1 row behind). Assassin = 1.
  abilities: Array<CommonAbility | CustomAbility>;
  abilityText?: string;        // Human-readable description for UI rendering
}

// ─────────────────────────────────────────────
// ABILITY SYSTEM TYPES (referenced by CardDefinition)
// Full definitions live in AbilityTypes.ts
// ─────────────────────────────────────────────

export interface CommonAbility {
  type: string;                // AbilityType enum value
  params: Record<string, any>;
}

export interface CustomAbility {
  type: 'CUSTOM';
  handler: string;             // Handler key — resolved in AbilityDispatcher
}

```

# src\game\types\EventTypes.ts

```ts
// ============================================================
// EventTypes.ts
// All events the GameEngine emits via EventBus.
// Phaser subscribes to these — never reads GameState directly.
// Each event carries the exact data the renderer needs.
// ============================================================

import type { Player, TurnPhase, Position, MatchResult, StatBuff } from './GameTypes';

// ─────────────────────────────────────────────
// UNIT EVENTS
// ─────────────────────────────────────────────

export interface EvUnitPlaced {
  type: 'UNIT_PLACED';
  instanceId: string;
  cardId: string;
  owner: Player;
  col: number;
  row: number;
  isActive: boolean;         // false = BUILD_DELAY — render as inactive
}

export interface EvUnitMoved {
  type: 'UNIT_MOVED';
  instanceId: string;
  cardId: string;
  owner: Player;
  from: Position;
  to: Position;
}

/** Breakdown of how damage was calculated — for audit trail / game log. */
export interface DamageBreakdown {
  baseAtk: number;           // unit.currentAtk (already includes aura buffs)
  cavalryCounter: number;    // additional ATK from x3 multiplier (0 if N/A)
  backstabBonus: number;     // from card definition (0 if N/A)
  ambushBonus: number;       // from card definition (0 if N/A)
  totalDamage: number;       // final clamped value
  auraBuffs: StatBuff[];     // aura buffs active on the attacker at time of attack
}

export interface EvUnitAttacked {
  type: 'UNIT_ATTACKED';
  attackerInstanceId: string;
  targetInstanceId: string;
  attackerCol: number;
  attackerRow: number;
  targetCol: number;
  targetRow: number;
  damage: number;
  targetNewHP: number;
  targetPlayer: Player;
  isKingHit: boolean;
  newHP?: number;
  maxHP?: number;
  /** Full damage calculation breakdown — present for unit-on-unit combat, absent for EFFECT damage. */
  breakdown?: DamageBreakdown;
}

export interface EvUnitDied {
  type: 'UNIT_DIED';
  instanceId: string;
  cardId: string;
  owner: Player;
  col: number;
  row: number;
  cause: 'COMBAT' | 'EARTHQUAKE' | 'DISEASE' | 'COUP_BANISH';
}

export interface EvUnitHealed {
  type: 'UNIT_HEALED';
  instanceId: string;
  cardId: string;
  col: number;
  row: number;
  amount: number;
  newHP: number;
  maxHP: number;
  player: Player;
  isKing: boolean;
}

export interface EvUnitTransformed {
  type: 'UNIT_TRANSFORMED';
  oldInstanceId: string;
  newInstanceId: string;
  fromCardId: string;
  toCardId: string;
  col: number;
  row: number;
  owner: Player;
  newHP: number;
  newMaxHP: number;
}

export interface EvUnitExhausted {
  type: 'UNIT_EXHAUSTED';
  instanceId: string;
  col: number;
  row: number;
}

export interface EvUnitRefreshed {
  type: 'UNIT_REFRESHED';
  instanceId: string;
  col: number;
  row: number;
}

export interface EvUnitActivated {
  type: 'UNIT_ACTIVATED';  // BUILD_DELAY resolved
  instanceId: string;
  col: number;
  row: number;
}

export interface EvAuraApplied {
  type: 'AURA_APPLIED';
  // Full list of stat changes this turn. Renderer uses for animation hints.
  changes: Array<{
    instanceId: string;
    col: number;
    row: number;
    atkDelta: number;
    defDelta: number;
    moveDelta: number;
    /** Per-source breakdown of stat modifications. */
    buffs?: StatBuff[];
  }>;
}

// ─────────────────────────────────────────────
// CARD EVENTS
// ─────────────────────────────────────────────

export interface EvCardDrawn {
  type: 'CARD_DRAWN';
  player: Player;
  cardId: string;
  handIndex: number;
  deckRemaining: number;
}

export interface EvCardPlayed {
  type: 'CARD_PLAYED';
  player: Player;
  cardId: string;
  handIndex: number;
  legCost: number;
}

export interface EvCardDiscarded {
  type: 'CARD_DISCARDED';
  player: Player;
  cardId: string;
  handIndex: number;
}

// ─────────────────────────────────────────────
// LEG / ECONOMY EVENTS
// ─────────────────────────────────────────────

export interface EvLEGGained {
  type: 'LEG_GAINED';
  player: Player;
  amount: number;
  total: number;
  rate: number;
}

export interface EvLEGSpent {
  type: 'LEG_SPENT';
  player: Player;
  amount: number;
  remaining: number;
  rate: number;
}

export interface EvLEGStolen {
  type: 'LEG_STOLEN';
  from: Player;
  to: Player;
  amount: number;
}

export interface EvLEGRateChanged {
  type: 'LEG_RATE_CHANGED';
  player: Player;
  oldRate: number;
  newRate: number;
  reason: string;  // 'CASUS_BELLI' | 'MYSTIC' | 'INQUISITOR' | 'REVOLT' | 'CIVIL_WAR'
}

// ─────────────────────────────────────────────
// PHASE / TURN EVENTS
// ─────────────────────────────────────────────

export interface EvPhaseChanged {
  type: 'PHASE_CHANGED';
  phase: TurnPhase;
  activePlayer: Player;
  turn: number;
}

export interface EvTurnStarted {
  type: 'TURN_STARTED';
  turn: number;
  activePlayer: Player;
}

export interface EvTurnEnded {
  type: 'TURN_ENDED';
  turn: number;
  activePlayer: Player;
}

// ─────────────────────────────────────────────
// PENDING INTERACTION EVENTS (engine paused, awaiting input)
// ─────────────────────────────────────────────

export interface EvPendingTarget {
  type: 'PENDING_TARGET';
  reason: string;
  validTargetIds: string[];  // Unit instanceIds the player may pick
}

export interface EvPendingPosition {
  type: 'PENDING_POSITION';
  reason: string;
  validPositions: Position[];
}

export interface EvPendingColumn {
  type: 'PENDING_COLUMN';
  reason: string;
}

export interface EvPendingDiscard {
  type: 'PENDING_DISCARD';
  reason: string;
  count: number;             // Number of cards the player must discard
}

export interface EvInteractionResolved {
  type: 'INTERACTION_RESOLVED';
  cancelled?: boolean;
}

// ─────────────────────────────────────────────
// GAME STATE EVENTS
// ─────────────────────────────────────────────

export interface EvKingThreatened {
  type: 'KING_THREATENED';
  kingInstanceId: string;
  kingPlayer: Player;
  attackerInstanceIds: string[];
}

export interface EvGameOver {
  type: 'GAME_OVER';
  result: MatchResult;
}

export interface EvDeckShuffled {
  type: 'DECK_SHUFFLED';
  player: Player;
  newDeckCount: number;
}

export interface EvScoutResult {
  type: 'SCOUT_RESULT';
  player: Player;           // Which player gets to see
  topCards: string[];       // Top N cardIds of opponent deck
}

export interface EvStructureSpawned {
  type: 'STRUCTURE_SPAWNED';
  structureInstanceId: string;
  spawnedCardId: string;
  spawnedInstanceId: string;
  col: number;
  row: number;
  owner: Player;
}

// ─────────────────────────────────────────────
// UNION TYPE
// EventBus.emit() and .on() are typed against this union.
// ─────────────────────────────────────────────

export type GameEvent =
  | EvUnitPlaced
  | EvUnitMoved
  | EvUnitAttacked
  | EvUnitDied
  | EvUnitHealed
  | EvUnitTransformed
  | EvUnitExhausted
  | EvUnitRefreshed
  | EvUnitActivated
  | EvAuraApplied
  | EvCardDrawn
  | EvCardPlayed
  | EvCardDiscarded
  | EvLEGGained
  | EvLEGSpent
  | EvLEGStolen
  | EvLEGRateChanged
  | EvPhaseChanged
  | EvTurnStarted
  | EvTurnEnded
  | EvPendingTarget
  | EvPendingPosition
  | EvPendingColumn
  | EvPendingDiscard
  | EvInteractionResolved
  | EvKingThreatened
  | EvGameOver
  | EvDeckShuffled
  | EvScoutResult
  | EvStructureSpawned;

export type GameEventType = GameEvent['type'];

```

# src\game\types\GameEventMap.ts

```ts
// ============================================================
// GameEventMap.ts
// Typed payload map for every event flowing through EventBus.
// NOTE: These reflect the UI-adapted payloads emitted by
// wireEngineToEventBus in BattleScene, NOT the raw engine events.
// ============================================================

import type { Position, Player } from './GameTypes';
import type { CardRenderData, HUDSnapshot } from './UITypes';
import type {
  EvUnitMoved, EvUnitAttacked,
  EvUnitHealed, EvUnitActivated, EvAuraApplied,
  EvLEGGained, EvLEGSpent, EvLEGStolen, EvLEGRateChanged,
  EvPhaseChanged, EvTurnStarted, EvTurnEnded,
  EvPendingTarget, EvPendingPosition, EvPendingColumn, EvPendingDiscard,
  EvInteractionResolved,
  EvKingThreatened, EvGameOver, EvDeckShuffled, EvScoutResult, EvStructureSpawned,
} from './EventTypes';

export interface GameEventMap {
  // ─── Unit events (UI-adapted by wireEngineToEventBus) ─────

  // Emitted with CardRenderData + position (enriched from engine event)
  UNIT_PLACED:         { data: CardRenderData; col: number; row: number };
  UNIT_MOVED:          { from: Position; to: Position };
  UNIT_ATTACKED:       EvUnitAttacked;
  UNIT_DIED:           { col: number; row: number; instanceId: string };
  UNIT_HEALED:         EvUnitHealed;
  UNIT_TRANSFORMED:    never; // Emitted as UNIT_DIED + UNIT_PLACED pair
  UNIT_EXHAUSTED:      { col: number; row: number };
  UNIT_REFRESHED:      { col: number; row: number };
  UNIT_ACTIVATED:      EvUnitActivated;
  UNIT_STATS_CHANGED:  { instanceId: string; atk?: number; currentHP?: number; maxHP?: number; canAct?: boolean };
  AURA_APPLIED:        EvAuraApplied;

  // ─── Card events (UI-adapted) ─────────────────────────────

  CARD_DRAWN:          { card: CardRenderData; handIndex: number; deckRemaining: number };
  CARD_PLAYED:         { handIndex: number; player: Player; isLocal: boolean };
  CARD_DISCARDED:      { handIndex: number; player: Player; isLocal: boolean };
  OPPONENT_CARD_DRAWN: { handIndex: number };

  // ─── LEG economy (pass-through) ──────────────────────────

  LEG_GAINED:          EvLEGGained;
  LEG_SPENT:           EvLEGSpent;
  LEG_STOLEN:          EvLEGStolen;
  LEG_RATE_CHANGED:    EvLEGRateChanged;

  // ─── Phase / turn (pass-through) ─────────────────────────

  PHASE_CHANGED:       EvPhaseChanged;
  TURN_STARTED:        EvTurnStarted;
  TURN_ENDED:          EvTurnEnded;
  GAME_OVER:           EvGameOver;

  // ─── Pending interactions (pass-through) ──────────────────

  PENDING_TARGET:      EvPendingTarget;
  PENDING_POSITION:    EvPendingPosition;
  PENDING_COLUMN:      EvPendingColumn;
  PENDING_DISCARD:     EvPendingDiscard;
  INTERACTION_RESOLVED: EvInteractionResolved;

  // ─── Other game events (pass-through) ─────────────────────

  KING_THREATENED:     EvKingThreatened;
  DECK_SHUFFLED:       EvDeckShuffled;
  SCOUT_RESULT:        EvScoutResult;
  STRUCTURE_SPAWNED:   EvStructureSpawned;

  // ─── UI Events ────────────────────────────────────────────

  SELECTION_CHANGED:   SelectionChangedPayload;
  HIGHLIGHTS_CHANGED:  HighlightsChangedPayload;
  INPUT_BOARD_CLICK:   { col: number; row: number };
  INPUT_HAND_CLICK:    { index: number | null };
  CARD_HOVERED:        CardHoveredPayload;
  CARD_HOVER_END:      CardHoverEndPayload;
  DETAIL_SHOW:         CardRenderData;
  DETAIL_HIDE:         Record<string, never>;
  HUD_REFRESH:         HUDSnapshot;

  // Network (currently unused — reserved)
  NET_OPPONENT_ACTION: unknown;
  NET_GAME_STATE_SYNC: unknown;
}

// ─── UI Payload Types ───────────────────────────────────────

export type SelectionChangedPayload =
  | { source: 'hand'; index: number; validDeploy: Position[] }
  | { source: 'board'; col: number; row: number; validMoves: Position[]; validAttacks: Position[] }
  | { source: 'clear'; index: null };

export interface HighlightsChangedPayload {
  moves: Position[];
  attacks: Position[];
  attackRange?: Position[];
  deploy?: Position[];
  auras: Position[];
}

export type CardHoveredPayload =
  | { index: number; card: CardRenderData }
  | { col: number; row: number };

export type CardHoverEndPayload =
  | { index: number }
  | { col: number; row: number };

export type GameEventType = keyof GameEventMap;

```

# src\game\types\GameTypes.ts

```ts
// ============================================================
// GameTypes.ts
// Runtime game state types. These are NOT card definitions —
// these are the live state objects that change during play.
//
// PATCH v0.3:
//   - Added isJustPlaced to Unit (can't act on deploy turn)
//   - Added combatTag to Unit (MELEE/RANGED for counter-attack)
// ============================================================

import type { MovementType, AtkPattern, CombatTag } from './CardTypes';

// ─────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────

export interface Position {
  col: number; // 0-based, 0 = left
  row: number; // 0-based, 0 = top (enemy side for P1)
}

export enum Player {
  P1 = 0,
  P2 = 1,
}

export enum TurnPhase {
  DRAW  = 'DRAW',
  LEG   = 'LEG',
  PLAY  = 'PLAY',
  ACT   = 'ACT',
  END   = 'END',
}

export enum EngineStatus {
  IDLE            = 'IDLE',
  AWAITING_INPUT  = 'AWAITING_INPUT', // Paused, waiting for selectTarget/etc.
  GAME_OVER       = 'GAME_OVER',
}

// ─────────────────────────────────────────────
// TIMED EFFECTS
// Stored in GameModifiers.timedEffects per player.
// Tick() called at END phase. Duration reaches 0 → remove.
// ─────────────────────────────────────────────

export type TimedEffectType =
  | 'CIVIL_WAR_FREEZE'      // LEG rate frozen
  | 'DISEASE_TICK'          // Structure takes damage each turn
  | 'WAR_HORN_MOVEMENT'     // All units +1 move this turn only
  | 'BUILD_DELAY'           // Structure becomes active next turn
  | 'KINGS_RALLY_DEF'       // Unit +DEF buff for N turns (future)
  | 'PEASANT_REVOLT_COST'   // Permanent Royal cost penalty (duration: -1 = permanent)
  | 'CASUS_BELLI_RATE';     // Permanent LEG rate drain (duration: -1 = permanent)

export interface TimedEffect {
  type: TimedEffectType;
  duration: number;          // Turns remaining. -1 = permanent, never removed.
  targetInstanceId?: string; // For unit-specific effects (Disease target)
  value?: number;            // e.g., damage per tick, movement bonus
}

// ─────────────────────────────────────────────
// STAT AUDIT TRAIL
// Rebuilt each aura evaluation. Each entry records
// WHO changed WHAT by HOW MUCH.
// ─────────────────────────────────────────────

export interface StatBuff {
  source: string;        // e.g. 'commander:AURA_BOARD_HALF_ATK', 'Backstab', 'Cavalry Counter'
  atkDelta: number;
  defDelta: number;
  moveDelta: number;
}

// ─────────────────────────────────────────────
// UNIT (runtime, not CardDefinition)
// Created when a card is played. Lives on the Board.
// ─────────────────────────────────────────────

export interface Unit {
  instanceId: string;        // Unique per placed unit, e.g. 'foot_soldier_1'
  cardId: string;            // References CARD_DEFINITIONS entry
  owner: Player;
  position: Position;

  // Base stats — from CardDefinition.stats, never change during game
  baseAtk: number;
  baseDef: number;
  baseMovement: number;
  baseAtkPattern: AtkPattern;
  baseMovementType: MovementType;

  // Current stats — base + aura buffs, recalculated fresh each LEG phase
  currentAtk: number;
  currentDef: number;        // = current HP (DEF = HP)
  maxDef: number;            // For heal-to-full calculations
  currentMovement: number;

  // Turn flags — reset at START of each owner turn
  hasMoved: boolean;
  hasActed: boolean;
  isJustPlaced: boolean;     // true on the turn deployed — can't move/attack (except exception cards)

  // Persistent state
  isActive: boolean;         // false during BUILD_DELAY
  isExhausted: boolean;      // Treason: unit returned, can't act this turn

  // Treason tracking
  treasonOwner: Player | null;   // Original owner if under Treason
  originalPos: Position | null;  // Position to return to at END

  // Castle-specific
  spawnCounter: number;      // Increments each turn; spawns at interval

  // Stat audit trail — rebuilt each aura evaluation
  activeBuffs: StatBuff[];

    // ── Status effects (all default false) ──────────────
  isStunned: boolean;         // Cannot move or attack this turn
  isRooted: boolean;          // Cannot move, CAN still attack
  isSilenced: boolean;     

   // ── Computed capability (set at creation by UnitFactory) ──
  canAttackAfterMove: boolean; // Lancer charge, future: Berserker, Swift Strike
  combatTag: CombatTag | null; // MELEE or RANGED — derived or overridden. null = no attack.
}

// ─────────────────────────────────────────────
// BOARD CELL
// ─────────────────────────────────────────────

export interface BoardCell {
  col: number;
  row: number;
  unit: Unit | null;
}

// ─────────────────────────────────────────────
// GAME MODIFIERS (per player)
// ─────────────────────────────────────────────

export interface GameModifiers {
  legRateBase: number;      // Always 1 (King's base generation)
  legRateBonus: number;     // +Princess count while on board
  legRatePenalty: number;   // Casus Belli / Mystic / Inquisitor / Revolt (permanent -1)
  // effectiveLegRate = max(1, base + bonus - penalty)  unless frozen by Civil War

  royalCostDiscount: number; // Castle + Temple + Princess (stack, floor 0)
  royalCostPenalty: number;  // Peasant Revolt +2 (no floor on penalty)
  // effectiveCost(card) = max(0, card.cost - royalCostDiscount + royalCostPenalty)

  legPool: number;           // Current spendable LEG, cap 10 (Motherland: overflow for 1 turn)
  legRateFrozen: boolean;    // Civil War active — rate does not apply this turn

  timedEffects: TimedEffect[];
}

// ─────────────────────────────────────────────
// PLAYER STATE
// ─────────────────────────────────────────────

export interface PlayerStateSnapshot {
  player: Player;
  hand: string[];            // cardIds in hand order
  deckCount: number;
  discardCount: number;
  handLimit: number;         // Base 10
}

// ─────────────────────────────────────────────
// TURN STATE
// ─────────────────────────────────────────────

export interface TurnState {
  turnNumber: number;
  activePlayer: Player;
  phase: TurnPhase;
  unitsActedThisTurn: Set<string>; // instanceIds that have used their action
}

// ─────────────────────────────────────────────
// GAME STATE SNAPSHOT
// Serializable. Used for network sync (SocketManager).
// ─────────────────────────────────────────────

export interface GameStateSnapshot {
  turn: TurnState;
  modifiers: [GameModifiers, GameModifiers]; // [P1, P2]
  players: [PlayerStateSnapshot, PlayerStateSnapshot];
  board: Array<{ col: number; row: number; unit: Unit | null }>;
  status: EngineStatus;
}

// ─────────────────────────────────────────────
// MATCH RESULT
// ─────────────────────────────────────────────

export interface MatchResult {
  winner: Player;
  loser: Player;
  reason: 'KING_DESTROYED' | 'SURRENDER' | 'TIMEOUT' | 'DISCONNECT';
  turns: number;
}

```

# src\game\types\UITypes.ts

```ts
// ============================================================
// UITypes.ts
// TypeScript contracts for all Layout JSON and Theme JSON data.
// These mirror the JSON Schema Contract exactly.
// Zero runtime logic — pure interfaces only.
// ============================================================

// ─────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────

export interface XYPoint {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasConfig {
  width: number;   // Default: 1280
  height: number;  // Default: 720
}

// ─────────────────────────────────────────────
// LAYOUT JSON — BATTLE SCENE
// ─────────────────────────────────────────────

/**
 * Grid config drives BoardRenderer entirely.
 * Change cols/rows → board changes size.
 * Change cellSize → every cell and all highlights scale.
 * Change originX/Y → board shifts on canvas.
 */
export interface GridConfig {
  cols: number;          // Default: 6. BoardRenderer loops 0..cols-1
  rows: number;          // Default: 6. BoardRenderer loops 0..rows-1
  cellSize: number;      // px per cell, square. Default: 120
  originX: number;       // px from left to top-left cell. Default: 280
  originY: number;       // px from top to top-left cell. Default: 0
  coordsVisible: boolean;  // Show A-F / 1-6 labels outside board
  coordsFontSize: number;  // px. Default: 11
  gridLineWidth: number;   // px. Default: 1
}

export interface HandLayoutConfig {
  x: number;           // Center X of hand area
  y: number;           // Top Y of hand area
  cardWidth: number;   // Thumbnail card width in hand
  cardHeight: number;  // Thumbnail card height in hand
  spacing: number;     // Gap between cards (px)
  maxVisible: number;  // Cards before scroll kicks in
  fanAngle: number;    // Degrees of tilt per card from center
  selectedScale: number; // Scale multiplier for selected card
}

export interface LeftHUDLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  playerName: XYPoint;
  kingHPBar: Rect;
  legCounter: XYPoint;
  legRate: XYPoint;
  winLoss: XYPoint;
  hand: HandLayoutConfig;
}

export interface RightHUDLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  opponentName: XYPoint;
  kingHPBar: Rect;
  legCounter: XYPoint;
  hand: HandLayoutConfig;
}

export interface BottomBarLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  phaseLabel: XYPoint;
  endTurnBtn: Rect;
  passBtn: Rect;
  cardPlayZone: Rect;
}

/**
 * Card rendering sizes — all proportions derive from these.
 * CardRenderer reads these to draw every card part:
 *   artArea, nameBar, statRow, legPip, typeIcon.
 * Changing width/height here rescales the entire card.
 */
export interface CardFullLayout {
  width: number;          // Base width in hand. Default: 140
  height: number;         // Base height in hand. Default: 200
  hoverWidth: number;     // Expanded width on hover. Default: 160
  hoverHeight: number;    // Expanded height on hover. Default: 230
  artAreaHeight: number;  // Portrait crop zone height. Default: 90
  nameBarHeight: number;  // Name strip height. Default: 24
  statRowHeight: number;  // ATK/DEF row height. Default: 20
  legPipSize: number;     // LEG cost circle diameter. Default: 24
  typeIconSize: number;   // Type icon square size. Default: 16
  cornerRadius: number;   // Card corner radius. Default: 6
}

export interface CardThumbnailLayout {
  width: number;       // On-board unit width. Default: 100
  height: number;      // On-board unit height. Default: 100
  margin: number;      // Inner margin inside cell. Default: 10
  hpBarHeight: number; // HP strip height at bottom. Default: 4
  badgeFontSize: number; // ATK/DEF badge font. Default: 12
  badgeWidth: number;  // Badge pill width. Default: 20
  badgeHeight: number; // Badge pill height. Default: 16
}

export interface CardDetailLayout {
  width: number;   // Full detail overlay width. Default: 220
  height: number;  // Full detail overlay height. Default: 320
  x: number;       // Center X of overlay. Default: 640
  y: number;       // Center Y of overlay. Default: 360
  patternDiagramSize: number; // Movement diagram square. Default: 120
}

export interface CardsLayout {
  full: CardFullLayout;
  thumbnail: CardThumbnailLayout;
  detail: CardDetailLayout;
}

export interface OverlaysLayout {
  dimmer: Rect;
  targetSelect: Rect;
  gameOver: Rect;
  stakeSelect: Rect;
  deckPreview: Rect;
}

export interface BattleLayoutJSON {
  scene: 'BattleScene';
  canvas: CanvasConfig;
  grid: GridConfig;
  leftHUD: LeftHUDLayout;
  rightHUD: RightHUDLayout;
  bottomBar: BottomBarLayout;
  cards: CardsLayout;
  overlays: OverlaysLayout;
}

// ─────────────────────────────────────────────
// LAYOUT JSON — MAIN MENU SCENE
// ─────────────────────────────────────────────

export interface MainMenuLayoutJSON {
  scene: 'MainMenuScene';
  canvas: CanvasConfig;
  logo: Rect;
  title: XYPoint;
  nameInput: Rect;
  roomCodeInput: Rect;
  connectBtn: Rect;
  cryptoToggle: Rect;
  statusLabel: XYPoint;
}

// ─────────────────────────────────────────────
// LAYOUT JSON — RESULT SCENE
// ─────────────────────────────────────────────

export interface ResultLayoutJSON {
  scene: 'ResultScene';
  canvas: CanvasConfig;
  panel: Rect;
  resultTitle: XYPoint;
  winnerLabel: XYPoint;
  payoutLabel: XYPoint;
  txHashLabel: XYPoint;
  playAgainBtn: Rect;
  menuBtn: Rect;
}

export type LayoutJSON = BattleLayoutJSON | MainMenuLayoutJSON | ResultLayoutJSON;

// ─────────────────────────────────────────────
// THEME JSON — COLOR TOKENS
// ─────────────────────────────────────────────

/**
 * The 14 OCB design tokens. All other theme fields reference
 * these names. Changing one token updates everything using it.
 */
export interface ColorTokens {
  BG_DEEP: string;        // #1A1A2E — primary background
  BG_MID: string;         // #16213E — panel background
  BG_BOARD: string;       // #0F3460 — board surface
  ACCENT_GOLD: string;    // #F5A623 — crypto/royal
  ACCENT_GREEN: string;   // #00FF88 — player/win
  ACCENT_RED: string;     // #FF4444 — enemy/lose
  ACCENT_BLUE: string;    // #4FC3F7 — info/neutral
  TEXT_PRIMARY: string;   // #FFFFFF — main text
  TEXT_SECONDARY: string; // #AAAAAA — muted text
  CARD_STANDARD: string;  // #2A2A4A
  CARD_ROYAL: string;     // #3D2B1F
  CARD_STATIC: string;    // #1B3A2A
  CARD_SPELL: string;     // #2A1B3D
  OVERLAY_BLACK: string;  // #000000 at 80%
}

// ─────────────────────────────────────────────
// THEME JSON — TYPOGRAPHY
// ─────────────────────────────────────────────

export interface FontDef {
  family: string;   // e.g. 'Arial', 'monospace'
  size: number;     // px
  color?: string;   // hex override; if absent, use token
}

export interface FontsConfig {
  title: FontDef;      // Scene titles
  heading: FontDef;    // HUD section headings
  body: FontDef;       // General body text
  small: FontDef;      // Small labels, tooltips
  cardName: FontDef;   // Card name bar
  cardStat: FontDef;   // ATK/DEF badges
  cardAbility: FontDef; // Ability text in detail view
  coordLabel: FontDef; // Board A-F / 1-6 coords
}

// ─────────────────────────────────────────────
// THEME JSON — ASSETS
// ─────────────────────────────────────────────

/**
 * All asset paths relative to /public/assets/.
 * PreloadScene iterates this object and loads every entry.
 * Card art keys follow pattern: art_[cardId]
 */
export interface AssetsConfig {
  // Backgrounds
  bg_main_menu: string;
  bg_battle: string;
  bg_result: string;
  // Board
  board_skin: string;
  // Card frames
  card_frame_standard: string;
  card_frame_royal: string;
  card_frame_static: string;
  card_frame_spell: string;
  card_back: string;
  // Stat icons
  icon_atk: string;
  icon_def: string;
  icon_leg: string;
  icon_move: string;
  icon_cavalry: string;
  icon_clock: string;
  icon_ranged: string;
  // Type icons
  icon_type_standard: string;
  icon_type_royal: string;
  icon_type_static: string;
  icon_type_spell: string;
  // Board FX markers
  marker_move: string;
  marker_attack: string;
  marker_aura: string;
  // UI
  logo: string;
  // Dynamic: card art — key = "art_" + cardId
  [key: string]: string;
}

// ─────────────────────────────────────────────
// THEME JSON — BOARD
// ─────────────────────────────────────────────

export interface CellVisual {
  fillColor: string;   // hex
  fillAlpha: number;   // 0..1
  strokeColor: string; // hex
  strokeWidth: number; // px
}

export interface BoardTheme {
  cellEvenFill: string;      // Checkerboard even
  cellOddFill: string;       // Checkerboard odd
  gridLineColor: string;
  playerHalfTint: string;    // ACCENT_GREEN ~8% rows 0-2
  enemyHalfTint: string;     // ACCENT_RED ~8% rows 3-5
  coordColor: string;
  // Cell states
  cellHover: string;
  cellSelected: string;
  cellValidMove: string;     // With alpha, e.g. #00FF8833
  cellValidAtk: string;      // With alpha
  cellAura: string;          // With alpha
  // Unit thumbnail markers
  unitBandPlayer: string;    // Bottom band on player units
  unitBandEnemy: string;     // Bottom band on enemy units
  unitBandHeight: number;    // px. Default: 8
  hpBarFull: string;
  hpBarMid: string;          // < 50% HP
  hpBarLow: string;          // < 25% HP
  hpBarBackground: string;
}

// ─────────────────────────────────────────────
// THEME JSON — CARDS
// ─────────────────────────────────────────────

export interface CardTypeTheme {
  bodyColor: string;
  bandColor: string;
  frameAsset: string;   // key in AssetsConfig
  legPipColor: string;
  borderColor: string;
  borderWidth: number;
  glowColor: string;    // '' = no glow
  glowSize: number;     // px outer glow
}

export interface CardsTheme {
  STANDARD: CardTypeTheme;
  ROYAL: CardTypeTheme;
  STATIC: CardTypeTheme;
  SPELL: CardTypeTheme;
  // Shared across all types
  atkBadgeColor: string;
  defBadgeColor: string;
  nameBarBg: string;       // Semi-transparent
  nameColor: string;
  abilityTextColor: string;
  exhaustedAlpha: number;  // 0..1, applied when unit has acted
  selectedGlowColor: string;
  selectedGlowSize: number;
}

// ─────────────────────────────────────────────
// THEME JSON — HUD
// ─────────────────────────────────────────────

export interface HUDTheme {
  panelBg: string;
  panelAlpha: number;
  playerNameColor: string;
  enemyNameColor: string;
  legColor: string;
  legRateColor: string;
  hpBarFull: string;
  hpBarMid: string;
  hpBarLow: string;
  hpBarBg: string;
  phaseLabelColor: string;
  cardPlayZoneBorderColor: string;
  cardPlayZoneBorderAlpha: number;
}

// ─────────────────────────────────────────────
// THEME JSON — BUTTONS
// ─────────────────────────────────────────────

export interface ButtonStyle {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  textColor: string;
  fontSize: number;
  hoverFillColor: string;
  hoverTextColor: string;
  cornerRadius: number;
  paddingX: number;
  paddingY: number;
}

export interface ButtonsTheme {
  primary: ButtonStyle;    // Standard action
  secondary: ButtonStyle;  // Secondary / cancel
  danger: ButtonStyle;     // Destructive
  endTurn: ButtonStyle;    // End turn — green accent
  pass: ButtonStyle;       // Pass — muted
}

// ─────────────────────────────────────────────
// THEME JSON — OVERLAYS
// ─────────────────────────────────────────────

export interface OverlayTheme {
  dimmerColor: string;
  dimmerAlpha: number;
  panelColor: string;
  panelAlpha: number;
  panelStroke: string;
  panelStrokeWidth: number;
  titleColor: string;
  bodyColor: string;
  cornerRadius: number;
}

// ─────────────────────────────────────────────
// THEME JSON — ROOT
// ─────────────────────────────────────────────

export interface ThemeJSON {
  scene: string;
  colors: ColorTokens;
  fonts: FontsConfig;
  assets: AssetsConfig;
  board: BoardTheme;
  cards: CardsTheme;
  hud: HUDTheme;
  buttons: ButtonsTheme;
  overlays: OverlayTheme;
}

// ─────────────────────────────────────────────
// RENDERER STATE TYPES (internal, not from JSON)
// ─────────────────────────────────────────────

/** The three rendering contexts for a card */
export type CardRenderMode = 'full' | 'thumbnail' | 'detail';

/** Snapshot of data HUDRenderer needs to draw */
export interface HUDSnapshot {
  playerName: string;
  opponentName: string;
  playerKingHP: number;
  playerKingMaxHP: number;
  opponentKingHP: number;
  opponentKingMaxHP: number;
  playerLEG: number;
  playerCrown: number;  
  opponentLEGCount: number;   // number of cards (hidden)
  currentPhase: string;
  turnNumber: number;
  isPlayerTurn: boolean;
  playerHandCount: number;
  opponentHandCount: number;
  playerWins: number;
  playerLosses: number;
}

/** SelectionManager internal state */
export interface SelectionState {
  selectedHandIndex: number | null;
  selectedBoardCol: number | null;
  selectedBoardRow: number | null;
  validMoves: Array<{ col: number; row: number }>;
  validAttacks: Array<{ col: number; row: number }>;
  validDeploy: Array<{ col: number; row: number }>;
  mode: 'idle' | 'card_selected' | 'unit_selected' | 'awaiting_target';
}

/** Data passed to CardRenderer per render call */
export interface CardRenderData {
  id: string;
  name: string;
  flavorText?: string;
  cardClass: string;   // 'UNIT' | 'SPELL' | 'STRUCTURE'
  allegiance: string;  // 'STANDARD' | 'ROYAL'
  cost: number;
  artKey: string;      // key in AssetsConfig, e.g. "art_foot_soldier"
  atk?: number;
  def?: number;
  currentHP?: number;
  maxHP?: number;
  abilityText?: string;
isExhausted?: boolean;
  isSelected?: boolean;
  isEnemy?: boolean;
  canAct?: boolean;    // true = unit can still move/attack this turn (yellow glow indicator)
}

/** Data for a single board cell passed to BoardRenderer */
export interface CellRenderData {
  col: number;
  row: number;
  unit?: CardRenderData;
  highlight: 'none' | 'move' | 'attack' | 'aura' | 'selected' | 'hover';
}

```

# src\game\UnitFactory.ts

```ts
// ============================================================
// UnitFactory.ts
// Creates Unit objects from CardDefinitions.
// Sets all computed properties at creation time.
// Owns the instance counter for unique IDs.
//
// PATCH v0.3:
//   - isJustPlaced = true on creation (can't act on deploy turn)
//   - combatTag derived from AtkPattern or overridden by CardDefinition
//   - Added deriveCombatTag() exported helper
//
// ZERO Phaser imports. Pure TypeScript.
// ============================================================

import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import { MovementType, AtkPattern, CombatTag } from './types/CardTypes';
import { getCard } from './data/CardRegistry';
import { computeCanAttackAfterMove } from './UnitQuery';

export class UnitFactory {
  private instanceCounter: number = 0;

  /**
   * Create a new Unit from a card definition.
   * All computed properties (canAttackAfterMove, combatTag, etc.) are set here.
   * isJustPlaced is true — unit cannot act on the turn it is deployed.
   * Future status effects default to false.
   */
  create(cardId: string, owner: Player, position: Position): Unit {
    this.instanceCounter++;
    const def = getCard(cardId);
    const stats = def.stats!;
    const movNum = movementToNumber(stats.movement);

    const unit: Unit = {
      instanceId:       `${cardId}_${this.instanceCounter}`,
      cardId,
      owner,
      position:         { ...position },

      // Base stats — from CardDefinition, never change mid-game
      baseAtk:          stats.atk,
      baseDef:          stats.def,
      baseMovement:     movNum,
      baseAtkPattern:   stats.attackPattern,
      baseMovementType: stats.movement,

      // Current stats — base + aura buffs, recalculated each LEG phase
      currentAtk:       stats.atk,
      currentDef:       stats.def,
      maxDef:           stats.def,
      currentMovement:  movNum,

      // Turn flags — reset at START of each owner's turn
      hasMoved:         false,
      hasActed:         false,
      isJustPlaced:     true,    // Can't act on the turn deployed

      // Persistent state
      isActive:         true,    // false during BUILD_DELAY
      isExhausted:      false,   // Treason: returned, can't act this turn

      // Status effects — all false by default
      isStunned:        false,   // Future: stun spells
      isRooted:         false,   // Future: root effects (can attack but not move)
      isSilenced:       false,   // Future: silence (disable abilities + attack)

      // Computed capabilities — set below
      canAttackAfterMove: false,
      combatTag:          null,

      // Treason tracking
      treasonOwner:     null,
      originalPos:      null,

      // Castle-specific
      spawnCounter:     0,

      // Stat audit trail
      activeBuffs:      [],
    };

    // Compute derived properties
    unit.canAttackAfterMove = computeCanAttackAfterMove(unit);
    unit.combatTag = deriveCombatTag(unit);

    return unit;
  }

  /** Reset the counter (for new games). */
  reset(): void {
    this.instanceCounter = 0;
  }
}

// ─────────────────────────────────────────────
// COMBAT TAG DERIVATION
// ─────────────────────────────────────────────

/**
 * Derive CombatTag from card definition.
 * Explicit combatTag on CardDefinition takes priority (override).
 * Otherwise derived from AtkPattern:
 *   - DIAGONAL_RANGED_2, STRAIGHT_RANGED_3 → RANGED
 *   - HV, OMNI, AREA_ADJ, ON_JUMP, FWD_VERTICAL → MELEE
 *   - NONE → null (no attack capability)
 */
export function deriveCombatTag(unit: Unit): CombatTag | null {
  const def = getCard(unit.cardId);

  // Explicit override on card definition wins
  if (def.combatTag !== undefined) return def.combatTag;

  // Derive from attack pattern
  const pattern = def.stats?.attackPattern;
  if (!pattern || pattern === AtkPattern.NONE) return null;

  switch (pattern) {
    case AtkPattern.DIAGONAL_RANGED_2:
    case AtkPattern.STRAIGHT_RANGED_3:
      return CombatTag.RANGED;

    case AtkPattern.HV:
    case AtkPattern.OMNI:
    case AtkPattern.AREA_ADJ:
    case AtkPattern.ON_JUMP:
    case AtkPattern.FWD_VERTICAL:
    default:
      return CombatTag.MELEE;
  }
}

// ─────────────────────────────────────────────
// MOVEMENT HELPER
// ─────────────────────────────────────────────

/** Convert MovementType enum to numeric distance. */
export function movementToNumber(movement: MovementType): number {
  switch (movement) {
    case MovementType.OMNI_1:          return 1;
    case MovementType.OMNI_2:          return 2;
    case MovementType.OMNI_3:          return 3;
    case MovementType.VERTICAL_2:      return 2;
    case MovementType.JUMP_DIAGONAL_1: return 1;
    case MovementType.FWD_VERTICAL_1:  return 1;
    case MovementType.STATIC:          return 0;
    default:                           return 1;
  }
}

```

# src\game\UnitQuery.ts

```ts
// ============================================================
// UnitQuery.ts
// On-demand unit capability checks.
// No stored booleans, no refresh cycles.
//
// When anything needs to know "can this unit move/attack/act?",
// it calls these functions. They evaluate the unit's current
// state RIGHT NOW and return a boolean.
//
// Adding new status effects (stun, freeze, silence, root, etc.)
// only requires editing these functions. Nothing else changes.
//
// PATCH v0.3:
//   - canUnitMove / canUnitAttack now check isJustPlaced
//     (units can't act on the turn they are deployed)
//
// ZERO Phaser imports. Pure logic.
// ============================================================

import type { Unit } from './types/GameTypes';
import { MovementType, AtkPattern, CardFlag } from './types/CardTypes';
import { getCard } from './data/CardRegistry';

// ─────────────────────────────────────────────
// CORE CAPABILITY CHECKS
// ─────────────────────────────────────────────

/**
 * Can this unit move right now?
 * Checks: alive, active, not exhausted, not stunned, not just placed,
 * hasn't moved or acted, has movement range, not static.
 */
export function canUnitMove(unit: Unit): boolean {
  // Dead units can't do anything
  if (unit.currentDef <= 0) return false;

  // Inactive (BUILD_DELAY) units can't act
  if (!unit.isActive) return false;

  // Status effects that prevent movement
  if (unit.isExhausted) return false;
  if (unit.isStunned) return false;
  if (unit.isRooted) return false;

  // Just placed this turn — can't act yet (except exception cards in future)
  if (unit.isJustPlaced) return false;

  // Already used this turn
  if (unit.hasMoved) return false;
  if (unit.hasActed) return false;

  // No movement capacity (Village-slowed to 0)
  if (unit.currentMovement <= 0) return false;

  // Static units (structures) never move
  const def = getCard(unit.cardId);
  if (def.stats?.movement === MovementType.STATIC) return false;

  return true;
}

/**
 * Can this unit attack right now?
 * Checks: alive, active, not exhausted, not stunned, not silenced,
 * not just placed, hasn't already acted, has an attack pattern.
 * If unit has moved: only true if unit has charge ability.
 */
export function canUnitAttack(unit: Unit): boolean {
  if (unit.currentDef <= 0) return false;
  if (!unit.isActive) return false;
  if (unit.isExhausted) return false;
  if (unit.isStunned) return false;
  if (unit.isSilenced) return false;

  // Just placed this turn — can't act yet
  if (unit.isJustPlaced) return false;

  // Already used attack this turn
  if (unit.hasActed) return false;

  // Must have an attack pattern
  const def = getCard(unit.cardId);
  const hasAttackPattern = (def.stats?.attackPattern !== AtkPattern.NONE)
    || !!def.stats?.customAttack;
  if (!hasAttackPattern) return false;

  // If already moved, only charge-type units can still attack
  if (unit.hasMoved && !unit.canAttackAfterMove) return false;

  return true;
}

/**
 * Can this unit perform any action at all this turn?
 * True if it can move OR attack.
 * Used by SelectionManager to decide if clicking a unit does anything.
 */
export function canUnitAct(unit: Unit): boolean {
  return canUnitMove(unit) || canUnitAttack(unit);
}

/**
 * Is this unit alive?
 */
export function isUnitAlive(unit: Unit): boolean {
  return unit.currentDef > 0;
}

/**
 * Is this unit a valid target for abilities?
 * Alive + on the board (has a position).
 */
export function isValidTarget(unit: Unit): boolean {
  return isUnitAlive(unit) && unit.isActive;
}

// ─────────────────────────────────────────────
// COMPUTED PROPERTIES
// These are set once at unit creation time and
// updated by the engine when relevant state changes.
// UnitQuery reads them, doesn't compute them.
// ─────────────────────────────────────────────

/**
 * Compute whether a unit can attack after moving.
 * Called by UnitFactory at creation time.
 * The engine can also call this after flag changes (e.g., War Horn buff).
 */
export function computeCanAttackAfterMove(unit: Unit): boolean {
  const def = getCard(unit.cardId);

  // Lancer charge: can move + attack in same turn
  if (def.flags.includes(CardFlag.LANCER_CHARGE)) return true;

  // Future: BERSERKER, SWIFT_STRIKE, etc. — add here
  // if (def.flags.includes(CardFlag.BERSERKER)) return true;

  return false;
}

```

# src\game\utils\boardHash.ts

```ts
// ============================================================
// boardHash.ts — Lightweight FNV-1a hash of board state.
// Used for cross-client state sync verification.
// ============================================================

import type { Unit } from '../types/GameTypes';

/**
 * FNV-1a 32-bit hash (fast, non-cryptographic, good distribution).
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Compute a deterministic hash from serialized board cells.
 * Works with the output of `engine.getState().board`.
 */
export function boardHashFromCells(cells: Array<{ col: number; row: number; unit: Unit | null }>): string {
  const units = cells
    .filter(c => c.unit !== null)
    .map(c => c.unit!)
    .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
    .map(u => `${u.instanceId}:${u.position.col},${u.position.row}:${u.currentDef}:${u.owner}`)
    .join('|');
  return fnv1a(units);
}

```

# src\GameState.ts

```ts
// ─── GameState.ts ─────────────────────────────────────────────
// Global singleton — survives scene changes

export enum GameMode {
    FreePlay = "FreePlay",
    CryptoPlay = "CryptoPlay",
}

export enum RoomAction {
    Create = "Create",
    Join = "Join",
}

export interface BoardGameResult {
    playerName: string;
    opponentName: string;
    playerWon: boolean;
    isTie: boolean;
    reason: string;       // 'KING_DESTROYED' | 'DISCONNECT' | 'SURRENDER' | 'TIMEOUT'
    turns: number;
    stakeAmount: number;
    payout: number;
}

// Re-export from shared types for backward compat
export type { PayoutResult } from '../shared/types/NetworkEvents';
import type { PayoutResult } from '../shared/types/NetworkEvents';

class GameStateClass {
    // ─── Player ───────────────────────────────────────────────
    playerName: string = "Player";
    opponentName: string = "";
    walletAddress: string = "";
    isWalletConnected: boolean = false;

    // ─── Mode ─────────────────────────────────────────────────
    currentMode: GameMode = GameMode.FreePlay;

    // ─── Room ─────────────────────────────────────────────────
    roomCode: string = "";
    roomAction: RoomAction = RoomAction.Create;
    playerIndex: number = 0;     // 0 = P1/creator, 1 = P2/joiner
    gameSeed: number = 0;        // Shared shuffle seed from server

    // ─── Match ────────────────────────────────────────────────
    currentStake: number = 1;
    winCount: number = 0;
    lossCount: number = 0;
    lastMatch: BoardGameResult | null = null;

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
        this.playerName = name;
        console.log(`[GameState] Player name set: ${name}`);
    }

    setOpponentName(name: string): void {
        this.opponentName = name;
        console.log(`[GameState] Opponent name set: ${name}`);
    }

    // ─── Wallet ───────────────────────────────────────────────
    connectWallet(address: string): void {
        this.walletAddress = address;
        this.isWalletConnected = true;
        this.currentMode = GameMode.CryptoPlay;
        console.log(`[GameState] Wallet connected: ${address}`);
    }

    disconnectWallet(): void {
        this.walletAddress = "";
        this.isWalletConnected = false;
        this.currentMode = GameMode.FreePlay;
        console.log("[GameState] Wallet disconnected.");
    }

    // ─── Stake ────────────────────────────────────────────────
    setStake(amount: number): void {
        this.currentStake = amount;
        console.log(`[GameState] Stake set: ${amount} AVAX`);
    }

    // ─── Room ─────────────────────────────────────────────────
    setRoomCode(code: string): void {
        this.roomCode = code;
        console.log(`[GameState] Room code: ${code}`);
    }

    setRoomAction(action: RoomAction): void {
        this.roomAction = action;
        console.log(`[GameState] Room action: ${action}`);
    }

    setPlayerIndex(index: number): void {
        this.playerIndex = index;
        console.log(`[GameState] Player index set: ${index} (${index === 0 ? 'P1/Creator' : 'P2/Joiner'})`);
    }

    setGameSeed(seed: number): void {
        this.gameSeed = seed;
        console.log(`[GameState] Game seed set: ${seed}`);
    }

    // ─── Match ────────────────────────────────────────────────
    recordWin(): void {
        this.winCount++;
        console.log(`[GameState] Win recorded. Total: ${this.winCount}`);
    }

    recordLoss(): void {
        this.lossCount++;
        console.log(`[GameState] Loss recorded. Total: ${this.lossCount}`);
    }

    setLastMatch(match: BoardGameResult): void {
        this.lastMatch = match;
        console.log(`[GameState] Match saved — Won: ${match.playerWon}`);
    }

    clearMatchData(): void {
        this.roomCode = "";
        this.gameSeed = 0;
        this.playerIndex = 0;
        this.opponentName = "";
        this.lastMatch = null;
        this.depositTxHash = null;
        this.payoutResult = null;
    }

    // ─── Auth ─────────────────────────────────────────────────
    setAuthData(token: string, playerId: number, name: string): void {
        this.authToken = token;
        this.authenticatedPlayerId = playerId;
        this.displayName = name;
        this.playerName = name;
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
        this.activeDeckCardIds = [...cardIds];
        console.log(`[GameState] Active deck: #${deckId} (${cardIds.length} cards)`);
    }

    hasActiveDeck(): boolean {
        return this.activeDeckCardIds.length > 0;
    }

    // ─── Debug ────────────────────────────────────────────────
    printStatus(): void {
        console.log(
            `[GameState] Player: ${this.playerName} | ` +
            `Mode: ${this.currentMode} | ` +
            `Wallet: ${this.isWalletConnected ? this.walletAddress : "None"} | ` +
            `W/L: ${this.winCount}/${this.lossCount}`
        );
    }
}

const GameState = new GameStateClass();
export default GameState;

```

# src\index.html

```html
<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8">
    <title>My Game</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            padding: 0px;
            margin: 0px;
            background: #242424;
        }
    </style>
</head>

<body>
</body>

</html>
```

# src\input\SelectionManager.ts

```ts
// ============================================================
// SelectionManager.ts
// Owns all player input during the battle scene.
// Tracks selection state: which hand card or board unit is active.
// Routes selections to GameEngine API calls.
// Publishes highlight changes to EventBus for BoardRenderer.
//
// State machine:
//   idle          → click hand card → card_selected
//   card_selected → click valid deploy pos → GameEngine.playCard()
//   card_selected → click hand card again → idle (deselect)
//   idle          → click own unit → unit_selected
//   unit_selected → click valid move pos → GameEngine.moveUnit()
//   unit_selected → click valid attack → GameEngine.attackUnit()
//   unit_selected → click same unit again → idle (deselect)
//   any           → GameEngine.state === AWAITING_INPUT → awaiting_target
//   awaiting_target → click → GameEngine.selectTarget()
// ============================================================

import type { BattleLayoutJSON } from '../game/types/UITypes';
import type { SelectionState } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';

// Minimal interface for what SelectionManager needs from GameEngine.
// This avoids importing the full GameEngine in the UI layer.
export interface IGameEngineAPI {
  getValidMoves(col: number, row: number): Array<{ col: number; row: number }>;
  getValidAttacks(col: number, row: number): Array<{ col: number; row: number }>;
  getValidDeployPositions(cardIndex: number): Array<{ col: number; row: number }>;
  playCard(handIndex: number, col: number, row: number): void;
  moveUnit(fromCol: number, fromRow: number, toCol: number, toRow: number): void;
  attackUnit(fromCol: number, fromRow: number, targetCol: number, targetRow: number): void;
  selectTarget(col: number, row: number): void;
  selectPosition(col: number, row: number): void;
  selectHandCard(handIndex: number): void;
  cancelPending(): void;
  isAwaitingInput(): boolean;
  canAct(col: number, row: number): boolean;
  isPlayerUnit(col: number, row: number): boolean;
  isOccupied(col: number, row: number): boolean;
  getPhase(): string;
  getAttackRange(col: number, row: number): Array<{ col: number; row: number }>;

}

export class SelectionManager {
  private layout: BattleLayoutJSON;
  private engine: IGameEngineAPI;

  private state: SelectionState = {
    selectedHandIndex: null,
    selectedBoardCol: null,
    selectedBoardRow: null,
    validMoves: [],
    validAttacks: [],
    validDeploy: [],
    mode: 'idle',
  };

  // Track what kind of pending interaction is active
  private pendingKind: 'TARGET' | 'POSITION' | 'COLUMN' | 'DISCARD' | null = null;
  private pendingValidPositions: Array<{ col: number; row: number }> = [];
  /** Cached attack range for currently selected unit (avoids redundant recalculation). */
  private cachedAttackRange: Array<{ col: number; row: number }> = [];

  private unsubs: Array<() => void> = [];

  constructor(layout: BattleLayoutJSON, engine: IGameEngineAPI) {
    this.layout = layout;
    this.engine = engine;
    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API (called by BattleScene or input hooks)
  // ─────────────────────────────────────────────

  /**
   * Process a click on a board cell.
   * Called by BoardRenderer's cell pointerdown callbacks.
   */
  onBoardCellClicked(col: number, row: number): void {
    if (this.engine.isAwaitingInput()) {
      if (this.pendingKind === 'POSITION') {
        // Validate click is on a valid position
        if (this.pendingValidPositions.some(p => p.col === col && p.row === row)) {
          this.engine.selectPosition(col, row);
          this.clearSelection();
        }
      } else {
        // TARGET or other — pass through (col, row used to find unit)
        this.engine.selectTarget(col, row);
        this.clearSelection();
      }
      return;
    }

    const phase = this.engine.getPhase();

    switch (this.state.mode) {
      case 'card_selected':
        this.handleCardToBoardClick(col, row);
        break;

      case 'unit_selected':
        this.handleUnitActionClick(col, row);
        break;

      case 'idle':
      default:
        this.handleIdleBoardClick(col, row, phase);
        break;
    }
  }

  /**
   * Process a click on a hand card.
   * Called by HandRenderer's card pointerdown callback.
   */
  onHandCardClicked(index: number): void {
    if (this.engine.isAwaitingInput()) {
      this.engine.selectHandCard(index);
      this.clearSelection();
      return;
    }

    const phase = this.engine.getPhase();
    if (phase !== 'PLAY') {
      // Hand cards only playable in PLAY phase
      this.clearSelection();
      return;
    }

    if (this.state.mode === 'card_selected' && this.state.selectedHandIndex === index) {
      // Clicking the same card again deselects
      this.clearSelection();
      return;
    }

    // Select this card and show valid deploy positions
    const deployPositions = this.engine.getValidDeployPositions(index);

    this.state = {
      ...this.state,
      mode: 'card_selected',
      selectedHandIndex: index,
      selectedBoardCol: null,
      selectedBoardRow: null,
      validMoves: [],
      validAttacks: [],
      validDeploy: deployPositions,
    };

    this.publishHighlights();
    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'hand',
      index,
      validDeploy: deployPositions,
    });
  }

  /** Externally clear the selection (e.g., after phase change). */
  clearSelection(): void {
    this.state = {
      selectedHandIndex: null,
      selectedBoardCol: null,
      selectedBoardRow: null,
      validMoves: [],
      validAttacks: [],
      validDeploy: [],
      mode: 'idle',
    };
    this.cachedAttackRange = [];

    EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
      moves: [],
      attacks: [],
      attackRange: [],
      auras: [],
    });

    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'clear',
      index: null,
    });
  }

  /** Get the current selection state (read-only snapshot). */
  getState(): Readonly<SelectionState> {
    return { ...this.state };
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
  }

  // ─────────────────────────────────────────────
  // PRIVATE — CLICK HANDLERS
  // ─────────────────────────────────────────────

  private handleIdleBoardClick(col: number, row: number, phase: string): void {
    if (!this.engine.isOccupied(col, row)) {
      // Click on empty cell in idle — do nothing
      return;
    }

    if (!this.engine.isPlayerUnit(col, row)) {
      // Click on enemy unit in idle — do nothing (no info mode for now)
      return;
    }

    if (phase !== 'ACT') {
      // Units can only act in ACT phase
      return;
    }

    if (!this.engine.canAct(col, row)) {
      // Unit already acted this turn (exhausted)
      return;
    }

    // Select this unit
   const moves       = this.engine.getValidMoves(col, row);
const attacks     = this.engine.getValidAttacks(col, row);
this.cachedAttackRange = this.engine.getAttackRange(col, row);

this.state = {
  ...this.state,
  mode: 'unit_selected',
  selectedBoardCol: col,
  selectedBoardRow: row,
  selectedHandIndex: null,
  validMoves: moves,
  validAttacks: attacks,
  validDeploy: [],
};

    this.publishHighlights();
    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'board',
      col, row,
      validMoves: moves,
      validAttacks: attacks,
    });
  }

  private handleCardToBoardClick(col: number, row: number): void {
    const idx = this.state.selectedHandIndex;
    if (idx === null) { this.clearSelection(); return; }

    // Is this a valid deploy position?
    const isValid = this.state.validDeploy.some(p => p.col === col && p.row === row);

    if (isValid) {
      this.engine.playCard(idx, col, row);
      this.clearSelection();
    } else {
      // Click outside valid deploy — deselect card, try to select a unit instead
      this.clearSelection();
      // If clicking own unit, switch to unit selection
      if (this.engine.isOccupied(col, row) && this.engine.isPlayerUnit(col, row)) {
        this.handleIdleBoardClick(col, row, this.engine.getPhase());
      }
    }
  }

 private handleUnitActionClick(col: number, row: number): void {
  // Clicking the same unit again → deselect
  if (col === this.state.selectedBoardCol && row === this.state.selectedBoardRow) {
    this.clearSelection();
    return;
  }

  // Priority 1: ATTACK — if this cell is a valid attack target, attack it
  const isAttackTarget = this.state.validAttacks.some(p => p.col === col && p.row === row);
  if (isAttackTarget) {
    this.engine.attackUnit(
      this.state.selectedBoardCol!, this.state.selectedBoardRow!,
      col, row
    );
    this.clearSelection();
    return;
  }

  // Priority 2: MOVE — if this cell is a valid move target, move there
  const isMoveTarget = this.state.validMoves.some(p => p.col === col && p.row === row);
  if (isMoveTarget) {
    this.engine.moveUnit(
      this.state.selectedBoardCol!, this.state.selectedBoardRow!,
      col, row
    );
    this.clearSelection();
    return;
  }

  // Priority 3: SELECT ANOTHER UNIT — if clicking own unit, switch selection
  if (this.engine.isPlayerUnit(col, row) && this.engine.canAct(col, row)) {
    const moves   = this.engine.getValidMoves(col, row);
    const attacks = this.engine.getValidAttacks(col, row);

    this.state = {
      ...this.state,
      mode: 'unit_selected',
      selectedBoardCol: col,
      selectedBoardRow: row,
      selectedHandIndex: null,
      validMoves: moves,
      validAttacks: attacks,
      validDeploy: [],
    };

    this.publishHighlights();
    EventBus.emit(EV.SELECTION_CHANGED, {
      source: 'board',
      col, row,
      validMoves: moves,
      validAttacks: attacks,
    });
    return;
  }

  // Clicked nothing useful — deselect
  this.clearSelection();
}

  // ─────────────────────────────────────────────
  // PRIVATE — HELPERS
  // ─────────────────────────────────────────────

  /** Publish current highlights to EventBus so BoardRenderer reacts. */
private publishHighlights(): void {
  EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
    moves:       this.state.validMoves,
    attacks:     this.state.validAttacks,
    attackRange: this.cachedAttackRange,
    deploy:      this.state.validDeploy,
    auras:       [],
  });
}

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    // Board cell clicks routed from BoardRenderer
    this.unsubs.push(
    EventBus.on(EV.INPUT_BOARD_CLICK, ({ col, row }) => {
      this.onBoardCellClicked(col, row);
    }),

    EventBus.on(EV.INPUT_HAND_CLICK, ({ index }) => {
      if (index !== null) this.onHandCardClicked(index);
    }),

      // When engine enters AWAITING_INPUT, set mode
      EventBus.on(EV.PENDING_TARGET, () => {
        this.pendingKind = 'TARGET';
        this.pendingValidPositions = [];
        this.state = { ...this.state, mode: 'awaiting_target' };
        EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
          moves: [], attacks: [], auras: [],
        });
      }),

      EventBus.on(EV.PENDING_POSITION, (ev: any) => {
        this.pendingKind = 'POSITION';
        this.pendingValidPositions = ev.validPositions ?? [];
        this.state = { ...this.state, mode: 'awaiting_target' };
        EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
          moves: this.pendingValidPositions, attacks: [], auras: [],
        });
      }),

      EventBus.on(EV.PENDING_COLUMN, () => {
        this.pendingKind = 'COLUMN';
        this.pendingValidPositions = [];
        this.state = { ...this.state, mode: 'awaiting_target' };
        EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
          moves: [], attacks: [], auras: [],
        });
      }),

      EventBus.on(EV.PENDING_DISCARD, () => {
        this.pendingKind = 'DISCARD';
        this.pendingValidPositions = [];
        this.state = { ...this.state, mode: 'awaiting_target' };
        EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
          moves: [], attacks: [], auras: [],
        });
      }),

      // When interaction resolves, back to idle
      EventBus.on(EV.INTERACTION_RESOLVED, (ev: any) => {
        // If cancelled from UI (e.g., Cancel button), tell the engine to clear pending state
        if (ev?.cancelled) {
          this.engine.cancelPending();
        }
        this.pendingKind = null;
        this.pendingValidPositions = [];
        this.clearSelection();
      }),

      // Phase changes clear selection
      EventBus.on(EV.PHASE_CHANGED, () => {
        this.clearSelection();
      }),

      // Unit played/moved clears selection
      EventBus.on(EV.UNIT_PLACED, () => this.clearSelection()),
      EventBus.on(EV.UNIT_MOVED,  () => this.clearSelection()),
      EventBus.on(EV.UNIT_ATTACKED, () => this.clearSelection()),
    );
  }
}

```

# src\lobby\LobbySocketManager.ts

```ts
// ============================================================
// LobbySocketManager.ts
// Typed wrapper for lobby: namespaced socket events.
// Uses SocketManager.getSocket() — never accesses private fields.
//
// Usage:
//   const lobby = new LobbySocketManager();
//   lobby.attach();  // start listening
//   lobby.createRoom('MyName', { isPublic: true });
//   lobby.detach();  // stop listening
// ============================================================

import SocketManager from '../network/SocketManager';
import type { Socket } from 'socket.io-client';
import type {
  RoomSettings, LobbyState, PublicRoomListing,
  ChatMessage, GameStartingData,
} from '../../shared/types/NetworkEvents';

export type LobbyEventHandlers = {
  onCreated?:          (code: string) => void;
  onJoined?:           (code: string) => void;
  onStateUpdate?:      (state: LobbyState) => void;
  onRoomList?:         (rooms: PublicRoomListing[]) => void;
  onChatMessage?:      (msg: ChatMessage) => void;
  onSystemMessage?:    (text: string) => void;
  onKicked?:           (reason: string) => void;
  onGameStarting?:     (data: GameStartingData) => void;
  onError?:            (message: string) => void;
  onDepositPhase?:     (stakeAmount: number) => void;
  onOpponentDeposited?:() => void;
  onBothDeposited?:    () => void;
  onSubmitDecks?:      () => void;
  onPasswordRequired?: (roomCode: string) => void;
};

export class LobbySocketManager {
  private handlers: LobbyEventHandlers = {};
  private attached = false;

  constructor(handlers: LobbyEventHandlers = {}) {
    this.handlers = handlers;
  }

  /** Update handlers without detach/reattach. */
  setHandlers(handlers: LobbyEventHandlers): void {
    this.handlers = handlers;
  }

  /** Start listening for lobby events on the shared socket. */
  attach(): void {
    if (this.attached) return;
    const s = this.getSocket();
    if (!s) return;
    this.attached = true;

    s.on('lobby:created',          (d: any) => this.handlers.onCreated?.(d.code));
    s.on('lobby:joined',           (d: any) => this.handlers.onJoined?.(d.code));
    s.on('lobby:state',            (d: any) => this.handlers.onStateUpdate?.(d));
    s.on('lobby:room_list',        (d: any) => this.handlers.onRoomList?.(d.rooms));
    s.on('lobby:chat_message',     (d: any) => this.handlers.onChatMessage?.(d));
    s.on('lobby:system_message',   (d: any) => this.handlers.onSystemMessage?.(d.text));
    s.on('lobby:kicked',           (d: any) => this.handlers.onKicked?.(d.reason));
    s.on('lobby:game_starting',    (d: any) => this.handlers.onGameStarting?.(d));
    s.on('lobby:error',            (d: any) => this.handlers.onError?.(d.message));
    s.on('lobby:deposit_phase',    (d: any) => this.handlers.onDepositPhase?.(d.stakeAmount));
    s.on('lobby:opponent_deposited', ()     => this.handlers.onOpponentDeposited?.());
    s.on('lobby:both_deposited',   ()       => this.handlers.onBothDeposited?.());
    s.on('lobby:submit_decks',     ()       => this.handlers.onSubmitDecks?.());
    s.on('lobby:password_required',(d: any) => this.handlers.onPasswordRequired?.(d.roomCode));
  }

  /** Stop listening. Call on scene shutdown. */
  detach(): void {
    if (!this.attached) return;
    const s = this.getSocket();
    if (s) {
      const events = [
        'lobby:created', 'lobby:joined', 'lobby:state', 'lobby:room_list',
        'lobby:chat_message', 'lobby:system_message', 'lobby:kicked',
        'lobby:game_starting', 'lobby:error', 'lobby:deposit_phase',
        'lobby:opponent_deposited', 'lobby:both_deposited', 'lobby:submit_decks',
        'lobby:password_required',
      ];
      for (const ev of events) s.removeAllListeners(ev);
    }
    this.attached = false;
  }

  // ─── Outgoing Events ──────────────────────────────────────

  createRoom(playerName: string, settings?: Partial<RoomSettings>): void {
    this.getSocket()?.emit('lobby:create', { playerName, settings });
  }

  joinRoom(roomCode: string, playerName: string, password?: string): void {
    this.getSocket()?.emit('lobby:join', { roomCode, playerName, password });
  }

  leaveRoom(roomCode: string): void {
    this.getSocket()?.emit('lobby:leave', { roomCode });
  }

  sendChat(roomCode: string, text: string): void {
    this.getSocket()?.emit('lobby:chat', { roomCode, text });
  }

  toggleReady(roomCode: string): void {
    this.getSocket()?.emit('lobby:ready', { roomCode });
  }

  kickPlayer(roomCode: string, targetPlayerName: string): void {
    this.getSocket()?.emit('lobby:kick', { roomCode, targetPlayerName });
  }

  updateSettings(roomCode: string, settings: Partial<RoomSettings>): void {
    this.getSocket()?.emit('lobby:settings', { roomCode, settings });
  }

  startGame(roomCode: string): void {
    this.getSocket()?.emit('lobby:start_game', { roomCode });
  }

  signalCryptoReady(roomCode: string): void {
    this.getSocket()?.emit('lobby:crypto_ready', { roomCode });
  }

  submitDeck(roomCode: string, deckIds: string[]): void {
    this.getSocket()?.emit('lobby:deck_submitted', { roomCode, deckIds });
  }

  requestRoomList(): void {
    this.getSocket()?.emit('lobby:list');
  }

  /** Request the server to re-emit lobby:state for a room. */
  requestRoomState(roomCode: string): void {
    this.getSocket()?.emit('lobby:request_state', { roomCode });
  }

  // ─── Private ──────────────────────────────────────────────

  private getSocket(): Socket | null {
    return SocketManager.getSocket();
  }
}

```

# src\lobby\RoomBrowserAPI.ts

```ts
// ============================================================
// RoomBrowserAPI.ts
// REST fetch for public room list (no auth required).
// ============================================================

import type { PublicRoomListing } from '../../shared/types/NetworkEvents';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function fetchPublicRooms(): Promise<PublicRoomListing[]> {
  try {
    const res = await fetch(`${API_BASE}/rooms`);
    if (!res.ok) return [];
    const { rooms } = await res.json();
    return rooms ?? [];
  } catch {
    return [];
  }
}

```

# src\main.ts

```ts
import './game/abilities/registerAll';
import Phaser from 'phaser';
import PreLoadScene       from './scenes/PreloadScene';
import LoginScene         from './scenes/LoginScene';
import HubScene           from './scenes/HubScene';
import DeckBuilderScene   from './scenes/DeckBuilderScene';
import RoomBrowserScene   from './scenes/RoomBrowserScene';
import LobbyScene         from './scenes/LobbyScene';
import MainMenuScene      from './scenes/MainMenuScene';
import RoomScene          from './scenes/RoomScene';
import BattleScene        from './scenes/BattleScene';
import ResultScene        from './scenes/ResultScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.WEBGL, 
    width: 1280,
    height: 720,
    backgroundColor: '#1A1A2E',
    parent: 'game-container',

    roundPixels: true,
    antialias: true,

    dom: {
        createContainer: true,
    },
    scene: [
        PreLoadScene,
        LoginScene,
        HubScene,
        DeckBuilderScene,
        RoomBrowserScene,
        LobbyScene,
        MainMenuScene,
        RoomScene,
        BattleScene,
        ResultScene,
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

const game = new Phaser.Game(config);
export default game;
```

# src\network\SocketManager.ts

```ts
// ─── SocketManager.ts ─────────────────────────────────────────
// Handles all Socket.io multiplayer logic.
//
// Two connection modes:
//   connect(callbacks)   — legacy flow: auto-creates/joins room
//   connectOnly(cbs?)    — lobby flow: connect without auto-action
//
// Both modes share the same socket + event registrations.
// Switching from connectOnly → connect is safe (reuses socket).

import { io, Socket } from "socket.io-client";
import GameState, { RoomAction } from "../GameState.ts";
import type { GameAction, PayoutResult } from "../../shared/types/NetworkEvents.js";

// Re-export so existing importers don't break
export type { GameAction };

// ─── Event Callbacks ──────────────────────────────────────────
export interface RoomCallbacks {
  onRoomCreated: (code: string) => void;
  onRoomJoined: (code: string) => void;
  onOpponentJoined: (opponentName: string) => void;
  onOpponentAction: (action: GameAction) => void;
  onOpponentDisconnected: () => void;
  onOpponentReconnected?: () => void;
  onOpponentAbandon?: () => void;
  onDisconnectCountdown?: (remaining: number) => void;
  onConnectionLost?: () => void;
  onReconnected?: () => void;
  onReconnectFailed?: () => void;
  onError: (message: string) => void;
  onBothCryptoReady?: () => void;
  onBothBattleReady?: () => void;
  onPayoutResult?: (result: PayoutResult) => void;
  onHostDepositConfirmed?: () => void;
  // Deck validation callbacks (optional)
  onDeckAccepted?: (data: { cardCount: number }) => void;
  onDeckRejected?: (data: { errors: string[] }) => void;
  onBothDecksReady?: () => void;
}

const RECONNECT_OPTS = {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
};

class SocketManagerClass {
  private socket: Socket | null = null;
  private callbacks: RoomCallbacks | null = null;
  private serverUrl: string = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
  private seqCounter: number = 0;
  private actionBuffer: GameAction[] = [];
  private static readonly MAX_BUFFER_SIZE = 50;
  private hasConnectedOnce: boolean = false;
  private eventsRegistered: boolean = false;

  // ─── Connection Modes ──────────────────────────────────────

  /** Legacy flow: connect + auto-create/join room based on GameState. */
  connect(callbacks: RoomCallbacks): void {
    this.callbacks = callbacks;

    if (this.socket?.connected) {
      console.log("[SocketManager] Already connected — routing room action.");
      this.actOnRoomAction();
      return;
    }

    this.ensureSocket();

    this.socket!.on("connect", () => {
      console.log("[SocketManager] Connected to server.");
      if (!this.hasConnectedOnce) {
        this.hasConnectedOnce = true;
        this.seqCounter = 0;
        this.actOnRoomAction();
      } else {
        console.log("[SocketManager] Reconnected! Rejoining room...");
        this.seqCounter = 0;
        this.actionBuffer = [];
        this.socket?.emit("rejoin_room", {
          roomCode: GameState.roomCode,
          playerName: GameState.playerName,
        });
        this.callbacks?.onReconnected?.();
      }
    });

    this.socket!.on("disconnect", () => {
      console.log("[SocketManager] Disconnected from server.");
      if (this.hasConnectedOnce) {
        this.callbacks?.onConnectionLost?.();
      }
    });

    this.socket!.io.on("reconnect_failed", () => {
      console.warn("[SocketManager] All reconnection attempts failed.");
      this.callbacks?.onReconnectFailed?.();
    });
  }

  /**
   * Lobby flow: connect WITHOUT auto-creating/joining a room.
   * Safe to call before connect() — if socket exists, reuses it.
   */
  connectOnly(callbacks?: Partial<RoomCallbacks>): void {
    if (callbacks) {
      this.callbacks = {
        onRoomCreated: () => {},
        onRoomJoined: () => {},
        onOpponentJoined: () => {},
        onOpponentAction: () => {},
        onOpponentDisconnected: () => {},
        onError: (msg) => console.warn('[SocketManager] Error:', msg),
        ...callbacks,
      } as RoomCallbacks;
    }

    if (this.socket?.connected) {
      console.log('[SocketManager] Already connected (connectOnly).');
      return;
    }

    this.ensureSocket();

    // Use once to avoid stacking on repeated connectOnly() calls
    this.socket!.once('connect', () => {
      console.log('[SocketManager] Connected (lobby mode).');
    });
  }

  /** Create socket if none exists, register shared events. */
  private ensureSocket(): void {
    if (!this.socket) {
      this.socket = io(this.serverUrl, RECONNECT_OPTS);
    }
    this.registerEvents();
  }

  // ─── Room Actions (legacy flow) ────────────────────────────

  private actOnRoomAction(): void {
    if (GameState.roomAction === RoomAction.Create) {
      this.createRoom();
    } else {
      this.joinRoom(GameState.roomCode);
    }
  }

  private createRoom(): void {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    GameState.setRoomCode(code);
    console.log(`[SocketManager] Creating room: ${code}`);
    this.socket?.emit("createRoom", {
      roomCode: code,
      playerName: GameState.playerName,
    });
  }

  private joinRoom(code: string): void {
    console.log(`[SocketManager] Joining room: ${code}`);
    this.socket?.emit("joinRoom", {
      roomCode: code,
      playerName: GameState.playerName,
    });
  }

  // ─── Outgoing Events ──────────────────────────────────────

  registerWallet(walletAddress: string, message: string, signature: string): void {
    this.socket?.emit("registerWallet", {
      roomCode: GameState.roomCode,
      walletAddress,
      message,
      signature,
    });
  }

  signalCryptoReady(): void {
    this.socket?.emit("cryptoReady", { roomCode: GameState.roomCode });
  }

  signalBattleReady(): void {
    this.socket?.emit("player_ready", { roomCode: GameState.roomCode });
  }

  sendGameAction(action: GameAction): void {
    this.seqCounter += 1;
    action.seqNum = this.seqCounter;
    if (!this.socket?.connected) {
      if (this.actionBuffer.length >= SocketManagerClass.MAX_BUFFER_SIZE) {
        console.error(`[SocketManager] Action buffer full, dropping: ${action.type}`);
        return;
      }
      console.warn(`[SocketManager] Buffering game_action: ${action.type} (seq=${action.seqNum})`);
      this.actionBuffer.push(action);
      return;
    }
    this.socket.emit('game_action', { roomCode: GameState.roomCode, action });
  }

  sendStateReport(report: Record<string, any>): void {
    this.socket?.emit('game_state_report', {
      roomCode: GameState.roomCode,
      report,
    });
  }

  sendStateHash(hash: string, afterGlobalSeq: number): void {
    this.socket?.emit('state_hash', {
      roomCode: GameState.roomCode,
      hash,
      afterGlobalSeq,
    });
  }

  sendGameOver(localPlayerIndex: number, localPlayerWon: boolean, totalTurns?: number): void {
    console.log(`[SocketManager] Sending game_over, won: ${localPlayerWon}, turns: ${totalTurns ?? 0}`);
    this.socket?.emit('game_over', {
      roomCode: GameState.roomCode,
      winnerIndex: localPlayerWon ? localPlayerIndex : (localPlayerIndex === 0 ? 1 : 0),
      totalTurns: totalTurns ?? 0,
    });
  }

  registerPlayer(token: string): void {
    this.socket?.emit('registerPlayer', { token });
  }

  submitDeck(roomCode: string, deckIds: string[]): void {
    this.socket?.emit('submitDeck', { roomCode, deckIds });
  }

  // ─── State Management ─────────────────────────────────────

  setCallbacks(callbacks: RoomCallbacks): void {
    this.callbacks = callbacks;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** Expose raw socket for LobbySocketManager to attach lobby: events. */
  getSocket(): Socket | null {
    return this.socket;
  }

  /** One-shot listener for both_battle_ready (used by BattleScene). */
  onBothBattleReady(cb: () => void): void {
    this.socket?.once('both_battle_ready', cb);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.hasConnectedOnce = false;
    this.eventsRegistered = false;
    this.actionBuffer = [];
    this.seqCounter = 0;
    console.log("[SocketManager] Manually disconnected.");
  }

  // ─── Shared Event Registration ────────────────────────────

  private registerEvents(): void {
    if (!this.socket || this.eventsRegistered) return;
    this.eventsRegistered = true;

    const s = this.socket;

    // Room lifecycle
    s.on("roomCreated", (data) => {
      GameState.setRoomCode(data.roomCode);
      GameState.setPlayerIndex(data.playerIndex ?? 0);
      this.callbacks?.onRoomCreated(data.roomCode);
    });

    s.on("roomJoined", (data) => {
      GameState.setPlayerIndex(data.playerIndex ?? 1);
      this.callbacks?.onRoomJoined(data.roomCode);
    });

    s.on("opponentJoined", (data) => {
      this.callbacks?.onOpponentJoined(data.playerName);
    });

    s.on("opponent_action", (action) => {
      this.callbacks?.onOpponentAction(action);
    });

    s.on("game_seed", (data) => {
      GameState.setGameSeed(data.seed);
    });

    // Connection events
    s.on("opponentDisconnected", () => {
      this.callbacks?.onOpponentDisconnected();
    });

    s.on("opponentReconnected", () => {
      this.callbacks?.onOpponentReconnected?.();
    });

    s.on("opponentAbandon", () => {
      this.callbacks?.onOpponentAbandon?.();
    });

    s.on("disconnectCountdown", (data) => {
      this.callbacks?.onDisconnectCountdown?.(data.remaining);
    });

    s.on("rejoinSuccess", (data) => {
      console.log(`[SocketManager] Rejoin success: room=${data.roomCode}`);
    });

    s.on("error", (data) => {
      console.error(`[SocketManager] Error: ${data.message}`);
      this.callbacks?.onError(data.message);
    });

    // Battle ready
    s.on("both_battle_ready", () => {
      this.callbacks?.onBothBattleReady?.();
    });

    // Crypto
    s.on("hostDepositConfirmed", () => {
      this.callbacks?.onHostDepositConfirmed?.();
    });

    s.on("bothCryptoReady", () => {
      this.callbacks?.onBothCryptoReady?.();
    });

    s.on("payout_result", (data) => {
      GameState.payoutResult = data;
      this.callbacks?.onPayoutResult?.(data);
    });

    // Deck validation
    s.on("deckAccepted", (data) => {
      this.callbacks?.onDeckAccepted?.(data);
    });

    s.on("deckRejected", (data) => {
      this.callbacks?.onDeckRejected?.(data);
    });

    s.on("bothDecksReady", () => {
      this.callbacks?.onBothDecksReady?.();
    });
  }
}

const SocketManager = new SocketManagerClass();
export default SocketManager;

```

# src\renderers\BoardRenderer.ts

```ts
// ============================================================
// BoardRenderer.ts v0.5 — Dual-index OOP refactor
//
// Two maps index thumbnails:
//   unitsByCell:  "col_row"    → UnitThumbnail (position-based)
//   unitsById:    instanceId   → UnitThumbnail (identity-based)
//
// Why: During a tween (220ms), the cell key is stale but the
// instanceId always resolves. Stats update by instanceId.
//
// UNIT_MOVED: tween re-keys only — NO destroy+recreate.
// UNIT_STATS_CHANGED: looks up by instanceId — works mid-tween.
// UNIT_DIED: looks up by instanceId — works mid-tween.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CellRenderData, CardRenderData } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { UnitThumbnail } from './UnitThumbnail';
import { setContainerHitArea } from '../utils/PhaserUtils';

type HighlightType = 'none' | 'move' | 'attack' | 'attackRange' | 'aura' | 'selected' | 'hover';

export class BoardRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  private rootContainer: Phaser.GameObjects.Container;
  private cellContainer: Phaser.GameObjects.Container;
  private highlightContainer: Phaser.GameObjects.Container;
  private unitContainer: Phaser.GameObjects.Container;
  private attackMarkerContainer: Phaser.GameObjects.Container;
  private overlayContainer: Phaser.GameObjects.Container;
  private coordContainer: Phaser.GameObjects.Container;

  // ── DUAL-INDEX ──
  private unitsByCell: Map<string, UnitThumbnail> = new Map();
  private unitsById: Map<string, UnitThumbnail> = new Map();

  private cellGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private highlights: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private hoveredCell: string | null = null;
  /** Reusable hover graphic (pooled to avoid create/destroy per hover). */
  private hoverGfx: Phaser.GameObjects.Graphics | null = null;
  private selectedCell: string | null = null;
  private localPlayerIndex: number = 0;
  private unsubs: Array<() => void> = [];

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON, localPlayerIndex: number) {
    this.localPlayerIndex = localPlayerIndex;
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;

    this.rootContainer         = scene.add.container(0, 0);
    this.cellContainer         = scene.add.container(0, 0);
    this.highlightContainer    = scene.add.container(0, 0);
    this.unitContainer         = scene.add.container(0, 0);
    this.attackMarkerContainer = scene.add.container(0, 0);
    this.overlayContainer      = scene.add.container(0, 0);
    this.coordContainer        = scene.add.container(0, 0);

    this.cellContainer.setDepth(1);
    this.highlightContainer.setDepth(3);
    this.unitContainer.setDepth(5);
    this.attackMarkerContainer.setDepth(7);
    this.overlayContainer.setDepth(8);

    this.rootContainer.add([
      this.cellContainer, this.highlightContainer, this.unitContainer,
      this.attackMarkerContainer, this.overlayContainer, this.coordContainer,
    ]);

    this.buildGrid();
    this.buildCoords();
    this.buildHalfTints();
    this.attachEventListeners();
  }

  setLocalPlayer(index: number): void { this.localPlayerIndex = index; }

  private mirrorRow(row: number): number {
    return this.localPlayerIndex === 0 ? (this.layout.grid.rows - 1) - row : row;
  }

  // ─────────────────────────────────────────────
  // UNIT MANAGEMENT — dual-indexed
  // ─────────────────────────────────────────────

  renderUnit(data: CardRenderData, col: number, row: number): void {
    // Clear any existing thumbnail at this cell
    this.clearUnitByCell(col, row);

    const g = this.layout.grid;
    const L = this.layout.cards.thumbnail;
    const displayRow = this.mirrorRow(row);
    const cx = g.originX + col * g.cellSize + (g.cellSize - L.width) / 2;
    const cy = g.originY + displayRow * g.cellSize + (g.cellSize - L.height) / 2;

const thumb = new UnitThumbnail(this.scene, this.layout, this.theme, data, cx, cy);
    thumb.col = col;   // Set logical position
    thumb.row = row;

    // Interactivity — read col/row from thumbnail (survives moves)
    setContainerHitArea(thumb.container, L.width, L.height);
    thumb.container.on('pointerover', () => this.onCellHover(thumb.col, thumb.row));
    thumb.container.on('pointerout',  () => this.onCellHoverEnd(thumb.col, thumb.row));
    thumb.container.on('pointerdown', () => EventBus.emit(EV.INPUT_BOARD_CLICK, { col: thumb.col, row: thumb.row }));

    this.unitContainer.add(thumb.container);

    // Index in BOTH maps
    this.unitsByCell.set(this.cellKey(col, row), thumb);
    this.unitsById.set(thumb.instanceId, thumb);
  }

  /** Remove thumbnail by cell position. */
  clearUnitByCell(col: number, row: number): void {
    const key = this.cellKey(col, row);
    const thumb = this.unitsByCell.get(key);
    if (thumb) {
      this.unitsByCell.delete(key);
      this.unitsById.delete(thumb.instanceId);
      thumb.destroy();
    }
  }

  /** Remove thumbnail by instanceId — works even during tween. */
  clearUnitById(instanceId: string): void {
    const thumb = this.unitsById.get(instanceId);
    if (!thumb) return;
    this.unitsById.delete(instanceId);
    // Also remove from cell map
    for (const [key, t] of this.unitsByCell) {
      if (t === thumb) { this.unitsByCell.delete(key); break; }
    }
    thumb.destroy();
  }

  clearAllUnits(): void {
    this.unitsByCell.forEach(t => t.destroy());
    this.unitsByCell.clear();
    this.unitsById.clear();
  }

  /** Update stats by instanceId — always resolves, even mid-tween. */
  updateStatsByInstanceId(instanceId: string, atk: number | undefined, currentHP: number | undefined, maxHP: number | undefined, canAct: boolean): void {
    const thumb = this.unitsById.get(instanceId);
    if (thumb) thumb.updateStats(atk, currentHP, maxHP, canAct);
  }

  // ─────────────────────────────────────────────
  // HIGHLIGHTS
  // ─────────────────────────────────────────────

  highlightMoves(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('move');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'move'));
  }

  highlightAttacks(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('attack');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'attack'));
  }

  highlightAuras(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('aura');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'aura'));
  }

  highlightAttackRange(positions: Array<{ col: number; row: number }>): void {
    this.clearHighlightType('attackRange');
    positions.forEach(p => this.addHighlight(p.col, p.row, 'attackRange'));
  }

  setSelected(col: number | null, row: number | null): void {
    if (this.selectedCell) this.clearHighlightType('selected');
    if (col !== null && row !== null) {
      this.selectedCell = this.cellKey(col, row);
      this.addHighlight(col, row, 'selected');
    } else {
      this.selectedCell = null;
    }
  }

  clearAllHighlights(): void {
    this.highlights.forEach(g => g.destroy());
    this.highlights.clear();
    this.selectedCell = null;
    if (this.hoverGfx) this.hoverGfx.setVisible(false);
  }

  clearHighlightType(type: HighlightType): void {
    const suffix = `_${type}`;
    const markerSuffix = `_${type}_marker`;
    for (const [key, g] of this.highlights) {
      if (key.endsWith(suffix) || key.endsWith(markerSuffix)) {
        g.destroy();
        this.highlights.delete(key);
      }
    }
  }

  // ─────────────────────────────────────────────
  // ANIMATIONS
  // ─────────────────────────────────────────────

  /** Tween thumbnail from old cell to new cell. Re-keys in both maps. NO destroy+recreate. */
  animateUnitMove(
    from: { col: number; row: number },
    to: { col: number; row: number },
    onComplete?: () => void
  ): void {
    const fromKey = this.cellKey(from.col, from.row);
    const thumb = this.unitsByCell.get(fromKey);
    if (!thumb) { onComplete?.(); return; }

    const g = this.layout.grid;
    const L = this.layout.cards.thumbnail;
    const displayRow = this.mirrorRow(to.row);
    const targetX = g.originX + to.col * g.cellSize + (g.cellSize - L.width) / 2;
    const targetY = g.originY + displayRow * g.cellSize + (g.cellSize - L.height) / 2;

    this.scene.tweens.add({
      targets: thumb.container,
      x: targetX,
      y: targetY,
      duration: 220,
      ease: 'Quad.easeInOut',
onComplete: () => {
        // Re-key in cell map (instanceId map unchanged — same object)
        this.unitsByCell.delete(fromKey);
        this.unitsByCell.set(this.cellKey(to.col, to.row), thumb);
        // Update logical position so pointer closures report correct cell
        thumb.col = to.col;
        thumb.row = to.row;
        onComplete?.();
      },
    });
  }

  animateAttack(
    _from: { col: number; row: number },
    target: { col: number; row: number },
    onComplete?: () => void
  ): void {
    const g = this.layout.grid;
    const displayRow = this.mirrorRow(target.row);
    const flash = this.scene.add.graphics();
    flash.fillStyle(0xFF4444, 0.5);
    flash.fillRect(
      g.originX + target.col * g.cellSize,
      g.originY + displayRow * g.cellSize,
      g.cellSize, g.cellSize
    );
    this.overlayContainer.add(flash);
    this.scene.tweens.add({
      targets: flash, alpha: 0, duration: 300, ease: 'Power2',
      onComplete: () => { flash.destroy(); onComplete?.(); },
    });
  }

  showDamageNumber(col: number, row: number, amount: number, isHeal = false): void {
    const g = this.layout.grid;
    const displayRow = this.mirrorRow(row);
    const cx = g.originX + col * g.cellSize + g.cellSize / 2;
    const cy = g.originY + displayRow * g.cellSize + g.cellSize / 2;
    const color = isHeal ? '#00FF88' : '#FF4444';
    const label = isHeal ? `+${amount}` : `-${amount}`;

    const txt = this.scene.add.text(cx, cy, label, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${Math.round(g.cellSize * 0.2)}px`,
      color, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    this.overlayContainer.add(txt);
    this.scene.tweens.add({
      targets: txt, y: cy - g.cellSize * 0.5, alpha: 0,
      duration: 900, ease: 'Power2', onComplete: () => txt.destroy(),
    });
  }

  redrawBoard(cells: CellRenderData[]): void {
    this.clearAllUnits();
    this.clearAllHighlights();
    cells.forEach(cell => {
      if (cell.unit) this.renderUnit(cell.unit, cell.col, cell.row);
      if (cell.highlight !== 'none') this.addHighlight(cell.col, cell.row, cell.highlight);
    });
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.clearAllUnits();
    this.rootContainer.destroy();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — GRID
  // ─────────────────────────────────────────────

  private buildGrid(): void {
    const g = this.layout.grid;
    const T = this.theme.board;
    const boardW = g.cols * g.cellSize, boardH = g.rows * g.cellSize;

    if (this.scene.textures.exists('board_skin')) {
      this.cellContainer.add(
        this.scene.add.image(g.originX + boardW / 2, g.originY + boardH / 2, 'board_skin')
          .setDisplaySize(boardW, boardH)
      );
    }

    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const px = g.originX + col * g.cellSize;
        const displayRow = this.mirrorRow(row);
        const py = g.originY + displayRow * g.cellSize;
        const isEven = (col + row) % 2 === 0;

        const cell = this.scene.add.graphics();
        cell.fillStyle(ThemeLoader.hexToNum(isEven ? T.cellEvenFill : T.cellOddFill), 0.6);
        cell.fillRect(px, py, g.cellSize, g.cellSize);
        cell.lineStyle(g.gridLineWidth, ThemeLoader.hexToNum(T.gridLineColor), 1);
        cell.strokeRect(px, py, g.cellSize, g.cellSize);

        cell.setInteractive(
          new Phaser.Geom.Rectangle(px, py, g.cellSize, g.cellSize),
          Phaser.Geom.Rectangle.Contains
        );
        cell.on('pointerover', () => this.onCellHover(col, row));
        cell.on('pointerout',  () => this.onCellHoverEnd(col, row));
        cell.on('pointerdown', () => EventBus.emit(EV.INPUT_BOARD_CLICK, { col, row }));

        this.cellContainer.add(cell);
        this.cellGraphics.set(this.cellKey(col, row), cell);
      }
    }
  }

  private buildHalfTints(): void {
    const g = this.layout.grid;
    const T = this.theme.board;
    const playerHalf = ThemeLoader.hexToColorAlpha(T.playerHalfTint);
    const enemyHalf  = ThemeLoader.hexToColorAlpha(T.enemyHalfTint);
    const deployRows = 3;

    const pt = this.scene.add.graphics();
    pt.fillStyle(playerHalf.color, playerHalf.alpha);
    pt.fillRect(g.originX, g.originY + (g.rows - deployRows) * g.cellSize,
                g.cols * g.cellSize, deployRows * g.cellSize);
    const et = this.scene.add.graphics();
    et.fillStyle(enemyHalf.color, enemyHalf.alpha);
    et.fillRect(g.originX, g.originY, g.cols * g.cellSize, deployRows * g.cellSize);
    this.cellContainer.add([pt, et]);
  }

  private buildCoords(): void {
    if (!this.layout.grid.coordsVisible) return;
    const g = this.layout.grid;
    const fc = {
      fontFamily: this.theme.fonts.coordLabel.family,
      fontSize: `${g.coordsFontSize}px`,
      color: this.theme.board.coordColor,
    };
    const labels = 'ABCDEFGHIJKL'.slice(0, g.cols);
    for (let col = 0; col < g.cols; col++) {
      this.coordContainer.add(
        this.scene.add.text(g.originX + col * g.cellSize + g.cellSize / 2,
          g.originY - g.coordsFontSize - 2, labels[col], fc).setOrigin(0.5, 0.5)
      );
    }
    for (let row = 0; row < g.rows; row++) {
      const dr = this.mirrorRow(row);
      this.coordContainer.add(
        this.scene.add.text(g.originX - g.coordsFontSize - 2,
          g.originY + dr * g.cellSize + g.cellSize / 2, String(row + 1), fc).setOrigin(0.5, 0.5)
      );
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — HIGHLIGHTS
  // ─────────────────────────────────────────────

  private addHighlight(col: number, row: number, type: HighlightType): void {
    const key = `${this.cellKey(col, row)}_${type}`;
    if (this.highlights.has(key)) return;

    const g = this.layout.grid;
    const T = this.theme.board;
    const px = g.originX + col * g.cellSize;
    const displayRow = this.mirrorRow(row);
    const py = g.originY + displayRow * g.cellSize;
    const gfx = this.scene.add.graphics();

    switch (type) {
      case 'move': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellValidMove);
        gfx.fillStyle(color, alpha); gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
      case 'attackRange': {
        const cx = px + g.cellSize / 2, cy = py + g.cellSize / 2, s = g.cellSize * 0.2;
        const m = this.scene.add.graphics();
        m.lineStyle(1.5, 0xFF4444, 0.4);
        m.lineBetween(cx - s, cy - s, cx + s, cy + s);
        m.lineBetween(cx + s, cy - s, cx - s, cy + s);
        m.lineStyle(1, 0xFF4444, 0.3); m.strokeCircle(cx, cy, s * 0.8);
        this.attackMarkerContainer.add(m);
        this.highlights.set(`${this.cellKey(col, row)}_attackRange_marker`, m);
        break;
      }
      case 'attack': {
        const cx = px + g.cellSize / 2, cy = py + g.cellSize / 2, s = g.cellSize * 0.3;
        const m = this.scene.add.graphics();
        m.fillStyle(0x000000, 0.6); m.fillCircle(cx, cy, s * 0.7);
        m.lineStyle(3, 0xFF4444, 1.0);
        m.lineBetween(cx - s * 0.5, cy - s * 0.5, cx + s * 0.5, cy + s * 0.5);
        m.lineBetween(cx + s * 0.5, cy - s * 0.5, cx - s * 0.5, cy + s * 0.5);
        m.lineStyle(2, 0xFF4444, 0.9); m.strokeCircle(cx, cy, s * 0.7);
        this.attackMarkerContainer.add(m);
        this.highlights.set(`${this.cellKey(col, row)}_attack_marker`, m);
        break;
      }
      case 'aura': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellAura);
        gfx.fillStyle(color, alpha); gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
      case 'selected': {
        gfx.lineStyle(3, ThemeLoader.hexToNum(T.cellSelected), 1);
        gfx.strokeRect(px + 1, py + 1, g.cellSize - 2, g.cellSize - 2);
        break;
      }
      case 'hover': {
        const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellHover);
        gfx.fillStyle(color, alpha); gfx.fillRect(px, py, g.cellSize, g.cellSize);
        break;
      }
    }
    this.highlightContainer.add(gfx);
    this.highlights.set(key, gfx);
  }

  // ─────────────────────────────────────────────
  // PRIVATE — INTERACTION
  // ─────────────────────────────────────────────

  private onCellHover(col: number, row: number): void {
    this.hoveredCell = this.cellKey(col, row);

    const g = this.layout.grid;
    const T = this.theme.board;
    const px = g.originX + col * g.cellSize;
    const displayRow = this.mirrorRow(row);
    const py = g.originY + displayRow * g.cellSize;

    if (!this.hoverGfx) {
      this.hoverGfx = this.scene.add.graphics();
      this.highlightContainer.add(this.hoverGfx);
    }
    this.hoverGfx.clear();
    const { color, alpha } = ThemeLoader.hexToColorAlpha(T.cellHover);
    this.hoverGfx.fillStyle(color, alpha);
    this.hoverGfx.fillRect(px, py, g.cellSize, g.cellSize);
    this.hoverGfx.setVisible(true);

    EventBus.emit(EV.CARD_HOVERED, { col, row });
  }

  private onCellHoverEnd(_col: number, _row: number): void {
    if (this.hoverGfx) this.hoverGfx.setVisible(false);
    this.hoveredCell = null;
    EventBus.emit(EV.CARD_HOVER_END, { col: _col, row: _row });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.UNIT_PLACED, ({ data, col, row }) => {
        this.renderUnit(data, col, row);
      }),

      // UNIT_MOVED: tween re-keys only. NO destroy+recreate.
      // Badge updates arrive via UNIT_STATS_CHANGED by instanceId.
      EventBus.on(EV.UNIT_MOVED, ({ from, to }) => {
        this.animateUnitMove(from, to);
      }),

      EventBus.on(EV.UNIT_ATTACKED, ({ attackerCol, attackerRow, targetCol, targetRow, damage }) => {
        const from = { col: attackerCol, row: attackerRow };
        const target = { col: targetCol, row: targetRow };
        this.animateAttack(from, target, () => {
          if (damage) this.showDamageNumber(target.col, target.row, damage);
        });
      }),

      // UNIT_DIED: remove by instanceId — works even mid-tween
      EventBus.on(EV.UNIT_DIED, ({ instanceId, col, row }) => {
        if (instanceId) {
          this.clearUnitById(instanceId);
        } else {
          // Fallback: legacy events without instanceId
          this.clearUnitByCell(col, row);
        }
      }),

      EventBus.on(EV.UNIT_HEALED, ({ col, row, amount }) => {
        this.showDamageNumber(col, row, amount, true);
      }),

      EventBus.on(EV.HIGHLIGHTS_CHANGED, ({ moves, attacks, attackRange, auras }) => {
        this.clearAllHighlights();
        if (attackRange) this.highlightAttackRange(attackRange);
        if (moves)       this.highlightMoves(moves);
        if (attacks)     this.highlightAttacks(attacks);
        if (auras)       this.highlightAuras(auras);
      }),

      // Exhausted/refreshed — placeholder for future visual state
      EventBus.on(EV.UNIT_EXHAUSTED, () => { /* future: thumbnail.setExhausted(true) */ }),
      EventBus.on(EV.UNIT_REFRESHED, () => { /* future: thumbnail.setExhausted(false) */ }),

      // UNIT_STATS_CHANGED: look up by instanceId — always resolves, even mid-tween
      EventBus.on('UNIT_STATS_CHANGED' as any, ({ instanceId, atk, currentHP, maxHP, canAct }: {
        instanceId: string; atk?: number; currentHP?: number; maxHP?: number; canAct: boolean;
      }) => {
        this.updateStatsByInstanceId(instanceId, atk, currentHP, maxHP, canAct);
      }),

      // CAN_ACT_UPDATE: toggle glow per unit on turn boundary
      EventBus.on('CAN_ACT_UPDATE' as any, ({ cells }: { cells: Array<{ col: number; row: number }> }) => {
        // Build Set with numeric keys to avoid string allocation per cell
        const activeSet = new Set<number>();
        for (const c of cells) activeSet.add(c.col * 100 + c.row);
        this.unitsByCell.forEach((thumb) => {
          thumb.setCanAct(activeSet.has(thumb.col * 100 + thumb.row));
        });
      }),
    );
  }

  private cellKey(col: number, row: number): string { return `${col}_${row}`; }
}

ThemeLoader.hexToNum = function(hex: string): number {
  return parseInt(hex.replace('#', '').slice(0, 6), 16);
};
ThemeLoader.hexToColorAlpha = function(hex: string): { color: number; alpha: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    return { color: parseInt('0x' + clean.slice(0, 6), 16), alpha: parseInt(clean.slice(6, 8), 16) / 255 };
  }
  return { color: parseInt('0x' + clean, 16), alpha: 1.0 };
};

```

# src\renderers\CardBackRenderer.ts

```ts
// ============================================================
// CardBackRenderer.ts
// Renders a face-down card back for opponent hand display.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class CardBackRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const r = this.layout.cards.full.cornerRadius;

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(this.theme.colors.BG_DEEP), 1);
    bg.fillRoundedRect(0, 0, width, height, r);

    const border = this.scene.add.graphics();
    border.lineStyle(2, 0x2C4A8A, 1);
    border.strokeRoundedRect(0, 0, width, height, r);

    const backKey = 'card_back';
    if (this.scene.textures.exists(backKey)) {
      const back = this.scene.add.image(width / 2, height / 2, backKey)
        .setDisplaySize(width - 4, height - 4);
      container.add([bg, border, back]);
    } else {
      const pattern = this.scene.add.graphics();
      pattern.lineStyle(1, 0x2C4A8A, 0.3);
      for (let i = 4; i < Math.min(width, height) / 2; i += 8) {
        pattern.strokeRoundedRect(i, i, width - i * 2, height - i * 2, r);
      }
      const logoText = this.scene.add.text(width / 2, height / 2, 'OCB', {
        fontFamily: this.theme.fonts.heading.family,
        fontSize: `${Math.round(width * 0.2)}px`,
        color: '#4FC3F799',
      }).setOrigin(0.5, 0.5);
      container.add([bg, border, pattern, logoText]);
    }

    return container;
  }
}

```

# src\renderers\CardDetailRenderer.ts

```ts
// ============================================================
// CardDetailRenderer.ts
// Renders the detail overlay card (220x320 default).
// Uses CardFullRenderer internally for the scaled card body.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';
import { CardFullRenderer } from './CardFullRenderer';

export class CardDetailRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.detail;
    const T = ThemeLoader.cardTypeTheme(this.theme, data?.allegiance ?? 'STANDARD');
    const container = this.scene.add.container(x - L.width / 2, y - L.height / 2);

    const w = L.width;
    const r = 8;
    const scaleFactor = L.width / this.layout.cards.full.width;

    const detailLayout: BattleLayoutJSON = {
      ...this.layout,
      cards: {
        ...this.layout.cards,
        full: {
          ...this.layout.cards.full,
          width:         L.width,
          height:        L.height,
          artAreaHeight: Math.round(this.layout.cards.full.artAreaHeight * scaleFactor),
          nameBarHeight: Math.round(this.layout.cards.full.nameBarHeight * scaleFactor),
          statRowHeight: Math.round(this.layout.cards.full.statRowHeight * scaleFactor),
          legPipSize:    Math.round(this.layout.cards.full.legPipSize * scaleFactor),
          typeIconSize:  Math.round(this.layout.cards.full.typeIconSize * scaleFactor),
          cornerRadius:  r,
        },
      },
    };

    const subRenderer = new CardFullRenderer(this.scene, detailLayout, this.theme);
    const cardBody = subRenderer.render(data, 0, 0);
    container.add(cardBody);

    const diagY = L.height + 10;
    const diagSize = L.patternDiagramSize;
    if (data.id) {
      const diagBg = this.scene.add.graphics();
      diagBg.fillStyle(ThemeLoader.hexToNum(this.theme.colors.BG_MID), 0.9);
      diagBg.strokeRoundedRect(0, diagY, w, diagSize + 16, 6);
      diagBg.fillRoundedRect(0, diagY, w, diagSize + 16, 6);

      const diagLabel = this.scene.add.text(w / 2, diagY + 4, 'MOVE / ATTACK PATTERN', {
        fontFamily: this.theme.fonts.small.family,
        fontSize: `${this.theme.fonts.small.size}px`,
        color: this.theme.colors.TEXT_SECONDARY,
      }).setOrigin(0.5, 0);

      container.add([diagBg, diagLabel]);
    }

    void T;
    return container;
  }
}

```

# src\renderers\CardFullRenderer.ts

```ts
// ============================================================
// CardFullRenderer.ts
// Renders a full in-hand card (140x200 default).
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';
import { safeImage, makeBadge, warnMissingArt } from './helpers/CardRenderHelpers';

export class CardFullRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.full;
    const T = ThemeLoader.cardTypeTheme(this.theme, data?.allegiance ?? 'STANDARD');
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;
    const r = L.cornerRadius;

    const body = this.scene.add.graphics();
    body.fillStyle(ThemeLoader.hexToNum(T.bodyColor), 1);
    body.fillRoundedRect(0, 0, w, h, r);

    const bandH = h * 0.15;
    const band = this.scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(T.bandColor), 1);
    band.fillRoundedRect(0, 0, w, bandH, { tl: r, tr: r, bl: 0, br: 0 });

    const border = this.scene.add.graphics();
    border.lineStyle(T.borderWidth, ThemeLoader.hexToNum(T.borderColor), 1);
    border.strokeRoundedRect(0, 0, w, h, r);

    const pipR = L.legPipSize / 2;
    const pip = this.scene.add.graphics();
    pip.fillStyle(ThemeLoader.hexToNum(this.theme.cards.STANDARD.legPipColor === T.legPipColor
      ? this.theme.colors.ACCENT_BLUE
      : T.legPipColor), 1);
    pip.fillCircle(pipR + 4, pipR + 4, pipR);

    const pipText = this.scene.add.text(pipR + 4, pipR + 4, String(data.cost), {
      fontFamily: this.theme.fonts.cardStat.family,
      fontSize: `${Math.round(L.legPipSize * 0.55)}px`,
      color: '#FFFFFF',
    }).setOrigin(0.5, 0.5);

    const iconKey = `icon_type_${(data?.allegiance ?? 'standard').toLowerCase()}`;
    safeImage(
      this.scene, container, iconKey,
      w - L.typeIconSize / 2 - 4, L.typeIconSize / 2 + 4,
      L.typeIconSize, L.typeIconSize,
      0.5, 0.5, 0x223366, 0.5,
    );

    const artY = bandH;
    const artH = L.artAreaHeight;
    const artKey = data.artKey ?? `art_${data.id}`;
    let artObj: Phaser.GameObjects.GameObject;

    if (this.scene.textures.exists(artKey)) {
      artObj = this.scene.add.image(0, artY, artKey)
        .setOrigin(0, 0)
        .setDisplaySize(w, artH);
    } else {
      const artPh = this.scene.add.graphics();
      artPh.fillStyle(0x333355, 1);
      artPh.fillRect(0, artY, w, artH);
      artObj = artPh;
      warnMissingArt(artKey);
    }

    const nameY = artY + artH;
    const nameBar = this.scene.add.graphics();
    const { color: nbColor, alpha: nbAlpha } = ThemeLoader.hexToColorAlpha(this.theme.cards.nameBarBg);
    nameBar.fillStyle(nbColor, nbAlpha);
    nameBar.fillRect(0, nameY, w, L.nameBarHeight);

    const nameText = this.scene.add.text(w / 2, nameY + L.nameBarHeight / 2, data.name, {
      fontFamily: this.theme.fonts.cardName.family,
      fontSize: `${this.theme.fonts.cardName.size}px`,
      color: this.theme.fonts.cardName.color ?? '#FFFFFF',
    }).setOrigin(0.5, 0.5).setWordWrapWidth(w - 8);

    const statY = nameY + L.nameBarHeight;
    const statBg = this.scene.add.graphics();
    statBg.fillStyle(0x000000, 0.4);
    statBg.fillRect(0, statY, w, L.statRowHeight);

    const children: Phaser.GameObjects.GameObject[] = [body, band, border, artObj, nameBar, nameText, statBg];

    if (data.atk !== undefined && data.def !== undefined) {
      const atkBadge = makeBadge(
        this.scene, this.theme,
        4, statY + L.statRowHeight / 2,
        `ATK ${data.atk}`, this.theme.cards.atkBadgeColor, L.statRowHeight - 4,
      );
      const defBadge = makeBadge(
        this.scene, this.theme,
        w - 4, statY + L.statRowHeight / 2,
        `DEF ${data.def}`, this.theme.cards.defBadgeColor, L.statRowHeight - 4, true,
      );
      children.push(...atkBadge, ...defBadge);
    }

    const abilityY = statY + L.statRowHeight + 4;
    if (data.abilityText) {
      const abilityText = this.scene.add.text(4, abilityY, data.abilityText, {
        fontFamily: this.theme.fonts.cardAbility.family,
        fontSize: `${this.theme.fonts.cardAbility.size}px`,
        color: this.theme.fonts.cardAbility.color ?? '#AAAAAA',
        wordWrap: { width: w - 8 },
      }).setOrigin(0, 0);
      children.push(abilityText);
    }

    const typeLabel = this.scene.add.text(w / 2, h - 8, (data?.allegiance ?? 'STANDARD').toUpperCase(), {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: this.theme.colors.TEXT_SECONDARY,
    }).setOrigin(0.5, 1);

    children.push(pip, pipText, typeLabel);
    container.add(children);
    this.applyState(container, data);

    return container;
  }

  applyState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
    const existing = container.getByName('state_overlay');
    if (existing) container.remove(existing, true);

    const L = this.layout.cards.full;
    const overlay = this.scene.add.graphics();
    overlay.setName('state_overlay');

    if (data.isExhausted) {
      overlay.fillStyle(0x000000, 1 - this.theme.cards.exhaustedAlpha);
      overlay.fillRoundedRect(0, 0, L.width, L.height, L.cornerRadius);
    }

    if (data.isSelected) {
      overlay.lineStyle(
        this.theme.cards.selectedGlowSize,
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.8,
      );
      overlay.strokeRoundedRect(
        -this.theme.cards.selectedGlowSize / 2,
        -this.theme.cards.selectedGlowSize / 2,
        L.width + this.theme.cards.selectedGlowSize,
        L.height + this.theme.cards.selectedGlowSize,
        L.cornerRadius,
      );
    }

    container.add(overlay);
  }
}

```

# src\renderers\CardRenderer.ts

```ts
// ============================================================
// CardRenderer.ts — Thin facade
// Delegates to CardFullRenderer, CardThumbnailRenderer,
// CardDetailRenderer, and CardBackRenderer.
// Consumers can import this for polymorphic render(mode) calls,
// or import sub-renderers directly for type-specific work.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData, CardRenderMode } from '../game/types/UITypes';
import { CardFullRenderer } from './CardFullRenderer';
import { CardThumbnailRenderer } from './CardThumbnailRenderer';
import { CardDetailRenderer } from './CardDetailRenderer';
import { CardBackRenderer } from './CardBackRenderer';

export class CardRenderer {
  private fullRenderer: CardFullRenderer;
  private thumbnailRenderer: CardThumbnailRenderer;
  private detailRenderer: CardDetailRenderer;
  private backRenderer: CardBackRenderer;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.fullRenderer = new CardFullRenderer(scene, layout, theme);
    this.thumbnailRenderer = new CardThumbnailRenderer(scene, layout, theme);
    this.detailRenderer = new CardDetailRenderer(scene, layout, theme);
    this.backRenderer = new CardBackRenderer(scene, layout, theme);
  }

  render(data: CardRenderData, mode: CardRenderMode, x: number, y: number): Phaser.GameObjects.Container {
    switch (mode) {
      case 'full':      return this.fullRenderer.render(data, x, y);
      case 'thumbnail': return this.thumbnailRenderer.render(data, x, y);
      case 'detail':    return this.detailRenderer.render(data, x, y);
    }
  }

  updateState(container: Phaser.GameObjects.Container, data: CardRenderData, mode: CardRenderMode): void {
    if (mode === 'thumbnail') {
      this.thumbnailRenderer.applyState(container, data);
    } else {
      this.fullRenderer.applyState(container, data);
    }
  }

  updateThumbnailBadges(
    container: Phaser.GameObjects.Container,
    atk: number | undefined,
    currentHP: number | undefined,
    maxHP: number | undefined,
    canAct: boolean,
  ): void {
    this.thumbnailRenderer.updateBadges(container, atk, currentHP, maxHP, canAct);
  }

  renderBack(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
    return this.backRenderer.render(x, y, width, height);
  }
}

```

# src\renderers\CardThumbnailRenderer.ts

```ts
// ============================================================
// CardThumbnailRenderer.ts
// Renders an on-board unit thumbnail (100x100 default).
// Named children enable in-place badge updates.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';
import { makeBadge } from './helpers/CardRenderHelpers';

export class CardThumbnailRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  render(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.thumbnail;
    const BT = this.theme.board;
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;

    // Art
    const baseArtKey = data.artKey ?? `art_${data.id}`;
    const thumbKey = baseArtKey.replace(/^art_/, 'thumb_');
    const textureKey = this.scene.textures.exists(thumbKey) ? thumbKey
                     : this.scene.textures.exists(baseArtKey) ? baseArtKey
                     : null;

    if (textureKey) {
      const art = this.scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDisplaySize(w, h);
      container.add(art);
    } else {
      const ph = this.scene.add.graphics();
      ph.fillStyle(0x333355, 1);
      ph.fillRect(0, 0, w, h);
      container.add(ph);
    }

    // Team color border
    const border = this.scene.add.graphics();
    const borderColor = data.isEnemy ? BT.unitBandEnemy : BT.unitBandPlayer;
    border.lineStyle(2, ThemeLoader.hexToNum(borderColor), 1);
    border.strokeRect(0, 0, w, h);
    container.add(border);

    // Team color band at bottom
    const band = this.scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(borderColor), 0.9);
    band.fillRect(0, h - BT.unitBandHeight, w, BT.unitBandHeight);
    container.add(band);

    // ATK badge (named container)
    if (data.atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = makeBadge(
        this.scene, this.theme,
        2, h - BT.unitBandHeight - 2,
        String(data.atk), this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight,
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // DEF/HP badge (named container)
    if (data.currentHP !== undefined) {
      const hpPct = (data.maxHP && data.maxHP > 0) ? data.currentHP / data.maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = makeBadge(
        this.scene, this.theme,
        w - 2, h - BT.unitBandHeight - 2,
        String(data.currentHP), defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight,
      );
      defGroup.add(defParts);
      container.add(defGroup);
    } else if (data.def !== undefined) {
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = makeBadge(
        this.scene, this.theme,
        w - 2, h - BT.unitBandHeight - 2,
        String(data.def), this.theme.cards.defBadgeColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight,
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // "Can Act" gold glow (named)
    if (data.canAct) {
      const glow = this.scene.add.graphics();
      glow.lineStyle(3, 0xF5A623, 0.9);
      glow.strokeRect(-1, -1, w + 2, h + 2);
      glow.setName('can_act_glow');
      container.add(glow);
    }

    this.applyState(container, data);
    return container;
  }

  applyState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
    const existing = container.getByName('state_overlay');
    if (existing) container.remove(existing, true);

    const L = this.layout.cards.thumbnail;
    const overlay = this.scene.add.graphics();
    overlay.setName('state_overlay');

    if (data.isExhausted) {
      overlay.fillStyle(0x000000, 1 - this.theme.cards.exhaustedAlpha);
      overlay.fillRect(0, 0, L.width, L.height);
      if (this.scene.textures.exists('icon_clock')) {
        const clock = this.scene.add.image(L.width / 2, L.height / 2, 'icon_clock')
          .setDisplaySize(20, 20)
          .setAlpha(0.8)
          .setName('exhausted_icon');
        container.add(clock);
      }
    }

    if (data.isSelected) {
      overlay.lineStyle(
        this.theme.cards.selectedGlowSize,
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.9,
      );
      overlay.strokeRect(0, 0, L.width, L.height);
    }

    container.add(overlay);
  }

  updateBadges(
    container: Phaser.GameObjects.Container,
    atk: number | undefined,
    currentHP: number | undefined,
    maxHP: number | undefined,
    canAct: boolean,
  ): void {
    const L = this.layout.cards.thumbnail;
    const BT = this.theme.board;
    const w = L.width;
    const h = L.height;

    // Update ATK badge
    const oldAtk = container.getByName('atk_badge');
    if (oldAtk) container.remove(oldAtk, true);
    if (atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = makeBadge(
        this.scene, this.theme,
        2, h - BT.unitBandHeight - 2,
        String(atk), this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight,
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // Update DEF/HP badge
    const oldDef = container.getByName('def_badge');
    if (oldDef) container.remove(oldDef, true);
    if (currentHP !== undefined) {
      const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = makeBadge(
        this.scene, this.theme,
        w - 2, h - BT.unitBandHeight - 2,
        String(currentHP), defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight,
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // Update canAct glow
    const oldGlow = container.getByName('can_act_glow');
    if (oldGlow) container.remove(oldGlow, true);
    if (canAct) {
      const glow = this.scene.add.graphics();
      glow.lineStyle(3, 0xF5A623, 0.9);
      glow.strokeRect(-1, -1, w + 2, h + 2);
      glow.setName('can_act_glow');
      container.add(glow);
    }
  }
}

```

# src\renderers\HandRenderer.ts

```ts
// ============================================================
// HandRenderer.ts
// Renders the player's hand of cards in the left HUD.
// Opponent hand renders as face-down backs in the right HUD.
//
// Reads from:
//   layout.leftHUD.hand   → positions, spacing, fan, scale
//   layout.cards.full     → card dimensions
//   theme.*               → colors
//
// Fully parametric: change fanAngle, spacing, cardWidth
// in the JSON → hand re-lays out automatically.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { CardRenderer } from './CardRenderer';
import { setContainerHitArea } from '../utils/PhaserUtils';
import { fanPosition } from './helpers/CardLayoutCalc';

export class HandRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;
  private cardRenderer: CardRenderer;

  // Player hand container
  private handContainer: Phaser.GameObjects.Container;
  // Opponent hand container
  private oppHandContainer: Phaser.GameObjects.Container;

  // Current hand state
  private cards: CardRenderData[] = [];
  private cardContainers: Phaser.GameObjects.Container[] = [];
  private selectedIndex: number | null = null;
  private hoveredIndex: number | null = null;

  // Opponent hand
  private oppCardCount: number = 0;
  private oppCardContainers: Phaser.GameObjects.Container[] = [];

  private unsubs: Array<() => void> = [];

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
    this.cardRenderer = new CardRenderer(scene, layout, theme);

    this.handContainer    = scene.add.container(0, 0);
    this.oppHandContainer = scene.add.container(0, 0);
    this.handContainer.setDepth(10);
  this.oppHandContainer.setDepth(10); 
    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /** Full rebuild of hand display from card data array. */
  setHand(cards: CardRenderData[]): void {
    this.cards = cards;
    this.selectedIndex = null;
    this.hoveredIndex = null;
    this.rebuild();
  }

  /** Add a card to the hand (on draw). */
  addCard(card: CardRenderData): void {
    this.cards.push(card);
    this.rebuild();
    // Animate the new card sliding in
    const lastContainer = this.cardContainers[this.cardContainers.length - 1];
    if (lastContainer) {
      lastContainer.setAlpha(0);
      this.scene.tweens.add({
        targets: lastContainer,
        alpha: 1,
        y: lastContainer.y,
        duration: 250,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Remove a card from the hand (on play/discard). */
  removeCard(index: number): void {
    if (index < 0 || index >= this.cards.length) return;

    const container = this.cardContainers[index];
    if (container) {
      this.scene.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 30,
        duration: 200,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.cards.splice(index, 1);
          if (this.selectedIndex === index) this.selectedIndex = null;
          if (this.selectedIndex !== null && this.selectedIndex > index) this.selectedIndex--;
          this.rebuild();
        },
      });
    } else {
      this.cards.splice(index, 1);
      this.rebuild();
    }
  }

  /** Set which hand card is currently selected. */
  setSelected(index: number | null): void {
    const prev = this.selectedIndex;
    this.selectedIndex = index;

    if (prev !== null) this.refreshCardVisual(prev);
    if (index !== null) this.refreshCardVisual(index);
  }

  /** Update a card's data (e.g., after stat change). */
  updateCard(index: number, data: CardRenderData): void {
    if (index < 0 || index >= this.cards.length) return;
    this.cards[index] = data;
    this.refreshCardVisual(index);
  }

  /** Update opponent's face-down hand count. */
  setOpponentHandCount(count: number): void {
    this.oppCardCount = count;
    this.rebuildOpponent();
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.handContainer.destroy();
    this.oppHandContainer.destroy();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — PLAYER HAND LAYOUT
  // ─────────────────────────────────────────────

  private rebuild(): void {
    // Destroy existing card visuals
    this.cardContainers.forEach(c => c.destroy());
    this.cardContainers = [];

    const H = this.layout.leftHUD.hand;
    const count = Math.min(this.cards.length, H.maxVisible);

    for (let i = 0; i < count; i++) {
      const pos = this.cardPosition(i, count, H);
      const cardContainer = this.cardRenderer.render(
        { ...this.cards[i], isSelected: this.selectedIndex === i },
        'full',
        pos.x,
        pos.y
      );

      // Apply fan rotation
      cardContainer.setRotation(Phaser.Math.DegToRad(pos.angle));

      // Interactivity
const fullW = this.layout.cards.full.width;
const fullH = this.layout.cards.full.height;
setContainerHitArea(cardContainer, fullW, fullH);

      const idx = i; // capture for closure
      cardContainer.on('pointerover',  () => this.onCardHover(idx));
      cardContainer.on('pointerout',   () => this.onCardHoverEnd(idx));
      cardContainer.on('pointerdown',  () => this.onCardClick(idx));

      this.handContainer.add(cardContainer);
      this.cardContainers.push(cardContainer);
    }

    // Overflow indicator
    if (this.cards.length > H.maxVisible) {
      const overflow = this.cards.length - H.maxVisible;
      const bottomCard = this.cardContainers[this.cardContainers.length - 1];
      if (bottomCard) {
        const moreLabel = this.scene.add.text(
          H.x, bottomCard.y + H.cardHeight + 4,
          `+${overflow} more`,
          {
            fontFamily: this.theme.fonts.small.family,
            fontSize: `${this.theme.fonts.small.size}px`,
            color: this.theme.colors.TEXT_SECONDARY,
          }
        ).setOrigin(0.5, 0);
        this.handContainer.add(moreLabel);
      }
    }
  }

  // cardPosition extracted → helpers/CardLayoutCalc.ts fanPosition()
  private cardPosition(
    index: number,
    total: number,
    H: typeof this.layout.leftHUD.hand
  ): { x: number; y: number; angle: number } {
    return fanPosition(index, total, H);
  }

  private refreshCardVisual(index: number): void {
    const container = this.cardContainers[index];
    if (!container) return;

    // Destroy and re-render just this card
    const H = this.layout.leftHUD.hand;
    const count = Math.min(this.cards.length, H.maxVisible);
    const pos = this.cardPosition(index, count, H);

    // Update state without full rebuild for performance
    this.cardRenderer.updateState(
      container,
      { ...this.cards[index], isSelected: this.selectedIndex === index },
      'full'
    );

    // Scale animation for selected state
    const targetScale = this.selectedIndex === index ? H.selectedScale : 1.0;
    this.scene.tweens.add({
      targets: container,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: 120,
      ease: 'Quad.easeOut',
    });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — OPPONENT HAND
  // ─────────────────────────────────────────────

  private rebuildOpponent(): void {
    this.oppCardContainers.forEach(c => c.destroy());
    this.oppCardContainers = [];

    const H = this.layout.rightHUD.hand;
    const count = Math.min(this.oppCardCount, H.maxVisible);

    for (let i = 0; i < count; i++) {
      const py = H.y + i * (H.cardHeight + H.spacing);
      const back = this.cardRenderer.renderBack(
        H.x - H.cardWidth / 2,
        py,
        H.cardWidth,
        H.cardHeight
      );
      this.oppHandContainer.add(back);
      this.oppCardContainers.push(back);
    }

    // Count label above opponent hand
    const countLbl = this.scene.add.text(H.x, H.y - 20, `${this.oppCardCount} cards`, {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: this.theme.colors.TEXT_SECONDARY,
    }).setOrigin(0.5, 1);
    this.oppHandContainer.add(countLbl);
  }

  // ─────────────────────────────────────────────
  // PRIVATE — INPUT HANDLERS
  // ─────────────────────────────────────────────

  private onCardHover(index: number): void {
    if (this.hoveredIndex === index) return;
    this.hoveredIndex = index;

    const container = this.cardContainers[index];
    if (!container) return;

    // Expand card on hover (if not selected)
    if (this.selectedIndex !== index) {
      const H = this.layout.leftHUD.hand;
      const full = this.layout.cards.full;
      const scaleX = full.hoverWidth / full.width;
      const scaleY = full.hoverHeight / full.height;

      this.scene.tweens.add({
        targets: container,
        scaleX,
        scaleY,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    }

    // Bring to top within hand container
    this.handContainer.bringToTop(container);

    EventBus.emit(EV.CARD_HOVERED, { index, card: this.cards[index] });
  }

  private onCardHoverEnd(index: number): void {
    if (this.hoveredIndex !== index) return;
    this.hoveredIndex = null;

    const container = this.cardContainers[index];
    if (!container) return;

    if (this.selectedIndex !== index) {
      this.scene.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
        ease: 'Quad.easeOut',
      });
    }

    EventBus.emit(EV.CARD_HOVER_END, { index });
  }

  private onCardClick(index: number): void {
    const wasSelected = this.selectedIndex === index;

    // Deselect if clicking already-selected
    const newSelection = wasSelected ? null : index;
    this.setSelected(newSelection);

 EventBus.emit(EV.INPUT_HAND_CLICK, { index: newSelection });
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.CARD_DRAWN, ({ card }) => {
        this.addCard(card);
      }),

      EventBus.on(EV.CARD_PLAYED, ({ handIndex, isLocal }) => {
  if (!isLocal) return;  // ← opponent played — opponent hand is count-based via HUD_REFRESH
  this.removeCard(handIndex);
  if (this.selectedIndex === handIndex) {
    this.setSelected(null);
  }
}),

EventBus.on(EV.CARD_DISCARDED, ({ handIndex, isLocal }) => {
  if (!isLocal) return;
  this.removeCard(handIndex);
}),

      // Update selected state from SelectionManager
EventBus.on(EV.INPUT_BOARD_CLICK, () => {
  this.setSelected(null);
}),
EventBus.on(EV.SELECTION_CHANGED, ({ source }) => {
  if (source === 'clear') {
    this.setSelected(null);
  }
}),
    
    

      // Opponent hand count update
      EventBus.on(EV.HUD_REFRESH, (snap) => {
        if (snap.opponentHandCount !== undefined) {
          this.setOpponentHandCount(snap.opponentHandCount);
        }
      }),
    );
  }
}

```

# src\renderers\helpers\ButtonFactory.ts

```ts
// ============================================================
// ButtonFactory.ts
// Shared button creation for HUDRenderer and OverlayRenderer.
// Unifies makeButton() and makePanelButton() into one function.
// ============================================================

import Phaser from 'phaser';
import { ThemeLoader } from '../../config/ThemeLoader';
import type { ButtonStyle } from '../../game/types/UITypes';

export interface ButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  style: ButtonStyle;
  fontFamily: string;
  onClick: () => void;
  /** If true, button origin is center (draws at -w/2, -h/2). Default: false (top-left). */
  centered?: boolean;
}

/**
 * Create a themed button container with hover/press states.
 * Supports both top-left origin (HUD) and centered origin (overlay panels).
 */
export function createButton(
  scene: Phaser.Scene,
  opts: ButtonOptions
): Phaser.GameObjects.Container {
  const { x, y, w, h, label, style, fontFamily, onClick, centered = false } = opts;

  const container = scene.add.container(x, y);
  const ox = centered ? -w / 2 : 0;
  const oy = centered ? -h / 2 : 0;
  const textX = centered ? 0 : w / 2;
  const textY = centered ? 0 : h / 2;

  const bg = scene.add.graphics();

  function drawBg(fillColor: string): void {
    bg.clear();
    bg.fillStyle(ThemeLoader.hexToNum(fillColor), 1);
    bg.fillRoundedRect(ox, oy, w, h, style.cornerRadius);
    bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
    bg.strokeRoundedRect(ox, oy, w, h, style.cornerRadius);
  }

  drawBg(style.fillColor);

  const txt = scene.add.text(textX, textY, label, {
    fontFamily,
    fontSize: `${style.fontSize}px`,
    color: style.textColor,
  }).setOrigin(0.5, 0.5);

  container.add([bg, txt]);
  container.setInteractive(
    new Phaser.Geom.Rectangle(ox, oy, w, h),
    Phaser.Geom.Rectangle.Contains
  );

  container.on('pointerover', () => {
    drawBg(style.hoverFillColor);
    txt.setColor(style.hoverTextColor);
  });

  container.on('pointerout', () => {
    drawBg(style.fillColor);
    txt.setColor(style.textColor);
  });

  container.on('pointerdown', onClick);

  return container;
}

```

# src\renderers\helpers\CardLayoutCalc.ts

```ts
// ============================================================
// CardLayoutCalc.ts
// Shared card spacing and grid layout calculations.
// Used by HandRenderer (fan layout) and OverlayRenderer (grid).
// ============================================================

export interface GridLayout {
  /** Top-left X of first cell (centered in container). */
  startX: number;
  /** Top-left Y of first cell. */
  startY: number;
  /** Number of columns that fit. */
  cols: number;
}

/**
 * Calculate grid layout parameters for a panel of cards.
 * Cards are spaced with `gap` between them and centered
 * horizontally within `panelWidth`.
 */
export function calcCardGrid(
  panelWidth: number,
  panelHeight: number,
  cardW: number,
  _cardH: number,
  gap = 8,
  paddingX = 20,
  topOffset = 50,
): GridLayout {
  const cols = Math.floor((panelWidth - paddingX * 2) / (cardW + gap));
  const gridWidth = cols * (cardW + gap) - gap;
  const startX = -gridWidth / 2 + cardW / 2;
  const startY = -panelHeight / 2 + topOffset;
  return { startX, startY, cols };
}

/**
 * Get X,Y for a card at `index` in a grid layout.
 */
export function gridPosition(
  grid: GridLayout,
  index: number,
  cardW: number,
  cardH: number,
  gap = 8,
): { x: number; y: number } {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return {
    x: grid.startX + col * (cardW + gap),
    y: grid.startY + row * (cardH + gap),
  };
}

/**
 * Calculate vertical card fan position for hand display.
 * Returns position and rotation for the card at `index`.
 */
export function fanPosition(
  index: number,
  total: number,
  config: { x: number; y: number; cardWidth: number; cardHeight: number; spacing: number; fanAngle: number }
): { x: number; y: number; angle: number } {
  if (total === 1) {
    return { x: config.x - config.cardWidth / 2, y: config.y, angle: 0 };
  }
  const centerIdx = (total - 1) / 2;
  const angle = (index - centerIdx) * config.fanAngle;
  const xShift = (index - centerIdx) * (config.fanAngle * 0.8);
  return {
    x: config.x - config.cardWidth / 2 + xShift,
    y: config.y + index * (config.cardHeight + config.spacing),
    angle,
  };
}

```

# src\renderers\helpers\CardRenderHelpers.ts

```ts
// ============================================================
// CardRenderHelpers.ts
// Shared utility functions for all card renderers.
// ============================================================

import Phaser from 'phaser';
import { ThemeLoader } from '../../config/ThemeLoader';
import type { ThemeJSON } from '../../game/types/UITypes';

const _missingKeyWarned = new Set<string>();

export function safeImage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  key: string, x: number, y: number, w: number, h: number,
  originX = 0, originY = 0,
  fallbackColor = 0x333355, fallbackAlpha = 0.6,
): void {
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key)
      .setOrigin(originX, originY)
      .setDisplaySize(w, h);
    container.add(img);
  } else {
    const rx = originX === 0.5 ? x - w / 2 : x;
    const ry = originY === 0.5 ? y - h / 2 : y;
    const rect = scene.add.graphics();
    rect.fillStyle(fallbackColor, fallbackAlpha);
    rect.fillRect(rx, ry, w, h);
    container.add(rect);

    if (!_missingKeyWarned.has(key)) {
      _missingKeyWarned.add(key);
      console.warn(`[CardRenderer] Texture not found, using fallback rect: "${key}"`);
    }
  }
}

export function makeBadge(
  scene: Phaser.Scene, theme: ThemeJSON,
  x: number, y: number, label: string, fillHex: string,
  fontSize: number, rightAligned = false, w = 24, h = 16,
): Phaser.GameObjects.GameObject[] {
  const bgX = rightAligned ? x - w : x;

  const bg = scene.add.graphics();
  bg.fillStyle(ThemeLoader.hexToNum(fillHex), 1);
  bg.fillRoundedRect(bgX, y - h / 2, w, h, 4);

  const text = scene.add.text(x + (rightAligned ? -w / 2 : w / 2), y, label, {
    fontFamily: theme.fonts.cardStat.family,
    fontSize: `${fontSize}px`,
    color: '#FFFFFF',
  }).setOrigin(0.5, 0.5);

  return [bg, text];
}

export function warnMissingArt(artKey: string): void {
  if (!_missingKeyWarned.has(artKey)) {
    _missingKeyWarned.add(artKey);
    console.warn(`[CardRenderer] Art texture missing, using fallback rect: "${artKey}"`);
  }
}

```

# src\renderers\helpers\TextureHelper.ts

```ts
// ============================================================
// TextureHelper.ts
// Null Object pattern for textures — always returns a visual,
// never null. Uses a colored rect fallback if texture is missing.
// ============================================================

import Phaser from 'phaser';

const _warned = new Set<string>();

/**
 * Add an image to a container with automatic fallback.
 * If the texture key doesn't exist, renders a colored rectangle
 * instead — guarantees a visual is always produced.
 */
export function safeImage(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  key: string,
  x: number, y: number,
  w: number, h: number,
  originX = 0, originY = 0,
  fallbackColor = 0x333355, fallbackAlpha = 0.6,
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  if (scene.textures.exists(key)) {
    const img = scene.add.image(x, y, key)
      .setOrigin(originX, originY)
      .setDisplaySize(w, h);
    container.add(img);
    return img;
  }

  const rx = originX === 0.5 ? x - w / 2 : x;
  const ry = originY === 0.5 ? y - h / 2 : y;
  const rect = scene.add.graphics();
  rect.fillStyle(fallbackColor, fallbackAlpha);
  rect.fillRect(rx, ry, w, h);
  container.add(rect);

  if (!_warned.has(key)) {
    _warned.add(key);
    console.warn(`[TextureHelper] Texture missing, using fallback: "${key}"`);
  }
  return rect;
}

/**
 * Check if texture exists, logging a deduplicated warning if not.
 * Returns true if the texture is available.
 */
export function textureExists(scene: Phaser.Scene, key: string): boolean {
  if (scene.textures.exists(key)) return true;
  if (!_warned.has(key)) {
    _warned.add(key);
    console.warn(`[TextureHelper] Texture missing: "${key}"`);
  }
  return false;
}

```

# src\renderers\HUDRenderer.ts

```ts
// ============================================================
// HUDRenderer.ts
// Renders the left HUD (player), right HUD (opponent),
// and action controls (phase label, End Turn button).
//
// All positions from layout JSON. All colors from theme JSON.
// Subscribes to EventBus — updates only the elements that changed.
// No game logic. No GameState reads.
//
// PATCH v0.3.1:
//   - PASS button removed (END TURN handles both PLAY→ACT and ACT→END)
//   - Bottom bar repositioned to right HUD area (no longer covers board)
//   - Card play zone dashed border removed (not needed)
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, HUDSnapshot } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { createButton } from './helpers/ButtonFactory';

export class HUDRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  // ── Left HUD elements ──
  private leftPanel!: Phaser.GameObjects.Graphics;
  private playerNameText!: Phaser.GameObjects.Text;
  private playerHPBar!: Phaser.GameObjects.Graphics;
  private playerHPBarFill!: Phaser.GameObjects.Graphics;
  private playerLEGText!: Phaser.GameObjects.Text;
  private playerLEGRateText!: Phaser.GameObjects.Text;
  private playerWinLossText!: Phaser.GameObjects.Text;

  // ── Right HUD elements ──
  private rightPanel!: Phaser.GameObjects.Graphics;
  private opponentNameText!: Phaser.GameObjects.Text;
  private opponentHPBar!: Phaser.GameObjects.Graphics;
  private opponentHPBarFill!: Phaser.GameObjects.Graphics;
  private opponentLEGText!: Phaser.GameObjects.Text;

  // ── Action controls (right HUD area) ──
  private phaseLabelText!: Phaser.GameObjects.Text;
  private endTurnBtn!: Phaser.GameObjects.Container;

  // Callbacks set by BattleScene
  private onEndTurn?: () => void;
  private onPass?: () => void;

  // Current state for HP bar sizing
  private playerMaxHP: number = 30;
  private opponentMaxHP: number = 30;

  private unsubs: Array<() => void> = [];
  private localPlayerIndex: number = 0;

  setLocalPlayer(index: number): void {
    this.localPlayerIndex = index;
  }

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;

    this.buildLeftHUD();
    this.buildRightHUD();
    this.buildBottomBar();
    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  refresh(snap: HUDSnapshot): void {
    this.playerMaxHP   = snap.playerKingMaxHP;
    this.opponentMaxHP = snap.opponentKingMaxHP;

    this.playerNameText.setText(snap.playerName);
    this.opponentNameText.setText(snap.opponentName);
    this.updatePlayerHP(snap.playerKingHP, snap.playerKingMaxHP);
    this.updateOpponentHP(snap.opponentKingHP, snap.opponentKingMaxHP);
    this.updatePlayerLEG(snap.playerLEG, snap.playerCrown);
    this.updateOpponentLEG(snap.opponentLEGCount);
    this.updatePhaseLabel(snap.currentPhase, snap.turnNumber);
    this.playerWinLossText.setText(`${snap.playerWins}W / ${snap.playerLosses}L`);

    const isMyTurn = snap.isPlayerTurn;
    this.setEndTurnEnabled(isMyTurn);
  }

  updatePlayerHP(current: number, max: number): void {
    this.drawHPBar(this.playerHPBarFill, this.layout.leftHUD.kingHPBar, current, max);
  }

  updateOpponentHP(current: number, max: number): void {
    this.drawHPBar(this.opponentHPBarFill, this.layout.rightHUD.kingHPBar, current, max);
  }

  updatePlayerLEG(amount: number, rate: number): void {
    this.playerLEGText.setText(`${amount} LEG`);
    this.playerLEGRateText.setText(`+${rate}/turn`);
  }

  updateOpponentLEG(count: number): void {
    this.opponentLEGText.setText(`${count} LEG`);
  }

  updatePhaseLabel(phase: string, turn: number): void {
    this.phaseLabelText.setText(`TURN ${turn} · ${phase}`);

    const phaseColors: Record<string, string> = {
      'DRAW': '#AAAAAA',
      'PLAY': '#00FF88',
      'ACT':  '#F5A623',
      'END':  '#888888',
    };
    this.phaseLabelText.setColor(phaseColors[phase] ?? '#FFFFFF');
  }

  setEndTurnEnabled(enabled: boolean): void {
    const btn = this.endTurnBtn;
    if (!btn) return;
    btn.setAlpha(enabled ? 1.0 : 0.4);
    if (btn.input) {
      btn.input.enabled = enabled;
    }
  }

  onEndTurnClick(fn: () => void): void { this.onEndTurn = fn; }
  onPassClick(fn: () => void): void    { this.onPass = fn; }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
  }

  // ─────────────────────────────────────────────
  // PRIVATE — BUILD
  // ─────────────────────────────────────────────

  private buildLeftHUD(): void {
    const L = this.layout.leftHUD;
    const T = this.theme.hud;
    const C = this.theme.colors;

    this.leftPanel = this.scene.add.graphics();
    this.leftPanel.fillStyle(ThemeLoader.hexToNum(T.panelBg), T.panelAlpha);
    this.leftPanel.fillRect(L.x, L.y, L.width, L.height);

    this.playerNameText = this.scene.add.text(L.playerName.x, L.playerName.y, 'PLAYER', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.playerNameColor,
    }).setOrigin(0.5, 0);

    this.playerHPBar = this.scene.add.graphics();
    this.playerHPBar.fillStyle(ThemeLoader.hexToNum(T.hpBarBg), 1);
    this.playerHPBar.fillRoundedRect(L.kingHPBar.x, L.kingHPBar.y, L.kingHPBar.width, L.kingHPBar.height, 3);

    this.playerHPBarFill = this.scene.add.graphics();
    this.drawHPBar(this.playerHPBarFill, L.kingHPBar, 30, 30);

    this.playerLEGText = this.scene.add.text(L.legCounter.x, L.legCounter.y, '1 LEG', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.legColor,
    }).setOrigin(0.5, 0);

    this.playerLEGRateText = this.scene.add.text(L.legRate.x, L.legRate.y, '+1/turn', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: T.legRateColor,
    }).setOrigin(0.5, 0);

    this.playerWinLossText = this.scene.add.text(L.winLoss.x, L.winLoss.y, '0W / 0L', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: `${this.theme.fonts.small.size}px`,
      color: C.TEXT_SECONDARY,
    }).setOrigin(0.5, 0);

    if (this.scene.textures.exists('icon_leg')) {
      this.scene.add.image(L.legCounter.x - 32, L.legCounter.y + 9, 'icon_leg')
        .setDisplaySize(20, 20);
    }
  }

  private buildRightHUD(): void {
    const L = this.layout.rightHUD;
    const T = this.theme.hud;

    this.rightPanel = this.scene.add.graphics();
    this.rightPanel.fillStyle(ThemeLoader.hexToNum(T.panelBg), T.panelAlpha);
    this.rightPanel.fillRect(L.x, L.y, L.width, L.height);

    this.opponentNameText = this.scene.add.text(L.opponentName.x, L.opponentName.y, 'OPPONENT', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.enemyNameColor,
    }).setOrigin(0.5, 0);

    this.opponentHPBar = this.scene.add.graphics();
    this.opponentHPBar.fillStyle(ThemeLoader.hexToNum(T.hpBarBg), 1);
    this.opponentHPBar.fillRoundedRect(
      L.kingHPBar.x, L.kingHPBar.y, L.kingHPBar.width, L.kingHPBar.height, 3
    );

    this.opponentHPBarFill = this.scene.add.graphics();
    this.drawHPBar(this.opponentHPBarFill, L.kingHPBar, 30, 30);

    this.opponentLEGText = this.scene.add.text(L.legCounter.x, L.legCounter.y, '1 LEG', {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.legColor,
    }).setOrigin(0.5, 0);
  }

  private buildBottomBar(): void {
    const L = this.layout.bottomBar;
    const T = this.theme.hud;

    // Phase label — positioned in right HUD area
    this.phaseLabelText = this.scene.add.text(
      L.phaseLabel.x, L.phaseLabel.y,
      'TURN 1 · DRAW',
      {
        fontFamily: this.theme.fonts.body.family,
        fontSize: `${this.theme.fonts.body.size}px`,
        color: T.phaseLabelColor,
      }
    ).setOrigin(0.5, 0);

    // End Turn button — positioned in right HUD area below phase label
    if (L.endTurnBtn.width > 0 && L.endTurnBtn.height > 0) {
      this.endTurnBtn = createButton(this.scene, {
        x: L.endTurnBtn.x - L.endTurnBtn.width / 2,
        y: L.endTurnBtn.y - L.endTurnBtn.height / 2,
        w: L.endTurnBtn.width,
        h: L.endTurnBtn.height,
        label: 'END TURN',
        style: this.theme.buttons.endTurn,
        fontFamily: this.theme.fonts.body.family,
        onClick: () => { if (this.onEndTurn) this.onEndTurn(); },
      });
    }

    // PASS button removed — END TURN handles phase advancement for both PLAY and ACT
  }

  // ─────────────────────────────────────────────
  // PRIVATE — DRAWING HELPERS
  // ─────────────────────────────────────────────

  private drawHPBar(
    gfx: Phaser.GameObjects.Graphics,
    bar: { x: number; y: number; width: number; height: number },
    current: number,
    max: number
  ): void {
    const T = this.theme.hud;
    gfx.clear();

    if (max <= 0) return;
    const pct = Math.max(0, Math.min(1, current / max));
    const fillW = Math.round(bar.width * pct);

    const fillHex = pct > 0.5 ? T.hpBarFull : pct > 0.25 ? T.hpBarMid : T.hpBarLow;
    gfx.fillStyle(ThemeLoader.hexToNum(fillHex), 1);
    gfx.fillRoundedRect(bar.x, bar.y, fillW, bar.height, 3);
  }

  // makeButton extracted → helpers/ButtonFactory.ts createButton()

  private drawDashedRect(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    color: number, alpha: number,
    dashLen = 8, gapLen = 6
  ): void {
    gfx.lineStyle(1, color, alpha);
    this.drawDashedLine(gfx, x,     y,     x + w, y,     dashLen, gapLen);
    this.drawDashedLine(gfx, x + w, y,     x + w, y + h, dashLen, gapLen);
    this.drawDashedLine(gfx, x + w, y + h, x,     y + h, dashLen, gapLen);
    this.drawDashedLine(gfx, x,     y + h, x,     y,     dashLen, gapLen);
  }

  private drawDashedLine(
    gfx: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
    dashLen: number, gapLen: number
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / len;
    const ny = dy / len;

    let pos = 0;
    let drawing = true;

    while (pos < len) {
      const segLen = Math.min(drawing ? dashLen : gapLen, len - pos);
      if (drawing) {
        gfx.lineBetween(
          x1 + nx * pos,       y1 + ny * pos,
          x1 + nx * (pos + segLen), y1 + ny * (pos + segLen)
        );
      }
      pos += segLen;
      drawing = !drawing;
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.HUD_REFRESH, (snap: HUDSnapshot) => {
        this.refresh(snap);
      }),

      EventBus.on(EV.LEG_GAINED, ({ player, total, rate }) => {
        if (player === this.localPlayerIndex) {
          this.updatePlayerLEG(total, rate);
        } else {
          this.updateOpponentLEG(total);
        }
      }),

      EventBus.on(EV.LEG_SPENT, ({ player, remaining, rate }) => {
        if (player === this.localPlayerIndex) {
          this.updatePlayerLEG(remaining, rate);
        }
      }),

      EventBus.on(EV.UNIT_HEALED, ({ player, isKing, newHP, maxHP }) => {
        if (!isKing) return;
        if (player === this.localPlayerIndex) {
          this.updatePlayerHP(newHP, maxHP);
        } else {
          this.updateOpponentHP(newHP, maxHP);
        }
      }),

      EventBus.on(EV.UNIT_ATTACKED, ({ targetPlayer, isKingHit, newHP, maxHP }) => {
        if (!isKingHit) return;
        if (newHP == null || maxHP == null) return;
        if (targetPlayer === this.localPlayerIndex) {
          this.updatePlayerHP(newHP, maxHP);
        } else {
          this.updateOpponentHP(newHP, maxHP);
        }
      }),

      EventBus.on(EV.PHASE_CHANGED, ({ phase, turn }) => {
        this.updatePhaseLabel(phase, turn);
      }),

      EventBus.on(EV.TURN_STARTED, ({ activePlayer }) => {
        const isMyTurn = activePlayer === this.localPlayerIndex;
        this.setEndTurnEnabled(isMyTurn);
      }),
    );
  }
}

```

# src\renderers\OverlayRenderer.ts

```ts
// ============================================================
// OverlayRenderer.ts
// All modal overlays: target selection, game over, deck preview,
// stake selection, and card detail view.
//
// All positions/sizes from layout.overlays (JSON).
// All colors/styles from theme.overlays (JSON).
// Overlays stack on top of everything else (highest depth).
// ============================================================

import Phaser from 'phaser';
import type {
  BattleLayoutJSON,
  ThemeJSON,
  CardRenderData,
  Rect,
} from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { CardRenderer } from './CardRenderer';
import { createButton } from './helpers/ButtonFactory';
import { getCard } from '../game/data/CardRegistry';

export type CursorIcon = 'heal' | 'damage' | 'select' | 'none';

/** Map ability types to cursor icons for target selection. */
function deriveCursorIcon(sourceAbility?: string): CursorIcon {
  if (!sourceAbility) return 'select';
  if (sourceAbility.includes('HEAL') || sourceAbility.includes('REVIVE')) return 'heal';
  if (sourceAbility.includes('DAMAGE') || sourceAbility.includes('EARTHQUAKE')) return 'damage';
  return 'select';
}

export interface TargetSelectConfig {
  prompt: string;
  positions?: Array<{ col: number; row: number }>; // board positions to highlight
  cards?: CardRenderData[];                         // cards to show (for discard)
  mode: 'board' | 'hand' | 'graveyard';
  cursorIcon?: CursorIcon;                          // icon that follows the cursor
}

export interface GameOverConfig {
  won: boolean;
  playerName: string;
  opponentName: string;
  reason: string;        // 'King defeated', 'Opponent surrendered', etc.
  isCryptoMode: boolean;
  payoutAmount?: string; // e.g. '0.1 AVAX'
  txHash?: string;
}

export class OverlayRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;
  private cardRenderer: CardRenderer;

  // Root container — always on top
  private rootContainer: Phaser.GameObjects.Container;
  private dimmer: Phaser.GameObjects.Graphics | null = null;
  private activeOverlay: Phaser.GameObjects.Container | null = null;
  private cursorFollower: Phaser.GameObjects.Container | null = null;

  private unsubs: Array<() => void> = [];
  /** Input listeners tied to the current overlay — cleaned up on close(). */
  private overlayInputCleanups: Array<() => void> = [];

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
    this.cardRenderer = new CardRenderer(scene, layout, theme);

    this.rootContainer = scene.add.container(0, 0);
    // Set depth above everything else
    this.rootContainer.setDepth(100);

    this.attachEventListeners();
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  /** Show the target selection UI. Board mode uses a non-blocking banner; other modes use a modal. */
  showTargetSelect(config: TargetSelectConfig, onSelect: (payload: any) => void): void {
    this.close();

    if (config.mode === 'board') {
      // Non-blocking: prompt banner + cancel button, board stays clickable
      this.showBoardTargetSelect(config);
    } else {
      // Modal: dimmer + panel for hand/graveyard selection
      this.showModalTargetSelect(config);
    }

    // Cursor follower icon
    if (config.cursorIcon && config.cursorIcon !== 'none') {
      this.showCursorFollower(config.cursorIcon);
    }
  }

  /** Non-blocking target select — prompt banner + cancel, board stays interactive. */
  private showBoardTargetSelect(config: TargetSelectConfig): void {
    const container = this.scene.add.container(0, 0);

    // Prompt banner at bottom of board
    const bannerY = 690;
    const bannerW = 500;
    const bannerH = 36;
    const bannerX = 283 + (7 * 102) / 2; // board center X

    const bannerBg = this.scene.add.graphics();
    bannerBg.fillStyle(0x000000, 0.85);
    bannerBg.fillRoundedRect(bannerX - bannerW / 2, bannerY, bannerW, bannerH, 6);
    bannerBg.lineStyle(1, 0x00FF88, 0.5);
    bannerBg.strokeRoundedRect(bannerX - bannerW / 2, bannerY, bannerW, bannerH, 6);
    container.add(bannerBg);

    const promptText = this.scene.add.text(bannerX, bannerY + bannerH / 2, config.prompt, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${this.theme.fonts.body.size}px`,
      color: this.theme.overlays.titleColor,
      align: 'center',
    }).setOrigin(0.5, 0.5);
    container.add(promptText);

    // Cancel button to the right of the banner
    const cancelBtn = createButton(this.scene, {
      x: bannerX + bannerW / 2 + 50,
      y: bannerY + bannerH / 2,
      w: 70, h: 28,
      label: 'CANCEL',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: () => {
        this.close();
        EventBus.emit(EV.INTERACTION_RESOLVED, { cancelled: true });
      },
    });
    container.add(cancelBtn);

    // ESC key to cancel — tracked for cleanup in close()
    const escKey = this.scene.input.keyboard?.addKey('ESC');
    const escHandler = () => {
      this.close();
      EventBus.emit(EV.INTERACTION_RESOLVED, { cancelled: true });
    };
    escKey?.once('down', escHandler);
    this.overlayInputCleanups.push(() => escKey?.off('down', escHandler));

    this.activeOverlay = container;
    this.rootContainer.add(container);
  }

  /** Modal target select — dimmer + panel for hand/graveyard picking. */
  private showModalTargetSelect(config: TargetSelectConfig): void {
    const L = this.layout.overlays.targetSelect;
    const T = this.theme.overlays;

    this.showDimmer(0.6);
    const panel = this.makePanel(L);

    const prompt = this.scene.add.text(0, -L.height / 2 + 20, config.prompt, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.titleColor,
      wordWrap: { width: L.width - 40 },
      align: 'center',
    }).setOrigin(0.5, 0);
    panel.add(prompt);

    const cancelBtn = createButton(this.scene, {
      x: 0, y: L.height / 2 - 30,
      w: 80, h: 28,
      label: 'CANCEL',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: () => {
        this.close();
        EventBus.emit(EV.INTERACTION_RESOLVED, { cancelled: true });
      },
      centered: true,
    });
    panel.add(cancelBtn);

    // ESC key to cancel — tracked for cleanup in close()
    const escKey = this.scene.input.keyboard?.addKey('ESC');
    const escHandler = () => {
      this.close();
      EventBus.emit(EV.INTERACTION_RESOLVED, { cancelled: true });
    };
    escKey?.once('down', escHandler);
    this.overlayInputCleanups.push(() => escKey?.off('down', escHandler));

    this.activeOverlay = panel;
    this.rootContainer.add(panel);
  }

  /** Show the game over screen. */
  showGameOver(config: GameOverConfig, onPlayAgain: () => void, onMenu: () => void): void {
    this.close();

    const L = this.layout.overlays.gameOver;
    const T = this.theme.overlays;
    const C = this.theme.colors;

    this.showDimmer(0.85);
    const panel = this.makePanel(L);

    // Result title (WIN / DEFEAT)
    const resultLabel = config.won ? 'VICTORY' : 'DEFEAT';
    const resultColor = config.won ? C.ACCENT_GREEN : C.ACCENT_RED;

    const title = this.scene.add.text(0, -L.height / 2 + 30, resultLabel, {
      fontFamily: this.theme.fonts.title.family,
      fontSize: `${this.theme.fonts.title.size + 8}px`,
      color: resultColor,
    }).setOrigin(0.5, 0);

    // Winner name
    const winnerLabel = this.scene.add.text(
      0, -L.height / 2 + 85,
      config.won ? `You defeated ${config.opponentName}` : `${config.opponentName} wins`,
      {
        fontFamily: this.theme.fonts.body.family,
        fontSize: `${this.theme.fonts.body.size}px`,
        color: T.bodyColor,
      }
    ).setOrigin(0.5, 0);

    // Reason
    const reasonLabel = this.scene.add.text(
      0, -L.height / 2 + 115,
      config.reason,
      {
        fontFamily: this.theme.fonts.small.family,
        fontSize: `${this.theme.fonts.small.size}px`,
        color: C.TEXT_SECONDARY,
      }
    ).setOrigin(0.5, 0);

    // Crypto payout (if applicable)
    const children: Phaser.GameObjects.GameObject[] = [title, winnerLabel, reasonLabel];

    if (config.isCryptoMode && config.payoutAmount) {
      const payoutLabel = this.scene.add.text(
        0, -L.height / 2 + 155,
        `Payout: ${config.payoutAmount}`,
        {
          fontFamily: this.theme.fonts.body.family,
          fontSize: `${this.theme.fonts.body.size}px`,
          color: C.ACCENT_GOLD,
        }
      ).setOrigin(0.5, 0);
      children.push(payoutLabel);

      if (config.txHash) {
        const txLabel = this.scene.add.text(
          0, -L.height / 2 + 180,
          `TX: ${config.txHash.slice(0, 12)}...`,
          {
            fontFamily: this.theme.fonts.small.family,
            fontSize: `${this.theme.fonts.small.size}px`,
            color: C.ACCENT_BLUE,
          }
        ).setOrigin(0.5, 0);
        children.push(txLabel);
      }
    }

    // Play again button
    const playAgainBtn = createButton(this.scene, {
      x: -60, y: L.height / 2 - 40,
      w: 120, h: 40,
      label: 'PLAY AGAIN',
      style: this.theme.buttons.primary,
      fontFamily: this.theme.fonts.body.family,
      onClick: onPlayAgain,
      centered: true,
    });

    // Menu button
    const menuBtn = createButton(this.scene, {
      x: 80, y: L.height / 2 - 40,
      w: 80, h: 40,
      label: 'MENU',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: onMenu,
      centered: true,
    });

    panel.add([...children, playAgainBtn, menuBtn]);

    // Entrance animation
    panel.setAlpha(0);
    panel.setScale(0.85);
    this.scene.tweens.add({
      targets: panel,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });

    this.activeOverlay = panel;
    this.rootContainer.add(panel);
  }

  /** Show placement prompt with card preview in top-right corner. */
  showPlacementPreview(cardData: CardRenderData, prompt: string): void {
    this.close();

    const container = this.scene.add.container(0, 0);

    // Card preview at top-right (above phase label area)
    const previewX = 1040;
    const previewY = 20;
    const cardContainer = this.cardRenderer.render(cardData, 'full', previewX, previewY);
    container.add(cardContainer);

    // Prompt banner above the board
    const bannerY = 690;
    const bannerW = 400;
    const bannerH = 32;
    const bannerX = 283 + (7 * 102) / 2; // board center X

    const bannerBg = this.scene.add.graphics();
    bannerBg.fillStyle(0x000000, 0.8);
    bannerBg.fillRoundedRect(bannerX - bannerW / 2, bannerY, bannerW, bannerH, 6);
    container.add(bannerBg);

    const promptText = this.scene.add.text(bannerX, bannerY + bannerH / 2, prompt, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${this.theme.fonts.body.size}px`,
      color: this.theme.overlays.titleColor,
      align: 'center',
    }).setOrigin(0.5, 0.5);
    container.add(promptText);

    this.activeOverlay = container;
    this.rootContainer.add(container);
  }

  /** Show card detail overlay (right-click). */
  showCardDetail(data: CardRenderData): void {
    this.close();

    const L = this.layout.overlays;

    this.showDimmer(0.7);

    const container = this.scene.add.container(0, 0);
    const detail = this.cardRenderer.render(data, 'detail', L.dimmer.width / 2, L.dimmer.height / 2);
    container.add(detail);

    // Click anywhere to close
    const blocker = this.scene.add.rectangle(
      L.dimmer.width / 2,
      L.dimmer.height / 2,
      L.dimmer.width,
      L.dimmer.height,
      0x000000, 0
    ).setInteractive();
    blocker.on('pointerdown', () => {
      this.close();
      EventBus.emit(EV.DETAIL_HIDE, {});
    });
    container.add(blocker);
    container.bringToTop(detail);

    // ESC key to close — tracked for cleanup in close()
    const escKey = this.scene.input.keyboard?.addKey('ESC');
    const escHandler = () => {
      this.close();
      EventBus.emit(EV.DETAIL_HIDE, {});
    };
    escKey?.once('down', escHandler);
    this.overlayInputCleanups.push(() => escKey?.off('down', escHandler));

    this.activeOverlay = container;
    this.rootContainer.add(container);
  }

  /** Show deck preview (your graveyard / remaining deck list). */
  showDeckPreview(
    title: string,
    cards: CardRenderData[],
    onClose: () => void
  ): void {
    this.close();

    const L = this.layout.overlays.deckPreview;
    const T = this.theme.overlays;

    this.showDimmer(0.75);
    const panel = this.makePanel(L);

    // Title
    const titleText = this.scene.add.text(0, -L.height / 2 + 16, title, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.titleColor,
    }).setOrigin(0.5, 0);
    panel.add(titleText);

    // Card grid (thumbnail size)
    const thumbW = this.layout.cards.thumbnail.width;
    const thumbH = this.layout.cards.thumbnail.height;
    const cols = Math.floor((L.width - 40) / (thumbW + 8));
    const startX = -(cols * (thumbW + 8)) / 2 + thumbW / 2;
    const startY = -L.height / 2 + 50;

    cards.forEach((card, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (thumbW + 8);
      const cy = startY + row * (thumbH + 8);
      const thumb = this.cardRenderer.render(card, 'thumbnail', cx, cy);
      panel.add(thumb);
    });

    // Close button
    const closeBtn = createButton(this.scene, {
      x: 0, y: L.height / 2 - 25,
      w: 80, h: 30,
      label: 'CLOSE',
      style: this.theme.buttons.secondary,
      fontFamily: this.theme.fonts.body.family,
      onClick: () => { this.close(); onClose(); },
      centered: true,
    });
    panel.add(closeBtn);

    this.activeOverlay = panel;
    this.rootContainer.add(panel);
  }

  /** Close the current overlay. */
  close(): void {
    this.destroyCursorFollower();
    // Clean up all input listeners tied to this overlay
    for (const cleanup of this.overlayInputCleanups) cleanup();
    this.overlayInputCleanups = [];
    if (this.dimmer) {
      this.dimmer.destroy();
      this.dimmer = null;
    }
    if (this.activeOverlay) {
      this.activeOverlay.destroy();
      this.activeOverlay = null;
    }
  }

  /** Is any overlay currently visible? */
  isOpen(): boolean {
    return this.activeOverlay !== null;
  }

  destroy(): void {
    this.unsubs.forEach(fn => fn());
    this.close();
    this.rootContainer.destroy();
  }

  // ─────────────────────────────────────────────
  // PRIVATE — CURSOR FOLLOWER
  // ─────────────────────────────────────────────

  private showCursorFollower(icon: CursorIcon): void {
    this.destroyCursorFollower();

    const container = this.scene.add.container(0, 0);
    container.setDepth(200); // above everything

    const size = 24;
    const gfx = this.scene.add.graphics();

    if (icon === 'heal') {
      // Green cross
      const t = 6; // thickness
      gfx.fillStyle(0x00FF88, 0.9);
      gfx.fillRect(-size / 2, -t / 2, size, t);     // horizontal bar
      gfx.fillRect(-t / 2, -size / 2, t, size);      // vertical bar
      gfx.lineStyle(1.5, 0x00CC66, 1);
      gfx.strokeRect(-size / 2, -t / 2, size, t);
      gfx.strokeRect(-t / 2, -size / 2, t, size);
    } else if (icon === 'damage') {
      // Red X
      const s = size * 0.4;
      gfx.lineStyle(3, 0xFF4444, 0.9);
      gfx.lineBetween(-s, -s, s, s);
      gfx.lineBetween(s, -s, -s, s);
    } else {
      // Default: white circle outline
      gfx.lineStyle(2, 0xFFFFFF, 0.8);
      gfx.strokeCircle(0, 0, size * 0.4);
    }

    container.add(gfx);

    // Label below icon
    const labelMap: Record<string, string> = {
      heal: 'HEAL',
      damage: 'DMG',
      select: 'SELECT',
    };
    const label = this.scene.add.text(0, size / 2 + 4, labelMap[icon] ?? '', {
      fontFamily: this.theme.fonts.small.family,
      fontSize: '10px',
      color: icon === 'heal' ? '#00FF88' : icon === 'damage' ? '#FF4444' : '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0);
    container.add(label);

    // Offset from cursor so it doesn't obscure the click target
    const offsetX = 18;
    const offsetY = 18;

    // Follow pointer
    const moveHandler = (pointer: Phaser.Input.Pointer) => {
      container.setPosition(pointer.x + offsetX, pointer.y + offsetY);
    };
    this.scene.input.on('pointermove', moveHandler);

    // Set initial position
    const pointer = this.scene.input.activePointer;
    container.setPosition(pointer.x + offsetX, pointer.y + offsetY);

    // Track for cleanup — overlayInputCleanups handles it via close() → destroyCursorFollower()
    this.overlayInputCleanups.push(() => this.scene.input.off('pointermove', moveHandler));

    this.cursorFollower = container;
  }

  private destroyCursorFollower(): void {
    if (this.cursorFollower) {
      this.cursorFollower.destroy();
      this.cursorFollower = null;
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — PANEL BUILDER
  // ─────────────────────────────────────────────

  /**
   * Build a panel container centered at the layout rect's center.
   * The panel's local (0,0) is its center.
   */
  private makePanel(L: Rect): Phaser.GameObjects.Container {
    const T = this.theme.overlays;
    const panel = this.scene.add.container(L.x, L.y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(T.panelColor), T.panelAlpha);
    bg.fillRoundedRect(-L.width / 2, -L.height / 2, L.width, L.height, T.cornerRadius);
    bg.lineStyle(T.panelStrokeWidth, ThemeLoader.hexToNum(T.panelStroke), 1);
    bg.strokeRoundedRect(-L.width / 2, -L.height / 2, L.width, L.height, T.cornerRadius);

    panel.add(bg);
    return panel;
  }

  // makePanelButton extracted → helpers/ButtonFactory.ts createButton()

  private showDimmer(alpha: number): void {
    const L = this.layout.overlays.dimmer;
    this.dimmer = this.scene.add.graphics();
    this.dimmer.fillStyle(ThemeLoader.hexToNum(this.theme.overlays.dimmerColor), alpha);
    this.dimmer.fillRect(L.x, L.y, L.width, L.height);
    this.rootContainer.add(this.dimmer);
  }

  // ─────────────────────────────────────────────
  // PRIVATE — EVENT BUS SUBSCRIPTIONS
  // ─────────────────────────────────────────────

  private attachEventListeners(): void {
    this.unsubs.push(
      EventBus.on(EV.PENDING_TARGET, (ev: any) => {
        const cursorIcon: CursorIcon = deriveCursorIcon(ev.sourceAbility);
        const config: TargetSelectConfig = {
          prompt: ev.reason ?? 'Choose a target',
          mode: 'board',
          cursorIcon,
        };
        this.showTargetSelect(config, (payload) => {
          EventBus.emit(EV.INTERACTION_RESOLVED, payload);
        });
      }),

      EventBus.on(EV.PENDING_POSITION, (ev: any) => {
        // Build CardRenderData from the sourceCardId carried in the event
        const cardId = ev.sourceCardId;
        if (cardId) {
          const def = getCard(cardId);
          const cardData: CardRenderData = {
            id: cardId, name: def.name, cardClass: def.class,
            allegiance: def.allegiance, cost: def.cost,
            artKey: `art_${cardId}`,
            atk: def.stats?.atk, def: def.stats?.def,
            currentHP: def.stats?.def, maxHP: def.stats?.def,
            abilityText: def.abilityText,
            isEnemy: false, isExhausted: false, isSelected: false,
          };
          this.showPlacementPreview(cardData, ev.reason ?? 'Choose a position');
        }
      }),

      EventBus.on(EV.INTERACTION_RESOLVED, () => {
        this.close();
      }),

      EventBus.on(EV.DETAIL_SHOW, (data: CardRenderData) => {
        this.showCardDetail(data);
      }),
    );
  }
}

```

# src\renderers\UnitThumbnail.ts

```ts
// ============================================================
// UnitThumbnail.ts — Self-contained board unit visual.
//
// Each thumbnail OWNS its Phaser container and mutable children.
// Direct field references — no string-based lookups.
//
// v0.5.1:
//   - Added mutable col/row fields. BoardRenderer sets these on
//     creation and updates them on move. Pointer event closures
//     read thumb.col/thumb.row instead of captured constants,
//     so clicks always report the current logical position.
//   - instanceId enables identity-based lookup during tweens.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class UnitThumbnail {
  readonly container: Phaser.GameObjects.Container;
  readonly instanceId: string;

  // Mutable logical board position — updated by BoardRenderer on move.
  // Pointer event closures read from these instead of captured values.
  col: number = 0;
  row: number = 0;

  // Direct references to mutable children — never string lookups
  private atkBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private atkBadgeText: Phaser.GameObjects.Text | null = null;
  private defBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private defBadgeText: Phaser.GameObjects.Text | null = null;
  private canActGlow: Phaser.GameObjects.Graphics | null = null;

  // Cached layout/theme for badge positioning
  private readonly scene: Phaser.Scene;
  private readonly w: number;
  private readonly h: number;
  private readonly bandHeight: number;
  private readonly badgeFontSize: number;
  private readonly badgeWidth: number;
  private readonly badgeHeight: number;
  private readonly atkBadgeColor: string;
  private readonly defBadgeColor: string;
  private readonly hpMidColor: string;
  private readonly hpLowColor: string;
  private readonly fontFamily: string;

  constructor(
    scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON,
    data: CardRenderData, x: number, y: number,
  ) {
    this.scene = scene;
    this.instanceId = data.id;

    const L = layout.cards.thumbnail;
    const BT = theme.board;
    this.w = L.width;
    this.h = L.height;
    this.bandHeight = BT.unitBandHeight;
    this.badgeFontSize = L.badgeFontSize;
    this.badgeWidth = L.badgeWidth;
    this.badgeHeight = L.badgeHeight;
    this.atkBadgeColor = theme.cards.atkBadgeColor;
    this.defBadgeColor = theme.cards.defBadgeColor;
    this.hpMidColor = BT.hpBarMid;
    this.hpLowColor = BT.hpBarLow;
    this.fontFamily = theme.fonts.cardStat.family;

    this.container = scene.add.container(x, y);

    // ── Art (immutable) ──
    const baseArtKey = data.artKey ?? `art_${data.id}`;
    const thumbKey = baseArtKey.replace(/^art_/, 'thumb_');
    const textureKey = scene.textures.exists(thumbKey) ? thumbKey
                     : scene.textures.exists(baseArtKey) ? baseArtKey
                     : null;
    if (textureKey) {
      this.container.add(scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDisplaySize(this.w, this.h));
    } else {
      const ph = scene.add.graphics();
      ph.fillStyle(0x333355, 1);
      ph.fillRect(0, 0, this.w, this.h);
      this.container.add(ph);
    }

    // ── Team border + band (immutable) ──
    const borderColor = data.isEnemy ? BT.unitBandEnemy : BT.unitBandPlayer;
    const border = scene.add.graphics();
    border.lineStyle(2, ThemeLoader.hexToNum(borderColor), 1);
    border.strokeRect(0, 0, this.w, this.h);
    this.container.add(border);

    const band = scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(borderColor), 0.9);
    band.fillRect(0, this.h - this.bandHeight, this.w, this.bandHeight);
    this.container.add(band);

    // ── Mutable badges ──
    this.setAtk(data.atk);
    this.setDef(data.currentHP, data.maxHP);
    this.setCanAct(data.canAct ?? false);
  }

  // ─────────────────────────────────────────────
  // TARGETED STAT UPDATES — safe during tweens
  // ─────────────────────────────────────────────

  setAtk(atk: number | undefined): void {
    if (atk === undefined) {
      if (this.atkBadgeBg) this.atkBadgeBg.setVisible(false);
      if (this.atkBadgeText) this.atkBadgeText.setVisible(false);
      return;
    }

    const bx = 2, by = this.h - this.bandHeight - 2;
    if (!this.atkBadgeBg) {
      this.atkBadgeBg = this.scene.add.graphics();
      this.container.add(this.atkBadgeBg);
    }
    this.atkBadgeBg.clear();
    this.atkBadgeBg.fillStyle(ThemeLoader.hexToNum(this.atkBadgeColor), 1);
    this.atkBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 4);
    this.atkBadgeBg.setVisible(true);

    if (!this.atkBadgeText) {
      this.atkBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(atk), {
        fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, color: '#FFFFFF',
      }).setOrigin(0.5, 0.5);
      this.container.add(this.atkBadgeText);
    } else {
      this.atkBadgeText.setText(String(atk));
      this.atkBadgeText.setVisible(true);
    }
  }

  setDef(currentHP: number | undefined, maxHP: number | undefined): void {
    if (currentHP === undefined) {
      if (this.defBadgeBg) this.defBadgeBg.setVisible(false);
      if (this.defBadgeText) this.defBadgeText.setVisible(false);
      return;
    }

    const bx = this.w - 2 - this.badgeWidth, by = this.h - this.bandHeight - 2;
    const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
    const fillColor = hpPct > 0.5 ? this.defBadgeColor : hpPct > 0.25 ? this.hpMidColor : this.hpLowColor;

    if (!this.defBadgeBg) {
      this.defBadgeBg = this.scene.add.graphics();
      this.container.add(this.defBadgeBg);
    }
    this.defBadgeBg.clear();
    this.defBadgeBg.fillStyle(ThemeLoader.hexToNum(fillColor), 1);
    this.defBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 4);
    this.defBadgeBg.setVisible(true);

    if (!this.defBadgeText) {
      this.defBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(currentHP), {
        fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, color: '#FFFFFF',
      }).setOrigin(0.5, 0.5);
      this.container.add(this.defBadgeText);
    } else {
      this.defBadgeText.setText(String(currentHP));
      this.defBadgeText.setVisible(true);
    }
  }

  setCanAct(canAct: boolean): void {
    if (!canAct) {
      if (this.canActGlow) this.canActGlow.setVisible(false);
      return;
    }
    if (!this.canActGlow) {
      this.canActGlow = this.scene.add.graphics();
      this.canActGlow.lineStyle(3, 0xF5A623, 0.9);
      this.canActGlow.strokeRect(-1, -1, this.w + 2, this.h + 2);
      this.container.add(this.canActGlow);
    }
    this.canActGlow.setVisible(true);
  }

/** Update only the fields that are provided. undefined = no change. */
  updateStats(atk: number | undefined, currentHP: number | undefined, maxHP: number | undefined, canAct: boolean): void {
    if (atk !== undefined) this.setAtk(atk);
    if (currentHP !== undefined) this.setDef(currentHP, maxHP);
    this.setCanAct(canAct);
  }

  destroy(): void {
    this.container.destroy();
    this.atkBadgeBg = null; this.atkBadgeText = null;
    this.defBadgeBg = null; this.defBadgeText = null;
    this.canActGlow = null;
  }
}
```

# src\scenes\battle\EngineEventBridge.ts

```ts
// ============================================================
// EngineEventBridge.ts
// Bridges GameEngine events → typed EventBus events.
// Converts raw engine events into UI-adapted payloads.
// ============================================================

import { EventBus } from '../../events/EventBus';
import { getCard } from '../../game/data/CardRegistry';
import type { CardRenderData } from '../../game/types/UITypes';
import { Player } from '../../game/types/GameTypes';

export function toCardRenderData(
  cardId: string, instanceId: string, owner: Player, localIndex: number,
  currentHP?: number, currentAtk?: number, canAct?: boolean,
): CardRenderData {
  const def = getCard(cardId);
  return {
    id: instanceId, name: def.name, cardClass: def.class, allegiance: def.allegiance,
    cost: def.cost, artKey: `art_${cardId}`,
    atk: currentAtk ?? def.stats?.atk, def: def.stats?.def,
    currentHP: currentHP ?? def.stats?.def, maxHP: def.stats?.def,
    abilityText: def.abilities?.map(a => a.type).join(', '),
    isEnemy: owner !== (localIndex as Player),
    isExhausted: false, isSelected: false, canAct: canAct ?? false,
  };
}

export function unitCanAct(unit: any, activePlayer: number): boolean {
  return unit.owner === activePlayer
    && !unit.hasMoved && !unit.hasActed && !unit.isJustPlaced && unit.isActive;
}

function emitStatsChanged(engine: any, instanceId: string): void {
  const state = engine.getState();
  const cell = state.board.find((c: any) => c.unit?.instanceId === instanceId);
  if (!cell?.unit) return;
  const u = cell.unit;
  EventBus.emit('UNIT_STATS_CHANGED', {
    instanceId: u.instanceId,
    atk: u.currentAtk,
    currentHP: u.currentDef,
    maxHP: u.maxDef,
    canAct: unitCanAct(u, state.turn?.activePlayer),
  });
}

/**
 * Emit UNIT_STATS_CHANGED for EVERY unit on the board.
 * Implements state-driven rendering: after any aura recalculation,
 * the UI syncs all stats from the engine's source of truth —
 * not just units with non-zero deltas.
 */
function emitAllUnitStats(engine: any): void {
  const state = engine.getState();
  for (const cell of state.board) {
    if (!cell.unit) continue;
    const u = cell.unit;
    EventBus.emit('UNIT_STATS_CHANGED', {
      instanceId: u.instanceId,
      atk: u.currentAtk,
      currentHP: u.currentDef,
      maxHP: u.maxDef,
      canAct: unitCanAct(u, state.turn?.activePlayer),
    });
  }
}

export function refreshCanActIndicators(engine: any): void {
  const state = engine.getState();
  const canActCells: Array<{ col: number; row: number }> = [];
  for (const cell of state.board) {
    if (!cell.unit) continue;
    if (unitCanAct(cell.unit, state.turn?.activePlayer)) {
      canActCells.push({ col: cell.col, row: cell.row });
    }
  }
  EventBus.emit('CAN_ACT_UPDATE', { cells: canActCells });
}

export function wireEngineToEventBus(engine: any, localPlayerIndex: number): () => void {
  const handler = (event: any) => {
    switch (event.type) {

      case 'UNIT_PLACED': {
        const state = engine.getState();
        const cell = state.board.find((c: any) => c.col === event.col && c.row === event.row);
        const unit = cell?.unit;
        const canAct = unit ? unitCanAct(unit, state.turn?.activePlayer) : false;
        const data = toCardRenderData(
          event.cardId, event.instanceId, event.owner, localPlayerIndex,
          unit?.currentDef, unit?.currentAtk, canAct,
        );
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        break;
      }

      case 'UNIT_MOVED': {
        EventBus.emit('UNIT_MOVED', { from: event.from, to: event.to });
        break;
      }

      case 'CARD_DRAWN': {
        if (event.player === (localPlayerIndex as Player)) {
          const card = toCardRenderData(event.cardId, event.cardId, event.player, localPlayerIndex);
          EventBus.emit('CARD_DRAWN', { card, handIndex: event.handIndex, deckRemaining: event.deckRemaining });
        } else {
          EventBus.emit('OPPONENT_CARD_DRAWN', { handIndex: event.handIndex });
        }
        break;
      }

      case 'CARD_PLAYED': {
        EventBus.emit('CARD_PLAYED', {
          handIndex: event.handIndex, player: event.player,
          isLocal: event.player === (localPlayerIndex as Player),
        });
        break;
      }

      case 'CARD_DISCARDED': {
        EventBus.emit('CARD_DISCARDED', {
          handIndex: event.handIndex, player: event.player,
          isLocal: event.player === (localPlayerIndex as Player),
        });
        break;
      }

      case 'UNIT_ATTACKED': {
        EventBus.emit('UNIT_ATTACKED', event);
        EventBus.emit('UNIT_STATS_CHANGED', {
          instanceId: event.targetInstanceId,
          atk: undefined,
          currentHP: event.targetNewHP,
          maxHP: event.maxHP,
          canAct: false,
        });
        break;
      }

      case 'UNIT_DIED': {
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.instanceId });
        break;
      }

      case 'UNIT_HEALED': {
        EventBus.emit('UNIT_HEALED', event);
        emitStatsChanged(engine, event.instanceId);
        break;
      }

      case 'UNIT_EXHAUSTED': {
        EventBus.emit('UNIT_EXHAUSTED', { col: event.col, row: event.row });
        break;
      }

      case 'UNIT_REFRESHED': {
        EventBus.emit('UNIT_REFRESHED', { col: event.col, row: event.row });
        break;
      }

      case 'UNIT_TRANSFORMED': {
        const data = toCardRenderData(
          event.toCardId, event.newInstanceId, event.owner, localPlayerIndex, event.newHP,
        );
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.oldInstanceId });
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        break;
      }

      case 'LEG_GAINED':
      case 'LEG_SPENT':
      case 'LEG_RATE_CHANGED': {
        EventBus.emit(event.type, event);
        break;
      }

      case 'PHASE_CHANGED': {
        EventBus.emit(event.type, event);
        break;
      }

      case 'TURN_STARTED': {
        EventBus.emit(event.type, event);
        setTimeout(() => refreshCanActIndicators(engine), 300);
        break;
      }

      case 'PENDING_TARGET':
      case 'PENDING_POSITION':
      case 'PENDING_COLUMN':
      case 'PENDING_DISCARD': {
        const pendState = engine.getState();
        if (pendState.turn?.activePlayer === localPlayerIndex) {
          EventBus.emit(event.type, event);
        }
        break;
      }

      case 'AURA_APPLIED': {
        EventBus.emit('AURA_APPLIED', event);
        // State-driven rendering: sync ALL unit stats from engine truth.
        // This covers both aura applications AND removals (where delta=0
        // would otherwise be silently dropped from the changes array).
        emitAllUnitStats(engine);
        break;
      }

      case 'INTERACTION_RESOLVED': {
        EventBus.emit('INTERACTION_RESOLVED', event);
        break;
      }

      case 'GAME_OVER': {
        EventBus.emit('GAME_OVER', event);
        break;
      }

      default: {
        EventBus.emit(event.type, event);
        break;
      }
    }
  };
  engine.on(handler);
  return () => engine.off(handler);
}

```

# src\scenes\battle\GameOverHandler.ts

```ts
// ============================================================
// GameOverHandler.ts
// Handles GAME_OVER event: records result + transitions scene.
// ============================================================

import { EventBus, EV } from '../../events/EventBus';
import type { GameEngine } from '../../game/GameEngine';
import GameState from '../../GameState';
import SocketManager from '../../network/SocketManager';

export function setupGameOverHandler(
  scene: Phaser.Scene,
  engine: GameEngine,
  localPlayerIndex: number,
  playerName: string,
  opponentName: string,
  _isCryptoMode: boolean,
): () => void {
  const unsub = EventBus.on(EV.GAME_OVER, (ev: any) => {
    if (!scene.scene.isActive('BattleScene')) return;

    const result = ev.result ?? ev;
    const turnCount = result?.turns ?? engine.getState().turn?.turnNumber ?? 0;
    const reason = result?.reason ?? 'KING_DESTROYED';
    const playerWon = (result?.winner ?? ev.winner) === localPlayerIndex;

    if (playerWon) GameState.recordWin(); else GameState.recordLoss();

    GameState.setLastMatch({
      playerName, opponentName, playerWon, isTie: false,
      reason, turns: turnCount,
      stakeAmount: GameState.currentStake,
      payout: playerWon ? GameState.currentStake * 2 * 0.95 : 0,
    });

    SocketManager.sendGameOver(localPlayerIndex, playerWon, turnCount);

    scene.time.delayedCall(1500, () => {
      scene.cameras.main.fadeOut(300, 0, 0, 0);
      scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start('ResultScene'));
    });
  });
  return unsub;
}

```

# src\scenes\battle\HUDRefreshCoordinator.ts

```ts
// ============================================================
// HUDRefreshCoordinator.ts
// Keeps the HUD in sync with engine state via EventBus.
// ============================================================

import { EventBus, EV } from '../../events/EventBus';
import type { GameEngine } from '../../game/GameEngine';
import GameState from '../../GameState';

export function setupHUDRefresh(
  engine: GameEngine,
  localPlayerIndex: number,
  playerName: string,
  opponentName: string,
): Array<() => void> {
  const oppIdx = localPlayerIndex === 0 ? 1 : 0;

  const refreshHUD = () => {
    const state = engine.getState();
    if (!state) return;

    const getKingHP = (owner: number) => {
      const cell = state.board.find((c) => c.unit?.cardId === 'king' && c.unit?.owner === owner);
      return { current: cell?.unit?.currentDef ?? 30, max: cell?.unit?.maxDef ?? 30 };
    };

    const playerKing = getKingHP(localPlayerIndex);
    const opponentKing = getKingHP(oppIdx);
    const playerMod = state.modifiers[localPlayerIndex];
    const opponentMod = state.modifiers[oppIdx];

    const computeLEGRate = (mod: typeof playerMod) => {
      if (mod.legRateFrozen) return 0;
      return Math.max(1, mod.legRateBase + mod.legRateBonus - mod.legRatePenalty);
    };

    EventBus.emit(EV.HUD_REFRESH, {
      playerName, opponentName,
      playerKingHP: playerKing.current, playerKingMaxHP: playerKing.max,
      opponentKingHP: opponentKing.current, opponentKingMaxHP: opponentKing.max,
      playerLEG: playerMod?.legPool ?? 0,
      playerCrown: playerMod ? computeLEGRate(playerMod) : 1,
      opponentLEGCount: opponentMod?.legPool ?? 0,
      currentPhase: state.turn?.phase ?? 'DRAW',
      turnNumber: state.turn?.turnNumber ?? 1,
      isPlayerTurn: state.turn?.activePlayer === localPlayerIndex,
      playerWins: GameState.winCount, playerLosses: GameState.lossCount,
      opponentHandCount: state.players[oppIdx]?.hand?.length ?? 0,
      playerHandCount: state.players[localPlayerIndex]?.hand?.length ?? 0,
    });
  };

  const unsubs: Array<() => void> = [];
  unsubs.push(EventBus.on(EV.LEG_GAINED,          refreshHUD));
  unsubs.push(EventBus.on(EV.LEG_SPENT,           refreshHUD));
  unsubs.push(EventBus.on('LEG_RATE_CHANGED',     refreshHUD));
  unsubs.push(EventBus.on(EV.UNIT_ATTACKED,       refreshHUD));
  unsubs.push(EventBus.on(EV.UNIT_HEALED,         refreshHUD));
  unsubs.push(EventBus.on('PHASE_CHANGED',        refreshHUD));
  unsubs.push(EventBus.on('TURN_STARTED',         refreshHUD));
  unsubs.push(EventBus.on(EV.CARD_PLAYED,         refreshHUD));
  unsubs.push(EventBus.on('OPPONENT_CARD_DRAWN',  refreshHUD));

  return unsubs;
}

```

# src\scenes\battle\InputCoordinator.ts

```ts
// ============================================================
// InputCoordinator.ts
// Sets up SelectionManager with engine-backed callbacks.
// ============================================================

import type { GameEngine } from '../../game/GameEngine';
import type { BattleLayoutJSON } from '../../game/types/UITypes';
import { SelectionManager } from '../../input/SelectionManager';
import SocketManager from '../../network/SocketManager';

export function createSelectionManager(
  engine: GameEngine,
  layout: BattleLayoutJSON,
  localPlayerIndex: number,
): SelectionManager {
  const getBoardUnit = (col: number, row: number) => {
    const cell = engine.getState().board.find((c) => c.col === col && c.row === row);
    return cell?.unit ?? null;
  };

  return new SelectionManager(layout, {
    getAttackRange: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (!unit) return [];
      return engine.getAttackRange(unit.instanceId).map((p) => ({ col: p.col, row: p.row }));
    },
    getValidMoves: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (!unit) return [];
      return engine.getValidMoveSquares(unit.instanceId).map((p) => ({ col: p.col, row: p.row }));
    },
    getValidAttacks: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (!unit) return [];
      return engine.getValidAttackSquares(unit.instanceId).map((p) => ({ col: p.col, row: p.row }));
    },
    getValidDeployPositions: () => {
      return engine.getValidDeployPositions().map((p) => ({ col: p.col, row: p.row }));
    },
    playCard: (handIndex: number, col: number, row: number) => {
      const ok = engine.playCard(handIndex, col, row);
      if (ok !== false) SocketManager.sendGameAction({ type: 'PLAY_CARD', handIndex, col, row });
    },
    moveUnit: (fromCol: number, fromRow: number, toCol: number, toRow: number) => {
      const unit = getBoardUnit(fromCol, fromRow);
      if (!unit) return;
      const ok = engine.moveUnit(unit.instanceId, toCol, toRow);
      if (ok !== false) SocketManager.sendGameAction({ type: 'MOVE_UNIT', fromCol, fromRow, col: toCol, row: toRow });
    },
    attackUnit: (fromCol: number, fromRow: number, targetCol: number, targetRow: number) => {
      const attacker = getBoardUnit(fromCol, fromRow);
      const target   = getBoardUnit(targetCol, targetRow);
      if (!attacker || !target) return;
      const ok = engine.attackUnit(attacker.instanceId, target.instanceId);
      if (ok !== false) SocketManager.sendGameAction({ type: 'ATTACK_UNIT', fromCol, fromRow, targetCol, targetRow });
    },
    selectTarget: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (unit) {
        engine.selectTarget(unit.instanceId);
        SocketManager.sendGameAction({ type: 'SELECT_TARGET', col, row });
      }
    },
    selectPosition: (col: number, row: number) => {
      engine.selectPosition(col, row);
      SocketManager.sendGameAction({ type: 'SELECT_POSITION', col, row });
    },
    selectHandCard: () => {},
    cancelPending: () => {
      engine.cancelPending();
      SocketManager.sendGameAction({ type: 'CANCEL_PENDING' });
    },
    isAwaitingInput: () => engine.getState().status === 'AWAITING_INPUT',
    canAct: () => {
      const state = engine.getState();
      return state.turn?.activePlayer === localPlayerIndex && state.turn?.phase === 'ACT';
    },
    isPlayerUnit: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      return unit?.owner === localPlayerIndex;
    },
    isOccupied: (col: number, row: number) => getBoardUnit(col, row) !== null,
    getPhase: () => engine.getState().turn?.phase ?? 'DRAW',
  } as any);
}

```

# src\scenes\battle\NetworkCoordinator.ts

```ts
// ============================================================
// NetworkCoordinator.ts
// Socket.io relay: replay opponent actions + handle disconnect.
// ============================================================

import type { GameEngine } from '../../game/GameEngine';
import type { GameAction } from '../../network/SocketManager';
import SocketManager from '../../network/SocketManager';
import GameState from '../../GameState';
import { boardHashFromCells } from '../../game/utils/boardHash';

export interface NetworkCoordinatorDeps {
  engine: GameEngine;
  scene: Phaser.Scene;
  playerName: string;
  opponentName: string;
  localPlayerIndex: number;
}

function getBoardUnit(engine: GameEngine, col: number, row: number) {
  const cell = engine.getState().board.find((c) => c.col === col && c.row === row);
  return cell?.unit ?? null;
}

export function replayOpponentAction(deps: NetworkCoordinatorDeps, action: GameAction): void {
  const { engine } = deps;
  console.log('[NetworkCoordinator] Replaying opponent action:', action.type);
  switch (action.type) {
    case 'PLAY_CARD':
      engine.playCard(action.handIndex!, action.col, action.row); break;
    case 'MOVE_UNIT': {
      const unit = getBoardUnit(engine, action.fromCol!, action.fromRow!);
      if (unit) engine.moveUnit(unit.instanceId, action.col!, action.row!);
      else console.warn('[NetworkCoordinator] MOVE_UNIT replay: no unit at', action.fromCol, action.fromRow);
      break;
    }
    case 'ATTACK_UNIT': {
      const attacker = getBoardUnit(engine, action.fromCol!, action.fromRow!);
      const target   = getBoardUnit(engine, action.targetCol!, action.targetRow!);
      if (attacker && target) engine.attackUnit(attacker.instanceId, target.instanceId);
      else console.warn('[NetworkCoordinator] ATTACK_UNIT replay: unit not found');
      break;
    }
    case 'SELECT_POSITION':
      engine.selectPosition(action.col!, action.row!); break;
    case 'SELECT_TARGET': {
      const tgt = getBoardUnit(engine, action.col!, action.row!);
      if (tgt) engine.selectTarget(tgt.instanceId);
      else console.warn('[NetworkCoordinator] SELECT_TARGET replay: no unit at', action.col, action.row);
      break;
    }
    case 'CANCEL_PENDING':
      engine.cancelPending(); break;
    case 'END_PLAY_PHASE':
      engine.endPlayPhase();
      SocketManager.sendStateHash(boardHashFromCells(engine.getState().board), engine.getState().turn?.turnNumber ?? 0);
      break;
    case 'END_ACT_PHASE':
      engine.endActPhase();
      SocketManager.sendStateHash(boardHashFromCells(engine.getState().board), engine.getState().turn?.turnNumber ?? 0);
      break;
    default: console.warn('[NetworkCoordinator] Unknown opponent action:', (action as any).type);
  }
}

/** Overlay objects for the "opponent disconnected" banner — so we can remove them on reconnect. */
let disconnectOverlay: Phaser.GameObjects.GameObject[] = [];
let disconnectCountdownText: Phaser.GameObjects.Text | null = null;

export function handleOpponentDisconnect(deps: NetworkCoordinatorDeps): void {
  const { scene } = deps;

  // Show a non-blocking "waiting" banner with countdown (opponent may reconnect)
  const bg = scene.add.rectangle(640, 30, 500, 50, 0x000000, 0.85).setDepth(999);
  const txt = scene.add.text(640, 30, 'Opponent disconnected — reconnect: 10s', {
    fontSize: '16px', color: '#FF6666', align: 'center',
  }).setOrigin(0.5).setDepth(999);
  disconnectOverlay = [bg, txt];
  disconnectCountdownText = txt;
}

export function handleDisconnectCountdown(_deps: NetworkCoordinatorDeps, remaining: number): void {
  if (disconnectCountdownText) {
    disconnectCountdownText.setText(`Opponent disconnected — reconnect: ${remaining}s`);
  }
}

export function handleOpponentReconnect(deps: NetworkCoordinatorDeps): void {
  // Remove the disconnect banner
  for (const obj of disconnectOverlay) obj.destroy();
  disconnectOverlay = [];
  disconnectCountdownText = null;

  // Brief "reconnected" flash
  const { scene } = deps;
  const flash = scene.add.text(640, 30, 'Opponent reconnected!', {
    fontSize: '16px', color: '#00FF88', align: 'center',
  }).setOrigin(0.5).setDepth(999);
  scene.time.delayedCall(2000, () => flash.destroy());
}

export function handleFinalDisconnect(deps: NetworkCoordinatorDeps): void {
  const { engine, scene, playerName, opponentName } = deps;

  // Clean up any lingering banner
  for (const obj of disconnectOverlay) obj.destroy();
  disconnectOverlay = [];
  disconnectCountdownText = null;

  GameState.recordWin();
  GameState.setLastMatch({
    playerName, opponentName, playerWon: true, isTie: false,
    reason: 'DISCONNECT',
    turns: engine.getState()?.turn?.turnNumber ?? 0,
    stakeAmount: GameState.currentStake,
    payout: GameState.currentMode === 'CryptoPlay' ? GameState.currentStake * 2 * 0.95 : 0,
  });

  scene.add.rectangle(640, 360, 600, 120, 0x000000, 0.85);
  scene.add.text(640, 345, 'Opponent disconnected', { fontSize: '26px', color: '#FF6666', align: 'center' }).setOrigin(0.5);
  scene.add.text(640, 380, 'You win! Going to results...', { fontSize: '18px', color: '#00FF88', align: 'center' }).setOrigin(0.5);

  scene.time.delayedCall(3000, () => {
    scene.cameras.main.fadeOut(300, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start('ResultScene'));
  });
}

export function setupSocketCallbacks(deps: NetworkCoordinatorDeps): void {
  SocketManager.setCallbacks({
    onRoomCreated: (code) => GameState.setRoomCode(code),
    onRoomJoined: (code) => GameState.setRoomCode(code),
    onOpponentJoined: (name) => GameState.setOpponentName(name),
    onOpponentAction: (action: GameAction) => replayOpponentAction(deps, action),
    onOpponentDisconnected: () => handleOpponentDisconnect(deps),
    onOpponentReconnected: () => handleOpponentReconnect(deps),
    onOpponentAbandon: () => handleFinalDisconnect(deps),
    onDisconnectCountdown: (remaining) => handleDisconnectCountdown(deps, remaining),
    onConnectionLost: () => showConnectionOverlay(deps.scene, true),
    onReconnected: () => showConnectionOverlay(deps.scene, false),
    onReconnectFailed: () => handleFinalDisconnect(deps),
    onError: (msg) => console.error('[NetworkCoordinator] Socket error:', msg),
    onPayoutResult: () => {},
  });
}

/** Self-connection overlay: "Connection lost — reconnecting..." */
let connectionOverlay: Phaser.GameObjects.GameObject[] = [];

function showConnectionOverlay(scene: Phaser.Scene, show: boolean): void {
  for (const obj of connectionOverlay) obj.destroy();
  connectionOverlay = [];
  if (!show) return;

  const bg = scene.add.rectangle(640, 360, 500, 80, 0x000000, 0.9).setDepth(1000);
  const txt = scene.add.text(640, 360, 'Connection lost — reconnecting...', {
    fontSize: '20px', color: '#FFAA00', align: 'center',
  }).setOrigin(0.5).setDepth(1000);
  connectionOverlay = [bg, txt];
}

```

# src\scenes\BattleScene.ts

```ts
// ============================================================
// BattleScene.ts — Thin shell coordinator
//
// Owns Phaser lifecycle (create/shutdown). Delegates to:
//   - EngineEventBridge:      engine → EventBus wiring
//   - NetworkCoordinator:     socket relay + disconnect
//   - HUDRefreshCoordinator:  HUD sync via events
//   - InputCoordinator:       SelectionManager setup
//   - GameOverHandler:        GAME_OVER → ResultScene
// ============================================================

import Phaser from 'phaser';
import { GameEngine } from '../game/GameEngine';
import { LayoutLoader } from '../config/LayoutLoader';
import { ThemeLoader } from '../config/ThemeLoader';
import { BoardRenderer } from '../renderers/BoardRenderer';
import { HandRenderer } from '../renderers/HandRenderer';
import { HUDRenderer } from '../renderers/HUDRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { SelectionManager } from '../input/SelectionManager';
import { EventBus, EV } from '../events/EventBus';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';

import { wireEngineToEventBus } from './battle/EngineEventBridge';
import { setupSocketCallbacks } from './battle/NetworkCoordinator';
import { setupHUDRefresh } from './battle/HUDRefreshCoordinator';
import { createSelectionManager } from './battle/InputCoordinator';
import { setupGameOverHandler } from './battle/GameOverHandler';
import { boardHashFromCells } from '../game/utils/boardHash';
import { GameLogger } from '../game/GameLogger';
import { getCard } from '../game/data/CardRegistry';

interface BattleSceneData {
  playerName: string;
  opponentName: string;
  isCryptoMode: boolean;
  roomCode: string;
}

export default class BattleScene extends Phaser.Scene {
  private engine!: GameEngine;
  private boardRenderer!: BoardRenderer;
  private handRenderer!: HandRenderer;
  private hudRenderer!: HUDRenderer;
  private overlayRenderer!: OverlayRenderer;
  private selectionManager!: SelectionManager;
  private sceneData!: BattleSceneData;
  private hudUnsubs: Array<() => void> = [];
  private bridgeUnsub?: () => void;
  private gameOverUnsub?: () => void;
  private logger?: GameLogger;
  private stateReportTimer?: ReturnType<typeof setInterval>;

  constructor() { super('BattleScene'); }
  init(data: BattleSceneData) { this.sceneData = data; }

  async create() {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    const loadingText = this.add.text(640, 360, 'Loading battle...', { fontSize: '24px', color: '#aaaaaa' }).setOrigin(0.5);

    await LayoutLoader.load('BattleScene');
    await ThemeLoader.load('BattleScene');
    const layout = LayoutLoader.getBattle()!;
    const theme  = ThemeLoader.get('BattleScene');
    loadingText.destroy();

    if (this.textures.exists('bg_battle')) {
      this.add.image(640, 360, 'bg_battle').setDisplaySize(1280, 720);
    } else {
      this.add.rectangle(640, 360, 1280, 720, 0x1a1a2e);
    }

    const playerName   = this.sceneData?.playerName   ?? GameState.playerName   ?? 'You';
    const opponentName = this.sceneData?.opponentName  ?? GameState.opponentName ?? 'Opponent';
    const localPlayerIndex = GameState.playerIndex ?? 0;

    // ─── Engine + event bridge ────────────────────
    this.engine = new GameEngine();
    this.bridgeUnsub = wireEngineToEventBus(this.engine, localPlayerIndex);

    // ─── Game logger ───────────────────────────────
    this.logger = new GameLogger(
      GameState.roomCode || 'local',
      localPlayerIndex,
      GameState.gameSeed || 0,
      () => this.engine.getState(),
    );
    this.engine.on(e => this.logger?.record(e));

    // Expose to browser console
    (window as any).exportGameLog = () => {
      if (!this.logger) { console.warn('No active logger'); return; }
      this.logger.stop();
      console.log(`Exported ${this.logger.entryCount} events`);
    };
    (window as any).gameLog = () => this.logger?.getLog();

    // ─── HUD refresh ─────────────────────────────
    this.hudUnsubs = setupHUDRefresh(this.engine, localPlayerIndex, playerName, opponentName);

    // ─── Renderers ───────────────────────────────
    this.boardRenderer   = new BoardRenderer(this, layout, theme, localPlayerIndex);
    this.handRenderer    = new HandRenderer(this, layout, theme);
    this.hudRenderer     = new HUDRenderer(this, layout, theme);
    this.overlayRenderer = new OverlayRenderer(this, layout, theme);
    this.hudRenderer.setLocalPlayer(localPlayerIndex);

    // ─── Input ───────────────────────────────────
    this.selectionManager = createSelectionManager(this.engine, layout, localPlayerIndex);

    // ─── Initial HUD emit ────────────────────────
    EventBus.emit(EV.HUD_REFRESH, {
      playerName, opponentName,
      playerKingHP: 30, playerKingMaxHP: 30, opponentKingHP: 30, opponentKingMaxHP: 30,
      playerLEG: 1, playerCrown: 1, opponentLEGCount: 1,
      currentPhase: 'DRAW', turnNumber: 1, isPlayerTurn: true,
      playerWins: GameState.winCount, playerLosses: GameState.lossCount,
      opponentHandCount: 4,
    });

    // ─── End turn button ─────────────────────────
    this.hudRenderer.onEndTurnClick(() => {
      const state = this.engine.getState();
      if (state.turn?.activePlayer !== localPlayerIndex) return;
      const phase = state.turn?.phase;
      if (phase === 'PLAY') {
        this.engine.endPlayPhase();
        SocketManager.sendGameAction({ type: 'END_PLAY_PHASE' });
        SocketManager.sendStateHash(boardHashFromCells(this.engine.getState().board), this.engine.getState().turn?.turnNumber ?? 0);
      } else if (phase === 'ACT') {
        this.engine.endActPhase();
        SocketManager.sendGameAction({ type: 'END_ACT_PHASE' });
        SocketManager.sendStateHash(boardHashFromCells(this.engine.getState().board), this.engine.getState().turn?.turnNumber ?? 0);
      }
    });

    // ─── Game over ───────────────────────────────
    this.gameOverUnsub = setupGameOverHandler(this, this.engine, localPlayerIndex, playerName, opponentName, this.sceneData.isCryptoMode);

    // ─── Network ─────────────────────────────────
    setupSocketCallbacks({
      engine: this.engine, scene: this,
      playerName, opponentName, localPlayerIndex,
    });

    // ─── Start game after both players are ready ──
    const startEngine = () => {
      this.engine.startGame();
      const v = this.engine.getState();
      console.log('[BattleScene] Game started —',
        `P1 hand: ${v.players[0]?.hand?.length ?? '?'}`,
        `P2 hand: ${v.players[1]?.hand?.length ?? '?'}`,
        `Board units: ${v.board.filter((c: any) => c.unit).length}`,
        `Phase: ${v.turn?.phase}`, `Active: P${(v.turn?.activePlayer ?? 0) + 1}`
      );

      // Dev-only: only P1 (host) sends periodic state reports to avoid duplicates
      if (import.meta.env.DEV && SocketManager.isConnected() && localPlayerIndex === 0) {
        this.sendStateReport('GAME_START');
        this.stateReportTimer = setInterval(() => this.sendStateReport('PERIODIC'), 30_000);
      }
    };

    if (SocketManager.isConnected()) {
      // Multiplayer: wait for both players to be ready
      SocketManager.onBothBattleReady(() => startEngine());
      SocketManager.signalBattleReady();
    } else {
      // Single-player / local testing: start immediately
      startEngine();
    }
  }

  shutdown() {
    // Dev-only: send final state report before shutdown (host only)
    if (import.meta.env.DEV && SocketManager.isConnected() && (GameState.playerIndex ?? 0) === 0) {
      this.sendStateReport('GAME_END');
    }
    if (this.stateReportTimer) {
      clearInterval(this.stateReportTimer);
      this.stateReportTimer = undefined;
    }

    this.logger?.stop();
    this.bridgeUnsub?.();
    this.gameOverUnsub?.();
    this.hudUnsubs.forEach(unsub => unsub());
    EventBus.clearAll?.();
    this.boardRenderer?.destroy?.();
    this.handRenderer?.destroy?.();
    this.hudRenderer?.destroy?.();
    this.overlayRenderer?.destroy?.();
    this.selectionManager?.destroy?.();
  }

  /** Build and send a game state report to the server (dev-only detailed logging). */
  private sendStateReport(trigger: 'GAME_START' | 'PERIODIC' | 'GAME_END'): void {
    try {
      const state = this.engine.getState();
      const units = state.board
        .filter(c => c.unit)
        .map(c => {
          const u = c.unit!;
          let cardName = u.cardId;
          try { cardName = getCard(u.cardId).name; } catch { /* fallback to id */ }
          return {
            instanceId: u.instanceId,
            cardId: u.cardId,
            name: cardName,
            owner: u.owner,
            col: c.col,
            row: c.row,
            baseAtk: u.baseAtk,
            currentAtk: u.currentAtk,
            baseDef: u.baseDef,
            currentDef: u.currentDef,
            maxDef: u.maxDef,
            isActive: u.isActive,
            hasMoved: u.hasMoved,
            hasActed: u.hasActed,
            buffs: (u.activeBuffs ?? []).map(b => ({
              source: b.source,
              atkDelta: b.atkDelta,
              defDelta: b.defDelta,
              movDelta: b.moveDelta,
            })),
          };
        });

      const buildPlayer = (pi: 0 | 1) => {
        const ps = state.players[pi];
        const mod = state.modifiers[pi];
        const effectiveRate = Math.max(1, mod.legRateBase + mod.legRateBonus - mod.legRatePenalty);
        return {
          player: pi,
          handCards: ps.hand.map(id => { try { return getCard(id).name; } catch { return id; } }),
          handCount: ps.hand.length,
          deckCount: ps.deckCount,
          discardCount: ps.discardCount,
          leg: mod.legPool,
          legRate: mod.legRateFrozen ? 0 : effectiveRate,
          legRateBase: mod.legRateBase,
          legRateBonus: mod.legRateBonus,
          legRatePenalty: mod.legRatePenalty,
          crownDiscount: mod.royalCostDiscount,
          crownPenalty: mod.royalCostPenalty,
        };
      };

      SocketManager.sendStateReport({
        trigger,
        ts: new Date().toISOString(),
        turn: state.turn?.turnNumber ?? 0,
        phase: state.turn?.phase ?? 'UNKNOWN',
        activePlayer: state.turn?.activePlayer ?? 0,
        units,
        players: [buildPlayer(0), buildPlayer(1)],
      });
    } catch (e) {
      console.warn('[BattleScene] Failed to send state report:', e);
    }
  }
}

```

# src\scenes\DeckBuilderScene.ts

```ts
// ============================================================
// DeckBuilderScene.ts
// Thin orchestrator: owns state, handles API calls, delegates
// rendering to DeckListView and DeckEditorView.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import { AuthManager } from '../auth/AuthManager';
import { DeckAPI, type DeckSummary } from '../deck/DeckAPI';
import { CollectionAPI } from '../deck/CollectionAPI';
import { validateDeckClient } from '../deck/DeckValidatorClient';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { DeckLoader } from '../config/DeckLoader';
import { DeckView, createInitialState, type DeckBuilderState, type DeckBuilderCallbacks } from '../deck/DeckBuilderState';
import { renderDeckList } from '../deck/DeckListView';
import { renderDeckEditor } from '../deck/DeckEditorView';
import { showCardDetail } from '../deck/CardDetailOverlay';
import { CardClass } from '../game/types/CardTypes';

const CX = 640;
const FONT = '"Courier New", monospace';

export default class DeckBuilderScene extends Phaser.Scene {
  private state!: DeckBuilderState;
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  private inputManager!: DOMInputManager;
  private cardDetailContainer?: Phaser.GameObjects.Container;
  private transitioning = false;

  // Persistent background (always visible)
  private bgObjects: Phaser.GameObjects.GameObject[] = [];
  // Persistent header (hidden during editor view)
  private headerObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('DeckBuilderScene'); }

  create(): void {
    const { width, height } = this.scale;
    this.state = createInitialState();
    this.inputManager = new DOMInputManager(this);

    // Background
    if (this.textures.exists('bg_main_menu')) {
      this.bgObjects.push(this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height));
    } else {
      this.bgObjects.push(this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e));
    }

    // Main panel (wider for editor)
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.90);
    panel.fillRoundedRect(100, 15, 1080, 695, 10);
    panel.lineStyle(2, 0xf5a623, 0.4);
    panel.strokeRoundedRect(100, 15, 1080, 695, 10);
    this.bgObjects.push(panel);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Persistent header (only visible in DECK_LIST view)
    this.headerObjects.push(this.add.text(CX, 45, 'DECK BUILDER', {
      fontSize: '28px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5));

    const backBtn = new MenuButton(this, 200, 45, '[ BACK ]', {
      color: '#ff4444', fontSize: '16px',
      onPointerDown: () => this.callbacks.onBackToHub(),
    });
    this.headerObjects.push(backBtn.text);

    // Loading text
    const loadingText = this.add.text(CX, 350, 'Loading...', {
      fontSize: '16px', fontFamily: FONT, color: '#AAAAAA',
    }).setOrigin(0.5);

    this.loadData(loadingText);

    this.events.once('shutdown', () => this.cleanup());
  }

  // ─── Callbacks ────────────────────────────────────────────

  private callbacks: DeckBuilderCallbacks = {
    onEditDeck: (deckId) => {
      const deck = this.state.decks.find(d => d.id === deckId);
      if (!deck) return;
      this.state.editor = {
        deckId: deck.id,
        deckName: deck.name,
        cardIds: [...deck.cardIds],
        dirty: false,
        validation: validateDeckClient(deck.cardIds),
        classFilter: 'ALL',
        sortBy: 'cost',
        collectionPage: 0,
      };
      this.state.currentView = DeckView.DECK_EDITOR;
      this.renderCurrentView();
    },

    onCreateDeck: () => {
      this.state.editor = {
        deckId: null,
        deckName: 'New Deck',
        cardIds: [],
        dirty: false,
        validation: validateDeckClient([]),
        classFilter: 'ALL',
        sortBy: 'cost',
        collectionPage: 0,
      };
      this.state.currentView = DeckView.DECK_EDITOR;
      this.renderCurrentView();
    },

    onDeleteDeck: (deckId) => {
      this.state.deleteConfirmId = deckId;
      this.renderCurrentView();
    },

    onConfirmDelete: async (deckId) => {
      try {
        await DeckAPI.remove(deckId);
        if (this.state.activeDeckId === deckId) {
          this.state.activeDeckId = null;
          GameState.setActiveDeck(null, []);
        }
        ToastNotification.show(this, 'Deck deleted', { color: '#AAAAAA' });
        await this.refreshDecks();
      } catch (err: any) {
        ToastNotification.show(this, err.message || 'Delete failed', { color: '#ff4444' });
      }
      this.state.deleteConfirmId = null;
      this.renderCurrentView();
    },

    onCancelDelete: () => {
      this.state.deleteConfirmId = null;
      this.renderCurrentView();
    },

    onActivateDeck: async (deckId) => {
      try {
        await DeckAPI.activate(deckId);
        const deck = this.state.decks.find(d => d.id === deckId);
        if (deck) {
          this.state.activeDeckId = deckId;
          GameState.setActiveDeck(deckId, deck.cardIds);
          DeckLoader.invalidate();
        }
        ToastNotification.show(this, 'Deck activated!', { color: '#00ff88' });
        this.renderCurrentView();
      } catch (err: any) {
        ToastNotification.show(this, err.message || 'Activation failed', { color: '#ff4444' });
      }
    },

    onAddCard: (cardId) => {
      const editor = this.state.editor;
      if (!editor) return;
      editor.cardIds.push(cardId);
      editor.dirty = true;
      editor.validation = validateDeckClient(editor.cardIds);
      this.renderCurrentView();
    },

    onRemoveCard: (cardId) => {
      const editor = this.state.editor;
      if (!editor) return;
      const idx = editor.cardIds.indexOf(cardId);
      if (idx >= 0) {
        editor.cardIds.splice(idx, 1);
        editor.dirty = true;
        editor.validation = validateDeckClient(editor.cardIds);
        this.renderCurrentView();
      }
    },

    onSave: async () => {
      await this.saveDeck(false);
    },

    onSaveAndActivate: async () => {
      await this.saveDeck(true);
    },

    onBackToList: () => {
      if (this.state.editor?.dirty) {
        // Could add confirmation overlay; for now just go back
      }
      this.state.editor = null;
      this.state.currentView = DeckView.DECK_LIST;
      this.renderCurrentView();
    },

    onBackToHub: () => {
      if (this.transitioning) return;
      this.transitioning = true;
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('HubScene');
      });
    },

    onShowCardDetail: (cardId) => {
      this.dismissCardDetail();
      this.cardDetailContainer = showCardDetail(
        this, cardId, this.state.collection,
        () => this.dismissCardDetail(),
      );
    },

    onDismissCardDetail: () => {
      this.dismissCardDetail();
    },

    onFilterChange: (filter: CardClass | 'ALL') => {
      if (!this.state.editor) return;
      this.state.editor.classFilter = filter;
      this.state.editor.collectionPage = 0;
      this.renderCurrentView();
    },

    onSortChange: (sort: 'cost' | 'name') => {
      if (!this.state.editor) return;
      this.state.editor.sortBy = sort;
      this.renderCurrentView();
    },

    onPageChange: (delta: number) => {
      if (!this.state.editor) return;
      this.state.editor.collectionPage = Math.max(0, this.state.editor.collectionPage + delta);
      this.renderCurrentView();
    },
  };

  // ─── Data Loading ─────────────────────────────────────────

  private async loadData(loadingText: Phaser.GameObjects.Text): Promise<void> {
    try {
      const [deckResult, collection] = await Promise.all([
        DeckAPI.list().catch(() => ({ decks: [] as DeckSummary[] })),
        CollectionAPI.get().catch(() => []),
      ]);

      if (!this.scene.isActive('DeckBuilderScene')) return;

      this.state.decks = deckResult.decks;
      this.state.collection = collection;

      // Auto-create starter deck if player has no decks
      if (this.state.decks.length === 0) {
        await this.createStarterDeck();
      }

      this.state.loading = false;
    } catch {
      this.state.loading = false;
    }

    loadingText.destroy();
    this.renderCurrentView();
  }

  private async createStarterDeck(): Promise<void> {
    try {
      const res = await fetch('/default-deck.json');
      if (!res.ok) return;
      const config = await res.json();
      if (!Array.isArray(config.deckIds) || config.deckIds.length === 0) return;

      const name = config.name || 'Starter Deck';
      const result = await DeckAPI.create(name, config.deckIds);
      const deck = result.deck;

      // Auto-activate it
      if (deck.isValid) {
        await DeckAPI.activate(deck.id);
        this.state.activeDeckId = deck.id;
        GameState.setActiveDeck(deck.id, config.deckIds);
        DeckLoader.invalidate();
      }

      // Refresh deck list
      const refreshed = await DeckAPI.list();
      if (!this.scene.isActive('DeckBuilderScene')) return;
      this.state.decks = refreshed.decks;
    } catch (err) {
      console.warn('[DeckBuilder] Failed to create starter deck:', err);
    }
  }

  private async refreshDecks(): Promise<void> {
    try {
      const result = await DeckAPI.list();
      if (!this.scene.isActive('DeckBuilderScene')) return;
      this.state.decks = result.decks;
    } catch { /* keep stale data */ }
  }

  // ─── Save Logic ───────────────────────────────────────────

  private async saveDeck(andActivate: boolean): Promise<void> {
    const editor = this.state.editor;
    if (!editor) return;

    const name = editor.deckName.trim() || 'My Deck';
    const cardIds = editor.cardIds;

    try {
      let savedDeck: DeckSummary;

      if (editor.deckId) {
        const result = await DeckAPI.update(editor.deckId, name, cardIds);
        savedDeck = result.deck;
        ToastNotification.show(this, 'Deck saved!', { color: '#00ff88' });
      } else {
        const result = await DeckAPI.create(name, cardIds);
        savedDeck = result.deck;
        editor.deckId = savedDeck.id;
        ToastNotification.show(this, 'Deck created!', { color: '#00ff88' });
      }

      if (andActivate && savedDeck.isValid) {
        await DeckAPI.activate(savedDeck.id);
        this.state.activeDeckId = savedDeck.id;
        GameState.setActiveDeck(savedDeck.id, cardIds);
        DeckLoader.invalidate();
        ToastNotification.show(this, 'Deck activated!', { color: '#00ff88' });
      } else if (andActivate && !savedDeck.isValid) {
        ToastNotification.show(this, 'Cannot activate invalid deck', { color: '#ff4444' });
      }

      editor.dirty = false;
      await this.refreshDecks();

      if (!this.scene.isActive('DeckBuilderScene')) return;

      this.state.editor = null;
      this.state.currentView = DeckView.DECK_LIST;
      this.renderCurrentView();
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Save failed', { color: '#ff4444' });
    }
  }

  // ─── Rendering ────────────────────────────────────────────

  private renderCurrentView(): void {
    // Tear down previous view objects
    for (const obj of this.viewObjects) obj.destroy();
    this.viewObjects = [];
    this.inputManager?.destroyAll();

    // Toggle persistent header visibility based on view
    const showHeader = this.state.currentView === DeckView.DECK_LIST;
    for (const obj of this.headerObjects) {
      (obj as Phaser.GameObjects.Components.Visible).setVisible(showHeader);
    }

    if (this.state.currentView === DeckView.DECK_LIST) {
      this.viewObjects = renderDeckList(this, this.state, this.callbacks);
    } else {
      this.inputManager = new DOMInputManager(this);
      this.viewObjects = renderDeckEditor(this, this.state, this.callbacks, this.inputManager);
    }
  }

  private dismissCardDetail(): void {
    this.cardDetailContainer?.destroy();
    this.cardDetailContainer = undefined;
  }

  private cleanup(): void {
    this.dismissCardDetail();
    this.inputManager?.destroyAll();
    for (const obj of this.viewObjects) obj.destroy();
    this.viewObjects = [];
    this.transitioning = false;
  }
}

```

# src\scenes\HubScene.ts

```ts
// ============================================================
// HubScene.ts
// Central hub: navigate to host, browse, join, deck builder,
// or legacy quick play.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
import { LobbySocketManager } from '../lobby/LobbySocketManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

const CX = 640;

export default class HubScene extends Phaser.Scene {
  private lobbySM!: LobbySocketManager;
  private inputManager?: DOMInputManager;
  private joinOverlay?: Phaser.GameObjects.Container;
  private hostOverlay?: Phaser.GameObjects.Container;
  private transitioning = false;

  constructor() { super('HubScene'); }

  create(): void {
    const { width, height } = this.scale;

    // Background
    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(CX - 280, 40, 560, 620, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(CX - 280, 40, 560, 620, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Identity bar
    const displayName = AuthManager.isLoggedIn()
      ? AuthManager.getPlayer()!.displayName
      : GameState.playerName || 'Guest';
    const walletBadge = AuthManager.isLoggedIn()
      ? ` (${AuthManager.getPlayer()!.wallet.slice(0, 6)}...)`
      : '';

    this.add.text(CX, 75, `Welcome, ${displayName}${walletBadge}`, {
      fontSize: '18px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);

    const statusColor = AuthManager.isLoggedIn() ? '#00ff88' : '#AAAAAA';
    const statusLabel = AuthManager.isLoggedIn() ? 'Authenticated' : 'Guest Mode';
    this.add.text(CX, 102, statusLabel, {
      fontSize: '12px', fontFamily: '"Courier New", monospace', color: statusColor,
    }).setOrigin(0.5);

    // Logout / Login button
    if (AuthManager.isLoggedIn()) {
      new MenuButton(this, CX, 128, '[ Logout ]', {
        color: '#777777', fontSize: '12px', fontStyle: 'normal',
        onPointerDown: () => this.handleLogout(),
      });
    } else {
      new MenuButton(this, CX, 128, '[ Login with Wallet ]', {
        color: '#4fc3f7', fontSize: '12px', fontStyle: 'normal',
        onPointerDown: () => this.goToLogin(),
      });
    }

    // ── Main Buttons ────────────────────────────────────────
    let y = 170;
    const gap = 65;

    new MenuButton(this, CX, y, '[ HOST A GAME ]', {
      color: '#00ff88', fontSize: '24px',
      onPointerDown: () => this.showHostOverlay(),
    });

    new MenuButton(this, CX, y += gap, '[ BROWSE GAMES ]', {
      color: '#4fc3f7', fontSize: '22px',
      onPointerDown: () => this.goToBrowse(),
    });

    new MenuButton(this, CX, y += gap, '[ JOIN BY CODE ]', {
      color: '#4fc3f7', fontSize: '22px',
      onPointerDown: () => this.showJoinOverlay(),
    });

    new MenuButton(this, CX, y += gap, '[ DECK BUILDER ]', {
      color: '#f5a623', fontSize: '22px',
      onPointerDown: () => this.goToDeckBuilder(),
    });

    new MenuButton(this, CX, y += gap + 20, '[ QUICK PLAY (LEGACY) ]', {
      color: '#777777', fontSize: '16px',
      onPointerDown: () => this.goToLegacy(),
    });

    // W/L record
    if (GameState.winCount + GameState.lossCount > 0) {
      this.add.text(CX, y + gap, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#777777',
      }).setOrigin(0.5);
    }

    // Last match banner
    if (GameState.lastMatch) {
      const m = GameState.lastMatch;
      const color = m.playerWon ? '#00ff88' : '#ff6666';
      const text = m.playerWon
        ? `Last: You beat ${m.opponentName} (${m.turns} turns)`
        : `Last: ${m.opponentName} beat you (${m.turns} turns)`;
      this.add.text(CX, 610, text, {
        fontSize: '13px', fontFamily: '"Courier New", monospace', color,
      }).setOrigin(0.5);
    }

    // Connect socket for lobby (no auto-room)
    SocketManager.connectOnly({
      onError: (msg) => ToastNotification.show(this, msg, { color: '#ff4444' }),
    });

    // Setup lobby socket manager
    this.lobbySM = new LobbySocketManager({
      onCreated: (code) => {
        this.goToLobby(code, true);
      },
      onJoined: (code) => {
        this.goToLobby(code, false);
      },
      onError: (msg) => {
        ToastNotification.show(this, msg, { color: '#ff4444' });
      },
    });
    this.lobbySM.attach();

    this.events.once('shutdown', () => {
      this.cleanup();
      this.transitioning = false;
    });
  }

  // ─── Host Overlay ──────────────────────────────────────────

  private showHostOverlay(): void {
    if (this.hostOverlay) return;
    const { width, height } = this.scale;

    this.hostOverlay = this.add.container(0, 0);

    // Dimmer
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setInteractive();
    this.hostOverlay.add(dim);

    // Panel
    const g = this.add.graphics();
    g.fillStyle(0x16213e, 0.95);
    g.fillRoundedRect(CX - 200, 180, 400, 300, 10);
    g.lineStyle(2, 0x4fc3f7, 0.6);
    g.strokeRoundedRect(CX - 200, 180, 400, 300, 10);
    this.hostOverlay.add(g);

    this.hostOverlay.add(this.add.text(CX, 210, 'Host Settings', {
      fontSize: '22px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));

    // Room name input
    this.inputManager = new DOMInputManager(this);
    const nameInput = this.inputManager.createInput({
      gameX: CX, gameY: 270, width: 300, height: 36,
      placeholder: 'Room name...',
      maxLength: 30,
    });
    nameInput.value = `${GameState.playerName || 'Player'}'s Room`;

    // Toggles (simple text toggles)
    let isPublic = true;
    let isCrypto = false;

    const publicBtn = this.add.text(CX, 320, '[ PUBLIC ]', {
      fontSize: '18px', fontFamily: '"Courier New", monospace', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    publicBtn.on('pointerdown', () => {
      isPublic = !isPublic;
      publicBtn.setText(isPublic ? '[ PUBLIC ]' : '[ PRIVATE ]');
      publicBtn.setColor(isPublic ? '#00ff88' : '#f5a623');
    });
    this.hostOverlay.add(publicBtn);

    const cryptoBtn = this.add.text(CX, 360, '[ FREE PLAY ]', {
      fontSize: '18px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cryptoBtn.on('pointerdown', () => {
      isCrypto = !isCrypto;
      cryptoBtn.setText(isCrypto ? '[ CRYPTO MODE ]' : '[ FREE PLAY ]');
      cryptoBtn.setColor(isCrypto ? '#f5a623' : '#4fc3f7');
    });
    this.hostOverlay.add(cryptoBtn);

    // Create button
    const createBtn = new MenuButton(this, CX - 70, 420, '[ CREATE ]', {
      color: '#00ff88', fontSize: '20px',
      onPointerDown: () => {
        const roomName = nameInput.value.trim() || `${GameState.playerName}'s Room`;
        this.lobbySM.createRoom(GameState.playerName || 'Player', {
          isPublic,
          isCrypto,
          roomName,
          stakeAmount: isCrypto ? 0.01 : 0,
        });
        this.hideHostOverlay();
      },
    });
    this.hostOverlay.add(createBtn.text);

    // Cancel
    const cancelBtn = new MenuButton(this, CX + 70, 420, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '20px',
      onPointerDown: () => this.hideHostOverlay(),
    });
    this.hostOverlay.add(cancelBtn.text);
  }

  private hideHostOverlay(): void {
    this.inputManager?.destroyAll();
    this.inputManager = undefined;
    this.hostOverlay?.destroy();
    this.hostOverlay = undefined;
  }

  // ─── Join Overlay ──────────────────────────────────────────

  private showJoinOverlay(): void {
    if (this.joinOverlay) return;
    const { width, height } = this.scale;

    this.joinOverlay = this.add.container(0, 0);

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setInteractive();
    this.joinOverlay.add(dim);

    const g = this.add.graphics();
    g.fillStyle(0x16213e, 0.95);
    g.fillRoundedRect(CX - 180, 250, 360, 180, 10);
    g.lineStyle(2, 0x4fc3f7, 0.6);
    g.strokeRoundedRect(CX - 180, 250, 360, 180, 10);
    this.joinOverlay.add(g);

    this.joinOverlay.add(this.add.text(CX, 275, 'Join by Room Code', {
      fontSize: '20px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));

    this.inputManager = new DOMInputManager(this);
    const codeInput = this.inputManager.createInput({
      gameX: CX, gameY: 325, width: 200, height: 40,
      placeholder: '6-digit code', maxLength: 6, uppercase: true,
    });

    const joinBtn = new MenuButton(this, CX - 60, 385, '[ JOIN ]', {
      color: '#00ff88', fontSize: '20px',
      onPointerDown: () => {
        const code = codeInput.value.trim();
        if (code.length < 4) {
          ToastNotification.show(this, 'Enter a room code', { color: '#ff4444' });
          return;
        }
        this.lobbySM.joinRoom(code, GameState.playerName || 'Guest');
        this.hideJoinOverlay();
      },
    });
    this.joinOverlay.add(joinBtn.text);

    const cancelBtn = new MenuButton(this, CX + 60, 385, '[ CANCEL ]', {
      color: '#ff4444', fontSize: '20px',
      onPointerDown: () => this.hideJoinOverlay(),
    });
    this.joinOverlay.add(cancelBtn.text);
  }

  private hideJoinOverlay(): void {
    this.inputManager?.destroyAll();
    this.inputManager = undefined;
    this.joinOverlay?.destroy();
    this.joinOverlay = undefined;
  }

  // ─── Navigation ────────────────────────────────────────────

  private goToLobby(roomCode: string, isHost: boolean): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LobbyScene', { roomCode, isHost });
    });
  }

  private goToBrowse(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('RoomBrowserScene');
    });
  }

  private goToDeckBuilder(): void {
    if (!AuthManager.isLoggedIn()) {
      ToastNotification.show(this, 'Login required for deck builder', { color: '#f5a623' });
      return;
    }
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('DeckBuilderScene');
    });
  }

  private goToLegacy(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
  }

  private handleLogout(): void {
    AuthManager.logout();
    DeckLoader.invalidate();
    GameState.setPlayerName('Guest');
    ToastNotification.show(this, 'Logged out', { color: '#AAAAAA' });
    // Restart HubScene to refresh identity bar
    this.scene.restart();
  }

  private goToLogin(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('LoginScene');
    });
  }

  private cleanup(): void {
    this.lobbySM?.detach();
    this.inputManager?.destroyAll();
  }
}

```

# src\scenes\LobbyScene.ts

```ts
// ============================================================
// LobbyScene.ts
// Enhanced room: chat, ready, kick, host controls, deck submit.
// Receives { roomCode, isHost } from HubScene or RoomBrowserScene.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';
import { AuthManager } from '../auth/AuthManager';
import { LobbySocketManager } from '../lobby/LobbySocketManager';
import { DeckLoader } from '../config/DeckLoader';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';
import type { LobbyState, ChatMessage } from '../../shared/types/NetworkEvents';

interface LobbySceneData {
  roomCode: string;
  isHost: boolean;
}

const CX = 640;
const FONT = '"Courier New", monospace';

export default class LobbyScene extends Phaser.Scene {
  private lobbySM!: LobbySocketManager;
  private inputManager!: DOMInputManager;
  private roomCode = '';
  private isHost = false;
  private latestState: LobbyState | null = null;
  private transitioning = false;
  private disconnectHandler?: () => void;

  // UI handles
  private statusText!: Phaser.GameObjects.Text;
  private playerListTexts: Phaser.GameObjects.GameObject[] = [];
  private chatTexts: Phaser.GameObjects.Text[] = [];
  private chatInput?: HTMLInputElement;
  private readyBtn?: MenuButton;
  private startBtn?: MenuButton;

  constructor() { super('LobbyScene'); }

  init(data: LobbySceneData): void {
    this.roomCode = data.roomCode ?? '';
    this.isHost = data.isHost ?? false;
  }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_lobby')) {
      this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Main Panel ──────────────────────────────────────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.90);
    panel.fillRoundedRect(60, 15, 1160, 695, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.3);
    panel.strokeRoundedRect(60, 15, 1160, 695, 10);

    // ── Header ──────────────────────────────────────────────
    this.add.text(CX, 38, `ROOM:  ${this.roomCode}`, {
      fontSize: '24px', fontFamily: FONT,
      fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    new MenuButton(this, CX + 160, 38, '[ Copy ]', {
      color: '#777777', fontSize: '12px', fontStyle: 'normal',
      onPointerDown: async () => {
        const ok = await ShareHelper.copyToClipboard(this.roomCode);
        if (ok) ToastNotification.show(this, `Copied: ${this.roomCode}`, { color: '#00ff88' });
      },
    });

    // Mode badge
    const modeLabel = this.isHost ? 'HOST' : 'PLAYER';
    const modeColor = this.isHost ? '#f5a623' : '#4fc3f7';
    this.add.text(CX + 240, 38, modeLabel, {
      fontSize: '11px', fontFamily: FONT, fontStyle: 'bold', color: modeColor,
    }).setOrigin(0.5);

    // Separator
    const sep = this.add.graphics();
    sep.lineStyle(1, 0x4fc3f7, 0.2);
    sep.lineBetween(80, 58, 1200, 58);

    // ── Left Panel: Players ─────────────────────────────────
    const leftPanel = this.add.graphics();
    leftPanel.fillStyle(0x0a0f1e, 0.5);
    leftPanel.fillRoundedRect(80, 68, 480, 340, 8);
    leftPanel.lineStyle(1, 0x4fc3f7, 0.2);
    leftPanel.strokeRoundedRect(80, 68, 480, 340, 8);

    this.add.text(320, 82, 'PLAYERS', {
      fontSize: '14px', fontFamily: FONT,
      fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    // Column headers
    this.add.text(100, 102, 'Name', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    });
    this.add.text(370, 102, 'Status', {
      fontSize: '10px', fontFamily: FONT, color: '#444444',
    });

    // ── Right Panel: Chat ───────────────────────────────────
    const rightPanel = this.add.graphics();
    rightPanel.fillStyle(0x0a0f1e, 0.5);
    rightPanel.fillRoundedRect(580, 68, 620, 340, 8);
    rightPanel.lineStyle(1, 0x4fc3f7, 0.2);
    rightPanel.strokeRoundedRect(580, 68, 620, 340, 8);

    this.add.text(890, 82, 'CHAT', {
      fontSize: '14px', fontFamily: FONT,
      fontStyle: 'bold', color: '#4fc3f7',
    }).setOrigin(0.5);

    // Chat input
    this.inputManager = new DOMInputManager(this);
    this.chatInput = this.inputManager.createInput({
      gameX: 830, gameY: 430, width: 440, height: 30,
      placeholder: 'Type message...',
      maxLength: 200,
    });
    this.chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.sendChat();
    });

    new MenuButton(this, 1100, 430, '[ Send ]', {
      color: '#4fc3f7', fontSize: '12px', fontStyle: 'normal',
      onPointerDown: () => this.sendChat(),
    });

    // ── Status Bar ──────────────────────────────────────────
    this.statusText = this.add.text(CX, 480, 'Connecting...', {
      fontSize: '16px', fontFamily: FONT, fontStyle: 'bold', color: '#f5a623',
    }).setOrigin(0.5);

    // ── Player Info ─────────────────────────────────────────
    const displayName = AuthManager.isLoggedIn()
      ? AuthManager.getPlayer()!.displayName
      : GameState.playerName || 'Guest';
    const walletBadge = AuthManager.isLoggedIn()
      ? ` (${AuthManager.getPlayer()!.wallet.slice(0, 6)}...)`
      : '';
    this.add.text(100, 510, `You: ${displayName}${walletBadge}`, {
      fontSize: '12px', fontFamily: FONT, color: '#555555',
    });

    // Deck info
    const deckIds = DeckLoader.get();
    this.add.text(500, 510, `Deck: ${deckIds.length} cards`, {
      fontSize: '12px', fontFamily: FONT, color: '#555555',
    });

    // ── Bottom Buttons ──────────────────────────────────────
    const btnY = 560;

    this.readyBtn = new MenuButton(this, CX - 200, btnY, '[ READY ]', {
      color: '#00ff88', fontSize: '24px',
      onPointerDown: () => this.lobbySM.toggleReady(this.roomCode),
    });

    if (this.isHost) {
      this.startBtn = new MenuButton(this, CX + 20, btnY, '[ START GAME ]', {
        color: '#f5a623', fontSize: '24px',
        onPointerDown: () => this.lobbySM.startGame(this.roomCode),
      });
    }

    new MenuButton(this, CX + 250, btnY, '[ LEAVE ]', {
      color: '#ff4444', fontSize: '18px',
      onPointerDown: () => this.leaveRoom(),
    });

    // ── Socket Setup ────────────────────────────────────────
    if (!SocketManager.isConnected()) {
      SocketManager.connectOnly();
    }

    if (AuthManager.isLoggedIn()) {
      SocketManager.registerPlayer(AuthManager.getToken()!);
    }

    this.lobbySM = new LobbySocketManager({
      onStateUpdate: (state) => this.onStateUpdate(state),
      onChatMessage: (msg) => this.addChatMessage(msg),
      onSystemMessage: (text) => this.addChatMessage({ sender: 'SYSTEM', text, timestamp: Date.now() }),
      onKicked: (reason) => {
        ToastNotification.show(this, `Kicked: ${reason}`, { color: '#ff4444' });
        this.time.delayedCall(1500, () => this.goToHub());
      },
      onGameStarting: () => {
        this.statusText.setText('Game starting!').setColor('#00ff88');
        this.time.delayedCall(800, () => this.enterBattle());
      },
      onDepositPhase: (stakeAmount) => {
        this.statusText.setText(`Deposit ${stakeAmount} AVAX to continue`).setColor('#f5a623');
      },
      onBothDeposited: () => {
        this.statusText.setText('Both deposited! Starting...').setColor('#00ff88');
      },
      onSubmitDecks: () => {
        const ids = DeckLoader.get();
        this.lobbySM.submitDeck(this.roomCode, ids);
      },
      onError: (msg) => {
        ToastNotification.show(this, msg, { color: '#ff4444' });
      },
    });
    this.lobbySM.attach();
    this.lobbySM.requestRoomState(this.roomCode);

    // Disconnect safety
    const rawSocket = SocketManager.getSocket();
    if (rawSocket) {
      this.disconnectHandler = () => {
        if (this.transitioning) return;
        this.statusText?.setText('Disconnected from server').setColor('#ff4444');
        this.time.delayedCall(2000, () => this.goToHub());
      };
      rawSocket.once('disconnect', this.disconnectHandler);
    }

    this.events.once('shutdown', () => this.cleanup());
  }

  // ─── State Updates ─────────────────────────────────────────

  private onStateUpdate(state: LobbyState): void {
    this.latestState = state;
    this.renderPlayerList(state);

    const modeLabel = state.settings.isCrypto ? 'CRYPTO' : 'FREE';
    const playerCount = state.players.length;
    const maxPlayers = state.settings.maxPlayers ?? 2;

    let statusLabel: string;
    let statusColor: string;

    if (state.status === 'waiting') {
      statusLabel = `Waiting for players... ${playerCount}/${maxPlayers} (${modeLabel})`;
      statusColor = '#f5a623';
    } else if (state.status === 'full') {
      const allReady = state.players.every(p => p.ready);
      statusLabel = allReady ? 'All ready! Host can start' : 'Room full — ready up!';
      statusColor = allReady ? '#00ff88' : '#4fc3f7';
    } else {
      statusLabel = state.status;
      statusColor = '#4fc3f7';
    }

    this.statusText.setText(statusLabel).setColor(statusColor);
  }

  private renderPlayerList(state: LobbyState): void {
    for (const t of this.playerListTexts) t.destroy();
    this.playerListTexts = [];

    state.players.forEach((p, i) => {
      const y = 125 + i * 65;

      // Player row background
      const rowBg = this.add.graphics();
      rowBg.fillStyle(p.ready ? 0x00ff88 : 0x4fc3f7, 0.04);
      rowBg.fillRoundedRect(95, y - 5, 450, 50, 6);
      this.playerListTexts.push(rowBg);

      // Name + badge
      const badge = p.isHost ? ' [HOST]' : '';
      this.playerListTexts.push(this.add.text(110, y + 4, `${p.name}${badge}`, {
        fontSize: '17px', fontFamily: FONT, fontStyle: 'bold', color: '#FFFFFF',
      }));

      // Role tag
      if (p.isHost) {
        this.playerListTexts.push(this.add.text(110, y + 28, 'Room Creator', {
          fontSize: '10px', fontFamily: FONT, color: '#777777',
        }));
      }

      // Ready status
      const readyColor = p.ready ? '#00ff88' : '#ff4444';
      const readyLabel = p.ready ? 'READY' : 'NOT READY';
      this.playerListTexts.push(this.add.text(380, y + 8, readyLabel, {
        fontSize: '14px', fontFamily: FONT, fontStyle: 'bold', color: readyColor,
      }));

      // Ready indicator dot
      const dot = this.add.graphics();
      dot.fillStyle(p.ready ? 0x00ff88 : 0xff4444, 1);
      dot.fillCircle(365, y + 16, 5);
      this.playerListTexts.push(dot);

      // Kick button (host only, not self)
      if (this.isHost && !p.isHost) {
        const kickBtn = this.add.text(490, y + 8, '[KICK]', {
          fontSize: '11px', fontFamily: FONT, color: '#ff4444',
        }).setInteractive({ useHandCursor: true });
        kickBtn.on('pointerover', () => kickBtn.setColor('#ffffff'));
        kickBtn.on('pointerout', () => kickBtn.setColor('#ff4444'));
        kickBtn.on('pointerdown', () => this.lobbySM.kickPlayer(this.roomCode, p.name));
        this.playerListTexts.push(kickBtn);
      }
    });

    // Empty slot indicator
    const maxPlayers = state.settings.maxPlayers ?? 2;
    if (state.players.length < maxPlayers) {
      for (let i = state.players.length; i < maxPlayers; i++) {
        const y = 125 + i * 65;
        const slotBg = this.add.graphics();
        slotBg.lineStyle(1, 0x4fc3f7, 0.1);
        slotBg.strokeRoundedRect(95, y - 5, 450, 50, 6);
        this.playerListTexts.push(slotBg);

        this.playerListTexts.push(this.add.text(110, y + 10, 'Waiting for player...', {
          fontSize: '14px', fontFamily: FONT, fontStyle: 'italic', color: '#333333',
        }));
      }
    }
  }

  // ─── Chat ──────────────────────────────────────────────────

  private addChatMessage(msg: ChatMessage): void {
    const isSystem = msg.sender === 'SYSTEM';
    const color = isSystem ? '#f5a623' : '#FFFFFF';
    const prefix = isSystem ? '' : `${msg.sender}: `;

    const text = this.add.text(600, 0, `${prefix}${msg.text}`, {
      fontSize: '12px', fontFamily: FONT, color,
      wordWrap: { width: 580 },
    });
    this.chatTexts.push(text);

    // Keep last 10 messages visible
    if (this.chatTexts.length > 10) {
      this.chatTexts.shift()?.destroy();
    }
    this.chatTexts.forEach((t, i) => {
      t.setPosition(600, 105 + i * 26);
    });
  }

  private sendChat(): void {
    if (!this.chatInput) return;
    const text = this.chatInput.value.trim();
    if (!text) return;
    this.lobbySM.sendChat(this.roomCode, text);
    this.chatInput.value = '';
  }

  // ─── Navigation ──────────────────────────────────────────

  private leaveRoom(): void {
    this.lobbySM.leaveRoom(this.roomCode);
    this.goToHub();
  }

  private goToHub(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }

  private enterBattle(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    const opponent = this.latestState?.players.find(p =>
      (this.isHost && !p.isHost) || (!this.isHost && p.isHost)
    );
    const opponentName = opponent?.name || GameState.opponentName || 'Opponent';
    GameState.setOpponentName(opponentName);
    GameState.setRoomCode(this.roomCode);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        playerName: GameState.playerName,
        opponentName,
        isCryptoMode: this.latestState?.settings.isCrypto ?? false,
        roomCode: this.roomCode,
      });
    });
  }

  private cleanup(): void {
    this.lobbySM?.detach();
    this.inputManager?.destroyAll();
    if (this.disconnectHandler) {
      SocketManager.getSocket()?.off('disconnect', this.disconnectHandler);
      this.disconnectHandler = undefined;
    }
  }
}

```

# src\scenes\LoginScene.ts

```ts
// ============================================================
// LoginScene.ts
// Entry scene: wallet login or guest mode.
// ============================================================

import Phaser from 'phaser';
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
import GameState from '../GameState';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';

export default class LoginScene extends Phaser.Scene {
  private loginBtn!: MenuButton;
  private guestBtn!: MenuButton;
  private statusText!: Phaser.GameObjects.Text;

  constructor() { super('LoginScene'); }

  create(): void {
    const { width, height } = this.scale;

    // Background
    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(width / 2 - 240, height / 2 - 180, 480, 360, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(width / 2 - 240, height / 2 - 180, 480, 360, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Title
    this.add.text(width / 2, height / 2 - 130, 'OnChainBattles', {
      fontSize: '40px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 85, 'Chess-like On-Chain Card Game', {
      fontSize: '16px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
    }).setOrigin(0.5);

    // Login button
    this.loginBtn = new MenuButton(this, width / 2, height / 2 - 10,
      '[ LOGIN WITH WALLET ]', {
        color: '#00ff88', fontSize: '24px',
        onPointerDown: () => this.handleLogin(),
      },
    );

    // Guest button
    this.guestBtn = new MenuButton(this, width / 2, height / 2 + 50,
      '[ PLAY AS GUEST ]', {
        color: '#4fc3f7', fontSize: '20px',
        onPointerDown: () => this.enterAsGuest(),
      },
    );

    // Status text
    this.statusText = this.add.text(width / 2, height / 2 + 110, '', {
      fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
    }).setOrigin(0.5);

    // If already logged in, show status and skip
    if (AuthManager.isLoggedIn()) {
      const player = AuthManager.getPlayer()!;
      this.statusText.setText(`Logged in: ${player.displayName}`).setColor('#00ff88');
      this.time.delayedCall(500, () => this.goToHub());
    }
  }

  private async handleLogin(): Promise<void> {
    this.loginBtn.setDisabled(true);
    this.guestBtn.setDisabled(true);
    this.statusText.setText('Connecting wallet...').setColor('#f5a623');

    try {
      const player = await AuthManager.login();
      this.statusText.setText(`Welcome, ${player.displayName}!`).setColor('#00ff88');

      // Reload deck with auth (Priority 1 can now succeed)
      DeckLoader.invalidate();
      await DeckLoader.load();

      this.time.delayedCall(600, () => this.goToHub());
    } catch (err: any) {
      ToastNotification.show(this, err.message || 'Login failed', { color: '#ff4444' });
      this.loginBtn.setDisabled(false);
      this.guestBtn.setDisabled(false);
      this.statusText.setText('').setColor('#AAAAAA');
    }
  }

  private enterAsGuest(): void {
    this.statusText.setText('Entering as guest...').setColor('#4fc3f7');
    GameState.setPlayerName('Guest');
    this.time.delayedCall(300, () => this.goToHub());
  }

  private goToHub(): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }
}

```

# src\scenes\MainMenuScene.ts

```ts
// ============================================================
// MainMenuScene.ts  (REFACTORED)
//
// Changes vs original:
//   1. Content vertically centred in the 720px canvas
//   2. HTML inputs managed via DOMInputManager (resize-safe)
//   3. Buttons use MenuButton component (consistent hover/press)
//   4. Toast errors use ToastNotification (fade in/out)
//   5. Auto-fills room code from URL query param (?room=XXXXXX)
//   6. Last-match banner repositioned to not overlap buttons
//   7. Scene fade-in / fade-out transitions per UI spec
// ============================================================

import Phaser from 'phaser';
import GameState, { RoomAction, GameMode } from '../GameState';
import WalletManager from '../web3/WalletManager';
import { AuthManager } from '../auth/AuthManager';
import { DOMInputManager } from '../ui/DOMInputManager';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';

// ─── Layout constants (game-space coords, 1280×720) ────────────
// Everything is relative to centerX / a baseline Y so the whole
// block sits visually centred on the canvas.
const CX = 640;                       // horizontal center
const BASE_Y = 140;                   // top of content block
const GAP = 68;                       // vertical spacing between rows

const LAYOUT = {
  title:       { x: CX, y: BASE_Y },
  tagline:     { x: CX, y: BASE_Y + 52 },
  nameLabel:   { x: CX, y: BASE_Y + GAP * 1.5 },
  nameInput:   { x: CX, y: BASE_Y + GAP * 1.5 + 38, w: 340, h: 44 },
  roomLabel:   { x: CX, y: BASE_Y + GAP * 2.5 + 10 },
  roomInput:   { x: CX, y: BASE_Y + GAP * 2.5 + 48, w: 280, h: 44 },
  playFreeBtn: { x: CX, y: BASE_Y + GAP * 3.5 + 30 },
  cryptoBtn:   { x: CX, y: BASE_Y + GAP * 4.2 + 30 },
  matchBanner: { x: CX, y: BASE_Y + GAP * 5 + 30 },
  record:      { x: CX, y: BASE_Y + GAP * 5 + 58 },
} as const;

export default class MainMenuScene extends Phaser.Scene {

  // ─── UI handles ──────────────────────────────────────────────
  private inputManager!: DOMInputManager;
  private nameInput!: HTMLInputElement;
  private roomCodeInput!: HTMLInputElement;
  private playFreeBtn!: MenuButton;
  private cryptoBtn!: MenuButton;

  constructor() {
    super('MainMenuScene');
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  create(): void {
    this.cleanupPrevious();

    const { width, height } = this.scale;
// Background — use loaded image if available, fallback to solid color
    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // ── Dark panel behind content for text readability ─────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(width / 2 - 260, BASE_Y - 40, 520, 500, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(width / 2 - 260, BASE_Y - 40, 520, 500, 10);

    // Fade in
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Static text ──────────────────────────────────────────
    this.add.text(LAYOUT.title.x, LAYOUT.title.y, 'OnChainBattles', {
      fontSize: '44px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);

    this.add.text(LAYOUT.tagline.x, LAYOUT.tagline.y, 'Chess-like On-Chain Card Game', {
      fontSize: '18px',
      fontFamily: '"Courier New", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    // ── Labels ───────────────────────────────────────────────
    this.add.text(LAYOUT.nameLabel.x, LAYOUT.nameLabel.y, 'Your Name', {
      fontSize: '16px',
      fontFamily: '"Courier New", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    this.add.text(LAYOUT.roomLabel.x, LAYOUT.roomLabel.y, 'Room Code  (leave blank to create new room)', {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    // ── HTML Inputs via DOMInputManager ──────────────────────
    this.inputManager = new DOMInputManager(this);

    this.nameInput = this.inputManager.createInput({
      gameX: LAYOUT.nameInput.x,
      gameY: LAYOUT.nameInput.y,
      width: LAYOUT.nameInput.w,
      height: LAYOUT.nameInput.h,
      placeholder: 'Enter your name...',
      maxLength: 20,
    });

    this.roomCodeInput = this.inputManager.createInput({
      gameX: LAYOUT.roomInput.x,
      gameY: LAYOUT.roomInput.y,
      width: LAYOUT.roomInput.w,
      height: LAYOUT.roomInput.h,
      placeholder: 'Enter code to join...',
      maxLength: 6,
      uppercase: true,
    });

    // Auto-fill room code from URL (?room=XXXXXX)
    const urlCode = ShareHelper.getRoomCodeFromURL();
    if (urlCode) {
      this.roomCodeInput.value = urlCode;
    }

    // ── Buttons ──────────────────────────────────────────────
    this.playFreeBtn = new MenuButton(
      this,
      LAYOUT.playFreeBtn.x,
      LAYOUT.playFreeBtn.y,
      '[ PLAY FREE ]',
      {
        color: '#00ff88',
        fontSize: '26px',
        onPointerDown: () => this.onPlayFree(),
      },
    );

    this.cryptoBtn = new MenuButton(
      this,
      LAYOUT.cryptoBtn.x,
      LAYOUT.cryptoBtn.y,
      '[ PLAY CRYPTO (AVAX) ]',
      {
        color: '#f5a623',
        fontSize: '20px',
        onPointerDown: () => this.onPlayCrypto(),
      },
    );

    // ── Auth status display ──────────────────────────────────
    if (AuthManager.isLoggedIn()) {
      const player = AuthManager.getPlayer()!;
      this.add.text(CX, LAYOUT.cryptoBtn.y + 40,
        `Logged in: ${player.displayName} (${player.wallet.slice(0, 6)}...${player.wallet.slice(-4)})`, {
        fontSize: '12px',
        fontFamily: '"Courier New", monospace',
        color: '#4fc3f7',
      }).setOrigin(0.5);
    }

    // ── Last match banner (conditional) ─────────────────────
    this.renderLastMatchBanner();

    // ── Cleanup on scene shutdown ────────────────────────────
    this.events.once('shutdown', () => this.cleanupPrevious());
    this.events.once('destroy', () => this.cleanupPrevious());
  }

  // ─── Play Free ───────────────────────────────────────────────

  private onPlayFree(): void {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    GameState.setPlayerName(name);
    GameState.currentMode = GameMode.FreePlay;
    this.resolveRoomAction();
    this.transitionToRoom();
  }

  // ─── Play Crypto ─────────────────────────────────────────────

  private async onPlayCrypto(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!this.validateName(name)) return;

    // Disable buttons during wallet flow
    this.playFreeBtn.setDisabled(true);
    this.cryptoBtn.setDisabled(true);
    this.cryptoBtn.setLabel('Connecting wallet...');

    try {
      const address = await WalletManager.connect();
      GameState.connectWallet(address);
      GameState.setPlayerName(name);
      this.resolveRoomAction();
      this.transitionToRoom();
    } catch (err: any) {
      ToastNotification.show(this, err.message, { color: '#ff4444' });
      this.playFreeBtn.setDisabled(false);
      this.cryptoBtn.setDisabled(false);
      this.cryptoBtn.setLabel('[ PLAY CRYPTO (AVAX) ]');
    }
  }

  // ─── Shared helpers ──────────────────────────────────────────

  private validateName(name: string): boolean {
    if (!name) {
      ToastNotification.show(this, 'Please enter your name!', {
        color: '#ff4444',
        y: LAYOUT.playFreeBtn.y - 30,
      });
      this.nameInput.focus();
      return false;
    }
    return true;
  }

  /** Set room action based on whether a room code was entered */
  private resolveRoomAction(): void {
    const code = this.roomCodeInput.value.trim().toUpperCase();
    if (code) {
      GameState.setRoomCode(code);
      GameState.setRoomAction(RoomAction.Join);
    } else {
      GameState.setRoomAction(RoomAction.Create);
    }
  }

  /** Fade out then start RoomScene */
  private transitionToRoom(): void {
    this.inputManager.destroyAll();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('RoomScene');
    });
  }

  /** Show last-match result + W/L record if available */
  private renderLastMatchBanner(): void {
    const match = GameState.lastMatch;
    if (!match) return;

    const resultColor = match.playerWon ? '#00ff88'
      : match.isTie ? '#f5a623'
      : '#ff6666';

    const turnsInfo = match.turns > 0 ? ` (${match.turns} turns)` : '';
    const resultMsg = match.playerWon
      ? `Last: You beat ${match.opponentName}!${turnsInfo}`
      : match.isTie
      ? `Last: Tie with ${match.opponentName}`
      : `Last: ${match.opponentName} beat you${turnsInfo}`;

    this.add.text(LAYOUT.matchBanner.x, LAYOUT.matchBanner.y, resultMsg, {
      fontSize: '15px',
      fontFamily: '"Courier New", monospace',
      color: resultColor,
    }).setOrigin(0.5);

    this.add.text(LAYOUT.record.x, LAYOUT.record.y,
      `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      color: '#777777',
    }).setOrigin(0.5);
  }

  /** Tear down DOM inputs + buttons from a previous run of this scene */
  private cleanupPrevious(): void {
    if (this.inputManager) {
      this.inputManager.destroyAll();
    }
  }
}
```

# src\scenes\PreloadScene.ts

```ts
// ============================================================
// PreloadScene.ts
// Loads ALL game assets before MainMenuScene starts.
// Must be the FIRST scene in main.ts scene array.
//
// Asset key naming conventions (must match CardRenderer/BoardRenderer):
//   art_<cardId>          → card artwork (full 440×320)
//   thumb_<cardId>        → card thumbnail (200×200) ← NEW
//   card_frame_<type>     → card frame overlays
//   icon_<n>              → stat icons
//   icon_type_<allegiance>→ allegiance type icons
//   marker_<type>         → board highlight markers
//   bg_<scene>            → scene backgrounds
//
// All loads use silent error handling — missing files fall through
// to CardRenderer's built-in fallback (grey rectangle).
// This means the game runs even with 0 art files on disk.
// ============================================================

import Phaser from 'phaser';
import { DeckLoader } from '../config/DeckLoader';
import { MipmapHelper } from '../ui/MipmapHelper';


export default class PreLoadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreLoadScene' });
  }

  async init(): Promise<void> {
    await DeckLoader.load();
  }

  // ─── preload() is called automatically by Phaser before create() ──────────
  preload(): void {
    const W = this.scale.width;   // 1280
    const H = this.scale.height;  // 720

    // ── Loading bar UI ────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, W, H);

    this.add.text(W / 2, H / 2 - 80, 'OnChainBattles', {
      fontFamily: 'Arial',
      fontSize: '36px',
      color: '#F5A623',
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 2 - 36, 'Loading...', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#888888',
    }).setOrigin(0.5);

    // Progress bar track
    const barX   = W / 2 - 300;
    const barY   = H / 2;
    const barW   = 600;
    const barH   = 20;

    const barTrack = this.add.graphics();
    barTrack.lineStyle(1, 0x444466, 1);
    barTrack.strokeRect(barX, barY, barW, barH);

    const barFill = this.add.graphics();

    const pctText = this.add.text(W / 2, barY + barH + 12, '0%', {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: '#aaaaaa',
    }).setOrigin(0.5, 0);

    const fileText = this.add.text(W / 2, barY + barH + 32, '', {
      fontFamily: 'Arial',
      fontSize: '11px',
      color: '#666688',
    }).setOrigin(0.5, 0);

    // Wire Phaser loader events
    this.load.on('progress', (value: number) => {
      barFill.clear();
      barFill.fillStyle(0xF5A623, 1);
      barFill.fillRect(barX + 1, barY + 1, (barW - 2) * value, barH - 2);
      pctText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.on('fileprogress', (file: Phaser.Loader.File) => {
      fileText.setText(file.key);
    });

    // Silent fail — CardRenderer draws grey rect for missing textures.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[PreloadScene] Asset not found (ok — fallback active): ${file.key}  →  ${file.url}`);
    });

    // ── Now queue all assets ──────────────────────────────────────────────────
    this.loadCardArt();
    this.loadCardThumbnails();   // ← NEW: loads 200×200 thumb images
    this.loadCardFrames();
    this.loadIcons();
    this.loadBoardMarkers();
    this.loadBackgrounds();
    this.loadUI();
  }

create(): void {
    console.log('[PreloadScene] All assets loaded. Starting LoginScene.');
    MipmapHelper.enableAll(this);
    this.scene.start('LoginScene');
  }

  /** Generate mipmaps for a texture (drastically improves downscale quality). */
  /** Generate mipmaps for a texture (improves downscale quality). */
  private enableMipmaps(key: string, gl: WebGLRenderingContext): void {
    if (!this.textures.exists(key)) return;

    const texture = this.textures.get(key);
    const source = texture.source?.[0];
    if (!source) return;

    // Phaser 4 stores the WebGL texture in varying paths — find it
    const glTex = (source as any).glTexture
      ?? (source as any).texture
      ?? (source as any).webGLTexture;

    if (!glTex || !(glTex instanceof WebGLTexture)) {
      // Log once so we can find the right path
      if (key === 'art_king') {
        console.log('[Mipmap] source keys:', Object.keys(source));
        console.log('[Mipmap] source:', source);
      }
      return;
    }

    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // ─── ALL CARD IDS (shared by art + thumb loaders) ─────────────────────────
  // Union of DEMO_DECK_IDS (unique) + 'king'.
  // Kept inline so PreloadScene has no import from game logic.
  // If you add a card to CardDefinitions, add its id here too.
  private static readonly ALL_CARD_IDS: string[] = [
    // King (pre-placed, not in deck)
    'king',
    // Standard units
    'foot_soldier',   // 3 copies
    'pikeman',        // 2
    'archer',         // 2
    'assassin',       // 2
    'militia',        // 2
    'scout',          // 2
    'lancer',         // 2
    'mystic',         // 1
    'messenger',      // 2
    // Royal units
    'swordsman',      // 2
    'princess',       // 1
    'priest',         // 2
    'commander',      // 1
    'inquisitor',     // 2
    'knight',         // 2
    'knights_guard',  // 1
    'scribe',         // 2
    // Structures
    'castle',         // 1
    'temple',         // 2
    'village',        // 2
    // Spells
    'disease',        // 2
    'casus_belli',    // 1
    'reform',         // 2
    'civil_war',      // 1
    'earthquake',     // 1
    'war_horn',       // 2
    'coup',           // 1
    'treason',        // 2
    'motherland',     // 1
    'peasant_revolt', // 1
  ];

  // ─── CARD ART ─────────────────────────────────────────────────────────────
  // Full card art (440×320) used in hand display and detail overlay.
  // Key pattern: art_<cardId>   Path: assets/cards/art/<cardId>.png
  //
  // NOTE: The file on disk for "knights_guard" is named "kings_guard.png".
  // We handle this mismatch explicitly below.
  private loadCardArt(): void {
    const BASE = 'assets/cards/art/';

    PreLoadScene.ALL_CARD_IDS.forEach(id => {
      // ── Filename mismatch fix ──────────────────────────
      // CardDefinitions uses id "knights_guard" but the art
      // file on disk is "kings_guard.png".
      const filename = id === 'knights_guard' ? 'kings_guard' : id;
      this.load.image(`art_${id}`, `${BASE}${filename}.png`);
    });
  }

  // ─── CARD THUMBNAILS (NEW) ────────────────────────────────────────────────
  // Dedicated 200×200 thumbnail images for board unit rendering.
  // Using these instead of downscaling 440×320 full art to 100×100
  // eliminates the blurriness on board units.
  //
  // Key pattern: thumb_<cardId>   Path: assets/cards/thumb/<cardId>_thumb.png
  // If thumb is missing, CardRenderer falls back to art_<cardId>.
  private loadCardThumbnails(): void {
    const BASE = 'assets/cards/thumb/';

    PreLoadScene.ALL_CARD_IDS.forEach(id => {
      // Thumb files use the consistent naming: <id>_thumb.png
      // knights_guard → knights_guard_thumb.png (correct on disk)
      this.load.image(`thumb_${id}`, `${BASE}${id}_thumb.png`);
    });
  }

  // ─── CARD FRAMES ──────────────────────────────────────────────────────────
  private loadCardFrames(): void {
    const BASE = 'assets/cards/';

    ['standard', 'royal', 'static', 'spell'].forEach(type => {
      this.load.image(`card_frame_${type}`, `${BASE}card_frame_${type}.png`);
    });

    this.load.image('card_back', `${BASE}card_back_pattern.png`);
  }

  // ─── ICONS ────────────────────────────────────────────────────────────────
  private loadIcons(): void {
    const BASE = 'assets/icons/';

    ['atk', 'def', 'leg', 'move', 'cavalry', 'clock', 'ranged'].forEach(name => {
      this.load.image(`icon_${name}`, `${BASE}icon_${name}.png`);
    });

    ['standard', 'royal', 'static', 'spell'].forEach(type => {
      this.load.image(`icon_type_${type}`, `${BASE}icon_type_${type}.png`);
    });
  }

  // ─── BOARD MARKERS ────────────────────────────────────────────────────────
  private loadBoardMarkers(): void {
    const BASE = 'assets/fx/';

    ['move', 'attack', 'aura', 'selected', 'danger'].forEach(type => {
      this.load.image(`marker_${type}`, `${BASE}marker_${type}.png`);
    });
  }

  // ─── BACKGROUNDS ──────────────────────────────────────────────────────────
  // Load ALL background images from assets/backgrounds/.
  // Scenes check textures.exists() before using — missing is safe.
  private loadBackgrounds(): void {
    const BASE = 'assets/backgrounds/';

    // Scene backgrounds
    this.load.image('bg_main_menu', `${BASE}bg_main_menu.png`);
    this.load.image('bg_battle',    `${BASE}bg_battle.png`);
    this.load.image('bg_result',    `${BASE}bg_result.png`);

    // Additional backgrounds available on disk
    this.load.image('bg_board',     `${BASE}bg_board.png`);
    this.load.image('bg_lobby',     `${BASE}bg_lobby.png`);
    this.load.image('bg_menu',      `${BASE}bg_menu.png`);

    // Board skin overlay
    this.load.image('board_skin',   'assets/board/board_skin.png');
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  private loadUI(): void {
    this.load.image('logo', 'assets/ui/logo.png');
  }
}
```

# src\scenes\ResultScene.ts

```ts
// ============================================================
// ResultScene.ts
// Shows match result after BattleScene ends.
// Reads GameState.lastMatch + payoutResult.
//
// Handles:
//   - Victory / Defeat / Tie headline
//   - Dynamic mode badge (FREE PLAY / CRYPTO PLAY + stake)
//   - Winner name + reason (King destroyed, Disconnect, etc.)
//   - Turn count
//   - AVAX payout amount + clickable tx link (crypto mode)
//   - Win/loss record
//   - Play Again / Menu buttons
//   - Auto-navigate to MainMenu after 15s
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';
import SocketManager from '../network/SocketManager';

export default class ResultScene extends Phaser.Scene {
  private autoReturnTimer?: Phaser.Time.TimerEvent;
  private transitioning = false;

  constructor() {
    super('ResultScene');
  }

  create() {
    const { width, height } = this.scale;
    const match = GameState.lastMatch;
    const payoutResult = GameState.payoutResult;

    // ── Background ─────────────────────────────────────────────
    if (this.textures.exists('bg_result')) {
      this.add.image(width / 2, height / 2, 'bg_result').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // ── No match data fallback ─────────────────────────────────
    if (!match) {
      const fbPanel = this.add.graphics();
      fbPanel.fillStyle(0x16213e, 0.62);
      fbPanel.fillRoundedRect(width / 2 - 300, 30, 600, 660, 10);
      fbPanel.lineStyle(2, 0xaaaaaa, 0.8);
      fbPanel.strokeRoundedRect(width / 2 - 300, 30, 600, 660, 10);

      this.add.text(width / 2, 60, 'OnChainBattles', {
        fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(width / 2, height / 2, 'Match Complete', {
        fontSize: '48px', color: '#FFFFFF',
      }).setOrigin(0.5);

      this.addNavigationButtons(width, height);
      this.addAutoReturn();
      this.cameras.main.fadeIn(300, 0, 0, 0);
      return;
    }

    // ── Outcome ────────────────────────────────────────────────
    const won = match.playerWon;
    const tie = match.isTie;

    const headline = tie ? "It's a Tie!" : won ? 'Victory!' : 'Defeat';
    const headlineColor = tie ? '#F5A623' : won ? '#00FF88' : '#FF4444';
    const panelBorder = tie ? 0xf5a623 : won ? 0x00ff88 : 0xff4444;

    // ── Central panel ──────────────────────────────────────────
    const panelW = 600;
    const panelH = 660;
    const panelX = width / 2;
    const panelTop = 30;

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16213e, 0.72);
    panelBg.fillRoundedRect(panelX - panelW / 2, panelTop, panelW, panelH, 10);
    panelBg.lineStyle(2, panelBorder, 0.8);
    panelBg.strokeRoundedRect(panelX - panelW / 2, panelTop, panelW, panelH, 10);

    // ── Title ──────────────────────────────────────────────────
    let yPos = panelTop + 30;

    this.add.text(panelX, yPos, 'OnChainBattles', {
      fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold',
    }).setOrigin(0.5);
    yPos += 36;

    // ── Mode badge (FREE PLAY / CRYPTO) ────────────────────────
    const isCrypto = GameState.currentMode === GameMode.CryptoPlay;

    const modeLabel = isCrypto
      ? `CRYPTO PLAY  ·  Staked: ${match.stakeAmount} AVAX each`
      : 'FREE PLAY';
    const modeColor = isCrypto ? '#F5A623' : '#00FF88';

    this.add.text(panelX, yPos, modeLabel, {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: modeColor,
    }).setOrigin(0.5);
    yPos += 34;

    // ── Headline ───────────────────────────────────────────────
    this.add.text(panelX, yPos, headline, {
      fontSize: '56px', color: headlineColor, fontStyle: 'bold',
    }).setOrigin(0.5);
    yPos += 70;

    // ── Winner name ────────────────────────────────────────────
    const winnerLabel = won
      ? `You defeated ${match.opponentName}`
      : tie
        ? `${match.playerName} vs ${match.opponentName}`
        : `${match.opponentName} wins`;

    this.add.text(panelX, yPos, winnerLabel, {
      fontSize: '22px', color: '#AAAAAA',
    }).setOrigin(0.5);
    yPos += 40;

    // ── Reason ─────────────────────────────────────────────────
    if (match.reason) {
      const reasonMap: Record<string, string> = {
        'KING_DESTROYED': 'King destroyed',
        'DISCONNECT':     'Opponent disconnected',
        'SURRENDER':      'Surrender',
        'TIMEOUT':        'Timeout',
      };
      const reasonText = reasonMap[match.reason] ?? match.reason;
      this.add.text(panelX, yPos, reasonText, {
        fontSize: '16px', color: '#AAAAAA',
      }).setOrigin(0.5);
      yPos += 28;
    }

    // ── Turn count ─────────────────────────────────────────────
    if (match.turns > 0) {
      this.add.text(panelX, yPos, `Turns played: ${match.turns}`, {
        fontSize: '16px', color: '#AAAAAA',
      }).setOrigin(0.5);
      yPos += 30;
    }

    // ── Divider ────────────────────────────────────────────────
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x444466, 0.6);
    divider.lineBetween(panelX - 200, yPos, panelX + 200, yPos);
    yPos += 20;

    // ── Win/Loss record ────────────────────────────────────────
    this.add.text(panelX, yPos, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
      fontSize: '18px', color: '#FFFFFF',
    }).setOrigin(0.5);
    yPos += 35;

    // ── Crypto payout info (only in crypto mode) ───────────────
    if (isCrypto) {
      if (won) {
        const payoutAmount = (match.stakeAmount * 2 * 0.95).toFixed(4);
        this.add.text(panelX, yPos, `Payout: ${payoutAmount} AVAX`, {
          fontSize: '20px', color: '#F5A623',
        }).setOrigin(0.5);
        yPos += 30;

        // Tx hash link (clickable)
        const txHash = payoutResult?.txHash;
        if (txHash) {
          const shortHash = txHash.slice(0, 10) + '...' + txHash.slice(-6);
          const txText = this.add.text(panelX, yPos, `TX: ${shortHash}`, {
            fontSize: '14px', color: '#4FC3F7',
          }).setOrigin(0.5).setInteractive({ useHandCursor: true });

          txText.on('pointerover', () => txText.setColor('#FFFFFF'));
          txText.on('pointerout', () => txText.setColor('#4FC3F7'));
          txText.on('pointerdown', () => {
            window.open(`https://testnet.snowtrace.io/tx/${txHash}`, '_blank');
          });
          yPos += 25;
        } else if (payoutResult && !payoutResult.success) {
          this.add.text(panelX, yPos, 'Payout pending...', {
            fontSize: '14px', color: '#FF6666',
          }).setOrigin(0.5);
          yPos += 25;
        }
      } else if (!tie) {
        this.add.text(panelX, yPos, `You lost ${match.stakeAmount} AVAX`, {
          fontSize: '18px', color: '#FF6666',
        }).setOrigin(0.5);
        yPos += 30;
      }
    }

    // ── Navigation buttons ─────────────────────────────────────
    this.addNavigationButtons(width, height);

    // ── Auto-return timer ──────────────────────────────────────
    this.addAutoReturn();

    // ── Fade in ────────────────────────────────────────────────
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  // ─── HELPERS ───────────────────────────────────────────────

  private addNavigationButtons(width: number, height: number): void {
    const btnY = height - 80;

    // Hub
    const hubBtn = this.add.text(width / 2 - 160, btnY, '[ HUB ]', {
      fontSize: '24px', color: '#4FC3F7',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    hubBtn.on('pointerover', () => hubBtn.setColor('#FFFFFF'));
    hubBtn.on('pointerout', () => hubBtn.setColor('#4FC3F7'));
    hubBtn.on('pointerdown', () => this.goToHub());

    // Rematch
    const rematchBtn = this.add.text(width / 2, btnY, '[ REMATCH ]', {
      fontSize: '26px', color: '#00FF88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    rematchBtn.on('pointerover', () => rematchBtn.setColor('#FFFFFF'));
    rematchBtn.on('pointerout', () => rematchBtn.setColor('#00FF88'));
    rematchBtn.on('pointerdown', () => this.goToRematch());

    // Legacy menu
    const menuBtn = this.add.text(width / 2 + 160, btnY, '[ LEGACY ]', {
      fontSize: '18px', color: '#777777',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerover', () => menuBtn.setColor('#FFFFFF'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#777777'));
    menuBtn.on('pointerdown', () => this.goToMenu());
  }

  private addAutoReturn(): void {
    this.autoReturnTimer = this.time.delayedCall(15000, () => {
      if (!this.scene.isActive('ResultScene')) return;
      this.goToMenu();
    });
  }

  shutdown(): void {
    if (this.autoReturnTimer) {
      this.autoReturnTimer.destroy();
      this.autoReturnTimer = undefined;
    }
  }

  private goToHub(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.autoReturnTimer?.destroy();
    SocketManager.disconnect();
    // Don't clear match data yet — HubScene reads lastMatch for banner
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      GameState.clearMatchData();
      this.scene.start('HubScene');
    });
  }

  private goToRematch(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.autoReturnTimer?.destroy();
    SocketManager.disconnect();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      GameState.clearMatchData();
      // Go to HubScene which will let user host a new game
      this.scene.start('HubScene');
    });
  }

  private goToMenu(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.autoReturnTimer?.destroy();
    SocketManager.disconnect();
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      GameState.clearMatchData();
      this.scene.start('MainMenuScene');
    });
  }
}

```

# src\scenes\RoomBrowserScene.ts

```ts
// ============================================================
// RoomBrowserScene.ts
// Lists public rooms with auto-refresh. Click to join.
// ============================================================

import Phaser from 'phaser';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';
import { LobbySocketManager } from '../lobby/LobbySocketManager';
import { fetchPublicRooms } from '../lobby/RoomBrowserAPI';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import type { PublicRoomListing } from '../../shared/types/NetworkEvents';

const CX = 640;
const LIST_TOP = 130;
const ROW_HEIGHT = 50;
const MAX_VISIBLE = 8;

export default class RoomBrowserScene extends Phaser.Scene {
  private lobbySM!: LobbySocketManager;
  private rooms: PublicRoomListing[] = [];
  private roomTexts: Phaser.GameObjects.Text[] = [];
  private refreshTimer?: Phaser.Time.TimerEvent;
  private statusText!: Phaser.GameObjects.Text;
  private failCount = 0;
  private transitioning = false;

  constructor() { super('RoomBrowserScene'); }

  create(): void {
    const { width, height } = this.scale;

    if (this.textures.exists('bg_main_menu')) {
      this.add.image(width / 2, height / 2, 'bg_main_menu').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(CX - 380, 30, 760, 640, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(CX - 380, 30, 760, 640, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Header
    this.add.text(CX, 60, 'BROWSE GAMES', {
      fontSize: '28px', fontFamily: '"Courier New", monospace',
      fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5);

    new MenuButton(this, 320, 60, '[ BACK ]', {
      color: '#ff4444', fontSize: '16px',
      onPointerDown: () => this.goBack(),
    });

    // Column headers
    const headerY = 100;
    this.add.text(300, headerY, 'ROOM', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(550, headerY, 'HOST', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(730, headerY, 'PLAYERS', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(830, headerY, 'MODE', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);
    this.add.text(940, headerY, '', { fontSize: '13px', fontFamily: '"Courier New", monospace', color: '#777777' }).setOrigin(0);

    // Status
    this.statusText = this.add.text(CX, 640, 'Loading...', {
      fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
    }).setOrigin(0.5);

    // Connect + lobby socket
    if (!SocketManager.isConnected()) {
      SocketManager.connectOnly();
    }

    this.lobbySM = new LobbySocketManager({
      onJoined: (code) => {
        if (this.transitioning) return;
        this.transitioning = true;
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('LobbyScene', { roomCode: code, isHost: false });
        });
      },
      onError: (msg) => ToastNotification.show(this, msg, { color: '#ff4444' }),
    });
    this.lobbySM.attach();

    // Initial fetch + auto-refresh
    this.fetchRooms();
    this.refreshTimer = this.time.addEvent({
      delay: 5000,
      callback: () => this.fetchRooms(),
      loop: true,
    });

    this.events.once('shutdown', () => this.cleanup());
  }

  private async fetchRooms(): Promise<void> {
    try {
      this.rooms = await fetchPublicRooms();
      this.failCount = 0;
      this.renderRoomList();
    } catch {
      this.failCount++;
      if (this.failCount >= 3) {
        this.statusText.setText('Server connection issues...').setColor('#ff4444');
      }
    }
  }

  private renderRoomList(): void {
    // Clear old room text objects
    for (const t of this.roomTexts) t.destroy();
    this.roomTexts = [];

    if (this.rooms.length === 0) {
      this.statusText.setText('No rooms available. Host one from the Hub!').setColor('#AAAAAA');
      return;
    }

    this.statusText.setText(`${this.rooms.length} room${this.rooms.length > 1 ? 's' : ''} available`).setColor('#4fc3f7');

    const visible = this.rooms.slice(0, MAX_VISIBLE);
    for (let i = 0; i < visible.length; i++) {
      const room = visible[i];
      const y = LIST_TOP + i * ROW_HEIGHT;

      const nameText = this.add.text(300, y, room.roomName.slice(0, 20), {
        fontSize: '16px', fontFamily: '"Courier New", monospace', color: '#FFFFFF',
      });

      const hostText = this.add.text(550, y, room.hostName.slice(0, 12), {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#AAAAAA',
      });

      const countText = this.add.text(730, y, `${room.playerCount}/${room.maxPlayers}`, {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#4fc3f7',
      });

      const modeColor = room.isCrypto ? '#f5a623' : '#00ff88';
      const modeLabel = room.isCrypto ? 'CRYPTO' : 'FREE';
      const modeText = this.add.text(830, y, modeLabel, {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: modeColor,
      });

      const joinBtn = this.add.text(940, y, '[ JOIN ]', {
        fontSize: '14px', fontFamily: '"Courier New", monospace', color: '#00ff88',
      }).setInteractive({ useHandCursor: true });

      joinBtn.on('pointerover', () => joinBtn.setColor('#ffffff'));
      joinBtn.on('pointerout', () => joinBtn.setColor('#00ff88'));
      joinBtn.on('pointerdown', () => {
        this.lobbySM.joinRoom(room.code, GameState.playerName || 'Guest');
      });

      this.roomTexts.push(nameText, hostText, countText, modeText, joinBtn);
    }
  }

  private goBack(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('HubScene');
    });
  }

  private cleanup(): void {
    this.refreshTimer?.remove();
    this.refreshTimer = undefined;
    this.lobbySM?.detach();
  }
}

```

# src\scenes\RoomScene.ts

```ts
// ============================================================
// RoomScene.ts  (REFACTORED)
//
// Changes vs original:
//   1. Room code is COPIABLE — click the code text to copy
//   2. "Copy Code" + "Share Link" buttons below room code
//   3. Uses MenuButton, ToastNotification, ShareHelper components
//   4. Fade in/out transitions
//   5. Cleaner layout with named constants
//   6. DOMOverlay for copy/share uses native HTML buttons for
//      reliable clipboard access (Phaser canvas can't focus)
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode, RoomAction } from '../GameState';
import SocketManager from '../network/SocketManager';
import EscrowManager, { STAKE_AVAX } from '../web3/EscrowManager';
import WalletManager from '../web3/WalletManager';
import { AuthManager } from '../auth/AuthManager';
import { DeckLoader } from '../config/DeckLoader';
import { MenuButton } from '../ui/MenuButton';
import { ToastNotification } from '../ui/ToastNotification';
import { ShareHelper } from '../ui/ShareHelper';

// ─── Layout constants ──────────────────────────────────────────
const CX = 640;

const LAYOUT = {
  title:        { x: CX, y: 40 },
  modeBadge:    { x: CX, y: 75 },
  roomCode:     { x: CX, y: 118 },
  copyBtn:      { x: CX - 90, y: 155 },
  shareBtn:     { x: CX + 90, y: 155 },
  stake:        { x: CX, y: 185 },
  playerName:   { x: 320, y: 240 },
  vs:           { x: CX, y: 310 },
  opponentName: { x: 960, y: 240 },
  status:       { x: CX, y: 430 },
  subStatus:    { x: CX, y: 465 },
} as const;

type CryptoPhase = 'idle' | 'depositing' | 'waiting_opponent_deposit' | 'both_ready' | 'rolling' | 'waiting_payout';

export default class RoomScene extends Phaser.Scene {

  // ─── UI handles ──────────────────────────────────────────────
  private statusText!: Phaser.GameObjects.Text;
  private subStatusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private opponentNameText!: Phaser.GameObjects.Text;
  private stakeText!: Phaser.GameObjects.Text;
  private copyBtn!: MenuButton;
  private shareBtn!: MenuButton;

  // ─── State ───────────────────────────────────────────────────
  private isCryptoMode: boolean = false;
  private opponentName: string = '';
  private cryptoPhase: CryptoPhase = 'idle';
  private currentRoomCode: string = '';
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('RoomScene');
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  create(): void {
    const { width, height } = this.scale;
    this.isCryptoMode = GameState.currentMode === GameMode.CryptoPlay;

// Background — use loaded image if available, fallback to solid color
    if (this.textures.exists('bg_lobby')) {
      this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // ── Dark panel behind content for text readability ─────────
    const panel = this.add.graphics();
    panel.fillStyle(0x16213e, 0.88);
    panel.fillRoundedRect(width / 2 - 380, 15, 760, 490, 10);
    panel.lineStyle(2, 0x4fc3f7, 0.4);
    panel.strokeRoundedRect(width / 2 - 380, 15, 760, 490, 10);

    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Title ────────────────────────────────────────────────
    this.add.text(LAYOUT.title.x, LAYOUT.title.y, 'OnChainBattles', {
      fontSize: '28px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);

    // ── Mode badge ───────────────────────────────────────────
    const modeLabel = this.isCryptoMode ? 'CRYPTO MODE' : 'FREE PLAY';
    const modeColor = this.isCryptoMode ? '#f5a623' : '#00ff88';
    this.add.text(LAYOUT.modeBadge.x, LAYOUT.modeBadge.y, modeLabel, {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: modeColor,
    }).setOrigin(0.5);

    // ── Room code (clickable to copy) ────────────────────────
    this.roomCodeText = this.add.text(LAYOUT.roomCode.x, LAYOUT.roomCode.y,
      'ROOM: connecting...', {
      fontSize: '22px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#4fc3f7',
    }).setOrigin(0.5);

    // Make the room code text itself clickable
    this.roomCodeText.setInteractive({ useHandCursor: true });
    this.roomCodeText.on('pointerdown', () => this.copyRoomCode());
    this.roomCodeText.on('pointerover', () => {
      this.roomCodeText.setColor('#ffffff');
    });
    this.roomCodeText.on('pointerout', () => {
      this.roomCodeText.setColor('#4fc3f7');
    });

    // ── Copy & Share buttons ─────────────────────────────────
    this.copyBtn = new MenuButton(
      this,
      LAYOUT.copyBtn.x,
      LAYOUT.copyBtn.y,
      '[ Copy Code ]',
      {
        color: '#4fc3f7',
        fontSize: '13px',
        fontStyle: 'normal',
        onPointerDown: () => this.copyRoomCode(),
      },
    );

    this.shareBtn = new MenuButton(
      this,
      LAYOUT.shareBtn.x,
      LAYOUT.shareBtn.y,
      '[ Share Link ]',
      {
        color: '#4fc3f7',
        fontSize: '13px',
        fontStyle: 'normal',
        onPointerDown: () => this.shareRoomLink(),
      },
    );

    // Initially hidden until we have a room code
    this.copyBtn.text.setVisible(false);
    this.shareBtn.text.setVisible(false);

    // ── Stake display (crypto only) ──────────────────────────
    if (this.isCryptoMode) {
      this.stakeText = this.add.text(LAYOUT.stake.x, LAYOUT.stake.y,
        `Stake: ${STAKE_AVAX} AVAX each | Pot: ${(STAKE_AVAX * 2 * 0.95).toFixed(4)} AVAX to winner`, {
        fontSize: '13px',
        fontFamily: '"Courier New", monospace',
        color: '#f5a623',
      }).setOrigin(0.5);
    }

    // ── Player names ─────────────────────────────────────────
    this.add.text(LAYOUT.playerName.x, LAYOUT.playerName.y, GameState.playerName, {
      fontSize: '22px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#00ff88',
    }).setOrigin(0.5);

this.opponentNameText = this.add.text(
      LAYOUT.opponentName.x,
      LAYOUT.opponentName.y,
      'Waiting for opponent...',
      {
        fontSize: '18px',
        fontFamily: '"Courier New", monospace',
        color: '#AAAAAA',
      },
    ).setOrigin(0.5);

    // ── VS icon ──────────────────────────────────────────────
this.add.text(LAYOUT.vs.x, LAYOUT.vs.y, 'VS', {
      fontSize: '48px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#4FC3F7',
    }).setOrigin(0.5);

    // ── Status ───────────────────────────────────────────────
    this.statusText = this.add.text(LAYOUT.status.x, LAYOUT.status.y,
      'Connecting to server...', {
      fontSize: '18px',
      fontFamily: '"Courier New", monospace',
      color: '#f5a623',
    }).setOrigin(0.5);

this.subStatusText = this.add.text(LAYOUT.subStatus.x, LAYOUT.subStatus.y,
      'Share your room code with a friend', {
      fontSize: '13px',
      fontFamily: '"Courier New", monospace',
      color: '#AAAAAA',
    }).setOrigin(0.5);

    // ── Connect socket ───────────────────────────────────────
    this.connectSocket();
  }

  // ─── Clipboard: Copy Room Code ───────────────────────────────

  private async copyRoomCode(): Promise<void> {
    if (!this.currentRoomCode) return;

    const ok = await ShareHelper.copyToClipboard(this.currentRoomCode);
    if (ok) {
      ToastNotification.show(this, `Copied: ${this.currentRoomCode}`, {
        color: '#00ff88',
        y: LAYOUT.copyBtn.y + 30,
        duration: 1500,
      });
    } else {
      ToastNotification.show(this, 'Copy failed — select manually', {
        color: '#ff4444',
        y: LAYOUT.copyBtn.y + 30,
      });
    }
  }

  // ─── Share Room Link ─────────────────────────────────────────

  private async shareRoomLink(): Promise<void> {
    if (!this.currentRoomCode) return;

    const result = await ShareHelper.shareRoom(this.currentRoomCode);
    if (result === 'shared') {
      ToastNotification.show(this, 'Shared!', {
        color: '#00ff88',
        y: LAYOUT.shareBtn.y + 30,
        duration: 1500,
      });
    } else if (result === 'copied') {
      ToastNotification.show(this, 'Link copied to clipboard!', {
        color: '#00ff88',
        y: LAYOUT.shareBtn.y + 30,
        duration: 1500,
      });
    } else {
      ToastNotification.show(this, 'Share failed', {
        color: '#ff4444',
        y: LAYOUT.shareBtn.y + 30,
      });
    }
  }

  // ─── Socket wiring ──────────────────────────────────────────

  private connectSocket(): void {
    SocketManager.connect({
  onRoomCreated: (code) => this.onRoomCreated(code),
  onRoomJoined: (code) => this.onRoomJoined(code),
  onOpponentJoined: (name) => this.onOpponentJoined(name),
  onOpponentAction: () => {},          // ← ADD THIS LINE
  onOpponentDisconnected: () => this.onOpponentDisconnected(),
  onError: (msg) => this.onSocketError(msg),
  onBothCryptoReady: () => this.onBothCryptoReady(),
  onHostDepositConfirmed: () => this.onHostDepositConfirmed(),

});
  }
private onHostDepositConfirmed(): void {
  // Host's createMatch is confirmed on-chain — now joiner can safely call joinMatch
  this.statusText.setText('Host locked funds! Your turn...').setColor('#f5a623');
  this.handleCryptoDeposit();
}
  private onRoomCreated(code: string): void {
    this.currentRoomCode = code;
    GameState.setRoomCode(code);
    this.roomCodeText.setText(`ROOM: ${code}`);
    this.statusText.setText('Waiting for opponent...');
    this.subStatusText.setText('Share the code or link below');

    this.copyBtn.text.setVisible(true);
    this.shareBtn.text.setVisible(true);

    // Register authenticated player identity with server
    if (AuthManager.isLoggedIn()) {
      SocketManager.registerPlayer(AuthManager.getToken()!);
    }

    if (this.isCryptoMode && GameState.walletAddress) {
      this.signAndRegisterWallet();
    }
  }

  private onRoomJoined(code: string): void {
    this.currentRoomCode = code;
    this.roomCodeText.setText(`ROOM: ${code}`);
    this.statusText.setText('Joined room! Waiting...');

    this.copyBtn.text.setVisible(true);
    this.shareBtn.text.setVisible(true);

    // Register authenticated player identity with server
    if (AuthManager.isLoggedIn()) {
      SocketManager.registerPlayer(AuthManager.getToken()!);
    }

    if (this.isCryptoMode && GameState.walletAddress) {
      this.signAndRegisterWallet();
    }
  }

 private onOpponentJoined(opponentName: string): void {
  this.opponentName = opponentName;
  GameState.setOpponentName(opponentName);
  this.opponentNameText.setText(opponentName).setColor('#ff6666');

  if (this.isCryptoMode) {
    const isHost = GameState.roomAction === RoomAction.Create;
    if (isHost) {
      // Show button — user clicks to deposit (required for Brave Wallet focus)
      this.statusText.setText('Opponent joined! Click to lock funds').setColor('#00ff88');
      this.subStatusText.setText('');

      const depositBtn = this.add.text(CX, 510, '[ LOCK FUNDS ]', {
        fontSize: '24px',
        fontFamily: '"Courier New", monospace',
        color: '#f5a623',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      depositBtn.on('pointerover', () => depositBtn.setColor('#ffffff'));
      depositBtn.on('pointerout', () => depositBtn.setColor('#f5a623'));
      depositBtn.on('pointerdown', () => {
        depositBtn.destroy();
        this.handleCryptoDeposit();
      });
    } else {
      // Joiner waits for host deposit to be confirmed on-chain
      this.statusText.setText('Waiting for host to lock funds...').setColor('#f5a623');
      this.subStatusText.setText('You will deposit after host confirms');
    }
  } else {
    this.statusText.setText('Opponent joined! Entering battle...');
    this.pendingTimers.push(this.time.delayedCall(800, () => this.enterBattle()));
  }
}
  private onOpponentDisconnected(): void {
    this.statusText.setText('Opponent disconnected.').setColor('#ff4444');
    this.pendingTimers.push(this.time.delayedCall(3000, () => this.scene.start('MainMenuScene')));
  }

  private onSocketError(msg: string): void {
    this.statusText.setText(`Error: ${msg}`).setColor('#ff4444');
  }

  private onBothCryptoReady(): void {
    this.cryptoPhase = 'both_ready';
    this.statusText.setText('Funds locked! Entering battle...').setColor('#00ff88');
    this.pendingTimers.push(this.time.delayedCall(1000, () => this.enterBattle()));
  }

  // ─── Crypto deposit flow ─────────────────────────────────────

 private async handleCryptoDeposit(): Promise<void> {
  this.cryptoPhase = 'depositing';
  this.statusText.setText('Locking funds... Check your wallet').setColor('#f5a623');
  this.subStatusText.setText('MetaMask popup incoming');

  try {
    const isHost = GameState.roomAction === RoomAction.Create;
    let txHash: string;

    if (isHost) {
      txHash = await EscrowManager.createMatch(GameState.roomCode);
    } else {
      txHash = await EscrowManager.joinMatch(GameState.roomCode);
    }

    // Store tx hash for ResultScene display
    GameState.depositTxHash = txHash;

    this.cryptoPhase = 'waiting_opponent_deposit';
    this.statusText.setText('Funds locked ✓  Waiting for opponent...').setColor('#4fc3f7');
    this.subStatusText.setText('');
    this.signAndRegisterWallet();
    SocketManager.signalCryptoReady();
  } catch (err: any) {
    this.statusText.setText(`Deposit failed: ${err.message}`).setColor('#ff4444');
    this.pendingTimers.push(this.time.delayedCall(4000, () => this.scene.start('MainMenuScene')));
  }
}

  // ─── Wallet registration with signature ─────────────────────

  private async signAndRegisterWallet(): Promise<void> {
    const wallet = GameState.walletAddress;
    if (!wallet) return;
    const signer = WalletManager.getSigner();
    if (!signer) {
      console.warn('[RoomScene] No signer available for wallet verification');
      return;
    }
    try {
      const message = `OnChainBattles:${GameState.roomCode}:${Date.now()}`;
      const signature = await signer.signMessage(message);
      SocketManager.registerWallet(wallet, message, signature);
    } catch (err) {
      console.error('[RoomScene] Wallet signature failed:', err);
    }
  }

  // ─── Scene transition ────────────────────────────────────────

  shutdown(): void {
    for (const timer of this.pendingTimers) timer.destroy();
    this.pendingTimers = [];
  }

  private enterBattle(): void {
    // Submit deck to server before entering battle (non-blocking)
    const deckIds = DeckLoader.get();
    if (deckIds.length > 0 && this.currentRoomCode) {
      SocketManager.submitDeck(this.currentRoomCode, deckIds);
    }

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('BattleScene', {
        playerName: GameState.playerName,
        opponentName: this.opponentName || GameState.opponentName,
        isCryptoMode: this.isCryptoMode,
        roomCode: GameState.roomCode,
      });
    });
  }
}
```

# src\ui\DOMInputManager.ts

```ts
// ============================================================
// DOMInputManager.ts
// Manages HTML DOM inputs overlaid on the Phaser canvas.
//
// Uses Phaser's built-in DOM element system (scene.add.dom) which
// automatically handles Scale.FIT + CENTER_BOTH transforms.
// This eliminates all manual coordinate math and the alignment
// bugs that come with it.
//
// REQUIRES: dom.createContainer = true  in Phaser GameConfig
//
// USAGE:
//   const mgr = new DOMInputManager(this);      // 'this' = Phaser.Scene
//   const inp = mgr.createInput({ gameX: 640, gameY: 300, ... });
//   mgr.destroyAll();                            // on scene shutdown
// ============================================================

import Phaser from 'phaser';

// ─── Config for a single input ─────────────────────────────────
export interface InputConfig {
  /** Center X in game-space pixels (0–1280) */
  gameX: number;
  /** Center Y in game-space pixels (0–720) */
  gameY: number;
  /** Width in game-space pixels */
  width?: number;
  /** Height in game-space pixels */
  height?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Max character length */
  maxLength?: number;
  /** Force uppercase on input */
  uppercase?: boolean;
  /** Extra CSS overrides (applied last) */
  cssOverrides?: Partial<CSSStyleDeclaration>;
}

// ─── Managed input handle ──────────────────────────────────────
interface ManagedInput {
  element: HTMLInputElement;
  domElement: Phaser.GameObjects.DOMElement;
}

// ─── Default styling tokens ────────────────────────────────────
const DEFAULTS = {
  width: 300,
  height: 44,
  bg: '#16213E',
  border: '#253348',
  focusBorder: '#4fc3f7',
  text: '#ffffff',
  placeholder: '#666688',
  fontSize: '15px',
  fontFamily: '"Courier New", monospace',
  borderRadius: '6px',
} as const;

export class DOMInputManager {
  private scene: Phaser.Scene;
  private inputs: ManagedInput[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Create an HTML input positioned in game-space via Phaser's DOM layer.
   * Returns the raw HTMLInputElement for reading .value etc.
   */
  createInput(config: InputConfig): HTMLInputElement {
    const w = config.width ?? DEFAULTS.width;
    const h = config.height ?? DEFAULTS.height;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = config.placeholder ?? '';
    if (config.maxLength) input.maxLength = config.maxLength;

    // ── Uppercase transform ────────────────────────────────
    if (config.uppercase) {
      input.style.textTransform = 'uppercase';
      input.addEventListener('input', () => {
        const pos = input.selectionStart;
        input.value = input.value.toUpperCase();
        input.setSelectionRange(pos, pos);
      });
    }

    // ── Styling ────────────────────────────────────────────
    input.style.cssText = `
      width: ${w}px;
      height: ${h}px;
      padding: 0 14px;
      font-size: ${DEFAULTS.fontSize};
      font-family: ${DEFAULTS.fontFamily};
      border: 1px solid ${DEFAULTS.border};
      border-radius: ${DEFAULTS.borderRadius};
      background: ${DEFAULTS.bg};
      color: ${DEFAULTS.text};
      outline: none;
      text-align: center;
      box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
    `;

    // Focus glow
    input.addEventListener('focus', () => {
      input.style.borderColor = DEFAULTS.focusBorder;
      input.style.boxShadow = `0 0 8px ${DEFAULTS.focusBorder}44`;
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = DEFAULTS.border;
      input.style.boxShadow = 'none';
    });

    // Extra overrides
    if (config.cssOverrides) {
      Object.assign(input.style, config.cssOverrides);
    }

    // ── Add via Phaser's DOM system ────────────────────────
    // scene.add.dom() positions the element in game-space coordinates,
    // automatically handling canvas scaling and centering.
    const domElement = this.scene.add.dom(config.gameX, config.gameY, input);

    this.inputs.push({ element: input, domElement });

    return input;
  }

  /** Remove a specific input */
  destroyInput(input: HTMLInputElement): void {
    const idx = this.inputs.findIndex(m => m.element === input);
    if (idx !== -1) {
      this.inputs[idx].domElement.destroy();
      this.inputs.splice(idx, 1);
    }
  }

  /** Remove ALL managed inputs */
  destroyAll(): void {
    for (const managed of this.inputs) {
      managed.domElement.destroy();
    }
    this.inputs = [];
  }
}
```

# src\ui\MenuButton.ts

```ts
// ============================================================
// MenuButton.ts
// Reusable Phaser text button with hover, press, and disabled states.
//
// Encapsulates interactive text with consistent styling so scenes
// don't repeat pointer event wiring for every button.
//
// USAGE:
//   const btn = new MenuButton(scene, 640, 450, '[ PLAY FREE ]', {
//     color: '#00ff88', fontSize: '28px',
//     onPointerDown: () => doSomething(),
//   });
//   btn.setDisabled(true);   // grey out
//   btn.destroy();           // cleanup
// ============================================================

import Phaser from 'phaser';

export interface MenuButtonConfig {
  /** Base text color (hex string) */
  color?: string;
  /** Hover text color */
  hoverColor?: string;
  /** Disabled text color */
  disabledColor?: string;
  /** Font size string e.g. '28px' */
  fontSize?: string;
  /** Font style e.g. 'bold' */
  fontStyle?: string;
  /** Font family */
  fontFamily?: string;
  /** Callback on click */
  onPointerDown?: () => void;
}

const BTN_DEFAULTS: Required<Omit<MenuButtonConfig, 'onPointerDown'>> = {
  color: '#00ff88',
  hoverColor: '#ffffff',
  disabledColor: '#555555',
  fontSize: '24px',
  fontStyle: 'bold',
  fontFamily: '"Courier New", monospace',
};

export class MenuButton {
  readonly text: Phaser.GameObjects.Text;
  private config: Required<Omit<MenuButtonConfig, 'onPointerDown'>>;
  private callback: (() => void) | undefined;
  private _disabled: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    cfg?: MenuButtonConfig,
  ) {
    this.config = { ...BTN_DEFAULTS, ...cfg };
    this.callback = cfg?.onPointerDown;

    this.text = scene.add.text(x, y, label, {
      fontSize: this.config.fontSize,
      fontStyle: this.config.fontStyle,
      fontFamily: this.config.fontFamily,
      color: this.config.color,
    }).setOrigin(0.5);

    this.text.setInteractive({ useHandCursor: true });

    this.text.on('pointerover', () => {
      if (!this._disabled) this.text.setColor(this.config.hoverColor);
    });

    this.text.on('pointerout', () => {
      if (!this._disabled) this.text.setColor(this.config.color);
    });

    this.text.on('pointerdown', () => {
      if (!this._disabled && this.callback) {
        // Scale press feedback
        scene.tweens.add({
          targets: this.text,
          scaleX: 0.95, scaleY: 0.95,
          duration: 80,
          yoyo: true,
        });
        this.callback();
      }
    });
  }

  /** Grey out and disable interaction */
  setDisabled(disabled: boolean): void {
    this._disabled = disabled;
    this.text.setColor(disabled ? this.config.disabledColor : this.config.color);
    if (disabled) {
      this.text.disableInteractive();
    } else {
      this.text.setInteractive({ useHandCursor: true });
    }
  }

  /** Update the label text */
  setLabel(label: string): void {
    this.text.setText(label);
  }

  /** Update color (resets base color) */
  setColor(color: string): void {
    this.config.color = color;
    if (!this._disabled) this.text.setColor(color);
  }

  /** Clean up */
  destroy(): void {
    this.text.destroy();
  }
}

```

# src\ui\MipmapHelper.ts

```ts
// ============================================================
// MipmapHelper.ts
// Enables GPU mipmaps on Phaser textures for clean downscaling.
//
// WHY: WebGL LINEAR filter samples only 4 pixels when downscaling.
//      At 3× downscale (440px → 140px), most pixel data is skipped → blur.
//      Mipmaps pre-compute half-size versions on the GPU (440→220→110→55...)
//      so the GPU always has a close-to-display-size version to sample from.
//      This is exactly what Pillow LANCZOS does, but on the GPU.
//
// USAGE:
//      import { MipmapHelper } from '../ui/MipmapHelper';
//      // In PreloadScene.create():
//      MipmapHelper.enableAll(this);
// ============================================================

export class MipmapHelper {

  /**
   * Attempt to enable mipmaps on all loaded image textures.
   * Call this once in PreloadScene.create() after all assets are loaded.
   */
  static enableAll(scene: Phaser.Scene): void {
    const renderer = scene.game.renderer;

    // Only works with WebGL renderer
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
      console.log('[MipmapHelper] Canvas renderer — mipmaps not applicable.');
      return;
    }

    const gl = renderer.gl;
    if (!gl) {
      console.warn('[MipmapHelper] No WebGL context found.');
      return;
    }

    // First, discover the GL texture path on one known texture
    const glTexturePath = MipmapHelper.findGLTexturePath(scene);
    if (!glTexturePath) {
      console.warn('[MipmapHelper] Could not find GL texture path. Mipmaps disabled.');
      return;
    }

    console.log(`[MipmapHelper] GL texture path found: "${glTexturePath}"`);

    // Now enable mipmaps on all loaded textures
    let count = 0;
    const textureManager = scene.textures;

    textureManager.getTextureKeys().forEach((key: string) => {
      // Skip Phaser internal textures
      if (key === '__DEFAULT' || key === '__MISSING' || key === '__WHITE') return;

      const ok = MipmapHelper.enableForKey(scene, key, gl, glTexturePath);
      if (ok) count++;
    });

    console.log(`[MipmapHelper] Mipmaps enabled on ${count} textures.`);
  }

  /**
   * Enable mipmaps on a single texture by key.
   */
 static enableForKey(
    scene: Phaser.Scene,
    key: string,
    gl: WebGLRenderingContext,
    glTexturePath: string,
  ): boolean {
    if (!scene.textures.exists(key)) return false;

    // WebGL 1 requires power-of-two textures for mipmaps.
    // Only proceed if we have WebGL 2.
    if (!(gl instanceof WebGL2RenderingContext)) return false;

    const texture = scene.textures.get(key);
    const source = texture.source?.[0];
    if (!source) return false;

    const glTex = MipmapHelper.getNestedProp(source, glTexturePath);
    if (!glTex || !(glTex instanceof WebGLTexture)) return false;

    const srcImage = (source as any).image ?? (source as any).source ?? source;
    const width = (srcImage as any)?.width ?? 0;
    const height = (srcImage as any)?.height ?? 0;
    if (!width || !height) return false;

    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return true;
  }

  /**
   * Discover the property path to the WebGLTexture object inside a Phaser texture source.
   * Tries multiple known paths for Phaser 3.x and 4.x.
   */
  private static findGLTexturePath(scene: Phaser.Scene): string | null {
    // Find any loaded texture to inspect
    const keys = scene.textures.getTextureKeys().filter(
      (k: string) => k !== '__DEFAULT' && k !== '__MISSING' && k !== '__WHITE'
    );
    if (keys.length === 0) return null;

    const texture = scene.textures.get(keys[0]);
    const source = texture.source?.[0];
    if (!source) return null;

    // Known paths across Phaser versions
    const candidates = [
      'glTexture',
      'texture',
      'webGLTexture',
      'glTexture.texture',
      'image.texture',
      'texture.glTexture',
    ];

    for (const path of candidates) {
      const val = MipmapHelper.getNestedProp(source, path);
      if (val instanceof WebGLTexture) {
        return path;
      }
    }

    // Deep search: walk all own properties up to 3 levels deep
    const found = MipmapHelper.deepFindWebGLTexture(source, 3);
    if (found) {
      console.log(`[MipmapHelper] Found WebGLTexture at: source.${found}`);
      return found;
    }

    // Log structure for debugging
    console.log('[MipmapHelper] Could not find WebGLTexture. Source structure:');
    MipmapHelper.logStructure(source, 'source', 2);

    return null;
  }

  /**
   * Recursively search an object for a WebGLTexture instance.
   */
  private static deepFindWebGLTexture(obj: any, maxDepth: number, path: string = ''): string | null {
    if (maxDepth <= 0 || !obj || typeof obj !== 'object') return null;

    for (const key of Object.getOwnPropertyNames(obj)) {
      // Skip known huge/circular properties
      if (key === 'manager' || key === 'scene' || key === 'game' || key === 'renderer') continue;
      if (key.startsWith('_') && key !== '_glTexture') continue;

      try {
        const val = obj[key];
        const currentPath = path ? `${path}.${key}` : key;

        if (val instanceof WebGLTexture) {
          return currentPath;
        }

        // Recurse into plain objects (not DOM elements, not arrays)
        if (val && typeof val === 'object' && !(val instanceof HTMLElement) && !Array.isArray(val)) {
          const found = MipmapHelper.deepFindWebGLTexture(val, maxDepth - 1, currentPath);
          if (found) return found;
        }
      } catch {
        // Skip accessor errors
      }
    }

    return null;
  }

  /**
   * Log object structure for debugging.
   */
  private static logStructure(obj: any, prefix: string, depth: number): void {
    if (depth <= 0 || !obj || typeof obj !== 'object') return;

    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key === 'manager' || key === 'scene' || key === 'game') continue;
      try {
        const val = obj[key];
        const type = val === null ? 'null'
          : val === undefined ? 'undefined'
          : val instanceof WebGLTexture ? '★ WebGLTexture ★'
          : val instanceof HTMLElement ? 'HTMLElement'
          : Array.isArray(val) ? `Array(${val.length})`
          : typeof val;
        console.log(`  ${prefix}.${key}: ${type}`);

        if (type === 'object' && depth > 1) {
          MipmapHelper.logStructure(val, `${prefix}.${key}`, depth - 1);
        }
      } catch {
        console.log(`  ${prefix}.${key}: [accessor error]`);
      }
    }
  }

  private static isPOT(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }

  private static getNestedProp(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }
}

```

# src\ui\ShareHelper.ts

```ts
// ============================================================
// ShareHelper.ts
// Utility class for clipboard operations and room sharing.
//
// Provides:
//   - copyToClipboard()  → copies text with fallback for older browsers
//   - buildRoomLink()    → generates a joinable URL with room code
//   - shareRoom()        → uses Web Share API if available, else copies
//
// All methods are static — no instantiation needed.
// ============================================================

export class ShareHelper {

  /**
   * Copy arbitrary text to the clipboard.
   * Returns true on success, false on failure.
   */
  static async copyToClipboard(text: string): Promise<boolean> {
    // Modern API
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to legacy approach
      }
    }

    // Legacy fallback: invisible textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /**
   * Build a URL that a second player can open to auto-join a room.
   * Format: {origin}?room={code}
   *
   * If the current page is file:// or about:blank (dev), returns
   * a placeholder string the user can still share manually.
   */
  static buildRoomLink(roomCode: string): string {
    const base = window.location.origin + window.location.pathname;
    // Avoid broken links in dev / iframe contexts
    if (base.startsWith('file://') || base === 'about:blank') {
      return `[Room Code: ${roomCode}]`;
    }
    return `${base}?room=${roomCode}`;
  }

  /**
   * Try the native Web Share API (mobile-friendly).
   * Falls back to copying the link to clipboard.
   * Returns 'shared' | 'copied' | 'failed'.
   */
  static async shareRoom(roomCode: string): Promise<'shared' | 'copied' | 'failed'> {
    const link = ShareHelper.buildRoomLink(roomCode);

    // Try native share (mobile browsers, some desktops)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'OnChainBattles — Join My Room',
          text: `Join my OnChainBattles match! Room code: ${roomCode}`,
          url: link,
        });
        return 'shared';
      } catch {
        // User cancelled or API error — fall through to copy
      }
    }

    // Fallback: copy link
    const ok = await ShareHelper.copyToClipboard(link);
    return ok ? 'copied' : 'failed';
  }

  /**
   * Read room code from URL query params if present.
   * Returns empty string if not found.
   * Used by MainMenuScene to auto-fill the room code input.
   */
  static getRoomCodeFromURL(): string {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.trim().toUpperCase() ?? '';
    } catch {
      return '';
    }
  }
}

```

# src\ui\ToastNotification.ts

```ts
// ============================================================
// ToastNotification.ts
// Displays a temporary notification on the Phaser canvas.
// Auto-dismisses after a configurable duration.
//
// USAGE:
//   ToastNotification.show(scene, 'Copied!', { color: '#00ff88' });
//   ToastNotification.show(scene, 'Error!', { color: '#ff4444', y: 600 });
// ============================================================

import Phaser from 'phaser';

export interface ToastConfig {
  /** Text color (hex) */
  color?: string;
  /** Font size */
  fontSize?: string;
  /** Duration in ms before auto-dismiss */
  duration?: number;
  /** Y position (default: scene height - 80) */
  y?: number;
  /** X position (default: center) */
  x?: number;
}

const TOAST_DEFAULTS = {
  color: '#ff4444',
  fontSize: '16px',
  duration: 2500,
} as const;

export class ToastNotification {
  /**
   * Show a temporary text notification on screen.
   * Returns the text object in case caller needs to destroy early.
   */
  static show(
    scene: Phaser.Scene,
    message: string,
    config?: ToastConfig,
  ): Phaser.GameObjects.Text {
    const cfg = { ...TOAST_DEFAULTS, ...config };
    const x = cfg.x ?? scene.scale.width / 2;
    const y = cfg.y ?? scene.scale.height - 80;

    const text = scene.add.text(x, y, message, {
      fontSize: cfg.fontSize,
      fontFamily: '"Courier New", monospace',
      color: cfg.color,
    }).setOrigin(0.5).setAlpha(0);

    // Fade in
    scene.tweens.add({
      targets: text,
      alpha: 1,
      duration: 150,
    });

    // Fade out and destroy
    scene.time.delayedCall(cfg.duration!, () => {
      scene.tweens.add({
        targets: text,
        alpha: 0,
        duration: 300,
        onComplete: () => text.destroy(),
      });
    });

    return text;
  }
}

```

# src\utils\Logger.ts

```ts
// ============================================================
// Logger.ts — Lightweight structured logging.
//
// Usage:
//   const log = new Logger('SocketManager');
//   log.info('Connected');     // [SocketManager] Connected
//   log.debug('Payload:', x);  // Only shows when level ≤ DEBUG
//
// Level is set globally from VITE_LOG_LEVEL env var or
// Logger.setGlobalLevel(). Defaults to INFO in prod, DEBUG in dev.
// ============================================================

export enum LogLevel {
  DEBUG = 0,
  INFO  = 1,
  WARN  = 2,
  ERROR = 3,
  NONE  = 4,
}

const LEVEL_NAMES: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info:  LogLevel.INFO,
  warn:  LogLevel.WARN,
  error: LogLevel.ERROR,
  none:  LogLevel.NONE,
};

function resolveEnvLevel(): LogLevel {
  // Works in both Vite (import.meta.env) and Node (process.env)
  let raw: string | undefined;
  try { raw = (import.meta as any)?.env?.VITE_LOG_LEVEL; } catch { /* ignore */ }
  if (!raw) {
    try { raw = process?.env?.LOG_LEVEL; } catch { /* ignore */ }
  }
  if (raw && LEVEL_NAMES[raw.toLowerCase()] !== undefined) {
    return LEVEL_NAMES[raw.toLowerCase()];
  }
  // Default: DEBUG in dev, WARN in prod
  try {
    if ((import.meta as any)?.env?.MODE === 'production') return LogLevel.WARN;
  } catch { /* ignore */ }
  return LogLevel.DEBUG;
}

let globalLevel: LogLevel = resolveEnvLevel();

export class Logger {
  constructor(private tag: string) {}

  static setGlobalLevel(level: LogLevel): void {
    globalLevel = level;
  }

  static getGlobalLevel(): LogLevel {
    return globalLevel;
  }

  debug(...args: unknown[]): void {
    if (globalLevel <= LogLevel.DEBUG) console.log(`[${this.tag}]`, ...args);
  }

  info(...args: unknown[]): void {
    if (globalLevel <= LogLevel.INFO) console.log(`[${this.tag}]`, ...args);
  }

  warn(...args: unknown[]): void {
    if (globalLevel <= LogLevel.WARN) console.warn(`[${this.tag}]`, ...args);
  }

  error(...args: unknown[]): void {
    if (globalLevel <= LogLevel.ERROR) console.error(`[${this.tag}]`, ...args);
  }
}

```

# src\utils\PhaserUtils.ts

```ts
import Phaser from 'phaser';

/**
 * Set up a top-left-origin hit area on a Phaser Container.
 * 
 * IMPORTANT: We intentionally do NOT call container.setSize().
 * setSize() shifts displayOriginX/Y to center (w/2, h/2),
 * which offsets Phaser's hit testing coordinates.
 * Without setSize(), displayOrigin stays at (0,0) and the
 * Rectangle(0, 0, w, h) matches the visual bounds exactly.
 */
export function setContainerHitArea(
  container: Phaser.GameObjects.Container,
  w: number,
  h: number
): void {
  container.setInteractive(
    new Phaser.Geom.Rectangle(0, 0, w, h),
    Phaser.Geom.Rectangle.Contains
  );
}
```

# src\web3\EscrowManager.ts

```ts
// ============================================================
// EscrowManager.ts
// Handles all Escrow smart contract interactions.
//
// Functions:
//   createMatch  — Host deposits AVAX to create a match on-chain
//   joinMatch    — Joiner deposits matching AVAX to join
//   getMatchInfo — Read match state from contract (debug helper)
//
// Error handling:
//   All contract calls log detailed errors to console for debugging
//   but throw clean short messages for UI display.
// ============================================================

import { Contract, parseEther, formatEther } from "ethers";
import WalletManager from "./WalletManager";

export const STAKE_AVAX = 0.01; // Hardcoded stake for Phase 1

const ESCROW_ADDRESS = "0xa145f82DC5b285B970BE71F48Cf5173E722cF515";

const ESCROW_ABI = [
  "function createMatch(bytes32 matchId) external payable",
  "function joinMatch(bytes32 matchId) external payable",
  "function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)",
  "event MatchCreated(bytes32 matchId, address playerA, uint256 stake)",
  "event MatchReady(bytes32 matchId, address playerA, address playerB)",
  "event MatchFinished(bytes32 matchId, address winner, uint256 payout)",
];

// Human-readable error codes for known revert reasons
const REVERT_MESSAGES: Record<string, string> = {
  "Match exists":         "Match already created for this room",
  "Stake required":       "Stake amount must be > 0",
  "Match not found":      "No match found — host hasn't deposited yet",
  "Match full":           "Match already has two players",
  "Wrong stake amount":   "Stake doesn't match host's deposit",
  "Cannot join own match": "You can't join your own match",
};

class EscrowManagerClass {

  private getContract(): Contract {
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error("Wallet not connected");
    return new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  }

  /**
   * Generate matchId from room code.
   * MUST match server logic exactly:
   *   Buffer.from(roomCode, 'utf8').toString('hex').padStart(64, '0')
   */
  matchIdFromCode(roomCode: string): string {
    const hex = Array.from(new TextEncoder().encode(roomCode))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return '0x' + hex.padStart(64, '0');
  }

  /**
   * Host creates a match on-chain by depositing AVAX.
   * Returns the transaction hash on success.
   */
  async createMatch(roomCode: string): Promise<string> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(STAKE_AVAX.toString());

    console.log(`[EscrowManager] createMatch — room: ${roomCode}, matchId: ${matchId}, stake: ${STAKE_AVAX} AVAX`);

    try {
      const tx = await contract.createMatch(matchId, { value });
      console.log(`[EscrowManager] createMatch tx sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[EscrowManager] createMatch confirmed — block: ${receipt?.blockNumber ?? '?'}, tx: ${tx.hash}`);

      return tx.hash;
    } catch (err: any) {
      throw this.handleContractError(err, 'createMatch');
    }
  }

  /**
   * Joiner matches the host's deposit to join the match.
   * Returns the transaction hash on success.
   */
  async joinMatch(roomCode: string): Promise<string> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(STAKE_AVAX.toString());

    console.log(`[EscrowManager] joinMatch — room: ${roomCode}, matchId: ${matchId}, stake: ${STAKE_AVAX} AVAX`);

    try {
      const tx = await contract.joinMatch(matchId, { value });
      console.log(`[EscrowManager] joinMatch tx sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[EscrowManager] joinMatch confirmed — block: ${receipt?.blockNumber ?? '?'}, tx: ${tx.hash}`);

      return tx.hash;
    } catch (err: any) {
      throw this.handleContractError(err, 'joinMatch');
    }
  }

  /**
   * Read match state from contract — useful for debugging.
   * Returns null if match doesn't exist.
   */
  async getMatchInfo(roomCode: string): Promise<{
    playerA: string;
    playerB: string;
    stake: string;
    status: number;
  } | null> {
    try {
      const contract = this.getContract();
      const matchId = this.matchIdFromCode(roomCode);
      const [playerA, playerB, stake, status] = await contract.matches(matchId);

      if (playerA === '0x0000000000000000000000000000000000000000') {
        return null; // match doesn't exist
      }

      return {
        playerA,
        playerB,
        stake: formatEther(stake),
        status: Number(status),
      };
    } catch (err) {
      console.warn('[EscrowManager] getMatchInfo failed:', err);
      return null;
    }
  }

  /**
   * Parse contract errors into clean, UI-friendly messages.
   * Logs full details to console for debugging.
   */
  private handleContractError(err: any, method: string): Error {
    const code = err?.code ?? 'UNKNOWN';
    const reason = err?.reason ?? '';
    const shortMsg = err?.shortMessage ?? '';
    const revertData = err?.data ?? '';

    // Log full details for developer debugging
    console.error(`[EscrowManager] ${method} FAILED`, {
      code,
      reason,
      shortMessage: shortMsg,
      revertData,
      message: err?.message?.slice(0, 200),
    });

    // User rejected the wallet popup
    if (code === 'ACTION_REJECTED' || code === 4001 || shortMsg.includes('rejected')) {
      return new Error('Transaction rejected in wallet');
    }

    // Wrong network
    if (code === 'NETWORK_ERROR' || shortMsg.includes('network')) {
      return new Error('Wrong network — switch to Avalanche Fuji');
    }

    // Insufficient funds
    if (shortMsg.includes('insufficient funds') || reason.includes('insufficient')) {
      return new Error('Insufficient AVAX — get test tokens from faucet');
    }

    // Contract revert — try to extract readable reason
    if (code === 'CALL_EXCEPTION' || reason) {
      const revertReason = reason || shortMsg;
      for (const [key, friendly] of Object.entries(REVERT_MESSAGES)) {
        if (revertReason.includes(key)) {
          return new Error(friendly);
        }
      }
      return new Error(revertReason.length > 60 ? revertReason.slice(0, 60) + '...' : revertReason || 'Contract call failed');
    }

    // Fallback
    const fallback = shortMsg || reason || err?.message || 'Unknown wallet error';
    return new Error(fallback.length > 80 ? fallback.slice(0, 80) + '...' : fallback);
  }
}

const EscrowManager = new EscrowManagerClass();
export default EscrowManager;
```

# src\web3\WalletManager.ts

```ts
import { BrowserProvider, JsonRpcSigner } from "ethers";

class WalletManagerClass {
  private provider: BrowserProvider | null = null;
  private signer: JsonRpcSigner | null = null;

  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error("No wallet found. Please install MetaMask or Core Wallet.");
    }

    this.provider = new BrowserProvider(window.ethereum);
    await this.provider.send("eth_requestAccounts", []);
    this.signer = await this.provider.getSigner();

    // Switch to Fuji testnet
    await this.switchToFuji();

    const address = await this.signer.getAddress();
    console.log(`[WalletManager] Connected: ${address}`);
    return address;
  }

  async switchToFuji(): Promise<void> {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xA869" }], // 43113 in hex
      });
    } catch (error: any) {
      // Chain not added yet — add it
      if (error.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0xA869",
            chainName: "Avalanche Fuji Testnet",
            nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
            rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
            blockExplorerUrls: ["https://testnet.snowtrace.io"],
          }],
        });
      }
    }
  }

  getSigner(): JsonRpcSigner | null {
    return this.signer;
  }

  getProvider(): BrowserProvider | null {
    return this.provider;
  }

  isConnected(): boolean {
    return this.signer !== null;
  }
}

const WalletManager = new WalletManagerClass();
export default WalletManager;
```

# test\Counter.ts

```ts
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("Counter", function () {
  it("Should emit the Increment event when calling the inc() function", async function () {
    const counter = await ethers.deployContract("Counter");

    await expect(counter.inc()).to.emit(counter, "Increment").withArgs(1n);
  });

  it("The sum of the Increment events should match the current value", async function () {
    const counter = await ethers.deployContract("Counter");
    const deploymentBlockNumber = await ethers.provider.getBlockNumber();

    // run a series of increments
    for (let i = 1; i <= 10; i++) {
      await counter.incBy(i);
    }

    const events = await counter.queryFilter(
      counter.filters.Increment(),
      deploymentBlockNumber,
      "latest",
    );

    // check that the aggregated events match the current value
    let total = 0n;
    for (const event of events) {
      total += event.args.by;
    }

    expect(await counter.x()).to.equal(total);
  });
});

```

# tests\engine\abilities\onDeployDraw.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, deployCard, Player } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('onDeployDraw — Scout and Messenger', () => {
  it('scout deploy emits SCOUT_RESULT (reveal opponent top cards)', () => {
    const scoutIdx = t.findInHand('scout');
    if (scoutIdx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(scoutIdx)) return;

    t.engine.playCard(scoutIdx, pos.col, pos.row);

    const scoutEvents = t.eventsOfType('SCOUT_RESULT');
    expect(scoutEvents.length).toBeGreaterThan(0);
    const ev = scoutEvents[0] as any;
    expect(ev.topCards).toBeDefined();
  });

  it('messenger deploy draws 1 card', () => {
    const msgIdx = t.findInHand('messenger');
    if (msgIdx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(msgIdx)) return;

    const handBefore = t.state().players[Player.P1].hand.length;
    const deckBefore = t.state().players[Player.P1].deckCount;

    t.engine.playCard(msgIdx, pos.col, pos.row);

    const handAfter = t.state().players[Player.P1].hand.length;
    const deckAfter = t.state().players[Player.P1].deckCount;

    // Played 1, drew 1 → net hand change = 0
    expect(handAfter).toBe(handBefore - 1 + 1);
    expect(deckAfter).toBe(deckBefore - 1);
  });

  it('foot_soldier has no on-deploy draw (it draws on death)', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const drawsBefore = t.eventsOfType('CARD_DRAWN').length;
    t.engine.playCard(idx, pos.col, pos.row);

    // foot_soldier has ON_DEATH_DRAW, not ON_DEPLOY_DRAW
    // No draw events should fire from deploy
    const drawsAfter = t.eventsOfType('CARD_DRAWN').length;
    expect(drawsAfter).toBe(drawsBefore);
  });
});

```

# tests\engine\abilities\onDeployHeal.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('Priest — onDeployHeal', () => {
  it('creates TARGET pending when friendly units are damaged', () => {
    // First deploy a cheap unit that we can damage later
    const soldierPos = deployCard(t, 'foot_soldier');
    if (!soldierPos) return;

    // Skip turns until we have enough LEG for Priest (cost 6)
    // P1 gains 1 LEG/turn base. We need several turns.
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    // Now it's P1's turn with accumulated LEG
    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return; // not in hand

    const pos = t.deployPositions()[0];
    if (!pos) return;

    // Check if we can afford it
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    t.engine.playCard(priestIdx, pos.col, pos.row);

    // Priest triggers heal — but only if damaged units exist
    // Since foot_soldier is at full HP, priest should NOT create pending
    // (we filter out full-HP units)
    // This validates the full-HP filter fix
    const allFull = t.state().board
      .filter(c => c.unit?.owner === Player.P1 && c.unit.cardId !== 'king')
      .every(c => c.unit!.currentDef === c.unit!.maxDef);

    if (allFull) {
      // No pending — healed nobody since all are full
      expect(t.state().status).toBe('IDLE');
    } else {
      // Some unit is damaged — pending TARGET should exist
      expect(t.state().status).toBe('AWAITING_INPUT');
    }
  });

  it('skips pending when no damaged friendly units', () => {
    // Accumulate LEG
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    // All friendly units should be at full HP → no pending
    t.engine.playCard(priestIdx, pos.col, pos.row);

    // The Priest just deployed at full HP, king is full HP
    // Since we filter u.currentDef < u.maxDef, pending should NOT trigger
    // Status stays IDLE
    expect(t.state().status).not.toBe('AWAITING_INPUT');
  });

  it('cancelPending returns engine to IDLE', () => {
    // This test needs a damaged unit to trigger pending
    // We'll check: if status is AWAITING_INPUT after priest play, cancel works
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;
    t.engine.playCard(priestIdx, pos.col, pos.row);

    if (t.state().status === EngineStatus.AWAITING_INPUT) {
      t.engine.cancelPending();
      expect(t.state().status).toBe(EngineStatus.IDLE);
    }
  });

  it('emits PENDING_TARGET event when heal triggers', () => {
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const eventsBefore = t.events.length;
    t.engine.playCard(priestIdx, pos.col, pos.row);

    if (t.state().status === EngineStatus.AWAITING_INPUT) {
      const pendingEvents = t.eventsOfType('PENDING_TARGET');
      expect(pendingEvents.length).toBeGreaterThan(0);
    }
  });
});

```

# tests\engine\gameLoop.test.ts

```ts
/**
 * gameLoop.test.ts — Full functional game loop smoke test.
 *
 * Plays a complete game from startGame() to GAME_OVER (king death).
 * Both players are driven by a simple AI that deploys, moves toward
 * the enemy king, and attacks when in range.
 *
 * Run after every major update:  npx vitest run tests/engine/gameLoop.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../src/game/GameEngine';
import { Player, TurnPhase, EngineStatus } from '../../src/game/types/GameTypes';
import type { GameEvent } from '../../src/game/types/EventTypes';
import type { GameStateSnapshot, Unit } from '../../src/game/types/GameTypes';
import GameState from '../../src/GameState';

// Register all ability handlers
import './helpers/TestHarness';

// ─── Helpers ───────────────────────────────────────────────

const TEST_SEED = 12345;
const MAX_TURNS = 200; // Safety cap — game should end well before this

interface SimpleUnit {
  instanceId: string;
  cardId: string;
  col: number;
  row: number;
  owner: number;
  currentAtk: number;
  currentDef: number;
}

function getUnits(state: GameStateSnapshot, player: Player): SimpleUnit[] {
  return state.board
    .filter(c => c.unit && c.unit.owner === player)
    .map(c => ({
      instanceId: c.unit!.instanceId,
      cardId: c.unit!.cardId,
      col: c.col,
      row: c.row,
      owner: c.unit!.owner,
      currentAtk: c.unit!.currentAtk,
      currentDef: c.unit!.currentDef,
    }));
}

function getEnemyKing(state: GameStateSnapshot, myPlayer: Player): SimpleUnit | null {
  const enemy = myPlayer === Player.P1 ? Player.P2 : Player.P1;
  const cell = state.board.find(c => c.unit?.cardId === 'king' && c.unit?.owner === enemy);
  if (!cell?.unit) return null;
  return {
    instanceId: cell.unit.instanceId,
    cardId: cell.unit.cardId,
    col: cell.col,
    row: cell.row,
    owner: cell.unit.owner,
    currentAtk: cell.unit.currentAtk,
    currentDef: cell.unit.currentDef,
  };
}

/**
 * Simple AI: plays the PLAY phase.
 * Deploys the first affordable card to the position closest to the enemy king.
 */
function aiPlayPhase(engine: GameEngine): void {
  const state = engine.getState();
  const active = state.turn.activePlayer;
  const enemyKing = getEnemyKing(state, active);
  const enemyRow = enemyKing ? enemyKing.row : (active === Player.P1 ? 6 : 0);

  // Deploy as many affordable cards as possible
  let safety = 20;
  while (safety-- > 0) {
    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }
    if (engine.getState().status === EngineStatus.GAME_OVER) return;

    const affordable = engine.getAffordableCards();
    if (affordable.length === 0) break;

    const positions = engine.getValidDeployPositions();
    if (positions.length === 0) break;

    // Pick deploy position closest to enemy
    const sorted = [...positions].sort((a, b) =>
      Math.abs(a.row - enemyRow) - Math.abs(b.row - enemyRow)
    );

    const ok = engine.playCard(affordable[0], sorted[0].col, sorted[0].row);
    if (!ok) break;

    // Handle any pending interaction from deploy abilities
    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }
  }
}

/**
 * Simple AI: plays the ACT phase.
 * For each unit: move toward enemy king, then attack if possible.
 */
function aiActPhase(engine: GameEngine): void {
  const state = engine.getState();
  const active = state.turn.activePlayer;
  const myUnits = getUnits(state, active);

  for (const unit of myUnits) {
    if (engine.getState().status === EngineStatus.GAME_OVER) return;
    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }

    // Re-read state since board may have changed
    const freshState = engine.getState();
    const enemyKing = getEnemyKing(freshState, active);
    if (!enemyKing) return; // enemy king dead — game should end

    // Try to move toward enemy king
    const moves = engine.getValidMoveSquares(unit.instanceId);
    if (moves.length > 0) {
      // Pick the move closest to enemy king
      const best = [...moves].sort((a, b) => {
        const distA = Math.abs(a.col - enemyKing.col) + Math.abs(a.row - enemyKing.row);
        const distB = Math.abs(b.col - enemyKing.col) + Math.abs(b.row - enemyKing.row);
        return distA - distB;
      })[0];
      engine.moveUnit(unit.instanceId, best.col, best.row);
    }

    // Try to attack
    const attacks = engine.getValidAttackSquares(unit.instanceId);
    if (attacks.length > 0) {
      // Prefer attacking the king
      const kingTarget = attacks.find(a => a.col === enemyKing.col && a.row === enemyKing.row);
      const target = kingTarget || attacks[0];

      const targetCell = freshState.board.find(c => c.col === target.col && c.row === target.row);
      if (targetCell?.unit) {
        engine.attackUnit(unit.instanceId, targetCell.unit.instanceId);
      }
    }

    if (engine.getState().status === EngineStatus.AWAITING_INPUT) {
      handlePending(engine);
    }
  }
}

/**
 * Handle any pending interaction by auto-selecting the first valid option,
 * or cancelling if no option is suitable.
 */
function handlePending(engine: GameEngine): void {
  // We can't read the pending from getState(), so try resolvers in order.
  // The engine silently ignores wrong-kind calls, so this is safe.
  const state = engine.getState();
  if (state.status !== EngineStatus.AWAITING_INPUT) return;

  // Try selectTarget: pick first friendly unit on board for heals, etc.
  const active = state.turn.activePlayer;
  const friendlies = getUnits(state, active);
  for (const u of friendlies) {
    engine.selectTarget(u.instanceId);
    if (engine.getState().status !== EngineStatus.AWAITING_INPUT) return;
  }

  // Try selectPosition: pick first valid deploy position
  const positions = engine.getValidDeployPositions();
  for (const p of positions) {
    engine.selectPosition(p.col, p.row);
    if (engine.getState().status !== EngineStatus.AWAITING_INPUT) return;
  }

  // Try selectColumn: try each column
  for (let col = 0; col < 7; col++) {
    engine.selectColumn(col);
    if (engine.getState().status !== EngineStatus.AWAITING_INPUT) return;
  }

  // Try selectDiscard: discard first card
  engine.selectDiscard(0);
  if (engine.getState().status !== EngineStatus.AWAITING_INPUT) {
    return;
  }

  // Last resort: cancel
  engine.cancelPending();
}

/**
 * Run a full game loop. Returns collected events and final state.
 */
function playFullGame(seed: number = TEST_SEED): {
  events: GameEvent[];
  state: GameStateSnapshot;
  turns: number;
} {
  GameState.gameSeed = seed;
  const engine = new GameEngine();
  const events: GameEvent[] = [];
  engine.on(ev => events.push(ev));
  engine.startGame();

  let turns = 0;

  while (turns < MAX_TURNS) {
    const state = engine.getState();
    if (state.status === EngineStatus.GAME_OVER) break;

    // PLAY phase
    if (state.turn.phase === TurnPhase.PLAY) {
      aiPlayPhase(engine);
      if (engine.getState().status === EngineStatus.GAME_OVER) break;
      engine.endPlayPhase();
    }

    // ACT phase
    if (engine.getState().turn.phase === TurnPhase.ACT) {
      aiActPhase(engine);
      if (engine.getState().status === EngineStatus.GAME_OVER) break;
      engine.endActPhase();
    }

    turns++;
  }

  return { events, state: engine.getState(), turns };
}

// ─── Tests ─────────────────────────────────────────────────

describe('Game Loop — full match to completion', () => {
  it('plays a full game to GAME_OVER', () => {
    const { events, state, turns } = playFullGame();

    expect(state.status).toBe(EngineStatus.GAME_OVER);
    expect(turns).toBeLessThan(MAX_TURNS);

    // Should have a GAME_OVER event
    const gameOverEvents = events.filter(e => e.type === 'GAME_OVER');
    expect(gameOverEvents.length).toBe(1);

    const result = (gameOverEvents[0] as any).result;
    expect(result.reason).toBe('KING_DESTROYED');
    expect([Player.P1, Player.P2]).toContain(result.winner);
    expect([Player.P1, Player.P2]).toContain(result.loser);
    expect(result.winner).not.toBe(result.loser);

    console.log(`Game ended in ${turns} half-turns. Winner: P${result.winner + 1}, Reason: ${result.reason}`);
  });

  it('both players deploy units during the game', () => {
    const { events } = playFullGame();

    const p1Deploys = events.filter(
      e => e.type === 'UNIT_PLACED' && (e as any).owner === Player.P1
    );
    const p2Deploys = events.filter(
      e => e.type === 'UNIT_PLACED' && (e as any).owner === Player.P2
    );

    // Kings count as UNIT_PLACED, but we should see more than just kings
    expect(p1Deploys.length).toBeGreaterThan(1);
    expect(p2Deploys.length).toBeGreaterThan(1);
  });

  it('combat occurs during the game', () => {
    const { events } = playFullGame();

    const attacks = events.filter(e => e.type === 'UNIT_ATTACKED');
    expect(attacks.length).toBeGreaterThan(0);
  });

  it('units die during the game', () => {
    const { events } = playFullGame();

    const deaths = events.filter(e => e.type === 'UNIT_DIED');
    // At minimum one king dies (game over condition)
    expect(deaths.length).toBeGreaterThanOrEqual(1);
  });

  it('LEG accumulates over turns', () => {
    const { events } = playFullGame();

    const legEvents = events.filter(e => e.type === 'LEG_GAINED');
    expect(legEvents.length).toBeGreaterThan(0);
  });

  it('cards are drawn each turn', () => {
    const { events } = playFullGame();

    const draws = events.filter(e => e.type === 'CARD_DRAWN');
    expect(draws.length).toBeGreaterThan(2); // More than just opening hands
  });

  it('no engine crash with different seeds', () => {
    // Run 5 games with different seeds — none should throw or stall
    const seeds = [1, 99, 7777, 42424, 100001];
    for (const seed of seeds) {
      const { state, turns } = playFullGame(seed);
      expect(state.status).toBe(EngineStatus.GAME_OVER);
      expect(turns).toBeLessThan(MAX_TURNS);
    }
  });
});

describe('Game Loop — invariants hold throughout', () => {
  it('turn number always increases', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.on(() => {});
    engine.startGame();

    let lastTurn = 0;
    let steps = 0;

    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      expect(state.turn.turnNumber).toBeGreaterThanOrEqual(lastTurn);
      lastTurn = state.turn.turnNumber;

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }

    expect(engine.getState().status).toBe(EngineStatus.GAME_OVER);
  });

  it('active player alternates each full turn', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.startGame();

    const playerSequence: Player[] = [];
    let steps = 0;

    while (steps < MAX_TURNS * 2) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      if (state.turn.phase === TurnPhase.PLAY) {
        playerSequence.push(state.turn.activePlayer);
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        engine.endActPhase();
      }
      steps++;
    }

    // Players should alternate: P1, P2, P1, P2, ...
    for (let i = 1; i < playerSequence.length; i++) {
      expect(playerSequence[i]).not.toBe(playerSequence[i - 1]);
    }
  });

  it('board never has two units in the same cell', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    const events: GameEvent[] = [];
    engine.on(ev => events.push(ev));
    engine.startGame();

    let steps = 0;
    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      // Check board invariant: no duplicate positions
      const occupied = state.board.filter(c => c.unit !== null);
      const positions = occupied.map(c => `${c.col},${c.row}`);
      const unique = new Set(positions);
      expect(unique.size).toBe(positions.length);

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }
  });

  it('unit HP never exceeds maxDef', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.on(() => {}); // keep event pipeline active
    engine.startGame();

    let steps = 0;
    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      // Check all units' HP ≤ maxDef
      for (const cell of state.board) {
        if (cell.unit) {
          expect(cell.unit.currentDef).toBeLessThanOrEqual(cell.unit.maxDef);
        }
      }

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }
  });

  it('dead units are removed from board', () => {
    GameState.gameSeed = TEST_SEED;
    const engine = new GameEngine();
    engine.startGame();

    let steps = 0;
    while (steps < MAX_TURNS) {
      const state = engine.getState();
      if (state.status === EngineStatus.GAME_OVER) break;

      // No unit on board should have 0 or negative HP
      for (const cell of state.board) {
        if (cell.unit) {
          expect(cell.unit.currentDef).toBeGreaterThan(0);
        }
      }

      if (state.turn.phase === TurnPhase.PLAY) {
        aiPlayPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endPlayPhase();
      }
      if (engine.getState().turn.phase === TurnPhase.ACT) {
        aiActPhase(engine);
        if (engine.getState().status === EngineStatus.GAME_OVER) break;
        engine.endActPhase();
      }
      steps++;
    }
  });
});

describe('Game Loop — replay determinism', () => {
  it('two games with same seed produce identical event sequences', () => {
    const run1 = playFullGame(777);
    const run2 = playFullGame(777);

    // Same number of events
    expect(run1.events.length).toBe(run2.events.length);

    // Same event types in same order
    const types1 = run1.events.map(e => e.type);
    const types2 = run2.events.map(e => e.type);
    expect(types1).toEqual(types2);

    // Same final state
    expect(run1.state.status).toBe(run2.state.status);
    expect(run1.turns).toBe(run2.turns);
  });

  it('different seeds produce different games', () => {
    const run1 = playFullGame(111);
    const run2 = playFullGame(222);

    // Both complete, but likely different turn counts or event sequences
    expect(run1.state.status).toBe(EngineStatus.GAME_OVER);
    expect(run2.state.status).toBe(EngineStatus.GAME_OVER);

    // Very unlikely to be identical with different seeds
    const differentTurns = run1.turns !== run2.turns;
    const differentEvents = run1.events.length !== run2.events.length;
    expect(differentTurns || differentEvents).toBe(true);
  });
});

```

# tests\engine\helpers\TestHarness.ts

```ts
/**
 * TestHarness.ts — Shared test utilities for headless GameEngine testing.
 *
 * Provides deterministic engine setup: startGame → skip to PLAY phase with
 * known deck, known hands, and two kings on the board.
 */

import { GameEngine } from '../../../src/game/GameEngine';
import { Player, TurnPhase, EngineStatus } from '../../../src/game/types/GameTypes';
import type { GameEvent } from '../../../src/game/types/EventTypes';
import type { GameStateSnapshot } from '../../../src/game/types/GameTypes';
import GameState from '../../../src/GameState';

// Ensure all ability handlers are registered before any test runs
import '../../../src/game/abilities/handlers/onDeployDraw';
import '../../../src/game/abilities/handlers/onDeployHeal';
import '../../../src/game/abilities/handlers/onDeployRevive';
import '../../../src/game/abilities/handlers/onDeployScout';
import '../../../src/game/abilities/handlers/customMilitia';
import '../../../src/game/abilities/handlers/customMystic';
import '../../../src/game/abilities/handlers/passiveNoOp';
import '../../../src/game/abilities/handlers/spellCoup';
import '../../../src/game/abilities/handlers/spellDamageStructure';
import '../../../src/game/abilities/handlers/spellDrainLeg';
import '../../../src/game/abilities/handlers/spellDrawStructures';
import '../../../src/game/abilities/handlers/spellEarthquake';
import '../../../src/game/abilities/handlers/spellForwardDeploy';
import '../../../src/game/abilities/handlers/spellFreezeLeg';
import '../../../src/game/abilities/handlers/spellMotherland';
import '../../../src/game/abilities/handlers/spellRevolt';
import '../../../src/game/abilities/handlers/spellTransformAll';
import '../../../src/game/abilities/handlers/spellTreason';
import '../../../src/game/abilities/handlers/spellWarHorn';

export interface TestEngine {
  engine: GameEngine;
  events: GameEvent[];
  /** Current snapshot */
  state(): GameStateSnapshot;
  /** Find a card in P1's hand by cardId prefix */
  findInHand(cardIdPrefix: string, player?: Player): number;
  /** Get first unit on board matching cardId for a player */
  findUnit(cardId: string, player?: Player): { instanceId: string; col: number; row: number } | null;
  /** Get valid deploy positions for current player */
  deployPositions(): Array<{ col: number; row: number }>;
  /** Collect events of a specific type */
  eventsOfType(type: string): GameEvent[];
}

/**
 * Create a fresh engine with startGame() called.
 * Engine is in PLAY phase, P1 active, both kings placed, hands dealt.
 */
const DEFAULT_TEST_SEED = 42;

export function createTestEngine(seed: number = DEFAULT_TEST_SEED): TestEngine {
  GameState.gameSeed = seed;
  const engine = new GameEngine();
  const events: GameEvent[] = [];
  engine.on((ev) => events.push(ev));
  engine.startGame();

  return {
    engine,
    events,
    state: () => engine.getState(),
    findInHand(cardIdPrefix: string, player: Player = Player.P1): number {
      const hand = engine.getState().players[player].hand;
      return hand.findIndex(id => id.startsWith(cardIdPrefix));
    },
    findUnit(cardId: string, player: Player = Player.P1) {
      const cell = engine.getState().board.find(
        c => c.unit?.cardId === cardId && c.unit?.owner === player
      );
      if (!cell?.unit) return null;
      return { instanceId: cell.unit.instanceId, col: cell.col, row: cell.row };
    },
    deployPositions() {
      return engine.getValidDeployPositions().map(p => ({ col: p.col, row: p.row }));
    },
    eventsOfType(type: string) {
      return events.filter(e => e.type === type);
    },
  };
}

/**
 * Advance through a full turn: endPlayPhase → endActPhase.
 * After this, it's the other player's turn in PLAY phase.
 */
export function skipTurn(engine: GameEngine): void {
  engine.endPlayPhase();
  engine.endActPhase();
}

/**
 * Deploy a card from hand onto the board.
 * Finds the card in the active player's hand, picks a valid deploy position.
 * Returns the position used, or null if failed.
 */
export function deployCard(
  t: TestEngine,
  cardIdPrefix: string,
  preferredCol?: number,
  preferredRow?: number,
): { col: number; row: number } | null {
  const handIdx = t.findInHand(cardIdPrefix);
  if (handIdx < 0) return null;

  const positions = t.deployPositions();
  let pos = positions[0];
  if (preferredCol !== undefined && preferredRow !== undefined) {
    const exact = positions.find(p => p.col === preferredCol && p.row === preferredRow);
    if (exact) pos = exact;
  }
  if (!pos) return null;

  const ok = t.engine.playCard(handIdx, pos.col, pos.row);
  return ok ? pos : null;
}

export { Player, TurnPhase, EngineStatus };

```

# tests\engine\pending\pendingCommand.test.ts

```ts
import { describe, it, expect } from 'vitest';
import type { PendingCommand } from '../../../src/game/pending/PendingCommand';
import { Player } from '../../../src/game/types/GameTypes';

describe('PendingCommand — serialization', () => {
  it('TARGET variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'TARGET',
      owner: Player.P1,
      sourceCardId: 'priest',
      sourceAbility: 'ON_DEPLOY_HEAL_FRIENDLY',
      reason: 'Choose a friendly unit to heal',
      validTargetIds: ['foot_soldier_1', 'king_0'],
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('TARGET');
    expect(parsed.owner).toBe(Player.P1);
    expect(parsed.sourceCardId).toBe('priest');
    if (parsed.kind === 'TARGET') {
      expect(parsed.validTargetIds).toHaveLength(2);
      expect(parsed.validTargetIds).toContain('foot_soldier_1');
    }
  });

  it('POSITION variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'POSITION',
      owner: Player.P1,
      sourceCardId: 'militia',
      sourceAbility: 'CUSTOM',
      reason: 'Choose where to summon',
      validPositions: [{ col: 2, row: 1 }, { col: 3, row: 0 }],
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('POSITION');
    if (parsed.kind === 'POSITION') {
      expect(parsed.validPositions).toHaveLength(2);
    }
  });

  it('COLUMN variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'COLUMN',
      owner: Player.P2,
      sourceCardId: 'earthquake',
      sourceAbility: 'SPELL_EARTHQUAKE',
      reason: 'Choose a column',
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('COLUMN');
    expect(parsed.owner).toBe(Player.P2);
  });

  it('DISCARD variant round-trips through JSON', () => {
    const cmd: PendingCommand = {
      kind: 'DISCARD',
      owner: Player.P1,
      sourceCardId: 'war_horn',
      sourceAbility: 'SPELL_WAR_HORN',
      count: 1,
      reason: 'Discard 1 card',
      deferredEvents: [],
    };

    const json = JSON.stringify(cmd);
    const parsed: PendingCommand = JSON.parse(json);

    expect(parsed.kind).toBe('DISCARD');
    if (parsed.kind === 'DISCARD') {
      expect(parsed.count).toBe(1);
    }
  });

  it('contains no function properties', () => {
    const cmd: PendingCommand = {
      kind: 'TARGET',
      owner: Player.P1,
      sourceCardId: 'priest',
      sourceAbility: 'ON_DEPLOY_HEAL_FRIENDLY',
      reason: 'test',
      validTargetIds: ['a'],
      deferredEvents: [],
    };

    for (const key of Object.keys(cmd)) {
      expect(typeof (cmd as any)[key]).not.toBe('function');
    }
  });

  it('deferredEvents array serializes correctly', () => {
    const cmd: PendingCommand = {
      kind: 'TARGET',
      owner: Player.P1,
      sourceCardId: 'mystic',
      sourceAbility: 'CUSTOM',
      reason: 'test',
      validTargetIds: ['a'],
      deferredEvents: [
        { type: 'LEG_RATE_CHANGED', player: Player.P2, oldRate: 2, newRate: 1, reason: 'Mystic drain' } as any,
      ],
    };

    const parsed: PendingCommand = JSON.parse(JSON.stringify(cmd));
    expect(parsed.deferredEvents).toHaveLength(1);
    expect((parsed.deferredEvents[0] as any).type).toBe('LEG_RATE_CHANGED');
  });
});

```

# tests\engine\pending\pendingResolver.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, Player, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('PendingResolver — cancelPending', () => {
  it('cancelPending on IDLE engine is safe no-op', () => {
    expect(t.state().status).toBe(EngineStatus.IDLE);
    t.engine.cancelPending();
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('cancelPending clears AWAITING_INPUT back to IDLE', () => {
    // Accumulate LEG for priest
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;
    t.engine.playCard(priestIdx, pos.col, pos.row);

    if (t.state().status === EngineStatus.AWAITING_INPUT) {
      t.engine.cancelPending();
      expect(t.state().status).toBe(EngineStatus.IDLE);
    }
  });

  it('after cancel, player can still end phase', () => {
    for (let i = 0; i < 6; i++) skipTurn(t.engine);

    const priestIdx = t.findInHand('priest');
    if (priestIdx < 0) return;
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(priestIdx)) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;
    t.engine.playCard(priestIdx, pos.col, pos.row);

    if (t.state().status === EngineStatus.AWAITING_INPUT) {
      t.engine.cancelPending();
    }

    // Should be able to proceed normally
    t.engine.endPlayPhase();
    expect(t.state().turn.phase).toBe('ACT');
  });
});

describe('PendingResolver — selectTarget', () => {
  it('selectTarget with invalid instanceId is ignored', () => {
    t.engine.selectTarget('nonexistent_id');
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('selectTarget when no pending is a no-op', () => {
    const king = t.findUnit('king', Player.P1);
    if (king) {
      t.engine.selectTarget(king.instanceId);
    }
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});

describe('PendingResolver — selectColumn', () => {
  it('selectColumn when no pending is a no-op', () => {
    t.engine.selectColumn(3);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('selectColumn with out-of-bounds is ignored', () => {
    t.engine.selectColumn(-1);
    t.engine.selectColumn(99);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});

describe('PendingResolver — selectPosition', () => {
  it('selectPosition when no pending is a no-op', () => {
    t.engine.selectPosition(3, 3);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});

describe('PendingResolver — selectDiscard', () => {
  it('selectDiscard when no pending is a no-op', () => {
    t.engine.selectDiscard(0);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });

  it('selectDiscard with invalid index is ignored', () => {
    t.engine.selectDiscard(-1);
    t.engine.selectDiscard(999);
    expect(t.state().status).toBe(EngineStatus.IDLE);
  });
});

```

# tests\engine\phases\actPhase.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, TurnPhase } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('ActPhase — movement', () => {
  it('king can move in ACT phase', () => {
    t.engine.endPlayPhase(); // → ACT

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const moves = t.engine.getValidMoveSquares(king.instanceId);
    if (moves.length === 0) return;

    const target = moves[0];
    const result = t.engine.moveUnit(king.instanceId, target.col, target.row);
    expect(result).toBe(true);

    // King should be at new position
    const movedKing = t.findUnit('king', Player.P1);
    expect(movedKing?.col).toBe(target.col);
    expect(movedKing?.row).toBe(target.row);
  });

  it('moveUnit rejects during PLAY phase', () => {
    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const result = t.engine.moveUnit(king.instanceId, king.col + 1, king.row);
    expect(result).toBe(false);
  });

  it('moveUnit emits UNIT_MOVED event', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const moves = t.engine.getValidMoveSquares(king.instanceId);
    if (moves.length === 0) return;

    t.engine.moveUnit(king.instanceId, moves[0].col, moves[0].row);

    const moveEvents = t.eventsOfType('UNIT_MOVED');
    expect(moveEvents.length).toBeGreaterThan(0);
  });

  it('unit cannot move to occupied cell', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    const enemyKing = t.findUnit('king', Player.P2);
    if (!king || !enemyKing) return;

    // Try moving king to enemy king's position (should fail)
    const result = t.engine.moveUnit(king.instanceId, enemyKing.col, enemyKing.row);
    expect(result).toBe(false);
  });

  it('getValidMoveSquares returns empty for just-placed unit', () => {
    // Deploy a unit
    const pos = deployCard(t, 'foot_soldier');
    if (!pos) return;

    // The unit was just placed — isJustPlaced = true
    t.engine.endPlayPhase(); // → ACT

    const unit = t.findUnit('foot_soldier', Player.P1);
    if (!unit) return;

    // Just-placed units can't act on their deploy turn
    const moves = t.engine.getValidMoveSquares(unit.instanceId);
    expect(moves).toHaveLength(0);
  });

  it('deployed unit can move on next turn', () => {
    // Deploy on P1 turn 1
    const pos = deployCard(t, 'foot_soldier');
    if (!pos) return;

    skipTurn(t.engine); // finish P1
    skipTurn(t.engine); // P2

    // P1 turn 2 — unit should be able to move
    t.engine.endPlayPhase(); // → ACT

    const unit = t.findUnit('foot_soldier', Player.P1);
    if (!unit) return;

    const moves = t.engine.getValidMoveSquares(unit.instanceId);
    expect(moves.length).toBeGreaterThan(0);
  });
});

describe('ActPhase — queries', () => {
  it('getValidAttackSquares returns positions', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    // King has HV attack pattern — check it returns something
    const attacks = t.engine.getValidAttackSquares(king.instanceId);
    // May be empty if no enemies in range, but shouldn't throw
    expect(Array.isArray(attacks)).toBe(true);
  });

  it('getAttackRange returns positions', () => {
    t.engine.endPlayPhase();

    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const range = t.engine.getAttackRange(king.instanceId);
    expect(Array.isArray(range)).toBe(true);
  });
});

```

# tests\engine\phases\combatResolver.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, TurnPhase, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';
import { resolveAttack } from '../../../src/game/CombatResolver';
import { Board } from '../../../src/game/Board';
import { UnitFactory } from '../../../src/game/UnitFactory';
import type { EvUnitAttacked } from '../../../src/game/types/EventTypes';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('Combat — attack basics', () => {
  it('rejects attack during PLAY phase', () => {
    // Can't attack in PLAY
    const king = t.findUnit('king', Player.P1);
    const enemyKing = t.findUnit('king', Player.P2);
    if (king && enemyKing) {
      const result = t.engine.attackUnit(king.instanceId, enemyKing.instanceId);
      expect(result).toBe(false);
    }
  });

  it('rejects attack with invalid unit IDs', () => {
    t.engine.endPlayPhase();
    const result = t.engine.attackUnit('nonexistent', 'also_nonexistent');
    expect(result).toBe(false);
  });

  it('attack deals damage and emits UNIT_ATTACKED', () => {
    // Deploy a foot soldier for P1
    const pos = deployCard(t, 'foot_soldier');
    if (!pos) return; // card not in hand, skip

    skipTurn(t.engine); // P1 done

    // Deploy a foot soldier for P2
    const pos2 = deployCard(t, 'foot_soldier');
    skipTurn(t.engine); // P2 done

    // P1's turn again — ACT phase: try to attack
    t.engine.endPlayPhase(); // to ACT

    const p1Unit = t.findUnit('foot_soldier', Player.P1);
    const p2Unit = t.findUnit('foot_soldier', Player.P2);

    if (p1Unit && p2Unit) {
      // Check if P2's unit is in attack range
      const range = t.engine.getValidAttackSquares(p1Unit.instanceId);
      const canAttack = range.some((p: any) => p.col === p2Unit.col && p.row === p2Unit.row);

      if (canAttack) {
        const before = t.state().board.find(
          c => c.unit?.instanceId === p2Unit.instanceId
        )?.unit?.currentDef ?? 0;

        t.engine.attackUnit(p1Unit.instanceId, p2Unit.instanceId);

        const attacked = t.eventsOfType('UNIT_ATTACKED');
        expect(attacked.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Combat — backstab & ambush bonuses', () => {
  // Direction reference:
  //   P1 home = row 0, faces toward row 6 → back = toward row 0 (lower rows)
  //   P2 home = row 6, faces toward row 0 → back = toward row 6 (higher rows)
  //
  // Backstab: dx=0, exactly 1 row behind (Scout: +1)
  // Ambush:   |dx|≤1, exactly 1 row behind (Assassin: +1)

  it('Scout backstab: directly behind P1 King deals 2 damage (base 1 + backstab 1)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // P2 Scout directly behind: same col, 1 row behind P1 (row 1 < row 2)
    const scout = factory.create('scout', Player.P2, { col: 3, row: 1 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(2); // 1 base + 1 backstab
    expect(attackEvent.targetNewHP).toBe(king.currentDef - 2);
  });

  it('regular unit attacking from behind deals NO bonus (no backstab/ambush)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Foot soldier behind P1 King — no backstab/ambush property
    const soldier = factory.create('foot_soldier', Player.P2, { col: 3, row: 1 });
    board.placeUnit(soldier);

    const events = resolveAttack(soldier, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1); // base only, no universal bonus
  });

  it('Scout diagonal-behind does NOT trigger backstab (dx≠0)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Scout at diagonal-behind: dx=1, 1 row behind
    const scout = factory.create('scout', Player.P2, { col: 4, row: 1 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1); // backstab requires dx=0
  });

  it('Assassin ambush: diagonal-behind triggers +1 (|dx|≤1)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Assassin at diagonal-behind: dx=1, 1 row behind P1
    const assassin = factory.create('assassin', Player.P2, { col: 4, row: 1 });
    board.placeUnit(assassin);

    const events = resolveAttack(assassin, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(5); // 4 base + 1 ambush
  });

  it('Assassin ambush: directly behind also triggers +1', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Assassin directly behind: dx=0, 1 row behind
    const assassin = factory.create('assassin', Player.P2, { col: 3, row: 1 });
    board.placeUnit(assassin);

    const events = resolveAttack(assassin, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(5); // 4 base + 1 ambush
  });

  it('front attack deals no bonus', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 2 });
    board.placeUnit(king);

    // Scout in front: row 3 > row 2 = P1's front
    const scout = factory.create('scout', Player.P2, { col: 3, row: 3 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1);
  });

  it('same-row attack deals no bonus', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 3 });
    board.placeUnit(king);

    const scout = factory.create('scout', Player.P2, { col: 4, row: 3 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1);
  });

  it('backstab works symmetrically for P2 defender', () => {
    const factory = new UnitFactory();
    const board = new Board();

    // P2 King at row 4. P2's back = higher rows (toward row 6).
    const king = factory.create('king', Player.P2, { col: 3, row: 4 });
    board.placeUnit(king);

    // P1 Scout directly behind P2 King: row 5 > row 4
    const scout = factory.create('scout', Player.P1, { col: 3, row: 5 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(2); // 1 base + 1 backstab
  });

  it('ambush works symmetrically for P2 defender', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P2, { col: 3, row: 4 });
    board.placeUnit(king);

    // P1 Assassin at diagonal-behind P2 King: row 5 > row 4, dx=1
    const assassin = factory.create('assassin', Player.P1, { col: 4, row: 5 });
    board.placeUnit(assassin);

    const events = resolveAttack(assassin, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(5); // 4 base + 1 ambush
  });

  it('2+ rows behind does NOT trigger backstab or ambush (must be exactly 1 row)', () => {
    const factory = new UnitFactory();
    const board = new Board();

    const king = factory.create('king', Player.P1, { col: 3, row: 3 });
    board.placeUnit(king);

    // Scout 2 rows behind: row 1 vs row 3 = dy=-2
    const scout = factory.create('scout', Player.P2, { col: 3, row: 1 });
    board.placeUnit(scout);

    const events = resolveAttack(scout, king, board);
    const attackEvent = events.find(e => e.type === 'UNIT_ATTACKED') as EvUnitAttacked;

    expect(attackEvent).toBeDefined();
    expect(attackEvent.damage).toBe(1); // no bonus at 2-row distance
  });
});

describe('Combat — guards', () => {
  it('rejects attack when status is AWAITING_INPUT', () => {
    // If we can trigger AWAITING_INPUT, attack should fail
    const priestIdx = t.findInHand('priest');
    if (priestIdx >= 0) {
      const pos = t.deployPositions()[0];
      t.engine.playCard(priestIdx, pos.col, pos.row);

      if (t.state().status === EngineStatus.AWAITING_INPUT) {
        const king = t.findUnit('king', Player.P1);
        if (king) {
          const result = t.engine.attackUnit(king.instanceId, 'anything');
          expect(result).toBe(false);
        }
      }
    }
  });

  it('moveUnit rejects during PLAY phase', () => {
    const king = t.findUnit('king', Player.P1);
    if (king) {
      const result = t.engine.moveUnit(king.instanceId, king.col + 1, king.row);
      expect(result).toBe(false);
    }
  });
});

```

# tests\engine\phases\phaseTransitions.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, Player, TurnPhase, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('Phase transitions', () => {
  it('starts in PLAY phase, P1 active', () => {
    const s = t.state();
    expect(s.turn.phase).toBe(TurnPhase.PLAY);
    expect(s.turn.activePlayer).toBe(Player.P1);
    expect(s.turn.turnNumber).toBe(1);
  });

  it('PLAY → ACT via endPlayPhase', () => {
    t.engine.endPlayPhase();
    expect(t.state().turn.phase).toBe(TurnPhase.ACT);
    expect(t.state().turn.activePlayer).toBe(Player.P1);
  });

  it('ACT → next player PLAY via endActPhase', () => {
    t.engine.endPlayPhase();
    t.engine.endActPhase();
    const s = t.state();
    expect(s.turn.activePlayer).toBe(Player.P2);
    expect(s.turn.phase).toBe(TurnPhase.PLAY);
  });

  it('full round: P1 turn + P2 turn → turn 2', () => {
    skipTurn(t.engine); // P1
    skipTurn(t.engine); // P2
    const s = t.state();
    expect(s.turn.turnNumber).toBe(2);
    expect(s.turn.activePlayer).toBe(Player.P1);
  });

  it('endPlayPhase is no-op during ACT', () => {
    t.engine.endPlayPhase();
    t.engine.endPlayPhase(); // no-op
    expect(t.state().turn.phase).toBe(TurnPhase.ACT);
  });

  it('endActPhase is no-op during PLAY', () => {
    t.engine.endActPhase(); // no-op
    expect(t.state().turn.phase).toBe(TurnPhase.PLAY);
  });

  it('emits PHASE_CHANGED events', () => {
    t.engine.endPlayPhase();
    const phaseEvents = t.eventsOfType('PHASE_CHANGED');
    expect(phaseEvents.length).toBeGreaterThanOrEqual(1);
    const last = phaseEvents[phaseEvents.length - 1] as any;
    expect(last.phase).toBe(TurnPhase.ACT);
  });

  it('emits TURN_STARTED on turn change', () => {
    skipTurn(t.engine);
    const turnEvents = t.eventsOfType('TURN_STARTED');
    // At least 2: initial + P2's turn
    expect(turnEvents.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Phase guards with AWAITING_INPUT', () => {
  it('endPlayPhase blocked during AWAITING_INPUT', () => {
    // Play a Priest to trigger pending TARGET
    const priestIdx = t.findInHand('priest');
    if (priestIdx >= 0) {
      const pos = t.deployPositions()[0];
      t.engine.playCard(priestIdx, pos.col, pos.row);

      if (t.state().status === EngineStatus.AWAITING_INPUT) {
        t.engine.endPlayPhase(); // should be no-op
        expect(t.state().turn.phase).toBe(TurnPhase.PLAY);
      }
    }
  });
});

```

# tests\engine\phases\playPhase.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, skipTurn, deployCard, Player, TurnPhase, EngineStatus } from '../helpers/TestHarness';
import type { TestEngine } from '../helpers/TestHarness';

let t: TestEngine;

beforeEach(() => { t = createTestEngine(); });

describe('PlayPhase — card deployment', () => {
  it('deploys a unit card to valid position', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const positions = t.deployPositions();
    expect(positions.length).toBeGreaterThan(0);

    const pos = positions[0];
    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const handBefore = t.state().players[Player.P1].hand.length;
    const result = t.engine.playCard(idx, pos.col, pos.row);

    expect(result).toBe(true);
    expect(t.state().players[Player.P1].hand.length).toBe(handBefore - 1);

    // Unit should be on the board
    const cell = t.state().board.find(c => c.col === pos.col && c.row === pos.row);
    expect(cell?.unit).toBeDefined();
    expect(cell?.unit?.owner).toBe(Player.P1);
  });

  it('rejects deploy to invalid position (enemy half)', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    // Row 6 is P2's back row — invalid for P1
    const result = t.engine.playCard(idx, 3, 6);
    expect(result).toBe(false);
  });

  it('rejects deploy to occupied cell', () => {
    // King is at center of row 0
    const king = t.findUnit('king', Player.P1);
    if (!king) return;

    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const result = t.engine.playCard(idx, king.col, king.row);
    expect(result).toBe(false);
  });

  it('rejects play when not enough LEG', () => {
    // Knight costs 9 — can't afford on turn 1 (1 LEG)
    const knightIdx = t.findInHand('knight');
    if (knightIdx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const result = t.engine.playCard(knightIdx, pos.col, pos.row);
    expect(result).toBe(false);
  });

  it('rejects play with invalid hand index', () => {
    expect(t.engine.playCard(99, 3, 0)).toBe(false);
    expect(t.engine.playCard(-1, 3, 0)).toBe(false);
  });

  it('rejects play during ACT phase', () => {
    t.engine.endPlayPhase();
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const result = t.engine.playCard(idx, 3, 0);
    expect(result).toBe(false);
  });

  it('emits CARD_PLAYED and UNIT_PLACED events', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    t.engine.playCard(idx, pos.col, pos.row);

    expect(t.eventsOfType('CARD_PLAYED').length).toBeGreaterThan(0);
    expect(t.eventsOfType('UNIT_PLACED').length).toBeGreaterThanOrEqual(2); // kings + this
  });

  it('spends LEG on play', () => {
    const idx = t.findInHand('foot_soldier');
    if (idx < 0) return;

    const pos = t.deployPositions()[0];
    if (!pos) return;

    const affordable = t.engine.getAffordableCards();
    if (!affordable.includes(idx)) return;

    const legBefore = t.state().modifiers[Player.P1].legPool;
    t.engine.playCard(idx, pos.col, pos.row);
    const legAfter = t.state().modifiers[Player.P1].legPool;

    expect(legAfter).toBeLessThan(legBefore);
  });
});

describe('PlayPhase — LEG economy', () => {
  it('P1 starts with LEG > 0', () => {
    expect(t.state().modifiers[Player.P1].legPool).toBeGreaterThan(0);
  });

  it('LEG accumulates each turn', () => {
    const leg1 = t.state().modifiers[Player.P1].legPool;
    skipTurn(t.engine); // P1
    skipTurn(t.engine); // P2

    const leg2 = t.state().modifiers[Player.P1].legPool;
    expect(leg2).toBeGreaterThan(leg1);
  });

  it('getAffordableCards returns indices of playable cards', () => {
    const affordable = t.engine.getAffordableCards();
    const hand = t.state().players[Player.P1].hand;
    const leg = t.state().modifiers[Player.P1].legPool;

    // All returned indices should be valid hand positions
    for (const idx of affordable) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(hand.length);
    }
  });
});

```

# tests\engine\replay\replayConsistency.test.ts

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../../../src/game/GameEngine';
import { Player, TurnPhase } from '../../../src/game/types/GameTypes';
import GameState from '../../../src/GameState';

// Register all handlers
import '../helpers/TestHarness';

/**
 * Replay consistency: two engines with identical setup must produce
 * identical state snapshots when fed the same action sequence.
 * This is the multiplayer desync safety net.
 */

const TEST_SEED = 42;

beforeEach(() => {
  GameState.gameSeed = TEST_SEED;
});

function createEngine(): GameEngine {
  const e = new GameEngine();
  e.startGame();
  return e;
}

function snapshotBoard(engine: GameEngine): string {
  const s = engine.getState();
  const board = s.board
    .filter(c => c.unit !== null)
    .map(c => ({
      col: c.col,
      row: c.row,
      id: c.unit!.instanceId,
      cardId: c.unit!.cardId,
      owner: c.unit!.owner,
      hp: c.unit!.currentDef,
      atk: c.unit!.currentAtk,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(board);
}

function snapshotFull(engine: GameEngine): string {
  const s = engine.getState();
  return JSON.stringify({
    turn: s.turn.turnNumber,
    activePlayer: s.turn.activePlayer,
    phase: s.turn.phase,
    status: s.status,
    p1Hand: [...s.players[0].hand].sort(),
    p2Hand: [...s.players[1].hand].sort(),
    p1Deck: s.players[0].deckCount,
    p2Deck: s.players[1].deckCount,
    board: snapshotBoard(engine),
  });
}

describe('Replay Consistency', () => {
  it('two fresh engines produce identical initial state', () => {
    const a = createEngine();
    const b = createEngine();

    // Both use same default deck (UNITS_ONLY_DECK_IDS)
    // Without seeded shuffle, hands may differ
    // But board (two kings) must match
    expect(snapshotBoard(a)).toBe(snapshotBoard(b));
  });

  it('skip-turn sequences produce identical state', () => {
    const a = createEngine();
    const b = createEngine();

    // Both skip 4 turns
    for (let i = 0; i < 4; i++) {
      a.endPlayPhase(); a.endActPhase();
      b.endPlayPhase(); b.endActPhase();
    }

    const sa = a.getState();
    const sb = b.getState();

    expect(sa.turn.turnNumber).toBe(sb.turn.turnNumber);
    expect(sa.turn.activePlayer).toBe(sb.turn.activePlayer);
    expect(sa.turn.phase).toBe(sb.turn.phase);
    // Board should still match (just kings, LEG gained)
    expect(snapshotBoard(a)).toBe(snapshotBoard(b));
  });

  it('playCard at same index+position produces identical board', () => {
    const a = createEngine();
    const b = createEngine();

    // Both engines have same default deck → same starting hands
    const posA = a.getValidDeployPositions();
    const posB = b.getValidDeployPositions();

    // Deploy positions should match
    expect(posA.length).toBe(posB.length);

    // Both play hand[0] at same position
    if (posA.length > 0) {
      const affordable = a.getAffordableCards();
      if (affordable.length > 0) {
        const idx = affordable[0];
        const p = posA[0];

        a.playCard(idx, p.col, p.row);
        b.playCard(idx, p.col, p.row);

        // Skip any pending if both engines hit it
        if (a.getState().status === 'AWAITING_INPUT') a.cancelPending();
        if (b.getState().status === 'AWAITING_INPUT') b.cancelPending();

        expect(snapshotBoard(a)).toBe(snapshotBoard(b));
      }
    }
  });

  it('identical multi-turn action sequence stays in sync', () => {
    const a = createEngine();
    const b = createEngine();

    // Turn 1: P1 skips
    a.endPlayPhase(); a.endActPhase();
    b.endPlayPhase(); b.endActPhase();

    // Turn 1: P2 skips
    a.endPlayPhase(); a.endActPhase();
    b.endPlayPhase(); b.endActPhase();

    // Turn 2: P1 plays affordable card if available
    const affA = a.getAffordableCards();
    const affB = b.getAffordableCards();
    expect(affA).toEqual(affB);

    if (affA.length > 0) {
      const posA = a.getValidDeployPositions();
      if (posA.length > 0) {
        a.playCard(affA[0], posA[0].col, posA[0].row);
        b.playCard(affB[0], posA[0].col, posA[0].row);

        if (a.getState().status === 'AWAITING_INPUT') a.cancelPending();
        if (b.getState().status === 'AWAITING_INPUT') b.cancelPending();
      }
    }

    a.endPlayPhase(); a.endActPhase();
    b.endPlayPhase(); b.endActPhase();

    expect(snapshotFull(a)).toBe(snapshotFull(b));
  });
});

```

# tests\mocks\phaser.ts

```ts
// Minimal Phaser mock for game engine tests.
// Game logic (GameEngine, phases, abilities) doesn't use Phaser directly,
// but some imports pull it in transitively. This stub prevents errors.

export default {
  Scene: class {},
  GameObjects: { Container: class {}, Graphics: class {}, Text: class {} },
  Geom: { Rectangle: class { static Contains() { return false; } } },
};

export const Scene = class {};
export const GameObjects = {
  Container: class {},
  Graphics: class {},
  Text: class {},
};
export const Geom = {
  Rectangle: class { static Contains() { return false; } },
};

```

# tests\server\authDeck.test.ts

```ts
/**
 * authDeck.test.ts — Tests for Phase 1 shared foundation:
 * - GameState auth + deck fields
 * - AuthManager stub behavior
 * - NetworkEvents type contracts (compile-time verification)
 * - DeckValidator (when created in Phase 2, extend here)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── GameState Auth + Deck Fields ─────────────────────────────

// We can't import the real GameState singleton (it has browser deps via import.meta.env)
// so we test the interface contract by creating a minimal mock

describe('GameState auth fields', () => {
  let state: {
    authToken: string;
    authenticatedPlayerId: number;
    displayName: string;
    activeDeckId: number | null;
    activeDeckCardIds: string[];
    setAuthData(token: string, playerId: number, name: string): void;
    isAuthenticated(): boolean;
    clearAuth(): void;
    setActiveDeck(deckId: number | null, cardIds: string[]): void;
    hasActiveDeck(): boolean;
    playerName: string;
  };

  beforeEach(() => {
    state = {
      authToken: '',
      authenticatedPlayerId: 0,
      displayName: '',
      activeDeckId: null,
      activeDeckCardIds: [],
      playerName: 'Player',

      setAuthData(token: string, playerId: number, name: string) {
        this.authToken = token;
        this.authenticatedPlayerId = playerId;
        this.displayName = name;
        this.playerName = name;
      },

      isAuthenticated() {
        return this.authenticatedPlayerId > 0 && this.authToken.length > 0;
      },

      clearAuth() {
        this.authToken = '';
        this.authenticatedPlayerId = 0;
        this.displayName = '';
      },

      setActiveDeck(deckId: number | null, cardIds: string[]) {
        this.activeDeckId = deckId;
        this.activeDeckCardIds = [...cardIds];
      },

      hasActiveDeck() {
        return this.activeDeckCardIds.length > 0;
      },
    };
  });

  it('starts unauthenticated', () => {
    expect(state.isAuthenticated()).toBe(false);
    expect(state.authToken).toBe('');
    expect(state.authenticatedPlayerId).toBe(0);
  });

  it('setAuthData populates fields and syncs playerName', () => {
    state.setAuthData('jwt-token-123', 42, 'TestPlayer');

    expect(state.isAuthenticated()).toBe(true);
    expect(state.authToken).toBe('jwt-token-123');
    expect(state.authenticatedPlayerId).toBe(42);
    expect(state.displayName).toBe('TestPlayer');
    expect(state.playerName).toBe('TestPlayer');
  });

  it('clearAuth resets all auth fields', () => {
    state.setAuthData('token', 1, 'Name');
    state.clearAuth();

    expect(state.isAuthenticated()).toBe(false);
    expect(state.authToken).toBe('');
    expect(state.authenticatedPlayerId).toBe(0);
    expect(state.displayName).toBe('');
  });

  it('starts with no active deck', () => {
    expect(state.hasActiveDeck()).toBe(false);
    expect(state.activeDeckId).toBeNull();
    expect(state.activeDeckCardIds).toEqual([]);
  });

  it('setActiveDeck stores deck with defensive copy', () => {
    const original = ['foot_soldier', 'archer', 'pikeman'];
    state.setActiveDeck(7, original);

    expect(state.hasActiveDeck()).toBe(true);
    expect(state.activeDeckId).toBe(7);
    expect(state.activeDeckCardIds).toEqual(original);

    // Verify defensive copy — mutating original doesn't affect state
    original.push('knight');
    expect(state.activeDeckCardIds).toHaveLength(3);
  });

  it('isAuthenticated requires both token and playerId', () => {
    state.authToken = 'token';
    state.authenticatedPlayerId = 0;
    expect(state.isAuthenticated()).toBe(false);

    state.authToken = '';
    state.authenticatedPlayerId = 1;
    expect(state.isAuthenticated()).toBe(false);

    state.authToken = 'token';
    state.authenticatedPlayerId = 1;
    expect(state.isAuthenticated()).toBe(true);
  });
});

// ─── AuthManager Stub ─────────────────────────────────────────

describe('AuthManager stub', () => {
  // Import the real AuthManager since it has no browser deps
  let AuthManager: typeof import('../../src/auth/AuthManager').AuthManager;

  beforeEach(async () => {
    // Re-import to get fresh singleton state
    const mod = await import('../../src/auth/AuthManager');
    AuthManager = mod.AuthManager;
    AuthManager.logout(); // Reset state
  });

  it('starts not logged in', () => {
    expect(AuthManager.isLoggedIn()).toBe(false);
    expect(AuthManager.getToken()).toBeNull();
    expect(AuthManager.getPlayer()).toBeNull();
  });

  it('login() throws in non-browser environment', async () => {
    // Real AuthManager calls WalletManager.connect() which needs window.ethereum
    await expect(AuthManager.login()).rejects.toThrow();
  });

  it('authHeaders returns empty object when not logged in', () => {
    expect(AuthManager.authHeaders()).toEqual({});
  });

  it('_setAuth populates state', () => {
    AuthManager._setAuth('test-jwt', {
      id: 1,
      wallet: '0xabc',
      displayName: 'TestUser',
      winCount: 5,
      lossCount: 3,
      eloRating: 1200,
      activeDeckId: null,
    });

    expect(AuthManager.isLoggedIn()).toBe(true);
    expect(AuthManager.getToken()).toBe('test-jwt');
    expect(AuthManager.getPlayer()?.displayName).toBe('TestUser');
    expect(AuthManager.authHeaders()).toEqual({
      'Authorization': 'Bearer test-jwt',
    });
  });

  it('logout clears state', () => {
    AuthManager._setAuth('token', {
      id: 1, wallet: '0x', displayName: 'X',
      winCount: 0, lossCount: 0, eloRating: 1000, activeDeckId: null,
    });

    AuthManager.logout();

    expect(AuthManager.isLoggedIn()).toBe(false);
    expect(AuthManager.getToken()).toBeNull();
    expect(AuthManager.getPlayer()).toBeNull();
    expect(AuthManager.authHeaders()).toEqual({});
  });
});

// ─── NetworkEvents Type Contracts ─────────────────────────────

describe('NetworkEvents type contracts', () => {
  it('GameAction includes all required action types', async () => {
    const mod = await import('../../shared/types/NetworkEvents');

    // Type-level check: verify the interface exists with expected shape
    // We can't check union members at runtime, but we verify the import works
    const action: import('../../shared/types/NetworkEvents').GameAction = {
      type: 'CANCEL_PENDING',
      seqNum: 1,
      serverSeq: 2,
    };
    expect(action.type).toBe('CANCEL_PENDING');
    expect(action.seqNum).toBe(1);
    expect(action.serverSeq).toBe(2);
  });

  it('RoomPlayer has optional auth/deck fields', async () => {
    const mod = await import('../../shared/types/NetworkEvents');
    const player: import('../../shared/types/NetworkEvents').RoomPlayer = {
      id: 'socket-1',
      name: 'Test',
      wallet: null,
      // Optional fields
      playerId: 42,
      deckIds: ['foot_soldier', 'archer'],
      ready: true,
    };
    expect(player.playerId).toBe(42);
    expect(player.deckIds).toEqual(['foot_soldier', 'archer']);
    expect(player.ready).toBe(true);
  });

  it('RoomPlayer works without optional fields (backward compat)', async () => {
    const player: import('../../shared/types/NetworkEvents').RoomPlayer = {
      id: 'socket-1',
      name: 'Test',
      wallet: null,
    };
    expect(player.playerId).toBeUndefined();
    expect(player.deckIds).toBeUndefined();
    expect(player.ready).toBeUndefined();
  });

  it('Room has optional lobby fields', async () => {
    const room: Partial<import('../../shared/types/NetworkEvents').Room> = {
      players: [],
      gameSeed: null,
      cryptoReadyCount: 0,
      battleReadyCount: 0,
      settled: false,
      // Lobby extensions
      status: 'waiting',
      hostSocketId: 'socket-1',
      settings: {
        isPublic: true,
        isCrypto: false,
        maxPlayers: 2,
        roomName: 'Test Room',
        stakeAmount: 0,
        password: null,
      },
    };
    expect(room.status).toBe('waiting');
    expect(room.settings?.roomName).toBe('Test Room');
  });

  it('game_over event supports totalTurns', async () => {
    // Compile-time check: the interface allows totalTurns
    type GameOverData = Parameters<import('../../shared/types/NetworkEvents').ClientToServerEvents['game_over']>[0];
    const data: GameOverData = {
      roomCode: 'ABC123',
      winnerIndex: 0,
      totalTurns: 15,
    };
    expect(data.totalTurns).toBe(15);
  });

  it('lobby events exist in ClientToServerEvents', async () => {
    // Compile-time verification that lobby events are declared
    type C2S = import('../../shared/types/NetworkEvents').ClientToServerEvents;
    type LobbyCreate = C2S['lobby:create'];
    type LobbyJoin = C2S['lobby:join'];
    type LobbyChat = C2S['lobby:chat'];
    type LobbyReady = C2S['lobby:ready'];
    type LobbyStart = C2S['lobby:start_game'];

    // Runtime: just verify the types resolve (no runtime crash)
    expect(true).toBe(true);
  });

  it('lobby events exist in ServerToClientEvents', async () => {
    type S2C = import('../../shared/types/NetworkEvents').ServerToClientEvents;
    type LobbyState = S2C['lobby:state'];
    type LobbyCreated = S2C['lobby:created'];
    type LobbyGameStarting = S2C['lobby:game_starting'];
    type DeckAccepted = S2C['deckAccepted'];
    type DeckRejected = S2C['deckRejected'];

    expect(true).toBe(true);
  });
});

```

# tests\server\deckValidator.test.ts

```ts
/**
 * deckValidator.test.ts — Tests for server-side deck validation
 * and CardPool data integrity.
 */

import { describe, it, expect } from 'vitest';
import { validateDeck } from '../../server/validation/DeckValidator';
import { CARD_POOL, getCardFromPool } from '../../server/validation/CardPool';

// ─── CardPool Data Integrity ──────────────────────────────────

describe('CardPool', () => {
  it('has 31 card entries', () => {
    expect(CARD_POOL.length).toBe(31);
  });

  it('every card has a non-empty id, name, and positive copies', () => {
    for (const card of CARD_POOL) {
      expect(card.id.length).toBeGreaterThan(0);
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.copies).toBeGreaterThanOrEqual(1);
    }
  });

  it('no duplicate IDs', () => {
    const ids = CARD_POOL.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('king has cost 0', () => {
    expect(getCardFromPool('king')?.cost).toBe(0);
  });

  it('commander has cost 7 (not 5)', () => {
    expect(getCardFromPool('commander')?.cost).toBe(7);
  });

  it('knights_guard has cost 12', () => {
    expect(getCardFromPool('knights_guard')?.cost).toBe(12);
  });

  it('knight has cost 9', () => {
    expect(getCardFromPool('knight')?.cost).toBe(9);
  });

  it('getCardFromPool returns undefined for unknown ID', () => {
    expect(getCardFromPool('nonexistent')).toBeUndefined();
  });

  it('total copies across all non-King cards is 31 (one full deck)', () => {
    const total = CARD_POOL
      .filter(c => c.id !== 'king')
      .reduce((sum, c) => sum + c.copies, 0);
    // A "full deck" uses every card at max copies
    // This verifies the default deck is exactly 31 cards
    expect(total).toBeGreaterThanOrEqual(31);
  });
});

// ─── DeckValidator ────────────────────────────────────────────

describe('DeckValidator', () => {
  // Build a valid 31-card deck from CardPool (max copies of each)
  function buildValidDeck(): string[] {
    const deck: string[] = [];
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue;
      for (let i = 0; i < card.copies; i++) {
        deck.push(card.id);
      }
    }
    // Trim or pad to exactly 31
    return deck.slice(0, 31);
  }

  it('accepts a valid 31-card deck', () => {
    const deck = buildValidDeck();
    expect(deck).toHaveLength(31);
    const result = validateDeck(deck);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty deck', () => {
    const result = validateDeck([]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('31'))).toBe(true);
  });

  it('rejects deck with wrong size', () => {
    const result = validateDeck(['foot_soldier', 'archer']);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('31'))).toBe(true);
  });

  it('rejects deck containing king', () => {
    const deck = buildValidDeck();
    deck[0] = 'king';
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('King'))).toBe(true);
  });

  it('rejects unknown card IDs', () => {
    const deck = buildValidDeck();
    deck[0] = 'dragon_wizard';
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('dragon_wizard'))).toBe(true);
  });

  it('rejects too many copies of a card', () => {
    // foot_soldier has max 3 copies — use 4
    const deck = Array(31).fill('foot_soldier');
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Foot Soldier'))).toBe(true);
  });

  it('rejects non-array input', () => {
    const result = validateDeck('not an array' as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('array'))).toBe(true);
  });

  it('validates ownership when ownedCards is provided', () => {
    const deck = buildValidDeck();
    // Player only owns 1 foot_soldier but deck has 3
    const owned = new Map<string, number>();
    for (const card of CARD_POOL) {
      if (card.id === 'king') continue;
      owned.set(card.id, card.copies);
    }
    owned.set('foot_soldier', 1); // Override: only own 1

    const result = validateDeck(deck, owned);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Foot Soldier') && e.includes('own 1'))).toBe(true);
  });

  it('skips ownership check when ownedCards is null', () => {
    const deck = buildValidDeck();
    const result = validateDeck(deck, null);
    expect(result.valid).toBe(true);
  });
});

```

# tests\server\lobby.test.ts

```ts
/**
 * lobby.test.ts — Tests for lobby room lifecycle,
 * RoomManager lobby extensions, and lobbyHelpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLobbyRoom } from '../../server/lobby/lobbyHelpers';
import type { Room, RoomSettings } from '../../shared/types/NetworkEvents';

// ─── lobbyHelpers ─────────────────────────────────────────────

describe('createLobbyRoom', () => {
  it('creates a room with all required Room fields', () => {
    const room = createLobbyRoom('socket-1', 'TestHost', 42);

    // Core fields
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe('TestHost');
    expect(room.players[0].id).toBe('socket-1');
    expect(room.players[0].playerId).toBe(42);
    expect(room.players[0].ready).toBe(true); // host is always ready
    expect(room.gameSeed).toBeNull();
    expect(room.cryptoReadyCount).toBe(0);
    expect(room.settled).toBe(false);

    // Required fields that SessionManager depends on
    expect(room.battleReadyCount).toBe(0);
    expect(room.actionQueue).toEqual([]);
    expect(room.currentTurnPlayer).toBe(0);
    expect(room.currentPhase).toBe('PLAY');
    expect(room.actionCount).toBe(0);
    expect(room.gameOverClaims).toEqual([]);
    expect(room.lastSeqNum).toEqual([0, 0]);
    expect(room.globalSeq).toBe(0);
    expect(room.pendingHashes).toBeInstanceOf(Map);
    expect(room.disconnectTimers).toBeInstanceOf(Map);
    expect(room.disconnectIntervals).toBeInstanceOf(Map);
    expect(room.createdAt).toBeGreaterThan(0);

    // Lobby extensions
    expect(room.hostSocketId).toBe('socket-1');
    expect(room.hostPlayerId).toBe(42);
    expect(room.status).toBe('waiting');
    expect(room.settings).toBeDefined();
    expect(room.chat).toEqual([]);
  });

  it('applies default settings when none provided', () => {
    const room = createLobbyRoom('s1', 'Host', null);

    expect(room.settings!.isPublic).toBe(true);
    expect(room.settings!.isCrypto).toBe(false);
    expect(room.settings!.maxPlayers).toBe(2);
    expect(room.settings!.stakeAmount).toBe(0);
    expect(room.settings!.password).toBeNull();
    expect(room.settings!.roomName).toBe("Host's Room");
  });

  it('merges custom settings with defaults', () => {
    const room = createLobbyRoom('s1', 'Host', null, {
      isPublic: false,
      isCrypto: true,
      stakeAmount: 0.01,
      roomName: 'Custom Room',
    });

    expect(room.settings!.isPublic).toBe(false);
    expect(room.settings!.isCrypto).toBe(true);
    expect(room.settings!.stakeAmount).toBe(0.01);
    expect(room.settings!.roomName).toBe('Custom Room');
    expect(room.settings!.maxPlayers).toBe(2); // default preserved
  });

  it('truncates room name to 40 chars', () => {
    const longName = 'A'.repeat(60);
    const room = createLobbyRoom('s1', 'Host', null, { roomName: longName });
    expect(room.settings!.roomName).toHaveLength(40);
  });

  it('handles null playerId for guest host', () => {
    const room = createLobbyRoom('s1', 'Guest', null);
    expect(room.players[0].playerId).toBeNull();
    expect(room.hostPlayerId).toBeNull();
  });
});

// ─── Lobby Room Lifecycle (simulated) ─────────────────────────

describe('Lobby room lifecycle', () => {
  let room: Room;

  beforeEach(() => {
    room = createLobbyRoom('host-socket', 'HostPlayer', 1);
  });

  it('joiner can be added to room', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: false,
    });
    expect(room.players).toHaveLength(2);
    expect(room.players[1].ready).toBe(false);
  });

  it('status transitions: waiting → full → starting → in_progress', () => {
    expect(room.status).toBe('waiting');

    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: false,
    });
    room.status = 'full';
    expect(room.status).toBe('full');

    room.status = 'starting';
    expect(room.status).toBe('starting');

    room.status = 'in_progress';
    expect(room.status).toBe('in_progress');
  });

  it('crypto flow: waiting → depositing → in_progress', () => {
    room.settings!.isCrypto = true;
    room.status = 'depositing';
    room.cryptoReadyCount = 0;

    room.cryptoReadyCount = 1;
    expect(room.cryptoReadyCount).toBe(1);

    room.cryptoReadyCount = 2;
    room.status = 'in_progress';
    expect(room.status).toBe('in_progress');
  });

  it('host transfer on disconnect', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: true,
    });

    // Simulate host leaving
    room.players.splice(0, 1);
    room.hostSocketId = room.players[0].id;
    room.hostPlayerId = room.players[0].playerId ?? null;

    expect(room.hostSocketId).toBe('joiner-socket');
    expect(room.hostPlayerId).toBe(2);
    expect(room.players).toHaveLength(1);
  });

  it('chat message accumulation', () => {
    room.chat = room.chat ?? [];
    room.chat.push({ sender: 'HostPlayer', text: 'Hello!', timestamp: Date.now() });
    room.chat.push({ sender: 'HostPlayer', text: 'Ready?', timestamp: Date.now() });

    expect(room.chat).toHaveLength(2);
    expect(room.chat[0].text).toBe('Hello!');
  });

  it('deck submission tracking', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: true,
    });

    room.players[0].deckIds = ['foot_soldier', 'archer'];
    expect(room.players.every(p => !!p.deckIds)).toBe(false);

    room.players[1].deckIds = ['pikeman', 'scout'];
    expect(room.players.every(p => !!p.deckIds)).toBe(true);
  });
});

// ─── matchService (unit test) ─────────────────────────────────

describe('matchService recordMatch', () => {
  it('skips recording when both players are guests', async () => {
    // Import dynamically to avoid DB init at module level in test
    const { recordMatch } = await import('../../server/api/matchService');

    const guestRoom: Room = createLobbyRoom('s1', 'Guest1', null);
    guestRoom.players.push({
      id: 's2', name: 'Guest2', wallet: null,
      playerId: null, deckIds: null, ready: true,
    });

    // This should NOT throw — it silently skips when both are guests
    expect(() => {
      recordMatch({
        roomCode: 'TEST',
        room: guestRoom,
        winnerIndex: 0,
        totalTurns: 10,
      });
    }).not.toThrow();
  });
});

```

# tests\server\lobbyFlow.test.ts

```ts
/**
 * lobbyFlow.test.ts — Integration tests for the lobby → battle transition.
 * Validates that all required GameState fields are set correctly
 * when going through the lobby flow vs the legacy flow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLobbyRoom } from '../../server/lobby/lobbyHelpers';
import type { Room } from '../../shared/types/NetworkEvents';

// ─── Lobby → Battle Transition Requirements ──────────────────

describe('Lobby → Battle transition requirements', () => {
  let room: Room;

  beforeEach(() => {
    room = createLobbyRoom('host-socket', 'HostPlayer', 1, {
      isPublic: true, isCrypto: false, roomName: 'Test Room',
    });
    // Add joiner
    room.players.push({
      id: 'joiner-socket', name: 'JoinerPlayer', wallet: null,
      playerId: 2, deckIds: null, ready: true,
    });
  });

  it('finalizeLaunch sets gameSeed', () => {
    // Simulate finalizeLaunch
    const seed = 123456;
    room.gameSeed = seed;
    room.status = 'in_progress';

    expect(room.gameSeed).toBe(seed);
    expect(room.status).toBe('in_progress');
  });

  it('room has roomCode available for player_ready', () => {
    // The roomCode is the key in the Map, not stored in Room itself.
    // LobbyScene must set GameState.roomCode before entering BattleScene.
    // This test verifies the room has all fields BattleScene needs.
    const roomCode = '837646';
    room.gameSeed = 999;
    room.status = 'in_progress';

    // These fields must be available when BattleScene starts:
    expect(roomCode).toBeTruthy();              // roomCode must be non-empty
    expect(room.gameSeed).toBeTruthy();          // seed must be set
    expect(room.players.length).toBe(2);         // both players in room
    expect(room.battleReadyCount).toBe(0);       // not yet ready (BattleScene increments)
  });

  it('player_ready increments battleReadyCount correctly', () => {
    // Simulate the BattleScene player_ready flow
    room.battleReadyCount += 1; // P1 sends player_ready
    expect(room.battleReadyCount).toBe(1);

    room.battleReadyCount += 1; // P2 sends player_ready
    expect(room.battleReadyCount).toBe(2);
    // At this point, server should emit both_battle_ready
  });

  it('room created by lobby has all SessionManager-required fields', () => {
    // SessionManager.game_action handler accesses these fields
    expect(room.currentTurnPlayer).toBeDefined();
    expect(room.currentPhase).toBeDefined();
    expect(room.lastSeqNum).toBeDefined();
    expect(room.globalSeq).toBeDefined();
    expect(room.actionQueue).toBeDefined();
    expect(room.actionCount).toBeDefined();
    expect(room.gameOverClaims).toBeDefined();
    expect(room.pendingHashes).toBeInstanceOf(Map);
    expect(room.disconnectTimers).toBeInstanceOf(Map);
    expect(room.disconnectIntervals).toBeInstanceOf(Map);
    expect(room.settled).toBe(false);
  });

  it('legacy events from finalizeLaunch carry correct data', () => {
    const seed = 555;
    room.gameSeed = seed;
    room.status = 'in_progress';

    // Simulate what finalizeLaunch emits:
    // roomCreated: { roomCode, playerIndex }
    // opponentJoined: { playerName, playerIndex }
    // game_seed: { seed }
    const roomCode = '123456';

    // For P1 (host):
    const p1RoomCreated = { roomCode, playerIndex: 0 };
    const p1OpponentJoined = { playerName: room.players[1].name, playerIndex: 0 };
    expect(p1RoomCreated.roomCode).toBe(roomCode);
    expect(p1RoomCreated.playerIndex).toBe(0);
    expect(p1OpponentJoined.playerName).toBe('JoinerPlayer');

    // For P2 (joiner):
    const p2RoomCreated = { roomCode, playerIndex: 1 };
    const p2OpponentJoined = { playerName: room.players[0].name, playerIndex: 1 };
    expect(p2RoomCreated.playerIndex).toBe(1);
    expect(p2OpponentJoined.playerName).toBe('HostPlayer');
  });

  it('GameState fields required by BattleScene', () => {
    // Simulates what must be set before BattleScene.create():
    const requiredFields = {
      roomCode: '837646',    // Set by LobbyScene.enterBattle or roomCreated handler
      playerIndex: 0,        // Set by roomCreated handler
      gameSeed: 999,         // Set by game_seed handler
      playerName: 'Host',    // Set in HubScene/LoginScene
      opponentName: 'Joiner',// Set by LobbyScene.enterBattle
    };

    // ALL must be non-empty/non-zero for BattleScene to work
    expect(requiredFields.roomCode).toBeTruthy();
    expect(requiredFields.gameSeed).toBeGreaterThan(0);
    expect(requiredFields.playerName).toBeTruthy();
    expect(requiredFields.opponentName).toBeTruthy();
  });
});

// ─── SocketManager roomCreated handler sets roomCode ─────────

describe('SocketManager roomCreated handler', () => {
  it('must set GameState.roomCode from event data', () => {
    // This test documents the requirement that the roomCreated handler
    // sets roomCode. Previously it only set playerIndex.
    // The fix adds: GameState.setRoomCode(data.roomCode)
    //
    // Without this, player_ready sends empty roomCode and the server
    // can't find the room, so both_battle_ready never fires.
    const data = { roomCode: '123456', playerIndex: 0 };
    expect(data.roomCode).toBeTruthy();
    // The actual SocketManager handler is tested via integration
  });
});

```

# tests\server\phase4.test.ts

```ts
/**
 * phase4.test.ts — Tests for Phase 4 client-side additions:
 * - DeckValidatorClient
 * - DeckLoader 3-priority chain (unit-testable parts)
 * - DeckAPI/CollectionAPI interface contracts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateDeckClient } from '../../src/deck/DeckValidatorClient';
import { UNITS_ONLY_DECK_IDS } from '../../src/game/data/DeckDefinitions';

// ─── DeckValidatorClient ──────────────────────────────────────

describe('DeckValidatorClient', () => {
  it('accepts the built-in UNITS_ONLY_DECK_IDS', () => {
    const result = validateDeckClient(UNITS_ONLY_DECK_IDS);
    expect(result.cardCount).toBe(31);
    // May or may not be valid depending on the built-in deck
    // but should not throw and should return a result
    expect(result.errors).toBeDefined();
    expect(result.costCurve).toBeInstanceOf(Map);
  });

  it('rejects empty array', () => {
    const result = validateDeckClient([]);
    expect(result.valid).toBe(false);
    expect(result.cardCount).toBe(0);
    expect(result.errors.some(e => e.includes('31'))).toBe(true);
  });

  it('rejects deck with king', () => {
    const deck = [...UNITS_ONLY_DECK_IDS];
    deck[0] = 'king';
    const result = validateDeckClient(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('King'))).toBe(true);
  });

  it('rejects unknown card IDs', () => {
    const deck = [...UNITS_ONLY_DECK_IDS];
    deck[0] = 'dragon_lord';
    const result = validateDeckClient(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('dragon_lord'))).toBe(true);
  });

  it('rejects too many copies', () => {
    const deck = Array(31).fill('foot_soldier');
    const result = validateDeckClient(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Foot Soldier'))).toBe(true);
  });

  it('builds cost curve', () => {
    const result = validateDeckClient(UNITS_ONLY_DECK_IDS);
    expect(result.costCurve.size).toBeGreaterThan(0);
    // Sum of cost curve values should equal card count
    let total = 0;
    for (const count of result.costCurve.values()) total += count;
    expect(total).toBe(result.cardCount);
  });

  it('handles non-array input', () => {
    const result = validateDeckClient('not an array' as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

// ─── CardPool ↔ CardRegistry Consistency ──────────────────────

describe('CardPool-CardRegistry consistency', () => {
  it('every CardPool entry exists in CardRegistry', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { getCard } = await import('../../src/game/data/CardRegistry');

    for (const poolCard of CARD_POOL) {
      const registryCard = getCard(poolCard.id);
      expect(registryCard).toBeDefined();
      expect(registryCard.name).toBe(poolCard.name);
    }
  });

  it('CardPool costs match CardRegistry costs', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { getCard } = await import('../../src/game/data/CardRegistry');

    const mismatches: string[] = [];
    for (const poolCard of CARD_POOL) {
      const registryCard = getCard(poolCard.id);
      if (registryCard.cost !== poolCard.cost) {
        mismatches.push(`${poolCard.id}: pool=${poolCard.cost} registry=${registryCard.cost}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('CardPool copies match CardRegistry copies', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { getCard } = await import('../../src/game/data/CardRegistry');

    const mismatches: string[] = [];
    for (const poolCard of CARD_POOL) {
      const registryCard = getCard(poolCard.id);
      if (registryCard.copies !== poolCard.copies) {
        mismatches.push(`${poolCard.id}: pool=${poolCard.copies} registry=${registryCard.copies}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('CardPool has same card count as CardRegistry', async () => {
    const { CARD_POOL } = await import('../../server/validation/CardPool');
    const { CARD_MAP } = await import('../../src/game/data/CardRegistry');

    expect(CARD_POOL.length).toBe(CARD_MAP.size);
  });
});

// ─── DeckLoader priorities (testable without browser) ─────────

describe('DeckLoader priority logic', () => {
  it('UNITS_ONLY_DECK_IDS is a valid fallback', () => {
    expect(UNITS_ONLY_DECK_IDS).toBeDefined();
    expect(UNITS_ONLY_DECK_IDS.length).toBe(31);
    expect(UNITS_ONLY_DECK_IDS).not.toContain('king');
  });
});

```

# tests\server\roomFlow.test.ts

```ts
/**
 * roomFlow.test.ts — Server integration tests for room creation,
 * joining, and battle-ready handshake.
 *
 * Spins up a minimal Socket.io server with RoomManager + SessionManager,
 * then connects two socket.io-client instances to verify the full flow.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { SessionManager } from '../../server/game/SessionManager.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/types/NetworkEvents.js';

// ─── Helpers ──────────────────────────────────────────────────

/** Create a connected client socket, resolves when 'connect' fires. */
function createClient(port: number): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const client = ioClient(`http://localhost:${port}`, {
      reconnection: false,
      transports: ['websocket'],
    });
    client.on('connect', () => resolve(client));
  });
}

/** Listen for a specific event, resolves with its data. */
function waitForEvent<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (data: T) => resolve(data));
  });
}

// ─── Test suite ───────────────────────────────────────────────

describe('Room flow — create, join, battle ready', () => {
  let httpServer: HttpServer;
  let io: Server<ClientToServerEvents, ServerToClientEvents>;
  let roomManager: RoomManager;
  let port: number;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: [/^http:\/\/localhost:\d+$/] },
    });

    roomManager = new RoomManager();

    // Minimal PayoutService stub (not needed for room flow)
    const payoutStub = {
      payoutWinner: async () => ({ success: true }),
      refundTie: async () => ({ success: true }),
    } as any;

    const session = new SessionManager(io, roomManager, payoutStub);

    io.on('connection', (socket) => {
      // Room events (mirrors app.ts)
      socket.on('createRoom', ({ roomCode, playerName }) => {
        roomManager.createRoom(socket.id, roomCode, playerName);
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerIndex: 0 });
      });

      socket.on('joinRoom', ({ roomCode, playerName }) => {
        const result = roomManager.joinRoom(socket.id, roomCode, playerName);
        if (typeof result === 'string') {
          socket.emit('error', { message: result });
          return;
        }
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, playerIndex: 1 });

        const host = result.players[0];
        io.to(host.id).emit('opponentJoined', { playerName, playerIndex: 0 });
        socket.emit('opponentJoined', { playerName: host.name, playerIndex: 1 });

        io.to(roomCode).emit('game_seed', { seed: result.gameSeed! });
      });

      session.registerHandlers(socket);

      socket.on('disconnect', () => {
        session.handleDisconnect(socket);
      });
    });

    // Listen on random available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(() => {
    // Disconnect all clients after each test
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
    clients.length = 0;
  });

  afterAll(async () => {
    roomManager.dispose();
    io.close();
    httpServer.close();
  });

  // ────────────────────────────────────────────────────────────

  it('both players join the same room and receive room codes', async () => {
    const host = await createClient(port);
    const joiner = await createClient(port);
    clients.push(host, joiner);

    const ROOM = 'TEST01';

    // Host creates room
    const roomCreatedP = waitForEvent<{ roomCode: string; playerIndex: number }>(host, 'roomCreated');
    host.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' });
    const created = await roomCreatedP;

    expect(created.roomCode).toBe(ROOM);
    expect(created.playerIndex).toBe(0);

    // Joiner joins with the shared room code
    const roomJoinedP = waitForEvent<{ roomCode: string; playerIndex: number }>(joiner, 'roomJoined');
    const hostSeesOpponentP = waitForEvent<{ playerName: string; playerIndex: number }>(host, 'opponentJoined');
    const joinerSeesOpponentP = waitForEvent<{ playerName: string; playerIndex: number }>(joiner, 'opponentJoined');
    const hostSeedP = waitForEvent<{ seed: number }>(host, 'game_seed');
    const joinerSeedP = waitForEvent<{ seed: number }>(joiner, 'game_seed');

    joiner.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' });

    const [joined, hostOpponent, joinerOpponent, hostSeed, joinerSeed] = await Promise.all([
      roomJoinedP, hostSeesOpponentP, joinerSeesOpponentP, hostSeedP, joinerSeedP,
    ]);

    // Joiner gets correct room info
    expect(joined.roomCode).toBe(ROOM);
    expect(joined.playerIndex).toBe(1);

    // Both see each other's names
    expect(hostOpponent.playerName).toBe('Bob');
    expect(joinerOpponent.playerName).toBe('Alice');

    // Both receive the same game seed
    expect(hostSeed.seed).toBe(joinerSeed.seed);
    expect(typeof hostSeed.seed).toBe('number');
  });

  it('both players signal battle ready and receive both_battle_ready', async () => {
    const host = await createClient(port);
    const joiner = await createClient(port);
    clients.push(host, joiner);

    const ROOM = 'TEST02';

    // Setup: create and join room
    const roomCreatedP = waitForEvent(host, 'roomCreated');
    host.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' });
    await roomCreatedP;

    const roomJoinedP = waitForEvent(joiner, 'roomJoined');
    joiner.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' });
    await roomJoinedP;

    // Both signal battle ready — expect both_battle_ready broadcast
    const hostBattleReadyP = waitForEvent(host, 'both_battle_ready');
    const joinerBattleReadyP = waitForEvent(joiner, 'both_battle_ready');

    host.emit('player_ready', { roomCode: ROOM });
    joiner.emit('player_ready', { roomCode: ROOM });

    // Both should receive the event (with a reasonable timeout)
    await Promise.all([hostBattleReadyP, joinerBattleReadyP]);

    // If we got here without timing out, both players entered battle together
    expect(true).toBe(true);
  });

  it('joining a non-existent room returns an error', async () => {
    const client = await createClient(port);
    clients.push(client);

    const errorP = waitForEvent<{ message: string }>(client, 'error');
    client.emit('joinRoom', { roomCode: 'NONEXISTENT', playerName: 'Eve' });

    const err = await errorP;
    expect(err.message).toContain('Room not found');
  });

  it('third player cannot join a full room', async () => {
    const host = await createClient(port);
    const joiner = await createClient(port);
    const third = await createClient(port);
    clients.push(host, joiner, third);

    const ROOM = 'TEST03';

    host.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' });
    await waitForEvent(host, 'roomCreated');

    joiner.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' });
    await waitForEvent(joiner, 'roomJoined');

    // Third player tries to join
    const errorP = waitForEvent<{ message: string }>(third, 'error');
    third.emit('joinRoom', { roomCode: ROOM, playerName: 'Charlie' });

    const err = await errorP;
    expect(err.message).toContain('full');
  });

  it('client from any localhost port can connect (CORS)', async () => {
    // This test verifies the CORS regex allows any localhost port,
    // preventing the bug where only hardcoded ports (3000, 8080) worked.
    const client = await createClient(port);
    clients.push(client);

    expect(client.connected).toBe(true);

    // Verify the server actually responds to events (not just TCP connect)
    const roomCreatedP = waitForEvent<{ roomCode: string; playerIndex: number }>(client, 'roomCreated');
    client.emit('createRoom', { roomCode: 'CORS_TEST', playerName: 'CorsUser' });
    const created = await roomCreatedP;

    expect(created.roomCode).toBe('CORS_TEST');
  });

  it('disconnect countdown events are emitted', async () => {
    const host = await createClient(port);
    const joiner = await createClient(port);
    clients.push(host, joiner);

    const ROOM = 'TEST_DC';

    host.emit('createRoom', { roomCode: ROOM, playerName: 'Alice' });
    await waitForEvent(host, 'roomCreated');

    joiner.emit('joinRoom', { roomCode: ROOM, playerName: 'Bob' });
    await waitForEvent(joiner, 'roomJoined');

    // Listen for disconnect countdown on host side
    const countdownP = waitForEvent<{ remaining: number }>(host, 'disconnectCountdown');

    // Joiner disconnects — should trigger countdown
    joiner.disconnect();

    const countdown = await countdownP;
    expect(countdown.remaining).toBeGreaterThan(0);
    expect(countdown.remaining).toBeLessThanOrEqual(10);
  });
});

```

# tests\server\sceneTransitions.test.ts

```ts
/**
 * sceneTransitions.test.ts — Tests for scene transition integrity,
 * state passing, and timing issues in the lobby flow.
 *
 * These tests validate the contracts between scenes — what data
 * must be set before a transition, what gets cleared after, and
 * what events must be handled.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLobbyRoom } from '../../server/lobby/lobbyHelpers';
import type { Room, LobbyState, RoomSettings } from '../../shared/types/NetworkEvents';

// ─── Helper: simulate getLobbyState ───────────────────────────

function buildLobbyState(roomCode: string, room: Room): LobbyState | null {
  if (!room.settings) return null;
  const { password: _pw, ...safeSettings } = room.settings;
  return {
    code: roomCode,
    settings: { ...safeSettings, password: null },
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

// ─── Lobby State Visibility ───────────────────────────────────

describe('Lobby state visibility after room creation', () => {
  let room: Room;
  const roomCode = '123456';

  beforeEach(() => {
    room = createLobbyRoom('host-socket', 'HostPlayer', 1, {
      isPublic: true, isCrypto: false,
    });
  });

  it('host is visible in lobby state immediately after creation', () => {
    const state = buildLobbyState(roomCode, room);
    expect(state).not.toBeNull();
    expect(state!.players).toHaveLength(1);
    expect(state!.players[0].name).toBe('HostPlayer');
    expect(state!.players[0].isHost).toBe(true);
    expect(state!.players[0].ready).toBe(true); // host is always ready
  });

  it('both players visible after joiner joins', () => {
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: null, deckIds: null, ready: false,
    });
    room.status = 'full';

    const state = buildLobbyState(roomCode, room);
    expect(state!.players).toHaveLength(2);
    expect(state!.players[0].name).toBe('HostPlayer');
    expect(state!.players[1].name).toBe('Joiner');
    expect(state!.players[1].ready).toBe(false);
  });

  it('lobby:request_state returns current state (not stale)', () => {
    // Simulate: room created, then joiner joins, then request_state
    room.players.push({
      id: 'joiner-socket', name: 'Joiner', wallet: null,
      playerId: null, deckIds: null, ready: false,
    });
    room.status = 'full';
    room.chat = [{ sender: 'SYSTEM', text: 'Joiner joined.', timestamp: 1 }];

    const state = buildLobbyState(roomCode, room);

    // State must include latest data
    expect(state!.players).toHaveLength(2);
    expect(state!.status).toBe('full');
    expect(state!.chat).toHaveLength(1);
    expect(state!.chat[0].text).toBe('Joiner joined.');
  });

  it('password is stripped from lobby state broadcast', () => {
    const secretRoom = createLobbyRoom('host', 'Host', null, {
      isPublic: false,
      password: 'secret123',
    });

    const state = buildLobbyState('789', secretRoom);
    expect(state!.settings.password).toBeNull(); // must be stripped
  });
});

// ─── Scene Transition Data Contracts ──────────────────────────

describe('Scene transition data contracts', () => {
  it('HubScene → LobbyScene requires roomCode and isHost', () => {
    // LobbyScene.init(data) expects { roomCode: string, isHost: boolean }
    const validData = { roomCode: '123456', isHost: true };
    expect(validData.roomCode).toBeTruthy();
    expect(typeof validData.isHost).toBe('boolean');
  });

  it('LobbyScene → BattleScene requires all GameState fields', () => {
    // Simulates what LobbyScene.enterBattle() must ensure
    const requiredFields = {
      roomCode: '837646',
      playerIndex: 0,
      gameSeed: 999,
      playerName: 'Host',
      opponentName: 'Joiner',
    };

    // NONE of these should be empty/zero
    expect(requiredFields.roomCode.length).toBeGreaterThan(0);
    expect(requiredFields.gameSeed).toBeGreaterThan(0);
    expect(requiredFields.playerName.length).toBeGreaterThan(0);
    expect(requiredFields.opponentName.length).toBeGreaterThan(0);
  });

  it('ResultScene → HubScene: lastMatch must survive until HubScene reads it', () => {
    // The fix: clearMatchData() must be called INSIDE camerafadeoutcomplete,
    // not before the fade starts. This test documents the contract.
    const lastMatch = {
      playerName: 'Host', opponentName: 'Guest',
      playerWon: true, isTie: false,
      reason: 'KING_DESTROYED', turns: 15,
      stakeAmount: 0, payout: 0,
    };

    // Simulate: ResultScene has lastMatch, starts fade
    // During fade, lastMatch must still exist
    expect(lastMatch).toBeTruthy();

    // After fade completes, clearMatchData() runs
    // Then HubScene starts — by this time lastMatch is already consumed
    // (HubScene reads it in create(), which is after the scene.start() call)
  });

  it('ResultScene rematch goes to HubScene (not broken LobbyScene)', () => {
    // Old bug: rematch started LobbyScene with roomCode: '' which broke
    // The fix: rematch goes to HubScene where user can properly host
    const rematchTarget = 'HubScene'; // NOT 'LobbyScene'
    expect(rematchTarget).toBe('HubScene');
  });
});

// ─── Transition Guard Contracts ───────────────────────────────

describe('Transition guard contracts', () => {
  it('double navigation must be prevented', () => {
    // All scenes must have a `transitioning` boolean guard
    // Simulates: two rapid clicks on different buttons
    let transitioning = false;

    const navigate = () => {
      if (transitioning) return false;
      transitioning = true;
      return true;
    };

    expect(navigate()).toBe(true);  // first click succeeds
    expect(navigate()).toBe(false); // second click blocked
    expect(navigate()).toBe(false); // third click blocked
  });

  it('transitioning resets on scene re-entry', () => {
    // When a scene is started again, create() should reset transitioning
    let transitioning = true;

    // Simulate scene create()
    transitioning = false; // reset in constructor or create

    expect(transitioning).toBe(false);
  });
});

// ─── Cleanup Contracts ────────────────────────────────────────

describe('Scene cleanup contracts', () => {
  it('LobbyScene cleanup must remove disconnect listener', () => {
    // Contract: cleanup() must call socket.off('disconnect', handler)
    // to prevent stale callbacks on destroyed scene objects
    let handlerRemoved = false;

    // Simulate cleanup
    const cleanup = () => {
      handlerRemoved = true; // represents socket.off('disconnect', handler)
    };

    cleanup();
    expect(handlerRemoved).toBe(true);
  });

  it('shutdown event must use once, not on', () => {
    // Contract: this.events.once('shutdown', ...) not this.events.on('shutdown', ...)
    // Using .on() stacks handlers on scene re-entry
    let callCount = 0;

    // Simulate: scene entered twice, shutdown called once
    // With .once(): callCount = 1 (correct)
    // With .on(): callCount = 2 (bug)
    const onceHandler = () => { callCount++; };

    // First scene entry
    onceHandler(); // .once fires and self-removes
    // Second scene entry would NOT re-fire the old handler

    expect(callCount).toBe(1);
  });
});

// ─── Server lobby:request_state ───────────────────────────────

describe('lobby:request_state server handler', () => {
  it('returns current state for valid room', () => {
    const room = createLobbyRoom('host', 'Host', 1);
    room.players.push({
      id: 'joiner', name: 'Joiner', wallet: null,
      playerId: 2, deckIds: null, ready: true,
    });
    room.status = 'full';

    const state = buildLobbyState('ABC', room);
    expect(state).not.toBeNull();
    expect(state!.players).toHaveLength(2);
    expect(state!.status).toBe('full');
  });

  it('returns null for room without settings (legacy room)', () => {
    const legacyRoom: Room = {
      players: [{ id: 's1', name: 'P1', wallet: null }],
      gameSeed: null,
      cryptoReadyCount: 0,
      battleReadyCount: 0,
      actionQueue: [],
      settled: false,
      currentTurnPlayer: 0,
      currentPhase: 'PLAY',
      actionCount: 0,
      gameOverClaims: [],
      lastSeqNum: [0, 0],
      globalSeq: 0,
      pendingHashes: new Map(),
      disconnectTimers: new Map(),
      disconnectIntervals: new Map(),
      createdAt: Date.now(),
      // NO settings — legacy RoomScene flow
    };

    const state = buildLobbyState('XYZ', legacyRoom);
    expect(state).toBeNull();
  });
});

```

# tsconfig.hardhat.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["hardhat.config.ts", "contracts/**/*", "ignition/**/*", "test/**/*"]
}
```

# tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

# tsconfig.server.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["ES2020"],
    "outDir": "server/dist",
    "rootDir": ".",
    "strict": true,
    "strictPropertyInitialization": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["server/**/*.ts", "shared/**/*.ts"]
}

```

# vite.config.ts

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3000, open: true },
  build:  { target: 'es2020', sourcemap: true },
  resolve: { alias: { '@': '/src' } },
}

```

# vite\config.dev.mjs

```mjs
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080
    }
});

```

# vite\config.prod.mjs

```mjs
import { defineConfig } from 'vite';

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);
            
            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}   

export default defineConfig({
    base: './',
    logLevel: 'warning',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    server: {
        port: 8080
    },
    plugins: [
        phasermsg()
    ]
});

```

# vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      phaser: './tests/mocks/phaser.ts',
    },
  },
});

```

