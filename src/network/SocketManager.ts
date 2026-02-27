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