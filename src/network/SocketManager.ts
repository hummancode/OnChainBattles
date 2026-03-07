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