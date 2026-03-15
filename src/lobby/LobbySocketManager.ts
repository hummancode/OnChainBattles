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
