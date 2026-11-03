// ============================================================
// ActionApplier.ts
// Single source of truth for turning a network GameAction into
// engine calls. Used for:
//   - live opponent relay (NetworkCoordinator)
//   - full action-log replay after a page refresh (rejoin)
//   - catching up on missed opponent actions after a socket drop
//
// Pure: no socket, no Phaser, no EventBus.
// ============================================================

import type { GameEngine } from '../game/GameEngine';
import type { GameAction } from '../../shared/types/NetworkEvents';

function unitAt(engine: GameEngine, col?: number, row?: number) {
  if (col == null || row == null) return null;
  const cell = engine.getState().board.find(c => c.col === col && c.row === row);
  return cell?.unit ?? null;
}

/**
 * Apply one action to the engine. Returns false if the engine did not accept it.
 *
 * Engine methods for phase changes / pending resolution return void and silently
 * ignore invalid calls, so acceptance is detected by whether the call emitted any
 * engine event. This must be exact: the server uses it to reject illegal actions.
 */
export function applyAction(engine: GameEngine, action: GameAction): boolean {
  let emitted = 0;
  const count = () => { emitted++; };
  engine.on(count);
  try {
    return applyInner(engine, action, () => emitted > 0);
  } finally {
    engine.off(count);
  }
}

function applyInner(engine: GameEngine, action: GameAction, emittedAny: () => boolean): boolean {
  switch (action.type) {
    case 'PLAY_CARD':
      if (action.handIndex == null) return false;
      return engine.playCard(action.handIndex, action.col, action.row) !== false;

    case 'MOVE_UNIT': {
      const unit = unitAt(engine, action.fromCol, action.fromRow);
      if (!unit || action.col == null || action.row == null) return false;
      return engine.moveUnit(unit.instanceId, action.col, action.row) !== false;
    }

    case 'ATTACK_UNIT': {
      const attacker = unitAt(engine, action.fromCol, action.fromRow);
      const target   = unitAt(engine, action.targetCol, action.targetRow);
      if (!attacker || !target) return false;
      return engine.attackUnit(attacker.instanceId, target.instanceId) !== false;
    }

    case 'SELECT_POSITION':
      if (action.col == null || action.row == null) return false;
      engine.selectPosition(action.col, action.row);
      return emittedAny();

    case 'SELECT_TARGET': {
      const tgt = unitAt(engine, action.col, action.row);
      if (!tgt) return false;
      engine.selectTarget(tgt.instanceId);
      return emittedAny();
    }

    case 'SELECT_DISCARD':
      if (action.handIndex == null) return false;
      engine.selectDiscard(action.handIndex);
      return emittedAny();

    case 'CANCEL_PENDING': {
      // cancelPending() emits nothing by design — check the precondition instead.
      const kind = engine.getPendingKind();
      if (!kind || kind === 'DISCARD') return false;
      engine.cancelPending();
      return true;
    }

    case 'END_PLAY_PHASE':
      engine.endPlayPhase();
      return emittedAny();

    case 'END_ACT_PHASE':
      engine.endActPhase();
      return emittedAny();

    default:
      console.warn('[ActionApplier] Unknown action:', (action as GameAction).type);
      return false;
  }
}

/**
 * Replay an ordered action log onto an engine (used after a page refresh).
 * Stops at the first action that fails — a failure means the log and engine disagree.
 * Returns the number of actions applied.
 */
export function replayLog(engine: GameEngine, log: readonly GameAction[]): number {
  let applied = 0;
  for (const action of log) {
    if (!applyAction(engine, action)) {
      console.error('[ActionApplier] Replay diverged at action', applied, action);
      break;
    }
    applied++;
  }
  return applied;
}
