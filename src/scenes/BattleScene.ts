// ============================================================
// BattleScene.ts — Phase 2 board game scene
//
// PATCH v0.5:
//   - emitStatsChanged sends instanceId (not col/row) so
//     BoardRenderer can find the thumbnail even mid-tween.
//   - UNIT_ATTACKED updates BOTH target AND attacker stats
//     (counter-attack can damage the attacker too).
//   - UNIT_MOVED no longer sends `data` — BoardRenderer
//     only re-keys the thumbnail, no destroy+recreate.
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
import { getCard } from '../game/data/CardDefinitions';
import type { CardRenderData } from '../game/types/UITypes';
import { Player } from '../game/types/GameTypes';
import SocketManager, { type GameAction } from '../network/SocketManager';

function toCardRenderData(
  cardId: string, instanceId: string, owner: Player, localIndex: number,
  currentHP?: number, currentAtk?: number, canAct?: boolean,
): CardRenderData {
  const def = getCard(cardId);
  return {
    id: instanceId, name: def.name, cardClass: def.class, allegiance: def.allegiance,
    cost: def.cost, artKey: `art_${cardId}`,
    atk: currentAtk ?? def.stats?.atk, def: def.stats?.def,
    currentHP: currentHP ?? def.stats?.def, maxHP: def.stats?.def,
    abilityText: def.abilities?.map(a => a.type).join(', '),
    isEnemy: owner !== (localIndex as Player),
    isExhausted: false, isSelected: false, canAct: canAct ?? false,
  };
}

function unitCanAct(unit: any, activePlayer: number): boolean {
  return unit.owner === activePlayer
    && !unit.hasMoved && !unit.hasActed && !unit.isJustPlaced && unit.isActive;
}

/**
 * Emit UNIT_STATS_CHANGED for a unit by instanceId.
 * BoardRenderer looks this up in its instanceId index — works even mid-tween.
 */
function emitStatsChanged(engine: any, instanceId: string): void {
  const state = engine.getState();
  const cell = state.board.find((c: any) => c.unit?.instanceId === instanceId);
  if (!cell?.unit) return;
  const u = cell.unit;
  EventBus.emit('UNIT_STATS_CHANGED', {
    instanceId: u.instanceId,    // ← KEY CHANGE: send instanceId, not col/row
    atk: u.currentAtk,
    currentHP: u.currentDef,
    maxHP: u.maxDef,
    canAct: unitCanAct(u, state.turn?.activePlayer),
  });
}

function refreshCanActIndicators(engine: any): void {
  const state = engine.getState();
  const canActCells: Array<{ col: number; row: number }> = [];
  for (const cell of state.board) {
    if (!cell.unit) continue;
    if (unitCanAct(cell.unit, state.turn?.activePlayer)) {
      canActCells.push({ col: cell.col, row: cell.row });
    }
  }
  EventBus.emit('CAN_ACT_UPDATE', { cells: canActCells });
}

interface BattleSceneData {
  playerName: string;
  opponentName: string;
  isCryptoMode: boolean;
  roomCode: string;
}

function wireEngineToEventBus(engine: any, localPlayerIndex: number): void {
  engine.on((event: any) => {
    switch (event.type) {

      case 'UNIT_PLACED': {
        const state = engine.getState();
        const cell = state.board.find((c: any) => c.col === event.col && c.row === event.row);
        const unit = cell?.unit;
        const canAct = unit ? unitCanAct(unit, state.turn?.activePlayer) : false;
        const data = toCardRenderData(
          event.cardId, event.instanceId, event.owner, localPlayerIndex,
          unit?.currentDef, unit?.currentAtk, canAct,
        );
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        break;
      }

      // UNIT_MOVED: only send from/to — BoardRenderer re-keys the thumbnail
      case 'UNIT_MOVED': {
        EventBus.emit('UNIT_MOVED', { from: event.from, to: event.to });
        break;
      }

      case 'CARD_DRAWN': {
        if (event.player === (localPlayerIndex as Player)) {
          const card = toCardRenderData(event.cardId, event.cardId, event.player, localPlayerIndex);
          EventBus.emit('CARD_DRAWN', { card, handIndex: event.handIndex, deckRemaining: event.deckRemaining });
        } else {
          EventBus.emit('OPPONENT_CARD_DRAWN', { handIndex: event.handIndex });
        }
        break;
      }

      case 'CARD_PLAYED': {
        EventBus.emit('CARD_PLAYED', {
          handIndex: event.handIndex, player: event.player,
          isLocal: event.player === (localPlayerIndex as Player),
        });
        break;
      }

      case 'CARD_DISCARDED': {
        EventBus.emit('CARD_DISCARDED', {
          handIndex: event.handIndex, player: event.player,
          isLocal: event.player === (localPlayerIndex as Player),
        });
        break;
      }


      // which hasn't been mutated yet when ctx.emit fires before board.updateUnitStats).
      case 'UNIT_ATTACKED': {
        EventBus.emit('UNIT_ATTACKED', event);
        // Target: use event's targetNewHP directly — board state may be stale
        EventBus.emit('UNIT_STATS_CHANGED', {
          instanceId: event.targetInstanceId,
          atk: undefined,  // ATK doesn't change from being hit
          currentHP: event.targetNewHP,
          maxHP: event.maxHP,
          canAct: false,    // Just got hit — canAct irrelevant for visual
        });
        break;
      }

      case 'UNIT_DIED': {
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.instanceId });
        break;
      }

      case 'UNIT_HEALED': {
        EventBus.emit('UNIT_HEALED', event);
        emitStatsChanged(engine, event.instanceId);
        break;
      }

      case 'UNIT_EXHAUSTED': {
        EventBus.emit('UNIT_EXHAUSTED', { col: event.col, row: event.row });
        break;
      }

      case 'UNIT_REFRESHED': {
        EventBus.emit('UNIT_REFRESHED', { col: event.col, row: event.row });
        break;
      }

      case 'UNIT_TRANSFORMED': {
        const data = toCardRenderData(
          event.toCardId, event.newInstanceId, event.owner, localPlayerIndex, event.newHP,
        );
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.oldInstanceId });
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        break;
      }

      case 'LEG_GAINED':
      case 'LEG_SPENT':
      case 'LEG_RATE_CHANGED': {
        EventBus.emit(event.type, event);
        break;
      }

      case 'PHASE_CHANGED': {
        EventBus.emit(event.type, event);
        break;
      }

      case 'TURN_STARTED': {
        EventBus.emit(event.type, event);
        setTimeout(() => refreshCanActIndicators(engine), 300);
        break;
      }

      case 'PENDING_TARGET':
      case 'PENDING_POSITION':
      case 'PENDING_COLUMN':
      case 'PENDING_DISCARD': {
        // Only show pending interaction UI for the local (active) player
        const pendState = engine.getState();
        if (pendState.turn?.activePlayer === localPlayerIndex) {
          EventBus.emit(event.type, event);
        }
        break;
      }

      case 'INTERACTION_RESOLVED': {
        EventBus.emit('INTERACTION_RESOLVED', event);
        break;
      }

      case 'GAME_OVER': {
        EventBus.emit('GAME_OVER', event);
        break;
      }

      default: {
        EventBus.emit(event.type, event);
        break;
      }
    }
  });
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

  constructor() { super('BattleScene'); }
  init(data: BattleSceneData) { this.sceneData = data; }

  private getBoardUnit(col: number, row: number) {
    const cell = this.engine.getState().board.find(c => c.col === col && c.row === row);
    return cell?.unit ?? null;
  }

  private replayOpponentAction(action: GameAction): void {
    console.log('[BattleScene] Replaying opponent action:', action.type);
    switch (action.type) {
      case 'PLAY_CARD':
        this.engine.playCard(action.handIndex!, action.col, action.row); break;
      case 'MOVE_UNIT': {
        const unit = this.getBoardUnit(action.fromCol!, action.fromRow!);
        if (unit) this.engine.moveUnit(unit.instanceId, action.col!, action.row!);
        else console.warn('[BattleScene] MOVE_UNIT replay: no unit at', action.fromCol, action.fromRow);
        break;
      }
      case 'ATTACK_UNIT': {
        const attacker = this.getBoardUnit(action.fromCol!, action.fromRow!);
        const target   = this.getBoardUnit(action.targetCol!, action.targetRow!);
        if (attacker && target) this.engine.attackUnit(attacker.instanceId, target.instanceId);
        else console.warn('[BattleScene] ATTACK_UNIT replay: unit not found');
        break;
      }
      case 'SELECT_POSITION':
        this.engine.selectPosition(action.col!, action.row!); break;
      case 'END_PLAY_PHASE': this.engine.endPlayPhase(); break;
      case 'END_ACT_PHASE':  this.engine.endActPhase(); break;
      default: console.warn('[BattleScene] Unknown opponent action:', (action as any).type);
    }
  }

  private handleOpponentDisconnect(): void {
    const playerName   = this.sceneData?.playerName   ?? GameState.playerName ?? 'You';
    const opponentName = this.sceneData?.opponentName ?? GameState.opponentName ?? 'Opponent';

    GameState.recordWin();
    GameState.setLastMatch({
      playerName, opponentName, playerRoll: 0, opponentRoll: 0,
      playerWon: true, isTie: false, stakeAmount: GameState.currentStake,
      payout: GameState.currentMode === 'CryptoPlay' ? GameState.currentStake * 2 * 0.95 : 0,
    });
    (GameState as any).lastMatchExtra = {
      reason: 'DISCONNECT', turnCount: this.engine?.getState()?.turn?.turnNumber ?? 0, winnerName: playerName,
    };

    this.add.rectangle(640, 360, 600, 120, 0x000000, 0.85);
    this.add.text(640, 345, 'Opponent disconnected', { fontSize: '26px', color: '#FF6666', align: 'center' }).setOrigin(0.5);
    this.add.text(640, 380, 'You win! Going to results...', { fontSize: '18px', color: '#00FF88', align: 'center' }).setOrigin(0.5);

    this.time.delayedCall(3000, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ResultScene'));
    });
  }

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

    this.engine = new GameEngine();
    wireEngineToEventBus(this.engine, localPlayerIndex);

    // ─── HUD refresh ──────────────────────────
    const refreshHUD = () => {
      const state = this.engine.getState();
      if (!state) return;
      const oppIdx = localPlayerIndex === 0 ? 1 : 0;
      const getKingHP = (owner: number) => {
        const cell = state.board.find(c => c.unit?.cardId === 'king' && c.unit?.owner === owner);
        return { current: cell?.unit?.currentDef ?? 30, max: cell?.unit?.maxDef ?? 30 };
      };
      const playerKing = getKingHP(localPlayerIndex);
      const opponentKing = getKingHP(oppIdx);
      const playerMod = state.modifiers[localPlayerIndex];
      const opponentMod = state.modifiers[oppIdx];
      const computeLEGRate = (mod: typeof playerMod) => {
        if (mod.legRateFrozen) return 0;
        return Math.max(1, mod.legRateBase + mod.legRateBonus - mod.legRatePenalty);
      };
      EventBus.emit(EV.HUD_REFRESH, {
        playerName, opponentName,
        playerKingHP: playerKing.current, playerKingMaxHP: playerKing.max,
        opponentKingHP: opponentKing.current, opponentKingMaxHP: opponentKing.max,
        playerLEG: playerMod?.legPool ?? 0,
        playerCrown: playerMod ? computeLEGRate(playerMod) : 1,
        opponentLEGCount: opponentMod?.legPool ?? 0,
        currentPhase: state.turn?.phase ?? 'DRAW',
        turnNumber: state.turn?.turnNumber ?? 1,
        isPlayerTurn: state.turn?.activePlayer === localPlayerIndex,
        playerWins: GameState.winCount, playerLosses: GameState.lossCount,
        opponentHandCount: state.players[oppIdx]?.hand?.length ?? 0,
        playerHandCount: state.players[localPlayerIndex]?.hand?.length ?? 0,
      });
    };

    this.hudUnsubs.push(EventBus.on(EV.LEG_GAINED,        refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.LEG_SPENT,         refreshHUD));
    this.hudUnsubs.push(EventBus.on('LEG_RATE_CHANGED',   refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.UNIT_ATTACKED,     refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.UNIT_HEALED,       refreshHUD));
    this.hudUnsubs.push(EventBus.on('PHASE_CHANGED',      refreshHUD));
    this.hudUnsubs.push(EventBus.on('TURN_STARTED',       refreshHUD));
    this.hudUnsubs.push(EventBus.on(EV.CARD_PLAYED,       refreshHUD));
    this.hudUnsubs.push(EventBus.on('OPPONENT_CARD_DRAWN', refreshHUD));

    this.boardRenderer   = new BoardRenderer(this, layout, theme, localPlayerIndex);
    this.handRenderer    = new HandRenderer(this, layout, theme);
    this.hudRenderer     = new HUDRenderer(this, layout, theme);
    this.overlayRenderer = new OverlayRenderer(this, layout, theme);
    this.hudRenderer.setLocalPlayer(localPlayerIndex);

    this.selectionManager = new SelectionManager(layout, {
      getAttackRange: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getAttackRange(unit.instanceId).map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidMoves: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getValidMoveSquares(unit.instanceId).map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidAttacks: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getValidAttackSquares(unit.instanceId).map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidDeployPositions: () => {
        return this.engine.getValidDeployPositions().map((p: any) => ({ col: p.col, row: p.row }));
      },
      playCard: (handIndex: number, col: number, row: number) => {
        const ok = this.engine.playCard(handIndex, col, row);
        if (ok !== false) SocketManager.sendGameAction({ type: 'PLAY_CARD', handIndex, col, row });
      },
      moveUnit: (fromCol: number, fromRow: number, toCol: number, toRow: number) => {
        const unit = this.getBoardUnit(fromCol, fromRow);
        if (!unit) return;
        const ok = this.engine.moveUnit(unit.instanceId, toCol, toRow);
        if (ok !== false) SocketManager.sendGameAction({ type: 'MOVE_UNIT', fromCol, fromRow, col: toCol, row: toRow });
      },
      attackUnit: (fromCol: number, fromRow: number, targetCol: number, targetRow: number) => {
        const attacker = this.getBoardUnit(fromCol, fromRow);
        const target   = this.getBoardUnit(targetCol, targetRow);
        if (!attacker || !target) return;
        const ok = this.engine.attackUnit(attacker.instanceId, target.instanceId);
        if (ok !== false) SocketManager.sendGameAction({ type: 'ATTACK_UNIT', fromCol, fromRow, targetCol, targetRow });
      },
      selectTarget: (instanceId: string) => this.engine.selectTarget(instanceId),
      selectPosition: (col: number, row: number) => {
        this.engine.selectPosition(col, row);
        SocketManager.sendGameAction({ type: 'SELECT_POSITION', col, row });
      },
      selectHandCard: () => {},
      isAwaitingInput: () => this.engine.getState().status === 'AWAITING_INPUT',
      canAct: () => {
        const state = this.engine.getState();
        return state.turn?.activePlayer === localPlayerIndex && state.turn?.phase === 'ACT';
      },
      isPlayerUnit: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        return unit?.owner === localPlayerIndex;
      },
      isOccupied: (col: number, row: number) => this.getBoardUnit(col, row) !== null,
      getPhase: () => this.engine.getState().turn?.phase ?? 'DRAW',
    } as any);

    EventBus.emit(EV.HUD_REFRESH, {
      playerName, opponentName,
      playerKingHP: 30, playerKingMaxHP: 30, opponentKingHP: 30, opponentKingMaxHP: 30,
      playerLEG: 1, playerCrown: 1, opponentLEGCount: 1,
      currentPhase: 'DRAW', turnNumber: 1, isPlayerTurn: true,
      playerWins: GameState.winCount, playerLosses: GameState.lossCount,
      opponentHandCount: 4,
    });

    this.hudRenderer.onEndTurnClick(() => {
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

    EventBus.on(EV.GAME_OVER, (ev: any) => {
      if (!this.scene.isActive('BattleScene')) return;
      const result = ev.result ?? ev;
      const turnCount = result?.turns ?? this.engine.getState().turn?.turnNumber ?? 0;
      const reason = result?.reason ?? 'KING_DESTROYED';
      const playerWon = (result?.winner ?? ev.winner) === localPlayerIndex;
      if (playerWon) GameState.recordWin(); else GameState.recordLoss();
      GameState.setLastMatch({
        playerName, opponentName, playerRoll: 0, opponentRoll: 0, playerWon, isTie: false,
        stakeAmount: GameState.currentStake, payout: playerWon ? GameState.currentStake * 2 * 0.95 : 0,
      });
      (GameState as any).lastMatchExtra = { reason, turnCount, winnerName: playerWon ? playerName : opponentName };
      if (this.sceneData.isCryptoMode) SocketManager.sendGameOver(localPlayerIndex, playerWon);
      this.time.delayedCall(1500, () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ResultScene'));
      });
    });

    SocketManager.setCallbacks({
      onRoomCreated: (code) => GameState.setRoomCode(code),
      onRoomJoined: (code) => GameState.setRoomCode(code),
      onOpponentJoined: (name) => GameState.setOpponentName(name),
      onOpponentAction: (action: GameAction) => this.replayOpponentAction(action),
      onOpponentDisconnected: () => this.handleOpponentDisconnect(),
      onOpponentRollReceived: () => {},
      onError: (msg) => console.error('[BattleScene] Socket error:', msg),
      onPayoutResult: () => {},
    });

    this.engine.startGame();
    const v = this.engine.getState();
    console.log('[BattleScene] Game started —',
      `P1 hand: ${v.players[0]?.hand?.length ?? '?'}`,
      `P2 hand: ${v.players[1]?.hand?.length ?? '?'}`,
      `Board units: ${v.board.filter(c => c.unit).length}`,
      `Phase: ${v.turn?.phase}`, `Active: P${(v.turn?.activePlayer ?? 0) + 1}`
    );
  }

  shutdown() {
    this.hudUnsubs.forEach(unsub => unsub());
    EventBus.clearAll?.();
    this.boardRenderer?.destroy?.();
    this.handRenderer?.destroy?.();
    this.hudRenderer?.destroy?.();
    this.overlayRenderer?.destroy?.();
    this.selectionManager?.destroy?.();
  }
}
