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
