// ============================================================
// phases/EndPhase.ts
// END phase: turn cleanup and win condition check.
//
// Execution order:
//   1. Tick timed effects (duration --)
//   2. Resolve Treason returns
//   3. Trim hand overflow (Motherland)
//   4. Clear LEG overflow flag
//   5. Check win condition (King death)
//   6. Emit TURN_ENDED
//
// Pure module — reads/writes through GameContext only.
// ============================================================

import type { GameContext } from '../GameContext';
import { opponent } from '../GameContext';
import { Player, TurnPhase, EngineStatus } from '../types/GameTypes';
import { getValidAttacks } from '../MovementRules';

/**
 * Execute the END phase for the active player.
 * Returns true if game is over (win condition met).
 */
export function runEndPhase(ctx: GameContext): boolean {
  ctx.phase = TurnPhase.END;
  ctx.emit({ type: 'PHASE_CHANGED', phase: TurnPhase.END, activePlayer: ctx.activePlayer, turn: ctx.turnNumber });

  const ap = ctx.activePlayer;
  const mod = ctx.mods[ap];

  // 1. Tick timed effects (duration --)
  mod.tickEffects();

  // 2. Resolve Treason returns (ownership change requires aura recalc)
  const hadTreason = resolveTreasonReturns(ctx);
  if (hadTreason) {
    const auraEvent = ctx.auras.evaluateAuras(ctx.board, ctx.mods);
    ctx.emit(auraEvent);
  }

  // 3. Trim hand overflow (Motherland)
  const overflow = ctx.players[ap].trimOverflowHand();
  for (const cardId of overflow) {
    ctx.emit({ type: 'CARD_DISCARDED', player: ap, cardId, handIndex: -1 });
  }

  // 4. Clear LEG overflow flag
  mod.clearOverflow();

  // 5. Check win condition
  if (checkWinCondition(ctx)) return true;

  // 6. Emit TURN_ENDED
  ctx.emit({ type: 'TURN_ENDED', turn: ctx.turnNumber, activePlayer: ap });

  return false;
}

// ─────────────────────────────────────────────
// SUB-STEPS
// ─────────────────────────────────────────────

function resolveTreasonReturns(ctx: GameContext): boolean {
  let resolved = false;
  for (const unit of ctx.board.getAllUnits()) {
    if (unit.treasonOwner !== null && unit.treasonOwner !== unit.owner) {
      resolved = true;
      const origPos = unit.originalPos ?? unit.position;
      ctx.board.moveUnit(unit.instanceId, origPos.col, origPos.row);
      unit.owner = unit.treasonOwner;
      unit.treasonOwner = null;
      unit.originalPos = null;
      unit.isExhausted = true;
      ctx.emit({
        type: 'UNIT_EXHAUSTED',
        instanceId: unit.instanceId,
        col: unit.position.col,
        row: unit.position.row,
      });
    }
  }
  return resolved;
}

/**
 * Check if either King is dead.
 * Also emits KING_THREATENED warnings.
 * Returns true if game is over.
 */
function checkWinCondition(ctx: GameContext): boolean {
  for (const p of [Player.P1, Player.P2]) {
    const king = ctx.board.getKing(p);
    if (!king || king.currentDef <= 0) {
      ctx.status = EngineStatus.GAME_OVER;
      ctx.emit({
        type: 'GAME_OVER',
        result: {
          winner: opponent(p),
          loser: p,
          reason: 'KING_DESTROYED',
          turns: ctx.turnNumber,
        },
      });
      return true;
    }
  }

  // King threat warnings (informational — doesn't block turn)
  emitKingThreats(ctx);

  return false;
}

function emitKingThreats(ctx: GameContext): void {
  for (const p of [Player.P1, Player.P2]) {
    const king = ctx.board.getKing(p);
    if (!king) continue;

    const kc = king.position.col, kr = king.position.row;
    const threatIds: string[] = [];

    for (const u of ctx.board.getUnitsOf(opponent(p))) {
      if (!u.isActive) continue;

      // Quick adjacency pre-check: skip units too far to threaten
      const dx = Math.abs(u.position.col - kc);
      const dy = Math.abs(u.position.row - kr);
      // Most attacks have range <= 3; skip if Manhattan distance > 4
      if (dx + dy > 4) continue;

      const attacks = getValidAttacks(u, ctx.board);
      for (const pos of attacks) {
        if (pos.col === kc && pos.row === kr) {
          threatIds.push(u.instanceId);
          break;
        }
      }
    }

    if (threatIds.length > 0) {
      ctx.emit({
        type: 'KING_THREATENED',
        kingInstanceId: king.instanceId,
        kingPlayer: p,
        attackerInstanceIds: threatIds,
      });
    }
  }
}
