// ============================================================
// GameOverHandler.ts
// Handles GAME_OVER event: records result + transitions scene.
// ============================================================

import { EventBus, EV } from '../../events/EventBus';
import type { GameEngine } from '../../game/GameEngine';
import GameState from '../../GameState';
import SocketManager from '../../network/SocketManager';

export function setupGameOverHandler(
  scene: Phaser.Scene,
  engine: GameEngine,
  localPlayerIndex: number,
  playerName: string,
  opponentName: string,
  _isCryptoMode: boolean,
  /** offline = practice / tutorial vs the bot: show the result, but don't count it or tell the server. */
  opts: { offline?: boolean } = {},
): () => void {
  const unsub = EventBus.on(EV.GAME_OVER, (ev: any) => {
    if (!scene.scene.isActive('BattleScene')) return;

    const result = ev.result ?? ev;
    const turnCount = result?.turns ?? engine.getState().turn?.turnNumber ?? 0;
    const reason = result?.reason ?? 'KING_DESTROYED';
    const isTie = result?.isDraw === true || result?.winner === null;
    const playerWon = !isTie && (result?.winner ?? ev.winner) === localPlayerIndex;

    if (isTie || opts.offline) { /* draws and practice games don't change the W/L record */ }
    else if (playerWon) GameState.recordWin(); else GameState.recordLoss();

    GameState.setLastMatch({
      playerName, opponentName, playerWon, isTie,
      reason, turns: turnCount,
      stakeAmount: GameState.currentStake,
      // Draw: escrow refunds each player's stake (refundTie)
      payout: opts.offline ? 0 : isTie ? GameState.currentStake : playerWon ? GameState.currentStake * 2 * 0.95 : 0,
      practice: !!opts.offline,
    });

    if (opts.offline) { /* no server involved */ }
    else if (isTie) SocketManager.sendGameDraw(turnCount);
    else SocketManager.sendGameOver(localPlayerIndex, playerWon, turnCount);
    GameState.clearBattleSession();

    scene.time.delayedCall(1500, () => {
      scene.cameras.main.fadeOut(300, 0, 0, 0);
      scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start('ResultScene'));
    });
  });
  return unsub;
}
