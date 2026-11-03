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
import { UNITS_ONLY_DECK_IDS } from '../../src/game/data/DeckDefinitions.js';
import type { Room, GameAction } from '../../shared/types/NetworkEvents.js';
import { MatchSimulation } from './MatchSimulation.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const log = new Logger('Session');
const IS_DEV = process.env.NODE_ENV !== 'production';

export class SessionManager {
  /** Extension points (persistence, turn timer) — set by app.ts / tests. */
  hooks: {
    onActionCommitted?: (roomCode: string, room: Room) => void;
    onSettled?: (roomCode: string, room: Room, result: { winnerIndex: number; reason: string; turns: number }) => void;
  } = {};

  constructor(
    private io: TypedServer,
    private rooms: RoomManager,
    private payout: PayoutService
  ) {}

  registerHandlers(socket: TypedSocket): void {
    socket.on('player_ready', ({ roomCode }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      const readyIdx = room.players.findIndex(p => p.id === socket.id);
      if (readyIdx === -1) return;
      room.readyPlayers ??= new Set();
      if (room.readyPlayers.has(readyIdx)) {
        log.debug(`Duplicate player_ready from P${readyIdx + 1} in ${roomCode} — ignored`);
        return;
      }
      room.readyPlayers.add(readyIdx);
      room.battleReadyCount = room.readyPlayers.size;
      log.info(`player_ready: ${room.battleReadyCount}/2 in room ${roomCode}`);
      if (room.battleReadyCount === 2) {
        // Both clients build their engine from THESE decks — never their own local copy —
        // so the two simulations are identical (and a rejoining client can rebuild it).
        const decks = SessionManager.battleDecks(room);
        room.simulation = new MatchSimulation(room.gameSeed ?? 0, decks);
        this.io.to(roomCode).emit('both_battle_ready', { decks });

        // Start server-side game log
        if (!room.gameLog) {
          room.gameLog = new GameLogWriter(
            roomCode,
            room.gameSeed ?? 0,
            room.players.map(p => ({ name: p.name, wallet: p.wallet })),
          );
        }

        const queued = room.actionQueue;
        room.actionQueue = [];
        for (const q of queued) {
          const r = this.commitAction(roomCode, room, q, q.by ?? -1);
          if (!r.ok) log.warn(`Dropped queued ${q.type}: ${r.reason}`);
        }
      }
    });

    socket.on('game_action', ({ roomCode, action }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      if (room.settled) {
        log.warn(`REJECTED ${action.type} in ${roomCode} — match settled`);
        return;
      }

      if (room.battleReadyCount < 2) {
        // Legacy: queued until both are ready, validated by the simulation at flush time.
        action.by = playerIndex;
        room.actionQueue.push(action);
        log.debug(`Queued action (opponent not ready): ${action.type}`);
        return;
      }

      // ── Sequence (replay protection) ───────────────────
      if (action.seqNum != null) {
        if (action.seqNum <= room.lastSeqNum[playerIndex]) {
          log.warn(`REJECTED ${action.type} from P${playerIndex + 1}: seqNum ${action.seqNum} <= last ${room.lastSeqNum[playerIndex]}`);
          return;
        }
        room.lastSeqNum[playerIndex] = action.seqNum;
      }

      const postHash = action.postHash;
      delete action.postHash;

      // ── Authoritative validation: apply to the server's own engine ──
      const res = this.commitAction(roomCode, room, action, playerIndex, socket);
      if (!res.ok) {
        log.warn(`REJECTED ${action.type} from P${playerIndex + 1} in ${roomCode}: ${res.reason}`);
        // The client already applied it locally → its engine is now ahead of the truth.
        socket.emit('resync_required', { reason: `Action rejected: ${res.reason}` });
        return;
      }

      // ── Desync detection: client's state after the action vs ours ──
      if (postHash && res.hash && postHash !== res.hash) {
        log.warn(`STATE MISMATCH in ${roomCode} after serverSeq=${action.serverSeq} (P${playerIndex + 1}): client=${postHash} server=${res.hash}`);
        socket.emit('resync_required', { reason: 'State mismatch' });
      }
    });

    socket.on('game_over', async ({ roomCode, winnerIndex, totalTurns }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      if (room.settled) return;

      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;

      // Server-authoritative rooms: the result comes from the server's engine (settled in
      // commitAction). Client claims are informational only — they can't decide a payout.
      if (this.sim(room)) {
        log.info(`game_over claim from P${playerIndex + 1} in ${roomCode} (winner=${winnerIndex}) — ignored, engine decides`);
        return;
      }

      // -1 = draw (both Kings destroyed in the same exchange)
      if (winnerIndex !== 0 && winnerIndex !== 1 && winnerIndex !== -1) {
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
      log.info(`Legacy game_over claim from P${playerIndex + 1}: ${winnerIndex} (${room.gameOverClaims.length}/2)`);
      if (room.gameOverClaims.length < 2) return;

      const c0 = room.gameOverClaims.find(c => c.playerIndex === 0)!;
      const c1 = room.gameOverClaims.find(c => c.playerIndex === 1)!;
      if (c0.claimedWinner === c1.claimedWinner) {
        await this.settle(roomCode, room, { winnerIndex: c0.claimedWinner, reason: 'CLAIMED', turns: totalTurns ?? 0 });
      } else {
        log.warn(`DISPUTE in ${roomCode}: P1 says ${c0.claimedWinner}, P2 says ${c1.claimedWinner}. Refunding.`);
        await this.settle(roomCode, room, { winnerIndex: -1, reason: 'DISPUTE', turns: totalTurns ?? 0 });
      }
    });

    socket.on('state_hash', ({ roomCode, hash, afterGlobalSeq }) => {
      const room = this.rooms.getRoom(roomCode);
      if (!room) return;
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) return;
      const sim = this.sim(room);
      if (!sim) return;

      // afterGlobalSeq = serverSeq of the opponent action the client just replayed.
      const expected = sim.hashAt(afterGlobalSeq);
      if (expected === undefined) return; // too old / unknown — nothing to compare
      if (expected !== hash) {
        log.warn(`STATE MISMATCH in ${roomCode} at serverSeq=${afterGlobalSeq} (P${playerIndex + 1}): client=${hash} server=${expected}`);
        socket.emit('resync_required', { reason: 'State mismatch' });
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

  private sim(room: Room): MatchSimulation | null {
    return (room.simulation as MatchSimulation | undefined) ?? null;
  }

  /**
   * The single path by which an action becomes part of the match: validate on the server
   * engine, stamp, log, relay, then settle if it ended the game. Used for player actions
   * and for server-generated ones (turn timeout).
   * @param from  sender socket (relay excludes it) — omit to broadcast to the whole room.
   */
  commitAction(
    roomCode: string, room: Room, action: GameAction, byPlayer: number, from?: TypedSocket,
  ): { ok: true; hash: string | null } | { ok: false; reason: string } {
    const sim = this.sim(room);
    if (sim) {
      const r = sim.apply(action, byPlayer);
      if (!r.ok) return r;
    }

    room.actionCount += 1;
    room.globalSeq += 1;
    action.serverSeq = room.globalSeq;
    action.by = byPlayer;
    room.actionLog.push({ ...action });
    room.gameLog?.record(byPlayer, action);
    const hash = sim ? sim.recordHash(room.globalSeq) : null;

    if (sim) {
      room.currentTurnPlayer = sim.activePlayer;
      room.currentPhase = sim.phase === 'ACT' ? 'ACT' : 'PLAY';
    }

    if (from) from.to(roomCode).emit('opponent_action', action);
    else this.io.to(roomCode).emit('opponent_action', action);
    log.debug(`Committed ${action.type} by P${byPlayer + 1} in ${roomCode} (serverSeq=${room.globalSeq})`);

    this.hooks.onActionCommitted?.(roomCode, room);

    if (sim?.result && !room.settled) {
      void this.settle(roomCode, room, sim.result);
    }
    return { ok: true, hash };
  }

  /** Record the result, pay out / refund, and tell both clients. Idempotent. */
  async settle(roomCode: string, room: Room, result: { winnerIndex: number; reason: string; turns: number }): Promise<void> {
    if (room.settled) return;
    room.settled = true;
    if (room.status) room.status = 'finished';
    const { winnerIndex } = result;
    log.info(`SETTLED ${roomCode}: ${winnerIndex === -1 ? 'DRAW' : `P${winnerIndex + 1} wins`} (${result.reason}, ${result.turns} turns)`);

    room.gameLog?.record(winnerIndex, { type: 'SETTLED', winnerIndex, reason: result.reason });
    room.gameLog?.flush();
    try { recordMatch({ roomCode, room, winnerIndex, totalTurns: result.turns }); }
    catch (err: unknown) { log.error('Failed to record match:', err); }
    this.hooks.onSettled?.(roomCode, room, result);
    this.io.to(roomCode).emit('match_settled', { winnerIndex, reason: result.reason, turns: result.turns });

    const hasWallets = room.players.some(p => p.wallet !== null);
    if (!hasWallets) return;
    try {
      const payout = winnerIndex === -1
        ? await this.payout.refundTie(roomCode)
        : room.players[winnerIndex]?.wallet
          ? await this.payout.payoutWinner(roomCode, room.players[winnerIndex].wallet!)
          : { success: false, error: 'Winner has no wallet' };
      this.io.to(roomCode).emit('payout_result', payout);
    } catch (err) {
      log.error(`Payout failed for ${roomCode}:`, err);
      this.io.to(roomCode).emit('payout_result', { success: false, error: 'Payout failed' });
    }
  }

  /** 30s: long enough for a full page reload (asset preload + login redirect + rejoin). */
  static readonly GRACE_PERIOD_MS = 30_000;

  /** Decks used for the battle, filling in the default for anyone who didn't submit one. */
  static battleDecks(room: Room): [string[], string[]] {
    for (const p of room.players) {
      if (!p.deckIds) p.deckIds = [...UNITS_ONLY_DECK_IDS];
    }
    return [room.players[0]?.deckIds ?? [...UNITS_ONLY_DECK_IDS], room.players[1]?.deckIds ?? [...UNITS_ONLY_DECK_IDS]];
  }

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

    // NOTE: lastSeqNum is intentionally NOT reset. The client resumes from the value we
    // send back, so actions it buffered while offline (seq > lastSeqNum) are still accepted
    // and anything the server already has (seq <= lastSeqNum) is deduplicated.

    // Cancel the grace period timer and countdown interval
    const timer = room.disconnectTimers.get(playerIndex);
    const wasDisconnected = !!timer;
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
    const battleStarted = room.battleReadyCount >= 2;
    socket.emit('rejoinSuccess', {
      roomCode,
      playerIndex,
      gameSeed: room.gameSeed ?? 0,
      decks: battleStarted ? (this.sim(room)?.decks ?? SessionManager.battleDecks(room)) : null,
      actionLog: room.actionLog.map(a => ({ ...a })),
      lastSeqNum: room.lastSeqNum[playerIndex],
      battleStarted,
    });
    // A resync on a live socket is not a reconnect — don't flash "Opponent reconnected!"
    if (wasDisconnected) socket.to(roomCode).emit('opponentReconnected');
    log.info(`${playerName} rejoined room: ${roomCode}`);

    // NOTE: handlers are NOT re-registered here — app.ts already calls
    // registerHandlers() + lobby.registerHandlers() for every new socket
    // on 'connection'. Re-registering would cause duplicate handlers.
  }
}
