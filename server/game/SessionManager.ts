// ============================================================
// SessionManager.ts
// Handles game session events: action relay, crypto flow,
// game-over settlement.
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { PayoutService } from './PayoutService.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class SessionManager {
  constructor(
    private io: TypedServer,
    private rooms: RoomManager,
    private payout: PayoutService
  ) {}

  registerHandlers(socket: TypedSocket): void {
    socket.on('game_action', ({ roomCode, action }) => {
      socket.to(roomCode).emit('opponent_action', action);
      console.log(`[Session] game_action relayed in ${roomCode}: ${action.type}`);
    });

    socket.on('game_over', async ({ roomCode, winnerIndex }) => {
      if (!this.rooms.markSettled(roomCode)) return; // prevent double-settle

      const room = this.rooms.getRoom(roomCode);
      if (!room) return;

      const winner = room.players[winnerIndex];
      if (!winner?.wallet) {
        console.log(`[Session] game_over in ${roomCode} but winner has no wallet (free mode)`);
        return;
      }

      console.log(`[Session] game_over: ${winner.name} wins room ${roomCode}`);
      const result = await this.payout.payoutWinner(roomCode, winner.wallet);
      this.io.to(roomCode).emit('payout_result', result);
    });

    socket.on('cryptoReady', ({ roomCode }) => {
      const count = this.rooms.incrementCryptoReady(roomCode);
      if (count === 1) {
        socket.to(roomCode).emit('hostDepositConfirmed');
        console.log(`[Session] Told opponent to deposit in room ${roomCode}`);
      } else if (count >= 2) {
        this.io.to(roomCode).emit('bothCryptoReady');
        console.log(`[Session] Both players crypto-ready in room ${roomCode}`);
      }
    });
  }

  /** Handle disconnect: notify opponent, payout if crypto match. */
  async handleDisconnect(socket: TypedSocket): Promise<void> {
    const found = this.rooms.findBySocket(socket.id);
    if (!found) return;

    const { roomCode, room, playerIndex } = found;
    const disconnected = room.players[playerIndex];
    console.log(`[Session] ${disconnected.name} left room: ${roomCode}`);

    socket.to(roomCode).emit('opponentDisconnected');

    // If both deposited and not yet settled, pay remaining player
    if (room.cryptoReadyCount >= 2 && !room.settled) {
      room.settled = true;
      const remainingIdx = playerIndex === 0 ? 1 : 0;
      const remaining = room.players[remainingIdx];
      if (remaining?.wallet) {
        console.log(`[Session] Disconnect payout to ${remaining.name} (${remaining.wallet})`);
        const result = await this.payout.payoutWinner(roomCode, remaining.wallet);
        this.io.to(roomCode).emit('payout_result', result);
      }
    }

    this.rooms.deleteRoom(roomCode);
  }
}
