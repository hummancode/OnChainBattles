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
import { applyAction } from '../../network/ActionApplier';
import type { GameAction } from '../../../shared/types/NetworkEvents';

export type ActionSink = (action: GameAction) => void;

/** Default sink: the multiplayer relay. Offline matches pass a no-op. */
export const networkSink: ActionSink = (a) => SocketManager.sendGameAction(a);

/**
 * Apply a local action through the same path the server uses and send it only if the
 * engine accepted it (a refused action used to be sent anyway → server rejection / resync).
 */
export function dispatchLocal(engine: GameEngine, action: GameAction, send: ActionSink): boolean {
  const ok = applyAction(engine, action);
  if (ok) send(action);
  return ok;
}

export function createSelectionManager(
  engine: GameEngine,
  layout: BattleLayoutJSON,
  localPlayerIndex: number,
  send: ActionSink = networkSink,
): SelectionManager {
  const getBoardUnit = (col: number, row: number) => {
    const cell = engine.getState().board.find((c) => c.col === col && c.row === row);
    return cell?.unit ?? null;
  };
  const myTurn = () => engine.getState().turn?.activePlayer === localPlayerIndex;
  /** Every engine-changing input goes through here: only on our turn, only if accepted. */
  const act = (action: GameAction): boolean => myTurn() && dispatchLocal(engine, action, send);

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
      if (!myTurn()) return;
      const before = engine.getState();
      const cardId = before.players[localPlayerIndex]?.hand[handIndex];
      const leg = before.modifiers[localPlayerIndex]?.legPool ?? 0;
      let returned = false; // engine already explained (e.g. "no valid target") via CARD_RETURNED
      const watch = (e: { type: string }) => { if (e.type === 'CARD_RETURNED') returned = true; };
      engine.on(watch as any);
      const ok = act({ type: 'PLAY_CARD', handIndex, col, row });
      engine.off(watch as any);
      if (!ok && !returned) EventBus.emit(EV.UI_TOAST, {
        message: cardId && getCard(cardId).cost > leg ? `Not enough LEG (need ${getCard(cardId).cost}, have ${leg})` : "That card can't be played there",
      });
    },
    moveUnit: (fromCol: number, fromRow: number, toCol: number, toRow: number) => {
      if (!getBoardUnit(fromCol, fromRow)) return;
      if (!act({ type: 'MOVE_UNIT', fromCol, fromRow, col: toCol, row: toRow })) {
        EventBus.emit(EV.UI_TOAST, { message: "That unit can't move there" });
      }
    },
    attackUnit: (fromCol: number, fromRow: number, targetCol: number, targetRow: number) => {
      if (!getBoardUnit(fromCol, fromRow) || !getBoardUnit(targetCol, targetRow)) return;
      if (!act({ type: 'ATTACK_UNIT', fromCol, fromRow, targetCol, targetRow })) {
        EventBus.emit(EV.UI_TOAST, { message: "That unit can't attack that target" });
      }
    },
    selectTarget: (col: number, row: number) => {
      if (engine.getPendingKind() !== 'TARGET') return;
      if (!act({ type: 'SELECT_TARGET', col, row })) EventBus.emit(EV.UI_TOAST, { message: 'Pick one of the highlighted targets' });
    },
    selectColumn: (col: number) => {
      if (engine.getPendingKind() !== 'COLUMN') return;
      act({ type: 'SELECT_COLUMN', col });
    },
    selectPosition: (col: number, row: number) => {
      if (engine.getPendingKind() !== 'POSITION') return;
      act({ type: 'SELECT_POSITION', col, row });
    },
    selectHandCard: (handIndex: number) => {
      if (engine.getPendingKind() !== 'DISCARD') return;
      act({ type: 'SELECT_DISCARD', handIndex });
    },
    cancelPending: () => {
      act({ type: 'CANCEL_PENDING' });
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
