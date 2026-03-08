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

# data\MatchState.ts

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

# GameState.ts

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

# index.html

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

# main.ts

```ts
import Phaser from "phaser";
import MainMenuScene from "./scenes/MainMenuScene";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    backgroundColor: "#1A1A2E",
    scene: [MainMenuScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
};

const game = new Phaser.Game(config);
export default game;
```

# network\SocketManager.ts

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

# scenes\MainMenuScene.ts

```ts
import Phaser from 'phaser';
import GameState, { RoomAction } from '../GameState';

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenuScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, 150, 'OnChainBattles', {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 220, 'Chess-like On-Chain Card Game', {
      fontSize: '20px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    const playBtn = this.add.text(width / 2, 380, '[ PLAY FREE ]', {
      fontSize: '28px',
      color: '#00ff88',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playBtn.on('pointerdown', () => {
      GameState.setPlayerName('Player1');
      GameState.setRoomAction(RoomAction.Create);
      this.scene.start('RoomScene');
    });

    playBtn.on('pointerover', () => playBtn.setColor('#ffffff'));
    playBtn.on('pointerout', () => playBtn.setColor('#00ff88'));
  }
}
```

# vite-env.d.ts

```ts
/// <reference types="vite/client" />

```

