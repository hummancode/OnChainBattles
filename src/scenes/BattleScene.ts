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
import { setupSocketCallbacks, resetNetworkSyncState } from './battle/NetworkCoordinator';
import { syncUIFromEngine, resumePendingAfterRejoin } from './battle/BattleStateSync';
import { replayLog } from '../network/ActionApplier';
import type { RejoinPayload, GameAction } from '../../shared/types/NetworkEvents';
import { applyAction } from '../network/ActionApplier';
import { nextBotAction } from '../game/ai/SimpleBot';
import { TutorialCoordinator } from './battle/TutorialCoordinator';
import { SfxCoordinator } from './battle/SfxCoordinator';
import { TUTORIAL_DECK, TUTORIAL_BOT_DECK, TUTORIAL_SEED } from '../game/data/TutorialSetup';
import { setupHUDRefresh } from './battle/HUDRefreshCoordinator';
import { createSelectionManager } from './battle/InputCoordinator';
import { setupGameOverHandler } from './battle/GameOverHandler';
import { engineStateHash } from '../game/utils/stateHash';
import { GameLogger } from '../game/GameLogger';
import { getCard } from '../game/data/CardRegistry';

/** Stored match served by GET /api/replays/:roomCode. */
export interface ReplayData {
  roomCode: string;
  gameSeed: number;
  decks: [string[], string[]];
  actionLog: GameAction[];
  playerNames: [string, string];
  winnerIndex: number | null;
  reason: string | null;
  /** Whose perspective to show (their hand + board orientation). */
  viewAs?: number;
}

interface BattleSceneData {
  playerName: string;
  opponentName: string;
  isCryptoMode: boolean;
  roomCode: string;
  /** Watch a finished match instead of playing one (no network, no input). */
  replay?: ReplayData;
  /** Offline match vs SimpleBot (P2); `tutorial` adds the guided lesson. */
  vsBot?: { tutorial?: boolean };
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
    // Phaser emits 'shutdown' but never calls a scene's shutdown() method itself —
    // without this hook none of the cleanup below ever ran (listeners piled up per match).
    this.events.once('shutdown', () => this.shutdown());

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

    // ─── Page-refresh rejoin: get the authoritative match state FIRST ──
    // The engine is rebuilt from server decks + action log before any renderer or
    // event bridge exists, so the replay is silent and the UI is painted once from state.
    const replay = this.sceneData?.replay;
    const vsBot = this.sceneData?.vsBot;
    const offline = !!replay || !!vsBot;
    if (vsBot) GameState.roomCode = ''; // no stale room → no wrong replay / rejoin afterwards
    const isRejoin = !offline && !SocketManager.isConnected() && !!GameState.roomCode && GameState.hasBattleSession();
    const isResync = !offline && GameState.pendingResync && SocketManager.isConnected() && !!GameState.roomCode;
    GameState.pendingResync = false;
    let rejoin: RejoinPayload | null = null;
    if (isResync) {
      // Desync recovery: same socket, ask the server for the authoritative state.
      const syncText = this.add.text(640, 360, 'Re-synchronising with server...', { fontSize: '24px', color: '#FFAA00' }).setOrigin(0.5);
      SocketManager.setCallbacks({
        onRoomCreated: () => {}, onRoomJoined: () => {}, onOpponentJoined: () => {},
        onOpponentAction: () => {}, onOpponentDisconnected: () => {},
        onError: (msg) => console.error('[BattleScene] Resync error:', msg),
      });
      const pending = SocketManager.waitForRejoin();
      SocketManager.requestResync();
      rejoin = await pending;
      syncText.destroy();
      if (!rejoin) { this.abandonRejoin(); return; }
    } else if (isRejoin) {
      const reconnectText = this.add.text(640, 360, 'Reconnecting to match...', { fontSize: '24px', color: '#FFAA00' }).setOrigin(0.5);
      SocketManager.connectForRejoin({
        onRoomCreated: () => {}, onRoomJoined: () => {}, onOpponentJoined: () => {},
        onOpponentAction: () => {}, onOpponentDisconnected: () => {},
        onError: (msg) => console.error('[BattleScene] Rejoin error:', msg),
      });
      rejoin = await SocketManager.waitForRejoin();
      reconnectText.destroy();
      if (!rejoin) {
        this.abandonRejoin();
        return;
      }
    }

    const localPlayerIndex = replay ? (replay.viewAs ?? 0) : vsBot ? 0 : (GameState.playerIndex ?? 0);
    const playerName   = replay ? replay.playerNames[localPlayerIndex] : (this.sceneData?.playerName   ?? GameState.playerName   ?? 'You');
    const opponentName = replay ? replay.playerNames[1 - localPlayerIndex] : (this.sceneData?.opponentName  ?? GameState.opponentName ?? 'Opponent');

    // Persist battle session so guest can rejoin after page refresh
    if (!offline) GameState.persistBattleSession();

    // ─── Engine + event bridge ────────────────────
    this.engine = new GameEngine();
    resetNetworkSyncState(0);
    if (rejoin?.battleStarted && rejoin.decks) {
      this.engine.startGame(rejoin.decks);
      const applied = replayLog(this.engine, rejoin.actionLog);
      const lastSeq = rejoin.actionLog.reduce((m, a) => Math.max(m, a.serverSeq ?? 0), 0);
      resetNetworkSyncState(lastSeq);
      console.log(`[BattleScene] Rejoin: replayed ${applied}/${rejoin.actionLog.length} actions`);
      if (applied !== rejoin.actionLog.length) {
        console.error('[BattleScene] Rejoin replay diverged — state may be out of sync');
      }
    }
    // Every outgoing action carries our post-action state hash → server detects desyncs.
    if (!offline) SocketManager.setHashSource(() => engineStateHash(this.engine));
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
    this.sfx = new SfxCoordinator(this, localPlayerIndex);

    // ─── Input ───────────────────────────────────
    // Replays are read-only: no SelectionManager → no clicks reach the engine.
    if (!replay) this.selectionManager = createSelectionManager(this.engine, layout, localPlayerIndex);

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
      if (replay) return;
      const state = this.engine.getState();
      if (state.turn?.activePlayer !== localPlayerIndex) return;
      const phase = state.turn?.phase;
      if (phase === 'PLAY') {
        this.engine.endPlayPhase();
        SocketManager.sendGameAction({ type: 'END_PLAY_PHASE' });
      } else if (phase === 'ACT') {
        this.engine.endActPhase();
        SocketManager.sendGameAction({ type: 'END_ACT_PHASE' });
      }
    });

    // ─── Game over ───────────────────────────────
    if (!replay) this.gameOverUnsub = setupGameOverHandler(this, this.engine, localPlayerIndex, playerName, opponentName, this.sceneData.isCryptoMode, { offline: !!vsBot });

    // ─── Network ─────────────────────────────────
    if (!offline) setupSocketCallbacks({
      engine: this.engine, scene: this,
      playerName, opponentName, localPlayerIndex,
    });

    // ─── Start game after both players are ready ──
    const startEngine = (decks?: [string[], string[]] | null) => {
      this.engine.startGame(decks ?? undefined);
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

    // ─── Start / resume ────────────────────────────
    if (replay) {
      this.runReplay(replay);
    } else if (vsBot) {
      if (vsBot.tutorial) {
        // Same playable opening for every new player (tests/tutorial/tutorialSetup.test.ts)
        GameState.gameSeed = TUTORIAL_SEED;
        startEngine([TUTORIAL_DECK, TUTORIAL_BOT_DECK]);
      } else {
        GameState.gameSeed = 0; // random shuffle for practice
        startEngine();
      }
      this.startBot(!!vsBot.tutorial);
    } else if (rejoin?.battleStarted) {
      // Engine already rebuilt above — paint it and resume.
      syncUIFromEngine(this.engine, localPlayerIndex, this.handRenderer);
      resumePendingAfterRejoin(this.engine, localPlayerIndex);
      this.showToast(isResync ? 'Re-synchronised with server' : 'Reconnected — match restored', '#00FF88');
    } else if (SocketManager.isConnected()) {
      // Multiplayer (fresh or rejoined before battle start): wait for both players.
      // Decks come from the server so both engines are built identically.
      SocketManager.onBothBattleReady((decks) => startEngine(decks));
      SocketManager.signalBattleReady();
    } else {
      // Single-player / local testing: start immediately
      startEngine();
    }
  }

  private tutorial?: TutorialCoordinator;
  private sfx?: SfxCoordinator;

  /** Drive player 2 with SimpleBot; actions go through applyAction like any other source. */
  private startBot(tutorial: boolean): void {
    const BOT = 1;
    if (tutorial) this.tutorial = new TutorialCoordinator(this, 0);
    const timer = this.time.addEvent({
      delay: 650, loop: true,
      callback: () => {
        const st = this.engine.getState();
        if (st.status === 'GAME_OVER') { timer.remove(false); return; }
        if (st.turn.activePlayer !== BOT) return;
        const action = nextBotAction(this.engine, BOT, { passive: this.tutorial?.script.botPassive ?? false });
        if (applyAction(this.engine, action)) return;
        // Safety net: never let a refused bot action stall the game.
        console.warn('[Bot] action refused, ending phase instead:', action);
        if (this.engine.getPendingKind()) applyAction(this.engine, { type: 'CANCEL_PENDING' });
        applyAction(this.engine, { type: st.turn.phase === 'PLAY' ? 'END_PLAY_PHASE' : 'END_ACT_PHASE' });
      },
    });
  }

  /**
   * Step through a stored match: same seed + decks + actions as the real game, applied on a
   * timer so the normal renderers animate it. Pause/speed controls + exit.
   */
  private runReplay(replay: ReplayData): void {
    GameState.gameSeed = replay.gameSeed;      // engine RNG (reshuffles) reads it
    this.hudRenderer.setSpectator(replay.playerNames);
    this.engine.startGame(replay.decks);

    const total = replay.actionLog.length;
    let index = 0;
    let paused = false;
    let speed = 1;
    const BASE_DELAY = 900;

    const banner = this.add.text(640, 22, '', {
      fontSize: '16px', color: '#FFD54F', backgroundColor: '#000000CC', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setDepth(1000);
    const render = (extra = '') => banner.setText(
      `REPLAY  ${replay.playerNames[0]} vs ${replay.playerNames[1]}  ·  ${index}/${total}${paused ? '  ·  PAUSED' : ''}  ·  ${speed}x${extra}`);

    const btn = (x: number, label: string, onClick: () => void) =>
      this.add.text(x, 60, label, { fontSize: '15px', color: '#4fc3f7', backgroundColor: '#000000CC', padding: { x: 8, y: 4 } })
        .setOrigin(0.5).setDepth(1000).setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    btn(520, '[ PAUSE ]', () => { paused = !paused; render(); });
    btn(620, '[ 1x ]', () => { speed = 1; render(); });
    btn(690, '[ 3x ]', () => { speed = 3; render(); });
    btn(790, '[ EXIT ]', () => this.scene.start('HubScene'));

    const step = () => {
      if (!this.sys.isActive()) return;
      if (!paused) {
        if (index >= total) {
          const w = replay.winnerIndex;
          render(`  ·  ${w === -1 ? 'DRAW' : w != null ? `${replay.playerNames[w]} wins` : 'end'}${replay.reason ? ` (${replay.reason})` : ''}`);
          return;
        }
        const ok = applyAction(this.engine, replay.actionLog[index]);
        if (!ok) console.warn('[Replay] action could not be applied:', replay.actionLog[index]);
        index++;
        render();
      }
      this.time.delayedCall(BASE_DELAY / speed, step);
    };
    render();
    this.time.delayedCall(1200, step);
  }

  /** Rejoin failed (room expired / not found): drop the stale session and go home. */
  private abandonRejoin(): void {
    GameState.clearBattleSession();
    SocketManager.disconnect();
    this.add.text(640, 340, 'Match is no longer available', { fontSize: '26px', color: '#FF6666' }).setOrigin(0.5);
    this.add.text(640, 380, 'Returning to menu...', { fontSize: '18px', color: '#AAAAAA' }).setOrigin(0.5);
    this.time.delayedCall(2500, () => this.scene.start('HubScene'));
  }

  private showToast(message: string, color: string): void {
    const t = this.add.text(640, 30, message, { fontSize: '16px', color, backgroundColor: '#000000CC', padding: { x: 12, y: 6 } })
      .setOrigin(0.5).setDepth(999);
    this.time.delayedCall(2500, () => t.destroy());
  }

  shutdown() {
    this.tutorial?.cleanup();
    this.tutorial = undefined;
    this.sfx?.cleanup();
    this.sfx = undefined;
    SocketManager.setHashSource(null);
    // Phaser reuses this scene instance; old callbacks would draw disconnect banners etc.
    // onto the next battle/replay (seen in QA). Re-installed by setupSocketCallbacks.
    SocketManager.clearCallbacks();
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
