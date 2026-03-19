// ============================================================
// HUDRefreshCoordinator.ts
// Keeps the HUD in sync with engine state via EventBus.
// ============================================================

import { EventBus, EV } from '../../events/EventBus';
import type { GameEngine } from '../../game/GameEngine';
import GameState from '../../GameState';

export function setupHUDRefresh(
  engine: GameEngine,
  localPlayerIndex: number,
  playerName: string,
  opponentName: string,
): Array<() => void> {
  const oppIdx = localPlayerIndex === 0 ? 1 : 0;

  // Debounce: coalesce multiple events in the same frame into one refresh
  let refreshPending = false;

  const doRefresh = () => {
    refreshPending = false;
    const state = engine.getState();
    if (!state) return;

    const getKingHP = (owner: number) => {
      const cell = state.board.find((c) => c.unit?.cardId === 'king' && c.unit?.owner === owner);
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

  const scheduleRefresh = () => {
    if (!refreshPending) {
      refreshPending = true;
      requestAnimationFrame(doRefresh);
    }
  };

  const unsubs: Array<() => void> = [];
  unsubs.push(EventBus.on(EV.LEG_GAINED,          scheduleRefresh));
  unsubs.push(EventBus.on(EV.LEG_SPENT,           scheduleRefresh));
  unsubs.push(EventBus.on('LEG_RATE_CHANGED',     scheduleRefresh));
  unsubs.push(EventBus.on(EV.UNIT_ATTACKED,       scheduleRefresh));
  unsubs.push(EventBus.on(EV.UNIT_HEALED,         scheduleRefresh));
  unsubs.push(EventBus.on('PHASE_CHANGED',        scheduleRefresh));
  unsubs.push(EventBus.on('TURN_STARTED',         scheduleRefresh));
  unsubs.push(EventBus.on(EV.CARD_PLAYED,         scheduleRefresh));
  unsubs.push(EventBus.on('OPPONENT_CARD_DRAWN',  scheduleRefresh));

  return unsubs;
}
