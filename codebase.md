# .gitignore

```
# Node modules
/node_modules

# Compilation output
/dist

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
echo [2/3] Starting Socket.io server on port 3001...
start "OCB - Socket Server" cmd /k "cd /d %PROJECT_DIR% && node server/index.js"
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
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/style.css">
    <title>Phaser - Template</title>
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
        "build": "vite build --config vite/config.prod.mjs && phaser-asset-pack-hashing -j -r dist"
    },
    "devDependencies": {
        "@nomicfoundation/hardhat-ethers": "^4.0.4",
        "@nomicfoundation/hardhat-ignition": "^3.0.7",
        "@nomicfoundation/hardhat-toolbox-mocha-ethers": "^3.0.2",
        "@types/chai": "^4.3.20",
        "@types/chai-as-promised": "^8.0.2",
        "@types/mocha": "^10.0.10",
        "@types/node": "^22.19.11",
        "chai": "^5.3.3",
        "forge-std": "github:foundry-rs/forge-std#v1.9.4",
        "hardhat": "^3.1.9",
        "mocha": "^11.7.5",
        "phaser-asset-pack-hashing": "^1.0.6",
        "terser": "^5.28.1",
        "typescript": "~5.8.0",
        "vite": "^7.3.1"
    },
    "dependencies": {
        "@phaserjs/editor-scripts-base": "^2.0.1",
        "dotenv": "^17.3.1",
        "ethers": "^6.16.0",
        "express": "^5.2.1",
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

# public\favicon.png

This is a binary file of the type: Image

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
# Sample Hardhat 3 Beta Project (`mocha` and `ethers`)

This project showcases a Hardhat 3 Beta project using `mocha` for tests and the `ethers` library for Ethereum interactions.

To learn more about the Hardhat 3 Beta, please visit the [Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3). To share your feedback, join our [Hardhat 3 Beta](https://hardhat.org/hardhat3-beta-telegram-group) Telegram group or [open an issue](https://github.com/NomicFoundation/hardhat/issues/new) in our GitHub issue tracker.

## Project Overview

This example project includes:

- A simple Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests using `mocha` and ethers.js
- Examples demonstrating how to connect to different types of networks, including locally simulating OP mainnet.

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

\`\`\`shell
npx hardhat test
\`\`\`

You can also selectively run the Solidity or `mocha` tests:

\`\`\`shell
npx hardhat test solidity
npx hardhat test mocha
\`\`\`

### Make a deployment to Sepolia

This project includes an example Ignition module to deploy the contract. You can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

\`\`\`shell
npx hardhat ignition deploy ignition/modules/Counter.ts
\`\`\`

To run the deployment to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes a Configuration Variable called `SEPOLIA_PRIVATE_KEY`, which you can use to set the private key of the account you want to use.

You can set the `SEPOLIA_PRIVATE_KEY` variable using the `hardhat-keystore` plugin or by setting it as an environment variable.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

\`\`\`shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
\`\`\`

After setting the variable, you can run the deployment with the Sepolia network:

\`\`\`shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
\`\`\`

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

# server\index.js

```js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ─── Escrow Contract Setup ─────────────────────────────────────
const ESCROW_ADDRESS = "0xa145f82DC5b285B970BE71F48Cf5173E722cF515";
const ESCROW_ABI = [
  "function claimWinnings(bytes32 matchId, address winner) external",
  "function refundTie(bytes32 matchId) external",
  "function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)",
];

const FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const provider = new ethers.JsonRpcProvider(FUJI_RPC);
const ownerWallet = new ethers.Wallet(process.env.FUJI_PRIVATE_KEY, provider);
const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, ownerWallet);

console.log(`[Server] Owner wallet: ${ownerWallet.address}`);

// ─── Helper: matchId from room code (must match frontend) ──────
function matchIdFromCode(roomCode) {
  const hex = Buffer.from(roomCode, 'utf8').toString('hex');
  const padded = hex.padStart(64, '0');
  return '0x' + padded;
}

// ─── Payout Logic ─────────────────────────────────────────────
async function payoutWinner(roomCode, winnerAddress) {
  const matchId = matchIdFromCode(roomCode);
  console.log(`[Escrow] Paying winner ${winnerAddress} for room ${roomCode}`);
  try {
    const tx = await escrowContract.claimWinnings(matchId, winnerAddress);
    await tx.wait();
    console.log(`[Escrow] Payout done! tx: ${tx.hash}`);
    return { success: true, txHash: tx.hash };
  } catch (err) {
    console.error(`[Escrow] Payout failed:`, err.message);
    return { success: false, error: err.message };
  }
}

async function refundTie(roomCode) {
  const matchId = matchIdFromCode(roomCode);
  console.log(`[Escrow] Refunding tie for room ${roomCode}`);
  try {
    const tx = await escrowContract.refundTie(matchId);
    await tx.wait();
    console.log(`[Escrow] Tie refund done! tx: ${tx.hash}`);
    return { success: true, txHash: tx.hash };
  } catch (err) {
    console.error(`[Escrow] Tie refund failed:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Room State ───────────────────────────────────────────────
const rooms = {};

io.on('connection', (socket) => {
socket.on('game_over', async ({ roomCode, winnerIndex }) => {
  const room = rooms[roomCode];
  if (!room || room.settled) return;   // prevent double-settle
  room.settled = true;

  const winner = room.players[winnerIndex];
  if (!winner?.wallet) {
    console.log(`[Server] game_over in ${roomCode} but winner has no wallet (free mode)`);
    return;
  }

  console.log(`[Server] game_over: ${winner.name} wins room ${roomCode}`);
  const result = await payoutWinner(roomCode, winner.wallet);

  // Notify both clients
  io.to(roomCode).emit('payout_result', result);
});
  // Game action relay — forward to opponent only
socket.on('game_action', ({ roomCode, action }) => {
    socket.to(roomCode).emit('opponent_action', action);
    console.log(`[Server] game_action relayed in ${roomCode}: ${action.type}`);
});
  console.log(`[Server] Player connected: ${socket.id}`);

  socket.on('createRoom', ({ roomCode, playerName }) => {
    rooms[roomCode] = {
      players: [{ id: socket.id, name: playerName, roll: null, wallet: null }],
      cryptoReady: { count: 0 }
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, playerIndex: 0 });

    console.log(`[Server] Room created: ${roomCode} by ${playerName}`);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('error', { message: 'Room not found. Check the code.' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'Room is full.' }); return; }

    room.players.push({ id: socket.id, name: playerName, roll: null, wallet: null });
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, playerIndex: 1 });
    const host = room.players[0];
    io.to(host.id).emit('opponentJoined', { playerName, playerIndex: 0 });
    socket.emit('opponentJoined', { playerName: host.name, playerIndex: 1 });

    // Broadcast shared shuffle seed to both players
    const seed = Math.floor(Math.random() * 999999);
    room.gameSeed = seed;
    io.to(roomCode).emit('game_seed', { seed });
    console.log(`[Server] ${playerName} joined room: ${roomCode}, seed: ${seed}`)
  });

  // Player registers their wallet address (for crypto payout)
  socket.on('registerWallet', ({ roomCode, walletAddress }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.wallet = walletAddress;
      console.log(`[Server] Wallet registered for ${player.name}: ${walletAddress}`);
    }
  });

  // Player signals their escrow deposit is confirmed on-chain
socket.on('cryptoReady', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.cryptoReady.count = (room.cryptoReady.count || 0) + 1;
    console.log(`[Server] cryptoReady: ${room.cryptoReady.count}/2 in room ${roomCode}`);

    if (room.cryptoReady.count === 1) {
      // Host deposit confirmed — tell joiner to deposit now
      socket.to(roomCode).emit('hostDepositConfirmed');
      console.log(`[Server] Told opponent to deposit in room ${roomCode}`);
    } else if (room.cryptoReady.count >= 2) {
      // Both deposits confirmed — start game
      io.to(roomCode).emit('bothCryptoReady');
      console.log(`[Server] Both players crypto-ready in room ${roomCode}`);
    }
  });

  socket.on('diceRoll', ({ roomCode, playerName, roll }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) player.roll = roll;

    socket.to(roomCode).emit('opponentRoll', { roll, playerName });
    console.log(`[Server] ${playerName} rolled ${roll} in room ${roomCode}`);

    // Check if both players have rolled
    const [p1, p2] = room.players;
    if (p1 && p2 && p1.roll !== null && p2.roll !== null) {
      const isCrypto = p1.wallet && p2.wallet;
      console.log(`[Server] Both rolled in room ${roomCode}. p1:${p1.roll} p2:${p2.roll} crypto:${isCrypto}`);

      if (p1.roll === p2.roll) {
        // Tie — reset rolls for re-roll
        p1.roll = null;
        p2.roll = null;
        if (isCrypto) {
          // For crypto tie, refund and let them know
          // (In Phase 1, ties just re-roll in free mode; for crypto we could refund or re-roll)
          // For now: re-roll (don't touch escrow on tie, just reset)
          io.to(roomCode).emit('tieReroll');
        }
        // Free mode tie handled client-side already
      } else {
        const winner = p1.roll > p2.roll ? p1 : p2;
        const loser = p1.roll > p2.roll ? p2 : p1;

        if (isCrypto) {
          // Trigger on-chain payout
          payoutWinner(roomCode, winner.wallet).then(result => {
            io.to(roomCode).emit('cryptoMatchResult', {
              winnerName: winner.name,
              loserName: loser.name,
              winnerRoll: winner.roll,
              loserRoll: loser.roll,
              txHash: result.txHash,
              success: result.success,
              error: result.error
            });
          });
        }
        // Free mode result handled client-side
      }

      // Reset for next match
      p1.roll = null;
      p2.roll = null;
      room.cryptoReady.count = 0;
    }
  });

 socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      const disconnectedPlayer = room.players[idx];
      console.log(`[Server] ${disconnectedPlayer.name} left room: ${code}`);

      // Notify remaining player
      socket.to(code).emit('opponentDisconnected');

      // Crypto: if both deposited and not yet settled, pay remaining player
      if (room.cryptoReady?.count >= 2 && !room.settled) {
        room.settled = true;
        const remainingIdx = idx === 0 ? 1 : 0;
        const remaining = room.players[remainingIdx];
        if (remaining?.wallet) {
          console.log(`[Server] Disconnect payout to ${remaining.name} (${remaining.wallet})`);
          payoutWinner(code, remaining.wallet).then(result => {
            io.to(code).emit('payout_result', result);
          });
        }
      }

      delete rooms[code];
      break;
    }
  });
});

server.listen(3001, () => {
  console.log('[Server] Socket.io running on port 3001');
});
```

# src\config\DeckLoader.ts

```ts
// ============================================================
// DeckLoader.ts
// Fetches deck card IDs from /public/deck.config.json at runtime.
// Developer edits the JSON file to change the deck — no code changes needed.
// Falls back to UNITS_ONLY_DECK_IDS if the file is missing or invalid.
// ============================================================

import { UNITS_ONLY_DECK_IDS, getCard } from '../game/data/CardDefinitions';

class DeckLoaderClass {
  private deckIds: string[] | null = null;
  private readonly CONFIG_PATH = '/deck.config.json';

  /**
   * Load deck from /public/deck.config.json.
   * Call once during PreloadScene. Result is cached.
   * Safe to call multiple times — returns cache after first load.
   */
  async load(): Promise<string[]> {
    if (this.deckIds !== null) return this.deckIds;

    try {
      const res = await fetch(this.CONFIG_PATH);
      if (!res.ok) {
        console.warn('[DeckLoader] deck.config.json not found — using built-in deck');
        return this.useFallback();
      }

      const json = await res.json();

      if (!Array.isArray(json.deckIds)) {
        console.error('[DeckLoader] deck.config.json missing "deckIds" array — using built-in deck');
        return this.useFallback();
      }

      const ids: string[] = json.deckIds;

      // Validate every card ID exists in CardDefinitions
      const invalid = ids.filter(id => {
        try { getCard(id); return false; }
        catch { return true; }
      });

      if (invalid.length > 0) {
        console.error(`[DeckLoader] Unknown card IDs in deck.config.json: ${invalid.join(', ')} — using built-in deck`);
        return this.useFallback();
      }

      if (ids.length !== 31) {
        console.warn(`[DeckLoader] deck.config.json has ${ids.length} cards, expected 31. Loading anyway.`);
      }

      console.log(`[DeckLoader] Loaded ${ids.length} cards from deck.config.json`);
      this.deckIds = ids;
      return this.deckIds;

    } catch (err) {
      console.warn('[DeckLoader] Failed to fetch deck.config.json — using built-in deck', err);
      return this.useFallback();
    }
  }

  /** Synchronous get — only works after load() has been called. Returns fallback if not yet loaded. */
  get(): string[] {
    return this.deckIds ?? UNITS_ONLY_DECK_IDS;
  }

  /** Clear cache — forces re-fetch on next load() call. */
  invalidate(): void {
    this.deckIds = null;
  }

  private useFallback(): string[] {
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

# src\data\MatchState.ts

```ts
// ─── MatchState.ts ────────────────────────────────────────────
// Data model for a single match result
// Equivalent to MatchState.cs in Unity

export interface MatchState {
    playerName: string;
    opponentName: string;
    playerRoll: number;
    opponentRoll: number;
    playerWon: boolean;
    isTie: boolean;
    stakeAmount: number;
    payout: number;
}

export function createMatchState(
    playerName: string,
    opponentName: string,
    playerRoll: number,
    opponentRoll: number,
    stakeAmount: number
): MatchState {
    const playerWon = playerRoll > opponentRoll;
    const isTie = playerRoll === opponentRoll;

    return {
        playerName,
        opponentName,
        playerRoll,
        opponentRoll,
        playerWon,
        isTie,
        stakeAmount,
        payout: playerWon ? stakeAmount * 2 * 0.95 : 0,
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

export type EventHandler<T = any> = (payload: T) => void;

interface Subscription {
  type: string;
  handler: EventHandler;
}

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
   * Subscribe to an event type.
   * Returns an unsubscribe function for easy cleanup.
   */
  on<T = any>(type: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler as EventHandler);

    return () => this.off(type, handler as EventHandler);
  }

  /**
   * Subscribe to an event type, fire once, then auto-unsubscribe.
   */
  once<T = any>(type: string, handler: EventHandler<T>): void {
    const wrapper: EventHandler = (payload: T) => {
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
   * Emit an event. All subscribers for this type receive the payload.
   * Errors in handlers are caught individually — one bad handler
   * won't prevent others from receiving the event.
   */
  emit<T = any>(type: string, payload?: T): void {
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

# src\game\AbilityResolver.ts

```ts
// ============================================================
// AbilityResolver.ts
// Routes every ability type to its resolution logic.
// CRITICAL RULE: Never mutates board, player state, or
// modifiers directly. Returns GameEvent[] + optionally
// a PendingInteraction when player input is required.
// GameEngine applies the events and stores the pending.
// ============================================================

import { AbilityType, PendingInteraction } from './types/AbilityTypes';
import type { Unit, Position } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import type { PlayerState } from './PlayerState';
import type { GameModifiers } from './GameModifiers';
import { getCard } from './data/CardDefinitions';
import { applyDamage, applyFullHeal, applyReform, applyEarthquakeDamage } from './CombatResolver';
import type { GameEvent } from './types/EventTypes';

export interface AbilityResult {
  events: GameEvent[];
  pending?: PendingInteraction;
}

// ─────────────────────────────────────────────
// MAIN ROUTER
// ─────────────────────────────────────────────

/**
 * Resolve all abilities on a card when it is played.
 * Called by GameEngine.playCard() after LEG cost is spent.
 *
 * @param cardId       The card being played
 * @param owner        The playing player
 * @param position     Deploy position (for units/structures); undefined for spells
 * @param board        Current board (read-only — do not mutate)
 * @param ps           Player states [P1, P2] (read-only)
 * @param mods         Modifiers [P1, P2] (read-only)
 * @param unitInstance The placed unit, if already on board (for on-deploy abilities)
 */
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
    if (ability.type === 'CUSTOM') {
      const result = resolveCustomHandler(ability.handler as string, cardId, owner, position, board, ps, mods, unitInstance);
      combined.events.push(...result.events);
      if (result.pending && !combined.pending) combined.pending = result.pending;
      continue;
    }

    const result = resolveCommonAbility(
      ability.type as AbilityType,
      ability.params,
      cardId, owner, position, board, ps, mods, unitInstance
    );
    combined.events.push(...result.events);
    if (result.pending && !combined.pending) combined.pending = result.pending;
  }

  return combined;
}

/**
 * Resolve ON_DEATH abilities for a unit that just died.
 * Called by GameEngine after applying a UNIT_DIED event.
 */
export function resolveOnDeath(
  unit: Unit,
  cause: string,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(unit.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    if (ability.type === AbilityType.ON_DEATH_DRAW) {
      // Foot Soldier: draw 1 card — but NOT on Reform (checked by caller)
      if (cause !== 'REFORM') {
        const { count } = ability.params as { count: number };
        combined.events.push({
          type:           'CARD_DRAWN',
          player:         unit.owner,
          cardId:         '__DRAW__', // Placeholder — GameEngine resolves actual card
          handIndex:      -1,
          deckRemaining:  -1,
        });
      }
    }
  }

  return combined;
}

/**
 * Resolve ON_KILL abilities for the attacker after confirming a kill.
 */
export function resolveOnKill(
  attacker: Unit,
  victim: Unit,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const def = getCard(attacker.cardId);
  const combined: AbilityResult = { events: [] };

  for (const ability of def.abilities) {
    if (ability.type === AbilityType.ON_KILL_LEG_DRAIN) {
      const { minTargetCost, amount } = ability.params as { minTargetCost: number; amount: number };
      const victimCost = getCard(victim.cardId).cost;
      if (victimCost > minTargetCost) {
        const victim_player = victim.owner;
        const old_rate = mods[victim_player].getEffectiveLEGRate();
        combined.events.push({
          type:     'LEG_RATE_CHANGED',
          player:   victim_player,
          oldRate:  old_rate,
          newRate:  Math.max(1, old_rate - amount),
          reason:   'INQUISITOR',
        });
      }
    }
  }

  return combined;
}

// ─────────────────────────────────────────────
// COMMON ABILITY SWITCH
// ─────────────────────────────────────────────

function resolveCommonAbility(
  type: AbilityType,
  params: Record<string, any>,
  cardId: string,
  owner: Player,
  position: Position | undefined,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers],
  unit?: Unit
): AbilityResult {

  switch (type) {

    // ─── ON_DEPLOY_DRAW ───────────────────────────────────────
    case AbilityType.ON_DEPLOY_DRAW: {
      const { count, filter } = params as { count: number; filter?: string };
      const events: GameEvent[] = [];
      // Signal GameEngine to draw N cards (with optional filter)
      for (let i = 0; i < count; i++) {
        events.push({
          type:           'CARD_DRAWN',
          player:          owner,
          cardId:          filter ? `__DRAW_FILTERED_${filter}__` : '__DRAW__',
          handIndex:       -1,
          deckRemaining:   -1,
        });
      }
      return { events };
    }

    // ─── ON_DEPLOY_SCOUT_DECK ─────────────────────────────────
    case AbilityType.ON_DEPLOY_SCOUT_DECK: {
      const { count } = params as { count: number };
      const opponentPs = ps[owner === Player.P1 ? Player.P2 : Player.P1];
      const topCards = opponentPs.peekTop(count);
      return {
        events: [{
          type:     'SCOUT_RESULT',
          player:   owner,
          topCards,
        }]
      };
    }

    // ─── ON_DEPLOY_HEAL_FRIENDLY ──────────────────────────────
    case AbilityType.ON_DEPLOY_HEAL_FRIENDLY: {
      // Priest: pause and let player choose a target
      const friendlyUnits = board.getUnitsOf(owner);
      const validTargetIds = friendlyUnits.map(u => u.instanceId);

      if (validTargetIds.length === 0) return { events: [] };

      const pending: PendingInteraction = {
        kind:           'TARGET',
        reason:         'Choose a friendly unit to fully restore HP.',
        validTargetIds,
        resumeCallback: () => {}, // Filled in by GameEngine
      };
      return { events: [], pending };
    }

    // ─── ON_DEPLOY_REVIVE ─────────────────────────────────────
    case AbilityType.ON_DEPLOY_REVIVE: {
      // Mystic: pause and let player choose a graveyard unit
      const graveIds = ps[owner].getGraveyard();
      if (graveIds.length === 0) {
        // Nothing to revive — still apply LEG drain
        return {
          events: [{
            type:    'LEG_RATE_CHANGED',
            player:   owner,
            oldRate:  mods[owner].getEffectiveLEGRate(),
            newRate:  Math.max(1, mods[owner].getEffectiveLEGRate() - 1),
            reason:   'MYSTIC',
          }]
        };
      }

      const pending: PendingInteraction = {
        kind:           'TARGET',
        reason:         'Choose a unit from your graveyard to revive.',
        validTargetIds: graveIds,
        resumeCallback: () => {},
      };
      // LEG drain will be emitted after interaction resolves (GameEngine handles)
      return { events: [], pending };
    }

    // ─── SPELL_DAMAGE_STRUCTURE_ADJ ───────────────────────────
    case AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ: {
      // Disease: player selects a structure to afflict
      const structures = board.getStructures();
      const validTargetIds = structures.map(u => u.instanceId);

      if (validTargetIds.length === 0) return { events: [] };

      const pending: PendingInteraction = {
        kind:           'TARGET',
        reason:         'Choose an enemy structure to afflict with Disease.',
        validTargetIds,
        resumeCallback: () => {},
      };
      return { events: [], pending };
    }

    // ─── SPELL_FREEZE_LEG_RATE ────────────────────────────────
    case AbilityType.SPELL_FREEZE_LEG_RATE: {
      const { duration } = params as { duration: number };
      // Civil War: both players frozen
      const p1Rate = mods[Player.P1].getEffectiveLEGRate();
      const p2Rate = mods[Player.P2].getEffectiveLEGRate();
      return {
        events: [
          { type: 'LEG_RATE_CHANGED', player: Player.P1, oldRate: p1Rate, newRate: 0, reason: 'CIVIL_WAR' },
          { type: 'LEG_RATE_CHANGED', player: Player.P2, oldRate: p2Rate, newRate: 0, reason: 'CIVIL_WAR' },
        ]
      };
    }

    // ─── SPELL_DRAIN_LEG_RATE_PERM ────────────────────────────
    case AbilityType.SPELL_DRAIN_LEG_RATE_PERM: {
      const { amount } = params as { amount: number; target: string };
      const opp = owner === Player.P1 ? Player.P2 : Player.P1;
      const oldRate = mods[opp].getEffectiveLEGRate();
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

    // ─── SPELL_FORWARD_DEPLOY ─────────────────────────────────
    case AbilityType.SPELL_FORWARD_DEPLOY: {
      // Casus Belli: deploy a hand card to opponent's front row
      const opp = owner === Player.P1 ? Player.P2 : Player.P1;
      const frontRow = owner === Player.P1 ? board.rows - 1 : 0; // Opposite half front row
      const validPositions: Position[] = [];
      for (let c = 0; c < board.cols; c++) {
        if (board.isEmpty(c, frontRow)) validPositions.push({ col: c, row: frontRow });
      }
      if (validPositions.length === 0 || ps[owner].hand.length === 0) return { events: [] };

      const pending: PendingInteraction = {
        kind:           'POSITION',
        reason:         'Choose an empty square in the enemy front row to deploy a card.',
        validPositions,
        resumeCallback: () => {},
      };
      return { events: [], pending };
    }

    // ─── SPELL_TRANSFORM_ALL ──────────────────────────────────
    case AbilityType.SPELL_TRANSFORM_ALL: {
      const { fromCardId, toCardId } = params as { fromCardId: string; toCardId: string };
      const events = applyReform(fromCardId, toCardId, board);
      return { events };
    }

    // ─── SPELL_EARTHQUAKE ─────────────────────────────────────
    case AbilityType.SPELL_EARTHQUAKE: {
      const pending: PendingInteraction = {
        kind:           'COLUMN',
        reason:         'Choose a column (A–F) to strike with the Earthquake.',
        resumeCallback: () => {},
      };
      return { events: [], pending };
    }

    // ─── SPELL_DRAW_STRUCTURES ────────────────────────────────
    case AbilityType.SPELL_DRAW_STRUCTURES: {
      const { overflow } = params as { overflow: boolean };
      const ownStructures = board.getStructures(owner);
      const count = ownStructures.length;
      const events: GameEvent[] = [];
      for (let i = 0; i < count; i++) {
        events.push({
          type:          'CARD_DRAWN',
          player:         owner,
          cardId:         overflow ? '__DRAW_OVERFLOW__' : '__DRAW__',
          handIndex:      -1,
          deckRemaining:  -1,
        });
      }
      return { events };
    }

    // ─── PASSIVE_* and AURA_* ─────────────────────────────────
    // Passive abilities are not resolved on deploy — they are
    // handled by AuraSystem (auras) or GameEngine LEG phase (build delay, spawn).
    case AbilityType.PASSIVE_BUILD_DELAY:
    case AbilityType.PASSIVE_SPAWN:
    case AbilityType.PASSIVE_LANCER_CHARGE:
    case AbilityType.AURA_ROYAL_DISCOUNT:
    case AbilityType.AURA_LEG_BONUS:
    case AbilityType.AURA_ADJ_DEF:
    case AbilityType.AURA_BOARD_HALF_DEF:
    case AbilityType.AURA_BOARD_HALF_ATK:
    case AbilityType.AURA_VILLAGE_SLOW:
    case AbilityType.AURA_CAVALRY_COUNTER:
    case AbilityType.AURA_PIKEMAN_FLANK:
    case AbilityType.AURA_AUTO_HEAL:
    case AbilityType.ON_DEATH_DRAW:
    case AbilityType.ON_KILL_LEG_DRAIN:
      return { events: [] }; // Not on-deploy

    default:
      console.warn(`[AbilityResolver] Unhandled ability type: ${type}`);
      return { events: [] };
  }
}

// ─────────────────────────────────────────────
// CUSTOM HANDLERS
// Cards with compound or multi-step logic.
// Each handler is a pure function returning AbilityResult.
// ─────────────────────────────────────────────

function resolveCustomHandler(
  handlerKey: string,
  cardId: string,
  owner: Player,
  position: Position | undefined,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers],
  unit?: Unit
): AbilityResult {

  switch (handlerKey) {

    case 'mysticDeployHandler':
      return mysticHandler(owner, board, ps, mods);

    case 'militiaDeployHandler':
      return militiaHandler(owner, board, ps);

    case 'warHornHandler':
      return warHornHandler(owner, board, ps);

    case 'coupHandler':
      return coupHandler(owner, board, ps, mods);

    case 'treasonHandler':
      return treasonHandler(owner, board);

    case 'peasantRevoltHandler':
      return peasantRevoltHandler(owner, board, mods);

    case 'motherlandHandler':
      return motherlandHandler(owner, board, ps);

    case 'earthquakeColumnHandler':
      // This variant receives the chosen column directly
      return { events: [] }; // Resolved inline by GameEngine.selectColumn()

    default:
      console.warn(`[AbilityResolver] Unknown custom handler: ${handlerKey}`);
      return { events: [] };
  }
}

// ─── Mystic ───────────────────────────────────────────────────
// Step 1: pause for revive target. Step 2: auto-drain LEG rate.
function mysticHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const graveIds = ps[owner].getGraveyard();

  // LEG drain is automatic regardless of whether revive is available
  const drainEvent: GameEvent = {
    type:    'LEG_RATE_CHANGED',
    player:   owner,
    oldRate:  mods[owner].getEffectiveLEGRate(),
    newRate:  Math.max(1, mods[owner].getEffectiveLEGRate() - 1),
    reason:   'MYSTIC',
  };

  if (graveIds.length === 0) return { events: [drainEvent] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Mystic: choose a unit from your graveyard to revive.',
    validTargetIds: graveIds,
    resumeCallback: () => {}, // GameEngine replaces this
  };

  // Drain applied after resolve — GameEngine emits it after interact resolves
  return { events: [], pending };
}

// ─── Militia ──────────────────────────────────────────────────
// Pull next Militia from deck, place in own half. Non-recursive.
function militiaHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState]
): AbilityResult {
  const hasMilitiaInDeck = ps[owner].deck.includes('militia');
  if (!hasMilitiaInDeck) return { events: [] };

  const freeSquares = board.getFreeSquaresInHalf(owner);
  if (freeSquares.length === 0) return { events: [] };

  // Pick the first free square (GameEngine applies the pull and placement)
  const pos = freeSquares[0];
  return {
    events: [{
      type:        'UNIT_PLACED',
      instanceId:  `militia_summoned_${Date.now()}`,
      cardId:      'militia',
      owner,
      col:         pos.col,
      row:         pos.row,
      isActive:    true,
    }]
  };
}

// ─── War Horn ─────────────────────────────────────────────────
// Draw 2 → discard 1 → all friendlies +1 move this turn.
function warHornHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState]
): AbilityResult {
  // Signal draw 2 first
  const drawEvents: GameEvent[] = [
    { type: 'CARD_DRAWN', player: owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
    { type: 'CARD_DRAWN', player: owner, cardId: '__DRAW__', handIndex: -1, deckRemaining: -1 },
  ];

  // After draws resolve, ask player to discard 1
  const pending: PendingInteraction = {
    kind:           'DISCARD',
    reason:         'War Horn: discard 1 card from your hand.',
    count:          1,
    resumeCallback: () => {},
  };

  return { events: drawEvents, pending };
}

// ─── Coup ─────────────────────────────────────────────────────
// Target enemy Royal (not King) → compare LEG to capture or banish.
function coupHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState],
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const opp = owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance === 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Coup: choose an enemy Royal unit to capture or banish.',
    validTargetIds: targets.map(u => u.instanceId),
    resumeCallback: () => {},
  };

  return { events: [], pending };
}

// ─── Treason ──────────────────────────────────────────────────
// Target enemy non-Royal → take control for this turn.
function treasonHandler(
  owner: Player,
  board: Board
): AbilityResult {
  const opp = owner === Player.P1 ? Player.P2 : Player.P1;
  const targets = board.getUnitsOf(opp).filter(u =>
    getCard(u.cardId).allegiance !== 'ROYAL' && u.cardId !== 'king'
  );

  if (targets.length === 0) return { events: [] };

  const pending: PendingInteraction = {
    kind:           'TARGET',
    reason:         'Treason: choose an enemy non-Royal unit to control this turn.',
    validTargetIds: targets.map(u => u.instanceId),
    resumeCallback: () => {},
  };

  return { events: [], pending };
}

// ─── Peasant Revolt ───────────────────────────────────────────
// Count all structures on board → summon that many Militia to own half.
// Apply permanent penalties: -1 leg rate + +2 royal cost.
function peasantRevoltHandler(
  owner: Player,
  board: Board,
  mods: [GameModifiers, GameModifiers]
): AbilityResult {
  const allStructures = board.getStructures();
  const count = allStructures.length;

  const events: GameEvent[] = [];

  // Summon Militia to free squares
  const freeSquares = board.getFreeSquaresInHalf(owner);
  const toSummon = Math.min(count, freeSquares.length);
  for (let i = 0; i < toSummon; i++) {
    events.push({
      type:       'UNIT_PLACED',
      instanceId: `militia_revolt_${i}_${Date.now()}`,
      cardId:     'militia',
      owner,
      col:        freeSquares[i].col,
      row:        freeSquares[i].row,
      isActive:   true,
    });
  }

  // Permanent penalties
  const oldRate = mods[owner].getEffectiveLEGRate();
  events.push({
    type:    'LEG_RATE_CHANGED',
    player:   owner,
    oldRate,
    newRate:  Math.max(1, oldRate - 1),
    reason:   'REVOLT',
  });

  return { events };
}

// ─── Motherland ───────────────────────────────────────────────
// Draw 1 per owned structure (overflow allowed).
function motherlandHandler(
  owner: Player,
  board: Board,
  ps: [PlayerState, PlayerState]
): AbilityResult {
  const count = board.getStructures(owner).length;
  const events: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    events.push({
      type:          'CARD_DRAWN',
      player:         owner,
      cardId:         '__DRAW_OVERFLOW__',
      handIndex:      -1,
      deckRemaining:  -1,
    });
  }
  return { events };
}

```

# src\game\AuraSystem.ts

```ts
// ============================================================
// AuraSystem.ts
// Recalculates ALL unit stats each LEG phase.
// Algorithm: reset every unit to base stats → apply each
// active aura in sequence → write final values back.
// Pure TypeScript — no Phaser, no EventBus.
//
// Auras are never stored incrementally; they are re-derived
// from scratch each turn so stale state is impossible.
// ============================================================

import type { Unit } from './types/GameTypes';
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import type { GameModifiers } from './GameModifiers';
import { getCard } from './data/CardDefinitions';
import { AbilityType } from './types/AbilityTypes';
import type { EvAuraApplied } from './types/EventTypes';

interface StatDelta {
  atkDelta: number;
  defDelta: number;
  moveDelta: number;
}

// Convenience: safely read params from any ability (CommonAbility or CustomAbility).
// CustomAbility has no params — casting to any avoids the union type error.
function params(ab: any): any {
  return ab.params ?? {};
}

// ─────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────

/**
 * Full aura recalculation pass.
 * Call once per LEG phase before any ACT actions.
 * Mutates unit.currentAtk / currentDef / currentMovement in place.
 * Also updates GameModifiers royalCostDiscount and legRateBonus.
 *
 * Returns an EvAuraApplied event for the renderer (so it can
 * show stat-change indicators on cards that gained/lost buffs).
 */
export function evaluateAuras(
  board: Board,
  mods: [GameModifiers, GameModifiers]
): EvAuraApplied {
  const allUnits = board.getAllUnits();

  // ── Step 1: Reset every unit to base stats ──
  for (const unit of allUnits) {
    unit.currentAtk      = unit.baseAtk;
    unit.currentDef      = Math.min(unit.currentDef, unit.maxDef);
    unit.currentMovement = unit.baseMovement;
  }

  // ── Step 2: Collect per-unit deltas ──
  const deltas = new Map<string, StatDelta>();
  for (const unit of allUnits) {
    deltas.set(unit.instanceId, { atkDelta: 0, defDelta: 0, moveDelta: 0 });
  }

  // ── Step 3: Apply each aura source ──
  for (const unit of allUnits) {
    if (!unit.isActive) continue; // BUILD_DELAY units have no aura
    const def = getCard(unit.cardId);

    for (const ability of def.abilities) {
      if (ability.type === 'CUSTOM') continue;
      const p = params(ability);

      switch (ability.type) {

        // ── Castle: adjacent friendly +DEF ──
        case AbilityType.AURA_ADJ_DEF: {
          const adjacents = board.getAdjacentUnits(unit.position.col, unit.position.row);
          for (const adj of adjacents) {
            if (adj.owner === unit.owner) {
              addDelta(deltas, adj.instanceId, 0, p.amount, 0);
            }
          }
          break;
        }

        // ── Commander: own-half +DEF ──
        case AbilityType.AURA_BOARD_HALF_DEF: {
          const benefitOwner = p.half === 'OWN' ? unit.owner : otherPlayer(unit.owner);
          for (const u of allUnits) {
            if (u.owner === unit.owner && board.isOwnHalf(u.position.col, u.position.row, benefitOwner)) {
              addDelta(deltas, u.instanceId, 0, p.amount, 0);
            }
          }
          break;
        }

        // ── Commander: enemy-half +ATK ──
        case AbilityType.AURA_BOARD_HALF_ATK: {
          const targetHalfOwner = p.half === 'ENEMY' ? otherPlayer(unit.owner) : unit.owner;
          for (const u of allUnits) {
            if (u.owner === unit.owner && board.isOwnHalf(u.position.col, u.position.row, targetHalfOwner)) {
              addDelta(deltas, u.instanceId, p.amount, 0, 0);
            }
          }
          break;
        }

        // ── Village: adjacent enemies −movement ──
        case AbilityType.AURA_VILLAGE_SLOW: {
          const adjacents = board.getAdjacentUnits(unit.position.col, unit.position.row);
          for (const adj of adjacents) {
            if (adj.owner !== unit.owner) {
              addDelta(deltas, adj.instanceId, 0, 0, -p.amount);
            }
          }
          break;
        }

        // ── Pikeman flank: +ATK +DEF if friendly on both sides ──
        case AbilityType.AURA_PIKEMAN_FLANK: {
          const { col, row } = unit.position;
          const leftUnit  = board.isInBounds(col - 1, row) ? board.getUnit(col - 1, row) : null;
          const rightUnit = board.isInBounds(col + 1, row) ? board.getUnit(col + 1, row) : null;
          const hasLeft   = leftUnit  !== null && leftUnit.owner  === unit.owner;
          const hasRight  = rightUnit !== null && rightUnit.owner === unit.owner;
          if (hasLeft && hasRight) {
            addDelta(deltas, unit.instanceId, p.bonusAtk, p.bonusDef, 0);
          }
          break;
        }

        // CAVALRY_COUNTER → combat-time only (CombatResolver)
        // AURA_AUTO_HEAL  → LEG phase only (GameEngine.runLEGPhase)
        // AURA_ROYAL_DISCOUNT / AURA_LEG_BONUS → Step 5 below
        default:
          break;
      }
    }
  }

  // ── Step 4: Apply deltas to currentAtk / currentMovement ──
  const changes: EvAuraApplied['changes'] = [];

  for (const unit of allUnits) {
    const d = deltas.get(unit.instanceId)!;

    const prevAtk = unit.currentAtk;
    const prevMov = unit.currentMovement;

    unit.currentAtk      = Math.max(0, unit.currentAtk + d.atkDelta);
    unit.currentMovement = Math.max(0, unit.currentMovement + d.moveDelta);

    if (d.atkDelta !== 0 || d.defDelta !== 0 || d.moveDelta !== 0) {
      changes.push({
        instanceId: unit.instanceId,
        col:        unit.position.col,
        row:        unit.position.row,
        atkDelta:   unit.currentAtk - prevAtk,
        defDelta:   d.defDelta,
        moveDelta:  unit.currentMovement - prevMov,
      });
    }
  }

  // ── Step 5: Recalculate economy modifiers ──
  for (const player of [Player.P1, Player.P2] as Player[]) {
    const mod = mods[player];
    const ownUnits = board.getUnitsOf(player);

    // Royal discount from Castle, Temple, Princess
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
    mod.royalCostDiscount = discount;

    // LEG rate bonus from Princess
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
    mod.setLEGRateBonus(legBonus);
  }

  return { type: 'AURA_APPLIED', changes };
}

// ─────────────────────────────────────────────
// COMBAT-TIME AURA QUERIES
// Called by CombatResolver / GameEngine at moment of combat.
// ─────────────────────────────────────────────

/**
 * Check if the Pikeman cavalry counter applies for this attack.
 */
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

/**
 * Returns Kings Guard auto-heal amount if unit has the aura.
 */
export function getAutoHealAmount(unit: Unit): number {
  const def = getCard(unit.cardId);
  const ab = def.abilities.find(ab => ab.type === AbilityType.AURA_AUTO_HEAL);
  if (!ab) return 0;
  return params(ab).amount;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function addDelta(
  deltas: Map<string, StatDelta>,
  instanceId: string,
  atk: number,
  def: number,
  mov: number
): void {
  const d = deltas.get(instanceId);
  if (!d) return;
  d.atkDelta += atk;
  d.defDelta += def;
  d.moveDelta += mov;
}

function otherPlayer(p: Player): Player {
  return p === Player.P1 ? Player.P2 : Player.P1;
}

// ─────────────────────────────────────────────
// CLASS WRAPPER
// GameEngine uses `new AuraSystem()` with instance methods.
// ─────────────────────────────────────────────

export class AuraSystem {
  evaluateAuras(board: Board, mods: [GameModifiers, GameModifiers]): EvAuraApplied {
    return evaluateAuras(board, mods);
  }

  recalculateModifiers(board: Board, mods: [GameModifiers, GameModifiers]): void {
    evaluateAuras(board, mods);
  }
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

/** Number of rows each player can deploy into (from their back edge). */
export const DEPLOY_ROWS = 3;

export class Board {
  readonly cols: number;
  readonly rows: number;
  private cells: BoardCell[][];
  private unitIndex: Map<string, Unit> = new Map(); // instanceId → Unit

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
  isOwnHalf(col: number, row: number, player: Player): boolean {
    return player === Player.P1
      ? row < DEPLOY_ROWS
      : row >= this.rows - DEPLOY_ROWS;
  }

  /** Returns all units belonging to a player. */
  getUnitsOf(player: Player): Unit[] {
    return Array.from(this.unitIndex.values()).filter(u => u.owner === player);
  }

  /** Returns the King unit for a player, or null if dead. */
  getKing(player: Player): Unit | null {
    return this.getUnitsOf(player).find(u => u.cardId === 'king') ?? null;
  }

  /** Returns all structure units (STATIC subtype) on the board. */
  getStructures(player?: Player): Unit[] {
    const all = Array.from(this.unitIndex.values()).filter(u =>
      ['castle', 'temple', 'village'].includes(u.cardId)
    );
    return player !== undefined ? all.filter(u => u.owner === player) : all;
  }

  /** Returns all units. */
  getAllUnits(): Unit[] {
    return Array.from(this.unitIndex.values());
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
  }

  /** Remove a unit from the board (death, capture, return). */
  removeUnit(instanceId: string): Unit | null {
    const unit = this.unitIndex.get(instanceId);
    if (!unit) return null;
    const { col, row } = unit.position;
    this.cells[row][col].unit = null;
    this.unitIndex.delete(instanceId);
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
      unit: cell.unit ? { ...cell.unit } : null, // Shallow copy
    }));
  }

  /** Clear the entire board. Used for game reset. */
  clear(): void {
    this.unitIndex.clear();
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
import { Player } from './types/GameTypes';
import type { Board } from './Board';
import { getCard } from './data/CardDefinitions';
import { CombatTag, AtkPattern } from './types/CardTypes';
import {
  EvUnitAttacked, EvUnitDied, EvUnitHealed, EvUnitTransformed,
  GameEvent
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
  board: Board
): GameEvent[] {
  const events: GameEvent[] = [];

  let damage = calculateDamage(attacker, defender);
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
  //    Defender must be MELEE and adjacent (Chebyshev ≤ 1)
  if (defenderCombatTag !== CombatTag.MELEE) return events;
  if (!isAdjacent(attackerPos, defenderPos)) return events;
  //    Defender must have positive ATK to deal counter damage
  if (defenderPreDamageAtk <= 0) return events;

  // ── 3. Counter-attack: defender → attacker (dying blow) ──
  const counterDamage = Math.max(0, defenderPreDamageAtk);
  const attackerNewHP = Math.max(0, attacker.currentDef - counterDamage);

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

function calculateDamage(attacker: Unit, defender: Unit): number {
  let atk = attacker.currentAtk;
  const isCavalry = isUnitCavalry(defender);
  if (isCavalry && hasFlag(attacker, 'CAVALRY_COUNTER')) {
    atk *= 3;
  }
  return Math.max(0, atk);
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
// Single source of truth for all cards.
// Adding a card = adding ONE object to CARD_DEFINITIONS.
// No new classes, no new switch cases anywhere else.
//
// Deck: 22 unique cards + King = 23 types, 39 deck copies.
// King is pre-placed, not in deck. Deck = 31 cards.
// ============================================================

import {
  CardClass, Allegiance, SubType, CardFlag,
  MovementType, AtkPattern,
} from '../types/CardTypes.js';
import type { CardDefinition } from '../types/CardTypes.js';
import { AbilityType } from '../types/AbilityTypes';

const U = CardClass.UNIT;
const SP = CardClass.SPELL;
const ST = CardClass.STRUCTURE;
const STD = Allegiance.STANDARD;
const ROY = Allegiance.ROYAL;
const CAV = SubType.CAVALRY;
const STRUC = SubType.STRUCTURE;

export const CARD_DEFINITIONS: CardDefinition[] = [

  // ═══════════════════════════════════════════════════════
  // KING — Pre-placed, not in deck
  // ═══════════════════════════════════════════════════════
  {
    id: 'king', name: 'King',
    flavorText: 'All legitimacy flows from the crown.',
    class: U, allegiance: ROY, subtypes: [], cost: 0, copies: 1,
    stats: { atk: 1, def: 10, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.AURA_LEG_BONUS, params: { amount: 1 } }, // Base LEG generation
    ],
    abilityText: 'Pre-placed. Generates +1 LEG/turn. Enemy King in your half: lose 1 LEG this turn. Win condition.',
  },

  // ═══════════════════════════════════════════════════════
  // STANDARD UNITS
  // ═══════════════════════════════════════════════════════

  {
    id: 'foot_soldier', name: 'Foot Soldier',
    flavorText: 'Cannon fodder with a silver lining.',
    class: U, allegiance: STD, subtypes: [], cost: 1, copies: 3,
    stats: { atk: 1, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEATH_DRAW, params: { count: 1 } },
    ],
    abilityText: 'On Death: draw 1 card. Reform target: becomes Swordsman.',
  },

  {
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
  },

  {
    id: 'archer', name: 'Archer',
    flavorText: 'Precision over brute force.',
    class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
    stats: { atk: 3, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.DIAGONAL_RANGED_2,
    customAttack : {
        offsets: [{dx:1, dy:-1}, {dx:-1, dy:-1}, {dx:1, dy:1}, {dx:-1, dy:1}, {dx:2, dy:-2}, {dx:-2, dy:-2}, {dx:2, dy:2}, {dx:-2, dy:2}],  
        range: 1,
      },

      },

     
    flags: [],
    abilities: [],
    abilityText: 'Ranged attack: targets any unit diagonally within 2 squares. Ignores adjacency.',
  },

  {
    id: 'assassin', name: 'Assassin',
    flavorText: 'The shadow moves. Then it\'s over.',
    class: U, allegiance: STD, subtypes: [], cost: 3, copies: 2,
    stats: { atk: 4, def: 1, movement: MovementType.JUMP_DIAGONAL_1, attackPattern: AtkPattern.ON_JUMP, customAttack : {
        offsets: [{dx:1, dy:-1}, {dx:-1, dy:-1}, {dx:1, dy:1}, {dx:-1, dy:1}],  
        range: 1,
      },
      customMove : {
        offsets: [{dx:2, dy:0}, {dx:-2, dy:0}, {dx:0, dy:2}, {dx:0, dy:-2}],  
        range: 1,
      },
      
      
    },
    
    flags: [],
    abilities: [],
    abilityText: 'Jumps diagonally. Attacks landing square on jump. Ignores units along path.',
  },

  {
    id: 'militia', name: 'Militia',
    flavorText: 'Where one falls, another rises.',
    class: U, allegiance: STD, subtypes: [], cost: 2, copies: 2,
    stats: { atk: 1, def: 1, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.CUSTOM, handler: 'militiaDeployHandler' },
    ],
    abilityText: 'On Deploy: pull the next Militia copy from your deck to any free square in your half.',
  },

  {
    id: 'scout', name: 'Scout',
    flavorText: 'Knowledge is the first casualty of ignorance.',
    class: U, allegiance: STD, subtypes: [CAV], cost: 2, copies: 2,
    stats: { atk: 1, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 2 } },
    ],
    abilityText: 'Cavalry. On Deploy: reveal the top 2 cards of opponent\'s deck (visible to you only).',
  },

  {
    id: 'lancer', name: 'Lancer',
    flavorText: 'At full gallop, nothing stops the charge.',
    class: U, allegiance: STD, subtypes: [CAV], cost: 4, copies: 2,
    stats: { atk: 3, def: 2, movement: MovementType.OMNI_2, attackPattern: AtkPattern.HV },
    flags: [CardFlag.LANCER_CHARGE],
    abilities: [
      { type: AbilityType.PASSIVE_LANCER_CHARGE, params: {} },
    ],
    abilityText: 'Cavalry. Charge: may MOVE and ATTACK in the same turn. Movement must be toward enemy half.',
  },

  {
    id: 'mystic', name: 'Mystic',
    flavorText: 'She sees beyond death. The cost is paid in kind.',
    class: U, allegiance: STD, subtypes: [], cost: 6, copies: 1,
    stats: { atk: 2, def: 5, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.CUSTOM, handler: 'mysticDeployHandler' },
    ],
    abilityText: 'On Deploy: revive one unit from your graveyard to any free square in your half. Permanently −1 your LEG rate (min 1).',
  },

  {
    id: 'messenger', name: 'Messenger',
    flavorText: 'Swift enough to carry news before it matters.',
    class: U, allegiance: STD, subtypes: [], cost: 1, copies: 2,
    stats: { atk: 0, def: 1, movement: MovementType.OMNI_2, attackPattern: AtkPattern.NONE },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_DRAW,       params: { count: 1 } },
      { type: AbilityType.ON_DEPLOY_SCOUT_DECK, params: { count: 1 } },
    ],
    abilityText: 'On Deploy: draw 1 card. Reveal top 1 card of opponent\'s deck (visible to you only).',
  },

  // ═══════════════════════════════════════════════════════
  // ROYAL UNITS
  // ═══════════════════════════════════════════════════════

  {
    id: 'swordsman', name: 'Swordsman',
    flavorText: 'A knight in all but title.',
    class: U, allegiance: ROY, subtypes: [], cost: 3, copies: 2,
    stats: { atk: 3, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [],
    abilityText: 'Reform result. Requires Royal cost engine to play economically.',
  },

  {
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
  },

  {
    id: 'priest', name: 'Priest',
    flavorText: 'The wounded are never truly lost.',
    class: U, allegiance: ROY, subtypes: [], cost: 6, copies: 2,
    stats: { atk: 1, def: 3, movement: MovementType.OMNI_1, attackPattern: AtkPattern.HV },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_HEAL_FRIENDLY, params: { amount: 'FULL' } },
    ],
    abilityText: 'On Deploy: fully restore one friendly unit\'s HP (including King).',
  },

  {
    id: 'commander', name: 'Commander',
    flavorText: 'Every soldier fights harder in his shadow.',
    class: U, allegiance: ROY, subtypes: [CAV], cost: 7, copies: 1,
    stats: { atk: 5, def: 5, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.AURA_BOARD_HALF_DEF, params: { half: 'OWN',   amount: 1 } },
      { type: AbilityType.AURA_BOARD_HALF_ATK, params: { half: 'ENEMY', amount: 1 } },
    ],
    abilityText: 'Cavalry. Aura: all friendly units on your half +1 DEF. All friendly units on enemy half +1 ATK.',
  },

  {
    id: 'inquisitor', name: 'Inquisitor',
    flavorText: 'The guilty always reveal themselves.',
    class: U, allegiance: ROY, subtypes: [], cost: 7, copies: 2,
    stats: { atk: 4, def: 4, movement: MovementType.OMNI_1, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [
      { type: AbilityType.ON_KILL_LEG_DRAIN, params: { minTargetCost: 4, amount: 1 } },
    ],
    abilityText: 'On Kill: if target\'s base cost >4, permanently −1 opponent\'s LEG rate (min 1).',
  },

  {
    id: 'knight', name: 'Knight',
    flavorText: 'Heavy, fast, devastating.',
    class: U, allegiance: ROY, subtypes: [CAV], cost: 9, copies: 2,
    stats: { atk: 5, def: 8, movement: MovementType.OMNI_2, attackPattern: AtkPattern.OMNI },
    flags: [],
    abilities: [],
    abilityText: 'Cavalry. Requires Royal discount engine to play before late game.',
  },

  {
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
  },

  {
    id: 'scribe', name: 'Scribe',
    flavorText: 'The pen shapes the future of the crown.',
    class: U, allegiance: ROY, subtypes: [], cost: 5, copies: 2,
    stats: { atk: 0, def: 2, movement: MovementType.OMNI_1, attackPattern: AtkPattern.NONE },
    flags: [],
    abilities: [
      { type: AbilityType.ON_DEPLOY_DRAW, params: { count: 2, filter: 'ROYAL' } },
    ],
    abilityText: 'On Deploy: draw 2 Royal cards from your deck (skip non-Royal until count met or deck empty).',
  },

  // ═══════════════════════════════════════════════════════
  // STRUCTURES (STATIC)
  // ═══════════════════════════════════════════════════════

  {
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
  },

  {
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
  },

  {
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
  },

  // ═══════════════════════════════════════════════════════
  // SPELLS
  // ═══════════════════════════════════════════════════════

  {
    id: 'disease', name: 'Disease',
    flavorText: 'The rot spreads from stone to stone.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_DAMAGE_STRUCTURE_ADJ, params: { damage: 2, duration: 3 } },
    ],
    abilityText: 'Target a Structure. It takes 2 damage at the start of your turn for 3 turns. Units adjacent to it take 1 damage per tick.',
  },

  {
    id: 'casus_belli', name: 'Casus Belli',
    flavorText: 'A pretext for war is always found.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_DRAIN_LEG_RATE_PERM, params: { amount: 1, target: 'OPPONENT' } },
      { type: AbilityType.SPELL_FORWARD_DEPLOY,       params: {} },
    ],
    abilityText: 'Permanently −1 opponent\'s LEG rate (min 1). Then deploy one card from your hand to any free square in the front row of enemy half.',
  },

  {
    id: 'reform', name: 'Reform',
    flavorText: 'The soldier becomes the knight he always was.',
    class: SP, allegiance: STD, subtypes: [], cost: 2, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_TRANSFORM_ALL, params: { fromCardId: 'foot_soldier', toCardId: 'swordsman' } },
    ],
    abilityText: 'Transform all Foot Soldiers on the board into Swordsmen. HP scales proportionally. Does not trigger Foot Soldier\'s On Death ability.',
  },

  {
    id: 'civil_war', name: 'Civil War',
    flavorText: 'When the kingdom turns on itself, all suffer.',
    class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_FREEZE_LEG_RATE, params: { duration: 3 } },
    ],
    abilityText: 'Both players\' LEG rates are frozen at 0 for 3 turns. Existing pools are unaffected.',
  },

  {
    id: 'earthquake', name: 'Earthquake',
    flavorText: 'The earth itself takes sides.',
    class: SP, allegiance: STD, subtypes: [], cost: 5, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_EARTHQUAKE, params: {} },
    ],
    abilityText: 'Choose a column (A–F). All units in that column take 3 damage. Triggers Foot Soldier On Death.',
  },

  {
    id: 'war_horn', name: 'War Horn',
    flavorText: 'The sound of destiny.',
    class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_WAR_HORN, params: {} },
    ],
    abilityText: 'Draw 2 cards, then discard 1. All your units gain +1 movement this turn.',
  },

  {
    id: 'coup', name: 'Coup',
    flavorText: 'Power seized in a single night.',
    class: SP, allegiance: ROY, subtypes: [], cost: 12, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_COUP, params: {} },
    ],
    abilityText: 'Target an enemy Royal unit (not King). If your remaining LEG ≥ target\'s base cost: capture it (it joins your side). Otherwise: banish it from the game.',
  },

  {
    id: 'treason', name: 'Treason',
    flavorText: 'Even loyal men have a price.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 2,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_TREASON, params: {} },
    ],
    abilityText: 'Target an enemy non-Royal unit. It fights for you this turn only. At end of turn: returns to original position, exhausted.',
  },

  {
    id: 'motherland', name: 'Motherland',
    flavorText: 'The homeland always gives more.',
    class: SP, allegiance: STD, subtypes: [], cost: 4, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_DRAW_STRUCTURES, params: { overflow: true } },
    ],
    abilityText: 'Draw 1 card per Structure you control. Can overflow hand limit this turn. Overflow cards are lost at end of turn.',
  },

  {
    id: 'peasant_revolt', name: 'Peasant Revolt',
    flavorText: 'The masses have little to lose.',
    class: SP, allegiance: STD, subtypes: [], cost: 3, copies: 1,
    flags: [],
    abilities: [
      { type: AbilityType.SPELL_REVOLT, params: {} },
    ],
    abilityText: 'Summon 1 Militia to any free square in your half per Structure on the board (both sides). Permanent penalty to you: −1 LEG rate (min 1) and +2 Royal cost for the rest of the game.',
  },

];

// ─────────────────────────────────────────────
// LOOKUP MAP — O(1) by card id
// ─────────────────────────────────────────────

export const CARD_MAP: Map<string, CardDefinition> = new Map(
  CARD_DEFINITIONS.map(c => [c.id, c])
);

export function getCard(id: string): CardDefinition {
  const c = CARD_MAP.get(id);
  if (!c) throw new Error(`[CardDefinitions] Unknown card id: "${id}"`);
  return c;
}

// ─────────────────────────────────────────────
// DEMO DECK — 31 cards (King pre-placed, not included)
// Both players use identical deck, independently shuffled.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// UNITS-ONLY DECK — 31 cards (King pre-placed, not included)
// No spells or structures. Focused on unit combat for MVP playtesting.
// Both players use identical pool, each gets an independently shuffled copy.
// ─────────────────────────────────────────────

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
  console.error(`[CardDefinitions] UNITS_ONLY_DECK_IDS has ${UNITS_ONLY_DECK_IDS.length} entries, expected 31`);
}

// Keep old name as alias so nothing else breaks during transition
export const DEMO_DECK_IDS = UNITS_ONLY_DECK_IDS;
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
import { getCard } from './data/CardDefinitions';

import { Player, TurnPhase, EngineStatus } from './types/GameTypes';
import type { Unit, Position, GameStateSnapshot } from './types/GameTypes';
import type { GameEvent } from './types/EventTypes';
import type { PendingInteraction } from './types/AbilityTypes';
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
  private pending: PendingInteraction | null = null;

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
    return {
      turn: {
        turnNumber: this.turnNumber,
        activePlayer: this.activePlayer,
        phase: this.phase,
        unitsActedThisTurn: new Set(
          this.board.getAllUnits()
            .filter(u => u.hasActed || u.hasMoved)
            .map(u => u.instanceId)
        ),
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

    // Capture pending if PlayPhase set one
    if ((ctx as any)._lastPending) {
      this.pending = (ctx as any)._lastPending;
    }

    return success;
  }

  moveUnit(unitId: string, col: number, row: number): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const ctx = this.buildContext();
    return executeMove(ctx, unitId, col, row);
  }

  attackUnit(unitId: string, targetId: string): boolean {
    if (this.status === EngineStatus.AWAITING_INPUT) return false;
    if (this.status === EngineStatus.GAME_OVER) return false;
    if (this.phase !== TurnPhase.ACT) return false;

    const ctx = this.buildContext();
    return executeAttack(ctx, unitId, targetId);
  }

  endPlayPhase(): void {
    if (this.phase !== TurnPhase.PLAY) return;
    this.phase = TurnPhase.ACT;
    this.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.ACT, activePlayer: this.activePlayer, turn: this.turnNumber });
  }

  endActPhase(): void {
    if (this.phase !== TurnPhase.ACT) return;
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
    if (!(this.pending.validTargetIds ?? []).includes(instanceId)) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb(instanceId);
  }

  selectPosition(col: number, row: number): void {
    if (!this.pending || this.pending.kind !== 'POSITION') return;
    if (!(this.pending.validPositions ?? []).some(p => p.col === col && p.row === row)) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb({ col, row });
  }

  selectColumn(col: number): void {
    if (!this.pending || this.pending.kind !== 'COLUMN') return;
    if (col < 0 || col >= this.board.cols) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb(col);
  }

  selectDiscard(handIndex: number): void {
    if (!this.pending || this.pending.kind !== 'DISCARD') return;
    const ps = this.players[this.activePlayer];
    if (handIndex < 0 || handIndex >= ps.hand.length) return;
    const cb = this.pending.resumeCallback;
    this.clearPending();
    cb(handIndex);
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
  }

  // ─────────────────────────────────────────────
  // EVENT APPLICATION — central state mutation
  // ─────────────────────────────────────────────

  private applyEvent(event: GameEvent): void {
    switch (event.type) {
      case 'UNIT_PLACED': {
        const exists = this.board.getUnitById(event.instanceId);
        if (!exists) {
          const newUnit = this.unitFactory.create(event.cardId, event.owner, { col: event.col, row: event.row });
          newUnit.isActive = event.isActive;
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
        if (event.cardId === '__DRAW_OVERFLOW__') {
          const ps = this.players[event.player];
          const drawn = ps.drawCardsOverflow(1);
          if (drawn.length > 0) {
            this.emit({
              type: 'CARD_DRAWN',
              player: event.player,
              cardId: drawn[0],
              handIndex: ps.hand.length - 1,
              deckRemaining: ps.deck.length,
            });
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

import type { GameModifiers as IGameModifiers, TimedEffect } from './types/GameTypes';
import { Player } from './types/GameTypes';

const LEG_RATE_MIN = 1;

export class GameModifiers {
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

  snapshot(): IGameModifiers {
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
import { getCard } from './data/CardDefinitions';

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
// ═══════════════════════════════════════════════════════

function resolveCustomPattern(
  unit: Unit, pattern: CustomPattern, board: Board, isAttack: boolean,
): Position[] {
  const results: Position[] = [];
  const range = pattern.range ?? 1;
  const canJump = pattern.canJump ?? false;
  const { col, row } = unit.position;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const nc = col + offset.dx * step;
      const nr = row + offset.dy * step;
      if (!board.isInBounds(nc, nr)) break;

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

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const nc = col + offset.dx * step;
      const nr = row + offset.dy * step;
      if (!board.isInBounds(nc, nr)) break;
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
  const visited = new Set<string>([`${col},${row}`]);
  const result: Position[] = [];
  const queue = [{ col, row, dist: 0 }];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.dist >= maxDist) continue;

    for (const [dc, dr] of DIRS_OMNI) {
      const nc = curr.col + dc, nr = curr.row + dr;
      const key = `${nc},${nr}`;
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

# src\game\PatternResolver.ts

```ts
import type { CustomPattern, PatternOffset } from './types/CardTypes';
import type { Unit } from './types/GameTypes';
import type { Board } from './Board';

/**
 * Resolve a custom pattern into valid board positions.
 * Works for both movement and attack patterns.
 */
export function resolveCustomPattern(
  unit: Unit,
  pattern: CustomPattern,
  board: Board,
  isAttack: boolean,
): Array<{ col: number; row: number }> {
  const results: Array<{ col: number; row: number }> = [];
  const range = pattern.range ?? 1;

  for (const offset of pattern.offsets) {
    for (let step = 1; step <= range; step++) {
      const col = unit.position.col + offset.dx * step;
      const row = unit.position.row + offset.dy * step;

      // Out of bounds
      if (!board.isInBounds(col, row)) break;

      const occupant = board.getUnit(col, row);

      if (isAttack) {
        // Attack: target must have an enemy
        if (occupant && occupant.owner !== unit.owner) {
          results.push({ col, row });
        }
        // Ranged: can pass through empty squares but not friendlies
        if (occupant && !pattern.canJump) break;
      } else {
        // Movement: cell must be empty (unless canJump)
        if (occupant) {
          if (!pattern.canJump) break;  // blocked
          continue;  // jump over
        }
        results.push({ col, row });
      }
    }
  }

  return results;
}

// ─── Preset offset tables (derived from existing enums) ─────

export const OFFSETS_OMNI: PatternOffset[] = [
  { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy:  0 },                     { dx: 1, dy:  0 },
  { dx: -1, dy:  1 }, { dx: 0, dy:  1 }, { dx: 1, dy:  1 },
];

export const OFFSETS_HV: PatternOffset[] = [
  { dx: 0, dy: -1 },  // up
  { dx: 0, dy:  1 },  // down
  { dx: -1, dy: 0 },  // left
  { dx: 1,  dy: 0 },  // right
];

export const OFFSETS_DIAGONAL: PatternOffset[] = [
  { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
  { dx: -1, dy:  1 }, { dx: 1, dy:  1 },
];

export const OFFSETS_FORWARD_ONLY: PatternOffset[] = [
  { dx: 0, dy: -1 },  // toward enemy
];
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
import type { Unit, Position } from '../types/GameTypes';
import { Player, EngineStatus } from '../types/GameTypes';
import { AtkPattern } from '../types/CardTypes';
import { getCard } from '../data/CardDefinitions';
import { canUnitMove, canUnitAttack } from '../UnitQuery';
import { getValidMoves, getValidAttacks, isMoveValid, isAttackValid, isLancerForwardMove } from '../MovementRules';
import { resolveAttack, resolveAttackWithCounter } from '../CombatResolver';
import { resolveOnDeath, resolveOnKill } from '../AbilityResolver';

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
    (ctx as any)._lastPending = deathResult.pending;
    ctx.status = EngineStatus.AWAITING_INPUT;
  }

  // Recalculate modifiers (removed unit may change discounts)
  ctx.auras.recalculateModifiers(ctx.board, ctx.mods);
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

    const threats = ctx.board.getUnitsOf(opponent(p)).filter(u => {
      const attacks = getValidAttacks(u, ctx.board);
      return attacks.some(pos =>
        pos.col === king.position.col && pos.row === king.position.row
      );
    });

    if (threats.length > 0) {
      ctx.emit({
        type: 'KING_THREATENED',
        kingInstanceId: king.instanceId,
        kingPlayer: p,
        attackerInstanceIds: threats.map(u => u.instanceId),
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
import { getCard } from '../data/CardDefinitions';
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

  // 8. Evaluate auras (stat buffs from Commander, Pikeman, etc.)
  const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
  if (auraEvent.changes.length > 0) ctx.emit(auraEvent);

  // 9. Recalculate modifiers (LEG rate bonus, Royal discount)
  ctx.auras.recalculateModifiers(ctx.board, ctx.mods);

  // Advance to PLAY phase
  ctx.phase = TurnPhase.PLAY;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.PLAY, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });
}

// ─────────────────────────────────────────────
// SUB-STEPS (private to this module)
// ─────────────────────────────────────────────

function runAutoHeals(ctx: GameContext, ap: number): void {
  const healUnits = ctx.board.getUnitsOf(ap).filter(u =>
    u.isActive && getCard(u.cardId).abilities.some(
      (a: any) => a.type === 'AURA_AUTO_HEAL'
    )
  );

  for (const unit of healUnits) {
    const ability = getCard(unit.cardId).abilities.find(
      (a: any) => a.type === 'AURA_AUTO_HEAL'
    ) as any;
    const amount = ability?.params?.amount ?? 2;
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
import type { Unit, Position } from '../types/GameTypes';
import { Allegiance, CardClass, CardFlag } from '../types/CardTypes';
import { getCard } from '../data/CardDefinitions';
import { getValidDeploySquares } from '../MovementRules';
import { resolveOnDeploy } from '../AbilityResolver';
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

  // Recalculate modifiers (new unit may change discounts/rate)
  ctx.auras.recalculateModifiers(ctx.board, ctx.mods);

  // Handle pending interaction (Priest, Mystic, Disease, etc.)
  if (result.pending) {
    ctx.status = EngineStatus.AWAITING_INPUT;
    ctx.emit({
      type: result.pending.kind === 'TARGET'   ? 'PENDING_TARGET'   :
            result.pending.kind === 'POSITION' ? 'PENDING_POSITION' :
            result.pending.kind === 'COLUMN'   ? 'PENDING_COLUMN'   :
                                                  'PENDING_DISCARD',
      reason: result.pending.reason,
      validTargetIds:  result.pending.validTargetIds ?? [],
      validPositions:  result.pending.validPositions ?? [],
      count: 1,
    } as any);
    // Return the pending object to the engine so it can store it
    (ctx as any)._lastPending = result.pending;
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
import { getCard } from './data/CardDefinitions';
import GameState from '../GameState';  // ADD at top

export class PlayerState {
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
  const seed = (GameState as any).gameSeed;
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
// AbilityResolver switches on these strings.
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
// PENDING INTERACTION
// Created by AbilityResolver when engine must pause for input.
// GameEngine stores this and resumes when selectTarget() etc called.
// ─────────────────────────────────────────────

export type PendingInteractionKind =
  | 'TARGET'    // Player picks a unit (Priest, Mystic, Coup, Treason, Disease)
  | 'POSITION'  // Player picks a board square (Casus Belli forward deploy)
  | 'COLUMN'    // Player picks a column 0-5 (Earthquake)
  | 'DISCARD';  // Player picks a hand card to discard (War Horn)

export interface PendingInteraction {
  kind: PendingInteractionKind;
  reason: string;                             // Human-readable for UI
  validTargetIds?: string[];                  // Unit instance IDs for TARGET
  validPositions?: Array<{ col: number; row: number }>; // For POSITION
  resumeCallback: (selection: any) => void;   // GameEngine calls this on resolve
}

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
  dy: number;   // row offset (-1 = toward enemy, +1 = toward own half)
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
  handler: string;             // Handler key — resolved in AbilityResolver
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

import type { Player, TurnPhase, Position, MatchResult } from './GameTypes';

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
import { getCard } from './data/CardDefinitions';
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
import { getCard } from './data/CardDefinitions';

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

export interface MatchResult {
    playerName: string;
    opponentName: string;
    playerRoll: number;
    opponentRoll: number;
    playerWon: boolean;
    isTie: boolean;
    stakeAmount: number;
    payout: number;
}

class GameStateClass {
    // ─── Player ───────────────────────────────────────────────
    playerName: string = "Player";
    opponentName: string = "";          // ← ADDED
    walletAddress: string = "";
    isWalletConnected: boolean = false;

    // ─── Mode ─────────────────────────────────────────────────
    currentMode: GameMode = GameMode.FreePlay;

    // ─── Room ─────────────────────────────────────────────────
    roomCode: string = "";
    roomAction: RoomAction = RoomAction.Create;
    playerIndex: number = 0;     // ← ADD: 0 = P1/creator, 1 = P2/joiner
    gameSeed: number = 0;        // ← ADD: shared shuffle seed (set in Step 5)
    // ─── Match ────────────────────────────────────────────────
    currentStake: number = 1;
    winCount: number = 0;
    lossCount: number = 0;
    lastMatch: MatchResult | null = null;

    // ─── Setters ──────────────────────────────────────────────
    setPlayerName(name: string): void {
        this.playerName = name;
        console.log(`[GameState] Player name set: ${name}`);
    }

    setOpponentName(name: string): void {   // ← ADDED
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

    setLastMatch(match: MatchResult): void {
        this.lastMatch = match;
        console.log(`[GameState] Match saved — Won: ${match.playerWon}`);
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
import { LayoutLoader } from '../config/LayoutLoader';

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
      // Engine is waiting for player to pick a target
      this.engine.selectTarget(col, row);
      this.clearSelection();
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
const attackRange = this.engine.getAttackRange(col, row);

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
  const attackRange = (this.state.selectedBoardCol !== null && this.state.selectedBoardRow !== null)
    ? this.engine.getAttackRange(this.state.selectedBoardCol, this.state.selectedBoardRow)
    : [];

  EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
    moves:       this.state.validMoves,
    attacks:     this.state.validAttacks,
    attackRange: attackRange,
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
      this.onHandCardClicked(index);
    }),

      // When engine enters AWAITING_INPUT, set mode
      EventBus.on(EV.PENDING_TARGET, () => {
        this.state = { ...this.state, mode: 'awaiting_target' };
        EventBus.emit(EV.HIGHLIGHTS_CHANGED, {
          moves: [], attacks: [], auras: [],
        });
      }),

      // When interaction resolves, back to idle
      EventBus.on(EV.INTERACTION_RESOLVED, () => {
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

# src\main.ts

```ts
import Phaser from 'phaser';
import PreLoadScene    from './scenes/PreloadScene';
import MainMenuScene   from './scenes/MainMenuScene';
import RoomScene       from './scenes/RoomScene';
import BattleScene     from './scenes/BattleScene';
import ResultScene     from './scenes/ResultScene';

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
// Handles all Socket.io multiplayer logic
// Equivalent to PhotonManager.cs in Unity

import { io, Socket } from "socket.io-client";
import GameState, { RoomAction } from "../GameState.ts";
export interface GameAction {
  type: 'PLAY_CARD' | 'MOVE_UNIT' | 'ATTACK_UNIT' | 'END_PLAY_PHASE' | 'END_ACT_PHASE';
  handIndex?: number;
  col?: number;
  row?: number;
  fromCol?: number;
  fromRow?: number;
  targetCol?: number;
  targetRow?: number;
}
// ─── Event Callbacks ──────────────────────────────────────────
export interface RoomCallbacks {
  onRoomCreated: (code: string) => void;
  onRoomJoined: (code: string) => void;
  onOpponentJoined: (opponentName: string) => void;
  onOpponentAction: (action: GameAction) => void;
  onOpponentDisconnected: () => void;
  onOpponentRollReceived: (roll: number, opponentName: string) => void;
  onError: (message: string) => void;
  onBothCryptoReady?: () => void;
  onCryptoMatchResult?: (result: CryptoMatchResult) => void;
  onTieReroll?: () => void;
  onPayoutResult?: (result: { success: boolean; txHash?: string; error?: string }) => void;
  onHostDepositConfirmed?: () => void;
  // ← ADD
}

export interface CryptoMatchResult {
  winnerName: string;
  loserName: string;
  winnerRoll: number;
  loserRoll: number;
  txHash?: string;
  success: boolean;
  error?: string;
}

class SocketManagerClass {
  private socket: Socket | null = null;
  private callbacks: RoomCallbacks | null = null;
  private serverUrl: string = "http://localhost:3001";

  connect(callbacks: RoomCallbacks): void {
    this.callbacks = callbacks;

    if (this.socket?.connected) {
      console.log("[SocketManager] Already connected.");
      this.actOnRoomAction();
      return;
    }

    console.log("[SocketManager] Connecting to server...");
    this.socket = io(this.serverUrl);

    this.socket.on("connect", () => {
      console.log("[SocketManager] Connected to server.");
      this.actOnRoomAction();
    });

    this.socket.on("disconnect", () => {
      console.log("[SocketManager] Disconnected from server.");
    });

    this.registerEvents();
  }

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

  // Register wallet address with server (needed for payout)
  registerWallet(walletAddress: string): void {
    console.log(`[SocketManager] Registering wallet: ${walletAddress}`);
    this.socket?.emit("registerWallet", {
      roomCode: GameState.roomCode,
      walletAddress,
    });
  }

  // Signal to server that escrow deposit is confirmed
  signalCryptoReady(): void {
    console.log("[SocketManager] Signaling crypto ready");
    this.socket?.emit("cryptoReady", {
      roomCode: GameState.roomCode,
    });
  }

  sendDiceRoll(roll: number): void {
    console.log(`[SocketManager] Sending roll: ${roll}`);
    this.socket?.emit("diceRoll", {
      roomCode: GameState.roomCode,
      playerName: GameState.playerName,
      roll,
    });
  }

  private registerEvents(): void {
    if (!this.socket) return;

  this.socket.on("roomCreated", (data: { roomCode: string; playerIndex: number }) => {
  console.log(`[SocketManager] Room created: ${data.roomCode}, playerIndex: ${data.playerIndex ?? 0}`);
  GameState.setPlayerIndex(data.playerIndex ?? 0);
  this.callbacks?.onRoomCreated(data.roomCode);
});
this.socket.on("hostDepositConfirmed", () => {
  console.log("[SocketManager] Host deposit confirmed — my turn to deposit");
  this.callbacks?.onHostDepositConfirmed?.();
});
    this.socket.on("roomJoined", (data: { roomCode: string; playerIndex: number }) => {
  console.log(`[SocketManager] Room joined: ${data.roomCode}, playerIndex: ${data.playerIndex ?? 1}`);
  GameState.setPlayerIndex(data.playerIndex ?? 1);
  this.callbacks?.onRoomJoined(data.roomCode);
});
    this.socket.on("opponentJoined", (data: { playerName: string; playerIndex?: number }) => {
  console.log(`[SocketManager] Opponent joined: ${data.playerName}`);
  this.callbacks?.onOpponentJoined(data.playerName);
});
this.socket.on("opponent_action", (action: GameAction) => {
  console.log('[SocketManager] Received opponent_action:', action.type);
  this.callbacks?.onOpponentAction(action);
});
this.socket.on("game_seed", (data: { seed: number }) => {
  console.log(`[SocketManager] Game seed received: ${data.seed}`);
  GameState.setGameSeed(data.seed);
});
    this.socket.on("opponentRoll", (data: { roll: number; playerName: string }) => {
      console.log(`[SocketManager] Opponent rolled: ${data.roll}`);
      this.callbacks?.onOpponentRollReceived(data.roll, data.playerName);
    });

    this.socket.on("opponentDisconnected", () => {
      console.log("[SocketManager] Opponent disconnected.");
      this.callbacks?.onOpponentDisconnected();
    });

    this.socket.on("error", (data: { message: string }) => {
      console.error(`[SocketManager] Error: ${data.message}`);
      this.callbacks?.onError(data.message);
    });

    // Crypto events
    this.socket.on("bothCryptoReady", () => {
      console.log("[SocketManager] Both players crypto ready!");
      this.callbacks?.onBothCryptoReady?.();
    });

    this.socket.on("cryptoMatchResult", (result: CryptoMatchResult) => {
      console.log("[SocketManager] Crypto match result:", result);
      this.callbacks?.onCryptoMatchResult?.(result);
    });
this.socket.on('payout_result', (data: { success: boolean; txHash?: string; error?: string }) => {
  console.log('[SocketManager] Payout result:', data);
  (GameState as any).payoutResult = data;
  this.callbacks?.onPayoutResult?.(data);
});
    this.socket.on("tieReroll", () => {
      console.log("[SocketManager] Tie — re-rolling");
      this.callbacks?.onTieReroll?.();
    });

  }
sendGameAction(action: GameAction): void {
  if (!this.socket?.connected) {
    console.warn('[SocketManager] Cannot send game_action — not connected');
    return;
  }
  this.socket.emit('game_action', {
    roomCode: GameState.roomCode,
    action,
  });
  console.log('[SocketManager] Sent game_action:', action.type);
}
sendGameOver(localPlayerIndex: number, localPlayerWon: boolean): void {
  console.log(`[SocketManager] Sending game_over, won: ${localPlayerWon}`);
  this.socket?.emit('game_over', {
    roomCode: GameState.roomCode,
    winnerIndex: localPlayerWon ? localPlayerIndex : (localPlayerIndex === 0 ? 1 : 0),
  });
}
// ADD this method to SocketManagerClass, before disconnect():
setCallbacks(callbacks: RoomCallbacks): void {
  this.callbacks = callbacks;
  console.log('[SocketManager] Callbacks updated.');
}
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    console.log("[SocketManager] Manually disconnected.");
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

    // Interactivity
    setContainerHitArea(thumb.container, L.width, L.height);
    thumb.container.on('pointerover', () => this.onCellHover(col, row));
    thumb.container.on('pointerout',  () => this.onCellHoverEnd(col, row));
    thumb.container.on('pointerdown', () => EventBus.emit(EV.INPUT_BOARD_CLICK, { col, row }));

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
  }

  clearHighlightType(type: HighlightType): void {
    const toRemove: string[] = [];
    this.highlights.forEach((g, key) => {
      if (key.endsWith(`_${type}`) || key.endsWith(`_${type}_marker`)) {
        g.destroy();
        toRemove.push(key);
      }
    });
    toRemove.forEach(k => this.highlights.delete(k));
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
        onComplete?.();
      },
    });
  }

  animateAttack(
    from: { col: number; row: number },
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
    if (this.hoveredCell) this.clearHighlightType('hover');
    this.hoveredCell = this.cellKey(col, row);
    this.addHighlight(col, row, 'hover');
    EventBus.emit(EV.CARD_HOVERED, { col, row });
  }

  private onCellHoverEnd(_col: number, _row: number): void {
    this.clearHighlightType('hover');
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

      EventBus.on(EV.UNIT_ATTACKED, ({ from, target, damage }) => {
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
        const activeKeys = new Set(cells.map(c => this.cellKey(c.col, c.row)));
        this.unitsByCell.forEach((thumb, key) => {
          thumb.setCanAct(activeKeys.has(key));
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

# src\renderers\CardRenderer.ts

```ts
// ============================================================
// CardRenderer.ts
// Renders a single card as a Phaser Container at any of 3 modes:
//   'full'      — in-hand card (140×200 default)
//   'thumbnail' — on-board unit (100×100 default)
//   'detail'    — overlay detail (220×320 default)
//
// ALL proportions come from LayoutJSON.cards and ThemeJSON.cards.
// Change card width/height in JSON → entire card rescales.
// No hardcoded pixel values below.
//
// PATCH v0.3.2:
//   - renderThumbnail: badge groups wrapped in named containers
//     ('atk_badge', 'def_badge') for in-place updates
//   - NEW: updateThumbnailBadges() — updates ATK/DEF/canAct
//     in-place without destroying the parent container.
//     This eliminates tween race conditions entirely.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData, CardRenderMode } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class CardRenderer {
  private scene: Phaser.Scene;
  private layout: BattleLayoutJSON;
  private theme: ThemeJSON;

  private static _missingKeyWarned = new Set<string>();

  constructor(scene: Phaser.Scene, layout: BattleLayoutJSON, theme: ThemeJSON) {
    this.scene = scene;
    this.layout = layout;
    this.theme = theme;
  }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────

  render(data: CardRenderData, mode: CardRenderMode, x: number, y: number): Phaser.GameObjects.Container {
    switch (mode) {
      case 'full':      return this.renderFull(data, x, y);
      case 'thumbnail': return this.renderThumbnail(data, x, y);
      case 'detail':    return this.renderDetail(data, x, y);
    }
  }

  updateState(container: Phaser.GameObjects.Container, data: CardRenderData, mode: CardRenderMode): void {
    if (mode === 'thumbnail') {
      this.applyThumbnailState(container, data);
    } else {
      this.applyFullState(container, data);
    }
  }

  /**
   * Update ATK/DEF badges and canAct glow IN-PLACE on an existing thumbnail container.
   * Does NOT destroy or recreate the container — only swaps named child elements.
   * Safe to call while tweens are animating the container position.
   */
  updateThumbnailBadges(
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

    // ── Update ATK badge ──
    const oldAtk = container.getByName('atk_badge');
    if (oldAtk) container.remove(oldAtk, true);
    if (atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = this.makeBadge(
        2, h - BT.unitBandHeight - 2,
        String(atk),
        this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // ── Update DEF/HP badge ──
    const oldDef = container.getByName('def_badge');
    if (oldDef) container.remove(oldDef, true);
    if (currentHP !== undefined) {
      const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = this.makeBadge(
        w - 2, h - BT.unitBandHeight - 2,
        String(currentHP),
        defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // ── Update canAct glow ──
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

  // ─────────────────────────────────────────────
  // FULL CARD (in-hand)
  // ─────────────────────────────────────────────

  private renderFull(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
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
    this.safeImage(
      container, iconKey,
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
      if (!CardRenderer._missingKeyWarned.has(artKey)) {
        CardRenderer._missingKeyWarned.add(artKey);
        console.warn(`[CardRenderer] Art texture missing, using fallback rect: "${artKey}"`);
      }
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
      const atkBadge = this.makeBadge(
        4, statY + L.statRowHeight / 2,
        `ATK ${data.atk}`, this.theme.cards.atkBadgeColor, L.statRowHeight - 4
      );
      const defBadge = this.makeBadge(
        w - 4, statY + L.statRowHeight / 2,
        `DEF ${data.def}`, this.theme.cards.defBadgeColor, L.statRowHeight - 4, true
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
    this.applyFullState(container, data);

    return container;
  }

  // ─────────────────────────────────────────────
  // THUMBNAIL (on-board unit)
  // Named children: 'atk_badge', 'def_badge', 'can_act_glow'
  // These can be swapped in-place by updateThumbnailBadges()
  // ─────────────────────────────────────────────

  private renderThumbnail(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
    const L = this.layout.cards.thumbnail;
    const BT = this.theme.board;
    const container = this.scene.add.container(x, y);

    const w = L.width;
    const h = L.height;

    // — Art —
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

    // — Team color border —
    const border = this.scene.add.graphics();
    const borderColor = data.isEnemy ? BT.unitBandEnemy : BT.unitBandPlayer;
    border.lineStyle(2, ThemeLoader.hexToNum(borderColor), 1);
    border.strokeRect(0, 0, w, h);
    container.add(border);

    // — Team color band at bottom —
    const band = this.scene.add.graphics();
    band.fillStyle(ThemeLoader.hexToNum(borderColor), 0.9);
    band.fillRect(0, h - BT.unitBandHeight, w, BT.unitBandHeight);
    container.add(band);

    // — ATK badge (named container for in-place updates) —
    if (data.atk !== undefined) {
      const atkGroup = this.scene.add.container(0, 0);
      atkGroup.setName('atk_badge');
      const atkParts = this.makeBadge(
        2, h - BT.unitBandHeight - 2,
        String(data.atk), this.theme.cards.atkBadgeColor,
        L.badgeFontSize, false, L.badgeWidth, L.badgeHeight
      );
      atkGroup.add(atkParts);
      container.add(atkGroup);
    }

    // — DEF/HP badge (named container for in-place updates) —
    if (data.currentHP !== undefined) {
      const hpPct = (data.maxHP && data.maxHP > 0) ? data.currentHP / data.maxHP : 1;
      const defColor = hpPct > 0.5 ? this.theme.cards.defBadgeColor
                     : hpPct > 0.25 ? BT.hpBarMid
                     : BT.hpBarLow;
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = this.makeBadge(
        w - 2, h - BT.unitBandHeight - 2,
        String(data.currentHP), defColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight
      );
      defGroup.add(defParts);
      container.add(defGroup);
    } else if (data.def !== undefined) {
      const defGroup = this.scene.add.container(0, 0);
      defGroup.setName('def_badge');
      const defParts = this.makeBadge(
        w - 2, h - BT.unitBandHeight - 2,
        String(data.def), this.theme.cards.defBadgeColor,
        L.badgeFontSize, true, L.badgeWidth, L.badgeHeight
      );
      defGroup.add(defParts);
      container.add(defGroup);
    }

    // — "Can Act" gold glow (named for in-place toggle) —
    if (data.canAct) {
      const glow = this.scene.add.graphics();
      glow.lineStyle(3, 0xF5A623, 0.9);
      glow.strokeRect(-1, -1, w + 2, h + 2);
      glow.setName('can_act_glow');
      container.add(glow);
    }

    this.applyThumbnailState(container, data);
    return container;
  }

  // ─────────────────────────────────────────────
  // DETAIL OVERLAY
  // ─────────────────────────────────────────────

  private renderDetail(data: CardRenderData, x: number, y: number): Phaser.GameObjects.Container {
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

    const subRenderer = new CardRenderer(this.scene, detailLayout, this.theme);
    const cardBody = subRenderer.renderFull(data, 0, 0);
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

  // ─────────────────────────────────────────────
  // CARD BACK
  // ─────────────────────────────────────────────

  renderBack(x: number, y: number, width: number, height: number): Phaser.GameObjects.Container {
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

  // ─────────────────────────────────────────────
  // STATE OVERLAYS
  // ─────────────────────────────────────────────

  private applyFullState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
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
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.8
      );
      overlay.strokeRoundedRect(
        -this.theme.cards.selectedGlowSize / 2,
        -this.theme.cards.selectedGlowSize / 2,
        L.width + this.theme.cards.selectedGlowSize,
        L.height + this.theme.cards.selectedGlowSize,
        L.cornerRadius
      );
    }

    container.add(overlay);
  }

  private applyThumbnailState(container: Phaser.GameObjects.Container, data: CardRenderData): void {
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
        ThemeLoader.hexToNum(this.theme.cards.selectedGlowColor), 0.9
      );
      overlay.strokeRect(0, 0, L.width, L.height);
    }

    container.add(overlay);
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private safeImage(
    container: Phaser.GameObjects.Container,
    key: string, x: number, y: number, w: number, h: number,
    originX = 0, originY = 0,
    fallbackColor = 0x333355, fallbackAlpha = 0.6,
  ): void {
    if (this.scene.textures.exists(key)) {
      const img = this.scene.add.image(x, y, key)
        .setOrigin(originX, originY)
        .setDisplaySize(w, h);
      container.add(img);
    } else {
      const rx = originX === 0.5 ? x - w / 2 : x;
      const ry = originY === 0.5 ? y - h / 2 : y;
      const rect = this.scene.add.graphics();
      rect.fillStyle(fallbackColor, fallbackAlpha);
      rect.fillRect(rx, ry, w, h);
      container.add(rect);

      if (!CardRenderer._missingKeyWarned.has(key)) {
        CardRenderer._missingKeyWarned.add(key);
        console.warn(`[CardRenderer] Texture not found, using fallback rect: "${key}"`);
      }
    }
  }

  private makeBadge(
    x: number, y: number, label: string, fillHex: string,
    fontSize: number, rightAligned = false, w = 24, h = 16
  ): Phaser.GameObjects.GameObject[] {
    const bgX = rightAligned ? x - w : x;

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(fillHex), 1);
    bg.fillRoundedRect(bgX, y - h / 2, w, h, 4);

    const text = this.scene.add.text(x + (rightAligned ? -w / 2 : w / 2), y, label, {
      fontFamily: this.theme.fonts.cardStat.family,
      fontSize: `${fontSize}px`,
      color: '#FFFFFF',
    }).setOrigin(0.5, 0.5);

    return [bg, text];
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
      cardContainer.on('pointerup',    () => {});

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

  /**
   * Calculate a card's X, Y, and rotation angle in the fan layout.
   * All values are derived from layout.leftHUD.hand config.
   */
  private cardPosition(
    index: number,
    total: number,
    H: typeof this.layout.leftHUD.hand
  ): { x: number; y: number; angle: number } {
    if (total === 1) {
      return { x: H.x - H.cardWidth / 2, y: H.y, angle: 0 };
    }

    // Stack vertically with optional fan
    const totalHeight = (total - 1) * (H.cardHeight + H.spacing);
    const startY = H.y;

    // Fan angle: cards fan from center, negative left / positive right
    const centerIdx = (total - 1) / 2;
    const angle = (index - centerIdx) * H.fanAngle;

    // X shift based on fan angle so cards spread slightly
    const xShift = (index - centerIdx) * (H.fanAngle * 0.8);

    return {
      x: H.x - H.cardWidth / 2 + xShift,
      y: startY + index * (H.cardHeight + H.spacing),
      angle,
    };
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
import type { BattleLayoutJSON, ThemeJSON, HUDSnapshot, ButtonStyle } from '../game/types/UITypes';
import { EventBus, EV } from '../events/EventBus';
import { ThemeLoader } from '../config/ThemeLoader';
import { setContainerHitArea } from '../utils/PhaserUtils';

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
      this.endTurnBtn = this.makeButton(
        L.endTurnBtn.x - L.endTurnBtn.width / 2,
        L.endTurnBtn.y - L.endTurnBtn.height / 2,
        L.endTurnBtn.width,
        L.endTurnBtn.height,
        'END TURN',
        this.theme.buttons.endTurn,
        () => { if (this.onEndTurn) this.onEndTurn(); }
      );
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

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    style: ButtonStyle,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(style.fillColor), 1);
    bg.fillRoundedRect(0, 0, w, h, style.cornerRadius);
    bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
    bg.strokeRoundedRect(0, 0, w, h, style.cornerRadius);

    const txt = this.scene.add.text(w / 2, h / 2, label, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${style.fontSize}px`,
      color: style.textColor,
    }).setOrigin(0.5, 0.5);

    container.add([bg, txt]);
    setContainerHitArea(container, w, h);

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(ThemeLoader.hexToNum(style.hoverFillColor), 1);
      bg.fillRoundedRect(0, 0, w, h, style.cornerRadius);
      bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
      bg.strokeRoundedRect(0, 0, w, h, style.cornerRadius);
      txt.setColor(style.hoverTextColor);
    });

    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(ThemeLoader.hexToNum(style.fillColor), 1);
      bg.fillRoundedRect(0, 0, w, h, style.cornerRadius);
      bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
      bg.strokeRoundedRect(0, 0, w, h, style.cornerRadius);
      txt.setColor(style.textColor);
    });

    container.on('pointerdown', onClick);

    return container;
  }

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

export interface TargetSelectConfig {
  prompt: string;
  positions?: Array<{ col: number; row: number }>; // board positions to highlight
  cards?: CardRenderData[];                         // cards to show (for discard)
  mode: 'board' | 'hand' | 'graveyard';
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

  private unsubs: Array<() => void> = [];

  // Callbacks
  private onTargetSelected?: (payload: any) => void;
  private onCloseOverlay?: () => void;

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

  /** Show the target selection modal. */
  showTargetSelect(config: TargetSelectConfig, onSelect: (payload: any) => void): void {
    this.close();
    this.onTargetSelected = onSelect;

    const L = this.layout.overlays.targetSelect;
    const T = this.theme.overlays;

    this.showDimmer(0.6);
    const panel = this.makePanel(L);

    // Prompt text
    const prompt = this.scene.add.text(0, -L.height / 2 + 20, config.prompt, {
      fontFamily: this.theme.fonts.heading.family,
      fontSize: `${this.theme.fonts.heading.size}px`,
      color: T.titleColor,
      wordWrap: { width: L.width - 40 },
      align: 'center',
    }).setOrigin(0.5, 0);
    panel.add(prompt);

    // Cancel button
    const cancelBtn = this.makePanelButton(
      0, L.height / 2 - 30,
      'CANCEL',
      this.theme.buttons.secondary,
      80, 28,
      () => {
        this.close();
        EventBus.emit(EV.INTERACTION_RESOLVED, { cancelled: true });
      }
    );
    panel.add(cancelBtn);

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
    const playAgainBtn = this.makePanelButton(
      -60, L.height / 2 - 40,
      'PLAY AGAIN',
      this.theme.buttons.primary,
      120, 40,
      onPlayAgain
    );

    // Menu button
    const menuBtn = this.makePanelButton(
      80, L.height / 2 - 40,
      'MENU',
      this.theme.buttons.secondary,
      80, 40,
      onMenu
    );

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

    // ESC key to close
    const escKey = this.scene.input.keyboard?.addKey('ESC');
    escKey?.once('down', () => {
      this.close();
      EventBus.emit(EV.DETAIL_HIDE, {});
    });

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
    const closeBtn = this.makePanelButton(
      0, L.height / 2 - 25,
      'CLOSE',
      this.theme.buttons.secondary,
      80, 30,
      () => { this.close(); onClose(); }
    );
    panel.add(closeBtn);

    this.activeOverlay = panel;
    this.rootContainer.add(panel);
  }

  /** Close the current overlay. */
  close(): void {
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

  private makePanelButton(
    x: number, y: number,
    label: string,
    style: typeof this.theme.buttons.primary,
    w: number, h: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(ThemeLoader.hexToNum(style.fillColor), 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, style.cornerRadius);
    bg.lineStyle(style.strokeWidth, ThemeLoader.hexToNum(style.strokeColor), 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, style.cornerRadius);

    const txt = this.scene.add.text(0, 0, label, {
      fontFamily: this.theme.fonts.body.family,
      fontSize: `${style.fontSize}px`,
      color: style.textColor,
    }).setOrigin(0.5, 0.5);

    container.add([bg, txt]);
    container.setSize(w, h);
    container.setInteractive();

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(ThemeLoader.hexToNum(style.hoverFillColor), 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, style.cornerRadius);
    });
    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(ThemeLoader.hexToNum(style.fillColor), 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, style.cornerRadius);
    });
    container.on('pointerdown', onClick);

    return container;
  }

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
      EventBus.on(EV.PENDING_TARGET, (config: TargetSelectConfig) => {
        this.showTargetSelect(config, (payload) => {
          EventBus.emit(EV.INTERACTION_RESOLVED, payload);
        });
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
// instanceId enables identity-based lookup during tweens.
//
// v0.5: Stable across tween animations. Stats can be updated
//       by instanceId even while container position is animating.
// ============================================================

import Phaser from 'phaser';
import type { BattleLayoutJSON, ThemeJSON, CardRenderData } from '../game/types/UITypes';
import { ThemeLoader } from '../config/ThemeLoader';

export class UnitThumbnail {
  readonly container: Phaser.GameObjects.Container;
  readonly instanceId: string;

  private atkBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private atkBadgeText: Phaser.GameObjects.Text | null = null;
  private defBadgeBg: Phaser.GameObjects.Graphics | null = null;
  private defBadgeText: Phaser.GameObjects.Text | null = null;
  private canActGlow: Phaser.GameObjects.Graphics | null = null;

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

  // ─── Targeted stat updates — safe during tweens ───

  setAtk(atk: number | undefined): void {
    if (this.atkBadgeBg) { this.atkBadgeBg.destroy(); this.atkBadgeBg = null; }
    if (this.atkBadgeText) { this.atkBadgeText.destroy(); this.atkBadgeText = null; }
    if (atk === undefined) return;

    const bx = 2, by = this.h - this.bandHeight - 2;
    this.atkBadgeBg = this.scene.add.graphics();
    this.atkBadgeBg.fillStyle(ThemeLoader.hexToNum(this.atkBadgeColor), 1);
    this.atkBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 4);
    this.atkBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(atk), {
      fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, color: '#FFFFFF',
    }).setOrigin(0.5, 0.5);
    this.container.add([this.atkBadgeBg, this.atkBadgeText]);
  }

  setDef(currentHP: number | undefined, maxHP: number | undefined): void {
    if (this.defBadgeBg) { this.defBadgeBg.destroy(); this.defBadgeBg = null; }
    if (this.defBadgeText) { this.defBadgeText.destroy(); this.defBadgeText = null; }
    if (currentHP === undefined) return;

    const bx = this.w - 2 - this.badgeWidth, by = this.h - this.bandHeight - 2;
    const hpPct = (maxHP && maxHP > 0) ? currentHP / maxHP : 1;
    const fillColor = hpPct > 0.5 ? this.defBadgeColor : hpPct > 0.25 ? this.hpMidColor : this.hpLowColor;

    this.defBadgeBg = this.scene.add.graphics();
    this.defBadgeBg.fillStyle(ThemeLoader.hexToNum(fillColor), 1);
    this.defBadgeBg.fillRoundedRect(bx, by - this.badgeHeight / 2, this.badgeWidth, this.badgeHeight, 4);
    this.defBadgeText = this.scene.add.text(bx + this.badgeWidth / 2, by, String(currentHP), {
      fontFamily: this.fontFamily, fontSize: `${this.badgeFontSize}px`, color: '#FFFFFF',
    }).setOrigin(0.5, 0.5);
    this.container.add([this.defBadgeBg, this.defBadgeText]);
  }

  setCanAct(canAct: boolean): void {
    if (this.canActGlow) { this.canActGlow.destroy(); this.canActGlow = null; }
    if (!canAct) return;
    this.canActGlow = this.scene.add.graphics();
    this.canActGlow.lineStyle(3, 0xF5A623, 0.9);
    this.canActGlow.strokeRect(-1, -1, this.w + 2, this.h + 2);
    this.container.add(this.canActGlow);
  }

  updateStats(atk: number | undefined, currentHP: number | undefined, maxHP: number | undefined, canAct: boolean): void {
    this.setAtk(atk);
    this.setDef(currentHP, maxHP);
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

# src\scenes\BattleScene.ts

```ts
// ============================================================
// BattleScene.ts — Phase 2 board game scene
//
// PATCH v0.5:
//   - emitStatsChanged sends instanceId (not col/row) so
//     BoardRenderer can find the thumbnail even mid-tween.
//   - UNIT_ATTACKED updates BOTH target AND attacker stats
//     (counter-attack can damage the attacker too).
//   - UNIT_MOVED no longer sends `data` — BoardRenderer
//     only re-keys the thumbnail, no destroy+recreate.
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
import type { BattleLayoutJSON, ThemeJSON } from '../game/types/UITypes';
import GameState from '../GameState';
import { getCard } from '../game/data/CardDefinitions';
import type { CardRenderData } from '../game/types/UITypes';
import { Player } from '../game/types/GameTypes';
import SocketManager, { type GameAction } from '../network/SocketManager';

function toCardRenderData(
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

function unitCanAct(unit: any, activePlayer: number): boolean {
  return unit.owner === activePlayer
    && !unit.hasMoved && !unit.hasActed && !unit.isJustPlaced && unit.isActive;
}

/**
 * Emit UNIT_STATS_CHANGED for a unit by instanceId.
 * BoardRenderer looks this up in its instanceId index — works even mid-tween.
 */
function emitStatsChanged(engine: any, instanceId: string): void {
  const state = engine.getState();
  const cell = state.board.find((c: any) => c.unit?.instanceId === instanceId);
  if (!cell?.unit) return;
  const u = cell.unit;
  EventBus.emit('UNIT_STATS_CHANGED', {
    instanceId: u.instanceId,    // ← KEY CHANGE: send instanceId, not col/row
    atk: u.currentAtk,
    currentHP: u.currentDef,
    maxHP: u.maxDef,
    canAct: unitCanAct(u, state.turn?.activePlayer),
  });
}

function refreshCanActIndicators(engine: any): void {
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

interface BattleSceneData {
  playerName: string;
  opponentName: string;
  isCryptoMode: boolean;
  roomCode: string;
}

function wireEngineToEventBus(engine: any, localPlayerIndex: number): void {
  engine.on((event: any) => {
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

      // UNIT_MOVED: only send from/to — BoardRenderer re-keys the thumbnail
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

      // UNIT_ATTACKED: update BOTH target and attacker badges immediately.
      // Counter-attack damages the attacker too — both need badge refresh.
      case 'UNIT_ATTACKED': {
        EventBus.emit('UNIT_ATTACKED', event);
        emitStatsChanged(engine, event.targetInstanceId);
        // Also update attacker (counter-attack may have damaged them)
        if (event.attackerInstanceId && event.attackerInstanceId !== 'EFFECT') {
          emitStatsChanged(engine, event.attackerInstanceId);
        }
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
        EventBus.emit(event.type, event);
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
  });
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

  constructor() { super('BattleScene'); }
  init(data: BattleSceneData) { this.sceneData = data; }

  private getBoardUnit(col: number, row: number) {
    const cell = this.engine.getState().board.find(c => c.col === col && c.row === row);
    return cell?.unit ?? null;
  }

  private replayOpponentAction(action: GameAction): void {
    console.log('[BattleScene] Replaying opponent action:', action.type);
    switch (action.type) {
      case 'PLAY_CARD':
        this.engine.playCard(action.handIndex!, action.col, action.row); break;
      case 'MOVE_UNIT': {
        const unit = this.getBoardUnit(action.fromCol!, action.fromRow!);
        if (unit) this.engine.moveUnit(unit.instanceId, action.col!, action.row!);
        else console.warn('[BattleScene] MOVE_UNIT replay: no unit at', action.fromCol, action.fromRow);
        break;
      }
      case 'ATTACK_UNIT': {
        const attacker = this.getBoardUnit(action.fromCol!, action.fromRow!);
        const target   = this.getBoardUnit(action.targetCol!, action.targetRow!);
        if (attacker && target) this.engine.attackUnit(attacker.instanceId, target.instanceId);
        else console.warn('[BattleScene] ATTACK_UNIT replay: unit not found');
        break;
      }
      case 'END_PLAY_PHASE': this.engine.endPlayPhase(); break;
      case 'END_ACT_PHASE':  this.engine.endActPhase(); break;
      default: console.warn('[BattleScene] Unknown opponent action:', (action as any).type);
    }
  }

  private handleOpponentDisconnect(): void {
    const playerName   = this.sceneData?.playerName   ?? GameState.playerName ?? 'You';
    const opponentName = this.sceneData?.opponentName ?? GameState.opponentName ?? 'Opponent';

    GameState.recordWin();
    GameState.setLastMatch({
      playerName, opponentName, playerRoll: 0, opponentRoll: 0,
      playerWon: true, isTie: false, stakeAmount: GameState.currentStake,
      payout: GameState.currentMode === 'CryptoPlay' ? GameState.currentStake * 2 * 0.95 : 0,
    });
    (GameState as any).lastMatchExtra = {
      reason: 'DISCONNECT', turnCount: this.engine?.getState()?.turn?.turnNumber ?? 0, winnerName: playerName,
    };

    this.add.rectangle(640, 360, 600, 120, 0x000000, 0.85);
    this.add.text(640, 345, 'Opponent disconnected', { fontSize: '26px', color: '#FF6666', align: 'center' }).setOrigin(0.5);
    this.add.text(640, 380, 'You win! Going to results...', { fontSize: '18px', color: '#00FF88', align: 'center' }).setOrigin(0.5);

    this.time.delayedCall(3000, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ResultScene'));
    });
  }

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

    this.engine = new GameEngine();
    wireEngineToEventBus(this.engine, localPlayerIndex);

    // ─── HUD refresh ──────────────────────────
    const refreshHUD = () => {
      const state = this.engine.getState();
      if (!state) return;
      const oppIdx = localPlayerIndex === 0 ? 1 : 0;
      const getKingHP = (owner: number) => {
        const cell = state.board.find(c => c.unit?.cardId === 'king' && c.unit?.owner === owner);
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

    this.hudUnsubs.push(EventBus.on(EV.LEG_GAINED,        refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.LEG_SPENT,         refreshHUD));
    this.hudUnsubs.push(EventBus.on('LEG_RATE_CHANGED',   refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.UNIT_ATTACKED,     refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.UNIT_HEALED,       refreshHUD));
    this.hudUnsubs.push(EventBus.on('PHASE_CHANGED',      refreshHUD));
    this.hudUnsubs.push(EventBus.on('TURN_STARTED',       refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.CARD_PLAYED,       refreshHUD));
    this.hudUnsubs.push(EventBus.on('OPPONENT_CARD_DRAWN', refreshHUD));

    this.boardRenderer   = new BoardRenderer(this, layout, theme, localPlayerIndex);
    this.handRenderer    = new HandRenderer(this, layout, theme);
    this.hudRenderer     = new HUDRenderer(this, layout, theme);
    this.overlayRenderer = new OverlayRenderer(this, layout, theme);
    this.hudRenderer.setLocalPlayer(localPlayerIndex);

    this.selectionManager = new SelectionManager(layout, {
      getAttackRange: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getAttackRange(unit.instanceId).map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidMoves: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getValidMoveSquares(unit.instanceId).map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidAttacks: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getValidAttackSquares(unit.instanceId).map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidDeployPositions: () => {
        return this.engine.getValidDeployPositions().map((p: any) => ({ col: p.col, row: p.row }));
      },
      playCard: (handIndex: number, col: number, row: number) => {
        const ok = this.engine.playCard(handIndex, col, row);
        if (ok !== false) SocketManager.sendGameAction({ type: 'PLAY_CARD', handIndex, col, row });
      },
      moveUnit: (fromCol: number, fromRow: number, toCol: number, toRow: number) => {
        const unit = this.getBoardUnit(fromCol, fromRow);
        if (!unit) return;
        const ok = this.engine.moveUnit(unit.instanceId, toCol, toRow);
        if (ok !== false) SocketManager.sendGameAction({ type: 'MOVE_UNIT', fromCol, fromRow, col: toCol, row: toRow });
      },
      attackUnit: (fromCol: number, fromRow: number, targetCol: number, targetRow: number) => {
        const attacker = this.getBoardUnit(fromCol, fromRow);
        const target   = this.getBoardUnit(targetCol, targetRow);
        if (!attacker || !target) return;
        const ok = this.engine.attackUnit(attacker.instanceId, target.instanceId);
        if (ok !== false) SocketManager.sendGameAction({ type: 'ATTACK_UNIT', fromCol, fromRow, targetCol, targetRow });
      },
      selectTarget: (instanceId: string) => this.engine.selectTarget(instanceId),
      selectPosition: (col: number, row: number) => this.engine.selectPosition(col, row),
      selectHandCard: () => {},
      isAwaitingInput: () => this.engine.getState().status === 'AWAITING_INPUT',
      canAct: () => {
        const state = this.engine.getState();
        return state.turn?.activePlayer === localPlayerIndex && state.turn?.phase === 'ACT';
      },
      isPlayerUnit: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        return unit?.owner === localPlayerIndex;
      },
      isOccupied: (col: number, row: number) => this.getBoardUnit(col, row) !== null,
      getPhase: () => this.engine.getState().turn?.phase ?? 'DRAW',
    } as any);

    EventBus.emit(EV.HUD_REFRESH, {
      playerName, opponentName,
      playerKingHP: 30, playerKingMaxHP: 30, opponentKingHP: 30, opponentKingMaxHP: 30,
      playerLEG: 1, playerCrown: 1, opponentLEGCount: 1,
      currentPhase: 'DRAW', turnNumber: 1, isPlayerTurn: true,
      playerWins: GameState.winCount, playerLosses: GameState.lossCount,
      opponentHandCount: 4,
    });

    this.hudRenderer.onEndTurnClick(() => {
      const state = this.engine.getState();
      if (state.turn?.activePlayer !== localPlayerIndex) return;
      const phase = state.turn?.phase;
      if (phase === 'PLAY') {
        this.engine.endPlayPhase();
        SocketManager.sendGameAction({ type: 'END_PLAY_PHASE' });
      } else if (phase === 'ACT') {
        this.engine.endActPhase();
        SocketManager.sendGameAction({ type: 'END_ACT_PHASE' });
      }
    });

    EventBus.on(EV.GAME_OVER, (ev: any) => {
      if (!this.scene.isActive('BattleScene')) return;
      const result = ev.result ?? ev;
      const turnCount = result?.turns ?? this.engine.getState().turn?.turnNumber ?? 0;
      const reason = result?.reason ?? 'KING_DESTROYED';
      const playerWon = (result?.winner ?? ev.winner) === localPlayerIndex;
      if (playerWon) GameState.recordWin(); else GameState.recordLoss();
      GameState.setLastMatch({
        playerName, opponentName, playerRoll: 0, opponentRoll: 0, playerWon, isTie: false,
        stakeAmount: GameState.currentStake, payout: playerWon ? GameState.currentStake * 2 * 0.95 : 0,
      });
      (GameState as any).lastMatchExtra = { reason, turnCount, winnerName: playerWon ? playerName : opponentName };
      if (this.sceneData.isCryptoMode) SocketManager.sendGameOver(localPlayerIndex, playerWon);
      this.time.delayedCall(1500, () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ResultScene'));
      });
    });

    SocketManager.setCallbacks({
      onRoomCreated: (code) => GameState.setRoomCode(code),
      onRoomJoined: (code) => GameState.setRoomCode(code),
      onOpponentJoined: (name) => GameState.setOpponentName(name),
      onOpponentAction: (action: GameAction) => this.replayOpponentAction(action),
      onOpponentDisconnected: () => this.handleOpponentDisconnect(),
      onOpponentRollReceived: () => {},
      onError: (msg) => console.error('[BattleScene] Socket error:', msg),
      onPayoutResult: () => {},
    });

    this.engine.startGame();
    const v = this.engine.getState();
    console.log('[BattleScene] Game started —',
      `P1 hand: ${v.players[0]?.hand?.length ?? '?'}`,
      `P2 hand: ${v.players[1]?.hand?.length ?? '?'}`,
      `Board units: ${v.board.filter(c => c.unit).length}`,
      `Phase: ${v.turn?.phase}`, `Active: P${(v.turn?.activePlayer ?? 0) + 1}`
    );
  }

  shutdown() {
    this.hudUnsubs.forEach(unsub => unsub());
    EventBus.clearAll?.();
    this.boardRenderer?.destroy?.();
    this.handRenderer?.destroy?.();
    this.hudRenderer?.destroy?.();
    this.overlayRenderer?.destroy?.();
    this.selectionManager?.destroy?.();
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

    // Fade in
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Static text ──────────────────────────────────────────
    this.add.text(LAYOUT.title.x, LAYOUT.title.y, 'OnChainBattles', {
      fontSize: '44px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(LAYOUT.tagline.x, LAYOUT.tagline.y, 'Chess-like On-Chain Card Game', {
      fontSize: '18px',
      fontFamily: '"Courier New", monospace',
      color: '#888888',
    }).setOrigin(0.5);

    // ── Labels ───────────────────────────────────────────────
    this.add.text(LAYOUT.nameLabel.x, LAYOUT.nameLabel.y, 'Your Name', {
      fontSize: '16px',
      fontFamily: '"Courier New", monospace',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(LAYOUT.roomLabel.x, LAYOUT.roomLabel.y, 'Room Code  (leave blank to create new room)', {
      fontSize: '14px',
      fontFamily: '"Courier New", monospace',
      color: '#777777',
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

    const resultMsg = match.playerWon
      ? `Last: You beat ${match.opponentName}! (${match.playerRoll} vs ${match.opponentRoll})`
      : match.isTie
      ? `Last: Tie with ${match.opponentName}`
      : `Last: ${match.opponentName} beat you (${match.playerRoll} vs ${match.opponentRoll})`;

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
    console.log('[PreloadScene] All assets loaded. Starting MainMenuScene.');
    MipmapHelper.enableAll(this);
    this.scene.start('MainMenuScene');
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
// Reads GameState.lastMatch + lastMatchExtra + payoutResult.
//
// Handles:
//   - Victory / Defeat / Tie headline
//   - Winner name + reason (King destroyed, Disconnect, etc.)
//   - Turn count
//   - AVAX payout amount + clickable tx link (crypto mode)
//   - Win/loss record
//   - Play Again / Menu buttons
//   - Auto-navigate to MainMenu after 15s
// ============================================================

import Phaser from 'phaser';
import GameState, { GameMode } from '../GameState';

interface MatchExtra {
  reason?: string;
  turnCount?: number;
  winnerName?: string;
}

interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create() {
    const { width, height } = this.scale;
    const match = GameState.lastMatch;
    const extra = (GameState as any).lastMatchExtra as MatchExtra | undefined;
    const payoutResult = (GameState as any).payoutResult as PayoutResult | undefined;

    // ── Background ─────────────────────────────────────────────
    if (this.textures.exists('bg_result')) {
      this.add.image(width / 2, height / 2, 'bg_result').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }

    // ── Title ──────────────────────────────────────────────────
    this.add.text(width / 2, 50, 'OnChainBattles', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ── No match data fallback ─────────────────────────────────
    if (!match) {
      this.add.text(width / 2, height / 2, 'Match Complete', {
        fontSize: '48px', color: '#ffffff',
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
    const headlineColor = tie ? '#f5a623' : won ? '#00ff88' : '#ff4444';
    const panelBorder = tie ? 0xf5a623 : won ? 0x00ff88 : 0xff4444;

    // ── Central panel ──────────────────────────────────────────
    const panelW = 600;
    const panelH = 400;
    const panelX = width / 2;
    const panelY = height / 2 - 10;

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x16213e, 0.92);
    panelBg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 10);
    panelBg.lineStyle(2, panelBorder, 1);
    panelBg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, 10);

    // ── Headline ───────────────────────────────────────────────
    let yPos = panelY - panelH / 2 + 50;

    this.add.text(panelX, yPos, headline, {
      fontSize: '56px', color: headlineColor, fontStyle: 'bold',
    }).setOrigin(0.5);
    yPos += 70;

    // ── Winner name ────────────────────────────────────────────
    const winnerName = extra?.winnerName
      ?? (won ? match.playerName : match.opponentName)
      ?? '—';

    const winnerLabel = won
      ? `You defeated ${match.opponentName}`
      : tie
        ? `${match.playerName} vs ${match.opponentName}`
        : `${match.opponentName} wins`;

    this.add.text(panelX, yPos, winnerLabel, {
      fontSize: '22px', color: '#aaaaaa',
    }).setOrigin(0.5);
    yPos += 40;

    // ── Reason ─────────────────────────────────────────────────
    if (extra?.reason) {
      const reasonMap: Record<string, string> = {
        'KING_DESTROYED': 'King destroyed',
        'DISCONNECT':     'Opponent disconnected',
        'SURRENDER':      'Surrender',
        'TIMEOUT':        'Timeout',
      };
      const reasonText = reasonMap[extra.reason] ?? extra.reason;
      this.add.text(panelX, yPos, reasonText, {
        fontSize: '16px', color: '#666688',
      }).setOrigin(0.5);
      yPos += 28;
    }

    // ── Turn count ─────────────────────────────────────────────
    if (extra?.turnCount) {
      this.add.text(panelX, yPos, `Turns played: ${extra.turnCount}`, {
        fontSize: '16px', color: '#888899',
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
      fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5);
    yPos += 35;

    // ── Crypto payout info ─────────────────────────────────────
    const isCrypto = GameState.currentMode === GameMode.CryptoPlay
      || (match.stakeAmount != null && match.stakeAmount > 0);

    if (isCrypto) {
      if (won) {
        const payoutAmount = (match.stakeAmount * 2 * 0.95).toFixed(4);
        this.add.text(panelX, yPos, `Payout: ${payoutAmount} AVAX`, {
          fontSize: '20px', color: '#f5a623',
        }).setOrigin(0.5);
        yPos += 30;

        // Tx hash link (clickable)
        const txHash = payoutResult?.txHash;
        if (txHash) {
          const shortHash = txHash.slice(0, 10) + '...' + txHash.slice(-6);
          const txText = this.add.text(panelX, yPos, `TX: ${shortHash}`, {
            fontSize: '14px', color: '#4FC3F7',
          }).setOrigin(0.5).setInteractive({ useHandCursor: true });

          txText.on('pointerover', () => txText.setColor('#ffffff'));
          txText.on('pointerout', () => txText.setColor('#4FC3F7'));
          txText.on('pointerdown', () => {
            window.open(`https://testnet.snowtrace.io/tx/${txHash}`, '_blank');
          });
          yPos += 25;
        } else if (payoutResult && !payoutResult.success) {
          this.add.text(panelX, yPos, `Payout pending...`, {
            fontSize: '14px', color: '#ff6666',
          }).setOrigin(0.5);
          yPos += 25;
        }
      } else if (!tie) {
        this.add.text(panelX, yPos, `You lost ${match.stakeAmount} AVAX`, {
          fontSize: '18px', color: '#ff6666',
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

    // Play Again
    const playAgainBtn = this.add.text(width / 2 - 100, btnY, '[ PLAY AGAIN ]', {
      fontSize: '26px', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerover', () => playAgainBtn.setColor('#ffffff'));
    playAgainBtn.on('pointerout', () => playAgainBtn.setColor('#00ff88'));
    playAgainBtn.on('pointerdown', () => this.goToMenu());

    // Menu
    const menuBtn = this.add.text(width / 2 + 120, btnY, '[ MENU ]', {
      fontSize: '22px', color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#aaaaaa'));
    menuBtn.on('pointerdown', () => this.goToMenu());
  }

  private addAutoReturn(): void {
    this.time.delayedCall(15000, () => {
      if (!this.scene.isActive('ResultScene')) return;
      this.goToMenu();
    });
  }

  private goToMenu(): void {
    // Clear payout data so it doesn't leak into next match
    (GameState as any).payoutResult = undefined;
    (GameState as any).lastMatchExtra = undefined;

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MainMenuScene');
    });
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

  constructor() {
    super('RoomScene');
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  create(): void {
    const { width, height } = this.scale;
    this.isCryptoMode = GameState.currentMode === GameMode.CryptoPlay;

    // Background
   // Background — use loaded image if available, fallback to solid color
    if (this.textures.exists('bg_lobby')) {
      this.add.image(width / 2, height / 2, 'bg_lobby').setDisplaySize(width, height);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);
    }
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Title ────────────────────────────────────────────────
    this.add.text(LAYOUT.title.x, LAYOUT.title.y, 'OnChainBattles', {
      fontSize: '28px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#ffffff',
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
        color: '#555555',
      },
    ).setOrigin(0.5);

    // ── VS icon ──────────────────────────────────────────────
    this.add.text(LAYOUT.vs.x, LAYOUT.vs.y, 'VS', {
      fontSize: '48px',
      fontFamily: '"Courier New", monospace',
      fontStyle: 'bold',
      color: '#253348',
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
      color: '#777777',
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
  onOpponentRollReceived: () => {},
  onCryptoMatchResult: () => {},
  onTieReroll: () => {},
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

    // Show copy/share buttons
    this.copyBtn.text.setVisible(true);
    this.shareBtn.text.setVisible(true);

    if (this.isCryptoMode && GameState.walletAddress) {
      SocketManager.registerWallet(GameState.walletAddress);
    }
  }

  private onRoomJoined(code: string): void {
    this.currentRoomCode = code;
    this.roomCodeText.setText(`ROOM: ${code}`);
    this.statusText.setText('Joined room! Waiting...');

    // Show copy/share for joiners too
    this.copyBtn.text.setVisible(true);
    this.shareBtn.text.setVisible(true);

    if (this.isCryptoMode && GameState.walletAddress) {
      SocketManager.registerWallet(GameState.walletAddress);
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
    this.time.delayedCall(800, () => this.enterBattle());
  }
}
  private onOpponentDisconnected(): void {
    this.statusText.setText('Opponent disconnected.').setColor('#ff4444');
    this.time.delayedCall(3000, () => this.scene.start('MainMenuScene'));
  }

  private onSocketError(msg: string): void {
    this.statusText.setText(`Error: ${msg}`).setColor('#ff4444');
  }

  private onBothCryptoReady(): void {
    this.cryptoPhase = 'both_ready';
    this.statusText.setText('Funds locked! Entering battle...').setColor('#00ff88');
    this.time.delayedCall(1000, () => this.enterBattle());
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
    (GameState as any).depositTxHash = txHash;

    this.cryptoPhase = 'waiting_opponent_deposit';
    this.statusText.setText('Funds locked ✓  Waiting for opponent...').setColor('#4fc3f7');
    this.subStatusText.setText('');
    SocketManager.registerWallet(GameState.walletAddress!);
    SocketManager.signalCryptoReady();
  } catch (err: any) {
    this.statusText.setText(`Deposit failed: ${err.message}`).setColor('#ff4444');
    this.time.delayedCall(4000, () => this.scene.start('MainMenuScene'));
  }
}

  // ─── Scene transition ────────────────────────────────────────

  private enterBattle(): void {
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
      console.log(`[EscrowManager] createMatch confirmed — block: ${receipt.blockNumber}, tx: ${tx.hash}`);

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
      console.log(`[EscrowManager] joinMatch confirmed — block: ${receipt.blockNumber}, tx: ${tx.hash}`);

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

