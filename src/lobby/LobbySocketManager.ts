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
import { AuthManager } from '../auth/AuthManager';
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

  /** Our own listeners, so detach() never removes another manager's (scenes overlap on transitions). */
  private bound: Array<[string, (...args: any[]) => void]> = [];
  private boundSocket: Socket | null = null;

  /** Start listening for lobby events on the shared socket. */
  attach(): void {
    if (this.attached) return;
    const s = this.getSocket();
    if (!s) return;
    this.attached = true;
    this.boundSocket = s;
    const on = (ev: string, fn: (d: any) => void) => { s.on(ev, fn); this.bound.push([ev, fn]); };

    on('lobby:created',            (d) => this.handlers.onCreated?.(d.code));
    on('lobby:joined',             (d) => this.handlers.onJoined?.(d.code));
    on('lobby:state',              (d) => this.handlers.onStateUpdate?.(d));
    on('lobby:room_list',          (d) => this.handlers.onRoomList?.(d.rooms));
    on('lobby:chat_message',       (d) => this.handlers.onChatMessage?.(d));
    on('lobby:system_message',     (d) => this.handlers.onSystemMessage?.(d.text));
    on('lobby:kicked',             (d) => this.handlers.onKicked?.(d.reason));
    on('lobby:game_starting',      (d) => this.handlers.onGameStarting?.(d));
    on('lobby:error',              (d) => this.handlers.onError?.(d.message));
    on('lobby:deposit_phase',      (d) => this.handlers.onDepositPhase?.(d.stakeAmount));
    on('lobby:opponent_deposited', ()  => this.handlers.onOpponentDeposited?.());
    on('lobby:both_deposited',     ()  => this.handlers.onBothDeposited?.());
    on('lobby:submit_decks',       ()  => this.handlers.onSubmitDecks?.());
    on('lobby:password_required',  (d) => this.handlers.onPasswordRequired?.(d.roomCode));
  }

  /** Stop listening. Call on scene shutdown. Removes only this manager's listeners. */
  detach(): void {
    if (!this.attached) return;
    for (const [ev, fn] of this.bound) this.boundSocket?.off(ev, fn);
    this.bound = [];
    this.boundSocket = null;
    this.attached = false;
  }

  // ─── Outgoing Events ──────────────────────────────────────

  createRoom(playerName: string, settings?: Partial<RoomSettings>): void {
    const guestSessionId = AuthManager.getGuestSessionId() ?? undefined;
    this.getSocket()?.emit('lobby:create', { playerName, settings, guestSessionId });
  }

  joinRoom(roomCode: string, playerName: string, password?: string): void {
    const guestSessionId = AuthManager.getGuestSessionId() ?? undefined;
    this.getSocket()?.emit('lobby:join', { roomCode, playerName, password, guestSessionId });
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
