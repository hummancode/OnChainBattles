// ============================================================
// BattleStateSync.ts
// Paint the whole battle UI from engine state in one pass.
//
// Used after a page refresh: the engine is rebuilt silently
// (server decks + action log replayed BEFORE the event bridge is
// wired), so renderers saw none of the incremental events. This
// emits the same UI events a live game would have produced, but
// derived from the final state (State-Driven Rendering, §3.6).
// ============================================================

import { EventBus } from '../../events/EventBus';
import type { GameEngine } from '../../game/GameEngine';
import type { Player } from '../../game/types/GameTypes';
import type { HandRenderer } from '../../renderers/HandRenderer';
import { dispatchLocal, networkSink } from './InputCoordinator';
import { toCardRenderData, unitCanAct, emitAllUnitStats, refreshCanActIndicators } from './EngineEventBridge';

export function syncUIFromEngine(engine: GameEngine, localPlayerIndex: number, hand: HandRenderer): void {
  const st = engine.getState();
  const active = st.turn.activePlayer;

  // Board
  for (const cell of st.board) {
    const u = cell.unit;
    if (!u) continue;
    const data = toCardRenderData(
      u.cardId, u.instanceId, u.owner, localPlayerIndex,
      u.currentDef, u.currentAtk, unitCanAct(u, active),
    );
    EventBus.emit('UNIT_PLACED', { data, col: cell.col, row: cell.row });
  }
  emitAllUnitStats(engine);
  refreshCanActIndicators(engine);

  // Hand
  const me = localPlayerIndex as Player;
  hand.setHand(st.players[me].hand.map(id => toCardRenderData(id, id, me, localPlayerIndex)));

  // Turn / phase → HUD (HUDRefreshCoordinator listens to these and re-reads full state)
  EventBus.emit('TURN_STARTED', { type: 'TURN_STARTED', turn: st.turn.turnNumber, activePlayer: active });
  EventBus.emit('PHASE_CHANGED', { type: 'PHASE_CHANGED', phase: st.turn.phase, activePlayer: active, turn: st.turn.turnNumber });
}

/**
 * The refresh may have happened mid-interaction. If it's our turn and the engine is
 * waiting on us: re-open a mandatory DISCARD prompt; cancel any other (optional)
 * interaction — over the network too, so both engines stay identical.
 */
export function resumePendingAfterRejoin(engine: GameEngine, localPlayerIndex: number): void {
  const kind = engine.getPendingKind();
  if (!kind || engine.getState().turn.activePlayer !== localPlayerIndex) return;

  if (kind === 'DISCARD') {
    EventBus.emit('PENDING_DISCARD', { type: 'PENDING_DISCARD', reason: 'Discard 1 card from your hand.', count: 1 });
    return;
  }
  dispatchLocal(engine, { type: 'CANCEL_PENDING' }, networkSink);
}
