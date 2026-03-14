// ─── SocketManager.ts ─────────────────────────────────────────
// Handles all Socket.io multiplayer logic
// Equivalent to PhotonManager.cs in Unity

import { io, Socket } from "socket.io-client";
import GameState, { RoomAction } from "../GameState.ts";
export interface GameAction {
  type: 'PLAY_CARD' | 'MOVE_UNIT' | 'ATTACK_UNIT' | 'END_PLAY_PHASE' | 'END_ACT_PHASE' | 'SELECT_POSITION' | 'SELECT_TARGET' | 'CANCEL_PENDING';
  handIndex?: number;
  col?: number;
  row?: number;
  fromCol?: number;
  fromRow?: number;
  targetCol?: number;
  targetRow?: number;
  seqNum?: number;
  serverSeq?: number;
}
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
  onPayoutResult?: (result: { success: boolean; txHash?: string; error?: string }) => void;
  onHostDepositConfirmed?: () => void;
}

class SocketManagerClass {
  private socket: Socket | null = null;
  private callbacks: RoomCallbacks | null = null;
  private serverUrl: string = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";
  private seqCounter: number = 0;
  private actionBuffer: GameAction[] = [];
  private static readonly MAX_BUFFER_SIZE = 50;
  private hasConnectedOnce: boolean = false;

  connect(callbacks: RoomCallbacks): void {
    this.callbacks = callbacks;

    if (this.socket?.connected) {
      console.log("[SocketManager] Already connected.");
      this.actOnRoomAction();
      return;
    }

    console.log("[SocketManager] Connecting to server...");
    this.socket = io(this.serverUrl, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on("connect", () => {
      console.log("[SocketManager] Connected to server.");
      if (!this.hasConnectedOnce) {
        this.hasConnectedOnce = true;
        this.seqCounter = 0;
        this.actOnRoomAction();
      } else {
        // Reconnection — reset sequence, rejoin room, flush buffered actions
        console.log("[SocketManager] Reconnected! Rejoining room...");
        this.seqCounter = 0;
        this.actionBuffer = [];
        this.socket?.emit("rejoin_room" as any, {
          roomCode: GameState.roomCode,
          playerName: GameState.playerName,
        });
        this.callbacks?.onReconnected?.();
      }
    });

    this.socket.on("disconnect", () => {
      console.log("[SocketManager] Disconnected from server.");
      if (this.hasConnectedOnce) {
        this.callbacks?.onConnectionLost?.();
      }
    });

    this.socket.io.on("reconnect_failed", () => {
      console.warn("[SocketManager] All reconnection attempts failed.");
      this.callbacks?.onReconnectFailed?.();
    });

    this.registerEvents();
  }

  private flushActionBuffer(): void {
    if (this.actionBuffer.length === 0) return;
    console.log(`[SocketManager] Flushing ${this.actionBuffer.length} buffered actions`);
    for (const action of this.actionBuffer) {
      this.socket?.emit('game_action', {
        roomCode: GameState.roomCode,
        action,
      });
    }
    this.actionBuffer = [];
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
  registerWallet(walletAddress: string, message: string, signature: string): void {
    console.log(`[SocketManager] Registering wallet: ${walletAddress}`);
    this.socket?.emit("registerWallet", {
      roomCode: GameState.roomCode,
      walletAddress,
      message,
      signature,
    });
  }

  // Signal to server that escrow deposit is confirmed
  signalCryptoReady(): void {
    console.log("[SocketManager] Signaling crypto ready");
    this.socket?.emit("cryptoReady", {
      roomCode: GameState.roomCode,
    });
  }

  // Signal to server that BattleScene is loaded and ready
  signalBattleReady(): void {
    console.log("[SocketManager] Signaling battle ready");
    this.socket?.emit("player_ready", {
      roomCode: GameState.roomCode,
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
    this.socket.on("opponentDisconnected", () => {
      console.log("[SocketManager] Opponent disconnected.");
      this.callbacks?.onOpponentDisconnected();
    });

    this.socket.on("opponentReconnected" as any, () => {
      console.log("[SocketManager] Opponent reconnected!");
      this.callbacks?.onOpponentReconnected?.();
    });

    this.socket.on("opponentAbandon" as any, () => {
      console.log("[SocketManager] Opponent abandon (grace period expired).");
      this.callbacks?.onOpponentAbandon?.();
    });

    this.socket.on("disconnectCountdown" as any, (data: { remaining: number }) => {
      this.callbacks?.onDisconnectCountdown?.(data.remaining);
    });

    this.socket.on("rejoinSuccess" as any, (data: { roomCode: string; playerIndex: number }) => {
      console.log(`[SocketManager] Rejoin success: room=${data.roomCode}, playerIndex=${data.playerIndex}`);
    });

    this.socket.on("error", (data: { message: string }) => {
      console.error(`[SocketManager] Error: ${data.message}`);
      this.callbacks?.onError(data.message);
    });

    // Battle ready handshake
    this.socket.on("both_battle_ready", () => {
      console.log("[SocketManager] Both players battle ready!");
      this.callbacks?.onBothBattleReady?.();
    });

    // Crypto events
    this.socket.on("bothCryptoReady", () => {
      console.log("[SocketManager] Both players crypto ready!");
      this.callbacks?.onBothCryptoReady?.();
    });

this.socket.on('payout_result', (data: { success: boolean; txHash?: string; error?: string }) => {
  console.log('[SocketManager] Payout result:', data);
  GameState.payoutResult = data;
  this.callbacks?.onPayoutResult?.(data);
});
  }
sendGameAction(action: GameAction): void {
  this.seqCounter += 1;
  action.seqNum = this.seqCounter;
  if (!this.socket?.connected) {
    if (this.actionBuffer.length >= SocketManagerClass.MAX_BUFFER_SIZE) {
      console.error(`[SocketManager] Action buffer full (${SocketManagerClass.MAX_BUFFER_SIZE}), dropping action: ${action.type}`);
      return;
    }
    console.warn(`[SocketManager] Buffering game_action (disconnected): ${action.type} (seq=${action.seqNum})`);
    this.actionBuffer.push(action);
    return;
  }
  this.socket.emit('game_action', {
    roomCode: GameState.roomCode,
    action,
  });
  console.log(`[SocketManager] Sent game_action: ${action.type} (seq=${action.seqNum})`);
}
sendStateReport(report: Record<string, any>): void {
  this.socket?.emit('game_state_report' as any, {
    roomCode: GameState.roomCode,
    report,
  });
}

sendStateHash(hash: string, afterGlobalSeq: number): void {
  this.socket?.emit('state_hash' as any, {
    roomCode: GameState.roomCode,
    hash,
    afterGlobalSeq,
  });
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
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /** One-shot listener for both_battle_ready (used by BattleScene). */
  onBothBattleReady(cb: () => void): void {
    this.socket?.once('both_battle_ready', cb);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.hasConnectedOnce = false;
    this.actionBuffer = [];
    this.seqCounter = 0;
    console.log("[SocketManager] Manually disconnected.");
  }
}

const SocketManager = new SocketManagerClass();
export default SocketManager;