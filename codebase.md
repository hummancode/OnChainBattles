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

# code_gen.bat

```bat
@echo off
echo ================================================
echo AI Digest - Codebase Documentation Generator
echo ================================================
echo.

REM Check if Node.js is installed
where node nul 2nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR Node.js is not installed!
    echo Please install Node.js from httpsnodejs.org
    echo.
    pause
    exit b 1
)

REM Check if npx is available
where npx nul 2nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR npx is not available!
    echo Please make sure Node.js is properly installed.
    echo.
    pause
    exit b 1
)

echo Node.js found 
node --version
echo.

echo Running ai-digest to generate codebase.md...
echo.

REM Run ai-digest
npx ai-digest

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================
    echo SUCCESS! codebase.md has been generated.
    echo ================================================
    echo.
    echo You can now find the codebase.md file in your project directory.
    echo.
) else (
    echo.
    echo ================================================
    echo ERROR Failed to generate codebase.md
    echo ================================================
    echo.
    echo Please check the error messages above.
    echo.
)

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

# events.txt

```txt
# Events from Phaser Editor 2D

scene-awake An event emitted at the end of the `editorCreate()` method generated by the Scene Editor compiler.

# Add your events like this:
#
# my-event My event documentation. 
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
        "ethers": "^6.16.0",
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
        "express": "^5.2.1",
        "phaser": "^4.0.0-rc.6",
        "socket.io": "^4.8.3",
        "socket.io-client": "^4.8.3"
    },
    "type": "module"
}

```

# phasereditor2d.config.json

```json
{
    "plugins": [],
    "scripts": [
        "@phaserjs/editor-scripts-base"
    ],
    "skip": [
        "dist"
    ],
    "playUrl": "http://localhost:8080"
}
```

# public\assets\asset-pack.json

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

# public\assets\preload-asset-pack.json

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

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`[Server] Player connected: ${socket.id}`);

  socket.on('createRoom', ({ roomCode, playerName }) => {
    rooms[roomCode] = { players: [{ id: socket.id, name: playerName }] };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode });
    console.log(`[Server] Room created: ${roomCode} by ${playerName}`);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('error', { message: 'Room not found. Check the code.' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'Room is full.' }); return; }

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode });

    const host = room.players[0];
    io.to(host.id).emit('opponentJoined', { playerName });
    socket.emit('opponentJoined', { playerName: host.name });
    console.log(`[Server] ${playerName} joined room: ${roomCode}`);
  });

  socket.on('diceRoll', ({ roomCode, playerName, roll }) => {
    socket.to(roomCode).emit('opponentRoll', { roll, playerName });
    console.log(`[Server] ${playerName} rolled ${roll} in room ${roomCode}`);
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit('opponentDisconnected');
        if (room.players.length === 0) delete rooms[code];
        console.log(`[Server] Player left room: ${code}`);
        break;
      }
    }
  });
});

server.listen(3001, () => {
  console.log('[Server] Socket.io running on port 3001');
});
```

# src\code_gen.bat

```bat
@echo off
echo ================================================
echo AI Digest - Codebase Documentation Generator
echo ================================================
echo.

REM Check if Node.js is installed
where node nul 2nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR Node.js is not installed!
    echo Please install Node.js from httpsnodejs.org
    echo.
    pause
    exit b 1
)

REM Check if npx is available
where npx nul 2nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR npx is not available!
    echo Please make sure Node.js is properly installed.
    echo.
    pause
    exit b 1
)

echo Node.js found 
node --version
echo.

echo Running ai-digest to generate codebase.md...
echo.

REM Run ai-digest
npx ai-digest

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================
    echo SUCCESS! codebase.md has been generated.
    echo ================================================
    echo.
    echo You can now find the codebase.md file in your project directory.
    echo.
) else (
    echo.
    echo ================================================
    echo ERROR Failed to generate codebase.md
    echo ================================================
    echo.
    echo Please check the error messages above.
    echo.
)

pause
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

# src\GameState.ts

```ts
// ─── GameState.ts ─────────────────────────────────────────────
// Global singleton — survives scene changes
// Equivalent to GameManager.cs in Unity

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
    walletAddress: string = "";
    isWalletConnected: boolean = false;

    // ─── Mode ─────────────────────────────────────────────────
    currentMode: GameMode = GameMode.FreePlay;

    // ─── Room ─────────────────────────────────────────────────
    roomCode: string = "";
    roomAction: RoomAction = RoomAction.Create;

    // ─── Match ────────────────────────────────────────────────
    currentStake: number = 1;
    winCount: number = 0;
    lossCount: number = 0;
    lastMatch: MatchResult | null = null;

    // ─── Player ───────────────────────────────────────────────
    setPlayerName(name: string): void {
        this.playerName = name;
        console.log(`[GameState] Player name set: ${name}`);
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
        console.log(`[GameState] Match saved — Player: ${match.playerRoll} | Opponent: ${match.opponentRoll} | Won: ${match.playerWon}`);
    }

    // ─── Debug ────────────────────────────────────────────────
    printStatus(): void {
        console.log(
            `[GameState] Player: ${this.playerName} | ` +
            `Mode: ${this.currentMode} | ` +
            `Wallet: ${this.isWalletConnected ? this.walletAddress : "None"} | ` +
            `Stake: ${this.currentStake} AVAX | ` +
            `W/L: ${this.winCount}/${this.lossCount}`
        );
    }
}

// Export single instance — this is the global singleton
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

# src\main.ts

```ts
import Phaser from "phaser";
import MainMenuScene from "./scenes/MainMenuScene";
import RoomScene from "./scenes/RoomScene";
import ResultScene from "./scenes/ResultScene";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    backgroundColor: "#1A1A2E",
    scene: [MainMenuScene, RoomScene, ResultScene],
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
import GameState, { RoomAction } from "../GameState";

// ─── Event Callbacks ──────────────────────────────────────────
// RoomScene registers these so SocketManager can notify it
export interface RoomCallbacks {
    onRoomCreated: (code: string) => void;
    onRoomJoined: (code: string) => void;
    onOpponentJoined: (opponentName: string) => void;
    onOpponentRollReceived: (roll: number, opponentName: string) => void;
    onOpponentDisconnected: () => void;
    onError: (message: string) => void;
}

class SocketManagerClass {
    private socket: Socket | null = null;
    private callbacks: RoomCallbacks | null = null;

    // ─── Server URL ───────────────────────────────────────────
    // Change this to your Railway.app URL when deployed
    private serverUrl: string = "http://localhost:3001";

    // ─── Connect ──────────────────────────────────────────────
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

    // ─── Act on Room Action ───────────────────────────────────
    private actOnRoomAction(): void {
        if (GameState.roomAction === RoomAction.Create) {
            this.createRoom();
        } else {
            this.joinRoom(GameState.roomCode);
        }
    }

    // ─── Create Room ──────────────────────────────────────────
    private createRoom(): void {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        GameState.setRoomCode(code);
        console.log(`[SocketManager] Creating room: ${code}`);
        this.socket?.emit("createRoom", {
            roomCode: code,
            playerName: GameState.playerName,
        });
    }

    // ─── Join Room ────────────────────────────────────────────
    private joinRoom(code: string): void {
        console.log(`[SocketManager] Joining room: ${code}`);
        this.socket?.emit("joinRoom", {
            roomCode: code,
            playerName: GameState.playerName,
        });
    }

    // ─── Send Dice Roll ───────────────────────────────────────
    sendDiceRoll(roll: number): void {
        console.log(`[SocketManager] Sending roll: ${roll}`);
        this.socket?.emit("diceRoll", {
            roomCode: GameState.roomCode,
            playerName: GameState.playerName,
            roll,
        });
    }

    // ─── Register Server Events ───────────────────────────────
    private registerEvents(): void {
        if (!this.socket) return;

        this.socket.on("roomCreated", (data: { roomCode: string }) => {
            console.log(`[SocketManager] Room created: ${data.roomCode}`);
            this.callbacks?.onRoomCreated(data.roomCode);
        });

        this.socket.on("roomJoined", (data: { roomCode: string }) => {
            console.log(`[SocketManager] Room joined: ${data.roomCode}`);
            this.callbacks?.onRoomJoined(data.roomCode);
        });

        this.socket.on("opponentJoined", (data: { playerName: string }) => {
            console.log(`[SocketManager] Opponent joined: ${data.playerName}`);
            this.callbacks?.onOpponentJoined(data.playerName);
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
    }

    // ─── Disconnect ───────────────────────────────────────────
    disconnect(): void {
        this.socket?.disconnect();
        this.socket = null;
        console.log("[SocketManager] Manually disconnected.");
    }
}

// Singleton
const SocketManager = new SocketManagerClass();
export default SocketManager;
```

# src\scenes\MainMenuScene.ts

```ts
/// <reference lib="dom" />
import Phaser from 'phaser';
import GameState, { RoomAction } from '../GameState.ts';
import WalletManager from '../web3/WalletManager';

export default class MainMenuScene extends Phaser.Scene {
  private nameInput: HTMLInputElement | null = null;
  private roomCodeInput: HTMLInputElement | null = null;

  constructor() {
    super('MainMenuScene');
  }

  create() {
    // Always clean up any leftover inputs first
    this.removeInputs();

    const { width, height } = this.scale;

    this.add.text(width / 2, 100, 'OnChainBattles', {
      fontSize: '48px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 160, 'Chess-like On-Chain Card Game', {
      fontSize: '20px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(width / 2, 240, 'Your Name', {
      fontSize: '18px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.nameInput = this.createInput(width / 2, 275, 'Enter your name...');

    this.add.text(width / 2, 330, 'Room Code  (leave blank to create new room)', {
      fontSize: '18px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.roomCodeInput = this.createInput(width / 2, 365, 'Enter code to join...');

    const playBtn = this.add.text(width / 2, 450, '[ PLAY FREE ]', {
      fontSize: '28px', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playBtn.on('pointerdown', () => this.onPlayClicked());
    playBtn.on('pointerover', () => playBtn.setColor('#ffffff'));
    playBtn.on('pointerout', () => playBtn.setColor('#00ff88'));
    
        // Add this after the PLAY FREE button in create()
    const cryptoBtn = this.add.text(width / 2, 510, '[ PLAY CRYPTO (AVAX) ]', {
      fontSize: '24px', color: '#f5a623',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    cryptoBtn.on('pointerdown', () => this.onCryptoPlayClicked());
    cryptoBtn.on('pointerover', () => cryptoBtn.setColor('#ffffff'));
    cryptoBtn.on('pointerout', () => cryptoBtn.setColor('#f5a623'));
        // Record W/L if returning from a match
    const match = GameState.lastMatch;
    if (match) {
      const resultColor = match.playerWon ? '#00ff88' : '#ff6666';
      const resultMsg = match.playerWon
        ? `Last match: You beat ${match.opponentName}! (${match.playerRoll} vs ${match.opponentRoll})`
        : match.isTie
        ? `Last match: Tie with ${match.opponentName}`
        : `Last match: ${match.opponentName} beat you (${match.playerRoll} vs ${match.opponentRoll})`;

      this.add.text(width / 2, 530, resultMsg, {
        fontSize: '16px', color: resultColor,
      }).setOrigin(0.5);

      this.add.text(width / 2, 560, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
        fontSize: '16px', color: '#aaaaaa',
      }).setOrigin(0.5);
    }

    this.events.on('shutdown', () => this.removeInputs());
    this.events.on('destroy', () => this.removeInputs());
  }

  private createInput(x: number, y: number, placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;

    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.scale.width;
    const scaleY = rect.height / this.scale.height;

    const inputWidth = 300 * scaleX;
    const left = rect.left + (x - 150) * scaleX;
    const top = rect.top + window.scrollY + (y - 20) * scaleY;

    input.style.cssText = `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
      width: ${inputWidth}px;
      padding: 10px;
      font-size: 16px;
      border: 1px solid #444;
      border-radius: 4px;
      background: #2a2a4a;
      color: #ffffff;
      outline: none;
      text-align: center;
      box-sizing: border-box;
      z-index: 10;
    `;

    document.body.appendChild(input);
    return input;
  }

  private onPlayClicked() {
    const name = this.nameInput?.value.trim() ?? '';
    const code = this.roomCodeInput?.value.trim().toUpperCase() ?? '';

    if (!name) {
      const warn = this.add.text(this.scale.width / 2, 510, 'Please enter your name!', {
        fontSize: '18px', color: '#ff4444',
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => warn.destroy());
      return;
    }

    GameState.setPlayerName(name);

    if (!code) {
      GameState.setRoomAction(RoomAction.Create);
    } else {
      GameState.setRoomCode(code);
      GameState.setRoomAction(RoomAction.Join);
    }

    this.removeInputs();
    this.scene.start('RoomScene');
  }

  private removeInputs() {
    this.nameInput?.remove();
    this.nameInput = null;
    this.roomCodeInput?.remove();
    this.roomCodeInput = null;
  }
  private async onCryptoPlayClicked() {
  const name = this.nameInput?.value.trim() ?? '';
  if (!name) {
    const warn = this.add.text(this.scale.width / 2, 580, 'Please enter your name!', {
      fontSize: '18px', color: '#ff4444',
    }).setOrigin(0.5);
    this.time.delayedCall(2000, () => warn.destroy());
    return;
  }

  try {
    const address = await WalletManager.connect();
    GameState.connectWallet(address);
    GameState.setPlayerName(name);

    const code = this.roomCodeInput?.value.trim().toUpperCase() ?? '';
    if (!code) {
      GameState.setRoomAction(RoomAction.Create);
    } else {
      GameState.setRoomCode(code);
      GameState.setRoomAction(RoomAction.Join);
    }

    this.removeInputs();
    this.scene.start('RoomScene');
  } catch (err: any) {
    const warn = this.add.text(this.scale.width / 2, 580, err.message, {
      fontSize: '16px', color: '#ff4444',
    }).setOrigin(0.5);
    this.time.delayedCall(3000, () => warn.destroy());
  }
}
}
```

# src\scenes\ResultScene.ts

```ts
import Phaser from 'phaser';
import GameState from '../GameState';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  create() {
    const { width, height } = this.scale;
    const match = GameState.lastMatch;

    if (!match) {
      this.scene.start('MainMenuScene');
      return;
    }

    // Background panel
    this.add.rectangle(width / 2, height / 2, 600, 420, 0x1a1a3e).setOrigin(0.5);
    this.add.rectangle(width / 2, height / 2, 600, 420, 0x4444aa, 0.3).setOrigin(0.5);

    // Result title
    const resultText = match.isTie ? 'TIE!' : match.playerWon ? 'YOU WIN! 🎉' : 'YOU LOSE';
    const resultColor = match.isTie ? '#ffff00' : match.playerWon ? '#00ff88' : '#ff4444';

    this.add.text(width / 2, height / 2 - 160, resultText, {
      fontSize: '52px', color: resultColor, fontStyle: 'bold',
    }).setOrigin(0.5);

    // Dice breakdown
    this.add.text(width / 2 - 120, height / 2 - 70, GameState.playerName, {
      fontSize: '20px', color: '#00ff88',
    }).setOrigin(0.5);

    this.add.text(width / 2 + 120, height / 2 - 70, match.opponentName, {
      fontSize: '20px', color: '#ff6666',
    }).setOrigin(0.5);

    this.add.text(width / 2 - 120, height / 2, match.playerRoll.toString(), {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, 'vs', {
      fontSize: '24px', color: '#aaaaaa',
    }).setOrigin(0.5);

    this.add.text(width / 2 + 120, height / 2, match.opponentRoll.toString(), {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    // Record
    this.add.text(width / 2, height / 2 + 100, `Record: ${GameState.winCount}W / ${GameState.lossCount}L`, {
      fontSize: '20px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Play Again button
    const playAgainBtn = this.add.text(width / 2 - 130, height / 2 + 160, '[ PLAY AGAIN ]', {
      fontSize: '24px', color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerdown', () => this.scene.start('MainMenuScene'));
    playAgainBtn.on('pointerover', () => playAgainBtn.setColor('#ffffff'));
    playAgainBtn.on('pointerout', () => playAgainBtn.setColor('#00ff88'));

    // Main Menu button
    const menuBtn = this.add.text(width / 2 + 130, height / 2 + 160, '[ MAIN MENU ]', {
      fontSize: '24px', color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerdown', () => this.scene.start('MainMenuScene'));
    menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#aaaaaa'));
  }
}
```

# src\scenes\RoomScene.ts

```ts
import Phaser from 'phaser';
import GameState, { RoomAction } from '../GameState';
import SocketManager from '../network/SocketManager';
import { createMatchState } from '../data/MatchState';

export default class RoomScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private roomCodeText!: Phaser.GameObjects.Text;
  private myRollText!: Phaser.GameObjects.Text;
  private opponentRollText!: Phaser.GameObjects.Text;
  private opponentNameText!: Phaser.GameObjects.Text;
  private rollButton!: Phaser.GameObjects.Text;

  private myRoll: number = 0;
  private opponentRoll: number = 0;
  private opponentName: string = 'Opponent';
  private myRollSent: boolean = false;
  private opponentRollReceived: boolean = false;

  constructor() {
    super('RoomScene');
  }

  create() {
    const { width, height } = this.scale;

    // Title
    this.add.text(width / 2, 60, 'OnChainBattles', {
      fontSize: '32px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Room code
    this.roomCodeText = this.add.text(width / 2, 120, 'Room: ------', {
      fontSize: '22px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Player labels
    this.add.text(width / 4, 220, GameState.playerName, {
      fontSize: '24px', color: '#00ff88',
    }).setOrigin(0.5);

    this.opponentNameText = this.add.text((width / 4) * 3, 220, 'Waiting...', {
      fontSize: '24px', color: '#ff6666',
    }).setOrigin(0.5);

    // Dice displays
    this.myRollText = this.add.text(width / 4, 320, '?', {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    this.opponentRollText = this.add.text((width / 4) * 3, 320, '?', {
      fontSize: '72px', color: '#ffffff',
    }).setOrigin(0.5);

    // Status
    this.statusText = this.add.text(width / 2, 460, 'Connecting...', {
      fontSize: '22px', color: '#ffff00',
    }).setOrigin(0.5);

    // Roll button
    this.rollButton = this.add.text(width / 2, 560, '[ ROLL DICE ]', {
      fontSize: '28px', color: '#555555',
    }).setOrigin(0.5);
    this.rollButton.setInteractive({ useHandCursor: true });
    this.rollButton.disableInteractive();

    this.rollButton.on('pointerdown', () => this.onRollClicked());
    this.rollButton.on('pointerover', () => {
      if (this.myRoll === 0) this.rollButton.setColor('#ffffff');
    });
    this.rollButton.on('pointerout', () => {
      if (this.myRoll === 0) this.rollButton.setColor('#00ff88');
    });

    // Connect to socket server
    SocketManager.connect({
      onRoomCreated: (code) => {
        this.roomCodeText.setText(`Room: ${code}`);
        this.statusText.setText('Waiting for opponent...');
      },
      onRoomJoined: (code) => {
        this.roomCodeText.setText(`Room: ${code}`);
        this.statusText.setText('Joined! Waiting for opponent to ready...');
      },
      onOpponentJoined: (name) => {
        this.opponentName = name;
        this.opponentNameText.setText(name);
        this.statusText.setText('Opponent joined! Roll when ready.');
        this.enableRollButton();
      },
      onOpponentRollReceived: (roll, name) => {
        this.opponentRoll = roll;
        this.opponentName = name;
        this.opponentRollText.setText(roll.toString());
        this.opponentRollReceived = true;
        this.tryResolveMatch();
      },
      onOpponentDisconnected: () => {
        this.statusText.setText('Opponent disconnected.');
        this.rollButton.disableInteractive();
        this.rollButton.setColor('#555555');
      },
      onError: (message) => {
        this.statusText.setText(`Error: ${message}`);
      },
    });
  }

  private enableRollButton() {
    this.rollButton.setInteractive({ useHandCursor: true });
    this.rollButton.setColor('#00ff88');
  }

  private onRollClicked() {
    if (this.myRoll !== 0) return;

    this.myRoll = Phaser.Math.Between(1, 6);
    this.myRollText.setText(this.myRoll.toString());
    this.myRollSent = true;
    this.rollButton.disableInteractive();
    this.rollButton.setColor('#555555');
    this.statusText.setText('Waiting for opponent roll...');

    SocketManager.sendDiceRoll(this.myRoll);
    this.tryResolveMatch();
  }

  private tryResolveMatch() {
    if (!this.myRollSent || !this.opponentRollReceived) return;

    const match = createMatchState(
      GameState.playerName,
      this.opponentName,
      this.myRoll,
      this.opponentRoll,
      GameState.currentStake
    );

    GameState.setLastMatch(match);

    if (match.isTie) {
      this.statusText.setText('Tie! Rolling again...');
      this.time.delayedCall(1500, () => this.resetRolls());
      return;
    }

    if (match.playerWon) {
      GameState.recordWin();
      this.statusText.setText('You Win! 🎉');
    } else {
      GameState.recordLoss();
      this.statusText.setText('You Lose!');
    }

    this.time.delayedCall(2000, () => this.scene.start('ResultScene'));
  }

  private resetRolls() {
    this.myRoll = 0;
    this.opponentRoll = 0;
    this.myRollSent = false;
    this.opponentRollReceived = false;
    this.myRollText.setText('?');
    this.opponentRollText.setText('?');
    this.enableRollButton();
    this.statusText.setText('Roll again!');
  }
}
```

# src\types\ethereum.d.ts

```ts
interface Window {
  ethereum?: any;
}
```

# src\vite-env.d.ts

```ts
/// <reference types="vite/client" />

```

# src\web3\EscrowManager.ts

```ts
import { Contract, parseEther, formatEther, id, zeroPadValue, toBeArray } from "ethers";
import WalletManager from "./WalletManager";

const ESCROW_ADDRESS = "0xa145f82DC5b285B970BE71F48Cf5173E722cF515";

const ESCROW_ABI = [
  "function createMatch(bytes32 matchId) external payable",
  "function joinMatch(bytes32 matchId) external payable",
  "event MatchCreated(bytes32 matchId, address playerA, uint256 stake)",
  "event MatchReady(bytes32 matchId, address playerA, address playerB)",
];

class EscrowManagerClass {
  private getContract(): Contract {
    const signer = WalletManager.getSigner();
    if (!signer) throw new Error("Wallet not connected");
    return new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
  }

  // Generate a matchId from room code
  matchIdFromCode(roomCode: string): string {
    const bytes = zeroPadValue(toBeArray(BigInt("0x" + Buffer.from(roomCode).toString("hex"))), 32);
    return bytes;
  }

  async createMatch(roomCode: string, stakeAvax: number): Promise<void> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(stakeAvax.toString());

    console.log(`[EscrowManager] Creating match: ${roomCode}, stake: ${stakeAvax} AVAX`);
    const tx = await contract.createMatch(matchId, { value });
    await tx.wait();
    console.log(`[EscrowManager] Match created, tx: ${tx.hash}`);
  }

  async joinMatch(roomCode: string, stakeAvax: number): Promise<void> {
    const contract = this.getContract();
    const matchId = this.matchIdFromCode(roomCode);
    const value = parseEther(stakeAvax.toString());

    console.log(`[EscrowManager] Joining match: ${roomCode}, stake: ${stakeAvax} AVAX`);
    const tx = await contract.joinMatch(matchId, { value });
    await tx.wait();
    console.log(`[EscrowManager] Match joined, tx: ${tx.hash}`);
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

