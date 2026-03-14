// ============================================================
// EngineEventBridge.ts
// Bridges GameEngine events → typed EventBus events.
// Converts raw engine events into UI-adapted payloads.
// ============================================================

import { EventBus } from '../../events/EventBus';
import { getCard } from '../../game/data/CardRegistry';
import type { CardRenderData } from '../../game/types/UITypes';
import { Player } from '../../game/types/GameTypes';

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
    abilityText: def.abilities?.map(a => a.type).join(', '),
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
 */
function emitAllUnitStats(engine: any): void {
  const state = engine.getState();
  for (const cell of state.board) {
    if (!cell.unit) continue;
    const u = cell.unit;
    EventBus.emit('UNIT_STATS_CHANGED', {
      instanceId: u.instanceId,
      atk: u.currentAtk,
      currentHP: u.currentDef,
      maxHP: u.maxDef,
      canAct: unitCanAct(u, state.turn?.activePlayer),
    });
  }
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

export function wireEngineToEventBus(engine: any, localPlayerIndex: number): () => void {
  const handler = (event: any) => {
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

      case 'UNIT_ATTACKED': {
        EventBus.emit('UNIT_ATTACKED', event);
        EventBus.emit('UNIT_STATS_CHANGED', {
          instanceId: event.targetInstanceId,
          atk: undefined,
          currentHP: event.targetNewHP,
          maxHP: event.maxHP,
          canAct: false,
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
        const pendState = engine.getState();
        if (pendState.turn?.activePlayer === localPlayerIndex) {
          EventBus.emit(event.type, event);
        }
        break;
      }

      case 'AURA_APPLIED': {
        EventBus.emit('AURA_APPLIED', event);
        // State-driven rendering: sync ALL unit stats from engine truth.
        // This covers both aura applications AND removals (where delta=0
        // would otherwise be silently dropped from the changes array).
        emitAllUnitStats(engine);
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
  };
  engine.on(handler);
  return () => engine.off(handler);
}
