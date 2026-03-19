// ============================================================
// SessionManager.ts
// Handles game session events: action relay, crypto flow,
// game-over settlement.
// ============================================================

import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types/NetworkEvents.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { PayoutService } from './PayoutService.js';
import { Logger } from '../utils/Logger.js';
import { GameLogWriter } from './GameLogWriter.js';
import { verifyToken } from '../api/middleware.js';
import { validateDeck } from '../validation/DeckValidator.js';
import { recordMatch } from '../api/matchService.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const log = new Logger('Session');
const IS_DEV = process.env.NODE_ENV !== 'production';

export class SessionManager {
  constructor(
    private io: TypedServer,
    private rooms: RoomManager,
    private payout: PayoutService
  ) {}

  registerHandlers(socket: TypedSocket): void {
    socket.on('player_ready', ({ roomCode }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      room.battleReadyCount += 1;
      log.info(`player_ready: ${room.battleReadyCount}/2 in room ${roomCode}`);
      if (room.battleReadyCount >= 2) {
        this.io.to(roomCode).emit('both_battle_ready');

        // Start server-side game log
        if (!room.gameLog) {
          room.gameLog = new GameLogWriter(
            roomCode,
            room.gameSeed ?? 0,
            room.players.map(p => ({ name: p.name, wallet: p.wallet })),
          );
        }

        for (const queued of room.actionQueue) {
          socket.to(roomCode).emit('opponent_action', queued);
          log.debug(`Flushed queued action: ${queued.type}`);
        }
        room.actionQueue = [];
      }
    });

    socket.on('game_action', ({ roomCode, action }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;

      // ── Layer -1: Game-over guard ─────────────────────
      if (room.settled || room.gameOverClaims.length > 0) {
        log.warn(`REJECTED ${action.type} in ${roomCode} — game over (settled=${room.settled}, claims=${room.gameOverClaims.length})`);
        return;
      }

      if (room.battleReadyCount < 2) {
        room.actionQueue.push(action);
        log.debug(`Queued action (opponent not ready): ${action.type}`);
        return;
      }

      // ── Layer 0: Sequence validation ─────────────────────
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      if (action.seqNum != null) {
        if (action.seqNum <= room.lastSeqNum[playerIndex]) {
          log.warn(`REJECTED ${action.type} from P${playerIndex + 1}: seqNum ${action.seqNum} <= last ${room.lastSeqNum[playerIndex]}`);
          return;
        }
        room.lastSeqNum[playerIndex] = action.seqNum;
      }

      // ── Layer 1: Turn ownership validation ──────────────
      if (playerIndex !== room.currentTurnPlayer) {
        log.warn(`REJECTED ${action.type} from P${playerIndex + 1} — not their turn (P${room.currentTurnPlayer + 1}'s turn)`);
        return;
      }

      // ── Layer 2: Phase-appropriate action validation ────
      const playPhaseActions = ['PLAY_CARD', 'END_PLAY_PHASE', 'SELECT_POSITION', 'SELECT_TARGET', 'CANCEL_PENDING'];
      const actPhaseActions  = ['MOVE_UNIT', 'ATTACK_UNIT', 'END_ACT_PHASE', 'SELECT_POSITION', 'SELECT_TARGET', 'CANCEL_PENDING'];

      if (room.currentPhase === 'PLAY' && !playPhaseActions.includes(action.type)) {
        log.warn(`REJECTED ${action.type} during PLAY phase`);
        return;
      }
      if (room.currentPhase === 'ACT' && !actPhaseActions.includes(action.type)) {
        log.warn(`REJECTED ${action.type} during ACT phase`);
        return;
      }

      // ── Layer 2: Field validation ───────────────────────
      if (action.type === 'PLAY_CARD' && (action.handIndex == null || action.col == null || action.row == null)) {
        log.warn('REJECTED PLAY_CARD: missing fields');
        return;
      }
      if (action.type === 'MOVE_UNIT' && (action.fromCol == null || action.fromRow == null || action.col == null || action.row == null)) {
        log.warn('REJECTED MOVE_UNIT: missing fields');
        return;
      }
      if (action.type === 'ATTACK_UNIT' && (action.fromCol == null || action.fromRow == null || action.targetCol == null || action.targetRow == null)) {
        log.warn('REJECTED ATTACK_UNIT: missing fields');
        return;
      }

      // ── Track phase/turn transitions ────────────────────
      if (action.type === 'END_PLAY_PHASE') {
        room.currentPhase = 'ACT';
      } else if (action.type === 'END_ACT_PHASE') {
        room.currentPhase = 'PLAY';
        room.currentTurnPlayer = room.currentTurnPlayer === 0 ? 1 : 0;
      }

      room.actionCount += 1;
      room.globalSeq += 1;
      action.serverSeq = room.globalSeq;

      // Log action before relay
      room.gameLog?.record(playerIndex, action);

      socket.to(roomCode).emit('opponent_action', action);
      log.debug(`Relayed ${action.type} in ${roomCode} (action #${room.actionCount}, serverSeq=${room.globalSeq})`);
    });

    socket.on('game_over', async ({ roomCode, winnerIndex, totalTurns }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      if (room.settled) return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      if (winnerIndex !== 0 && winnerIndex !== 1) {
        log.warn(`REJECTED game_over: invalid winnerIndex ${winnerIndex}`);
        return;
      }

      const MIN_ACTIONS = 4;
      if (room.actionCount < MIN_ACTIONS) {
        log.warn(`REJECTED game_over: only ${room.actionCount} actions (min ${MIN_ACTIONS})`);
        return;
      }

      if (room.gameOverClaims.some(c => c.playerIndex === playerIndex)) {
        log.warn(`REJECTED duplicate game_over from P${playerIndex + 1}`);
        return;
      }

      room.gameOverClaims.push({ playerIndex, claimedWinner: winnerIndex });
      room.gameLog?.record(playerIndex, { type: 'GAME_OVER', claimedWinner: winnerIndex });
      room.gameLog?.flush();
      log.info(`game_over claim from P${playerIndex + 1}: winner=P${winnerIndex + 1} (${room.gameOverClaims.length}/2 claims)`);

      const hasWallets = room.players.some(p => p.wallet !== null);
      if (!hasWallets) {
        // Free-play: still wait for both claims before recording
        if (room.gameOverClaims.length < 2) {
          log.info(`Free-play game_over claim ${room.gameOverClaims.length}/2 in ${roomCode}`);
          return;
        }
        const fc0 = room.gameOverClaims.find(c => c.playerIndex === 0);
        const fc1 = room.gameOverClaims.find(c => c.playerIndex === 1);
        const agreedWinner = (fc0 && fc1 && fc0.claimedWinner === fc1.claimedWinner)
          ? fc0.claimedWinner : winnerIndex;
        log.info(`Free-play mode game_over in ${roomCode}, winner: P${agreedWinner + 1}`);
        try { recordMatch({ roomCode, room, winnerIndex: agreedWinner, totalTurns: totalTurns ?? 0 }); }
        catch (err: unknown) { log.error('Failed to record match:', err); }
        if (room.status) room.status = 'finished';
        room.settled = true;
        return;
      }

      if (room.gameOverClaims.length < 2) return;

      const claim0 = room.gameOverClaims.find(c => c.playerIndex === 0)!;
      const claim1 = room.gameOverClaims.find(c => c.playerIndex === 1)!;

      room.settled = true;

      if (claim0.claimedWinner === claim1.claimedWinner) {
        // Record match to database
        try { recordMatch({ roomCode, room, winnerIndex: claim0.claimedWinner, totalTurns: totalTurns ?? 0 }); }
        catch (err: unknown) { log.error('Failed to record match:', err); }
        if (room.status) room.status = 'finished';

        const winner = room.players[claim0.claimedWinner];
        if (winner?.wallet) {
          log.info(`Both agree: P${claim0.claimedWinner + 1} (${winner.name}) wins room ${roomCode}`);
          const result = await this.payout.payoutWinner(roomCode, winner.wallet);
          this.io.to(roomCode).emit('payout_result', result);
        }
      } else {
        log.warn(`DISPUTE in ${roomCode}: P1 says P${claim0.claimedWinner + 1}, P2 says P${claim1.claimedWinner + 1}. Refunding.`);
        try {
          const result = await this.payout.refundTie(roomCode);
          this.io.to(roomCode).emit('payout_result', result);
        } catch (err) {
          log.error(`Refund failed for ${roomCode}:`, err);
          this.io.to(roomCode).emit('payout_result', { success: false, error: 'Dispute refund failed' });
        }
      }
    });

    socket.on('state_hash', ({ roomCode, hash, afterGlobalSeq }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      // Cap pending hashes to prevent memory leak if one player stops sending
      if (room.pendingHashes.size > 50) {
        const oldest = room.pendingHashes.keys().next().value;
        if (oldest !== undefined) room.pendingHashes.delete(oldest);
      }

      if (!room.pendingHashes.has(afterGlobalSeq)) {
        room.pendingHashes.set(afterGlobalSeq, []);
      }
      const entries = room.pendingHashes.get(afterGlobalSeq)!;
      entries.push({ playerIndex, hash });

      if (entries.length >= 2) {
        if (entries[0].hash !== entries[1].hash) {
          log.warn(`STATE MISMATCH in ${roomCode} at globalSeq=${afterGlobalSeq}: P1=${entries[0].hash} P2=${entries[1].hash}`);
        } else {
          log.debug(`State sync OK in ${roomCode} at globalSeq=${afterGlobalSeq}: ${entries[0].hash}`);
        }
        room.pendingHashes.delete(afterGlobalSeq);
      }
    });

    // ── Dev-only: rich game state reports for detailed logging ──
    if (IS_DEV) {
      socket.on('game_state_report' as any, ({ roomCode, report }: { roomCode: string; report: Record<string, any> }) => {
        const room = this.rooms.getRoom(roomCode);
        if (!room) return;
        room.gameLog?.recordSnapshot(report);
        log.debug(`State report (${report.trigger}) in ${roomCode}: turn=${report.turn} phase=${report.phase}`);
      });
    }

    socket.on('cryptoReady', ({ roomCode }) => {
      const count = this.rooms.incrementCryptoReady(roomCode);
      if (count === 1) {
        socket.to(roomCode).emit('hostDepositConfirmed');
        log.info(`Told opponent to deposit in room ${roomCode}`);
      } else if (count >= 2) {
        this.io.to(roomCode).emit('bothCryptoReady');
        log.info(`Both players crypto-ready in room ${roomCode}`);
      }
    });

    // ── Auth: register player identity ──
    socket.on('registerPlayer' as any, ({ token }: { token: string }) => {
      const payload = verifyToken(token);
      if (!payload) return;
      const found = this.rooms.findBySocket(socket.id);
      if (found) {
        this.rooms.setPlayerAuth(socket.id, found.roomCode, payload.playerId);
        log.info(`Player #${payload.playerId} identified on ${socket.id}`);
      }
    });

    // ── Deck: validate and store deck for match ──
    socket.on('submitDeck' as any, ({ roomCode, deckIds }: { roomCode: string; deckIds: string[] }) => {
      const result = validateDeck(deckIds, null);
      if (!result.valid) {
        socket.emit('deckRejected', { errors: result.errors });
        return;
      }

      const stored = this.rooms.setPlayerDeck(socket.id, roomCode, deckIds);
      if (!stored) return;

      socket.emit('deckAccepted', { cardCount: deckIds.length });
      log.info(`Deck accepted for socket ${socket.id} in ${roomCode}`);

      if (this.rooms.allDecksReady(roomCode)) {
        this.io.to(roomCode).emit('bothDecksReady');
        log.info(`Both decks ready in ${roomCode}`);
      }
    });
  }

  private static readonly GRACE_PERIOD_MS = 10_000;

  async handleDisconnect(socket: TypedSocket): Promise<void> {
    const found = this.rooms.findBySocket(socket.id);
    if (!found) return;

    const { roomCode, room, playerIndex } = found;
    const disconnected = room.players[playerIndex];
    log.info(`${disconnected.name} disconnected from room: ${roomCode} (grace period: ${SessionManager.GRACE_PERIOD_MS / 1000}s)`);

    // Notify opponent of temporary disconnect with total seconds
    const totalSec = SessionManager.GRACE_PERIOD_MS / 1000;
    socket.to(roomCode).emit('opponentDisconnected');

    // Countdown interval: emit remaining seconds every 1s
    let remaining = totalSec;
    this.io.to(roomCode).emit('disconnectCountdown', { remaining });
    const countdownInterval = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        this.io.to(roomCode).emit('disconnectCountdown', { remaining });
      }
    }, 1000);
    room.disconnectIntervals.set(playerIndex, countdownInterval);

    // Start grace period — if they don't rejoin, finalize disconnect
    const timer = setTimeout(async () => {
      clearInterval(countdownInterval);
      room.disconnectTimers.delete(playerIndex);
      log.info(`Grace period expired for ${disconnected.name} in ${roomCode} — finalizing disconnect`);

      // Flush game log before cleanup
      room.gameLog?.record(playerIndex, { type: 'DISCONNECT_ABANDON' });
      room.gameLog?.flush();

      // Notify remaining player that opponent abandoned
      this.io.to(roomCode).emit('opponentAbandon');

      if (room.cryptoReadyCount >= 2 && !room.settled) {
        room.settled = true;
        const remainingIdx = playerIndex === 0 ? 1 : 0;
        const remaining = room.players[remainingIdx];
        if (remaining?.wallet) {
          log.info(`Disconnect payout to ${remaining.name} (${remaining.wallet})`);
          const result = await this.payout.payoutWinner(roomCode, remaining.wallet);
          this.io.to(roomCode).emit('payout_result', result);
        }
      }

      this.rooms.deleteRoom(roomCode);
    }, SessionManager.GRACE_PERIOD_MS);

    room.disconnectTimers.set(playerIndex, timer);
  }

  handleRejoin(socket: TypedSocket, roomCode: string, playerName: string, guestSessionId?: string): void {
    const room = this.rooms.getRoom(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room expired — cannot rejoin' });
      return;
    }

    const playerIndex = this.rooms.reassignSocket(roomCode, playerName, socket.id, guestSessionId);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in room' });
      return;
    }

    // Reset sequence counter for reconnected player
    room.lastSeqNum[playerIndex] = 0;

    // Cancel the grace period timer and countdown interval
    const timer = room.disconnectTimers.get(playerIndex);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(playerIndex);
      log.info(`Grace timer cancelled for ${playerName} in ${roomCode}`);
    }
    const interval = room.disconnectIntervals.get(playerIndex);
    if (interval) {
      clearInterval(interval);
      room.disconnectIntervals.delete(playerIndex);
    }

    socket.join(roomCode);
    socket.emit('rejoinSuccess', { roomCode, playerIndex, gameSeed: room.gameSeed ?? 0 });
    socket.to(roomCode).emit('opponentReconnected');
    log.info(`${playerName} rejoined room: ${roomCode}`);

    // NOTE: handlers are NOT re-registered here — app.ts already calls
    // registerHandlers() + lobby.registerHandlers() for every new socket
    // on 'connection'. Re-registering would cause duplicate handlers.
  }
}
