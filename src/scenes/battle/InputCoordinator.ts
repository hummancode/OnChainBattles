// ============================================================
// InputCoordinator.ts
// Sets up SelectionManager with engine-backed callbacks.
// ============================================================

import type { GameEngine } from '../../game/GameEngine';
import type { BattleLayoutJSON } from '../../game/types/UITypes';
import { SelectionManager } from '../../input/SelectionManager';
import SocketManager from '../../network/SocketManager';
import { EventBus, EV } from '../../events/EventBus';
import { getCard } from '../../game/data/CardRegistry';

export function createSelectionManager(
  engine: GameEngine,
  layout: BattleLayoutJSON,
  localPlayerIndex: number,
): SelectionManager {
  const getBoardUnit = (col: number, row: number) => {
    const cell = engine.getState().board.find((c) => c.col === col && c.row === row);
    return cell?.unit ?? null;
  };

  return new SelectionManager(layout, {
    getAttackRange: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (!unit) return [];
      return engine.getAttackRange(unit.instanceId).map((p) => ({ col: p.col, row: p.row }));
    },
    getValidMoves: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (!unit) return [];
      return engine.getValidMoveSquares(unit.instanceId).map((p) => ({ col: p.col, row: p.row }));
    },
    getValidAttacks: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (!unit) return [];
      return engine.getValidAttackSquares(unit.instanceId).map((p) => ({ col: p.col, row: p.row }));
    },
    getValidDeployPositions: () => {
      return engine.getValidDeployPositions().map((p) => ({ col: p.col, row: p.row }));
    },
    playCard: (handIndex: number, col: number, row: number) => {
      const before = engine.getState();
      const cardId = before.players[localPlayerIndex]?.hand[handIndex];
      const leg = before.modifiers[localPlayerIndex]?.legPool ?? 0;
      let returned = false; // engine already explained (e.g. "no valid target") via CARD_RETURNED
      const watch = (e: { type: string }) => { if (e.type === 'CARD_RETURNED') returned = true; };
      engine.on(watch as any);
      const ok = engine.playCard(handIndex, col, row);
      engine.off(watch as any);
      if (ok !== false) SocketManager.sendGameAction({ type: 'PLAY_CARD', handIndex, col, row });
      else if (!returned) EventBus.emit(EV.UI_TOAST, {
        message: cardId && getCard(cardId).cost > leg ? `Not enough LEG (need ${getCard(cardId).cost}, have ${leg})` : "That card can't be played there",
      });
    },
    moveUnit: (fromCol: number, fromRow: number, toCol: number, toRow: number) => {
      const unit = getBoardUnit(fromCol, fromRow);
      if (!unit) return;
      const ok = engine.moveUnit(unit.instanceId, toCol, toRow);
      if (ok !== false) SocketManager.sendGameAction({ type: 'MOVE_UNIT', fromCol, fromRow, col: toCol, row: toRow });
      else EventBus.emit(EV.UI_TOAST, { message: "That unit can't move there" });
    },
    attackUnit: (fromCol: number, fromRow: number, targetCol: number, targetRow: number) => {
      const attacker = getBoardUnit(fromCol, fromRow);
      const target   = getBoardUnit(targetCol, targetRow);
      if (!attacker || !target) return;
      const ok = engine.attackUnit(attacker.instanceId, target.instanceId);
      if (ok !== false) SocketManager.sendGameAction({ type: 'ATTACK_UNIT', fromCol, fromRow, targetCol, targetRow });
      else EventBus.emit(EV.UI_TOAST, { message: "That unit can't attack that target" });
    },
    selectTarget: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      if (unit) {
        engine.selectTarget(unit.instanceId);
        SocketManager.sendGameAction({ type: 'SELECT_TARGET', col, row });
      }
    },
    selectColumn: (col: number) => {
      if (engine.getPendingKind() !== 'COLUMN') return;
      engine.selectColumn(col);
      SocketManager.sendGameAction({ type: 'SELECT_COLUMN', col });
    },
    selectPosition: (col: number, row: number) => {
      engine.selectPosition(col, row);
      SocketManager.sendGameAction({ type: 'SELECT_POSITION', col, row });
    },
    selectHandCard: (handIndex: number) => {
      const st = engine.getState();
      if (engine.getPendingKind() !== 'DISCARD') return;
      if (st.turn?.activePlayer !== localPlayerIndex) return;
      engine.selectDiscard(handIndex);
      SocketManager.sendGameAction({ type: 'SELECT_DISCARD', handIndex });
    },
    cancelPending: () => {
      engine.cancelPending();
      SocketManager.sendGameAction({ type: 'CANCEL_PENDING' });
    },
    isAwaitingInput: () => engine.getState().status === 'AWAITING_INPUT',
    canAct: (col: number, row: number) => {
      const state = engine.getState();
      if (state.turn?.activePlayer !== localPlayerIndex || state.turn?.phase !== 'ACT') return false;
      const unit = getBoardUnit(col, row);
      if (!unit) return false;
      // Unit already moved or acted this turn
      return !state.turn.unitsActedThisTurn.has(unit.instanceId);
    },
    isPlayerUnit: (col: number, row: number) => {
      const unit = getBoardUnit(col, row);
      return unit?.owner === localPlayerIndex;
    },
    isOccupied: (col: number, row: number) => getBoardUnit(col, row) !== null,
    getPhase: () => engine.getState().turn?.phase ?? 'DRAW',
    isMyTurn: () => engine.getState().turn?.activePlayer === localPlayerIndex,
  } as any);
}
