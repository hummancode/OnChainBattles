// ============================================================
// NetworkCoordinator.ts
// Socket.io relay: replay opponent actions + handle disconnect.
// ============================================================

import type { GameEngine } from '../../game/GameEngine';
import type { GameAction } from '../../network/SocketManager';
import SocketManager from '../../network/SocketManager';
import GameState from '../../GameState';
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

export function handleDisconnectCountdown(_deps: NetworkCoordinatorDeps, remaining: number): void {
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

export function handleFinalDisconnect(deps: NetworkCoordinatorDeps): void {
  const { engine, scene, playerName, opponentName } = deps;

  // Clean up any lingering banner
  for (const obj of disconnectOverlay) obj.destroy();
  disconnectOverlay = [];
  disconnectCountdownText = null;

  GameState.recordWin();
  GameState.setLastMatch({
    playerName, opponentName, playerWon: true, isTie: false,
    reason: 'DISCONNECT',
    turns: engine.getState()?.turn?.turnNumber ?? 0,
    stakeAmount: GameState.currentStake,
    payout: GameState.currentMode === 'CryptoPlay' ? GameState.currentStake * 2 * 0.95 : 0,
  });

  GameState.clearBattleSession();

  scene.add.rectangle(640, 360, 600, 120, 0x000000, 0.85);
  scene.add.text(640, 345, 'Opponent disconnected', { fontSize: '26px', color: '#FF6666', align: 'center' }).setOrigin(0.5);
  scene.add.text(640, 380, 'You win! Going to results...', { fontSize: '18px', color: '#00FF88', align: 'center' }).setOrigin(0.5);

  scene.time.delayedCall(3000, () => {
    scene.cameras.main.fadeOut(300, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start('ResultScene'));
  });
}

export function setupSocketCallbacks(deps: NetworkCoordinatorDeps): void {
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
    onReconnectFailed: () => handleFinalDisconnect(deps),
    onResyncRequired: (reason) => requestResync(deps, reason),
    onRejoinSuccess: (data) => {
      // Live reconnect only — a refreshed page rebuilds its engine in BattleScene before this.
      if (data.battleStarted) catchUpFromLog(deps, data.actionLog);
    },
    onError: (msg) => console.error('[NetworkCoordinator] Socket error:', msg),
    onPayoutResult: () => {},
  });
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
