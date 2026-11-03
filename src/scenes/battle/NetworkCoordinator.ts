// ============================================================
// NetworkCoordinator.ts
// Socket.io relay: replay opponent actions + handle disconnect.
// ============================================================

import type { GameEngine } from '../../game/GameEngine';
import type { GameAction } from '../../network/SocketManager';
import SocketManager from '../../network/SocketManager';
import GameState from '../../GameState';
import { EventBus, EV } from '../../events/EventBus';
import { engineStateHash } from '../../game/utils/stateHash';
import { applyAction } from '../../network/ActionApplier';

export interface NetworkCoordinatorDeps {
  engine: GameEngine;
  scene: Phaser.Scene;
  playerName: string;
  opponentName: string;
  localPlayerIndex: number;
}

/**
 * Highest serverSeq of an action already applied to the local engine.
 * Used after a socket drop to apply only the opponent actions we missed.
 */
let lastAppliedServerSeq = 0;

export function resetNetworkSyncState(serverSeq = 0): void {
  lastAppliedServerSeq = serverSeq;
}

/**
 * Socket reconnected (page NOT refreshed): the local engine is intact but may have missed
 * opponent actions relayed while we were offline. Apply exactly those, in server order.
 * Our own actions are never re-applied — they're already in the local engine.
 */
export function catchUpFromLog(deps: NetworkCoordinatorDeps, log: readonly GameAction[]): number {
  const missed = log.filter(a =>
    a.by !== deps.localPlayerIndex && (a.serverSeq ?? 0) > lastAppliedServerSeq);
  for (const action of missed) replayOpponentAction(deps, action);
  if (missed.length) console.log(`[NetworkCoordinator] Caught up on ${missed.length} missed opponent action(s)`);
  return missed.length;
}

export function replayOpponentAction(deps: NetworkCoordinatorDeps, action: GameAction): void {
  const { engine } = deps;
  if (action.serverSeq != null) {
    if (action.serverSeq <= lastAppliedServerSeq) return; // duplicate delivery
    lastAppliedServerSeq = action.serverSeq;
  }
  console.log('[NetworkCoordinator] Replaying opponent action:', action.type);
  if (!applyAction(engine, action)) {
    console.warn('[NetworkCoordinator] Could not apply opponent action', action);
  }
  // Report our state after this server-stamped action; the server compares it with its engine.
  if (action.serverSeq != null) {
    SocketManager.sendStateHash(engineStateHash(engine), action.serverSeq);
  }
}

/** Overlay objects for the "opponent disconnected" banner — so we can remove them on reconnect. */
let disconnectOverlay: Phaser.GameObjects.GameObject[] = [];
let disconnectCountdownText: Phaser.GameObjects.Text | null = null;

export function handleOpponentDisconnect(deps: NetworkCoordinatorDeps): void {
  const { scene } = deps;

  // Clean up any previous disconnect overlay (prevents stacking on rapid disconnect events)
  for (const obj of disconnectOverlay) obj.destroy();

  // Show a non-blocking "waiting" banner with countdown (opponent may reconnect)
  const bg = scene.add.rectangle(640, 30, 500, 50, 0x000000, 0.85).setDepth(999);
  const txt = scene.add.text(640, 30, 'Opponent disconnected — waiting for reconnect…', {
    fontSize: '16px', color: '#FF6666', align: 'center',
  }).setOrigin(0.5).setDepth(999);
  disconnectOverlay = [bg, txt];
  disconnectCountdownText = txt;
}

export function handleDisconnectCountdown(deps: NetworkCoordinatorDeps, remaining: number): void {
  // After a server restart we may get countdowns without a prior opponentDisconnected.
  if (!disconnectCountdownText) handleOpponentDisconnect(deps);
  if (disconnectCountdownText) {
    disconnectCountdownText.setText(`Opponent disconnected — reconnect: ${remaining}s`);
  }
}

export function handleOpponentReconnect(deps: NetworkCoordinatorDeps): void {
  // Remove the disconnect banner
  for (const obj of disconnectOverlay) obj.destroy();
  disconnectOverlay = [];
  disconnectCountdownText = null;

  // Brief "reconnected" flash
  const { scene } = deps;
  const flash = scene.add.text(640, 30, 'Opponent reconnected!', {
    fontSize: '16px', color: '#00FF88', align: 'center',
  }).setOrigin(0.5).setDepth(999);
  scene.time.delayedCall(2000, () => flash.destroy());
}

/** One result screen per match, whichever signal arrives first. */
let resultShown = false;

/**
 * End the match from a server-side decision (opponent abandoned, turn-timeout forfeit,
 * nobody returned). If our own engine already reached GAME_OVER, GameOverHandler owns the
 * result screen and this is a no-op.
 */
export function showServerResult(
  deps: NetworkCoordinatorDeps,
  r: { winnerIndex: number; reason: string; turns?: number },
): void {
  const { engine, scene, playerName, opponentName, localPlayerIndex } = deps;
  if (resultShown || engine.getState()?.status === 'GAME_OVER') return;
  resultShown = true;

  for (const obj of disconnectOverlay) obj.destroy();
  disconnectOverlay = [];
  disconnectCountdownText = null;

  const isTie = r.winnerIndex === -1;
  const won = !isTie && r.winnerIndex === localPlayerIndex;
  if (!isTie) { if (won) GameState.recordWin(); else GameState.recordLoss(); }
  GameState.setLastMatch({
    playerName, opponentName, playerWon: won, isTie,
    reason: r.reason,
    turns: r.turns ?? engine.getState()?.turn?.turnNumber ?? 0,
    stakeAmount: GameState.currentStake,
    payout: GameState.currentMode === 'CryptoPlay'
      ? (isTie ? GameState.currentStake : won ? GameState.currentStake * 2 * 0.95 : 0) : 0,
  });
  GameState.clearBattleSession();

  const REASONS: Record<string, string> = {
    DISCONNECT: won ? 'Opponent disconnected' : 'You were disconnected too long',
    TIMEOUT:    won ? 'Opponent ran out of time (3 turns)' : 'You ran out of time (3 turns)',
    ABANDONED:  'Both players left',
  };
  const headline = REASONS[r.reason] ?? 'Match ended';
  const sub = isTie ? 'Draw — going to results...' : won ? 'You win! Going to results...' : 'You lose. Going to results...';
  scene.add.rectangle(640, 360, 600, 120, 0x000000, 0.85).setDepth(1002);
  scene.add.text(640, 345, headline, { fontSize: '26px', color: won ? '#00FF88' : '#FF6666', align: 'center' }).setOrigin(0.5).setDepth(1002);
  scene.add.text(640, 380, sub, { fontSize: '18px', color: '#DDDDDD', align: 'center' }).setOrigin(0.5).setDepth(1002);

  scene.time.delayedCall(3000, () => {
    scene.cameras.main.fadeOut(300, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start('ResultScene'));
  });
}

/** Opponent's grace period ran out (server also settles and sends match_settled). */
export function handleFinalDisconnect(deps: NetworkCoordinatorDeps): void {
  showServerResult(deps, { winnerIndex: deps.localPlayerIndex, reason: 'DISCONNECT' });
}

export function setupSocketCallbacks(deps: NetworkCoordinatorDeps): void {
  resultShown = false;
  SocketManager.setCallbacks({
    onRoomCreated: (code) => GameState.setRoomCode(code),
    onRoomJoined: (code) => GameState.setRoomCode(code),
    onOpponentJoined: (name) => GameState.setOpponentName(name),
    onOpponentAction: (action: GameAction) => replayOpponentAction(deps, action),
    onOpponentDisconnected: () => handleOpponentDisconnect(deps),
    onOpponentReconnected: () => handleOpponentReconnect(deps),
    onOpponentAbandon: () => handleFinalDisconnect(deps),
    onDisconnectCountdown: (remaining) => handleDisconnectCountdown(deps, remaining),
    onConnectionLost: () => showConnectionOverlay(deps.scene, true),
    onReconnected: () => showConnectionOverlay(deps.scene, false),
    // OUR connection is gone — that's not the opponent leaving, and certainly not a win.
    onReconnectFailed: () => handleOwnConnectionFailed(deps),
    onResyncRequired: (reason) => requestResync(deps, reason),
    onTurnTimer: (data) => EventBus.emit(EV.TURN_TIMER, data),
    onMatchSettled: (data) => showServerResult(deps, data),
    onRejoinSuccess: (data) => {
      // Live reconnect only — a refreshed page rebuilds its engine in BattleScene before this.
      if (data.battleStarted) catchUpFromLog(deps, data.actionLog);
    },
    onError: (msg) => console.error('[NetworkCoordinator] Socket error:', msg),
    onPayoutResult: () => {},
  });
}

/**
 * All automatic reconnect attempts failed. The match may still be alive on the server
 * (it survives restarts and keeps a grace period), so offer a reload — which runs the
 * normal page-refresh rejoin — instead of declaring a result.
 */
export function handleOwnConnectionFailed(deps: NetworkCoordinatorDeps): void {
  const { scene } = deps;
  showConnectionOverlay(scene, false);
  scene.add.rectangle(640, 360, 620, 140, 0x000000, 0.9).setDepth(1001);
  scene.add.text(640, 335, 'Connection to the server lost', { fontSize: '24px', color: '#FFAA00', align: 'center' })
    .setOrigin(0.5).setDepth(1001);
  scene.add.text(640, 375, '[ RELOAD TO REJOIN ]', { fontSize: '20px', color: '#4fc3f7', align: 'center' })
    .setOrigin(0.5).setDepth(1001).setInteractive({ useHandCursor: true })
    .on('pointerdown', () => window.location.reload());
}

/** Last resync time — guards against a restart loop if the server keeps disagreeing. */
let lastResyncAt = 0;

/**
 * Our engine disagrees with the server's. Rebuild the match from the authoritative log by
 * restarting BattleScene in resync mode (same code path as a page-refresh rejoin).
 */
export function requestResync(deps: NetworkCoordinatorDeps, reason: string): void {
  const now = Date.now();
  if (now - lastResyncAt < 3000) {
    console.warn('[NetworkCoordinator] Resync requested again too soon — ignoring:', reason);
    return;
  }
  lastResyncAt = now;
  console.warn('[NetworkCoordinator] Resyncing with server:', reason);
  GameState.pendingResync = true;
  deps.scene.scene.restart(deps.scene.sys.settings.data); // keep original scene data
}

/** Self-connection overlay: "Connection lost — reconnecting..." */
let connectionOverlay: Phaser.GameObjects.GameObject[] = [];

function showConnectionOverlay(scene: Phaser.Scene, show: boolean): void {
  for (const obj of connectionOverlay) obj.destroy();
  connectionOverlay = [];
  if (!show) return;

  const bg = scene.add.rectangle(640, 360, 500, 80, 0x000000, 0.9).setDepth(1000);
  const txt = scene.add.text(640, 360, 'Connection lost — reconnecting...', {
    fontSize: '20px', color: '#FFAA00', align: 'center',
  }).setOrigin(0.5).setDepth(1000);
  connectionOverlay = [bg, txt];
}
