// ============================================================
// BattleScene.ts — Thin shell coordinator
//
// Owns Phaser lifecycle (create/shutdown). Delegates to:
//   - EngineEventBridge:      engine → EventBus wiring
//   - NetworkCoordinator:     socket relay + disconnect
//   - HUDRefreshCoordinator:  HUD sync via events
//   - InputCoordinator:       SelectionManager setup
//   - GameOverHandler:        GAME_OVER → ResultScene
// ============================================================

import Phaser from 'phaser';
import { GameEngine } from '../game/GameEngine';
import { LayoutLoader } from '../config/LayoutLoader';
import { ThemeLoader } from '../config/ThemeLoader';
import { BoardRenderer } from '../renderers/BoardRenderer';
import { HandRenderer } from '../renderers/HandRenderer';
import { HUDRenderer } from '../renderers/HUDRenderer';
import { OverlayRenderer } from '../renderers/OverlayRenderer';
import { SelectionManager } from '../input/SelectionManager';
import { EventBus, EV } from '../events/EventBus';
import GameState from '../GameState';
import SocketManager from '../network/SocketManager';

import { wireEngineToEventBus } from './battle/EngineEventBridge';
import { setupSocketCallbacks } from './battle/NetworkCoordinator';
import { setupHUDRefresh } from './battle/HUDRefreshCoordinator';
import { createSelectionManager } from './battle/InputCoordinator';
import { setupGameOverHandler } from './battle/GameOverHandler';
import { boardHashFromCells } from '../game/utils/boardHash';

interface BattleSceneData {
  playerName: string;
  opponentName: string;
  isCryptoMode: boolean;
  roomCode: string;
}

export default class BattleScene extends Phaser.Scene {
  private engine!: GameEngine;
  private boardRenderer!: BoardRenderer;
  private handRenderer!: HandRenderer;
  private hudRenderer!: HUDRenderer;
  private overlayRenderer!: OverlayRenderer;
  private selectionManager!: SelectionManager;
  private sceneData!: BattleSceneData;
  private hudUnsubs: Array<() => void> = [];
  private bridgeUnsub?: () => void;
  private gameOverUnsub?: () => void;

  constructor() { super('BattleScene'); }
  init(data: BattleSceneData) { this.sceneData = data; }

  async create() {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    const loadingText = this.add.text(640, 360, 'Loading battle...', { fontSize: '24px', color: '#aaaaaa' }).setOrigin(0.5);

    await LayoutLoader.load('BattleScene');
    await ThemeLoader.load('BattleScene');
    const layout = LayoutLoader.getBattle()!;
    const theme  = ThemeLoader.get('BattleScene');
    loadingText.destroy();

    if (this.textures.exists('bg_battle')) {
      this.add.image(640, 360, 'bg_battle').setDisplaySize(1280, 720);
    } else {
      this.add.rectangle(640, 360, 1280, 720, 0x1a1a2e);
    }

    const playerName   = this.sceneData?.playerName   ?? GameState.playerName   ?? 'You';
    const opponentName = this.sceneData?.opponentName  ?? GameState.opponentName ?? 'Opponent';
    const localPlayerIndex = GameState.playerIndex ?? 0;

    // ─── Engine + event bridge ────────────────────
    this.engine = new GameEngine();
    this.bridgeUnsub = wireEngineToEventBus(this.engine, localPlayerIndex);

    // ─── HUD refresh ─────────────────────────────
    this.hudUnsubs = setupHUDRefresh(this.engine, localPlayerIndex, playerName, opponentName);

    // ─── Renderers ───────────────────────────────
    this.boardRenderer   = new BoardRenderer(this, layout, theme, localPlayerIndex);
    this.handRenderer    = new HandRenderer(this, layout, theme);
    this.hudRenderer     = new HUDRenderer(this, layout, theme);
    this.overlayRenderer = new OverlayRenderer(this, layout, theme);
    this.hudRenderer.setLocalPlayer(localPlayerIndex);

    // ─── Input ───────────────────────────────────
    this.selectionManager = createSelectionManager(this.engine, layout, localPlayerIndex);

    // ─── Initial HUD emit ────────────────────────
    EventBus.emit(EV.HUD_REFRESH, {
      playerName, opponentName,
      playerKingHP: 30, playerKingMaxHP: 30, opponentKingHP: 30, opponentKingMaxHP: 30,
      playerLEG: 1, playerCrown: 1, opponentLEGCount: 1,
      currentPhase: 'DRAW', turnNumber: 1, isPlayerTurn: true,
      playerWins: GameState.winCount, playerLosses: GameState.lossCount,
      opponentHandCount: 4,
    });

    // ─── End turn button ─────────────────────────
    this.hudRenderer.onEndTurnClick(() => {
      const state = this.engine.getState();
      if (state.turn?.activePlayer !== localPlayerIndex) return;
      const phase = state.turn?.phase;
      if (phase === 'PLAY') {
        this.engine.endPlayPhase();
        SocketManager.sendGameAction({ type: 'END_PLAY_PHASE' });
        SocketManager.sendStateHash(boardHashFromCells(this.engine.getState().board), this.engine.getState().turn?.turnNumber ?? 0);
      } else if (phase === 'ACT') {
        this.engine.endActPhase();
        SocketManager.sendGameAction({ type: 'END_ACT_PHASE' });
        SocketManager.sendStateHash(boardHashFromCells(this.engine.getState().board), this.engine.getState().turn?.turnNumber ?? 0);
      }
    });

    // ─── Game over ───────────────────────────────
    this.gameOverUnsub = setupGameOverHandler(this, this.engine, localPlayerIndex, playerName, opponentName, this.sceneData.isCryptoMode);

    // ─── Network ─────────────────────────────────
    setupSocketCallbacks({
      engine: this.engine, scene: this,
      playerName, opponentName, localPlayerIndex,
    });

    // ─── Start game after both players are ready ──
    const startEngine = () => {
      this.engine.startGame();
      const v = this.engine.getState();
      console.log('[BattleScene] Game started —',
        `P1 hand: ${v.players[0]?.hand?.length ?? '?'}`,
        `P2 hand: ${v.players[1]?.hand?.length ?? '?'}`,
        `Board units: ${v.board.filter((c: any) => c.unit).length}`,
        `Phase: ${v.turn?.phase}`, `Active: P${(v.turn?.activePlayer ?? 0) + 1}`
      );
    };

    if (SocketManager.isConnected()) {
      // Multiplayer: wait for both players to be ready
      SocketManager.onBothBattleReady(() => startEngine());
      SocketManager.signalBattleReady();
    } else {
      // Single-player / local testing: start immediately
      startEngine();
    }
  }

  shutdown() {
    this.bridgeUnsub?.();
    this.gameOverUnsub?.();
    this.hudUnsubs.forEach(unsub => unsub());
    EventBus.clearAll?.();
    this.boardRenderer?.destroy?.();
    this.handRenderer?.destroy?.();
    this.hudRenderer?.destroy?.();
    this.overlayRenderer?.destroy?.();
    this.selectionManager?.destroy?.();
  }
}
