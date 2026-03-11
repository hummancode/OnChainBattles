// ============================================================
// NetworkCoordinator.ts
// Socket.io relay: replay opponent actions + handle disconnect.
// ============================================================

import type { GameEngine } from '../../game/GameEngine';
import type { GameAction } from '../../network/SocketManager';
import SocketManager from '../../network/SocketManager';
import GameState from '../../GameState';

export interface NetworkCoordinatorDeps {
  engine: GameEngine;
  scene: Phaser.Scene;
  playerName: string;
  opponentName: string;
  localPlayerIndex: number;
}

function getBoardUnit(engine: GameEngine, col: number, row: number) {
  const cell = (engine as any).getState().board.find((c: any) => c.col === col && c.row === row);
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
    case 'END_PLAY_PHASE': engine.endPlayPhase(); break;
    case 'END_ACT_PHASE':  engine.endActPhase(); break;
    default: console.warn('[NetworkCoordinator] Unknown opponent action:', (action as any).type);
  }
}

export function handleOpponentDisconnect(deps: NetworkCoordinatorDeps): void {
  const { engine, scene, playerName, opponentName } = deps;

  GameState.recordWin();
  GameState.setLastMatch({
    playerName, opponentName, playerWon: true, isTie: false,
    reason: 'DISCONNECT',
    turns: (engine as any).getState()?.turn?.turnNumber ?? 0,
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
    onError: (msg) => console.error('[NetworkCoordinator] Socket error:', msg),
    onPayoutResult: () => {},
  });
}
