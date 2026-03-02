// ============================================================
// BattleScene.ts — Phase 2 board game scene
// Entered when both players join the same room.
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
import type { BattleLayoutJSON, ThemeJSON } from '../game/types/UITypes';
import GameState from '../GameState';
import { getCard } from '../game/data/CardDefinitions';
import type { CardRenderData } from '../game/types/UITypes';
import { Player } from '../game/types/GameTypes';
import SocketManager, { type GameAction } from '../network/SocketManager';

function toCardRenderData(
  cardId: string,
  instanceId: string,
  owner: Player,
  localIndex: number,
  currentHP?: number,
): CardRenderData {
  const def = getCard(cardId); // throws if cardId unknown — intentional

  return {
    id:        instanceId,
    name:      def.name,
    cardClass: def.class,        // 'UNIT' | 'SPELL' | 'STRUCTURE'
    allegiance: def.allegiance,  // 'STANDARD' | 'ROYAL'
    cost:      def.cost,
    artKey:    `art_${cardId}`,  // matches theme.assets key pattern
    atk:       def.stats?.atk,
    def:       def.stats?.def,
    currentHP: currentHP ?? def.stats?.def, // DEF = HP in this engine
    maxHP:     def.stats?.def,
    abilityText: def.abilities?.map(a => a.type).join(', '),
    isEnemy:   owner !== (localIndex as Player),
    isExhausted: false,
    isSelected:  false,
  };
}

interface BattleSceneData {
  playerName: string;
  opponentName: string;
  isCryptoMode: boolean;
  roomCode: string;
}
function wireEngineToEventBus(
  engine: /* GameEngine */ any,
  localPlayerIndex: number,
): void {

  engine.on((event: any) => {

    switch (event.type) {

      // ── Unit appears on board (king pre-place, card deploy, structure spawn) ──
      case 'UNIT_PLACED': {
        const data = toCardRenderData(
          event.cardId,
          event.instanceId,
          event.owner,
          localPlayerIndex,
        );
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        break;
      }

      // ── Unit moves from one cell to another ──────────────────────────────────
      case 'UNIT_MOVED': {
        // Look up the unit's current HP from engine state for accurate render
        const state = engine.getState();
        const cell  = state.board.find(
          (c: any) => c.col === event.to.col && c.row === event.to.row
        );
        const hp = cell?.unit?.currentDef;

        const data = toCardRenderData(
          event.cardId,
          event.instanceId,
          event.owner,
          localPlayerIndex,
          hp,
        );
        EventBus.emit('UNIT_MOVED', { data, from: event.from, to: event.to });
        break;
      }

      // ── Card drawn into hand ─────────────────────────────────────────────────
      // Only show cards for the local player — opponent hand stays face-down.
      case 'CARD_DRAWN': {
        if (event.player === (localPlayerIndex as Player)) {
          const card = toCardRenderData(
            event.cardId,
            event.cardId,          // hand cards use cardId as id (no instanceId yet)
            event.player,
            localPlayerIndex,
          );
          EventBus.emit('CARD_DRAWN', {
            card,
            handIndex:     event.handIndex,
            deckRemaining: event.deckRemaining,
          });
        } else {
          // Opponent card — just tell HandRenderer to add a face-down slot
          EventBus.emit('OPPONENT_CARD_DRAWN', {
            handIndex: event.handIndex,
          });
        }
        break;
      }

      // ── Card played from hand to board ───────────────────────────────────────
      case 'CARD_PLAYED': {
        // HandRenderer needs to remove the card at handIndex
        EventBus.emit('CARD_PLAYED', {
          handIndex: event.handIndex,
          player:    event.player,
          isLocal:   event.player === (localPlayerIndex as Player),
        });
        break;
      }

      // ── Card discarded from hand ─────────────────────────────────────────────
      case 'CARD_DISCARDED': {
        EventBus.emit('CARD_DISCARDED', {
          handIndex: event.handIndex,
          player:    event.player,
          isLocal:   event.player === (localPlayerIndex as Player),
        });
        break;
      }

      // ── Unit attacked another unit ───────────────────────────────────────────
      // BoardRenderer handles damage number + HP bar update from this event.
      case 'UNIT_ATTACKED': {
        EventBus.emit('UNIT_ATTACKED', event); // shape already matches renderer expectation
        break;
      }

      // ── Unit died and should be removed from board ───────────────────────────
      case 'UNIT_DIED': {
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.instanceId });
        break;
      }

      // ── Unit healed (HP bar update) ──────────────────────────────────────────
      case 'UNIT_HEALED': {
        EventBus.emit('UNIT_HEALED', event);
        break;
      }

      // ── Unit exhausted (turn used up) ────────────────────────────────────────
      case 'UNIT_EXHAUSTED': {
        EventBus.emit('UNIT_EXHAUSTED', { col: event.col, row: event.row });
        break;
      }

      // ── Unit refreshed (start of new turn) ───────────────────────────────────
      case 'UNIT_REFRESHED': {
        EventBus.emit('UNIT_REFRESHED', { col: event.col, row: event.row });
        break;
      }

      // ── Unit transformed (e.g. Mystic ability) ───────────────────────────────
      case 'UNIT_TRANSFORMED': {
        const data = toCardRenderData(
          event.toCardId,
          event.newInstanceId,
          event.owner,
          localPlayerIndex,
          event.newHP,
        );
        // Remove old, place new
        EventBus.emit('UNIT_DIED',   { col: event.col, row: event.row, instanceId: event.oldInstanceId });
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        break;
      }

      // ── LEG economy — HUD update ─────────────────────────────────────────────
      case 'LEG_GAINED':
      case 'LEG_SPENT':
      case 'LEG_RATE_CHANGED': {
        // Handled below in HUD refresh (Step 6 also subscribes here)
        EventBus.emit(event.type, event);
        break;
      }

      // ── Phase / turn changed — HUD update ────────────────────────────────────
      case 'PHASE_CHANGED':
      case 'TURN_STARTED': {
        EventBus.emit(event.type, event);
        break;
      }

      // ── Pending interaction — pause for input ─────────────────────────────────
      case 'PENDING_TARGET':
      case 'PENDING_POSITION':
      case 'PENDING_COLUMN':
      case 'PENDING_DISCARD': {
        EventBus.emit(event.type, event);
        break;
      }

      case 'INTERACTION_RESOLVED': {
        EventBus.emit('INTERACTION_RESOLVED', event);
        break;
      }

      // ── Game over ────────────────────────────────────────────────────────────
      case 'GAME_OVER': {
        EventBus.emit('GAME_OVER', event);
        break;
      }

      // ── Pass everything else through unchanged ───────────────────────────────
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

  constructor() {
    super('BattleScene');
  }

  init(data: BattleSceneData) {
    this.sceneData = data;
  }

  // ─── Helper: look up a unit by col/row from the board array ───
  // GameStateSnapshot.board is Array<{col, row, unit}>, NOT a keyed object.
  private getBoardUnit(col: number, row: number) {
    const cell = this.engine.getState().board.find(c => c.col === col && c.row === row);
    return cell?.unit ?? null;
  }
private replayOpponentAction(action: GameAction): void {
  console.log('[BattleScene] Replaying opponent action:', action.type);
  switch (action.type) {
    case 'PLAY_CARD':
      this.engine.playCard(action.handIndex!, action.col, action.row);
      break;
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
    case 'END_PLAY_PHASE':
      this.engine.endPlayPhase();
      break;
    case 'END_ACT_PHASE':
      this.engine.endActPhase();
      break;
    default:
      console.warn('[BattleScene] Unknown opponent action:', (action as any).type);
  }
}

private handleOpponentDisconnect(): void {
  console.log('[BattleScene] Opponent disconnected — awarding win');

  // Must set lastMatch or ResultScene shows blank fallback
  const playerName   = this.sceneData?.playerName   ?? GameState.playerName ?? 'You';
  const opponentName = this.sceneData?.opponentName ?? GameState.opponentName ?? 'Opponent';

  GameState.recordWin();
  GameState.setLastMatch({
    playerName,
    opponentName,
    playerRoll:  0,
    opponentRoll: 0,
    playerWon:   true,
    isTie:       false,
    stakeAmount: GameState.currentStake,
    payout:      GameState.currentMode === 'CryptoPlay'
      ? GameState.currentStake * 2 * 0.95
      : 0,
  });

  (GameState as any).lastMatchExtra = {
    reason:     'DISCONNECT',
    turnCount:  this.engine?.getState()?.turn?.turnNumber ?? 0,
    winnerName: playerName,
  };

  // Show overlay message on top of the board
  const bg = this.add.rectangle(640, 360, 600, 120, 0x000000, 0.85);
  this.add.text(640, 345, 'Opponent disconnected', {
    fontSize: '26px', color: '#FF6666', align: 'center',
  }).setOrigin(0.5);
  this.add.text(640, 380, 'You win! Going to results...', {
    fontSize: '18px', color: '#00FF88', align: 'center',
  }).setOrigin(0.5);

  this.time.delayedCall(3000, () => {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () =>
      this.scene.start('ResultScene')
    );
  });
}
  async create() {
    this.cameras.main.fadeIn(300, 0, 0, 0);

    const loadingText = this.add.text(640, 360, 'Loading battle...', {
      fontSize: '24px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // Load layout + theme (falls back to defaults if JSON missing)
    await LayoutLoader.load('BattleScene');
    await ThemeLoader.load('BattleScene');
    const layout = LayoutLoader.getBattle()!;
    const theme  = ThemeLoader.get('BattleScene');

    loadingText.destroy();

    // Background
    if (this.textures.exists('bg_battle')) {
      this.add.image(640, 360, 'bg_battle').setDisplaySize(1280, 720);
    } else {
      this.add.rectangle(640, 360, 1280, 720, 0x1a1a2e);
    }

    const playerName   = this.sceneData?.playerName   ?? GameState.playerName   ?? 'You';
    const opponentName = this.sceneData?.opponentName  ?? GameState.opponentName ?? 'Opponent';

    const localPlayerIndex = GameState.playerIndex ?? 0;
    
  // Init engine — bridge raw engine events to EventBus
    this.engine = new GameEngine();
    
    wireEngineToEventBus(this.engine, localPlayerIndex);
// ─── Step 6: refreshHUD reads live truth from engine.getState() ──────────────
const refreshHUD = () => {
  const state = this.engine.getState();
  if (!state) return;

  const oppIdx = localPlayerIndex === 0 ? 1 : 0;

  // King HP — find king unit per owner on the board
  const getKingHP = (owner: number) => {
    const cell = state.board.find(
      c => c.unit?.cardId === 'king' && c.unit?.owner === owner
    );
    return { current: cell?.unit?.currentDef ?? 30, max: cell?.unit?.maxDef ?? 30 };
  };

  const playerKing   = getKingHP(localPlayerIndex);
  const opponentKing = getKingHP(oppIdx);

  // LEG — modifiers snapshot (plain object, compute rate manually)
  const playerMod   = state.modifiers[localPlayerIndex];
  const opponentMod = state.modifiers[oppIdx];

  const computeLEGRate = (mod: typeof playerMod) => {
    if (mod.legRateFrozen) return 0;
    return Math.max(1, mod.legRateBase + mod.legRateBonus - mod.legRatePenalty);
  };

  EventBus.emit(EV.HUD_REFRESH, {
    playerName,
    opponentName,
    playerKingHP:      playerKing.current,
    playerKingMaxHP:   playerKing.max,
    opponentKingHP:    opponentKing.current,
    opponentKingMaxHP: opponentKing.max,
    playerLEG:         playerMod?.legPool     ?? 0,
    playerLEGRate:     playerMod ? computeLEGRate(playerMod) : 1,
    opponentLEGCount:  opponentMod?.legPool   ?? 0,
    currentPhase:      state.turn?.phase       ?? 'DRAW',
    turnNumber:        state.turn?.turnNumber  ?? 1,
    isPlayerTurn:      state.turn?.activePlayer === localPlayerIndex,
    playerWins:        GameState.winCount,
    playerLosses:      GameState.lossCount,
    opponentHandCount: state.players[oppIdx]?.hand?.length ?? 0,
    playerHandCount:   state.players[localPlayerIndex]?.hand?.length ?? 0,
  });
};

// Subscribe — refresh HUD on any event that changes displayed values
const hudUnsubs: Array<() => void> = [];
this.hudUnsubs.push(EventBus.on(EV.LEG_GAINED,      refreshHUD));
this.hudUnsubs.push(EventBus.on(EV.LEG_SPENT,       refreshHUD));
this.hudUnsubs.push(EventBus.on('LEG_RATE_CHANGED', refreshHUD));
this.hudUnsubs.push(EventBus.on(EV.UNIT_ATTACKED,   refreshHUD));
this.hudUnsubs.push(EventBus.on(EV.UNIT_HEALED,     refreshHUD));
this.hudUnsubs.push(EventBus.on('PHASE_CHANGED',    refreshHUD));
this.hudUnsubs.push(EventBus.on('TURN_STARTED',     refreshHUD));
this.hudUnsubs.push(EventBus.on(EV.CARD_PLAYED,     refreshHUD));
this.hudUnsubs.push(EventBus.on('OPPONENT_CARD_DRAWN', refreshHUD));
    // Init renderers
    this.boardRenderer   = new BoardRenderer(this, layout, theme);
    this.boardRenderer.setLocalPlayer(localPlayerIndex);
    this.hudRenderer.setLocalPlayer(localPlayerIndex);   // ← ADD
    this.handRenderer    = new HandRenderer(this, layout, theme);
    this.hudRenderer     = new HUDRenderer(this, layout, theme);
    this.overlayRenderer = new OverlayRenderer(this, layout, theme);

  
    // SelectionManager bridges col/row clicks → unitId-based engine API.
    // Uses getBoardUnit() helper because board is an Array, not a keyed object.
    this.selectionManager = new SelectionManager(layout, {
      getValidMoves: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getValidMoveSquares(unit.instanceId)
          .map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidAttacks: (col: number, row: number) => {
        const unit = this.getBoardUnit(col, row);
        if (!unit) return [];
        return this.engine.getValidAttackSquares(unit.instanceId)
          .map((p: any) => ({ col: p.col, row: p.row }));
      },
      getValidDeployPositions: (_cardIndex: number) => {
        return this.engine.getValidDeployPositions()
          .map((p: any) => ({ col: p.col, row: p.row }));
      },
      playCard: (handIndex: number, col: number, row: number) => {
  const ok = this.engine.playCard(handIndex, col, row);
  if (ok !== false) {   // engine returns void or true on success
    SocketManager.sendGameAction({ type: 'PLAY_CARD', handIndex, col, row });
  }
},
    moveUnit: (fromCol: number, fromRow: number, toCol: number, toRow: number) => {
  const unit = this.getBoardUnit(fromCol, fromRow);
  if (!unit) return;
  const ok = this.engine.moveUnit(unit.instanceId, toCol, toRow);
  if (ok !== false) {
    SocketManager.sendGameAction({ type: 'MOVE_UNIT', fromCol, fromRow, col: toCol, row: toRow });
  }
},
     attackUnit: (fromCol: number, fromRow: number, targetCol: number, targetRow: number) => {
  const attacker = this.getBoardUnit(fromCol, fromRow);
  const target   = this.getBoardUnit(targetCol, targetRow);
  if (!attacker || !target) return;
  const ok = this.engine.attackUnit(attacker.instanceId, target.instanceId);
  if (ok !== false) {
    SocketManager.sendGameAction({ type: 'ATTACK_UNIT', fromCol, fromRow, targetCol, targetRow });
  }
},
      selectTarget: (instanceId: string) => {
        this.engine.selectTarget(instanceId);
      },
      selectPosition: (col: number, row: number) => {
        this.engine.selectPosition(col, row);
      },
      selectHandCard: (_idx: number) => {},
      isAwaitingInput: () => this.engine.getState().status === 'AWAITING_INPUT',
  canAct: (_col: number, _row: number) => {
  const state = this.engine.getState();
  return state.turn?.activePlayer === localPlayerIndex && state.turn?.phase === 'ACT';
},
isPlayerUnit: (col: number, row: number) => {
  const unit = this.getBoardUnit(col, row);
  return unit?.owner === localPlayerIndex;
},
      isOccupied: (col: number, row: number) => {
        return this.getBoardUnit(col, row) !== null;
      },
      getPhase: () => this.engine.getState().turn?.phase ?? 'DRAW',
    } as any);

    // Fire initial HUD_REFRESH — HUDRenderer.refresh() reads playerName/opponentName from this
    EventBus.emit(EV.HUD_REFRESH, {
      playerName,
      opponentName,
      playerKingHP: 30,    playerKingMaxHP: 30,
      opponentKingHP: 30,  opponentKingMaxHP: 30,
      playerLEG: 1,        playerLEGRate: 1,
      opponentLEGCount: 1,
      currentPhase: 'DRAW',
      turnNumber: 1,
      isPlayerTurn: true,
      playerWins: GameState.winCount,
      playerLosses: GameState.lossCount,
      opponentHandCount: 4,
    });

    // Wire End Turn / Pass buttons
this.hudRenderer.onEndTurnClick(() => {
  const phase = this.engine.getState().turn?.phase;
  if (phase === 'PLAY') {
    this.engine.endPlayPhase();
    SocketManager.sendGameAction({ type: 'END_PLAY_PHASE' });
  } else if (phase === 'ACT') {
    this.engine.endActPhase();
    SocketManager.sendGameAction({ type: 'END_ACT_PHASE' });
  }
});
this.hudRenderer.onPassClick(() => {
  this.engine.endActPhase();
  SocketManager.sendGameAction({ type: 'END_ACT_PHASE' });
});

    // Game over → ResultScene
   EventBus.on(EV.GAME_OVER, (ev: any) => {
  const result    = ev.result ?? ev;   // engine wraps in .result on some versions
  const turnCount = result?.turns ?? this.engine.getState().turn?.turnNumber ?? 0;
  const reason    = result?.reason ?? 'KING_DESTROYED';
  const playerWon = (result?.winner ?? ev.winner) === localPlayerIndex;
      if (playerWon) GameState.recordWin();
      else GameState.recordLoss();
GameState.setLastMatch({
  playerName,
  opponentName,
  playerRoll: 0,
  opponentRoll: 0,
  playerWon,
  isTie: false,
  stakeAmount: GameState.currentStake,
  payout: playerWon ? GameState.currentStake * 2 * 0.95 : 0,
});

// Store extra match data for ResultScene
(GameState as any).lastMatchExtra = {
  reason,
  turnCount,
  winnerName: playerWon ? playerName : opponentName,
};
      this.time.delayedCall(2000, () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('ResultScene'));
      });
    });

    // Start!

  // REPLACE SocketManager.connect({...}) in BattleScene.create() WITH:
SocketManager.setCallbacks({
  onRoomCreated:    (code) => GameState.setRoomCode(code),
  onRoomJoined:     (code) => GameState.setRoomCode(code),
  onOpponentJoined: (name) => GameState.setOpponentName(name),
  onOpponentAction: (action: GameAction) => this.replayOpponentAction(action),
  onOpponentDisconnected: () => this.handleOpponentDisconnect(),
  onOpponentRollReceived: () => {},
  onError: (msg) => console.error('[BattleScene] Socket error:', msg),
});
 // WITH:
this.engine.startGame();

// G-06 verification: confirm decks dealt correctly
const verifyState = this.engine.getState();
console.log('[BattleScene] Game started —',
  `P1 hand: ${verifyState.players[0]?.hand?.length ?? '?'}`,
  `P2 hand: ${verifyState.players[1]?.hand?.length ?? '?'}`,
  `Board units: ${verifyState.board.filter(c => c.unit).length}`,
  `Phase: ${verifyState.turn?.phase}`,
  `Active: P${(verifyState.turn?.activePlayer ?? 0) + 1}`
);
console.log('[BattleScene] Started:', playerName, 'vs', opponentName,
  `| localPlayerIndex: ${localPlayerIndex}`);
  }

shutdown() {
  this.hudUnsubs.forEach(unsub => unsub());   // ← ADD
  EventBus.clearAll?.();
  this.boardRenderer?.destroy?.();
  this.handRenderer?.destroy?.();
  this.hudRenderer?.destroy?.();
  this.overlayRenderer?.destroy?.();
  this.selectionManager?.destroy?.();
}
}