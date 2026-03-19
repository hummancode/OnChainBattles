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

import { wireEngineToEventBus, getActiveProfiler } from './battle/EngineEventBridge';
import { setupSocketCallbacks } from './battle/NetworkCoordinator';
import { setupHUDRefresh } from './battle/HUDRefreshCoordinator';
import { createSelectionManager } from './battle/InputCoordinator';
import { setupGameOverHandler } from './battle/GameOverHandler';
import { boardHashFromCells } from '../game/utils/boardHash';
import { GameLogger } from '../game/GameLogger';
import { getCard } from '../game/data/CardRegistry';

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
  private logger?: GameLogger;
  private stateReportTimer?: ReturnType<typeof setInterval>;

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

    // Persist battle session so guest can rejoin after page refresh
    GameState.persistBattleSession();

    // ─── Engine + event bridge ────────────────────
    this.engine = new GameEngine();
    this.bridgeUnsub = wireEngineToEventBus(this.engine, localPlayerIndex);

    // ─── Game logger (with render profiler) ────────
    this.logger = new GameLogger(
      GameState.roomCode || 'local',
      localPlayerIndex,
      GameState.gameSeed || 0,
      () => this.engine.getState(),
      () => getActiveProfiler()?.snapshot() ?? null,
    );
    this.engine.on(e => this.logger?.record(e));

    // Expose to browser console
    (window as any).exportGameLog = () => {
      if (!this.logger) { console.warn('No active logger'); return; }
      this.logger.stop();
      console.log(`Exported ${this.logger.entryCount} events`);
    };
    (window as any).gameLog = () => this.logger?.getLog();

    // Render profiler console API
    (window as any).renderPerf = () => {
      const profiler = getActiveProfiler();
      if (!profiler) { console.warn('No active profiler'); return null; }
      console.log(profiler.summary());
      return profiler.snapshot();
    };
    (window as any).renderPerfReset = () => {
      const profiler = getActiveProfiler();
      if (!profiler) { console.warn('No active profiler'); return; }
      profiler.reset();
      console.log('[RenderProfiler] Counters reset');
    };

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

      // Dev-only: only P1 (host) sends periodic state reports to avoid duplicates
      if (import.meta.env.DEV && SocketManager.isConnected() && localPlayerIndex === 0) {
        this.sendStateReport('GAME_START');
        this.stateReportTimer = setInterval(() => this.sendStateReport('PERIODIC'), 30_000);
      }
    };

    // ─── Reconnection flow (guest page refresh) ────
    const isRejoin = !SocketManager.isConnected() && GameState.roomCode && GameState.hasBattleSession();

    if (isRejoin) {
      console.log('[BattleScene] Guest rejoin: connecting socket for room', GameState.roomCode);
      // connectForRejoin emits rejoin_room; setupSocketCallbacks (above) sets real handlers
      SocketManager.connectForRejoin({
        onRoomCreated: () => {},
        onRoomJoined: () => {},
        onOpponentJoined: () => {},
        onOpponentAction: () => {},
        onOpponentDisconnected: () => {},
        onError: (msg) => console.error('[BattleScene] Rejoin error:', msg),
      });
      // Start engine after rejoin + both ready
      SocketManager.onBothBattleReady(() => startEngine());
      SocketManager.signalBattleReady();
    } else if (SocketManager.isConnected()) {
      // Multiplayer: wait for both players to be ready
      SocketManager.onBothBattleReady(() => startEngine());
      SocketManager.signalBattleReady();
    } else {
      // Single-player / local testing: start immediately
      startEngine();
    }
  }

  shutdown() {
    // Dev-only: send final state report before shutdown (host only)
    if (import.meta.env.DEV && SocketManager.isConnected() && (GameState.playerIndex ?? 0) === 0) {
      this.sendStateReport('GAME_END');
    }
    if (this.stateReportTimer) {
      clearInterval(this.stateReportTimer);
      this.stateReportTimer = undefined;
    }

    this.logger?.stop();
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

  /** Build and send a game state report to the server (dev-only detailed logging). */
  private sendStateReport(trigger: 'GAME_START' | 'PERIODIC' | 'GAME_END'): void {
    try {
      const state = this.engine.getState();
      const units = state.board
        .filter(c => c.unit)
        .map(c => {
          const u = c.unit!;
          let cardName = u.cardId;
          try { cardName = getCard(u.cardId).name; } catch { /* fallback to id */ }
          return {
            instanceId: u.instanceId,
            cardId: u.cardId,
            name: cardName,
            owner: u.owner,
            col: c.col,
            row: c.row,
            baseAtk: u.baseAtk,
            currentAtk: u.currentAtk,
            baseDef: u.baseDef,
            currentDef: u.currentDef,
            maxDef: u.maxDef,
            isActive: u.isActive,
            hasMoved: u.hasMoved,
            hasActed: u.hasActed,
            buffs: (u.activeBuffs ?? []).map(b => ({
              source: b.source,
              atkDelta: b.atkDelta,
              defDelta: b.defDelta,
              movDelta: b.moveDelta,
            })),
          };
        });

      const buildPlayer = (pi: 0 | 1) => {
        const ps = state.players[pi];
        const mod = state.modifiers[pi];
        const effectiveRate = Math.max(1, mod.legRateBase + mod.legRateBonus - mod.legRatePenalty);
        return {
          player: pi,
          handCards: ps.hand.map(id => { try { return getCard(id).name; } catch { return id; } }),
          handCount: ps.hand.length,
          deckCount: ps.deckCount,
          discardCount: ps.discardCount,
          leg: mod.legPool,
          legRate: mod.legRateFrozen ? 0 : effectiveRate,
          legRateBase: mod.legRateBase,
          legRateBonus: mod.legRateBonus,
          legRatePenalty: mod.legRatePenalty,
          crownDiscount: mod.royalCostDiscount,
          crownPenalty: mod.royalCostPenalty,
        };
      };

      const renderPerf = getActiveProfiler()?.snapshot() ?? undefined;

      SocketManager.sendStateReport({
        trigger,
        ts: new Date().toISOString(),
        turn: state.turn?.turnNumber ?? 0,
        phase: state.turn?.phase ?? 'UNKNOWN',
        activePlayer: state.turn?.activePlayer ?? 0,
        units,
        players: [buildPlayer(0), buildPlayer(1)],
        renderPerf,
      });
    } catch (e) {
      console.warn('[BattleScene] Failed to send state report:', e);
    }
  }
}
