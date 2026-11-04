// ============================================================
// HUDRefreshCoordinator.ts
// Keeps the HUD in sync with engine state via EventBus.
// ============================================================

import { EventBus, EV } from '../../events/EventBus';
import type { GameEngine } from '../../game/GameEngine';
import GameState from '../../GameState';
import type { Player } from '../../game/types/GameTypes';
import type { CardRenderData } from '../../game/types/UITypes';
import { toCardRenderData } from './EngineEventBridge';

export interface HandView {
  cardIds(): string[];
  setHand(cards: CardRenderData[]): void;
}

/**
 * State-driven safety net for the hand (§3.6): incremental draw/discard events can't describe
 * a burned draw at the hand limit or an overflow trim (handIndex -1). If the rendered hand
 * differs from the engine's, rebuild it. Returns true if it had to.
 */
export function reconcileHand(engine: GameEngine, localPlayerIndex: number, hand: HandView): boolean {
  const ids = engine.getState().players[localPlayerIndex]?.hand ?? [];
  const shown = hand.cardIds();
  if (shown.length === ids.length && shown.every((id, i) => id === ids[i])) return false;
  const me = localPlayerIndex as Player;
  hand.setHand(ids.map(id => toCardRenderData(id, id, me, localPlayerIndex)));
  return true;
}

export function setupHUDRefresh(
  engine: GameEngine,
  localPlayerIndex: number,
  playerName: string,
  opponentName: string,
  hand?: HandView,
): Array<() => void> {
  const oppIdx = localPlayerIndex === 0 ? 1 : 0;

  // Debounce: coalesce multiple events in the same frame into one refresh
  let refreshPending = false;
  let rafId: number | null = null;

  const doRefresh = () => {
    refreshPending = false;
    rafId = null;
    const state = engine.getState();
    if (!state) return;
    if (hand) reconcileHand(engine, localPlayerIndex, hand);

    const getKingHP = (owner: number) => {
      const cell = state.board.find((c) => c.unit?.cardId === 'king' && c.unit?.owner === owner);
      // No King on the board = it fell (an Assassin's killing leap takes its square)
      return { current: cell?.unit?.currentDef ?? 0, max: cell?.unit?.maxDef ?? 10 };
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

  const scheduleRefresh = () => {
    if (!refreshPending) {
      refreshPending = true;
      rafId = requestAnimationFrame(doRefresh);
    }
  };

  const unsubs: Array<() => void> = [];
  // A frame scheduled just before teardown must not refresh a shut-down scene.
  unsubs.push(() => { if (rafId !== null) cancelAnimationFrame(rafId); rafId = null; refreshPending = false; });
  unsubs.push(EventBus.on(EV.LEG_GAINED,          scheduleRefresh));
  unsubs.push(EventBus.on(EV.LEG_SPENT,           scheduleRefresh));
  unsubs.push(EventBus.on('LEG_RATE_CHANGED',     scheduleRefresh));
  unsubs.push(EventBus.on(EV.UNIT_ATTACKED,       scheduleRefresh));
  unsubs.push(EventBus.on(EV.UNIT_HEALED,         scheduleRefresh));
  unsubs.push(EventBus.on('PHASE_CHANGED',        scheduleRefresh));
  unsubs.push(EventBus.on('TURN_STARTED',         scheduleRefresh));
  unsubs.push(EventBus.on(EV.CARD_PLAYED,         scheduleRefresh));
  unsubs.push(EventBus.on('OPPONENT_CARD_DRAWN',  scheduleRefresh));
  unsubs.push(EventBus.on(EV.CARD_DRAWN,          scheduleRefresh));
  unsubs.push(EventBus.on(EV.CARD_DISCARDED,      scheduleRefresh));

  return unsubs;
}
