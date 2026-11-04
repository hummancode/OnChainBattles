// ============================================================
// EngineEventBridge.ts
// Bridges GameEngine events → typed EventBus events.
// Converts raw engine events into UI-adapted payloads.
// ============================================================

import { EventBus, EV } from '../../events/EventBus';
import { getCard } from '../../game/data/CardRegistry';
import type { CardRenderData } from '../../game/types/UITypes';
import { Player } from '../../game/types/GameTypes';
import { RenderProfiler } from '../../renderers/RenderProfiler';

export function toCardRenderData(
  cardId: string, instanceId: string, owner: Player, localIndex: number,
  currentHP?: number, currentAtk?: number, canAct?: boolean,
): CardRenderData {
  const def = getCard(cardId);
  return {
    id: instanceId, name: def.name, cardClass: def.class, allegiance: def.allegiance,
    cost: def.cost, artKey: `art_${cardId}`,
    atk: currentAtk ?? def.stats?.atk, def: def.stats?.def,
    currentHP: currentHP ?? def.stats?.def, maxHP: def.stats?.def,
    abilityText: def.abilityText ?? '',
    isEnemy: owner !== (localIndex as Player),
    isExhausted: false, isSelected: false, canAct: canAct ?? false,
  };
}

export function unitCanAct(unit: any, activePlayer: number): boolean {
  return unit.owner === activePlayer
    && !unit.hasMoved && !unit.hasActed && !unit.isJustPlaced && unit.isActive;
}

function emitStatsChanged(engine: any, instanceId: string): void {
  const state = engine.getState();
  const cell = state.board.find((c: any) => c.unit?.instanceId === instanceId);
  if (!cell?.unit) return;
  const u = cell.unit;
  EventBus.emit('UNIT_STATS_CHANGED', {
    instanceId: u.instanceId,
    atk: u.currentAtk,
    currentHP: u.currentDef,
    maxHP: u.maxDef,
    canAct: unitCanAct(u, state.turn?.activePlayer),
  });
}

/**
 * Emit UNIT_STATS_CHANGED for EVERY unit on the board.
 * Implements state-driven rendering: after any aura recalculation,
 * the UI syncs all stats from the engine's source of truth —
 * not just units with non-zero deltas.
 *
 * Batched: emits a single UNIT_STATS_BATCH event with all unit data,
 * followed by individual UNIT_STATS_CHANGED for backwards compat.
 */
export function emitAllUnitStats(engine: any, profiler?: RenderProfiler): void {
  const state = engine.getState();
  const batch: Array<{
    instanceId: string; atk: number; currentHP: number; maxHP: number; canAct: boolean;
  }> = [];

  for (const cell of state.board) {
    if (!cell.unit) continue;
    const u = cell.unit;
    batch.push({
      instanceId: u.instanceId,
      atk: u.currentAtk,
      currentHP: u.currentDef,
      maxHP: u.maxDef,
      canAct: unitCanAct(u, state.turn?.activePlayer),
    });
  }

  // Emit a single batched event — BoardRenderer handles it in one pass.
  // No individual UNIT_STATS_CHANGED emissions here; they are only emitted
  // for point updates (UNIT_ATTACKED, UNIT_HEALED) where a single unit changed.
  if (profiler) profiler.begin('UNIT_STATS_BATCH');
  EventBus.emit('UNIT_STATS_BATCH', { units: batch });
  if (profiler) profiler.end();
}

export function refreshCanActIndicators(engine: any): void {
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

/** Shared profiler instance — accessible from BattleScene and console. */
let _activeProfiler: RenderProfiler | null = null;
export function getActiveProfiler(): RenderProfiler | null { return _activeProfiler; }

export function wireEngineToEventBus(engine: any, localPlayerIndex: number): () => void {
  const profiler = new RenderProfiler();
  _activeProfiler = profiler;
  // Deferred UI refreshes — cancelled on teardown so they never touch a shut-down scene.
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };

  const handler = (event: any) => {
    switch (event.type) {

      case 'UNIT_PLACED': {
        profiler.begin('UNIT_PLACED');
        const state = engine.getState();
        const cell = state.board.find((c: any) => c.col === event.col && c.row === event.row);
        const unit = cell?.unit;
        const canAct = unit ? unitCanAct(unit, state.turn?.activePlayer) : false;
        const data = toCardRenderData(
          event.cardId, event.instanceId, event.owner, localPlayerIndex,
          unit?.currentDef, unit?.currentAtk, canAct,
        );
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        profiler.end();
        break;
      }

      case 'UNIT_MOVED': {
        profiler.begin('UNIT_MOVED');
        EventBus.emit('UNIT_MOVED', { from: event.from, to: event.to });
        profiler.end();
        break;
      }

      case 'CARD_DRAWN': {
        profiler.begin('CARD_DRAWN');
        if (event.player === (localPlayerIndex as Player)) {
          // At the hand limit the drawn card is burned (goes to discard) — nothing to show.
          if (engine.getState().players[event.player]?.hand[event.handIndex] !== event.cardId) { profiler.end(); break; }
          const card = toCardRenderData(event.cardId, event.cardId, event.player, localPlayerIndex);
          EventBus.emit('CARD_DRAWN', { card, handIndex: event.handIndex, deckRemaining: event.deckRemaining });
        } else {
          EventBus.emit('OPPONENT_CARD_DRAWN', { handIndex: event.handIndex });
        }
        profiler.end();
        break;
      }

      case 'CARD_PLAYED': {
        profiler.begin('CARD_PLAYED');
        EventBus.emit('CARD_PLAYED', {
          handIndex: event.handIndex, player: event.player,
          isLocal: event.player === (localPlayerIndex as Player),
        });
        profiler.end();
        break;
      }

      case 'CARD_DISCARDED': {
        profiler.begin('CARD_DISCARDED');
        EventBus.emit('CARD_DISCARDED', {
          handIndex: event.handIndex, player: event.player,
          isLocal: event.player === (localPlayerIndex as Player),
        });
        profiler.end();
        break;
      }

      case 'UNIT_ATTACKED': {
        profiler.begin('UNIT_ATTACKED');
        EventBus.emit('UNIT_ATTACKED', event);
        EventBus.emit('UNIT_STATS_CHANGED', {
          instanceId: event.targetInstanceId,
          atk: undefined,
          currentHP: event.targetNewHP,
          maxHP: event.maxHP,
          canAct: false,
        });
        profiler.end();
        break;
      }

      case 'UNIT_DIED': {
        profiler.begin('UNIT_DIED');
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.instanceId });
        profiler.end();
        break;
      }

      case 'UNIT_HEALED': {
        profiler.begin('UNIT_HEALED');
        EventBus.emit('UNIT_HEALED', event);
        emitStatsChanged(engine, event.instanceId);
        profiler.end();
        break;
      }

      case 'UNIT_EXHAUSTED': {
        profiler.begin('UNIT_EXHAUSTED');
        EventBus.emit('UNIT_EXHAUSTED', { col: event.col, row: event.row });
        profiler.end();
        break;
      }

      case 'UNIT_REFRESHED': {
        profiler.begin('UNIT_REFRESHED');
        EventBus.emit('UNIT_REFRESHED', { col: event.col, row: event.row });
        profiler.end();
        break;
      }

      case 'UNIT_TRANSFORMED': {
        profiler.begin('UNIT_TRANSFORMED');
        const data = toCardRenderData(
          event.toCardId, event.newInstanceId, event.owner, localPlayerIndex, event.newHP,
        );
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.oldInstanceId });
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        profiler.end();
        break;
      }

      case 'UNIT_CAPTURED': {
        // Re-render with the new owner (same pattern as UNIT_TRANSFORMED)
        profiler.begin('UNIT_CAPTURED');
        const st = engine.getState();
        const u = st.board.find((c: any) => c.unit?.instanceId === event.instanceId)?.unit;
        const data = toCardRenderData(event.cardId, event.instanceId, event.to, localPlayerIndex,
          u?.currentDef, u?.currentAtk, u ? unitCanAct(u, st.turn?.activePlayer) : false);
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.instanceId });
        EventBus.emit('UNIT_PLACED', { data, col: event.col, row: event.row });
        profiler.end();
        break;
      }

      case 'UNIT_BANISHED': {
        profiler.begin('UNIT_BANISHED');
        EventBus.emit('UNIT_DIED', { col: event.col, row: event.row, instanceId: event.instanceId });
        profiler.end();
        break;
      }

      case 'CARD_RETURNED': {
        // A spell went back to hand (refund) — same UI path as a draw.
        profiler.begin('CARD_RETURNED');
        if (event.player === (localPlayerIndex as Player)) {
          const card = toCardRenderData(event.cardId, event.cardId, event.player, localPlayerIndex);
          EventBus.emit('CARD_DRAWN', { card, handIndex: event.handIndex, deckRemaining: engine.getState().players[event.player]?.deckCount ?? 0 });
          EventBus.emit(EV.UI_TOAST, { message: event.reason === 'NO_TARGET'
            ? `${getCard(event.cardId).name} has no valid target — not played`
            : `${getCard(event.cardId).name} cancelled — card and ${event.refundedLEG} LEG returned` });
        } else {
          EventBus.emit('OPPONENT_CARD_DRAWN', { handIndex: event.handIndex });
        }
        profiler.end();
        break;
      }

      case 'LEG_GAINED':
      case 'LEG_SPENT':
      case 'LEG_RATE_CHANGED': {
        profiler.begin(event.type);
        EventBus.emit(event.type, event);
        profiler.end();
        break;
      }

      case 'PHASE_CHANGED': {
        profiler.begin('PHASE_CHANGED');
        EventBus.emit(event.type, event);
        profiler.end();
        break;
      }

      case 'TURN_STARTED': {
        profiler.begin('TURN_STARTED');
        EventBus.emit(event.type, event);
        later(() => refreshCanActIndicators(engine), 300);
        profiler.end();
        break;
      }

      case 'PENDING_TARGET':
      case 'PENDING_POSITION':
      case 'PENDING_COLUMN':
      case 'PENDING_DISCARD': {
        profiler.begin(event.type);
        const pendState = engine.getState();
        if (pendState.turn?.activePlayer === localPlayerIndex) {
          EventBus.emit(event.type, event);
        }
        profiler.end();
        break;
      }

      case 'AURA_APPLIED': {
        profiler.begin('AURA_APPLIED');
        EventBus.emit('AURA_APPLIED', event);
        // State-driven rendering: sync ALL unit stats from engine truth.
        // This covers both aura applications AND removals (where delta=0
        // would otherwise be silently dropped from the changes array).
        emitAllUnitStats(engine, profiler);
        profiler.end();
        break;
      }

      case 'INTERACTION_RESOLVED': {
        profiler.begin('INTERACTION_RESOLVED');
        EventBus.emit('INTERACTION_RESOLVED', event);
        profiler.end();
        break;
      }

      case 'GAME_OVER': {
        profiler.begin('GAME_OVER');
        // Kings never get a UNIT_DIED (the game ends instead) — play their fall now so the
        // board doesn't keep showing a 0-HP King under the result.
        for (const cell of engine.getState().board) {
          const u = cell.unit;
          if (u?.cardId === 'king' && u.currentDef <= 0) {
            EventBus.emit('UNIT_DIED', { col: cell.col, row: cell.row, instanceId: u.instanceId });
          }
        }
        EventBus.emit('GAME_OVER', event);
        profiler.end();
        break;
      }

      default: {
        profiler.begin(event.type);
        EventBus.emit(event.type, event);
        profiler.end();
        break;
      }
    }
  };
  engine.on(handler);
  return () => {
    engine.off(handler);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    _activeProfiler = null;
  };
}
