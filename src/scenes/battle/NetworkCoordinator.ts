// ============================================================
// NetworkCoordinator.ts
// Socket.io relay: replay opponent actions + handle disconnect.
// ============================================================

import type { GameEngine } from '../../game/GameEngine';
import type { GameAction } from '../../network/SocketManager';
import SocketManager from '../../network/SocketManager';
import GameState from '../../GameState';
import { boardHashFromCells } from '../../game/utils/boardHash';

export interface NetworkCoordinatorDeps {
  engine: GameEngine;
  scene: Phaser.Scene;
  playerName: string;
  opponentName: string;
  localPlayerIndex: number;
}

function getBoardUnit(engine: GameEngine, col: number, row: number) {
  const cell = engine.getState().board.find((c) => c.col === col && c.row === row);
  return cell?.unit ?? null;
}

export function replayOpponentAction(deps: NetworkCoordinatorDeps, action: GameAction): void {
  const { engine } = deps;
  console.log('[NetworkCoordinator] Replaying opponent action:', action.type);
  switch (action.type) {
    case 'PLAY_CARD':
      engine.playCard(action.handIndex!, action.col, action.row); break;
    case 'MOVE_UNIT': {
      const unit = getBoardUnit(engine, action.fromCol!, action.fromRow!);
      if (unit) engine.moveUnit(unit.instanceId, action.col!, action.row!);
      else console.warn('[NetworkCoordinator] MOVE_UNIT replay: no unit at', action.fromCol, action.fromRow);
      break;
    }
    case 'ATTACK_UNIT': {
      const attacker = getBoardUnit(engine, action.fromCol!, action.fromRow!);
      const target   = getBoardUnit(engine, action.targetCol!, action.targetRow!);
      if (attacker && target) engine.attackUnit(attacker.instanceId, target.instanceId);
      else console.warn('[NetworkCoordinator] ATTACK_UNIT replay: unit not found');
      break;
    }
    case 'SELECT_POSITION':
      engine.selectPosition(action.col!, action.row!); break;
    case 'SELECT_TARGET': {
      const tgt = getBoardUnit(engine, action.col!, action.row!);
      if (tgt) engine.selectTarget(tgt.instanceId);
      else console.warn('[NetworkCoordinator] SELECT_TARGET replay: no unit at', action.col, action.row);
      break;
    }
    case 'CANCEL_PENDING':
      engine.cancelPending(); break;
    case 'END_PLAY_PHASE':
      engine.endPlayPhase();
      SocketManager.sendStateHash(boardHashFromCells(engine.getState().board), engine.getState().turn?.turnNumber ?? 0);
      break;
    case 'END_ACT_PHASE':
      engine.endActPhase();
      SocketManager.sendStateHash(boardHashFromCells(engine.getState().board), engine.getState().turn?.turnNumber ?? 0);
      break;
    default: console.warn('[NetworkCoordinator] Unknown opponent action:', (action as any).type);
  }
}

/** Overlay objects for the "opponent disconnected" banner — so we can remove them on reconnect. */
let disconnectOverlay: Phaser.GameObjects.GameObject[] = [];

export function handleOpponentDisconnect(deps: NetworkCoordinatorDeps): void {
  const { scene } = deps;

  // Show a non-blocking "waiting" banner (opponent may reconnect)
  const bg = scene.add.rectangle(640, 30, 500, 50, 0x000000, 0.85).setDepth(999);
  const txt = scene.add.text(640, 30, 'Opponent disconnected — waiting for reconnect...', {
    fontSize: '16px', color: '#FF6666', align: 'center',
  }).setOrigin(0.5).setDepth(999);
  disconnectOverlay = [bg, txt];
}

export function handleOpponentReconnect(deps: NetworkCoordinatorDeps): void {
  // Remove the disconnect banner
  for (const obj of disconnectOverlay) obj.destroy();
  disconnectOverlay = [];

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

  GameState.recordWin();
  GameState.setLastMatch({
    playerName, opponentName, playerWon: true, isTie: false,
    reason: 'DISCONNECT',
    turns: engine.getState()?.turn?.turnNumber ?? 0,
    stakeAmount: GameState.currentStake,
    payout: GameState.currentMode === 'CryptoPlay' ? GameState.currentStake * 2 * 0.95 : 0,
  });

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
    onConnectionLost: () => showConnectionOverlay(deps.scene, true),
    onReconnected: () => showConnectionOverlay(deps.scene, false),
    onReconnectFailed: () => handleFinalDisconnect(deps),
    onError: (msg) => console.error('[NetworkCoordinator] Socket error:', msg),
    onPayoutResult: () => {},
  });
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
